import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons, IconName } from '../../icons';
import { Badge } from '../Badge/Badge';

export interface PlaybookStep {
  /** This step waits for a person. Counted into the "asks you first" line. */
  approval?: boolean;
}

export interface PlaybookRowProps {
  name?: React.ReactNode;
  summary?: React.ReactNode;
  icon?: React.ReactNode;
  steps?: PlaybookStep[];
  /** Overrides the count derived from `steps`. */
  stepCount?: number;
  /** Overrides the derived number of approval points. */
  asks?: number;
  owner?: React.ReactNode;
  ownerPrefix?: string;
  /** Marks a playbook that does something consequential. */
  highImpact?: boolean;
  highImpactLabel?: React.ReactNode;
  /** `[value, note]` - what running it is worth. */
  impact?: React.ReactNode[];
  asksLabel?: string;
  straightLabel?: React.ReactNode;
  href?: string;
  className?: string;
  onClick?: () => void;
}

/**
 * One saved playbook, and how much of it runs without asking.
 *
 * The approval count is the row's most important number, so it is derived from the steps rather than declared: a
 * playbook cannot claim it asks first if none of its steps do. "Runs straight through" is stated plainly when
 * nothing asks, because that is the case a person needs to notice before scheduling it.
 *
 * The element follows the props - a link with `href`, a button with `onClick`, otherwise a plain div. A clickable
 * div would be unreachable by keyboard.
 */
export function PlaybookRow(props: PlaybookRowProps): React.ReactElement {
  const steps = props.steps || [];
  const asks = props.asks != null ? props.asks : steps.filter((s) => s && s.approval).length;
  const n = props.stepCount != null ? props.stepCount : steps.length;
  const asksText = asks
    ? `${props.asksLabel || 'Asks you first'} ${asks === 1 ? 'once' : asks === 2 ? 'twice' : `${asks} times`}`
    : props.straightLabel || 'Runs straight through';
  const impact = props.impact || [];
  const Tag = props.href ? 'a' : props.onClick ? 'button' : 'div';

  return React.createElement(
    Tag,
    {
      className: cx('rr-pbrow', props.className),
      href: props.href,
      onClick: props.onClick,
      type: Tag === 'button' ? 'button' : undefined,
    },
    [
      React.createElement(
        'span',
        { key: 'i', className: 'rr-pbrow__icon', 'aria-hidden': 'true' },
        props.icon || icons.checklist({ width: 16, height: 16 }),
      ),
      React.createElement('span', { key: 'm', className: 'rr-pbrow__main' }, [
        React.createElement('span', { key: 'n', className: 'rr-pbrow__name' }, [
          React.createElement('b', { key: 'b' }, props.name),
          props.highImpact
            ? React.createElement(
                Badge,
                { key: 'h', tone: 'brand', size: 'sm' },
                props.highImpactLabel || 'High impact',
              )
            : null,
        ]),
        props.summary
          ? React.createElement('span', { key: 's', className: 'rr-pbrow__summary' }, props.summary)
          : null,
        React.createElement('span', { key: 'f', className: 'rr-pbrow__foot' }, [
          React.createElement('span', { key: 'a', className: 'rr-pbrow__asks' }, [
            icons[(asks ? 'userCheck' : 'play') as IconName]({
              key: 'i',
              width: 13,
              height: 13,
              'aria-hidden': 'true',
            } as never),
            asksText,
          ]),
          n ? React.createElement('span', { key: 'c' }, `${n} steps`) : null,
          props.owner
            ? React.createElement('span', { key: 'o' }, `${props.ownerPrefix || 'Saved by'} ${props.owner}`)
            : null,
        ]),
      ]),
      impact.length
        ? React.createElement('span', { key: 'v', className: 'rr-pbrow__worth' }, [
            React.createElement('b', { key: 'b' }, impact[0]),
            impact[1] ? React.createElement('span', { key: 's' }, impact[1]) : null,
          ])
        : null,
    ],
  );
}

export default PlaybookRow;
