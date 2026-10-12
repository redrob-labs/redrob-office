import * as React from 'react';
import { cx } from '../../internal/cx';
import { SEV_LABEL } from '../../internal/evidence';
import { icons } from '../../icons';

export interface FindingProps {
  severity?: 'high' | 'medium' | 'low' | 'note';
  severityLabel?: React.ReactNode;
  title?: React.ReactNode;
  /** Where in the material it is. A button when `onOpen` is given. */
  where?: React.ReactNode;
  detail?: React.ReactNode;
  /** An `Evidence` block: what this rests on. */
  evidence?: React.ReactNode;
  /** What to do about it. */
  suggestion?: React.ReactNode;
  suggestionLabel?: React.ReactNode;
  state?: 'open' | 'accepted' | 'dismissed';
  actions?: React.ReactNode;
  className?: string;
  onOpen?: () => void;
}

/**
 * One thing found in the material, how serious it is, and what to do.
 *
 * The severity words are plain - "Serious", "Worth a look", "Minor" - rather than a numeric scale. A finding marked
 * P2 tells a reader nothing until they learn somebody else's scale.
 *
 * A settled finding stays visible and says whether it was accepted or set aside. Removing it would lose the record
 * that somebody looked at it and decided.
 */
export function Finding(props: FindingProps): React.ReactElement {
  const sev = props.severity || 'medium';
  const state = props.state || 'open';

  return React.createElement(
    'div',
    {
      className: cx('rr-finding', `rr-finding--${sev}`, state !== 'open' && 'rr-finding--settled', props.className),
    },
    [
      React.createElement('div', { className: 'rr-finding__head', key: 'h' }, [
        React.createElement('span', { className: cx('rr-finding__sev', `rr-finding__sev--${sev}`), key: 's' }, [
          React.createElement(
            'span',
            { className: 'rr-finding__sevIcon', key: 'i' },
            (sev === 'note' ? icons.info : icons.flag)({ width: 13, height: 13 }),
          ),
          React.createElement('span', { key: 'l' }, props.severityLabel || SEV_LABEL[sev] || sev),
        ]),
        React.createElement('span', { className: 'rr-finding__title', key: 't' }, props.title),
        state !== 'open'
          ? React.createElement(
              'span',
              { className: 'rr-finding__state', key: 'x' },
              state === 'accepted' ? 'Accepted' : 'Set aside',
            )
          : null,
      ]),
      props.where
        ? React.createElement(
            'button',
            {
              type: 'button',
              key: 'w',
              className: cx('rr-finding__where', !props.onOpen && 'rr-finding__where--static'),
              disabled: !props.onOpen,
              onClick: props.onOpen,
            },
            [
              React.createElement(
                'span',
                { key: 'i', className: 'rr-finding__whereIcon' },
                icons.pin({ width: 13, height: 13 }),
              ),
              React.createElement('span', { key: 't' }, props.where),
            ],
          )
        : null,
      props.detail ? React.createElement('p', { className: 'rr-finding__detail', key: 'd' }, props.detail) : null,
      props.evidence
        ? React.createElement('div', { className: 'rr-finding__evidence', key: 'e' }, props.evidence)
        : null,
      props.suggestion
        ? React.createElement('p', { className: 'rr-finding__do', key: 'x' }, [
            React.createElement(
              'span',
              { className: 'rr-finding__doLabel', key: 'l' },
              props.suggestionLabel || 'What to do',
            ),
            props.suggestion,
          ])
        : null,
      props.actions ? React.createElement('div', { className: 'rr-finding__actions', key: 'a' }, props.actions) : null,
    ],
  );
}

export default Finding;
