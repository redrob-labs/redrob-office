import { describe, expect, it } from 'vitest'
import { MIGRATIONS, migrateWith, type Queryable } from '../src/pg-repo.ts'

/** Just enough of Postgres to watch the migration runner: it records statements and keeps schema_migrations. */
function fakeDb(opts: { applied?: number[]; failOn?: string } = {}) {
  const applied = new Set(opts.applied ?? [])
  const log: string[] = []
  let pending: number | null = null
  const db: Queryable = {
    async query(sql, params) {
      const s = sql.trim().split(/\s+/).slice(0, 3).join(' ')
      log.push(s)
      if (opts.failOn && sql.includes(opts.failOn)) throw new Error('syntax error')
      if (sql.startsWith('SELECT version FROM schema_migrations')) return { rows: [...applied].map((version) => ({ version })) }
      if (sql.startsWith('INSERT INTO schema_migrations')) pending = Number(params?.[0])
      if (sql === 'COMMIT' && pending !== null) applied.add(pending)
      if (sql === 'ROLLBACK') pending = null
      return { rows: [] }
    },
  }
  return { db, log, applied }
}

describe('migrations', () => {
  it('applies every step once, in order, under the lock', async () => {
    const { db, log, applied } = fakeDb()
    expect(await migrateWith(db, ['CREATE TABLE a (x int)', 'CREATE TABLE b (x int)'])).toEqual([1, 2])
    expect(applied).toEqual(new Set([1, 2]))
    expect(log[0]).toBe('SELECT pg_advisory_lock($1)')
    expect(log[log.length - 1]).toBe('SELECT pg_advisory_unlock($1)')
    expect(log.filter((s) => s === 'BEGIN')).toHaveLength(2)
    // a second start has nothing to do
    expect(await migrateWith(db, ['CREATE TABLE a (x int)', 'CREATE TABLE b (x int)'])).toEqual([])
  })

  it('applies only the new steps of a database that has the older ones', async () => {
    const { db } = fakeDb({ applied: [1, 2, 3, 4, 5] })
    expect(await migrateWith(db, [...MIGRATIONS.slice(0, 5), 'CREATE TABLE later (x int)'])).toEqual([6])
  })

  it('a failed step rolls back, is not recorded, and releases the lock', async () => {
    const { db, log, applied } = fakeDb({ failOn: 'broken' })
    await expect(migrateWith(db, ['CREATE TABLE a (x int)', 'CREATE broken'])).rejects.toThrow('Migration 2 failed: syntax error')
    expect(applied).toEqual(new Set([1]))
    expect(log).toContain('ROLLBACK')
    expect(log[log.length - 1]).toBe('SELECT pg_advisory_unlock($1)')
  })

  it('never edits a shipped step: the first five are the original schema', () => {
    expect(MIGRATIONS.length).toBeGreaterThanOrEqual(5)
    expect(MIGRATIONS[0]).toMatch(/CREATE TABLE IF NOT EXISTS files/)
    expect(MIGRATIONS[4]).toMatch(/CREATE TABLE IF NOT EXISTS doc_states/)
  })
})
