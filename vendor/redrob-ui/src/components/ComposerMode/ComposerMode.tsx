import * as React from 'react';
import { cx } from '../../internal/cx';
import { isIconName } from '../../internal/iconName';
import { COMPOSER_MODES, ComposerModeOption } from '../../internal/safeguards';
import { icons } from '../../icons';
export type { ComposerModeOption } from '../../internal/safeguards';
export interface ComposerModeProps {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, option: ComposerModeOption) => void;
  options?: ComposerModeOption[];
  /** Icons only, labels kept for screen readers. Automatic below 560px. */
  compact?: boolean;
  label?: string;
  className?: string;
}
/**
 * Plan or Run, in the composer bar beside the model.
 *
 * Plan asks what it needs and writes a plan that runs only when you say so; Run starts at once. It is a
 * per-message choice, so it sits where the message is sent rather than in a settings page somebody has to
 * remember to visit before typing.
 *
 * Each option carries its label as its accessible name and its hint as a title, so the compact, icons-only form
 * still says Plan and Run to a screen reader.
 */
export function ComposerMode(props: ComposerModeProps): React.ReactElement {
  const modes = props.options || COMPOSER_MODES;
  const [held, setHeld] = React.useState(props.defaultValue || modes[0].value);
  const value = props.value !== undefined ? props.value : held;
  return React.createElement(
    'div',
    {
      className: cx('rr-cmode', props.compact && 'rr-cmode--compact', props.className),
      role: 'radiogroup',
      'aria-label': props.label || 'How Cowork works on this message',
    },
    modes.map((m) => {
      const on = value === m.value;
      const icon = isIconName(m.icon) ? icons[m.icon]({ width: 13, height: 13, 'aria-hidden': 'true' }) : null;
      return React.createElement(
        'button',
        {
          key: m.value,
          type: 'button',
          role: 'radio',
          'aria-checked': String(on),
          'aria-label': m.label,
          title: m.hint,
          className: 'rr-cmode__o',
          onClick: () => {
            if (props.value === undefined) setHeld(m.value);
            if (props.onChange) props.onChange(m.value, m);
          },
        },
        [
          icon ? React.createElement(React.Fragment, { key: 'i' }, icon) : null,
          React.createElement('span', { key: 'l', className: 'rr-cmode__l' }, m.label),
        ],
      );
    }),
  );
}
export default ComposerMode;
