import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface HeroFilmSpec {
  src?: string;
  webm?: string;
  poster?: string;
  /** Provenance, shown beside the control. Defaults to "AI-generated". */
  label?: React.ReactNode;
  playLabel?: string;
  pauseLabel?: string;
}

export interface HeroProps {
  /** A `Mark`, above the statement. */
  mark?: React.ReactNode;
  /** A supporting paragraph under the statement. */
  lede?: React.ReactNode;
  /** The one action. */
  action?: React.ReactNode;
  /** The second path. Rendered as a link, never a second button. */
  secondary?: React.ReactNode;
  secondaryHref?: string;
  foot?: React.ReactNode;
  /** A picture or figure beside the statement. Ignored when `film` is set. */
  media?: React.ReactNode;
  /** A background film. Autoplay is withheld on reduced motion, save-data and small screens. */
  film?: HeroFilmSpec;
  className?: string;
  /** The statement: a `Display` on the homepage, a `Statement` elsewhere. */
  children?: React.ReactNode;
}

function HeroFilm(props: { film?: HeroFilmSpec }): React.ReactElement[] {
  const film = props.film || {};
  const ref = React.useRef<HTMLVideoElement | null>(null);
  const [playing, setPlaying] = React.useState(false);

  React.useEffect(() => {
    const v = ref.current;
    if (!v || typeof window === 'undefined') return;
    const mq = (q: string): boolean => !!(window.matchMedia && window.matchMedia(q).matches);
    const save = (navigator as { connection?: { saveData?: boolean } }).connection?.saveData;
    // Three refusals, all deliberate: motion sensitivity, a metered connection, and a phone where the film would
    // cost somebody's data to decorate a page.
    if (mq('(prefers-reduced-motion: reduce)') || save || mq('(max-width: 767px)')) return;
    const p = v.play();
    if (p && p.then) p.then(() => setPlaying(true)).catch(() => {});
  }, []);

  function toggle(): void {
    const v = ref.current;
    if (!v) return;
    if (v.paused) {
      const p = v.play();
      if (p && p.then) p.then(() => setPlaying(true)).catch(() => {});
    } else {
      v.pause();
      setPlaying(false);
    }
  }

  return [
    React.createElement(
      'div',
      { className: 'rr-hero__film', key: 'film', 'aria-hidden': 'true' },
      React.createElement(
        'video',
        {
          ref,
          muted: true,
          loop: true,
          playsInline: true,
          preload: 'none',
          poster: film.poster,
          disablePictureInPicture: true,
        },
        [
          film.webm ? React.createElement('source', { key: 'w', src: film.webm, type: 'video/webm' }) : null,
          film.src ? React.createElement('source', { key: 'm', src: film.src, type: 'video/mp4' }) : null,
        ],
      ),
    ),
    React.createElement('div', { className: 'rr-hero__filmbar', key: 'bar' }, [
      React.createElement('span', { className: 'rr-hero__filmcredit', key: 'c' }, film.label || 'AI-generated'),
      React.createElement(
        'button',
        {
          type: 'button',
          className: 'rr-hero__filmtoggle',
          key: 't',
          onClick: toggle,
          'aria-label': playing ? film.pauseLabel || 'Pause the film' : film.playLabel || 'Play the film',
        },
        // An icon, not a word: the control is for the few who need it and must not compete with the call to
        // action. The hit area stays 44px via ::before.
        React.createElement(
          'svg',
          { width: 10, height: 10, viewBox: '0 0 10 10', 'aria-hidden': 'true', focusable: 'false' },
          playing
            ? [
                React.createElement('rect', {
                  key: 'a',
                  x: 1.5,
                  y: 1,
                  width: 2.2,
                  height: 8,
                  rx: 0.6,
                  fill: 'currentColor',
                }),
                React.createElement('rect', {
                  key: 'b',
                  x: 6.3,
                  y: 1,
                  width: 2.2,
                  height: 8,
                  rx: 0.6,
                  fill: 'currentColor',
                }),
              ]
            : React.createElement('path', {
                d: 'M2.5 1.2v7.6a.5.5 0 0 0 .76.43l6.1-3.8a.5.5 0 0 0 0-.86L3.26.77A.5.5 0 0 0 2.5 1.2z',
                fill: 'currentColor',
              }),
        ),
      ),
    ]),
  ];
}

/**
 * The top of a page: one statement, one action, one second path.
 *
 * No alignment prop, by design. The statement sits on a wash, in nothing boxed, from the left rail - and
 * `50-not-generated.md` names per-section alignment controls as the tell of a generated layout.
 *
 * The second path is a link, never a second button. Two equal buttons side by side is the generated hero's own
 * signature, and the API refuses to produce it.
 *
 * The film never autoplays under reduced motion, on a metered connection, or on a phone. The pause control is an
 * icon with a 44px hit area, so it is reachable without competing with the call to action.
 */
export function Hero(props: HeroProps): React.ReactElement {
  const filmParts = props.film ? React.createElement(HeroFilm, { film: props.film, key: 'fp' }) : null;

  return React.createElement(
    'div',
    {
      className: cx(
        'rr-hero',
        !!props.media && !props.film && 'rr-hero--media',
        !!props.film && 'rr-hero--film',
        props.className,
      ),
    },
    [
      React.createElement('div', { className: 'rr-hero__body', key: 'b' }, [
        props.mark ? React.createElement('div', { className: 'rr-hero__mark', key: 'm' }, props.mark) : null,
        React.createElement('div', { className: 'rr-hero__statement', key: 's' }, props.children),
        props.lede ? React.createElement('p', { className: 'rr-hero__lede', key: 'l' }, props.lede) : null,
        props.action || props.secondary
          ? React.createElement('div', { className: 'rr-hero__actions', key: 'a' }, [
              props.action ? React.createElement('span', { key: 'p' }, props.action) : null,
              props.secondary
                ? React.createElement(
                    'a',
                    { key: 's', className: 'rr-hero__second', href: props.secondaryHref || '#' },
                    [
                      React.createElement('span', { key: 't' }, props.secondary),
                      React.createElement(
                        'span',
                        { key: 'i', className: 'rr-hero__secondIcon' },
                        icons.arrowRight({ width: 15, height: 15 }),
                      ),
                    ],
                  )
                : null,
            ])
          : null,
        props.foot ? React.createElement('p', { className: 'rr-hero__foot', key: 'f' }, props.foot) : null,
        filmParts,
      ]),
      props.media && !props.film
        ? React.createElement('div', { className: 'rr-hero__media', key: 'm' }, props.media)
        : null,
    ],
  );
}

export default Hero;
