import * as React from 'react';
import { cx } from '../../internal/cx';
import { PLAN_STATUS, PlanStatus } from '../../internal/safeguards';
import { icons } from '../../icons';
import { Button } from '../Button/Button';
interface PlanItemObject {
  id?: string;
  /** Bold words that open the item. */
  lead?: React.ReactNode;
  text: React.ReactNode;
  note?: React.ReactNode;
  editable?: boolean;
}
export type PlanItem = React.ReactNode | PlanItemObject;
export interface PlanSection {
  id?: string;
  heading: React.ReactNode;
  body?: React.ReactNode;
  items?: PlanItem[];
  ordered?: boolean;
}
export interface PlanTodo {
  id?: string;
  label: React.ReactNode;
  /** The AI that will do it. */
  who?: React.ReactNode;
  done?: boolean;
}
export interface PlanDocumentProps {
  /** The plan's file name: "Plan · Ending the Seorin MSA.md". */
  file?: React.ReactNode;
  title?: React.ReactNode;
  summary?: React.ReactNode;
  sections?: PlanSection[];
  todo?: PlanTodo[];
  /** How many To do items are done; overrides each item's `done`. */
  done?: number;
  /** draft and kept can be edited in place; running and done are locked. Draft shows as edited once changed. */
  status?: PlanStatus;
  statusLabels?: Partial<Record<PlanStatus, React.ReactNode>>;
  /** Which checks will run after, and why. */
  note?: React.ReactNode;
  onRun?: () => void;
  onKeep?: () => void;
  onEdit?: (e: unknown) => void;
  runLabel?: string;
  keepLabel?: string;
  hint?: React.ReactNode;
  todoLabel?: string;
  label?: string;
  className?: string;
}

function isItemObject(it: PlanItem): it is PlanItemObject {
  return typeof it === 'object' && it !== null && !React.isValidElement(it) && !Array.isArray(it) && 'text' in it;
}

/** A paragraph of the plan, editable in place until it runs. */
function PlanText(props: {
  as?: 'span' | 'p';
  editable?: boolean;
  onEdit?: (e: React.FormEvent) => void;
  className?: string;
  children?: React.ReactNode;
}): React.ReactElement {
  if (!props.editable) return React.createElement(props.as || 'span', { className: props.className }, props.children);
  return React.createElement(
    props.as || 'span',
    {
      className: cx('rr-plandoc__ed', props.className),
      contentEditable: true,
      suppressContentEditableWarning: true,
      spellCheck: false,
      onInput: props.onEdit,
    },
    props.children,
  );
}

/**
 * The plan, written out as a document rather than a list of steps: what was asked, what is known, how, what you
 * get, the assumptions and the risks, and a To do list that ticks as the run goes.
 *
 * Any paragraph can be changed in place until it runs, and the status line says so the moment it is: a draft
 * becomes "Edited by you". Once running, the text locks, because a plan that changes under a run is no longer
 * the plan that was approved.
 *
 * The status names who approved it. A plan that runs is one a person said yes to, and the document keeps that
 * on its face.
 */
export function PlanDocument(props: PlanDocumentProps): React.ReactElement {
  const st = props.status || 'draft';
  const [edited, setEdited] = React.useState(false);
  const editable = st === 'draft' || st === 'edited' || st === 'kept';
  function mark(e: React.FormEvent): void {
    if (!edited) setEdited(true);
    if (props.onEdit) props.onEdit(e);
  }
  const shown: PlanStatus = st === 'draft' && edited ? 'edited' : st;
  const todo = props.todo || [];
  const ticked = props.done != null ? props.done : todo.filter((t) => t.done).length;
  function item(raw: PlanItem, i: number): React.ReactElement | null {
    if (raw == null) return null;
    const it: PlanItemObject = isItemObject(raw) ? raw : { text: raw };
    return React.createElement('li', { key: it.id || i }, [
      // Joined as text, as the reference does, so a string lead renders as one text node.
      it.lead ? React.createElement('b', { key: 'l' }, `${it.lead} `) : null,
      React.createElement(PlanText, { key: 't', editable: editable && it.editable !== false, onEdit: mark }, it.text),
      it.note ? React.createElement('span', { key: 'n', className: 'rr-plandoc__muted' }, ` ${it.note}`) : null,
    ]);
  }
  return React.createElement('article', { className: cx('rr-plandoc', props.className), 'aria-label': props.label || 'Plan' }, [
    React.createElement('header', { key: 'h', className: 'rr-plandoc__h' }, [
      React.createElement('span', { key: 'f', className: 'rr-plandoc__file' }, [
        React.createElement(
          React.Fragment,
          { key: 'i' },
          icons.fileText({ width: 14, height: 14, 'aria-hidden': 'true' }),
        ),
        React.createElement('span', { key: 't' }, props.file || 'Plan.md'),
      ]),
      React.createElement(
        'span',
        { key: 's', className: cx('rr-plandoc__state', `rr-plandoc__state--${shown}`) },
        (props.statusLabels || PLAN_STATUS)[shown] || shown,
      ),
    ]),
    React.createElement('div', { key: 'b', className: cx('rr-plandoc__b', !editable && 'rr-plandoc__b--locked') }, [
      props.title ? React.createElement('h2', { key: 't', className: 'rr-plandoc__title' }, props.title) : null,
      props.summary
        ? React.createElement(PlanText, { key: 's', as: 'p', editable, onEdit: mark }, props.summary)
        : null,
      (props.sections || []).map((s, si) =>
        React.createElement('section', { key: s.id || si, className: 'rr-plandoc__sec' }, [
          React.createElement('h3', { key: 'h' }, s.heading),
          s.body ? React.createElement(PlanText, { key: 'p', as: 'p', editable, onEdit: mark }, s.body) : null,
          s.items
            ? React.createElement(
                s.ordered ? 'ol' : 'ul',
                { key: 'l' },
                s.items.map((it, i) => item(it, i)),
              )
            : null,
        ]),
      ),
      todo.length
        ? React.createElement('section', { key: 'todo', className: 'rr-plandoc__sec' }, [
            React.createElement('h3', { key: 'h' }, props.todoLabel || 'To do'),
            React.createElement(
              'ul',
              { key: 'l', className: 'rr-plandoc__todo' },
              todo.map((t, i) => {
                const done = i < ticked;
                return React.createElement('li', { key: t.id || i, className: done ? 'is-done' : undefined }, [
                  React.createElement(
                    'span',
                    { key: 'c', className: 'rr-plandoc__box', 'aria-hidden': 'true' },
                    done ? icons.check({ width: 10, height: 10 }) : null,
                  ),
                  React.createElement('span', { key: 't', className: 'rr-plandoc__task' }, [
                    t.label,
                    done
                      ? React.createElement('span', { key: 'v', className: 'rr-visually-hidden' }, ' (done)')
                      : null,
                  ]),
                  t.who ? React.createElement('span', { key: 'w', className: 'rr-plandoc__who' }, t.who) : null,
                ]);
              }),
            ),
          ])
        : null,
      props.note ? React.createElement('p', { key: 'n', className: 'rr-plandoc__note' }, props.note) : null,
    ]),
    editable && (props.onRun || props.onKeep)
      ? React.createElement('footer', { key: 'f', className: 'rr-plandoc__f' }, [
          props.onRun
            ? React.createElement(
                Button,
                {
                  key: 'r',
                  variant: 'primary',
                  iconLeft: icons.play({ width: 14, height: 14 }),
                  onClick: props.onRun,
                },
                props.runLabel || 'Run this plan',
              )
            : null,
          props.onKeep && st !== 'kept'
            ? React.createElement(
                Button,
                { key: 'k', variant: 'secondary', onClick: props.onKeep },
                props.keepLabel || 'Keep it for later',
              )
            : null,
          React.createElement(
            'span',
            { key: 's', className: 'rr-plandoc__hint' },
            props.hint || 'Click any paragraph to change it, or reply below.',
          ),
        ])
      : null,
  ]);
}
export default PlanDocument;
