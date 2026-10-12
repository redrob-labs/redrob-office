import * as React from 'react';
import { cx } from '../../internal/cx';
export interface ProtectionStatusProps {
  title: React.ReactNode;
  icon?: React.ReactNode;
  /** `safe` on, `warn` off or degraded, `brand` a feature in force, `plain` neutral. */
  tone?: 'safe' | 'warn' | 'brand' | 'plain';
  size?: 'md' | 'lg';
  /** Text beside a live dot: what is running right now. */
  live?: string;
  /** Element for the title, when the card opens a section. */
  as?: keyof React.JSX.IntrinsicElements;
  className?: string;
  children?: React.ReactNode;
}
/**
 * The one sentence a person needs about a protection, large, with whether it is running. Heads a panel or a
 * page.
 *
 * The title says what IS, not what the feature is called: "Privacy protection is on: High" rather than
 * "Privacy". A person checking whether they are protected should not have to interpret a label.
 *
 * `live` pairs a dot with text. The dot alone would be decoration, and a safeguard that signals only in colour
 * is a safeguard some readers cannot verify.
 */
export function ProtectionStatus(props: ProtectionStatusProps): React.ReactElement {
  return React.createElement(
    'div',
    {
      className: cx(
        'rr-scard',
        `rr-scard--${props.tone || 'safe'}`,
        props.size === 'lg' && 'rr-scard--lg',
        props.className,
      ),
    },
    [
      props.icon
        ? React.createElement('span', { key: 'i', className: 'rr-scard__icon', 'aria-hidden': 'true' }, props.icon)
        : null,
      React.createElement('div', { key: 't', className: 'rr-scard__text' }, [
        React.createElement(
          (props.as || 'p') as string,
          { key: 'h', className: 'rr-scard__title' },
          props.title,
        ),
        props.children || props.live
          ? React.createElement('p', { key: 's', className: 'rr-scard__sub' }, [
              props.live
                ? React.createElement('span', {
                    key: 'l',
                    className: 'rr-live rr-live--inline',
                    'aria-hidden': 'true',
                  })
                : null,
              props.live
                ? React.createElement('span', { key: 'lt' }, props.live + (props.children ? '. ' : ''))
                : null,
              props.children,
            ])
          : null,
      ]),
    ],
  );
}
export default ProtectionStatus;
