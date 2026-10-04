import pg from 'pg'
import type { Role } from './access.ts'
import type { FileRecord, FileVersion, Member, Repo } from './repo.ts'

/** Applied in order at start; each statement is idempotent. */
export const MIGRATIONS = [
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
]

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
    for (const sql of MIGRATIONS) await pool.query(sql)
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
      'SELECT f.*, m.role FROM files f JOIN members m ON m.file_id = f.id WHERE m.sub = $1 ORDER BY f.created_at DESC',
      [sub],
    )
    return rows.map((r) => ({ ...file(r), role: r.role as Role }))
  }
  async deleteFile(id: string) {
    await this.pool.query('DELETE FROM files WHERE id = $1', [id])
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
  async versions(fileId: string) {
    const { rows } = await this.pool.query('SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version DESC', [fileId])
    return rows.map(version)
  }
  async loadDoc(fileId: string) {
    const { rows } = await this.pool.query('SELECT state FROM doc_states WHERE file_id = $1', [fileId])
    return rows[0] ? new Uint8Array(rows[0].state as Buffer) : null
  }
  async storeDoc(fileId: string, state: Uint8Array) {
    await this.pool.query(
      'INSERT INTO doc_states (file_id, state) VALUES ($1, $2) ON CONFLICT (file_id) DO UPDATE SET state = $2, updated_at = now()',
      [fileId, Buffer.from(state)],
    )
  }
}
