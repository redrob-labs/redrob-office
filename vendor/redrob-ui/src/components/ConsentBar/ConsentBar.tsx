import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { Button } from '../Button/Button';
import { Checkbox } from '../Checkbox/Checkbox';

export interface ConsentCategory {
  id: string;
  label?: React.ReactNode;
  /** What this category actually does. Plain words, not a policy reference. */
  detail?: React.ReactNode;
  /** Cannot be switched off, and says so rather than appearing as a checked box nobody can change. */
  required?: boolean;
}

export interface ConsentBarProps {
  title?: string;
  categories?: ConsentCategory[];
  declineLabel?: React.ReactNode;
  chooseLabel?: React.ReactNode;
  saveLabel?: React.ReactNode;
  acceptLabel?: React.ReactNode;
  requiredLabel?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
  /** Receives the decision as `{ [categoryId]: boolean }`. */
  onDecide?: (choice: Record<string, boolean>) => void;
}

/**
 * Asks about cookies, and takes no for an answer.
 *
 * Decline is FIRST and is a real button, the same size and weight as accepting. The common pattern - a bright
 * "Accept all" beside a grey link in the small print - is a dark pattern, and this component is arranged so
 * that version cannot be built with it.
 *
 * Required categories render as required with a label saying so, rather than as a checked box a person cannot
 * move and is not told why.
 *
 * `role="dialog"` with the explanation wired through `aria-describedby`, so a screen reader is told what it is
 * being asked before it reaches the buttons.
 */
export function ConsentBar(props: ConsentBarProps): React.ReactElement {
  const cats = props.categories || [];
  const [open, setOpen] = React.useState(false);
  const [chosen, setChosen] = React.useState<Record<string, boolean>>(() => {
    const o: Record<string, boolean> = {};
    cats.forEach((c) => {
      o[c.id] = !!c.required;
    });
    return o;
  });
  const id = useStableId('rr-consent');

  function decide(all: boolean | null): void {
    const o: Record<string, boolean> = {};
    cats.forEach((c) => {
      o[c.id] = c.required ? true : all === null ? !!chosen[c.id] : all;
    });
    if (props.onDecide) props.onDecide(o);
  }

  return React.createElement(
    'div',
    {
      className: cx('rr-consent', props.className),
      role: 'dialog',
      'aria-label': props.title || 'Cookies',
      'aria-describedby': id,
    },
    [
      React.createElement('div', { className: 'rr-consent__body', key: 'b' }, [
        React.createElement('p', { className: 'rr-consent__text', key: 't', id }, props.children),
        open
          ? React.createElement(
              'ul',
              { className: 'rr-consent__cats', key: 'c' },
              cats.map((c, i) =>
                React.createElement('li', { className: 'rr-consent__cat', key: c.id || i }, [
                  React.createElement(Checkbox, {
                    key: 'x',
                    label: c.label,
                    hint: c.detail,
                    checked: c.required ? true : !!chosen[c.id],
                    disabled: !!c.required,
                    onChange: (event: React.ChangeEvent<HTMLInputElement>) => {
                      const o: Record<string, boolean> = { ...chosen };
                      o[c.id] = event.target.checked;
                      setChosen(o);
                    },
                  }),
                  c.required
                    ? React.createElement(
                        'span',
                        { className: 'rr-consent__req', key: 'r' },
                        props.requiredLabel || 'Always on',
                      )
                    : null,
                ]),
              ),
            )
          : null,
      ]),
      React.createElement('div', { className: 'rr-consent__actions', key: 'a' }, [
        React.createElement(
          Button,
          { key: 'n', size: 'sm', variant: 'secondary', onClick: () => decide(false) },
          props.declineLabel || 'Only what is needed',
        ),
        open
          ? React.createElement(
              Button,
              { key: 's', size: 'sm', variant: 'secondary', onClick: () => decide(null) },
              props.saveLabel || 'Save my choices',
            )
          : React.createElement(
              Button,
              { key: 'o', size: 'sm', variant: 'ghost', onClick: () => setOpen(true) },
              props.chooseLabel || 'Choose',
            ),
        React.createElement(
          Button,
          { key: 'y', size: 'sm', onClick: () => decide(true) },
          props.acceptLabel || 'Accept all',
        ),
      ]),
    ],
  );
}

export default ConsentBar;
