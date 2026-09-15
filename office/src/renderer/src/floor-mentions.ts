/**
 * Who a message was aimed at, taken from the `@name` in it.
 *
 * The composer serialises a mention chip as `@id`, so this is the one place that
 * decides what that means: the first name in the message is the seat that gets
 * the work, and the lead is skipped because a person has already made the
 * decision the lead exists to make.
 */

export interface Addressed {
  /** The seat that should deal with it, if one was named. */
  to?: string;
  /** What to send. */
  text: string;
}

/**
 * A leading name is pure addressing and comes off, the way "@조사 이거 찾아봐"
 * means "이거 찾아봐" said to 조사. A name inside a sentence is part of what was
 * written and stays, because removing it leaves a hole where the words were.
 *
 * `ids` is the roster, so `@` in an email address or a handle nobody on the floor
 * answers to is left as text rather than silently swallowed.
 */
export function splitAddressee(text: string, ids: readonly string[]): Addressed {
  const known = new Set(ids.map((id) => id.toLowerCase()));
  const leading = /^@([\p{L}\p{N}_-]+)\s*/u.exec(text);
  if (leading) {
    const id = (leading[1] ?? "").toLowerCase();
    if (known.has(id)) return { to: id, text: text.slice(leading[0].length) };
  }
  for (const match of text.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu)) {
    const id = (match[1] ?? "").toLowerCase();
    if (known.has(id)) return { to: id, text };
  }
  return { text };
}
