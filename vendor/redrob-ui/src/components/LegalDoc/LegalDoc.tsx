import * as React from 'react';
import { cx } from '../../internal/cx';

export interface LegalSection {
  /** The anchor. The contents list links to it. */
  id?: string;
  title?: React.ReactNode;
  body?: React.ReactNode;
}

export interface LegalRevision {
  date?: React.ReactNode;
  /** What changed, in plain words. */
  what?: React.ReactNode;
}

export interface LegalDocProps {
  title?: React.ReactNode;
  /** The legal entity bound by this. */
  entity?: React.ReactNode;
  updated?: React.ReactNode;
  updatedLabel?: string;
  effective?: React.ReactNode;
  effectiveLabel?: string;
  /** The document in a few sentences, above the document. */
  summary?: React.ReactNode;
  sections?: LegalSection[];
  contentsLabel?: string;
  /** Past revisions, newest first. */
  history?: LegalRevision[];
  historyLabel?: React.ReactNode;
  contact?: React.ReactNode;
  className?: string;
}

/**
 * A policy or terms document: summary, numbered sections, and what has changed.
 *
 * `history` is the reason this component exists rather than a page of prose. A policy that silently changes is one
 * somebody agreed to under different terms, so the revisions are part of the document and not a changelog somewhere
 * else. "Last changed" and "In force from" are separate fields for the same reason: the gap between them is when a
 * reader can still object.
 *
 * The default labels are plain words - "Last changed", "In force from", "What has changed" - because a document
 * nobody can read has consent in name only.
 *
 * Section numbers are rendered, not typed into the titles, so they cannot drift out of order.
 */
export function LegalDoc(props: LegalDocProps): React.ReactElement {
  const sections = props.sections || [];

  return React.createElement('div', { className: cx('rr-legal', props.className) }, [
    React.createElement('header', { className: 'rr-legal__head', key: 'h' }, [
      React.createElement('h1', { className: 'rr-legal__title', key: 't' }, props.title),
      React.createElement('p', { className: 'rr-legal__meta', key: 'm' }, [
        props.entity ? React.createElement('span', { className: 'rr-legal__entity', key: 'e' }, props.entity) : null,
        props.updated
          ? React.createElement('span', { key: 'u' }, `${props.updatedLabel || 'Last changed'} ${props.updated}`)
          : null,
        props.effective
          ? React.createElement(
              'span',
              { key: 'f' },
              `${props.effectiveLabel || 'In force from'} ${props.effective}`,
            )
          : null,
      ]),
      props.summary
        ? React.createElement('p', { className: 'rr-legal__summary', key: 's' }, props.summary)
        : null,
    ]),
    sections.length
      ? React.createElement(
          'nav',
          { className: 'rr-legal__toc', key: 'n', 'aria-label': props.contentsLabel || 'Contents' },
          React.createElement(
            'ol',
            { className: 'rr-legal__tocList' },
            sections.map((s, i) =>
              React.createElement('li', { key: i }, React.createElement('a', { href: `#${s.id}` }, s.title)),
            ),
          ),
        )
      : null,
    React.createElement(
      'div',
      { className: 'rr-legal__body', key: 'b' },
      sections.map((s, i) =>
        React.createElement('section', { key: s.id || i, id: s.id, className: 'rr-legal__section' }, [
          React.createElement('h2', { className: 'rr-legal__h', key: 'h' }, [
            React.createElement('span', { className: 'rr-legal__n', key: 'n' }, `${i + 1}.`),
            React.createElement('span', { key: 't' }, s.title),
          ]),
          React.createElement('div', { className: 'rr-legal__text', key: 'x' }, s.body),
        ]),
      ),
    ),
    props.history && props.history.length
      ? React.createElement('section', { className: 'rr-legal__history', key: 'v' }, [
          React.createElement(
            'h2',
            { className: 'rr-legal__h', key: 'h' },
            props.historyLabel || 'What has changed',
          ),
          React.createElement(
            'ul',
            { className: 'rr-legal__historyList', key: 'l' },
            props.history.map((v, i) =>
              React.createElement('li', { key: i }, [
                React.createElement('span', { className: 'rr-legal__hDate', key: 'd' }, v.date),
                React.createElement('span', { key: 'w' }, v.what),
              ]),
            ),
          ),
        ])
      : null,
    props.contact ? React.createElement('p', { className: 'rr-legal__contact', key: 'c' }, props.contact) : null,
  ]);
}

export default LegalDoc;
