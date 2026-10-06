/** Version history and catch-up copy; English is the master and the only selectable language. */
const en = {
  verTitle: 'Version history',
  verOpen: 'Version history',
  verCurrent: 'Current',
  verRestore: 'Restore',
  verRestoreLabel: 'Restore the version from {at}',
  verRestored: 'A copy of this version opens beside the current one. Nothing is lost.',
  verRestoreFailed: 'That version could not be restored. The current file is unchanged.',
  verAuto: 'Autosaved',
  verEmpty: 'No versions yet. Each save keeps one on this computer.',
  verName: 'Name the current version',
  verNameLabel: 'Version name',
  verNameSave: 'Name it',
  verNamed: 'Named versions stay when older ones are thinned.',
  verClose: 'Close',
  verUnsaved: 'Save once to start the history.',
  verTabs: 'Which history',
  verTabLocal: 'On this computer',
  verTabShared: 'Shared',
  verSharedVersion: 'Version {n}',
  verSharedEmpty: 'Nobody has saved a shared version yet.',
  verSharedLoadFailed: 'The shared versions could not be loaded.',
  verSharedRestoreLabel: 'Open shared version {n} as a copy',
  verSharedRestore: 'Open a copy',
  verSharedRestored: 'A copy of that shared version opens beside your file. Nothing anyone has open changes.',
  catchTitle: 'Since you last had it open, {when}',
  catchComment: '{name} commented: "{text}"',
  catchReply: '{name} replied in a thread: "{text}"',
  catchSuggestion: '{name} suggested {n} changes.',
  catchSuggestionOne: '{name} suggested a change.',
  catchFigures: '{n} linked figures wait for you.',
  catchFiguresOne: '1 linked figure waits for you.',
  catchShow: 'Show me',
  catchDismiss: 'Dismiss',
} as const

export type VerStringKey = keyof typeof en

export function verT(key: VerStringKey, params?: Record<string, string | number>): string {
  let out: string = en[key]
  if (params) for (const [k, v] of Object.entries(params)) out = out.split(`{${k}}`).join(String(v))
  return out
}
