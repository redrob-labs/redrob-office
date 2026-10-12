import * as React from 'react';
import { cx } from '../../internal/cx';
import { SCOPE_ICON, SCOPE_MODE } from '../../internal/harness';
import { isIconName } from '../../internal/iconName';
import { icons } from '../../icons';
import { SectionMark } from '../SectionMark/SectionMark';
export interface AccessListProps {
  scopes?: Array<{
    /** The five things a person actually pictures. */
    kind?: 'files' | 'apps' | 'web' | 'computer' | 'memory';
    /** Name the thing, not the path: 'Your Contracts folder'. */
    label: string;
    /** Rendered as 'Can read', 'Can read and write', 'No access'. */
    mode?: 'read' | 'write' | 'none';
  }>;
  label?: string;
  className?: string;
}
/**
 * Everything an agent can reach, and whether it can change it. List refusals as well as grants.
 *
 * The mode is spelled out - "Can read", "Can read and write" - because read and write are a developer's words for
 * somebody else's files. A person granting access should not have to translate.
 *
 * Every scope is listed, including the ones that are read-only or refused. A list that showed only the powerful
 * grants would make the total reach impossible to judge.
 */
export function AccessList(props: AccessListProps): React.ReactElement {
  const scopes = props.scopes || [];
  return React.createElement(
    'div',
    {
      className: cx('rr-scope', props.className),
      role: 'group',
      'aria-label': props.label || 'What this agent can reach',
    },
    [
      props.label
        ? React.createElement(SectionMark, {
            key: 'm',
            label: [props.label],
            trailing: String(scopes.length),
          })
        : null,
      scopes.map((s, i) => {
        const glyph = SCOPE_ICON[s.kind || ''] || 'shield';
        const Ico = isIconName(glyph) ? icons[glyph] : icons.shield;
        const mode = s.mode || 'read';
        return React.createElement('div', { className: 'rr-scope__row', key: i }, [
          React.createElement(
            'span',
            { className: 'rr-scope__icon', key: 'i', 'aria-hidden': 'true' },
            React.createElement(Ico),
          ),
          React.createElement('span', { className: 'rr-scope__label', key: 'l', title: s.label }, s.label),
          React.createElement(
            'span',
            { className: `rr-scope__mode rr-scope__mode--${mode}`, key: 'm' },
            SCOPE_MODE[mode] || mode,
          ),
        ]);
      }),
    ],
  );
}
export default AccessList;
