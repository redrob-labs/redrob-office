import * as React from 'react';
import { cx } from '../../internal/cx';
import { MixStep } from '../../internal/insight';

export interface MixKeyProps {
  steps?: MixStep[];
  /** Stacks the key and adds each step's defining sentence. For the first time a reader meets the scale. */
  full?: boolean;
  className?: string;
}

/** The legend for `MixBar` and `MixColumns`: a swatch of the ordinal ramp and the step's name. */
export function MixKey(props: MixKeyProps): React.ReactElement {
  const steps = props.steps || [];
  return React.createElement(
    'ul',
    { className: cx('rr-mixkey', props.full && 'rr-mixkey--full', props.className) },
    steps.map((s, i) =>
      React.createElement('li', { key: i, className: 'rr-mixkey__item' }, [
        React.createElement('i', { key: 'i', className: `rr-mixkey__swatch rr-mix__seg--${Math.min(i, 5)}`, 'aria-hidden': 'true' }),
        React.createElement('span', { key: 't' }, [
          React.createElement('b', { key: 'n' }, s.name),
          props.full && s.text ? React.createElement('span', { key: 'x' }, ` · ${s.text}`) : null,
        ]),
      ]),
    ),
  );
}

export default MixKey;
