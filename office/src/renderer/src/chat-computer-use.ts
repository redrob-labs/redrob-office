/**
 * When chat should take the computer-use path without the toggle.
 * Opening Chrome / Calendar and reading the screen is not a web_search job.
 * Messaging integrations stay in chat and use configured MCP tools.
 */

const OPEN_BROWSER =
  /(?:크롬|chrome|엣지|edge|브라우저|browser)\s*(?:을?\s*)?(?:열|열어|실행|켜)|(?:열어서|열고)\s*(?:크롬|chrome|브라우저|browser)|open\s+(?:up\s+)?(?:chrome|edge|the\s+browser)/i;

const WEB_APP =
  /(?:구글\s*)?캘린더|google\s*calendar|gmail|노션|notion|(?:구글\s*)?드라이브|google\s*drive/i;

const DESKTOP_ACT =
  /(?:화면|스크린|screen).*(?:보|확인|캡처|찍어)|(?:클릭|타이핑|입력).*(?:해|해서)|computer\s*use|데스크톱|데스크탑/i;

export function looksLikeComputerUse(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (OPEN_BROWSER.test(t)) return true;
  if (DESKTOP_ACT.test(t)) return true;
  if (WEB_APP.test(t) && /(?:열|확인|봐|체크|check|open|look|가\s*서|간\s*다음)/i.test(t)) {
    return true;
  }
  return false;
}

/** A desktop request that stopped to ask the person something. */
export interface PendingDesktopAsk {
  /** The request that stalled, so the answer can be folded back into it. */
  instruction: string;
  /** What was asked, so the answer reads as an answer. */
  question: string;
}

const QUESTION_TAIL =
  /[?？]\s*$|(?:알려\s*(?:주세요|주시겠어요|줘)|말씀해\s*주세요|누구(?:인가요|세요|야|죠)?|어느\s*분)\s*[.!]?\s*$/;

/**
 * Backing out, and nothing else. Anchored at both ends on purpose: "아니 석승현
 * 말고 김철수" opens with a refusal but is still the answer.
 */
const CANCEL =
  /^(?:아니(?:요|야)?\s*|아냐\s*)?(?:됐(?:어|다|어요|습니다)|괜찮(?:아|아요)|취소(?:해|할래|해줘)?|그만(?:해|할래)?|하지\s*마(?:라|세요)?|아니(?:요|야)?|아냐|no|nope|nevermind|never\s+mind|cancel|stop|forget\s+it)\s*[.!]?$/i;

/** Asking about a person, so the answer is a name rather than a new topic. */
const ASKS_WHO =
  /누구|누가|이름|어느\s*분|받는\s*사람|수신|\bwho\b|\bname\b|recipient/i;

/**
 * The reply ended by asking rather than by doing.
 *
 * Options are proof on their own: nothing offers a list of people to pick from
 * except a question.
 */
export function asksForClarification(
  text: string,
  options?: readonly string[],
): boolean {
  if (options && options.length > 0) return true;
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  return QUESTION_TAIL.test(t);
}

/**
 * Whether this turn answers the question the desktop task stopped on.
 *
 * A bare "석승현 부대표님" carries no verb, no app and no send word, so no
 * keyword rule will ever catch it. What makes it desktop work is the question
 * still standing above it.
 */
export function answersPendingAsk(input: {
  latest: string;
  pending: PendingDesktopAsk | null;
}): boolean {
  if (!input.pending) return false;
  const latest = input.latest.replace(/\s+/g, " ").trim();
  if (!latest) return false;
  if (CANCEL.test(latest)) return false;
  // A long reply is a new errand, not an answer to "who?".
  if (latest.length > 160) return false;
  return true;
}

/**
 * Fold the answer back into the request the model was already working on.
 *
 * The desktop task starts from one string, so the answer has to travel inside
 * it or the next run asks the same question again.
 */
export function mergePendingAsk(
  pending: PendingDesktopAsk,
  answer: string,
): string {
  const clean = answer.replace(/\s+/g, " ").trim();
  const lines = [pending.instruction.trim()];
  if (ASKS_WHO.test(pending.question)) lines.push(`받는 사람: ${clean}`);
  else lines.push(`추가 정보: ${clean}`);
  return lines.join("\n");
}

/** Desktop apps this app can actually drive, by the names people use. */
const APP_NAME =
  /카톡|카카오톡|kakao|크롬|chrome|엣지|edge|노션|notion|메모장|notepad|마우스패드|mousepad|익스플로러|탐색기|explorer|엑셀|excel|워드\b|word\b|파워포인트|powerpoint|아웃룩|outlook|텔레그램|telegram|줌\b|zoom\b/i;

/**
 * "I cannot control other applications" — untrue, and said anyway.
 *
 * Plain chat has only web search, so an app request that slips past the router
 * lands there and comes back as this. Treating the apology as a trigger closes
 * every hole in the router at once, including the ones not thought of yet.
 */
const CAPABILITY_APOLOGY =
  /(?:지원하지\s*않습니다|지원되지\s*않습니다|보낼\s*수\s*없|제어할\s*수\s*(?:있는\s*기능이\s*없|없)|기능이\s*없|직접\s*(?:보내|전송)(?:할\s*수\s*없|드릴\s*수\s*없)|복사해서\s*보내|직접\s*보내주(?:셔야|시면))|(?:i\s*(?:can(?:not|'t)|am\s+unable\s+to)\s*(?:directly\s*)?(?:send|control|open|access|interact)|do\s+not\s+have\s+the\s+ability|copy\s+(?:and\s+)?paste\s+it)/i;

/**
 * The reply refused an app request the machine can in fact carry out.
 *
 * Both halves matter: a refusal about something else is not this, and an app
 * name in a normal answer is not this either.
 */
export function apologisedForDesktop(input: {
  ask: string;
  reply: string;
}): boolean {
  if (!APP_NAME.test(input.ask)) return false;
  return CAPABILITY_APOLOGY.test(input.reply);
}

/**
 * "올렸습니다" from a turn that never touched the app.
 *
 * Plain chat can search the web and nothing else, so a reply that says the
 * message is in Slack is not mistaken, it is impossible. Rerouting is both the
 * honest answer and the one the person wanted: do the thing, then say so.
 */
const DID_IT =
  /(?:보냈|전송(?:했|됐|되었|완료)|올렸|게시했|공유(?:했|드렸)|전달했|발송했|남겼)|(?:i\s*(?:have\s+)?(?:sent|posted|shared)|has\s+been\s+(?:sent|posted)|successfully\s+(?:sent|posted))/i;

export function claimedDesktopWork(input: {
  ask: string;
  reply: string;
}): boolean {
  if (!APP_NAME.test(input.ask)) return false;
  const reply = input.reply.replace(/\s+/g, " ").trim();
  if (!reply) return false;
  return DID_IT.test(reply);
}

/**
 * "정리해 드리겠습니다. 잠시만 기다려 주십시오."
 *
 * There is no later. The turn ends with that sentence and nothing is running
 * behind it, so a promise from plain chat is a lie by a different route than a
 * false claim - and it is the one the model reaches for when the router missed
 * an app request. Catching the promise catches the vocabulary nobody thought
 * to add to the router.
 */
const WILL_DO =
  /(?:하|드리|해\s*드리|정리해|보내|올려|작성해|처리해)\s*(?:겠습니다|겠어요|ㄹ게요|을게요|드릴게요)|잠시만\s*(?:기다|만)|기다려\s*주(?:십시오|세요|시면)|곧\s*(?:보내|올리|정리|알려)|(?:i(?:'ll| will)\s+|let me\s+|going to\s+)(?:now\s+)?(?:send|post|write|share|summari[sz]e|put|do)|one\s+moment|please\s+wait/i;

export function promisedDesktopWork(input: {
  ask: string;
  reply: string;
}): boolean {
  if (!APP_NAME.test(input.ask)) return false;
  const reply = input.reply.replace(/\s+/g, " ").trim();
  if (!reply) return false;
  return WILL_DO.test(reply);
}

/**
 * A turn where the assistant said it cannot drive an app.
 *
 * These must not travel into a desktop run. The model reads its own earlier
 * refusal as settled fact and refuses again, with the tools sitting right
 * there in its list.
 */
export function isCapabilityApology(text: string): boolean {
  return CAPABILITY_APOLOGY.test(text);
}

export function shouldAutoComputerUse(input: {
  latest: string;
  priorUserTexts?: string[];
}): boolean {
  if (looksLikeComputerUse(input.latest)) return true;
  const latest = input.latest.replace(/\s+/g, " ").trim();
  if (
    latest.length > 0 &&
    latest.length <= 48 &&
    /(?:확인|봐|열어|check|look|open)/i.test(latest)
  ) {
    const prior = (input.priorUserTexts ?? []).slice(-4).join(" ");
    if (looksLikeComputerUse(prior) || WEB_APP.test(prior)) return true;
  }
  return false;
}
