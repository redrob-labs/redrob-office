import * as React from 'react';
import { cx } from '../../internal/cx';
import { ACCESS } from '../../internal/harness';
import { icons } from '../../icons';
import { Button } from '../Button/Button';
import { Checkbox } from '../Checkbox/Checkbox';
import { IconButton } from '../IconButton/IconButton';
import { Input } from '../Input/Input';
import { Modal } from '../Modal/Modal';
import { Select } from '../Select/Select';
import { Switch } from '../Switch/Switch';

export interface AccessApp {
  id: string;
  name?: string;
  maker?: string;
  category?: string;
  description?: string;
  logo?: string;
  icon?: React.ReactNode;
  connected?: boolean;
}

export interface AccessGrant {
  id: string;
  mode?: 'read' | 'write';
}

export interface AppAccessProps {
  /** Every app that could be added. */
  apps?: AccessApp[];
  value?: AccessGrant[];
  defaultValue?: AccessGrant[];
  /** Whether the project's memory is readable. `undefined` hides the row entirely. */
  memory?: boolean;
  label?: React.ReactNode;
  filesLabel?: React.ReactNode;
  filesNote?: React.ReactNode;
  memoryLabel?: string;
  memoryOnNote?: React.ReactNode;
  memoryOffNote?: React.ReactNode;
  notConnectedLabel?: string;
  connectedLabel?: string;
  connectsLabel?: string;
  addLabel?: React.ReactNode;
  dialogTitle?: string;
  searchLabel?: string;
  searchPlaceholder?: string;
  emptyText?: React.ReactNode;
  startNote?: React.ReactNode;
  note?: React.ReactNode;
  accessLabels?: Record<string, string>;
  /** Compose the summary line yourself, given the counts. */
  summary?: (reach: number, write: number) => string;
  className?: string;
  onChange?: (grants: AccessGrant[]) => void;
  onConnect?: (id: string) => void;
  onMemoryChange?: (on: boolean) => void;
}

/**
 * What a playbook can reach: the project's files, its memory, and named apps with a read or write grant.
 *
 * Every app starts as "Can read", and widening it is a separate deliberate act. That ordering is the whole design:
 * granting write access should never be something that happens as a side effect of adding an app.
 *
 * The files row is fixed and says "Always included" rather than being a switch that cannot move - a disabled
 * control with no explanation reads as a bug.
 *
 * The summary line says what it reads and what it writes to, and then states where consequential actions stop. A
 * permission list without that sentence describes capability and hides the constraint.
 */
export function AppAccess(props: AppAccessProps): React.ReactElement {
  const apps = props.apps || [];
  const byId: Record<string, AccessApp> = {};
  apps.forEach((a) => {
    byId[a.id] = a;
  });

  const controlled = props.value !== undefined;
  const [inner, setInner] = React.useState<AccessGrant[]>(props.defaultValue || []);
  const list = controlled ? (props.value as AccessGrant[]) : inner;
  const [adding, setAdding] = React.useState(false);
  const [q, setQ] = React.useState('');
  const [pick, setPick] = React.useState<Record<string, boolean>>({});

  function change(next: AccessGrant[]): void {
    if (!controlled) setInner(next);
    if (props.onChange) props.onChange(next);
  }

  const have: Record<string, boolean> = {};
  list.forEach((x) => {
    have[x.id] = true;
  });
  const shown = apps.filter(
    (a) =>
      !have[a.id] &&
      (!q ||
        `${a.name} ${a.category || ''} ${a.maker || ''}`.toLowerCase().indexOf(q.toLowerCase()) >= 0),
  );
  const picked = Object.keys(pick).filter((k) => pick[k]);

  function reset(): void {
    setAdding(false);
    setPick({});
    setQ('');
  }

  function add(): void {
    change(list.concat(picked.map((id) => ({ id, mode: 'read' as const }))));
    picked.forEach((id) => {
      if (!byId[id].connected && props.onConnect) props.onConnect(id);
    });
    reset();
  }

  const labels = props.accessLabels || ACCESS;
  const reachN = list.filter((x) => byId[x.id] && byId[x.id].connected).length;
  const writeN = list.filter((x) => byId[x.id] && byId[x.id].connected && x.mode === 'write').length;

  function pickRow(a: AccessApp): React.ReactElement {
    return React.createElement(
      'li',
      { key: a.id },
      React.createElement(Checkbox, {
        className: 'rr-access__pick',
        checked: !!pick[a.id],
        onChange: () => {
          const n = { ...pick };
          n[a.id] = !pick[a.id];
          setPick(n);
        },
        label: React.createElement('span', { className: 'rr-access__picklab' }, [
          React.createElement(
            'span',
            { key: 'i', className: 'rr-access__pickicon', 'aria-hidden': 'true' },
            a.logo ? React.createElement('img', { src: a.logo, alt: '' }) : a.icon,
          ),
          React.createElement('span', { key: 't', className: 'rr-access__t' }, [
            React.createElement('b', { key: 'b' }, a.name),
            React.createElement(
              'span',
              { key: 's' },
              [a.category, a.description].filter(Boolean).join(' - '),
            ),
          ]),
          React.createElement(
            'span',
            { key: 'm', className: 'rr-access__state' },
            a.connected
              ? props.connectedLabel || 'Connected'
              : props.connectsLabel || 'Connects when added',
          ),
        ]),
      }),
    );
  }

  const fixed: React.ReactNode[] = [
    React.createElement('li', { key: 'files', className: 'rr-access__i' }, [
      React.createElement(
        'span',
        { key: 'i', className: 'rr-access__icon', 'aria-hidden': 'true' },
        icons.folder({ width: 15, height: 15 }),
      ),
      React.createElement('span', { key: 't', className: 'rr-access__t' }, [
        React.createElement('b', { key: 'b' }, props.filesLabel || "The project's files"),
        React.createElement('span', { key: 's' }, props.filesNote || 'Always included'),
      ]),
      React.createElement('span', { key: 'm', className: 'rr-access__fixed' }, labels.write),
    ]),
    props.memory !== undefined
      ? React.createElement('li', { key: 'mem', className: 'rr-access__i' }, [
          React.createElement(
            'span',
            { key: 'i', className: 'rr-access__icon', 'aria-hidden': 'true' },
            icons.bookOpen({ width: 15, height: 15 }),
          ),
          React.createElement('span', { key: 't', className: 'rr-access__t' }, [
            React.createElement('b', { key: 'b' }, props.memoryLabel || "The project's memory"),
            React.createElement(
              'span',
              { key: 's' },
              props.memory
                ? props.memoryOnNote || 'Reads the notes before each run'
                : props.memoryOffNote || 'Off for this playbook',
            ),
          ]),
          React.createElement(Switch, {
            key: 'sw',
            size: 'sm',
            checked: !!props.memory,
            onChange: () => {
              if (props.onMemoryChange) props.onMemoryChange(!props.memory);
            },
            label: React.createElement(
              'span',
              { className: 'rr-visually-hidden' },
              props.memoryLabel || "The project's memory",
            ),
          }),
        ])
      : null,
  ];

  return React.createElement('div', { className: cx('rr-access', props.className) }, [
    React.createElement(
      'span',
      { key: 'h', className: 'rr-access__label' },
      props.label || 'What it can reach',
    ),
    React.createElement(
      'ul',
      { key: 'l', className: 'rr-access__list' },
      fixed.concat(
        list.map((x) => {
          const a = byId[x.id];
          if (!a) return null;
          return React.createElement('li', { key: x.id, className: 'rr-access__i rr-access__i--app' }, [
            React.createElement(
              'span',
              { key: 'i', className: 'rr-access__icon', 'aria-hidden': 'true' },
              a.logo ? React.createElement('img', { src: a.logo, alt: '' }) : a.icon,
            ),
            React.createElement('span', { key: 't', className: 'rr-access__t' }, [
              React.createElement('b', { key: 'b' }, a.name),
              React.createElement(
                'span',
                { key: 's' },
                a.connected ? a.category : props.notConnectedLabel || 'Not connected yet',
              ),
            ]),
            React.createElement(
              IconButton,
              {
                key: 'x',
                size: 'sm',
                label: `Remove ${a.name}`,
                onClick: () => change(list.filter((y) => y.id !== x.id)),
              },
              icons.close({ width: 14, height: 14 }),
            ),
            a.connected
              ? React.createElement(Select, {
                  key: 'm',
                  size: 'sm',
                  label: `${a.name} access`,
                  className: 'rr-access__mode',
                  value: x.mode,
                  onChange: (event: unknown) => {
                    const target = (event as { target: { value: string } }).target;
                    change(
                      list.map((y) =>
                        y.id === x.id ? { ...y, mode: target.value as 'read' | 'write' } : y,
                      ),
                    );
                  },
                  options: [
                    { value: 'read', label: labels.read, detail: 'Finds and reads. Changes nothing.' },
                    { value: 'write', label: labels.write, detail: 'Can also draft, edit and save.' },
                  ],
                })
              : React.createElement(
                  Button,
                  {
                    key: 'm',
                    size: 'sm',
                    variant: 'secondary',
                    className: 'rr-access__mode',
                    onClick: () => {
                      if (props.onConnect) props.onConnect(x.id);
                    },
                  },
                  `Connect ${a.name}`,
                ),
          ]);
        }),
      ),
    ),
    React.createElement(
      Button,
      {
        key: 'add',
        size: 'sm',
        variant: 'secondary',
        fullWidth: true,
        iconLeft: icons.plus({ width: 14, height: 14 }),
        onClick: () => setAdding(true),
      },
      props.addLabel || 'Add an app',
    ),
    React.createElement(
      'p',
      { key: 'n', className: 'rr-access__note' },
      (props.summary
        ? props.summary(reachN, writeN)
        : `Reads ${reachN} app${reachN === 1 ? '' : 's'}${writeN ? `, writes to ${writeN}` : ''}. `) +
        (props.note ||
          'Anything it sends, posts, signs or pays for waits for you at the steps marked "Asks you first".'),
    ),
    React.createElement(
      Modal,
      {
        key: 'mo',
        open: adding,
        title: props.dialogTitle || 'Add an app',
        width: 560,
        onClose: reset,
        footer: [
          React.createElement(Button, { key: 'c', variant: 'ghost', onClick: reset }, 'Cancel'),
          React.createElement(
            Button,
            { key: 'a', variant: 'primary', disabled: !picked.length, onClick: add },
            picked.length ? `Add ${picked.length} app${picked.length === 1 ? '' : 's'}` : 'Add apps',
          ),
        ],
      },
      [
        React.createElement(Input, {
          key: 'q',
          label: props.searchLabel || 'Search apps',
          placeholder: props.searchPlaceholder || 'Gmail, Jira, files, CRM...',
          value: q,
          onChange: (event: React.ChangeEvent<HTMLInputElement>) => setQ(event.target.value),
        }),
        React.createElement(
          'div',
          { key: 'lists', className: 'rr-access__picklist' },
          shown.length
            ? [
                shown.some((a) => a.connected)
                  ? React.createElement(
                      'div',
                      { key: 'ch', className: 'rr-access__pickh' },
                      props.connectedLabel || 'Connected',
                    )
                  : null,
                React.createElement('ul', { key: 'c' }, shown.filter((a) => a.connected).map(pickRow)),
                shown.some((a) => !a.connected)
                  ? React.createElement(
                      'div',
                      { key: 'nh', className: 'rr-access__pickh' },
                      props.notConnectedLabel || 'Not connected yet',
                    )
                  : null,
                React.createElement('ul', { key: 'n' }, shown.filter((a) => !a.connected).map(pickRow)),
              ]
            : React.createElement(
                'p',
                { className: 'rr-access__empty' },
                props.emptyText || 'No app by that name yet.',
              ),
        ),
        React.createElement(
          'p',
          { key: 'note', className: 'rr-access__note' },
          props.startNote || 'Each app starts as Can read. You can change it once it is added.',
        ),
      ],
    ),
  ]);
}

export default AppAccess;
