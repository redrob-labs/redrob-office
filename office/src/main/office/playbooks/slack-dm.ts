/**
 * Desktop Slack DM via computer-use — no Slack API.
 * Detect the ask, then hand the model a fixed click/type playbook.
 */

import {
  personNameVariants,
  pickPersonName,
  searchTermsFor,
} from "./person-name.js";

const SLACK = /(?:슬랙|slack)/i;
const SEND =
  /(?:보내|전송|메시지|메세지|디엠|dm\b|message|msg|tell|write\s+to)/i;
/**
 * Naming a person is naming a send: "슬랙으로 janghoon한테 뉴스 요약해줘" has
 * no send verb, and demanding one left the run without its playbook.
 */
const RECIPIENT =
  /[\p{L}\p{N}][\p{L}\p{N}.·\s-]{0,20}(?:한테|에게|께)|\bto\s+[A-Za-z][\w.-]{1,20}|받는\s*사람\s*[:：]/u;

/**
 * A channel is a recipient too.
 *
 * "redrob-labs 채널에 근황 정리해서 올려줘" names where the message goes as
 * plainly as 한테 does, and it never reached the desktop path because it does
 * not say the word Slack. A `#` settles it; otherwise the name has to be
 * slug-shaped, which is what a channel is called and what a Korean sentence
 * around it is not.
 */
const CHANNEL =
  /#([a-z0-9][a-z0-9._-]{1,60})|\b([a-z0-9]+(?:[._-][a-z0-9]+)+)\s*채널|\bchannel\s+#?([a-z0-9][a-z0-9._-]{1,60})/i;

/**
 * Putting something in a channel, in the words people use for it.
 *
 * Including the ones with no posting verb: "정리해놔" names the place and then
 * says leave it there, which is a post by every measure except vocabulary.
 */
const POST =
  /올려|올리|게시|공유|포스팅|남겨|적어|(?:해|해서)\s*(?:놔|둬|놓아|두)|정리해|작성해|post|share|write|put/i;

export type SlackDmParsed = {
  recipient?: string;
  channel?: string;
  body?: string;
};

export function isSlackDmAsk(text: string): boolean {
  const t = text.replace(/\s+/g, " ").trim();
  if (!t) return false;
  if (SLACK.test(t) && (SEND.test(t) || RECIPIENT.test(t))) return true;
  // The app and a place inside it, named together, is Slack work whatever the
  // verb turns out to be.
  if (SLACK.test(t) && CHANNEL.test(t)) return true;
  return CHANNEL.test(t) && (POST.test(t) || SEND.test(t));
}

/**
 * Light parse for Korean/English "Slack … to X … send Y".
 * Best-effort — the raw instruction always stays the source of truth.
 */
export function parseSlackDmAsk(text: string): SlackDmParsed {
  const t = text.replace(/\s+/g, " ").trim();
  const out: SlackDmParsed = {};
  if (!t) return out;

  const channel = CHANNEL.exec(t);
  if (channel) {
    const name = channel[1] ?? channel[2] ?? channel[3] ?? "";
    if (name) out.channel = name.toLowerCase();
  }

  const quoted =
    /[「『"']([^「『"']{1,500})[」』"']/.exec(t) ??
    /(?:메시지|메세지|message|msg)\s*(?:는|은|:)?\s*[「『"']([^「『"']+)[」』"']/i.exec(
      t,
    );
  if (quoted?.[1]) out.body = quoted[1].trim();

  // "받는 사람: 석승현 부대표님" — the answer to the question the last run
  // stopped on. It carries no 에게/한테, so it has to be read as a label.
  const answered =
    /(?:받는\s*사람|수신자|수신|보낼\s*사람|recipient|send\s+to)\s*[:：]\s*([^,;]{2,40})/i.exec(
      t,
    );
  if (answered?.[1]) {
    const picked = pickPersonName(answered[1]);
    if (picked.length >= 2) out.recipient = picked;
  }

  let recipient: string | undefined;
  for (const m of t.matchAll(
    /([\p{L}\p{N}.·-]{2,24}(?:\s+[\p{L}\p{N}.·-]{1,16}){0,2})\s*(?:에게|한테|께)/gu,
  )) {
    const name = (m[1] ?? "")
      .replace(/(?:슬랙|slack|그냥|좀|제발)/gi, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (name.length >= 2) recipient = name;
  }
  // "열어서 석승현 부대표한테" names a person, not a verb plus a job.
  if (recipient && !out.recipient) {
    const picked = pickPersonName(recipient);
    if (picked.length >= 2) out.recipient = picked;
  }

  const toEn =
    /(?:to|dm)\s+([A-Za-z][\w.\s-]{1,40}?)(?:\s+(?:saying|that|:)|$)/i.exec(t);
  if (!out.recipient && toEn?.[1]) {
    out.recipient = toEn[1].trim();
  }

  if (!out.body) {
    const afterSend =
      /(?:보내|전송|보내줘|보내\s*줘|send(?:\s+them)?)\s*[:：]?\s*(.+)$/i.exec(
        t,
      );
    if (afterSend?.[1]) {
      const body = afterSend[1]
        .replace(/^(?:고|서|라고|고\s*)/, "")
        .replace(/[「『"']|[」』"']/g, "")
        .trim();
      if (body.length >= 2 && !SLACK.test(body)) out.body = body;
    }
  }

  return out;
}

/** English steps for the computer-use model. */
export function slackDmPlaybook(instruction: string): string {
  const parsed = parseSlackDmAsk(instruction);
  const who = parsed.recipient
    ? `the person named "${parsed.recipient}"`
    : "the person named in the user's request";
  const what = parsed.body
    ? `exactly this message (unless the user said otherwise): "${parsed.body}"`
    : "the message the user asked to send (compose a short faithful text if they only named a topic)";

  const variants = parsed.recipient
    ? personNameVariants(parsed.recipient)
    : [];
  const terms = parsed.recipient ? searchTermsFor(parsed.recipient) : [];
  // Slack shows one spelling of a name and the person asking uses another, so
  // searching the phrase they typed finds nobody.
  const naming = parsed.channel
    ? [
        `The target is the channel #${parsed.channel}, not a person. Find it in the sidebar, or use the search field and type "${parsed.channel}".`,
        // Enter takes whatever Slack highlighted, which is how a search for
        // one channel ends with a message in another.
        `Searching is not opening. After typing the name, call ui.pick { text: "${parsed.channel}" } - it clicks the row with that exact name and tells you what opened. Do not press Enter and accept whichever row Slack highlighted.`,
        // Sidebar rows are truncated and the search box matches loosely, so the
        // wrong conversation opens routinely. That is a step, not an ending.
        `Then confirm with ui.elements: the window title must name #${parsed.channel}. If another conversation is open, search again and pick the right row - do not stop and report the wrong channel, and never type the message into it.`,
        "Join it first if Slack offers to; a channel you are not in has no composer.",
      ]
    : variants.length > 1
      ? [
          `Names: the same person may be listed as any of ${variants.join(", ")} — any of these is the right row.`,
          `Search by name only: type ${terms.map((term) => `"${term}"`).join(", then ")}. Never type a title (부대표님, 팀장님) or the whole sentence — those are not part of anyone's Slack name.`,
          "If a search returns nobody, try the next spelling before deciding the person does not exist.",
        ]
      : [
          "Search by the person's name alone. Titles such as 부대표님 or 팀장님 are not part of a Slack name, and a Korean name may be listed in romanised form (and the other way round).",
        ];

  const target = parsed.channel
    ? `Open the channel #${parsed.channel}. The sidebar rows and the search field are both in the element list.`
    : `Open DMs or the people search and find ${who}. The DM row and the search field are both in the element list.`;

  return [
    parsed.channel
      ? "Slack channel post playbook (desktop — no Slack API):"
      : "Slack DM playbook (desktop — no Slack API):",
    `1. Launch Slack desktop with app.launch: prefer executable/name "Slack" or Slack.exe. If that fails, open https://app.slack.com.`,
    "2. app.focus a window whose title contains Slack — sending requires focus and pointer input.",
    '3. ui.elements with app "Slack". This lists the real buttons, fields and conversation rows by name with exact positions.',
    "4. Click by name: ui.pick { text } when you know what the thing is called (a channel row, a person in the results), input.click { elementId } otherwise. Never read coordinates off a screenshot when an element exists — pixel guesses miss. Both answer with the window you ended up in and the fields now on screen, so you rarely need ui.elements straight after one.",
    "4b. Fill a field with input.type { elementId, text }, never by clicking it and typing blind. With an elementId the field is emptied first and read back afterwards, so text left over from a previous search cannot end up joined to yours. The element list also shows what each field already holds, and a search tells you which rows matched.",
    "5. screen.capture is slow and is for when the elements do not answer the question. Do not take one to decide where to click.",
    `6. ${target}`,
    ...naming.map((line) => `   ${line}`),
    `7. input.type { elementId: <the message composer>, text: ${what} }, then send (Enter or the Send button).`,
    "   Write it as plain text. Slack shows markdown literally, so no #, no **bold**, no [label](url) - a blank line between sections and • for a list is what reads well. Put real line breaks in the text; they are typed as line breaks, not sent.",
    "8. REQUIRED after sending: ui.elements again and find your message among the rows. It is exact and it costs a second; a screenshot is for when the elements do not settle it.",
    "9. Success only if the message is there as a posted row and the composer is empty. Text still sitting in the composer means it was not sent.",
    "If you cannot find it, say you could not confirm the send — never say 전송되었습니다 / successfully sent.",
    "If ui.elements finds nothing useful, only then fall back to screen.capture pixels with that image's frameId.",
    "If Slack is missing from every image after focus, wait briefly and capture again before giving up.",
    "Inventing a successful send is a hard failure. When unsure, report what the screenshot shows.",
  ].join("\n");
}
