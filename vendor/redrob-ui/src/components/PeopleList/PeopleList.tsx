import * as React from 'react';
import { cx } from '../../internal/cx';

export interface Person {
  name?: React.ReactNode;
  title?: React.ReactNode;
  bio?: React.ReactNode;
  photo?: string;
  href?: string;
}

export interface PeopleListProps {
  people?: Person[];
  lang?: string;
  label?: string;
  className?: string;
}

/**
 * The people, with their titles.
 *
 * Photographs appear only when EVERY person has one. A mixed list gives the people without a photograph a visibly
 * lesser row, which is a decision about them made by whoever had the file to hand.
 *
 * The photographs carry an empty alt: the name is right beside them as text, so describing the picture would make a
 * screen reader read each person twice.
 */
export function PeopleList(props: PeopleListProps): React.ReactElement {
  const people = props.people || [];
  const photos = people.length > 0 && people.every((p) => p.photo);

  return React.createElement(
    'ul',
    {
      className: cx('rr-people', photos && 'rr-people--photos', props.className),
      lang: props.lang || 'en',
      'aria-label': props.label || 'Leadership',
    },
    people.map((p, i) =>
      React.createElement('li', { key: (p.name as string) || i, className: 'rr-people__item' }, [
        photos
          ? React.createElement('img', {
              key: 'ph',
              className: 'rr-people__photo',
              src: p.photo,
              alt: '',
              loading: 'lazy',
              decoding: 'async',
            })
          : null,
        React.createElement(
          'p',
          { className: 'rr-people__name', key: 'n' },
          p.href ? React.createElement('a', { href: p.href }, p.name) : p.name,
        ),
        p.title ? React.createElement('p', { className: 'rr-people__title', key: 't' }, p.title) : null,
        p.bio ? React.createElement('p', { className: 'rr-people__bio', key: 'b' }, p.bio) : null,
      ]),
    ),
  );
}

export default PeopleList;
