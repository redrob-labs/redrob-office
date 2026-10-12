import * as React from 'react';
import { cx } from './cx';

/**
 * The vocabularies the Evidence components share.
 *
 * Every one of these says what is NOT known as plainly as what is. That is the group's whole purpose: these
 * components make a claim about a body of material, and a claim without its gaps is not checkable.
 */

/** Read / partly read / not read / still reading. "Not read" is a state, not an absence. */
export const SRC_STATE: Record<string, string> = {
  read: 'Read',
  partial: 'Partly read',
  skipped: 'Not read',
  pending: 'Still reading',
};

/** In a person's words, not a scoring vocabulary. */
export const WEIGHT_LABEL: Record<string, string> = {
  required: 'Must have',
  preferred: 'Good to have',
  excluded: 'Must not have',
};

export const MET_ICON: Record<string, string> = {
  met: 'success',
  partly: 'minus',
  missing: 'close',
  unknown: 'info',
};

/**
 * `unknown` is "No evidence either way", never "No".
 *
 * Absence of evidence is not evidence of absence, and a grid that renders the two the same way turns a gap in
 * the sources into a finding against whoever is being assessed.
 */
export const MET_LABEL: Record<string, string> = {
  met: 'Meets this',
  partly: 'Partly',
  missing: 'Does not',
  unknown: 'No evidence either way',
};

/** `answered` and `pending` carry no word - the value or the skeleton speaks. */
export const CELL_STATE: Record<string, string | null> = {
  answered: null,
  unsure: 'Not sure',
  none: 'Not found',
  pending: null,
};

export const SEV_LABEL: Record<string, string> = {
  high: 'Serious',
  medium: 'Worth a look',
  low: 'Minor',
  note: 'Note',
};

export const REDLINE_STATE: Record<string, string> = { kept: 'Kept', reverted: 'Put back' };

/**
 * Highlights the relied-on quote inside its surrounding passage.
 *
 * Returns the passage untouched when the quote is not in it, rather than guessing. A highlight in the wrong place
 * would misattribute which words the claim rests on.
 */
export function markPassage(passage: React.ReactNode, quote?: string): React.ReactNode {
  if (!passage) return null;
  if (!quote || typeof passage !== 'string') return passage;
  const at = passage.indexOf(quote);
  if (at === -1) return passage;
  return [
    passage.slice(0, at),
    React.createElement('mark', { className: 'rr-evidence__mark', key: 'm' }, quote),
    passage.slice(at + quote.length),
  ];
}

/** One titled list in a DecisionNotice, or nothing when there is nothing to list. */
export function noticeList(
  title: React.ReactNode,
  arr: React.ReactNode[] | undefined,
  cls: string,
  key: string,
): React.ReactElement | null {
  if (!arr || !arr.length) return null;
  return React.createElement('div', { className: 'rr-notice__col', key }, [
    React.createElement('span', { className: 'rr-notice__colTitle', key: 't' }, title),
    React.createElement(
      'ul',
      { className: cx('rr-notice__items', cls), key: 'l' },
      arr.map((x, i) => React.createElement('li', { key: i }, x)),
    ),
  ]);
}
