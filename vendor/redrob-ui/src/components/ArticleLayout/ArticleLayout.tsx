import * as React from 'react';
import { cx } from '../../internal/cx';
import { PubAuthor, PubFinding, PubPaper, PubStory } from '../../internal/publishing';
import { SectionMark } from '../SectionMark/SectionMark';
import { icons } from '../../icons';

export interface ArticleTocEntry {
  id?: string;
  label?: React.ReactNode;
}

export interface ArticleTag {
  label?: React.ReactNode;
  href?: string;
}

export interface ArticleLayoutProps {
  /** The same object the index lists take. Anything passed directly wins over it. */
  story?: PubStory;
  title?: React.ReactNode;
  /** `'h2'` where the page already has an `h1` above, such as a `StoryHeader` claim. */
  titleAs?: string;
  kicker?: string;
  standfirst?: React.ReactNode;
  authors?: Array<PubAuthor | string>;
  /** A single author, as a convenience. */
  author?: string;
  avatar?: string | React.ReactNode;
  date?: string;
  dateTime?: string;
  reading?: string;
  /** The headline number, shown above the byline. */
  finding?: PubFinding;
  /** Where the method and data are. */
  paper?: PubPaper;
  contents?: ArticleTocEntry[];
  contentsLabel?: string;
  tags?: ArticleTag[];
  className?: string;
  children?: React.ReactNode;
}

/**
 * A published piece: kicker, title, standfirst, byline, contents, body, tags.
 *
 * `story` takes the same object `PostList` renders, so a post travels from the index to its own page without being
 * reshaped. Direct props win, which is what lets one page override a single field without copying the whole story.
 *
 * Every author is named. There is no "et al." and no overflow count, because authorship is credit and a truncated
 * list decides for the reader whose name was worth the space. With roles present, people are separated by a middot
 * rather than "and" - "A, Researcher and B, Researcher" reads as three people.
 *
 * `titleAs` exists so this can sit under a page that already owns the `h1`. Two `h1`s on a page break the outline
 * for anybody navigating by headings.
 *
 * The `paper` link is not decoration: a piece that states a finding has to say where the method and the data are, or
 * the number cannot be checked.
 */
export function ArticleLayout(props: ArticleLayoutProps): React.ReactElement {
  const st = props.story || ({} as PubStory);
  const toc = props.contents || [];
  const kicker = props.kicker || st.kind;
  const standfirst = props.standfirst || st.summary;

  const authors = (
    ([] as Array<PubAuthor | string>).concat(
      props.authors || (st.authors as Array<PubAuthor | string>) ||
        (props.author ? [{ name: props.author, avatar: props.avatar }] : []),
    ) as Array<PubAuthor | string>
  )
    .map((a) => (typeof a === 'string' ? { name: a } : a))
    .filter((a): a is PubAuthor => !!a && !!a.name);

  const date = props.date || st.date;
  const dateTime = props.dateTime || st.dateTime;
  const reading = props.reading || st.reading;
  const f = props.finding || st.finding;
  const paper = props.paper || st.paper;
  const faces = authors.filter((a) => a.avatar);

  function face(a: PubAuthor, i: number): React.ReactElement {
    return React.createElement(
      'span',
      { className: 'rr-article__avatar', key: `a${i}` },
      typeof a.avatar === 'string'
        ? React.createElement('img', { src: a.avatar, alt: '', width: 28, height: 28 })
        : a.avatar,
    );
  }

  function nameOf(a: PubAuthor, i: number): React.ReactElement {
    const n = a.href
      ? React.createElement('a', { href: a.href, className: 'rr-article__author', key: 'n' }, a.name)
      : React.createElement('span', { className: 'rr-article__author', key: 'n' }, a.name);
    return React.createElement('span', { key: `p${i}`, className: 'rr-article__person' }, [
      n,
      a.role ? React.createElement('span', { className: 'rr-article__role', key: 'r' }, `, ${a.role}`) : null,
    ]);
  }

  const withRoles = authors.some((a) => a.role);
  const names: React.ReactNode[] = [];
  authors.forEach((a, i) => {
    if (i > 0) names.push(withRoles ? ' · ' : i === authors.length - 1 ? ' and ' : ', ');
    names.push(nameOf(a, i));
  });

  return React.createElement('article', { className: cx('rr-article', props.className) }, [
    React.createElement('header', { className: 'rr-article__head', key: 'h' }, [
      kicker ? React.createElement(SectionMark, { key: 'k', label: kicker }) : null,
      React.createElement(
        props.titleAs || 'h1',
        { className: 'rr-article__title', key: 't' },
        props.title || st.title,
      ),
      standfirst
        ? React.createElement('p', { className: 'rr-article__standfirst', key: 's' }, standfirst)
        : null,
      f
        ? React.createElement('p', { className: 'rr-article__finding', key: 'f' }, [
            React.createElement('span', { className: 'rr-article__findingValue', key: 'v' }, f.value),
            React.createElement('span', { className: 'rr-article__findingLabel', key: 'l' }, [
              f.label,
              f.period
                ? React.createElement(
                    'span',
                    { key: 'p', className: 'rr-article__findingPeriod' },
                    `, ${f.period}`,
                  )
                : null,
            ]),
          ])
        : null,
      React.createElement('div', { className: 'rr-article__meta', key: 'm' }, [
        authors.length
          ? React.createElement('span', { className: 'rr-article__by', key: 'b' }, [
              faces.length
                ? React.createElement(
                    'span',
                    { className: 'rr-article__avatars', key: 'fa', 'aria-hidden': 'true' },
                    faces.map(face),
                  )
                : null,
              React.createElement('span', { className: 'rr-article__names', key: 'n' }, names),
            ])
          : null,
        date ? React.createElement('time', { className: 'rr-article__date', key: 'd', dateTime }, date) : null,
        reading ? React.createElement('span', { className: 'rr-article__reading', key: 'r' }, reading) : null,
        paper
          ? React.createElement('a', { className: 'rr-article__paper', href: paper.href, key: 'pp' }, [
              React.createElement(
                'span',
                { key: 'i', 'aria-hidden': 'true', className: 'rr-article__paperIcon' },
                icons.fileText({ width: 14, height: 14 }),
              ),
              paper.label || 'Method and data',
            ])
          : null,
      ]),
    ]),
    toc.length
      ? React.createElement(
          'nav',
          { className: 'rr-article__toc', key: 'c', 'aria-label': props.contentsLabel || 'On this page' },
          [
            React.createElement(
              'span',
              { className: 'rr-article__tocTitle', key: 't' },
              props.contentsLabel || 'On this page',
            ),
            React.createElement(
              'ol',
              { className: 'rr-article__tocList', key: 'l' },
              toc.map((t, i) =>
                React.createElement('li', { key: i }, React.createElement('a', { href: `#${t.id}` }, t.label)),
              ),
            ),
          ],
        )
      : null,
    React.createElement('div', { className: 'rr-article__body', key: 'b' }, props.children),
    props.tags && props.tags.length
      ? React.createElement(
          'div',
          { className: 'rr-article__tags', key: 't' },
          props.tags.map((t, i) =>
            React.createElement('a', { key: i, className: 'rr-article__tag', href: t.href }, t.label),
          ),
        )
      : null,
  ]);
}

export default ArticleLayout;
