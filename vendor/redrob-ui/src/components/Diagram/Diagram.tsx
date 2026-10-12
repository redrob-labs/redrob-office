import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';

/** Who acted. `decision` is still a person: it is a person choosing, not a third kind of actor. */
export type DiagramActor = 'person' | 'machine' | 'system' | 'decision';

const STEP_CLASS: Record<DiagramActor, string> = {
  person: 'rr-dia__step--person',
  machine: 'rr-dia__step--machine',
  system: 'rr-dia__step--system',
  decision: 'rr-dia__step--decision',
};

const LANE_LABEL: Record<DiagramActor, string> = {
  person: 'A person',
  machine: 'The machine',
  system: 'The system',
  decision: 'A person',
};

export interface DiagramStep {
  label?: React.ReactNode;
  /** A short aside under the label. Not a second sentence of the label. */
  note?: React.ReactNode;
  /** Who acted. Drives both the step's treatment and which lane it sits in. */
  by?: DiagramActor;
  /** Marks this step out of the ordinary run, e.g. where it stopped. */
  state?: string;
}

export interface DiagramProps {
  steps?: DiagramStep[];
  /** Names the diagram and becomes its accessible label. */
  title?: React.ReactNode;
  /** Split the steps into a person lane and a machine lane. */
  lanes?: boolean;
  /** Rename the two lanes. Two entries; a third is ignored because there is no third lane. */
  laneLabels?: string[];
  /** `stack` reads down the page instead of across it. For narrow columns. */
  orientation?: 'flow' | 'stack';
  /** Where the steps came from. Printed under the diagram. */
  source?: React.ReactNode;
  className?: string;
}

/**
 * A process, drawn as numbered steps, saying who did each one.
 *
 * Two lanes at most, and only the two that matter: who acted. A third lane is an org chart wearing a
 * process diagram's clothes, which is why `laneLabels` renames the two rather than adding to them.
 *
 * The steps are an ordered list, so the order survives with the stylesheet switched off and a screen
 * reader announces it as a sequence rather than a picture.
 */
export function Diagram(props: DiagramProps): React.ReactElement {
  const steps = props.steps || [];
  const lanes = !!props.lanes;
  const flow = props.orientation !== 'stack';
  const titleId = useStableId('rr-dia');

  const laneOf = (step: DiagramStep): number =>
    step.by === 'machine' || step.by === 'system' ? 1 : 0;
  const laneNames = [
    (props.laneLabels && props.laneLabels[0]) || 'Person',
    (props.laneLabels && props.laneLabels[1]) || 'Machine',
  ];

  const items = steps.map((step, i) =>
    React.createElement(
      'li',
      {
        key: i,
        className: cx(
          'rr-dia__step',
          STEP_CLASS[step.by as DiagramActor] || STEP_CLASS.person,
          step.state && `rr-dia__step--${step.state}`,
        ),
        style: lanes ? { gridColumn: String(i + 2), gridRow: String(laneOf(step) + 1) } : null,
      },
      [
        React.createElement('span', { key: 'q', className: 'rr-dia__seq', 'aria-hidden': 'true' }, String(i + 1)),
        React.createElement('span', { key: 'l', className: 'rr-dia__label' }, step.label),
        step.note ? React.createElement('span', { key: 'n', className: 'rr-dia__note' }, step.note) : null,
        lanes
          ? null
          : React.createElement(
              'span',
              { key: 'w', className: 'rr-dia__who' },
              LANE_LABEL[step.by as DiagramActor] || LANE_LABEL.person,
            ),
      ],
    ),
  );

  const laneRails = lanes
    ? laneNames.map((name, i) =>
        React.createElement(
          'div',
          {
            key: `lane${i}`,
            className: 'rr-dia__lane',
            'aria-hidden': 'true',
            style: { gridColumn: '1', gridRow: String(i + 1) },
          },
          name,
        ),
      )
    : [];

  return React.createElement(
    'figure',
    {
      className: cx('rr-dia', flow ? 'rr-dia--flow' : 'rr-dia--stack', lanes && 'rr-dia--lanes', props.className),
      role: 'group',
      'aria-labelledby': props.title ? titleId : undefined,
    },
    [
      props.title
        ? React.createElement('figcaption', { key: 't', className: 'rr-dia__title', id: titleId }, props.title)
        : null,
      React.createElement(
        'ol',
        {
          key: 's',
          className: 'rr-dia__steps',
          style: lanes ? { gridTemplateColumns: `auto repeat(${steps.length}, minmax(0, 1fr))` } : null,
        },
        (laneRails as React.ReactNode[]).concat(items),
      ),
      props.source ? React.createElement('p', { key: 'src', className: 'rr-dia__source' }, props.source) : null,
    ],
  );
}

export default Diagram;
