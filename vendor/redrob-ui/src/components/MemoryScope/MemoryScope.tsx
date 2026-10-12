import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { icons } from '../../icons';
import { ProtectionStatus } from '../ProtectionStatus/ProtectionStatus';

export interface MemoryScopeOption {
  value: string;
  label?: React.ReactNode;
  /** A second line: which notes this is. */
  detail?: React.ReactNode;
  /** What is in force, shown on the card. */
  summary?: React.ReactNode;
  /** This option turns memory off. */
  off?: boolean;
}

export interface MemoryScopeProps {
  options?: MemoryScopeOption[];
  value?: string;
  defaultValue?: string;
  label?: string;
  onTitle?: React.ReactNode;
  offTitle?: React.ReactNode;
  offText?: React.ReactNode;
  summary?: React.ReactNode;
  lede?: React.ReactNode | false;
  foot?: React.ReactNode;
  className?: string;
  onChange?: (value: string, option: MemoryScopeOption) => void;
}

/**
 * Which memory this chat reads, including none.
 *
 * Off is a real option with its own card and its own sentence - every AI starts from nothing, and nothing new is
 * saved. A memory control without an off switch is a setting, not a choice.
 *
 * The explanation is the product's actual argument: most apps keep what they learn inside one company's model,
 * and this one keeps it separately so every AI reads the same notes. That is why switching model mid-chat costs
 * nothing, and it is worth stating rather than leaving as a feature name.
 */
export function MemoryScope(props: MemoryScopeProps): React.ReactElement {
  const options = props.options || [];
  const [held, setHeld] = React.useState<string | undefined>(
    props.defaultValue || (options[0] && options[0].value),
  );
  const value = props.value !== undefined ? props.value : held;
  const name = useStableId('rr-memscope');
  const cur = options.filter((o) => o.value === value)[0] || ({} as MemoryScopeOption);
  const off = cur.off;

  return React.createElement('div', { className: cx('rr-memscope', props.className) }, [
    React.createElement(
      ProtectionStatus,
      {
        key: 'c',
        tone: off ? 'plain' : 'brand',
        icon: icons.bookOpen({ width: 28, height: 28 }),
        title: off
          ? props.offTitle || 'Memory is off for this chat'
          : props.onTitle || 'Memory is on: one memory for every AI',
      },
      off
        ? props.offText || 'Every AI starts from nothing, and nothing new is saved.'
        : cur.summary || props.summary,
    ),
    props.lede !== false
      ? React.createElement(
          'p',
          { key: 'l', className: 'rr-panellede' },
          props.lede ||
            'Most AI apps keep what they learn about you inside one AI, from one company. Redrob keeps your memory separately, so every AI reads the same notes before it answers. Switch AI mid-chat, or to a model that does not exist yet, and nothing has to be explained again.',
        )
      : null,
    React.createElement(
      'div',
      {
        key: 's',
        className: 'rr-memscope__options',
        role: 'radiogroup',
        'aria-label': props.label || 'Which memory this chat uses',
      },
      options.map((o) =>
        React.createElement('label', { key: o.value, className: 'rr-memscope__option' }, [
          React.createElement('input', {
            key: 'i',
            type: 'radio',
            name,
            checked: value === o.value,
            onChange: () => {
              if (props.value === undefined) setHeld(o.value);
              if (props.onChange) props.onChange(o.value, o);
            },
          }),
          React.createElement('span', { key: 't' }, [
            o.label,
            o.detail ? React.createElement('small', { key: 's' }, o.detail) : null,
          ]),
        ]),
      ),
    ),
    props.foot ? React.createElement('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null,
  ]);
}

export default MemoryScope;
