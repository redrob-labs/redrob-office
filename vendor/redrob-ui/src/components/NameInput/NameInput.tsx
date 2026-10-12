import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { Field } from '../../internal/Field';

export interface NameValue {
  full?: string;
  /** The name in the person's own script, kept exactly as written. */
  second?: string;
  /** What to call them in the product. */
  preferred?: string;
}

export interface NameInputProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  value?: NameValue;
  /** Per-part errors, keyed the same way as the value. */
  error?: Partial<Record<keyof NameValue, React.ReactNode>>;
  /** `false` makes the full name optional. It is required by default. */
  required?: boolean;
  disabled?: boolean;
  /** Offer a second field for the name in the person's own script. */
  second?: boolean;
  secondLabel?: React.ReactNode;
  secondHint?: React.ReactNode;
  /** Offer a preferred name, which is what the product then uses. */
  preferred?: boolean;
  preferredLabel?: React.ReactNode;
  preferredHint?: React.ReactNode;
  className?: string;
  onChange?: (value: NameValue, key: keyof NameValue) => void;
}

/**
 * One field for a person's name.
 *
 * One, not two. A first/last pair is a decision about whose names are well formed: it breaks for a
 * mononym, for anyone whose family name comes first, for names with more than two parts, and for
 * anyone who does not split their name the way the form expects. A single field accepts all of them.
 *
 * `second` offers the name in the person's own script, kept as written and used where the document is in
 * that script - not a transliteration to be corrected. `preferred` is what the product should call them,
 * which is often neither of the above.
 *
 * `maxLength` is 120 rather than something tighter, because a real name can be long and a form that
 * truncates one is telling its owner their name is wrong.
 */
export function NameInput(props: NameInputProps): React.ReactElement {
  const autoId = useStableId('rr-name');
  const id = props.id || autoId;
  const v: NameValue = props.value || {};

  function set(key: keyof NameValue, val: string): void {
    if (props.onChange) {
      const next: NameValue = { ...v };
      next[key] = val;
      props.onChange(next, key);
    }
  }

  function field(
    key: keyof NameValue,
    label: React.ReactNode,
    auto: string,
    hint?: React.ReactNode,
    required?: boolean,
  ): React.ReactElement {
    const fid = `${id}-${key}`;
    const error = props.error && props.error[key];
    return React.createElement(
      'div',
      { className: 'rr-name__row', key },
      Field(
        { id: fid, label, hint, required, error },
        React.createElement('input', {
          id: fid,
          type: 'text',
          className: cx('rr-control', `rr-control--${props.size || 'md'}`),
          autoComplete: auto,
          spellCheck: 'false',
          autoCorrect: 'off',
          maxLength: 120,
          value: v[key] == null ? '' : v[key],
          disabled: props.disabled,
          'aria-invalid': error ? 'true' : undefined,
          'aria-describedby': hint || error ? `${fid}-msg` : undefined,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
        }),
      ),
    );
  }

  return React.createElement('div', { className: cx('rr-name', props.className) }, [
    field('full', props.label || 'Full name', 'name', props.hint, props.required !== false),
    props.second
      ? field(
          'second',
          props.secondLabel || 'Name in your own script',
          'off',
          props.secondHint ||
            'Optional. Kept as you write it, and used where the document is in that script.',
        )
      : null,
    props.preferred
      ? field(
          'preferred',
          props.preferredLabel || 'What should we call you?',
          'nickname',
          props.preferredHint || 'Optional. This is what appears in the product.',
        )
      : null,
  ]);
}

export default NameInput;
