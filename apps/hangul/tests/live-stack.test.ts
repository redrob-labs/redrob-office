/**
 * @vitest-environment node
 *
 * Live Hangul typing over the real sync service (spec task 5.6, the network
 * part): Postgres, the S3 store and the Hocuspocus server from
 * `services/sync/docker-compose.yml`, joined the way the shell joins
 * (`hocuspocusRooms` from `@genoffice/sync-client/live-provider`).
 *
 * Runs only when `HWP_LIVE_STACK_URL` names the stack's HTTP address
 * (http://127.0.0.1:8787 under Compose); the sync workflow sets it. Each round
 * shares a new file with 2 to 4 editors and one viewer, types at random through
 * each view's command bus, drops a view from the network and brings it back,
 * and then checks:
 *   - every view converges, and its engine holds the shared text;
 *   - the viewer joins read-only, and the server refuses a write on its connection;
 *   - a view that joins after everyone has left gets the text from the server's
 *     stored copy;
 *   - saving and reopening a view gives the same text back.
 */
import { beforeAll, describe, expect, it } from 'vitest'
import { HwpCoreDocument, initHwpCoreNode } from '@genoffice/hwp-core/node'
import { CommandBus, LiveBinding, Session, sectionFlow, sectionKey, type Pos } from '@genoffice/hwp-editor'
import { hocuspocusRooms, liveUrlFor } from '@genoffice/sync-client/live-provider'
import type { LiveRoom } from '@genoffice/sync-client/live'

const BASE = process.env.HWP_LIVE_STACK_URL
const ROUNDS = Number(process.env.HWP_LIVE_STACK_ROUNDS) || 3
const STEPS = 30

beforeAll(() => initHwpCoreNode())

const P = (para: number, offset: number): Pos => ({ section: 0, para, offset })
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function rng(seed: number) {
  let x = seed >>> 0 || 1
  return (n: number) => {
    x ^= x << 13
    x ^= x >>> 17
    x ^= x << 5
    return (x >>> 0) % n
  }
}

async function token(sub: string, name: string): Promise<string> {
  const r = await fetch(`${BASE}/dev/token`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ sub, name }) })
  expect(r.status).toBe(200)
  return ((await r.json()) as { token: string }).token
}

/** A shared file owned by `owner`, with the others as members. */
async function share(owner: string, members: Array<{ sub: string; role: 'edit' | 'view' }>, tokens: Map<string, string>): Promise<string> {
  const h = { authorization: `Bearer ${tokens.get(owner)}`, 'content-type': 'application/json' }
  const created = await fetch(`${BASE}/files`, { method: 'POST', headers: h, body: JSON.stringify({ name: '공유.hwpx' }) })
  expect(created.status).toBe(201)
  const { id } = (await created.json()) as { id: string }
  for (const m of members) {
    const r = await fetch(`${BASE}/files/${id}/members/${m.sub}`, { method: 'PUT', headers: h, body: JSON.stringify({ role: m.role, name: m.sub }) })
    expect(r.status).toBe(200)
  }
  return id
}

function base(lines: string[]): Uint8Array {
  const s = new Session(HwpCoreDocument.blank(), 'hwpx')
  let p = P(0, 0)
  lines.forEach((l, i) => {
    if (i > 0) p = s.text.split(p)
    p = s.text.insert(p, l)
  })
  return s.export('hwpx')
}

interface View {
  sub: string
  s: Session
  bus: CommandBus
  room: LiveRoom
  live: LiveBinding
  readOnly: boolean
}

async function join(fileId: string, sub: string, bytes: Uint8Array, tokens: Map<string, string>, seed: boolean): Promise<View> {
  const rooms = hocuspocusRooms({ url: liveUrlFor(BASE!)!, token: async () => tokens.get(sub) ?? null, timeoutMs: 15_000 })
  const room = rooms(fileId)
  const { readOnly } = await room.ready
  const s = new Session(HwpCoreDocument.open(bytes), 'hwpx')
  const bus = new CommandBus(s)
  const live = new LiveBinding(s, room.doc, bus, { seed: seed && !readOnly, readOnly })
  return { sub, s, bus, room, live, readOnly }
}

function leave(v: View): void {
  v.live.destroy()
  v.room.destroy()
}

function step(v: View, rnd: (n: number) => number): string {
  const s = v.s
  const para = rnd(s.doc.paragraphCount(0))
  const at = P(para, rnd(s.doc.paragraphLength(0, para) + 1))
  s.select({ anchor: at, head: at })
  const k = rnd(12)
  if (k < 6) return v.bus.run('edit:insert-text', { text: ['가', '나', 'A', ' ', '한글', '제3조'][rnd(6)]! }), 'type'
  if (k < 8) return v.bus.run('edit:delete-backward'), 'backspace'
  if (k < 9) return v.bus.run('edit:split-paragraph'), 'enter'
  if (k < 10) return v.bus.run('edit:insert-text', { text: '줄1\n줄2' }), 'paste'
  if (k < 11) return v.bus.run('edit:undo'), 'undo'
  return v.bus.run('edit:redo'), 'redo'
}

const shared = (v: View) => v.room.doc.getText(sectionKey(0)).toString()

/** Wait until every view holds the same shared text. */
async function converged(views: View[], ms = 20_000): Promise<string> {
  const until = Date.now() + ms
  for (;;) {
    const texts = views.map(shared)
    if (texts.every((t) => t === texts[0])) {
      // and stays that way for a moment (nothing still in flight)
      await sleep(300)
      const again = views.map(shared)
      if (again.every((t) => t === texts[0])) return texts[0]!
    }
    if (Date.now() > until) return texts[0]!
    await sleep(100)
  }
}

describe.skipIf(!BASE)('live Hangul typing over the sync stack (task 5.6)', () => {
  it(`converges for ${ROUNDS} rounds of editors, a viewer, a reconnect and a late joiner`, async () => {
    for (let round = 0; round < ROUNDS; round++) {
      const seed = 0x51ac + round * 104729
      const rnd = rng(seed)
      const editors = 2 + rnd(3)
      const subs = Array.from({ length: editors }, (_, i) => `r${round}-ed${i}`)
      const viewer = `r${round}-viewer`
      const tokens = new Map<string, string>()
      for (const sub of [...subs, viewer]) tokens.set(sub, await token(sub, sub))
      const fileId = await share(subs[0]!, [...subs.slice(1).map((sub) => ({ sub, role: 'edit' as const })), { sub: viewer, role: 'view' }], tokens)
      const bytes = base(['제1조(목적) 이 계약은', '제2조(정의) 다음과 같다.'])

      const views: View[] = []
      views.push(await join(fileId, subs[0]!, bytes, tokens, true))
      for (const sub of subs.slice(1)) views.push(await join(fileId, sub, bytes, tokens, false))
      const watcher = await join(fileId, viewer, bytes, tokens, false)
      expect(watcher.readOnly).toBe(true)
      await converged([...views, watcher])

      const log: string[] = []
      const dropAt = rnd(STEPS)
      for (let i = 0; i < STEPS; i++) {
        const k = rnd(views.length)
        if (i === dropAt && views.length > 1) {
          // Someone's connection drops; they come back on a new connection with their own text.
          const gone = views[k]!
          const kept = gone.s.export('hwpx')
          leave(gone)
          await sleep(200)
          views[k] = await join(fileId, gone.sub, kept, tokens, false)
          log.push(`${gone.sub}:reconnect`)
          continue
        }
        log.push(`${views[k]!.sub}:${step(views[k]!, rnd)}`)
        if (rnd(4) === 0) await sleep(rnd(60))
      }
      const all = [...views, watcher]
      const want = await converged(all)
      const why = `seed ${seed}: ${log.slice(-12).join(' ')}`
      for (const v of all) {
        expect(shared(v), `${why} (${v.sub} shared text)`).toBe(want)
        expect(sectionFlow(v.s, 0), `${why} (${v.sub} engine)`).toBe(want)
      }
      // A viewer's connection that writes anyway (the editor never would) is refused by the server.
      const rogue = hocuspocusRooms({ url: liveUrlFor(BASE!)!, token: async () => tokens.get(viewer) ?? null })(fileId)
      await rogue.ready
      rogue.doc.getText(sectionKey(0)).insert(0, '§')
      await sleep(1500)
      rogue.destroy()
      for (const v of all) expect(shared(v), `${why} (${v.sub} got the viewer's write)`).toBe(want)
      const saver = views[seed % views.length]!
      expect(sectionFlow(new Session(HwpCoreDocument.open(saver.s.export('hwpx')), 'hwpx'), 0), `${why} (reopened)`).toBe(want)

      // Everyone leaves; the server stores the document. A late joiner gets it from there.
      for (const v of all) leave(v)
      await sleep(2500)
      const late = await join(fileId, subs[0]!, bytes, tokens, false)
      expect(shared(late), `${why} (late joiner from the stored copy)`).toBe(want)
      expect(sectionFlow(late.s, 0), `${why} (late joiner engine)`).toBe(want)
      leave(late)
    }
  }, 240_000)
})

