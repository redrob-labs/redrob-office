import * as React from 'react';
import { cx } from '../../internal/cx';
import { useStableId } from '../../internal/ids';
import { icons } from '../../icons';

const TOOL_STATE_LABEL: Record<string, string> = { running: 'Running', done: 'Done', error: 'Failed' };

export interface AgentActionProps {
  /** What it did, in plain words - not the tool's function name. */
  name?: React.ReactNode;
  /** The outcome in one line: what was searched, what came back. */
  summary?: React.ReactNode;
  state?: 'running' | 'done' | 'error';
  stateLabel?: React.ReactNode;
  duration?: React.ReactNode;
  defaultOpen?: boolean;
  className?: string;
  /** The detail, collapsed by default. */
  children?: React.ReactNode;
}

/**
 * One thing the agent did: a search, a file read, a call out.
 *
 * Collapsed by default with the outcome on the row, because a reader wants to know what happened, not how. The
 * detail is there for the times the answer looks wrong.
 *
 * The state is a word AND a glyph, not a colour: "Failed" beside a red dot is readable, a red dot alone is not.
 */
export function AgentAction(props: AgentActionProps): React.ReactElement {
  const state = props.state || 'done';
  const [open, setOpen] = React.useState(!!props.defaultOpen);
  const id = useStableId('rr-action');
  const stateIcon = state === 'running' ? null : state === 'error' ? icons.danger : icons.success;

  return React.createElement('div', { className: cx('rr-action', props.className) }, [
    React.createElement(
      'button',
      {
        type: 'button',
        key: 'h',
        className: 'rr-action__head',
        'aria-expanded': String(open),
        'aria-controls': id,
        onClick: () => setOpen(!open),
      },
      [
        React.createElement(
          'span',
          { className: 'rr-action__icon', key: 'i' },
          icons.tool({ width: '100%', height: '100%' }),
        ),
        React.createElement('span', { className: 'rr-action__name', key: 'n' }, props.name),
        React.createElement('span', { className: 'rr-action__summary', key: 's' }, props.summary),
        React.createElement(
          'span',
          { className: cx('rr-action__state', `rr-action__state--${state}`), key: 't' },
          [
            state === 'running'
              ? React.createElement('span', { className: 'rr-spinner', key: 'p', style: { fontSize: '12px' } })
              : React.createElement(
                  'span',
                  { key: 'p', style: { display: 'inline-flex', width: 14, height: 14 } },
                  (stateIcon as (p: Record<string, unknown>) => React.ReactElement)({
                    width: '100%',
                    height: '100%',
                  }),
                ),
            React.createElement('span', { key: 'l' }, props.stateLabel || TOOL_STATE_LABEL[state]),
            props.duration
              ? React.createElement(
                  'span',
                  { key: 'd', style: { fontWeight: 400, color: 'var(--ink-muted)' } },
                  props.duration,
                )
              : null,
          ],
        ),
        React.createElement(
          'span',
          { className: cx('rr-accordion__chevron', open && 'rr-accordion__chevron--open'), key: 'c' },
          icons.chevronDown({ width: 14, height: 14 }),
        ),
      ],
    ),
    React.createElement('div', { className: 'rr-action__body', id, key: 'b', hidden: !open }, props.children),
  ]);
}

export default AgentAction;
