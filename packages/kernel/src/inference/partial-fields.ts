import {
  confidenceFromLogprobs,
  type ConfidentJsonField,
  type TokenLogprob,
} from "../confidence.js";

export interface JsonLeafSpan {
  path: string;
  start: number;
  end: number;
}

function escapePointerSegment(segment: string): string {
  return segment.replaceAll("~", "~0").replaceAll("/", "~1");
}

function skipWhitespace(json: string, position: number): number {
  let next = position;
  while (next < json.length && /\s/.test(json[next]!)) {
    next += 1;
  }
  return next;
}

function stringEnd(json: string, start: number): number {
  let position = start + 1;
  while (position < json.length) {
    if (json[position] === "\\") {
      position += 2;
    } else if (json[position] === '"') {
      return position + 1;
    } else {
      position += 1;
    }
  }
  throw new Error("unterminated string");
}

function leafEnd(json: string, start: number): number {
  let position = start;
  while (position < json.length && !/[\s,\]}]/.test(json[position]!)) {
    position += 1;
  }
  return position;
}

function isCompleteLiteral(slice: string): boolean {
  try {
    JSON.parse(slice);
    return true;
  } catch {
    return false;
  }
}

/** End index of a complete JSON value, or null if the value is still incomplete. */
function tryCompleteValueEnd(json: string, start: number): number | null {
  const character = json[start];
  if (character === undefined) return null;

  if (character === '"') {
    try {
      return stringEnd(json, start);
    } catch {
      return null;
    }
  }

  if (character === "{" || character === "[") {
    try {
      return parseCompositeEnd(json, start);
    } catch {
      return null;
    }
  }

  const end = leafEnd(json, start);
  if (end === start) return null;
  const slice = json.slice(start, end);
  if (end === json.length) {
    if (/[eE.]$/.test(slice)) return null;
    if (["t", "tr", "tru", "f", "fa", "fal", "fals", "n", "nu", "nul"].includes(slice)) {
      return null;
    }
  }
  return isCompleteLiteral(slice) ? end : null;
}

function parseCompositeEnd(json: string, start: number): number {
  const opening = json[start];
  const closing = opening === "{" ? "}" : "]";
  let cursor = skipWhitespace(json, start + 1);
  if (json[cursor] === closing) return cursor + 1;

  while (cursor < json.length) {
    if (opening === "{") {
      if (json[cursor] !== '"') throw new Error("expected key");
      cursor = stringEnd(json, cursor);
      cursor = skipWhitespace(json, cursor);
      if (json[cursor] !== ":") throw new Error("expected colon");
      cursor = skipWhitespace(json, cursor + 1);
    }
    const valueEnd = tryCompleteValueEnd(json, cursor);
    if (valueEnd === null) throw new Error("incomplete value");
    cursor = skipWhitespace(json, valueEnd);
    if (json[cursor] === closing) return cursor + 1;
    if (json[cursor] !== ",") throw new Error("expected separator");
    cursor = skipWhitespace(json, cursor + 1);
  }
  throw new Error("incomplete composite");
}

function collectLeavesFromCompleteFragment(
  fragment: string,
  basePath: string,
  absoluteBase: number,
): JsonLeafSpan[] {
  const leaves: JsonLeafSpan[] = [];

  const walkValue = (start: number, path: string): number => {
    const position = skipWhitespace(fragment, start);
    const character = fragment[position];
    if (character === "{") {
      let cursor = skipWhitespace(fragment, position + 1);
      if (fragment[cursor] === "}") return cursor + 1;
      while (true) {
        const keyEnd = stringEnd(fragment, cursor);
        const key = JSON.parse(fragment.slice(cursor, keyEnd)) as string;
        cursor = skipWhitespace(fragment, keyEnd);
        cursor = skipWhitespace(fragment, cursor + 1);
        cursor = walkValue(cursor, `${path}/${escapePointerSegment(key)}`);
        cursor = skipWhitespace(fragment, cursor);
        if (fragment[cursor] === "}") return cursor + 1;
        cursor = skipWhitespace(fragment, cursor + 1);
      }
    }
    if (character === "[") {
      let cursor = skipWhitespace(fragment, position + 1);
      let index = 0;
      if (fragment[cursor] === "]") return cursor + 1;
      while (true) {
        cursor = walkValue(cursor, `${path}/${index}`);
        index += 1;
        cursor = skipWhitespace(fragment, cursor);
        if (fragment[cursor] === "]") return cursor + 1;
        cursor = skipWhitespace(fragment, cursor + 1);
      }
    }
    const end = character === '"' ? stringEnd(fragment, position) : leafEnd(fragment, position);
    leaves.push({
      path,
      start: absoluteBase + position,
      end: absoluteBase + end,
    });
    return end;
  };

  walkValue(0, basePath);
  return leaves;
}

/**
 * Collects leaf value spans from a (possibly incomplete) JSON object prefix.
 * Stops at the first incomplete field without throwing.
 */
export function collectCompletedLeaves(partialJson: string): JsonLeafSpan[] {
  const leaves: JsonLeafSpan[] = [];
  let cursor = skipWhitespace(partialJson, 0);
  if (partialJson[cursor] !== "{") return leaves;
  cursor = skipWhitespace(partialJson, cursor + 1);
  if (partialJson[cursor] === "}") return leaves;

  while (cursor < partialJson.length) {
    if (partialJson[cursor] !== '"') return leaves;
    let keyEnd: number;
    try {
      keyEnd = stringEnd(partialJson, cursor);
    } catch {
      return leaves;
    }
    let key: string;
    try {
      key = JSON.parse(partialJson.slice(cursor, keyEnd)) as string;
    } catch {
      return leaves;
    }
    cursor = skipWhitespace(partialJson, keyEnd);
    if (partialJson[cursor] !== ":") return leaves;
    cursor = skipWhitespace(partialJson, cursor + 1);

    const valueStart = cursor;
    const valueEnd = tryCompleteValueEnd(partialJson, valueStart);
    if (valueEnd === null) return leaves;

    const path = `/${escapePointerSegment(key)}`;
    const head = partialJson[valueStart];
    if (head === "{" || head === "[") {
      leaves.push(
        ...collectLeavesFromCompleteFragment(
          partialJson.slice(valueStart, valueEnd),
          path,
          valueStart,
        ),
      );
    } else {
      leaves.push({ path, start: valueStart, end: valueEnd });
    }

    cursor = skipWhitespace(partialJson, valueEnd);
    if (partialJson[cursor] === "}") return leaves;
    if (partialJson[cursor] !== ",") return leaves;
    cursor = skipWhitespace(partialJson, cursor + 1);
  }
  return leaves;
}

/**
 * Maps token logprobs onto leaves that have already closed in a partial JSON prefix.
 */
export function assignCompletedFieldConfidences(
  tokenLogprobs: readonly TokenLogprob[],
  partialJson: string,
): ConfidentJsonField[] {
  const joined = tokenLogprobs.map(({ token }) => token).join("");
  if (joined !== partialJson) {
    throw new Error("Token text does not concatenate to the partial JSON");
  }

  const leaves = collectCompletedLeaves(partialJson);
  const tokenSpans = tokenLogprobs.reduce<Array<TokenLogprob & { start: number; end: number }>>(
    (spans, token) => {
      const start = spans.length === 0 ? 0 : spans[spans.length - 1]!.end;
      spans.push({ ...token, start, end: start + token.token.length });
      return spans;
    },
    [],
  );

  return leaves.map((leaf) => {
    const logprobs = tokenSpans
      .filter((token) => token.start < leaf.end && token.end > leaf.start)
      .map((token) => token.logprob);
    if (logprobs.length === 0) {
      throw new Error(`No generated token spans mapped to JSON leaf ${leaf.path}`);
    }
    return {
      path: leaf.path,
      value: JSON.parse(partialJson.slice(leaf.start, leaf.end)) as unknown,
      confidence: confidenceFromLogprobs(logprobs),
    };
  });
}
