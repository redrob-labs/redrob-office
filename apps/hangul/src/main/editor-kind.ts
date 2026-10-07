import type { HangulEditorKind } from '../shared/ipc'

/**
 * Which Hangul editor a view runs (spec R11.1). The owned editor ('next') is
 * reachable only in an unpackaged build with REDROB_HANGUL_EDITOR=next; a
 * packaged build ignores the variable and always runs rhwp-studio until the
 * one-go cutover (task 6.3) removes this switch.
 */
export function resolveEditorKind(env: Record<string, string | undefined>, isPackaged: boolean): HangulEditorKind {
  if (isPackaged) return 'studio'
  return env.REDROB_HANGUL_EDITOR?.trim().toLowerCase() === 'next' ? 'next' : 'studio'
}
