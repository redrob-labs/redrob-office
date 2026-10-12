import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { PubImage, pubPicture } from '../../internal/pubPicture';
import { icons } from '../../icons';

export interface NewsItem {
  id?: string | number;
  /** Press release, blog, paper. */
  kind?: React.ReactNode;
  date?: React.ReactNode;
  title?: React.ReactNode;
  summary?: React.ReactNode;
  href?: string;
  image?: PubImage;
}

export interface NewsSectionProps {
  /** The lead story. Its image, when present, sets the two-column layout. */
  lead?: NewsItem;
  /** At most three are rendered. */
  items?: NewsItem[];
  title?: React.ReactNode;
  href?: string;
  allLabel?: React.ReactNode;
  lang?: string;
  id?: string;
  className?: string;
}

/**
 * @deprecated Use PostList with `variant="section"`. Kept for 1.x.
 *
 * The newest few stories: one lead and up to three more.
 *
 * Three is a cap, and the list is sliced. A home page news block that grows with the feed pushes everything below it
 * off the page, and the point of this section is a glance rather than an archive.
 *
 * The lead's picture goes through `pubPicture`, which labels a generated image unless told otherwise, and links the
 * frame with `aria-hidden` so the headline stays the single announced link.
 */
export function NewsSection(props: NewsSectionProps): React.ReactElement {
  const lead = props.lead;
  const items = (props.items || []).slice(0, 3);
  // The hook runs even when `id` is given, so the hook order does not depend on a prop.
  const autoHeadId = useStableId('rr-news-h');
  const headId = props.id ? `${props.id}-h` : autoHeadId;

  return React.createElement(
    'section',
    { className: cx('rr-news', props.className), lang: props.lang || 'en', 'aria-labelledby': headId },
    [
      React.createElement('div', { className: 'rr-news__head', key: 'h' }, [
        React.createElement('h2', { className: 'rr-news__title', id: headId, key: 't' }, props.title || 'News'),
        props.href
          ? React.createElement('a', { className: 'rr-news__all', href: props.href, key: 'a' }, [
              React.createElement('span', { key: 't' }, props.allLabel || 'All news'),
              React.createElement(
                'span',
                { key: 'i', className: 'rr-news__allIcon', 'aria-hidden': 'true' },
                icons.arrowRight({ width: 15, height: 15 }),
              ),
            ])
          : null,
      ]),
      React.createElement(
        'div',
        { className: cx('rr-news__body', !(lead && lead.image) && 'rr-news__body--text'), key: 'b' },
        [
          lead
            ? React.createElement('article', { className: 'rr-news__lead', key: 'l' }, [
                lead.image
                  ? pubPicture(lead.image, {
                      className: 'rr-news__figure',
                      key: 'f',
                      href: lead.href,
                      decorative: true,
                      sizes: '(min-width: 1180px) 680px, 100vw',
                    })
                  : null,
                React.createElement('div', { className: 'rr-news__leadText', key: 'x' }, [
                  React.createElement(
                    'p',
                    { className: 'rr-news__meta', key: 'm' },
                    [lead.kind, lead.date].filter(Boolean).join(' · '),
                  ),
                  React.createElement(
                    'h3',
                    { className: 'rr-news__leadTitle', key: 't' },
                    React.createElement('a', { href: lead.href }, lead.title),
                  ),
                  lead.summary
                    ? React.createElement('p', { className: 'rr-news__summary', key: 's' }, lead.summary)
                    : null,
                ]),
              ])
            : null,
          items.length
            ? React.createElement(
                'ol',
                { className: 'rr-news__list', key: 'r' },
                items.map((p, i) =>
                  React.createElement('li', { key: p.id || i, className: 'rr-news__item' }, [
                    React.createElement(
                      'p',
                      { className: 'rr-news__meta', key: 'm' },
                      [p.kind, p.date].filter(Boolean).join(' · '),
                    ),
                    React.createElement(
                      'h3',
                      { className: 'rr-news__itemTitle', key: 't' },
                      React.createElement('a', { href: p.href }, p.title),
                    ),
                  ]),
                ),
              )
            : null,
        ],
      ),
    ],
  );
}

export default NewsSection;
