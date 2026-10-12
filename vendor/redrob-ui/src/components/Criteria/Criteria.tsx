import * as React from 'react';
import { cx } from '../../internal/cx';
import { WEIGHT_LABEL } from '../../internal/evidence';
import { icons } from '../../icons';
import { Button } from '../Button/Button';
import { SectionMark } from '../SectionMark/SectionMark';

export interface CriteriaItem {
  id?: string | number;
  label?: React.ReactNode;
  detail?: React.ReactNode;
  weight?: 'required' | 'preferred' | 'excluded';
  /** `inferred` when the agent read this into the request rather than being told. */
  source?: 'stated' | 'inferred';
  /** Struck through: considered and dropped. */
  off?: boolean;
}

export interface CriteriaProps {
  items?: CriteriaItem[];
  title?: React.ReactNode;
  /** The person's request, quoted, so the conditions can be checked against it. */
  request?: string;
  note?: React.ReactNode;
  addLabel?: React.ReactNode;
  className?: string;
  onAdd?: () => void;
  onRemove?: (item: CriteriaItem, index: number) => void;
}

/**
 * What the agent is looking for, before it starts looking.
 *
 * Inferred conditions are marked "My assumption" with the reason in the title. That marking is the component's
 * point: an agent that quietly adds a condition of its own is filtering on a rule nobody agreed to, and the
 * person cannot correct what they cannot see.
 *
 * The request is quoted above the list, so the conditions can be read against the words that produced them.
 */
export function Criteria(props: CriteriaProps): React.ReactElement {
  const items = props.items || [];

  return React.createElement('div', { className: cx('rr-criteria', props.className) }, [
    React.createElement(SectionMark, { key: 'm', label: props.title || 'What I am looking for' }),
    props.request
      ? React.createElement('p', { className: 'rr-criteria__request', key: 'q' }, `“${props.request}”`)
      : null,
    React.createElement(
      'ul',
      { className: 'rr-criteria__list', key: 'l' },
      items.map((it, i) => {
        const weight = it.weight || 'required';
        return React.createElement(
          'li',
          {
            className: cx(
              'rr-criteria__row',
              `rr-criteria__row--${weight}`,
              it.off && 'rr-criteria__row--off',
            ),
            key: it.id || i,
          },
          [
            React.createElement(
              'span',
              { className: cx('rr-criteria__weight', `rr-criteria__weight--${weight}`), key: 'w' },
              WEIGHT_LABEL[weight] || weight,
            ),
            React.createElement('span', { className: 'rr-criteria__body', key: 'b' }, [
              React.createElement('span', { className: 'rr-criteria__label', key: 'l' }, it.label),
              it.detail
                ? React.createElement('span', { className: 'rr-criteria__detail', key: 'd' }, it.detail)
                : null,
            ]),
            it.source === 'inferred'
              ? React.createElement(
                  'span',
                  {
                    className: 'rr-criteria__guess',
                    key: 'g',
                    title: 'You did not say this. I read it into the request.',
                  },
                  [
                    React.createElement(
                      'span',
                      { className: 'rr-criteria__guessIcon', key: 'i' },
                      icons.sparkle({ width: 13, height: 13 }),
                    ),
                    React.createElement('span', { key: 't' }, 'My assumption'),
                  ],
                )
              : null,
            props.onRemove
              ? React.createElement(
                  'button',
                  {
                    type: 'button',
                    className: 'rr-criteria__drop',
                    key: 'x',
                    'aria-label': 'Drop this condition',
                    onClick: () => props.onRemove && props.onRemove(it, i),
                  },
                  icons.close({ width: 14, height: 14 }),
                )
              : null,
          ],
        );
      }),
    ),
    props.onAdd || props.note
      ? React.createElement('div', { className: 'rr-criteria__foot', key: 'f' }, [
          props.note ? React.createElement('span', { className: 'rr-criteria__note', key: 'n' }, props.note) : null,
          props.onAdd
            ? React.createElement(
                Button,
                {
                  key: 'a',
                  size: 'sm',
                  variant: 'secondary',
                  iconLeft: icons.plus({ width: 14, height: 14 }),
                  onClick: props.onAdd,
                },
                props.addLabel || 'Add a condition',
              )
            : null,
        ])
      : null,
  ]);
}

export default Criteria;
