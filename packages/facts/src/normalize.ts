import {
  emptyFactsState,
  type Decision,
  type FactDef,
  type FactsState,
  type FactUpdate,
  type FactUse,
  type FileDecision,
  type SentenceBand,
} from './model'

const DECISIONS: ReadonlySet<string> = new Set(['open', 'kept', 'undone', 'replaced', 'self'])
const KINDS: ReadonlySet<string> = new Set(['value', 'derived', 'sentence'])

type Obj = Record<string, unknown>
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v)
const isStr = (v: unknown): v is string => typeof v === 'string' && v.length > 0
const isNum = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v)

function band(v: unknown): SentenceBand | null {
  if (!isObj(v) || typeof v.words !== 'string') return null
  return isNum(v.below) ? { below: v.below, words: v.words } : { words: v.words }
}

function fact(id: string, v: unknown): FactDef | null {
  if (!isObj(v) || !isStr(v.label) || !isObj(v.source) || !isStr(v.source.file) || typeof v.source.ref !== 'string') return null
  const out: FactDef = { id, label: v.label, source: { file: v.source.file, ref: v.source.ref } }
  if (Array.isArray(v.bands)) {
    const bands = v.bands.map(band).filter((b): b is SentenceBand => b !== null)
    if (bands.length) out.bands = bands
  }
  return out
}

function use(v: unknown): FactUse | null {
  if (!isObj(v) || !isStr(v.fact) || typeof v.kind !== 'string' || !KINDS.has(v.kind) || typeof v.where !== 'string') return null
  return { fact: v.fact, kind: v.kind as FactUse['kind'], where: v.where }
}

function decision(v: unknown): Decision | null {
  return typeof v === 'string' && DECISIONS.has(v) ? (v as Decision) : null
}

function update(v: unknown): FactUpdate | null {
  if (!isObj(v) || !isStr(v.id) || !isStr(v.fact) || !isNum(v.from) || !isNum(v.to)) return null
  if (typeof v.by !== 'string' || typeof v.at !== 'string' || typeof v.where !== 'string' || !isObj(v.files)) return null
  const files: Record<string, FileDecision> = {}
  for (const [f, d] of Object.entries(v.files)) {
    if (!isObj(d)) continue
    const figures = decision(d.figures)
    if (!figures) continue
    files[f] = { figures, sentence: decision(d.sentence) }
  }
  return { id: v.id, fact: v.fact, from: v.from, to: v.to, by: v.by, at: v.at, where: v.where, files }
}

function numberMap(v: unknown): Record<string, Record<string, number>> {
  const out: Record<string, Record<string, number>> = {}
  if (!isObj(v)) return out
  for (const [k, inner] of Object.entries(v)) {
    if (!isObj(inner)) continue
    const row: Record<string, number> = {}
    for (const [f, n] of Object.entries(inner)) if (isNum(n)) row[f] = n
    out[k] = row
  }
  return out
}

/**
 * Reads a stored state defensively. Anything malformed is dropped rather than
 * trusted; a value that does not parse at all yields the empty state.
 */
export function normalizeFactsState(raw: unknown): FactsState {
  const out = emptyFactsState()
  if (!isObj(raw) || raw.version !== 1) return out
  if (isObj(raw.facts)) {
    for (const [id, v] of Object.entries(raw.facts)) {
      const f = fact(id, v)
      if (f) out.facts[id] = f
    }
  }
  if (isObj(raw.values)) {
    for (const [id, v] of Object.entries(raw.values)) if (isNum(v) && id in out.facts) out.values[id] = v
  }
  if (isObj(raw.uses)) {
    for (const [file, list] of Object.entries(raw.uses)) {
      if (!Array.isArray(list)) continue
      const uses = list.map(use).filter((u): u is FactUse => u !== null && u.fact in out.values)
      if (uses.length) out.uses[file] = uses
    }
  }
  out.kept = numberMap(raw.kept)
  out.keptWords = numberMap(raw.keptWords)
  if (Array.isArray(raw.updates)) {
    out.updates = raw.updates.map(update).filter((u): u is FactUpdate => u !== null && u.fact in out.values)
  }
  return out
}
