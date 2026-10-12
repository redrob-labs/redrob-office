import * as React from 'react';

/**
 * The 62 characters `React.useId` builds its ids from (tree positions in base 32, the `R`/`r`/`H`
 * markers, and the usual alphabet of an `identifierPrefix`).
 */
const ALNUM = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';

/**
 * Turns a `React.useId` value into decimal digits.
 *
 * Why digits, and not the raw value or a lightly cleaned one:
 * - The raw value is not a safe token. React 18 returns `:r0:`, 19.0 `«r0»`, 19.1+ `_r_0_`. A colon
 *   in an id breaks `#id` and `[for=...]` selectors unless every caller remembers `CSS.escape`, and
 *   the guillemets are not something a person should meet in a DOM dump.
 * - The ids keep the shape `rr-<kind>-<number>` that the delivery's reference markup has and that the
 *   parity harness already normalises (`rr-<kind>-<digits>` to `rr-id`). Any other suffix would make
 *   every component with a generated id differ from the reference, and the honest fix for that would
 *   be loosening the harness, which is not allowed.
 *
 * The code is prefix-free, so two different React ids can never map to the same digits: an
 * alphanumeric is two digits `10`-`71` (never starting with 8 or 9), anything else is `9` and its
 * UTF-16 code in five digits. The one delimiter React wraps every id in is dropped first; it is the
 * same character for every id one React version produces, so dropping it cannot make two ids equal.
 */
function digits(reactId: string): string {
  let s = reactId;
  if (s.length >= 2 && ALNUM.indexOf(s[0]) < 0 && ALNUM.indexOf(s[s.length - 1]) < 0) {
    s = s.slice(1, -1);
  }
  let out = '';
  for (let i = 0; i < s.length; i += 1) {
    const at = ALNUM.indexOf(s[i]);
    out += at >= 0 ? String(at + 10) : `9${String(s.charCodeAt(i)).padStart(5, '0')}`;
  }
  return out;
}

/**
 * An id that survives re-renders and is the same on the server and in the browser, so a label, a
 * hint, a Form error or a radio group's `name` keeps pointing at the same thing.
 *
 * It is `React.useId` underneath, which derives the id from the component's position in the tree
 * rather than from a counter. The counter this replaced lived in the module, so on a Node server it
 * kept counting across requests: the server sent `rr-theme-412` and the browser, starting from 1,
 * rendered `rr-theme-1`, and React reported a hydration mismatch in every Next.js consumer.
 *
 * Call it unconditionally and before any early return, like every other hook. Do not call it in a
 * loop or a callback: an id is per component, and a component needing several derives them from one
 * (`${id}-hint`, `${id}-err`).
 *
 * The prefix names the field kind so a DOM dump stays readable: `rr-input-3710`.
 */
export function useStableId(prefix: string): string {
  return `${prefix}-${digits(React.useId())}`;
}
