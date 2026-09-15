/**
 * "크롬 열어서 확인해줘" is a look — not a click tour of the other monitor.
 * app.focus / input.* yank the pointer and foreground across displays; those
 * tools stay available when the person asked to type, click, or send.
 */

const INTERACT =
  /(?:클릭|눌러|입력|타이핑|작성|보내|전송|드래그|로그인|수정|삭제|선택해서|click|type|fill|submit|drag|press|login|edit|delete)/i;

const LOOK =
  /(?:확인|확인해|봐줘|봐\s*줘|보고|체크|check|look|see|읽어|열어\s*서\s*확인|캡처|일정\s*좀|캘린더)/i;

/** Tools that move focus or the pointer onto another display. */
export const FOCUS_STEALER_TOOLS = new Set([
  "app.focus",
  "input.move",
  "input.click",
  "input.type",
  "input.key",
  "input.scroll",
]);

export function isLookOnlyInstruction(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (INTERACT.test(t)) return false;
  return LOOK.test(t);
}

/**
 * Background mode: the person is working on this machine right now.
 *
 * Nothing here needs the foreground to *read* the screen, and a web page can
 * be driven end to end through `browser.*` without ever raising a window. What
 * cannot is native-app input, so the refusal names the alternative rather than
 * leaving the run to guess why its click failed.
 */
export function backgroundBlockedReason(tool: string): string | null {
  if (!FOCUS_STEALER_TOOLS.has(tool)) return null;
  return (
    `${tool} is blocked: background mode is on, so this run must not take the ` +
    "pointer or the foreground away from the person using this machine. " +
    "Work the page with browser.open / browser.click / browser.type (they need no focus) " +
    "and read the screen with screen.capture. If the job truly cannot be done without " +
    "the foreground, say so and ask them to turn background mode off in Settings."
  );
}

export function focusStealerBlockedReason(
  tool: string,
  instruction: string,
): string | null {
  if (!FOCUS_STEALER_TOOLS.has(tool)) return null;
  if (!isLookOnlyInstruction(instruction)) return null;
  return (
    `${tool} is blocked for this ask: you were only asked to look. ` +
    "Use screen.capture (every display if needed) and answer from the pictures. " +
    "Do not focus windows or move the mouse — that steals focus onto the other monitor."
  );
}
