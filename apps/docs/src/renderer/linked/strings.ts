/**
 * Linked-figure copy. English is the master; the other interface languages
 * are not selectable yet, so every language reads this table.
 */
const en = {
  figUpToDate: 'Up to date',
  figWaiting: 'Update waiting',
  figStale: 'Out of date',
  figUnknown: 'Not in the index on this computer',
  figSource: 'Source',
  figLastChanged: 'Last changed',
  figUsedIn: 'Used in',
  figFiles: '{n} files',
  figOneFile: '1 file',
  figKeep: 'Keep the update',
  figKeepOld: 'Keep the old value',
  figKeepSentence: 'Keep the rewrite',
  figKeepOldSentence: 'Keep the old sentence',
  figChange: 'Change it everywhere',
  figUpdate: 'Update everywhere',
  figChangeHint: 'This file changes now. The other files wait in Updates until someone keeps each change.',
  figSentenceNote: 'Redrob rewrites this sentence when the value changes enough to change what it says. You keep each rewrite yourself.',
  figSaveFirst: 'Save this document once to link figures to it.',
  figFailed: 'That change was not saved. Nothing in the other files changed.',
  figClose: 'Close',
  figLabel: '{label}: {value}',
  figLabelWait: '{label}: {value}, update waiting',
  figLabelStale: '{label}: {value}, out of date',
  sourcesTitle: 'Sources',
  sourcesEmpty: 'No linked figures in this document yet. Insert one from Insert linked figure.',
  sourcesClose: 'Close Sources',
  insertTitle: 'Insert linked figure',
  insertEmpty: 'There are no linked figures on this computer yet. Link a cell in a sheet first.',
  insertValue: 'Insert the value',
  insertSentence: 'Insert the sentence',
  insertCancel: 'Cancel',
  toolInsert: 'Insert linked figure',
  toolSources: 'Sources',
} as const

export type FigStringKey = keyof typeof en

export function figT(key: FigStringKey, params?: Record<string, string | number>): string {
  let out: string = en[key]
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v))
  return out
}
