import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { Loader } from '../Loader/Loader';

export interface AnswerReceiptItem {
  id: string;
  label?: React.ReactNode;
  /** A second line: the model that answered, the count of sources. */
  sub?: React.ReactNode;
  icon?: React.ReactNode;
  tone?: string;
  /** Still working. Renders a loader instead of a button. */
  busy?: boolean;
  /** Expands under the row. Without it the item is not expandable. */
  detail?: React.ReactNode;
}

export interface AnswerReceiptProps {
  items?: Array<AnswerReceiptItem | false | null | undefined>;
  className?: string;
}

/**
 * What happened to produce this answer: which model, what was checked, what was found.
 *
 * It sits under the answer, after Send, because every one of these checks runs after Send. Showing them
 * beforehand would promise work that has not happened.
 *
 * Only an item with a `detail` is expandable, and `aria-expanded` is only claimed for those - a row that
 * announces itself as expandable and then does nothing is worse than a plain row.
 */
export function AnswerReceipt(props: AnswerReceiptProps): React.ReactElement {
  const items = (props.items || []).filter(Boolean) as AnswerReceiptItem[];
  const [openId, setOpenId] = React.useState<string | null>(null);
  const cur = items.filter((x) => x.id === openId)[0];
  const did = useStableId('rr-receipt');

  return React.createElement('div', { className: cx('rr-receipt', props.className) }, [
    React.createElement(
      'div',
      { key: 'r', className: 'rr-receipt__row' },
      items.map((x) => {
        if (x.busy) {
          return React.createElement('span', { key: x.id, className: 'rr-receipt__busy' }, [
            React.createElement(Loader, { key: 'l', size: 'sm', label: x.label as string }),
            React.createElement('span', { key: 't' }, x.label),
          ]);
        }
        return React.createElement(
          'button',
          {
            key: x.id,
            type: 'button',
            className: cx('rr-receipt__item', `rr-receipt__item--${x.tone || 'plain'}`),
            'aria-expanded': String(openId === x.id),
            'aria-controls': x.detail ? did : undefined,
            onClick: () => {
              if (x.detail) setOpenId(openId === x.id ? null : x.id);
            },
          },
          [
            x.icon
              ? React.createElement(
                  'span',
                  { key: 'i', className: 'rr-receipt__icon', 'aria-hidden': 'true' },
                  x.icon,
                )
              : null,
            React.createElement('span', { key: 'l', className: 'rr-receipt__label' }, x.label),
            x.sub ? React.createElement('span', { key: 's', className: 'rr-receipt__sub' }, x.sub) : null,
          ],
        );
      }),
    ),
    cur && cur.detail
      ? React.createElement(
          'div',
          { key: 'd', id: did, className: 'rr-receipt__detail', role: 'region', 'aria-label': cur.label },
          cur.detail,
        )
      : null,
  ]);
}

export default AnswerReceipt;
