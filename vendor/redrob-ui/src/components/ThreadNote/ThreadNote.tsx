import * as React from 'react';
import { MemorySaved, MemorySavedProps } from '../MemorySaved/MemorySaved';
import { ModelSwitch, ModelSwitchProps } from '../ModelSwitch/ModelSwitch';
/**
 * A one-line note in the conversation. `kind="model"` (default) when a different AI takes over
 * (ModelSwitchProps); `kind="memory"` when something is saved, with Undo (MemorySavedProps).
 */
export interface ThreadNoteProps extends Omit<ModelSwitchProps, 'to'>, Omit<MemorySavedProps, 'children'> {
  kind?: 'model' | 'memory';
  to?: React.ReactNode;
  children?: React.ReactNode;
}
/**
 * A one-line note in the conversation, between turns rather than in one.
 *
 * `model` says a different AI took over and that it reads the same memory, so a switch does not read as a
 * reset. `memory` says what was saved and offers Undo beside it, because a product that remembers silently is
 * deciding what it knows about someone without telling them.
 */
export function ThreadNote(props: ThreadNoteProps): React.ReactElement {
  return props.kind === 'memory'
    ? React.createElement(MemorySaved, props)
    : React.createElement(ModelSwitch, props);
}
export default ThreadNote;
