import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { icons } from '../../icons';

export interface ComposerProps {
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  /** Accessible name for the field. Visually hidden. */
  label?: string;
  /** Attachments or a quoted message, above the field. */
  context?: React.ReactNode;
  /** Replaces the default add button on the left. */
  leading?: React.ReactNode;
  /** Controls to the left of Send: a model picker, a mode toggle. */
  tools?: React.ReactNode;
  /** A `ComposerStatus` under the field. */
  status?: React.ReactNode;
  /** An answer is arriving. Turns Send into Stop. */
  busy?: boolean;
  disabled?: boolean;
  /** Grows to this many rows, then scrolls. */
  maxRows?: number;
  addLabel?: string;
  submitLabel?: string;
  stopLabel?: string;
  className?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onAdd?: () => void;
  onStop?: () => void;
}

/**
 * Where a person writes to the agent.
 *
 * Enter sends, Shift+Enter makes a line. The guard on `isComposing` and `keyCode === 229` is why this is worth
 * reading: in Korean, Japanese and Chinese input, Enter first COMMITS the characters being composed. Without the
 * guard, typing 안녕 and pressing Enter sends a half-composed message - the bug is invisible to anyone testing
 * in English, and it makes the product unusable in two of its three languages.
 *
 * The field grows to `maxRows` and then scrolls, measured off the real line height rather than a guess, so it
 * does not push the page around on a long message.
 *
 * Send is disabled while empty and becomes Stop while busy - a person should never have to find a different
 * control to interrupt an answer.
 */
export function Composer(props: ComposerProps): React.ReactElement {
  const [held, setHeld] = React.useState(props.defaultValue || '');
  const value = props.value !== undefined ? props.value : held;
  const taRef = React.useRef<HTMLTextAreaElement | null>(null);
  const id = useStableId('rr-composer');
  const maxRows = props.maxRows || 8;

  React.useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = 'auto';
    const lh = parseFloat(getComputedStyle(ta).lineHeight) || 22;
    ta.style.height = `${Math.min(ta.scrollHeight, lh * maxRows)}px`;
  }, [value, maxRows]);

  function set(v: string): void {
    if (props.value === undefined) setHeld(v);
    if (props.onChange) props.onChange(v);
  }

  function submit(): void {
    if (props.busy || props.disabled || !String(value).trim()) return;
    if (props.onSubmit) props.onSubmit(value);
    if (props.value === undefined) setHeld('');
  }

  const empty = !String(value).trim();

  const form = React.createElement(
    'form',
    {
      className: cx('rr-composer', props.busy && 'rr-composer--busy', props.className),
      onSubmit: (event: React.FormEvent) => {
        event.preventDefault();
        submit();
      },
    },
    [
      props.context
        ? React.createElement('div', { key: 'x', className: 'rr-composer__context' }, props.context)
        : null,
      React.createElement(
        'label',
        { key: 'l', htmlFor: id, className: 'rr-visually-hidden' },
        props.label || 'Message',
      ),
      React.createElement('textarea', {
        key: 't',
        id,
        ref: taRef,
        rows: 1,
        className: 'rr-composer__input',
        placeholder: props.placeholder,
        value,
        disabled: props.disabled,
        onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => set(event.target.value),
        onKeyDown: (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
          const native = event.nativeEvent as KeyboardEvent & { isComposing?: boolean };
          if (
            event.key === 'Enter' &&
            !event.shiftKey &&
            !(native && native.isComposing) &&
            event.keyCode !== 229
          ) {
            event.preventDefault();
            submit();
          }
        },
      }),
      React.createElement('div', { key: 'b', className: 'rr-composer__bar' }, [
        React.createElement(
          'div',
          { key: 'a', className: 'rr-composer__lead' },
          props.leading !== undefined
            ? props.leading
            : React.createElement(
                'button',
                {
                  type: 'button',
                  className: 'rr-composer__tool',
                  'aria-label': props.addLabel || 'Add files',
                  onClick: props.onAdd,
                },
                icons.plus({ width: 18, height: 18 }),
              ),
        ),
        React.createElement('div', { key: 'r', className: 'rr-composer__trail' }, [
          props.tools
            ? React.createElement('span', { key: 'm', className: 'rr-composer__tools' }, props.tools)
            : null,
          props.busy
            ? React.createElement(
                'button',
                {
                  key: 's',
                  type: 'button',
                  className: 'rr-composer__send rr-composer__send--stop',
                  'aria-label': props.stopLabel || 'Stop',
                  onClick: props.onStop,
                },
                icons.stop({ width: 14, height: 14 }),
              )
            : React.createElement(
                'button',
                {
                  key: 's',
                  type: 'submit',
                  className: 'rr-composer__send',
                  'aria-label': props.submitLabel || 'Send',
                  disabled: empty || props.disabled,
                },
                icons.arrowUp({ width: 18, height: 18 }),
              ),
        ]),
      ]),
    ],
  );

  if (!props.status) return form;

  // The status panels open above the whole composer, so the group is what they are positioned against.
  return React.createElement('div', { className: 'rr-composer-group' }, [
    React.createElement(React.Fragment, { key: 'f' }, form),
    React.createElement('div', { key: 's', className: 'rr-composer-group__status' }, props.status),
  ]);
}

export default Composer;
