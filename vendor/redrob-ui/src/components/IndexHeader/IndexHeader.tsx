import * as React from 'react';
import { cx } from '../../internal/cx';
import { PubImage, pubPicture } from '../../internal/pubPicture';

export interface IndexTopic {
  label?: React.ReactNode;
  href?: string;
  /** This is the topic being shown. */
  current?: boolean;
}

export interface IndexHeaderProps {
  title?: React.ReactNode;
  lede?: React.ReactNode;
  topics?: IndexTopic[];
  topicsLabel?: string;
  /** Loaded eagerly - it is the top of the page. */
  image?: PubImage;
  lang?: string;
  className?: string;
}

/**
 * The top of an index: what this collection is, and how to narrow it.
 *
 * The current topic carries `aria-current="page"` as well as its class, so somebody using a screen reader learns
 * which filter is active. A highlight that exists only in colour tells them nothing.
 *
 * The image is eager here, unlike everywhere else in the system: it is the first thing on the page, so lazy loading
 * would only delay what the reader is already looking at.
 */
export function IndexHeader(props: IndexHeaderProps): React.ReactElement {
  const topics = props.topics || [];

  return React.createElement(
    'header',
    { className: cx('rr-indexhead', props.className), lang: props.lang || 'en' },
    [
      React.createElement('div', { className: 'rr-indexhead__text', key: 't' }, [
        React.createElement('h1', { className: 'rr-indexhead__title', key: 'h' }, props.title),
        props.lede ? React.createElement('p', { className: 'rr-indexhead__lede', key: 'l' }, props.lede) : null,
      ]),
      topics.length
        ? React.createElement(
            'nav',
            {
              className: 'rr-indexhead__topics',
              key: 'n',
              'aria-label': props.topicsLabel || 'Topics',
            },
            React.createElement(
              'ul',
              null,
              topics.map((t, i) =>
                React.createElement(
                  'li',
                  { key: (t.label as string) || i },
                  React.createElement(
                    'a',
                    {
                      href: t.href,
                      'aria-current': t.current ? 'page' : undefined,
                      className: cx('rr-indexhead__topic', t.current && 'is-current'),
                    },
                    t.label,
                  ),
                ),
              ),
            ),
          )
        : null,
      props.image
        ? pubPicture(props.image, {
            className: 'rr-indexhead__figure',
            key: 'f',
            eager: true,
            sizes: '(min-width: 1180px) 1180px, 100vw',
          })
        : null,
    ],
  );
}

export default IndexHeader;
