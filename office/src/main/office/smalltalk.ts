/**
 * Telling a social line apart from a piece of work.
 *
 * The office hands every goal to a manager whose standing orders are to break it
 * into assigned steps. Given "좋은 아침" that manager has nothing to break up, so
 * it explains at length why a greeting cannot be decomposed - which is not
 * something a colleague would ever say back to someone saying good morning.
 *
 * This is a pattern match and not a model call on purpose. `say` runs before the
 * first token is asked for, so triage cannot wait on a cold llama-server, and a
 * greeting still has to be answered on a machine where inference is unavailable.
 */

export type SmalltalkKind = "greeting" | "thanks" | "farewell";

/**
 * The longest a line can be and still be only social.
 *
 * "안녕하세요, NDA 검토 부탁해요" opens with a greeting but is a request, and
 * answering it with a greeting would drop the actual ask on the floor. Length is
 * a blunt guard, but erring toward treating a line as work is the safe direction:
 * work that gets greeted is a bug the reader cannot route around, while a
 * greeting that gets worked is the behaviour they already have.
 */
const MAX_SOCIAL_LENGTH = 24;

const PATTERNS: ReadonlyArray<{ kind: SmalltalkKind; match: RegExp }> = [
  {
    kind: "greeting",
    match:
      /^(안녕|안뇽|안녕하세요|안녕하십니까|안녕하셨어요|하이|하잉|좋은\s*아침|굿모닝|반가워요?|반갑습니다|처음\s*뵙겠습니다|hi|hii+|hey+|hello+|helo|yo|sup|howdy|greetings|good\s*(morning|afternoon|evening|day)|morning|afternoon|evening)$/,
  },
  {
    kind: "thanks",
    match:
      /^(감사|감사해요|감사합니다|감사드려요|고마워|고마워요|고맙습니다|땡큐|thanks?|thank\s*you|thx|tks|ty|appreciate\s*it|much\s*appreciated|nice|nice\s*work|good\s*job|well\s*done|잘했어|잘했어요|수고했어요|수고하셨습니다|수고하셨어요)$/,
  },
  {
    kind: "farewell",
    match:
      /^(안녕히|안녕히\s*계세요|안녕히\s*가세요|잘\s*있어요?|이만|먼저\s*갈게요|퇴근할게요|퇴근합니다|바이|빠이|굿나잇|좋은\s*밤|수고|수고요|bye+|goodbye|see\s*you|see\s*ya|later|cya|good\s*night|night|gn)$/,
  },
];

/**
 * Strip what decoration a greeting carries so the words can be compared.
 *
 * Punctuation and emoji are how warmth is written, not part of the word: "안녕!!"
 * and "안녕 :)" are the same greeting as "안녕". A Korean IME stretches a line
 * with a fullwidth tilde ("좋은 아침～") or a wave dash ("좋은 아침〜") as readily
 * as an ASCII one, so decoration is matched by Unicode class - every
 * punctuation mark and symbol - rather than by a hand-listed set that only ever
 * knew about the keys on a US keyboard. Trailing 요/용 stretching and the ㅋㅎ of
 * laughter are the same idea.
 */
function normalize(text: string): string {
  return text
    .normalize("NFC")
    .toLowerCase()
    .replace(/[\p{Extended_Pictographic}\p{Emoji_Presentation}]/gu, "")
    .replace(/[\p{P}\p{S}\sㅋㅎ]+$/gu, "")
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** The social intent of a line, or null when it is asking for work. */
export function classifySmalltalk(text: string): SmalltalkKind | null {
  const line = normalize(text);
  if (!line || line.length > MAX_SOCIAL_LENGTH) return null;
  for (const { kind, match } of PATTERNS) {
    if (match.test(line)) return kind;
  }
  return null;
}
