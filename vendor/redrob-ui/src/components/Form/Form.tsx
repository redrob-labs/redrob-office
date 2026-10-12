import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { icons } from '../../icons';
import { Button } from '../Button/Button';

export interface FormError {
  /** The id of the field this is about, so the summary can link straight to it. */
  field?: string;
  message: React.ReactNode;
}

export interface FormProps {
  title?: React.ReactNode;
  description?: React.ReactNode;
  /** `pending` disables the submit and shows it working; `done` replaces the form with the receipt. */
  state?: 'idle' | 'pending' | 'done';
  /** Everything wrong, in one place, above the fields. */
  errors?: FormError[];
  errorsTitle?: React.ReactNode;
  submitLabel?: React.ReactNode;
  pendingLabel?: React.ReactNode;
  /** A line beside the submit: what happens next, how long it takes. */
  note?: React.ReactNode;
  /** Consent text, above the submit. */
  consent?: React.ReactNode;
  doneTitle?: React.ReactNode;
  doneText?: React.ReactNode;
  /** Name of the honeypot field. Change it if a form is being targeted specifically. */
  trapName?: string;
  onSubmit?: (event: React.FormEvent<HTMLFormElement>) => void;
  className?: string;
  children?: React.ReactNode;
}

/**
 * The frame around a set of fields: title, an error summary, the fields, consent, one submit.
 *
 * The summary takes focus when errors appear. A summary that only renders is a summary a screen reader
 * never reaches, and that is the most common way a form fails WCAG in practice - not a missing label,
 * but an error nobody is told about.
 *
 * `noValidate` is set so the browser's own bubbles do not pre-empt this summary with a message in a
 * different voice and a different language.
 *
 * The honeypot is the only spam defence that costs a real person nothing: no puzzle, no third-party
 * script, no tracking.
 */
export function Form(props: FormProps): React.ReactElement {
  const state = props.state || 'idle';
  const errors = props.errors || [];
  const summary = React.useRef<HTMLDivElement | null>(null);
  const id = useStableId('rr-form');

  React.useEffect(() => {
    if (errors.length && summary.current) summary.current.focus();
  }, [errors.length]);

  if (state === 'done') {
    return React.createElement(
      'div',
      { className: cx('rr-form', 'rr-form--done', props.className), role: 'status' },
      [
        React.createElement(
          'span',
          { className: 'rr-form__doneIcon', key: 'i' },
          icons.success({ width: 22, height: 22 }),
        ),
        React.createElement('div', { className: 'rr-form__doneBody', key: 'b' }, [
          React.createElement('p', { className: 'rr-form__doneTitle', key: 't' }, props.doneTitle || 'Thank you.'),
          React.createElement('p', { className: 'rr-form__doneText', key: 'x' }, props.doneText),
        ]),
      ],
    );
  }

  return React.createElement(
    'form',
    {
      className: cx('rr-form', props.className),
      noValidate: true,
      onSubmit: (event: React.FormEvent<HTMLFormElement>) => {
        event.preventDefault();
        if (props.onSubmit) props.onSubmit(event);
      },
    },
    [
      props.title
        ? React.createElement('h2', { className: 'rr-form__title', key: 't', id: `${id}-t` }, props.title)
        : null,
      props.description ? React.createElement('p', { className: 'rr-form__desc', key: 'd' }, props.description) : null,
      errors.length
        ? React.createElement(
            'div',
            {
              className: 'rr-form__errors',
              key: 'e',
              role: 'alert',
              tabIndex: -1,
              ref: (node: HTMLDivElement | null): void => {
                summary.current = node;
              },
            },
            [
              React.createElement(
                'p',
                { className: 'rr-form__errorsTitle', key: 't' },
                props.errorsTitle ||
                  (errors.length === 1 ? 'One thing needs fixing' : `${errors.length} things need fixing`),
              ),
              React.createElement(
                'ul',
                { className: 'rr-form__errorsList', key: 'l' },
                errors.map((error, i) =>
                  React.createElement(
                    'li',
                    { key: i },
                    error.field
                      ? React.createElement('a', { href: `#${error.field}` }, error.message)
                      : React.createElement('span', null, error.message),
                  ),
                ),
              ),
            ],
          )
        : null,
      React.createElement('div', { className: 'rr-form__fields', key: 'f' }, props.children),
      React.createElement(
        'div',
        { className: 'rr-form__trap', key: 'h', 'aria-hidden': 'true' },
        React.createElement('input', {
          type: 'text',
          name: props.trapName || 'company_website',
          tabIndex: -1,
          autoComplete: 'off',
        }),
      ),
      props.consent ? React.createElement('div', { className: 'rr-form__consent', key: 'c' }, props.consent) : null,
      React.createElement('div', { className: 'rr-form__foot', key: 'a' }, [
        React.createElement(
          Button,
          {
            key: 's',
            type: 'submit',
            size: 'lg',
            loading: state === 'pending',
            disabled: state === 'pending',
          },
          state === 'pending' ? props.pendingLabel || 'Sending' : props.submitLabel || 'Send',
        ),
        props.note ? React.createElement('span', { className: 'rr-form__note', key: 'n' }, props.note) : null,
      ]),
    ],
  );
}

export default Form;
