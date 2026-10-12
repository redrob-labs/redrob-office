import * as React from 'react';
import { cx } from '../../internal/cx';
import { icons } from '../../icons';

export interface PromptSuggestion {
  label?: React.ReactNode;
  /** What is sent. Falls back to the label. */
  value?: string;
}

export interface PromptSuggestionsProps {
  items?: Array<PromptSuggestion | string>;
  label?: string;
  className?: string;
  onSelect?: (value: string | undefined, item: PromptSuggestion | string) => void;
}

/**
 * A few things worth asking, for an empty chat.
 *
 * The list item wraps the button rather than being the button, so each one is still announced as a button
 * inside a list - a `listitem` with a click handler is a list entry a screen reader cannot press.
 */
export function PromptSuggestions(props: PromptSuggestionsProps): React.ReactElement {
  const items = props.items || [];

  return React.createElement(
    'div',
    {
      className: cx('rr-prompts', props.className),
      role: 'list',
      'aria-label': props.label || 'Suggested prompts',
    },
    items.map((item, i) => {
      const text = typeof item === 'string' ? item : item.label;
      return React.createElement(
        'span',
        { role: 'listitem', key: i, className: 'rr-prompts__item' },
        React.createElement(
          'button',
          {
            type: 'button',
            className: 'rr-prompt',
            onClick: () => {
              if (props.onSelect) {
                props.onSelect(
                  typeof item === 'string' ? item : item.value || (item.label as string),
                  item,
                );
              }
            },
          },
          [
            React.createElement(
              'span',
              { className: 'rr-prompt__icon', key: 'i' },
              icons.sparkle({ width: '100%', height: '100%' }),
            ),
            React.createElement('span', { key: 't' }, text),
          ],
        ),
      );
    }),
  );
}

export default PromptSuggestions;
