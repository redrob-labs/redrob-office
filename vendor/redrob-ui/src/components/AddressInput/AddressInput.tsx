import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { Field } from '../../internal/Field';
import { ADDRESS_AUTOCOMPLETE, ADDRESS_SCHEMA, tidyPostal } from '../../internal/borders';

export interface AddressValue {
  /** Used when the country has no schema: the whole address, as written. */
  free?: string;
  postal?: string;
  /** Province, state, metropolitan city. */
  level1?: string;
  /** City, county, district, town. */
  level2?: string;
  line1?: string;
  line2?: string;
}

export interface AddressInputProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** ISO country code. `KR`, `IN` and `US` have field orders; anything else gets one free field. */
  country?: string;
  value?: AddressValue;
  /** A string for the free-form variant, or per-field errors for a known country. */
  error?: string | Partial<Record<keyof AddressValue, React.ReactNode>>;
  className?: string;
  onChange?: (value: AddressValue, key: keyof AddressValue) => void;
}

/**
 * An address, in the order the country writes it.
 *
 * Korea runs postal code first and largest to smallest; India and the US run smallest to largest. Those
 * are different forms, not one form with relabelled boxes, and a single "street / city / state / zip"
 * layout is a US form wearing a neutral name.
 *
 * An unknown country gets one textarea, not the US layout. That is the honest answer: the system does not
 * know how that address is written, so it accepts it as written and does not lose a part of it by
 * insisting on boxes that do not fit.
 *
 * Postal codes are tidied on blur rather than validated on keystroke. Spaces, case and punctuation are how
 * people write them, and rejecting the input as they type teaches nothing.
 */
export function AddressInput(props: AddressInputProps): React.ReactElement {
  const autoId = useStableId('rr-addr');
  const id = props.id || autoId;
  const v: AddressValue = props.value || {};
  const schema = props.country ? ADDRESS_SCHEMA[props.country] : undefined;
  const fieldErrors =
    props.error && typeof props.error !== 'string'
      ? (props.error as Partial<Record<string, React.ReactNode>>)
      : undefined;

  function set(key: keyof AddressValue, val: string): void {
    if (!props.onChange) return;
    const next: AddressValue = { ...v };
    next[key] = val;
    props.onChange(next, key);
  }

  if (!schema) {
    return React.createElement(
      'div',
      { className: cx('rr-addr', props.className) },
      Field(
        {
          id,
          label: props.label || 'Address',
          error: typeof props.error === 'string' ? props.error : undefined,
          hint: props.hint || 'Write it the way it is written where it is. Paste is fine.',
        },
        React.createElement('textarea', {
          id,
          rows: 4,
          className: 'rr-control rr-textarea',
          autoComplete: 'street-address',
          spellCheck: 'false',
          value: v.free == null ? '' : v.free,
          onChange: (event: React.ChangeEvent<HTMLTextAreaElement>) => set('free', event.target.value),
        }),
      ),
    );
  }

  // A fieldset, so the group keeps its own label and hint. The first field takes the component's id, so
  // a Form error summary link lands on the top of the address rather than nowhere.
  const head: React.ReactNode[] = [
    React.createElement('legend', { key: 'lg', className: 'rr-field__label' }, props.label || 'Address'),
    props.hint ? React.createElement('p', { key: 'hn', className: 'rr-field__hint' }, props.hint) : null,
  ];

  const rows = schema.fields.map((k, i) => {
    const fid = i === 0 ? id : `${id}-${k}`;
    const key = k as keyof AddressValue;
    return React.createElement(
      'div',
      { className: cx('rr-addr__row', k === 'postal' && 'rr-addr__row--short'), key: k },
      Field(
        { id: fid, label: schema.labels[k], error: fieldErrors && fieldErrors[k] },
        React.createElement('input', {
          id: fid,
          type: 'text',
          className: 'rr-control rr-control--md',
          autoComplete: ADDRESS_AUTOCOMPLETE[k],
          spellCheck: 'false',
          inputMode: k === 'postal' ? 'numeric' : undefined,
          value: v[key] == null ? '' : v[key],
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => set(key, event.target.value),
          onBlur:
            k === 'postal'
              ? (event: React.FocusEvent<HTMLInputElement>) => set(key, tidyPostal(event.target.value))
              : undefined,
        }),
      ),
    );
  });

  return React.createElement(
    'fieldset',
    { className: cx('rr-addr', 'rr-addr--group', props.className) },
    head.concat(rows),
  );
}

export default AddressInput;
