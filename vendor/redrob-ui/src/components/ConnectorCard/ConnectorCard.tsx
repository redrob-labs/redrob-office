import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';
import { Badge } from '../Badge/Badge';
import { Button } from '../Button/Button';

export interface ConnectorCardProps {
  name?: React.ReactNode;
  maker?: React.ReactNode;
  category?: React.ReactNode;
  /** What it lets the agent do, in one line. */
  description?: React.ReactNode;
  /** The maker's own logo. Only where the maker has approved its use. */
  logo?: string;
  /** Our own icon for the KIND of app, used when there is no approved logo. */
  icon?: React.ReactNode;
  connected?: boolean;
  connectLabel?: React.ReactNode;
  manageLabel?: React.ReactNode;
  disconnectLabel?: React.ReactNode;
  connectedLabel?: React.ReactNode;
  className?: string;
  onConnect?: () => void;
  onManage?: () => void;
  onDisconnect?: () => void;
}

/**
 * One app the agent can be connected to.
 *
 * The logo/icon split is a trademark rule, not a styling choice: another company's mark appears only where that
 * company has approved it, and otherwise the card uses our own icon for the kind of app. The fallback is the
 * default, so forgetting to check permission cannot ship someone else's logo.
 *
 * Disconnect sits beside Manage at the same weight. Connecting is easy everywhere; this is the component that
 * makes leaving easy too.
 */
export function ConnectorCard(props: ConnectorCardProps): React.ReactElement {
  const on = !!props.connected;

  return React.createElement('div', { className: cx('rr-connector', on && 'rr-connector--on', props.className) }, [
    React.createElement('div', { key: 't', className: 'rr-connector__top' }, [
      React.createElement(
        'span',
        { key: 'i', className: 'rr-connector__logo', 'aria-hidden': 'true' },
        props.logo
          ? React.createElement('img', { src: props.logo, alt: '' })
          : props.icon || icons.plug({ width: 20, height: 20 }),
      ),
      React.createElement('span', { key: 'n', className: 'rr-connector__name' }, [
        React.createElement('b', { key: 'b' }, props.name),
        props.maker || props.category
          ? React.createElement(
              'span',
              { key: 'm' },
              [props.maker, props.category].filter(Boolean).join(' - '),
            )
          : null,
      ]),
      on
        ? React.createElement(
            Badge,
            { key: 'b', tone: 'success', size: 'sm', dot: true },
            props.connectedLabel || 'Connected',
          )
        : null,
    ]),
    props.description
      ? React.createElement('p', { key: 'd', className: 'rr-connector__does' }, props.description)
      : null,
    React.createElement(
      'div',
      { key: 'a', className: 'rr-connector__act' },
      on
        ? [
            props.onManage
              ? React.createElement(
                  Button,
                  { key: 'm', size: 'sm', variant: 'ghost', onClick: props.onManage },
                  props.manageLabel || 'Manage',
                )
              : null,
            props.onDisconnect
              ? React.createElement(
                  Button,
                  { key: 'x', size: 'sm', variant: 'ghost', onClick: props.onDisconnect },
                  props.disconnectLabel || 'Disconnect',
                )
              : null,
          ]
        : [
            React.createElement(
              Button,
              { key: 'c', size: 'sm', variant: 'secondary', onClick: props.onConnect },
              props.connectLabel || 'Connect',
            ),
          ],
    ),
  ]);
}

export default ConnectorCard;
