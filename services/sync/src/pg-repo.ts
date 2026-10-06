import pg from 'pg'
import type { Role } from './access.ts'
import type { FileRecord, FileVersion, Invite, Member, Repo } from './repo.ts'

/**
 * The schema, one numbered step at a time. A step is applied once, inside a
 * transaction, and recorded in `schema_migrations`; never edit or reorder a
 * step that has shipped, add a new one at the end. The first five steps were
 * written to be idempotent before the table existed, so a database created
 * by an older service adopts them without change.
 */
export const MIGRATIONS: readonly string[] = [
  `CREATE TABLE IF NOT EXISTS files (
     id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
     name text NOT NULL,
     owner_sub text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now()
   )`,
  `CREATE TABLE IF NOT EXISTS members (
     file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
     sub text NOT NULL,
     name text NOT NULL,
     role text NOT NULL CHECK (role IN ('owner','edit','comment','view')),
     PRIMARY KEY (file_id, sub)
   )`,
  `CREATE INDEX IF NOT EXISTS members_sub ON members (sub)`,
  `CREATE TABLE IF NOT EXISTS file_versions (
     file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
     version integer NOT NULL,
     sha256 text NOT NULL,
     size bigint NOT NULL,
     blob_key text NOT NULL,
     created_by text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (file_id, version)
   )`,
  `CREATE TABLE IF NOT EXISTS doc_states (
     file_id uuid PRIMARY KEY REFERENCES files(id) ON DELETE CASCADE,
     state bytea NOT NULL,
     updated_at timestamptz NOT NULL DEFAULT now()
   )`,
  // 6: invites by verified e-mail, for people who have not signed in yet
  `CREATE TABLE invites (
     file_id uuid NOT NULL REFERENCES files(id) ON DELETE CASCADE,
     email text NOT NULL CHECK (email = lower(email)),
     role text NOT NULL CHECK (role IN ('edit','comment','view')),
     invited_by text NOT NULL,
     created_at timestamptz NOT NULL DEFAULT now(),
     PRIMARY KEY (file_id, email)
   );
   CREATE INDEX invites_email ON invites (email)`,
]

/** an arbitrary constant: the advisory lock that serialises migrations across service instances */
const MIGRATION_LOCK = 72_616_401

export interface Queryable {
  query(sql: string, params?: unknown[]): Promise<{ rows: Array<Record<string, unknown>> }>
}

/**
 * Applies the steps this database has not had yet, in order, each in its own
 * transaction, under an advisory lock so two instances starting together do
 * not race. Returns the step numbers applied (1-based).
 */
export async function migrate(pool: pg.Pool, steps: readonly string[] = MIGRATIONS): Promise<number[]> {
  const client = await pool.connect()
  try {
    return await migrateWith(client, steps)
  } finally {
    client.release()
  }
}

export async function migrateWith(db: Queryable, steps: readonly string[] = MIGRATIONS): Promise<number[]> {
  await db.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK])
  try {
    await db.query(
      `CREATE TABLE IF NOT EXISTS schema_migrations (
         version integer PRIMARY KEY,
         applied_at timestamptz NOT NULL DEFAULT now()
       )`,
    )
    const { rows } = await db.query('SELECT version FROM schema_migrations')
    const done = new Set(rows.map((r) => Number(r.version)))
    const applied: number[] = []
    for (let i = 0; i < steps.length; i++) {
      const n = i + 1
      if (done.has(n)) continue
      await db.query('BEGIN')
      try {
        await db.query(steps[i]!)
        await db.query('INSERT INTO schema_migrations (version) VALUES ($1)', [n])
        await db.query('COMMIT')
      } catch (err) {
        await db.query('ROLLBACK')
        throw new Error(`Migration ${n} failed: ${(err as Error).message}`)
      }
      applied.push(n)
    }
    return applied
  } finally {
    await db.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK])
  }
}

const iso = (v: unknown) => (v instanceof Date ? v.toISOString() : String(v))

const file = (r: Record<string, unknown>): FileRecord => ({
  id: String(r.id),
  name: String(r.name),
  ownerSub: String(r.owner_sub),
  createdAt: iso(r.created_at),
})

const version = (r: Record<string, unknown>): FileVersion => ({
  fileId: String(r.file_id),
  version: Number(r.version),
  sha256: String(r.sha256),
  size: Number(r.size),
  blobKey: String(r.blob_key),
  createdBy: String(r.created_by),
  createdAt: iso(r.created_at),
})

export class PgRepo implements Repo {
  private readonly pool: pg.Pool
  constructor(pool: pg.Pool) {
    this.pool = pool
  }

  static async connect(url: string): Promise<PgRepo> {
    const pool = new pg.Pool({ connectionString: url, max: 10 })
    await migrate(pool)
    return new PgRepo(pool)
  }

  close() {
    return this.pool.end()
  }

  async createFile(name: string, owner: { sub: string; name: string }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('INSERT INTO files (name, owner_sub) VALUES ($1, $2) RETURNING *', [name, owner.sub])
      const f = file(rows[0])
      await client.query("INSERT INTO members (file_id, sub, name, role) VALUES ($1, $2, $3, 'owner')", [f.id, owner.sub, owner.name])
      await client.query('COMMIT')
      return f
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
  async getFile(id: string) {
    const { rows } = await this.pool.query('SELECT * FROM files WHERE id = $1', [id])
    return rows[0] ? file(rows[0]) : null
  }
  async listFiles(sub: string) {
    const { rows } = await this.pool.query(
      `SELECT f.*, m.role, (SELECT count(*) FROM members x WHERE x.file_id = f.id) AS member_count
       FROM files f JOIN members m ON m.file_id = f.id WHERE m.sub = $1 ORDER BY f.created_at DESC`,
      [sub],
    )
    return rows.map((r) => ({ ...file(r), role: r.role as Role, memberCount: Number(r.member_count) }))
  }
  async deleteFile(id: string) {
    await this.pool.query('DELETE FROM files WHERE id = $1', [id])
  }
  async renameFile(id: string, name: string) {
    await this.pool.query('UPDATE files SET name = $2 WHERE id = $1', [id, name])
  }
  async transferOwnership(fileId: string, fromSub: string, toSub: string) {
    if (fromSub === toSub) return false
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      // lock both rows so two transfers (or a role change) cannot interleave
      const { rows } = await client.query(
        'SELECT sub, role FROM members WHERE file_id = $1 AND sub = ANY($2::text[]) FOR UPDATE',
        [fileId, [fromSub, toSub]],
      )
      const role = (s: string) => rows.find((r) => r.sub === s)?.role
      if (role(fromSub) !== 'owner' || role(toSub) !== 'edit') {
        await client.query('ROLLBACK')
        return false
      }
      await client.query("UPDATE members SET role = 'edit' WHERE file_id = $1 AND sub = $2", [fileId, fromSub])
      await client.query("UPDATE members SET role = 'owner' WHERE file_id = $1 AND sub = $2", [fileId, toSub])
      await client.query('UPDATE files SET owner_sub = $2 WHERE id = $1', [fileId, toSub])
      await client.query('COMMIT')
      return true
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
  async roleOf(fileId: string, sub: string) {
    const { rows } = await this.pool.query('SELECT role FROM members WHERE file_id = $1 AND sub = $2', [fileId, sub])
    return rows[0] ? (rows[0].role as Role) : null
  }
  async members(fileId: string): Promise<Member[]> {
    const { rows } = await this.pool.query('SELECT * FROM members WHERE file_id = $1 ORDER BY name', [fileId])
    return rows.map((r) => ({ fileId: String(r.file_id), sub: String(r.sub), name: String(r.name), role: r.role as Role }))
  }
  async setMember(m: Member) {
    await this.pool.query(
      'INSERT INTO members (file_id, sub, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (file_id, sub) DO UPDATE SET name = $3, role = $4',
      [m.fileId, m.sub, m.name, m.role],
    )
  }
  async removeMember(fileId: string, sub: string) {
    await this.pool.query('DELETE FROM members WHERE file_id = $1 AND sub = $2', [fileId, sub])
  }
  async addVersion(v: Omit<FileVersion, 'version' | 'createdAt'>) {
    const { rows } = await this.pool.query(
      `INSERT INTO file_versions (file_id, version, sha256, size, blob_key, created_by)
       VALUES ($1, COALESCE((SELECT max(version) FROM file_versions WHERE file_id = $1), 0) + 1, $2, $3, $4, $5)
       RETURNING *`,
      [v.fileId, v.sha256, v.size, v.blobKey, v.createdBy],
    )
    return version(rows[0])
  }
  async latestVersion(fileId: string) {
    const { rows } = await this.pool.query('SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version DESC LIMIT 1', [fileId])
    return rows[0] ? version(rows[0]) : null
  }
  async version(fileId: string, v: number) {
    const { rows } = await this.pool.query('SELECT * FROM file_versions WHERE file_id = $1 AND version = $2', [fileId, v])
    return rows[0] ? version(rows[0]) : null
  }
  async versions(fileId: string) {
    const { rows } = await this.pool.query('SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version DESC', [fileId])
    return rows.map(version)
  }
  async setInvite(i: Omit<Invite, 'createdAt'>) {
    await this.pool.query(
      `INSERT INTO invites (file_id, email, role, invited_by) VALUES ($1, $2, $3, $4)
       ON CONFLICT (file_id, email) DO UPDATE SET role = $3, invited_by = $4`,
      [i.fileId, i.email, i.role, i.invitedBy],
    )
  }
  async invites(fileId: string): Promise<Invite[]> {
    const { rows } = await this.pool.query('SELECT * FROM invites WHERE file_id = $1 ORDER BY email', [fileId])
    return rows.map((r) => ({
      fileId: String(r.file_id),
      email: String(r.email),
      role: r.role as Role,
      invitedBy: String(r.invited_by),
      createdAt: iso(r.created_at),
    }))
  }
  async removeInvite(fileId: string, email: string) {
    await this.pool.query('DELETE FROM invites WHERE file_id = $1 AND email = $2', [fileId, email])
  }
  async claimInvites(email: string, who: { sub: string; name: string }) {
    const client = await this.pool.connect()
    try {
      await client.query('BEGIN')
      const { rows } = await client.query('DELETE FROM invites WHERE email = $1 RETURNING file_id, role', [email])
      const joined: string[] = []
      for (const r of rows) {
        // an existing membership (an owner above all) is never changed by an invite
        const ins = await client.query(
          'INSERT INTO members (file_id, sub, name, role) VALUES ($1, $2, $3, $4) ON CONFLICT (file_id, sub) DO NOTHING',
          [r.file_id, who.sub, who.name, r.role],
        )
        if (ins.rowCount) joined.push(String(r.file_id))
      }
      await client.query('COMMIT')
      return joined
    } catch (err) {
      await client.query('ROLLBACK')
      throw err
    } finally {
      client.release()
    }
  }
  async loadDoc(fileId: string) {
    const { rows } = await this.pool.query('SELECT state FROM doc_states WHERE file_id = $1', [fileId])
    return rows[0] ? new Uint8Array(rows[0].state as Buffer) : null
  }
  async storeDoc(fileId: string, state: Uint8Array) {
    // a room that closes after its file was deleted stores nothing
    await this.pool.query(
      `INSERT INTO doc_states (file_id, state)
       SELECT $1, $2 WHERE EXISTS (SELECT 1 FROM files WHERE id = $1)
       ON CONFLICT (file_id) DO UPDATE SET state = $2, updated_at = now()`,
      [fileId, Buffer.from(state)],
    )
  }
}
