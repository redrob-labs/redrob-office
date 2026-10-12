import * as React from 'react';
import { Combobox, ComboboxOption } from '../Combobox/Combobox';
import { TIME_ZONES, tzOffset } from '../../internal/datetime';

export interface TimeZonePickerProps {
  id?: string;
  label?: React.ReactNode;
  hint?: React.ReactNode;
  size?: 'sm' | 'md' | 'lg';
  /** An IANA zone id, e.g. `Asia/Seoul`. */
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  emptyText?: React.ReactNode;
  /** Replace the city list. Each entry is `[ianaZone, cityLabel]`. */
  zones?: Array<[string, string]>;
  /** The moment the offsets are shown for. Defaults to now, so DST is already applied. */
  now?: Date;
  className?: string;
  onChange?: (value: string, option: ComboboxOption) => void;
}

/**
 * Pick a time zone by naming a city.
 *
 * Cities, not zone ids: nobody knows they are in `Europe/Amsterdam`, and a list of zone ids asks a
 * person to translate where they live into a database key. The offset is shown beside each city and is
 * computed for a real moment, so it is the actual offset today rather than the zone's standard one.
 */
export function TimeZonePicker(props: TimeZonePickerProps): React.ReactElement {
  const zones = props.zones || TIME_ZONES;
  const at = props.now || new Date();

  return React.createElement(Combobox, {
    id: props.id,
    label: props.label || 'Time zone',
    size: props.size || 'sm',
    hint: props.hint,
    className: props.className,
    value: props.value,
    defaultValue: props.defaultValue,
    placeholder: props.placeholder || 'Search a city',
    emptyText: props.emptyText || 'No city by that name',
    onChange: (value: string, option: ComboboxOption) => {
      if (value && props.onChange) props.onChange(value, option);
    },
    options: zones.map((z) => {
      const offset = tzOffset(z[0], at);
      return { value: z[0], label: z[1] + (offset ? ` (${offset})` : '') };
    }),
  });
}

export default TimeZonePicker;
