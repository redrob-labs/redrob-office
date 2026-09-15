export interface GeneralChatEvidence {
  bulletCount: number;
  mentionsIdempotency: boolean;
  hasPutRetryExample: boolean;
}

/**
 * A normal chat should answer directly and follow a small formatting request.
 * It must not need a browser, files, or an app to explain a backend concept.
 */
export function scoreGeneralChat(reply: string): GeneralChatEvidence {
  const bulletCount = (reply.match(/(?:^|\s)[*-]\s+/g) ?? []).length;
  return {
    bulletCount,
    mentionsIdempotency: /idempoten/i.test(reply),
    hasPutRetryExample: /\bPUT\b/i.test(reply) && /retr(?:y|ies|ied)/i.test(reply),
  };
}

export const EASY_FILE_CONTENT = [
  "MODEL TOOL CHECK",
  "17 + 25 = 42",
  "9 * 8 = 72",
  "Status: complete",
].join("\n");

/** Ignore only the final newline editors conventionally add. */
export function easyFileMatches(content: string): boolean {
  return content.replace(/\r\n/g, "\n").replace(/\n$/, "") === EASY_FILE_CONTENT;
}
