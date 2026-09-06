import { afterEach, describe, expect, it } from 'vitest'
import { cpSync, existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import {
  DEV_USER_DATA_DIR,
  LEGACY_DEV_USER_DATA_DIRS,
  LEGACY_PACKAGED_USER_DATA_DIRS,
  planUserDataMigration,
  targetIsEmpty,
} from '../src/main/userdata-migration'

const dirs: string[] = []
afterEach(() => {
  for (const d of dirs.splice(0)) rmSync(d, { recursive: true, force: true })
})

/** Real-filesystem probe mirroring the one wired into index.ts. */
const probe = {
  exists: (dir: string) => existsSync(dir),
  entryCount: (dir: string) => {
    try {
      return readdirSync(dir).length
    } catch {
      return 0
    }
  },
}

function scratch(): string {
  const d = mkdtempSync(join(tmpdir(), 'redrob-userdata-'))
  dirs.push(d)
  return d
}

/** Perform the same copy the app does, so idempotency/no-overwrite is exercised end to end. */
function runMigration(target: string, candidates: string[]): string | null {
  const source = planUserDataMigration(target, candidates, probe)
  if (source) cpSync(source, target, { recursive: true, force: false, errorOnExist: false })
  return source
}

describe('naming', () => {
  it('uses the Redrob dev dir and lists the legacy names newest-first', () => {
    expect(DEV_USER_DATA_DIR).toBe('Redrob Office Dev')
    expect(LEGACY_DEV_USER_DATA_DIRS).toEqual(['GenOffice Dev'])
    expect(LEGACY_PACKAGED_USER_DATA_DIRS).toEqual(['GenOffice', 'AI Office'])
  })
})

describe('targetIsEmpty', () => {
  it('is true for a missing or empty target, false for a populated one', () => {
    const root = scratch()
    const missing = join(root, 'nope')
    const empty = join(root, 'empty')
    mkdirSync(empty)
    const full = join(root, 'full')
    mkdirSync(full)
    writeFileSync(join(full, 'settings.json'), '{}')
    expect(targetIsEmpty(missing, probe)).toBe(true)
    expect(targetIsEmpty(empty, probe)).toBe(true)
    expect(targetIsEmpty(full, probe)).toBe(false)
  })
})

describe('planUserDataMigration', () => {
  it('migrates from the legacy dir when the target is missing', () => {
    const root = scratch()
    const legacy = join(root, 'GenOffice Dev')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'setup.json'), '{"completedAt":1}')
    const target = join(root, 'Redrob Office Dev')

    expect(runMigration(target, [legacy])).toBe(legacy)
    expect(existsSync(join(target, 'setup.json'))).toBe(true)
    // source preserved (copy, not move) so a rollback still finds its data
    expect(existsSync(join(legacy, 'setup.json'))).toBe(true)
  })

  it('does NOT overwrite a target that already has data', () => {
    const root = scratch()
    const legacy = join(root, 'GenOffice Dev')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'setup.json'), '{"from":"legacy"}')
    const target = join(root, 'Redrob Office Dev')
    mkdirSync(target, { recursive: true })
    writeFileSync(join(target, 'setup.json'), '{"from":"current"}')

    expect(runMigration(target, [legacy])).toBeNull()
    // current data untouched
    expect(JSON.parse(readFileSync(join(target, 'setup.json'), 'utf8'))).toEqual({ from: 'current' })
  })

  it('is idempotent: a second run after data exists is a no-op', () => {
    const root = scratch()
    const legacy = join(root, 'GenOffice Dev')
    mkdirSync(legacy, { recursive: true })
    writeFileSync(join(legacy, 'a.txt'), 'A')
    const target = join(root, 'Redrob Office Dev')

    expect(runMigration(target, [legacy])).toBe(legacy) // first run migrates
    writeFileSync(join(target, 'b.txt'), 'B') // user adds data afterwards
    expect(runMigration(target, [legacy])).toBeNull() // second run: no-op
    expect(existsSync(join(target, 'b.txt'))).toBe(true) // new data preserved
  })

  it('prefers the newest legacy dir (GenOffice over AI Office)', () => {
    const root = scratch()
    const genoffice = join(root, 'GenOffice')
    const aiOffice = join(root, 'AI Office')
    mkdirSync(genoffice, { recursive: true })
    mkdirSync(aiOffice, { recursive: true })
    writeFileSync(join(genoffice, 'mark'), 'new')
    writeFileSync(join(aiOffice, 'mark'), 'old')
    const target = join(root, 'Redrob')

    expect(runMigration(target, [genoffice, aiOffice])).toBe(genoffice)
    expect(readFileSync(join(target, 'mark'), 'utf8')).toBe('new')
  })

  it('falls through to an older legacy dir when the newer one is absent/empty', () => {
    const root = scratch()
    const genoffice = join(root, 'GenOffice')
    mkdirSync(genoffice, { recursive: true }) // exists but EMPTY
    const aiOffice = join(root, 'AI Office')
    mkdirSync(aiOffice, { recursive: true })
    writeFileSync(join(aiOffice, 'mark'), 'old')
    const target = join(root, 'Redrob')

    expect(runMigration(target, [genoffice, aiOffice])).toBe(aiOffice)
    expect(readFileSync(join(target, 'mark'), 'utf8')).toBe('old')
  })

  it('does nothing when no legacy dir exists', () => {
    const root = scratch()
    const target = join(root, 'Redrob Office Dev')
    expect(runMigration(target, [join(root, 'GenOffice Dev')])).toBeNull()
    expect(existsSync(target)).toBe(false)
  })
})


describe('dev/test profile isolation env var', () => {
  it('turbo.json passes GENOFFICE_USER_DATA through so root `pnpm dev`/`pnpm test` honor it', () => {
    // Without this, turbo's strict env mode strips GENOFFICE_USER_DATA before
    // electron sees it, so a scratch-dir profile (used to reach first-run
    // onboarding, or to run an automated instance beside a dev instance) is
    // silently ignored and the app falls back to the shared dev profile.
    const turbo = JSON.parse(
      readFileSync(resolve(__dirname, '..', '..', '..', 'turbo.json'), 'utf8'),
    ) as { globalPassThroughEnv?: string[]; tasks?: Record<string, { passThroughEnv?: string[] }> }
    const global = turbo.globalPassThroughEnv ?? []
    const dev = turbo.tasks?.dev?.passThroughEnv ?? []
    const test = turbo.tasks?.test?.passThroughEnv ?? []
    const passed = new Set([...global, ...dev, ...test])
    expect(passed.has('GENOFFICE_USER_DATA')).toBe(true)
  })
})
