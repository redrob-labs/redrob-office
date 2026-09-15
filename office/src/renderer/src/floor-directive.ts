import type { FloorDirectiveKind } from "../../shared/office-api";

export interface ParsedDirective {
  kind: FloorDirectiveKind;
  body: string;
  traceId?: string;
}

const COMMANDS: Record<string, FloorDirectiveKind> = {
  "/steer": "STEER",
  "/abort": "ABORT",
  "/pin": "PIN",
};

/**
 * Directives are typed in the chat box, so the chat box has to recognise them
 * before the text reaches the model. Anything else is an ordinary message.
 */
export function parseDirective(input: string): ParsedDirective | null {
  const text = input.trim();
  if (!text.startsWith("/")) return null;
  const space = text.search(/\s/);
  const head = (space === -1 ? text : text.slice(0, space)).toLowerCase();
  const kind = COMMANDS[head];
  if (!kind) return null;
  const rest = space === -1 ? "" : text.slice(space + 1).trim();

  if (kind === "ABORT") {
    const [traceId, ...reason] = rest.split(/\s+/).filter(Boolean);
    if (!traceId) return null;
    return { kind, traceId, body: reason.join(" ") || "Stopped from the chat box" };
  }

  // STEER may name a trace first: `/steer trace-abc keep the tone plain`.
  if (kind === "STEER") {
    const match = /^(trace-[\w-]+)\s+(.+)$/s.exec(rest);
    if (match?.[1] && match[2]) {
      return { kind, traceId: match[1], body: match[2].trim() };
    }
  }
  if (!rest) return null;
  return { kind, body: rest };
}
