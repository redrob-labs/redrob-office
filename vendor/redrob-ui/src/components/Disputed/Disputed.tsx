import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { Button } from '../Button/Button';

export interface DisputedView {
  /** Which model. Named. */
  who?: React.ReactNode;
  said?: React.ReactNode;
}

export interface DisputedProps {
  /** The views that disagree. */
  views?: DisputedView[];
  title?: string;
  hint?: string;
  /** A superscript number tying this to a list. */
  n?: number | string;
  open?: boolean;
  defaultOpen?: boolean;
  settleLabel?: React.ReactNode;
  closeLabel?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  /** Offers to resolve it. Omit it and there is no settle button. */
  onSettle?: () => void;
  onOpenChange?: (open: boolean) => void;
}

/**
 * @deprecated Use Opinion. Kept for 1.x.
 *
 * Marks a claim a second opinion disagrees with, inline, and shows both views.
 *
 * The disagreement stays attached to the sentence it is about rather than being collected into a footnote at
 * the bottom. A reader who does not scroll should still know the claim under their eye is contested.
 *
 * The mark is keyboard-operable with Enter and Space, because it is a `span` with `role="button"` - a real
 * button cannot be nested inside a paragraph of prose without breaking the line flow.
 */
export function Disputed(props: DisputedProps): React.ReactElement {
  const [held, setHeld] = React.useState(!!props.defaultOpen);
  const open = props.open !== undefined ? props.open : held;
  const pid = useStableId('rr-dispute');
  const views = props.views || [];

  function set(v: boolean): void {
    if (props.open === undefined) setHeld(v);
    if (props.onOpenChange) props.onOpenChange(v);
  }

  return React.createElement(
    'span',
    { className: cx('rr-dispute', open && 'rr-dispute--open', props.className) },
    [
      React.createElement(
        'span',
        {
          key: 'q',
          role: 'button',
          tabIndex: 0,
          className: 'rr-dispute__mark',
          'aria-expanded': String(open),
          'aria-controls': pid,
          title: props.hint || 'Fact check reads this differently',
          onClick: () => set(!open),
          onKeyDown: (event: React.KeyboardEvent) => {
            if (event.key === 'Enter' || event.key === ' ') {
              event.preventDefault();
              set(!open);
            }
          },
        },
        [props.children, props.n != null ? React.createElement('sup', { key: 's' }, String(props.n)) : null],
      ),
      open
        ? React.createElement(
            'span',
            {
              key: 'p',
              id: pid,
              className: 'rr-dispute__panel',
              role: 'region',
              'aria-label': props.title || 'What Fact check found',
            },
            [
              React.createElement(
                'span',
                { key: 'h', className: 'rr-dispute__title' },
                props.title || 'Fact check reads this differently',
              ),
              views.map((v, i) =>
                React.createElement('span', { key: i, className: 'rr-dispute__view' }, [
                  React.createElement('span', { key: 'w', className: 'rr-dispute__who' }, v.who),
                  React.createElement('span', { key: 's' }, v.said),
                ]),
              ),
              React.createElement('span', { key: 'a', className: 'rr-dispute__actions' }, [
                props.onSettle
                  ? React.createElement(
                      Button,
                      {
                        key: 'b',
                        size: 'sm',
                        variant: 'secondary',
                        onClick: () => {
                          set(false);
                          if (props.onSettle) props.onSettle();
                        },
                      },
                      props.settleLabel || 'Ask Cowork to settle it',
                    )
                  : null,
                React.createElement(
                  Button,
                  { key: 'c', size: 'sm', variant: 'ghost', onClick: () => set(false) },
                  props.closeLabel || 'Close',
                ),
              ]),
            ],
          )
        : null,
    ],
  );
}

export default Disputed;
