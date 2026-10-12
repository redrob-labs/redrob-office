import * as React from 'react';
import { cx } from '../../internal/cx';

export interface SectionMarkProps {
  /** The label. An array is joined with a middle dot, for a breadcrumb-ish pair like section · date. */
  label?: React.ReactNode | React.ReactNode[];
  /** `heading` makes it a real heading for assistive tech. Use it when it opens a section. */
  as?: 'div' | 'heading';
  /** Heading level when `as="heading"`. Defaults to 2. */
  level?: number;
  /** `muted` dims the tick where the mark is one of many in a dense list. */
  tone?: 'default' | 'muted';
  /** Right-aligned aside: a count, a date. Never a second label. */
  trailing?: React.ReactNode;
  className?: string;
}

/**
 * A 40 degree tick and a short label: the system's section opener, and one of its marks of authorship.
 *
 * Not an eyebrow. Never all-caps, and never used to label a control - it opens a stretch of content.
 *
 * `as="heading"` exists because the mark is often the only thing announcing a section. Without it the
 * element is a `div` and a screen reader walking the headings skips the section entirely; with it the
 * mark carries an explicit level instead of guessing from the visual size.
 */
export function SectionMark(props: SectionMarkProps): React.ReactElement {
  return React.createElement(
    'div',
    {
      className: cx('rr-section-mark', props.className),
      role: props.as === 'heading' ? 'heading' : undefined,
      'aria-level': props.as === 'heading' ? props.level || 2 : undefined,
    },
    [
      React.createElement('span', {
        className: cx('rr-tick', props.tone === 'muted' && 'rr-tick--muted'),
        key: 't',
        'aria-hidden': 'true',
      }),
      React.createElement(
        'span',
        { key: 'l' },
        Array.isArray(props.label) ? props.label.join(' \u00b7 ') : props.label,
      ),
      props.trailing
        ? React.createElement(
            'span',
            { key: 'r', style: { flex: 'none', color: 'var(--ink-muted)' } },
            props.trailing,
          )
        : null,
    ],
  );
}

export default SectionMark;
