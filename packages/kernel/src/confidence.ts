export interface FieldConfidence {
  meanLogprob: number;
  minLogprob: number;
  score: number;
  tokenCount: number;
}

export interface TokenLogprob {
  token: string;
  logprob: number;
}

export interface ConfidentJsonField {
  path: string;
  value: unknown;
  confidence: FieldConfidence;
}

export interface ReviewableField {
  path: string;
  confidence: FieldConfidence;
}

export interface ReviewPartition<T> {
  accepted: T[];
  needsReview: T[];
}

export function confidenceFromLogprobs(logprobs: readonly number[]): FieldConfidence {
  if (logprobs.length === 0) {
    throw new Error("confidenceFromLogprobs requires at least one token logprob");
  }

  let sum = 0;
  let min = logprobs[0]!;
  for (const logprob of logprobs) {
    sum += logprob;
    min = Math.min(min, logprob);
  }

  return {
    meanLogprob: sum / logprobs.length,
    minLogprob: min,
    score: Math.exp(min),
    tokenCount: logprobs.length,
  };
}

interface JsonLeaf {
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
  throw new Error("Completed JSON contains an unterminated string");
}

function leafEnd(json: string, start: number): number {
  let position = start;
  while (position < json.length && !/[\s,\]}]/.test(json[position]!)) {
    position += 1;
  }
  return position;
}

function collectLeaves(json: string): JsonLeaf[] {
  const leaves: JsonLeaf[] = [];

  const parseValue = (initialPosition: number, path: string): number => {
    const position = skipWhitespace(json, initialPosition);
    const character = json[position];
    if (character === "{") {
      let cursor = skipWhitespace(json, position + 1);
      if (json[cursor] === "}") {
        return cursor + 1;
      }
      while (true) {
        if (json[cursor] !== '"') {
          throw new Error(`Expected JSON object key at character ${cursor}`);
        }
        const keyEnd = stringEnd(json, cursor);
        const key = JSON.parse(json.slice(cursor, keyEnd)) as string;
        cursor = skipWhitespace(json, keyEnd);
        if (json[cursor] !== ":") {
          throw new Error(`Expected ':' after JSON key at character ${cursor}`);
        }
        cursor = parseValue(cursor + 1, `${path}/${escapePointerSegment(key)}`);
        cursor = skipWhitespace(json, cursor);
        if (json[cursor] === "}") {
          return cursor + 1;
        }
        if (json[cursor] !== ",") {
          throw new Error(`Expected ',' or '}' at character ${cursor}`);
        }
        cursor = skipWhitespace(json, cursor + 1);
      }
    }
    if (character === "[") {
      let cursor = skipWhitespace(json, position + 1);
      let index = 0;
      if (json[cursor] === "]") {
        return cursor + 1;
      }
      while (true) {
        cursor = parseValue(cursor, `${path}/${index}`);
        index += 1;
        cursor = skipWhitespace(json, cursor);
        if (json[cursor] === "]") {
          return cursor + 1;
        }
        if (json[cursor] !== ",") {
          throw new Error(`Expected ',' or ']' at character ${cursor}`);
        }
        cursor = skipWhitespace(json, cursor + 1);
      }
    }

    const end = character === '"' ? stringEnd(json, position) : leafEnd(json, position);
    if (end === position) {
      throw new Error(`Expected JSON value at character ${position}`);
    }
    leaves.push({ path, start: position, end });
    return end;
  };

  const end = skipWhitespace(json, parseValue(0, ""));
  if (end !== json.length) {
    throw new Error(`Unexpected JSON content at character ${end}`);
  }
  return leaves;
}

/**
 * Associates generated token spans with JSON leaf source ranges. Tokens must
 * concatenate to the completed JSON exactly; otherwise their positions are not
 * trustworthy and confidence is deliberately not fabricated.
 */
export function assignFieldConfidences(
  tokenLogprobs: readonly TokenLogprob[],
  completedJson: string,
): ConfidentJsonField[] {
  if (tokenLogprobs.map(({ token }) => token).join("") !== completedJson) {
    throw new Error("Token text does not concatenate to the completed JSON");
  }
  const parsed = JSON.parse(completedJson) as unknown;
  if (parsed === null || Array.isArray(parsed) || typeof parsed !== "object") {
    throw new Error("Completed JSON must have an object root");
  }

  const tokenSpans = tokenLogprobs.reduce<Array<TokenLogprob & { start: number; end: number }>>(
    (spans, token) => {
      const start = spans.length === 0 ? 0 : spans[spans.length - 1]!.end;
      spans.push({ ...token, start, end: start + token.token.length });
      return spans;
    },
    [],
  );

  return collectLeaves(completedJson).map((leaf) => {
    const logprobs = tokenSpans
      .filter((token) => token.start < leaf.end && token.end > leaf.start)
      .map((token) => token.logprob);
    if (logprobs.length === 0) {
      throw new Error(`No generated token spans mapped to JSON leaf ${leaf.path}`);
    }
    return {
      path: leaf.path,
      value: JSON.parse(completedJson.slice(leaf.start, leaf.end)) as unknown,
      confidence: confidenceFromLogprobs(logprobs),
    };
  });
}

export function partitionNeedsReview<T extends ReviewableField>(
  fields: readonly T[],
  threshold: number,
  perFieldThresholds: Readonly<Record<string, number>> = {},
): ReviewPartition<T> {
  const accepted: T[] = [];
  const needsReview: T[] = [];
  for (const field of fields) {
    const fieldThreshold = perFieldThresholds[field.path] ?? threshold;
    (field.confidence.score < fieldThreshold ? needsReview : accepted).push(field);
  }
  return { accepted, needsReview };
}
