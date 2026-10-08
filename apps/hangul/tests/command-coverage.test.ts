/**
 * @vitest-environment jsdom
 *
 * Coverage check (spec task 2.6): every 한글 command in the 0.6 coverage list
 * is reachable in the owned editor, either on the command bus (where the
 * ribbon, shortcuts, command search and the AI tools run it) or as a host
 * command (a dialog, the clipboard, a file or the frame). What is not reachable
 * yet is listed in NOT_YET with a reason, and that list may only shrink: an id
 * that becomes reachable must leave it.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, EditorView, Revisions, Session, revisionCommands } from '@genoffice/hwp-editor'
import { DIALOG_FIRST, HOST_COMMANDS, NOT_YET, runHostCommand, type HostDeps } from '../src/renderer/next/host-commands'

beforeAll(() => initHwpCoreNode())

const COVERAGE = join(__dirname, '../../../.kiro/specs/hangul-editor/coverage')
const commands = (JSON.parse(readFileSync(join(COVERAGE, 'commands.json'), 'utf8')) as { commands: Array<{ id: string }> }).commands.map((c) => c.id)
const shortcuts = (JSON.parse(readFileSync(join(COVERAGE, 'shortcuts.json'), 'utf8')) as { shortcuts?: Array<{ command: string }> } | Array<{ command: string }>)

/** The bus the editor builds: core commands, view commands, then the review commands the host adds. */
function editorBus(): CommandBus {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  const bus = new CommandBus(s)
  new EditorView(document.createElement('div'), s, bus, { painter: () => {} })
  for (const c of revisionCommands(new Revisions(s), { isRecording: () => false, setRecording: () => {} })) bus.register(c)
  return bus
}

function recorder(kind: ReturnType<HostDeps['objectKind']> = 'shape'): { deps: HostDeps; calls: string[] } {
  const calls: string[] = []
  const rec = (name: string) => (...args: unknown[]) => void calls.push(`${name}(${args.map((a) => JSON.stringify(a)).join(',')})`)
  const deps: HostDeps = {
    openDialog: rec('openDialog'),
    save: rec('save'),
    clipboard: rec('clipboard'),
    run: (id) => (calls.push(`run(${id})`), false),
    pickPicture: rec('pickPicture'),
    comments: rec('comments'),
    versions: rec('versions'),
    setToolbar: rec('setToolbar'),
    toggleMarkup: rec('toggleMarkup'),
    objectKind: () => kind,
    inTable: () => true,
    inField: () => true,
    output: rec('output'),
    files: rec('files'),
    compare: rec('compare'),
  }
  return { deps, calls }
}

describe('command coverage (task 2.6)', () => {
  let onBus: Set<string>
  beforeAll(() => {
    onBus = new Set(editorBus().ids())
  })

  it('every listed command is on the bus, a host command, or listed as not yet with a reason', () => {
    const unreached = commands.filter((id) => !onBus.has(id) && !(id in HOST_COMMANDS) && !(id in NOT_YET))
    expect(unreached).toEqual([])
  })

  it('NOT_YET only holds listed commands that are really unreachable, each with a reason', () => {
    for (const [id, why] of Object.entries(NOT_YET)) {
      expect(commands, id).toContain(id)
      expect(onBus.has(id) || id in HOST_COMMANDS, `${id} is reachable now; remove it from NOT_YET`).toBe(false)
      expect(why.trim().length, id).toBeGreaterThan(5)
    }
  })

  it('a host entry for a bus command is a dialog-first command, and every dialog-first command has one', () => {
    // The editor sends only these ids to the host before the bus; any other host entry for a bus id would be dead.
    expect(Object.keys(HOST_COMMANDS).filter((id) => onBus.has(id) && !DIALOG_FIRST.has(id))).toEqual([])
    expect([...DIALOG_FIRST].filter((id) => !(id in HOST_COMMANDS))).toEqual([])
  })

  it('every host command does something when run', () => {
    // Some only apply to a selected chart or equation; each must do something for some selection.
    for (const id of Object.keys(HOST_COMMANDS)) {
      const did = (['shape', 'picture', 'chart', 'equation'] as const).some((kind) => {
        const { deps, calls } = recorder(kind)
        return runHostCommand(deps, id) && calls.length > 0
      })
      expect(did, `${id} did nothing for any selection`).toBe(true)
    }
  })

  it('every shortcut reaches a command', () => {
    const list = Array.isArray(shortcuts) ? shortcuts : (shortcuts.shortcuts ?? [])
    const unreached = [...new Set(list.map((s) => s.command))].filter((id) => !onBus.has(id) && !(id in HOST_COMMANDS) && !(id in NOT_YET))
    expect(unreached).toEqual([])
  })

  it('reports the coverage', () => {
    const reached = commands.filter((id) => onBus.has(id) || id in HOST_COMMANDS)
    // The floor only rises: today's count, from 37 when this test began.
    expect(reached.length).toBeGreaterThanOrEqual(174)
    console.log(`coverage ${reached.length}/${commands.length}; not yet ${Object.keys(NOT_YET).length}`)
  })
})
