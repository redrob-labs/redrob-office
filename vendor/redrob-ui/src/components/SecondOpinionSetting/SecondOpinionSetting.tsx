import * as React from 'react';
import { OPINION_MODES } from '../../internal/safeguards';
import { CrossCheckSetting } from '../CrossCheckSetting/CrossCheckSetting';
export interface OpinionMode {
  value: string;
  label?: React.ReactNode;
  /** What this mode costs and when it runs. */
  detail?: React.ReactNode;
}
export interface SecondOpinionSettingProps {
  options?: OpinionMode[];
  value?: string;
  defaultValue?: string;
  title?: React.ReactNode;
  lede?: React.ReactNode;
  label?: string;
  foot?: React.ReactNode;
  className?: string;
  onChange?: (value: string, mode: OpinionMode) => void;
}
/**
 * @deprecated Replaced by `CrossCheckSetting` in the October 2026 delivery, which sets Fact check and Challenge
 * separately; its old `rr-opset` styles are gone. This adapter keeps the one-value API: the value sets both checks,
 * and changing either check reports that level as the new value.
 */
export function SecondOpinionSetting(props: SecondOpinionSettingProps): React.ReactElement {
  const modes = props.options || OPINION_MODES;
  const [held, setHeld] = React.useState(props.defaultValue || 'auto');
  const value = props.value !== undefined ? props.value : held;
  return React.createElement(CrossCheckSetting, {
    className: props.className,
    title: props.title,
    lede: props.lede,
    foot: props.foot,
    value: { factCheck: value, challenge: value },
    onChange: (next, changed) => {
      const level = next[changed] || 'off';
      const mode = modes.filter((m) => m.value === level)[0] || { value: level };
      if (props.value === undefined) setHeld(level);
      if (props.onChange) props.onChange(level, mode);
    },
  });
}

export default SecondOpinionSetting;
