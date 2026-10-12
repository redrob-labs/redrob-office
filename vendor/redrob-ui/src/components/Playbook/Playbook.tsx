import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';
import { Button } from '../Button/Button';

export interface PlaybookRunStep {
  id?: string | number;
  label?: React.ReactNode;
  detail?: React.ReactNode;
  /** This step stops and waits for a person. */
  approval?: boolean;
  approvalLabel?: React.ReactNode;
}

export interface PlaybookProps {
  name?: React.ReactNode;
  /** What it is for, in one line. */
  purpose?: React.ReactNode;
  steps?: PlaybookRunStep[];
  owner?: React.ReactNode;
  runs?: React.ReactNode;
  lastRun?: React.ReactNode;
  runLabel?: React.ReactNode;
  className?: string;
  onRun?: () => void;
}

/**
 * A saved sequence, step by step, marking where it stops for a person.
 *
 * The footer counts the stops and says plainly when there are none: "Runs straight through without stopping". That
 * sentence is the one somebody needs before pressing Run, and a count derived from the steps cannot disagree with
 * them.
 *
 * An ordered list, so the sequence survives without the stylesheet and reads as a sequence to a screen reader.
 */
export function Playbook(props: PlaybookProps): React.ReactElement {
  const steps = props.steps || [];
  const gates = steps.filter((s) => s.approval).length;

  return React.createElement('div', { className: cx('rr-playbook', props.className) }, [
    React.createElement('div', { className: 'rr-playbook__head', key: 'h' }, [
      React.createElement(
        'span',
        { className: 'rr-playbook__icon', key: 'i' },
        icons.route({ width: 18, height: 18 }),
      ),
      React.createElement('span', { className: 'rr-playbook__body', key: 'b' }, [
        React.createElement('span', { className: 'rr-playbook__name', key: 'n' }, props.name),
        props.purpose
          ? React.createElement('span', { className: 'rr-playbook__purpose', key: 'p' }, props.purpose)
          : null,
      ]),
      props.onRun
        ? React.createElement(
            Button,
            { key: 'r', size: 'sm', onClick: props.onRun },
            props.runLabel || 'Run it',
          )
        : null,
    ]),
    steps.length
      ? React.createElement(
          'ol',
          { className: 'rr-playbook__steps', key: 's' },
          steps.map((s, i) =>
            React.createElement(
              'li',
              {
                className: cx('rr-playbook__step', s.approval && 'rr-playbook__step--gate'),
                key: s.id || i,
              },
              [
                React.createElement('span', { className: 'rr-playbook__n', key: 'n' }, i + 1),
                React.createElement('span', { className: 'rr-playbook__cell', key: 'c' }, [
                  React.createElement('span', { className: 'rr-playbook__label', key: 'l' }, s.label),
                  s.detail
                    ? React.createElement('span', { className: 'rr-playbook__detail', key: 'd' }, s.detail)
                    : null,
                ]),
                s.approval
                  ? React.createElement('span', { className: 'rr-playbook__gate', key: 'g' }, [
                      React.createElement(
                        'span',
                        { className: 'rr-playbook__gateIcon', key: 'i' },
                        icons.shield({ width: 13, height: 13 }),
                      ),
                      React.createElement('span', { key: 't' }, s.approvalLabel || 'Asks you first'),
                    ])
                  : null,
              ],
            ),
          ),
        )
      : null,
    React.createElement('div', { className: 'rr-playbook__foot', key: 'f' }, [
      React.createElement(
        'span',
        { key: 'g', className: 'rr-playbook__foothalf' },
        gates
          ? `Stops for you ${gates === 1 ? 'once' : gates === 2 ? 'twice' : `${gates} times`}`
          : 'Runs straight through without stopping',
      ),
      React.createElement(
        'span',
        { key: 'm', className: 'rr-playbook__meta' },
        [props.owner, props.runs, props.lastRun].filter(Boolean).join(' · '),
      ),
    ]),
  ]);
}

export default Playbook;
