import * as React from 'react';
import { cx } from './cx';
import { PubImage, pubPicture } from './pubPicture';
import { icons } from '../icons';

export interface PubAuthor {
  name?: string;
  /** A URL, or an `Avatar` element. */
  avatar?: string | React.ReactNode;
  role?: string;
  href?: string;
}

export interface PubFinding {
  value?: React.ReactNode;
  label?: React.ReactNode;
  /** What the figure is measured over. */
  period?: React.ReactNode;
}

export interface PubPaper {
  href?: string;
  label?: React.ReactNode;
}

/**
 * One published item. The SAME object the index lists and the article page take, so a post travels from
 * `PostList` to `ArticleLayout` unchanged rather than being reshaped in between.
 */
export interface PubStory {
  id?: string | number;
  /** Press release, blog, paper. */
  kind?: string;
  title?: React.ReactNode;
  summary?: React.ReactNode;
  href?: string;
  date?: string;
  /** Machine-readable date. Enables a real `time` element. */
  dateTime?: string;
  reading?: string;
  authors?: Array<PubAuthor | string> | PubAuthor | string;
  image?: PubImage;
  /** The headline number this piece is about. */
  finding?: PubFinding;
  /** Where the method and the data are. */
  paper?: PubPaper;
}

/**
 * Names in a sentence: "A", "A and B", "A, B and C".
 *
 * Every author is named. There is no "et al." and no cut-off, because authorship is credit, and a list that
 * truncates decides for the reader whose name was worth the space.
 */
export function pubAuthors(a?: Array<PubAuthor | string> | PubAuthor | string): string | null {
  if (!a) return null;
  const names = ([] as Array<PubAuthor | string>)
    .concat(a)
    .map((x) => (typeof x === 'string' ? x : x && x.name))
    .filter(Boolean) as string[];
  if (!names.length) return null;
  return names.length === 1
    ? names[0]
    : names.length === 2
      ? `${names[0]} and ${names[1]}`
      : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;
}

/** The year a story belongs to, taken from its machine date first. */
export function pubYear(p: PubStory): string {
  const m = String(p.dateTime || p.date || '').match(/(\d{4})/);
  return m ? m[1] : '';
}

export interface PubItemProps {
  item: PubStory;
  /** The first item on an index: bigger, and the only one allowed a picture. */
  lead?: boolean;
  /** The heading level for this position in the page's outline. */
  heading?: string;
}

/**
 * A story as it appears in a list.
 *
 * The heading level is a prop rather than a fixed `h2`, because the same item appears at different depths - under a
 * year heading it must be an `h3`. A list that hard-codes its level silently breaks the page outline for anybody
 * navigating by headings.
 *
 * A picture is rendered for the lead only. Every item having one turns an index into a wall of thumbnails, and the
 * lead is the only position where the picture carries a decision about what matters most.
 *
 * With a machine date the meta line becomes a real `time` element; without one it stays plain text rather than
 * inventing a date format.
 */
export function PubItem(props: PubItemProps): React.ReactElement {
  const p = props.item;
  const lead = props.lead;
  const H = props.heading || 'h2';
  const meta = [p.kind, p.date, p.reading].filter(Boolean).join(' · ');
  const by = pubAuthors(p.authors);
  const f = p.finding;

  return React.createElement(
    'article',
    { className: cx('rr-pub', lead && 'rr-pub--lead', !!p.image && lead && 'rr-pub--media') },
    [
      lead && p.image
        ? pubPicture(p.image, {
            className: 'rr-pub__media',
            key: 'img',
            decorative: true,
            sizes: '(min-width: 1180px) 560px, 100vw',
          })
        : null,
      React.createElement('div', { className: 'rr-pub__body', key: 'b' }, [
        meta
          ? React.createElement(
              'p',
              { className: 'rr-pub__meta', key: 'm' },
              p.dateTime && p.date
                ? [
                    p.kind ? `${p.kind} · ` : '',
                    React.createElement('time', { key: 't', dateTime: p.dateTime }, p.date),
                    p.reading ? ` · ${p.reading}` : '',
                  ]
                : meta,
            )
          : null,
        React.createElement(
          H,
          { className: 'rr-pub__title', key: 't' },
          React.createElement('a', { className: 'rr-pub__link', href: p.href }, p.title),
        ),
        p.summary ? React.createElement('p', { className: 'rr-pub__summary', key: 's' }, p.summary) : null,
        f
          ? React.createElement('p', { className: 'rr-pub__finding', key: 'f' }, [
              React.createElement('span', { className: 'rr-pub__findingValue', key: 'v' }, f.value),
              React.createElement('span', { className: 'rr-pub__findingLabel', key: 'l' }, [
                f.label,
                f.period
                  ? React.createElement(
                      'span',
                      { key: 'p', className: 'rr-pub__findingPeriod' },
                      `, ${f.period}`,
                    )
                  : null,
              ]),
            ])
          : null,
        by || p.paper
          ? React.createElement('p', { className: 'rr-pub__foot', key: 'ft' }, [
              by ? React.createElement('span', { className: 'rr-pub__by', key: 'by' }, by) : null,
              p.paper
                ? React.createElement(
                    'a',
                    { className: 'rr-pub__paper', href: p.paper.href, key: 'pp' },
                    [
                      React.createElement(
                        'span',
                        { key: 'i', 'aria-hidden': 'true', className: 'rr-pub__paperIcon' },
                        icons.fileText({ width: 14, height: 14 }),
                      ),
                      p.paper.label || 'Method and data',
                    ],
                  )
                : null,
            ])
          : null,
      ]),
    ],
  );
}
