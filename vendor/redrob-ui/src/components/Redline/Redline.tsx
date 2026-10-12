import * as React from 'react';
import { cx } from '../../internal/cx';
import { REDLINE_STATE } from '../../internal/evidence';
import { icons } from '../../icons';
import { Button } from '../Button/Button';

export interface RedlinePart {
  /** `same` unchanged, `out` removed, `in` added. */
  kind?: 'same' | 'out' | 'in';
  text?: string;
}

export interface RedlineProps {
  parts?: RedlinePart[];
  label?: React.ReactNode;
  source?: React.ReactNode;
  /** Why the change is proposed. */
  why?: React.ReactNode;
  state?: 'open' | 'kept' | 'reverted';
  stateLabel?: React.ReactNode;
  keepLabel?: React.ReactNode;
  revertLabel?: React.ReactNode;
  className?: string;
  onKeep?: () => void;
  onRevert?: () => void;
}

/**
 * A proposed wording change, shown in the text itself.
 *
 * Removals are `del` and additions are `ins`, which is what makes the change survive as a change: a screen reader
 * announces deleted and inserted text, and a copy-paste keeps the distinction. Styling spans in red and green
 * would leave the diff invisible to anyone not seeing colour.
 *
 * `why` is next to the change rather than in a separate comment thread. A redline without its reason is an edit
 * somebody has to accept on trust.
 */
export function Redline(props: RedlineProps): React.ReactElement {
  const parts = props.parts || [];
  const state = props.state || 'open';

  return React.createElement('div', { className: cx('rr-redline', `rr-redline--${state}`, props.className) }, [
    props.label || props.source
      ? React.createElement('div', { className: 'rr-redline__head', key: 'h' }, [
          React.createElement(
            'span',
            { className: 'rr-redline__icon', key: 'i' },
            icons.clause({ width: 15, height: 15 }),
          ),
          React.createElement('span', { className: 'rr-redline__label', key: 'l' }, props.label),
          props.source
            ? React.createElement('span', { className: 'rr-redline__source', key: 's' }, props.source)
            : null,
        ])
      : null,
    React.createElement(
      'p',
      { className: 'rr-redline__text', key: 't' },
      parts.map((p, i) => {
        const kind = p.kind || 'same';
        if (kind === 'same') return React.createElement('span', { key: i }, p.text);
        return React.createElement(
          kind === 'out' ? 'del' : 'ins',
          { className: `rr-redline__${kind}`, key: i },
          p.text,
        );
      }),
    ),
    props.why
      ? React.createElement('p', { className: 'rr-redline__why', key: 'w' }, [
          React.createElement('span', { className: 'rr-redline__whyLabel', key: 'l' }, 'Why'),
          props.why,
        ])
      : null,
    state === 'open' && (props.onKeep || props.onRevert)
      ? React.createElement('div', { className: 'rr-redline__actions', key: 'a' }, [
          props.onKeep
            ? React.createElement(
                Button,
                { key: 'k', size: 'sm', onClick: props.onKeep },
                props.keepLabel || 'Keep this wording',
              )
            : null,
          props.onRevert
            ? React.createElement(
                Button,
                { key: 'r', size: 'sm', variant: 'secondary', onClick: props.onRevert },
                props.revertLabel || 'Put it back',
              )
            : null,
        ])
      : state !== 'open'
        ? React.createElement('div', { className: 'rr-redline__settled', key: 'd' }, [
            React.createElement(
              'span',
              { key: 'i', className: 'rr-redline__settledIcon' },
              (state === 'kept' ? icons.success : icons.history)({ width: 14, height: 14 }),
            ),
            React.createElement('span', { key: 't' }, props.stateLabel || REDLINE_STATE[state]),
          ])
        : null,
  ]);
}

export default Redline;
