import * as React from 'react';
import { cx } from '../../internal/cx';
import { PRIVACY_LEVELS, PrivacyLevel, PrivacyLevels } from '../../internal/safeguards';
import { icons } from '../../icons';
import { ProtectionStatus } from '../ProtectionStatus/ProtectionStatus';

export interface PrivacyProtectionProps {
  /** `off` when the check is not running for what this person sends, for whatever reason the product has. */
  state?: 'on' | 'off';
  level?: string;
  levels?: PrivacyLevel[];
  /**
   * What is running, beside the live dot. Default "Running". Name the place when the product knows it ("Running
   * on this laptop"); the default does not, because the same panel ships where the check runs on a server.
   */
  running?: string;
  summary?: React.ReactNode;
  /** `false` hides the explanation. */
  lede?: React.ReactNode | false;
  /** `false` hides the status card. */
  card?: boolean;
  /** `false` hides the level list. */
  showLevels?: boolean;
  /** What it caught last, and when. */
  last?: React.ReactNode;
  onLabel?: string;
  /** Default "Privacy protection is off". */
  offTitle?: React.ReactNode;
  /**
   * Default "What you send goes to the AI as written." Say why it is off and where it would work, when the product
   * knows ("It runs on your laptop, so it only works in the desktop app."); the default cannot know, so it says
   * only the consequence.
   */
  offText?: React.ReactNode;
  foot?: React.ReactNode;
  className?: string;
}

/**
 * Whether the privacy check is running, at what level, and what it does.
 *
 * The `off` state is the important one. Where the check is not running, this says so in plain words: what you
 * send goes to the AI as written. A privacy panel that renders the same everywhere would be telling people they
 * are protected where they are not, which is worse than having no panel.
 *
 * The defaults for `running`, `offTitle` and `offText` do not say where the check runs. Whether that is the
 * person's laptop or the product's server differs per product, and a default that names the wrong one is a
 * false privacy claim; a product that knows passes its own words.
 *
 * The explanation names where the work happens - a small model on the person's own laptop, swapping details for
 * placeholders before Send and putting the real ones back in the answer. "Your data is protected" is not a
 * claim anybody can check.
 */
export function PrivacyProtection(props: PrivacyProtectionProps): React.ReactElement {
  const levels = props.levels || PRIVACY_LEVELS;
  const lvl = levels.filter((l) => l.id === (props.level || 'high'))[0] || levels[1];

  if (props.state === 'off') {
    return React.createElement('div', { className: cx('rr-privacy', props.className) }, [
      React.createElement(
        ProtectionStatus,
        {
          key: 'c',
          tone: 'warn',
          icon: icons.shield({ width: 28, height: 28 }),
          title: props.offTitle || 'Privacy protection is off',
        },
        props.offText || 'What you send goes to the AI as written.',
      ),
      props.foot ? React.createElement('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null,
    ]);
  }

  return React.createElement('div', { className: cx('rr-privacy', props.className) }, [
    props.card !== false
      ? React.createElement(
          ProtectionStatus,
          {
            key: 'c',
            tone: 'safe',
            icon: icons.shieldCheck({ width: 28, height: 28 }),
            title: `${props.onLabel || 'Privacy protection is on'}: ${lvl.label}`,
            live: props.running || 'Running',
          },
          props.summary,
        )
      : null,
    props.lede !== false
      ? React.createElement(
          'p',
          { key: 'l', className: 'rr-panellede' },
          props.lede ||
            'A small privacy AI runs on your own laptop, not in the cloud. When you press Send, it reads the message first and swaps private details for placeholders, so the AI that answers never sees them. When the answer comes back, your laptop puts the real names back.',
        )
      : null,
    props.showLevels !== false
      ? React.createElement(PrivacyLevels, { key: 'v', levels, level: lvl.id })
      : null,
    props.last
      ? React.createElement('p', { key: 'x', className: 'rr-privacy__last' }, [
          React.createElement(
            'span',
            { key: 'i', 'aria-hidden': 'true' },
            icons.shieldCheck({ width: 14, height: 14 }),
          ),
          React.createElement('span', { key: 't' }, props.last),
        ])
      : null,
    props.foot ? React.createElement('div', { key: 'f', className: 'rr-panelfoot' }, props.foot) : null,
  ]);
}

export default PrivacyProtection;
