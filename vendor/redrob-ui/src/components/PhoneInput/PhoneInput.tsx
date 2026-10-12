import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { Field } from '../../internal/Field';
import { DIAL, toE164 } from '../../internal/borders';

export interface PhoneValue {
  /** ISO country code. */
  country?: string;
  /** The number as the person writes it at home, trunk zero and all. */
  local?: string;
  /** Filled in for you: `+<country><subscriber>`. This is what to store. */
  e164?: string;
}

export interface PhoneInputProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  /** Default country when the value carries none. */
  country?: string;
  /** Which countries to offer. */
  countries?: string[];
  countryLabel?: string;
  value?: PhoneValue;
  error?: React.ReactNode;
  className?: string;
  onChange?: (value: PhoneValue) => void;
}

/**
 * A phone number: the country, and the number as it is written at home.
 *
 * The person writes what they would say. E.164 is computed for them, which is what gets stored - a number
 * kept in local form cannot be dialled from anywhere else, and the trunk zero is the part that breaks it.
 *
 * Not one free field with a "digits only, no spaces, include country code" hint. That hint is a form
 * asking a person to do the work the form could do, and it is where most numbers get entered wrong.
 */
export function PhoneInput(props: PhoneInputProps): React.ReactElement {
  const autoId = useStableId('rr-phone');
  const id = props.id || autoId;
  const v: PhoneValue = props.value || {};
  const country = v.country || props.country || 'KR';

  function emit(next: PhoneValue): void {
    next.e164 = toE164(next.country as string, next.local as string);
    if (props.onChange) props.onChange(next);
  }

  return React.createElement(
    'div',
    { className: cx('rr-phone', props.className) },
    Field(
      {
        id,
        label: props.label || 'Phone number',
        hint: props.hint || 'Write it the way you would say it. The country code is added for you.',
        error: props.error,
      },
      React.createElement('div', { className: 'rr-phone__row' }, [
        React.createElement(
          'select',
          {
            key: 'c',
            className: 'rr-control rr-control--md rr-phone__country',
            'aria-label': props.countryLabel || 'Country code',
            value: country,
            onChange: (event: React.ChangeEvent<HTMLSelectElement>) =>
              emit({ country: event.target.value, local: v.local }),
          },
          (props.countries || ['KR', 'IN', 'US']).map((c) =>
            React.createElement('option', { key: c, value: c }, `${c} +${DIAL[c] || ''}`),
          ),
        ),
        React.createElement('input', {
          key: 'n',
          id,
          type: 'tel',
          className: 'rr-control rr-control--md rr-phone__num',
          autoComplete: 'tel-national',
          inputMode: 'tel',
          spellCheck: 'false',
          value: v.local == null ? '' : v.local,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) =>
            emit({ country, local: event.target.value }),
        }),
      ]),
    ),
  );
}

export default PhoneInput;
