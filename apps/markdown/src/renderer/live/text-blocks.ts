/** This schema's text blocks: a live undo never removes one whole when only its text changed. */
export const MD_TEXT_BLOCKS = ['paragraph', 'heading', 'listItem', 'taskItem', 'codeBlock'] as const
