import {
  bandOf,
  fileHasSentence,
  filesUsing,
  sameValue,
  type Decision,
  type FactDef,
  type FactId,
  type FactsState,
  type FactUpdate,
  type FactUse,
  type FileDecision,
  type FileId,
} from './model'

export type FactsAction =
  /** Add a fact, or change its label, source or bands. An existing value is never overwritten here. */
  | { type: 'defineFact'; fact: FactDef; value: number }
  /** A file starts using a fact; it keeps the current value. */
  | { type: 'useFact'; file: FileId; use: FactUse }
  /** A file stops using a fact, at one place (`where`) or everywhere. */
  | { type: 'dropUse'; file: FileId; fact: FactId; where?: string }
  /** Edit the source value from `file`: that file changes now, every other one waits. */
  | { type: 'editSource'; fact: FactId; file: FileId; to: number; by: string; at: string; id: string }
  /** Take the update's value for the file's figures. */
  | { type: 'keepFile'; update: string; file: FileId }
  /** Keep the file's figures as they were. */
  | { type: 'keepOld'; update: string; file: FileId }
  /** Take Redrob's rewrite of the file's dependent sentence. */
  | { type: 'keepSentence'; update: string; file: FileId }
  /** Keep the file's sentence as it was. */
  | { type: 'declineSentence'; update: string; file: FileId }

/** Settled updates kept for history; open ones are never dropped. */
export const MAX_SETTLED_UPDATES = 200

function settledCap(updates: FactUpdate[]): FactUpdate[] {
  let settled = 0
  return updates.filter((u) => {
    const open = Object.values(u.files).some((d) => d.figures === 'open' || d.sentence === 'open')
    if (open) return true
    settled += 1
    return settled <= MAX_SETTLED_UPDATES
  })
}

function setIn(map: Record<FactId, Record<FileId, number>>, fact: FactId, file: FileId, v: number) {
  return { ...map, [fact]: { ...(map[fact] ?? {}), [file]: v } }
}

function withoutFile(map: Record<FactId, Record<FileId, number>>, fact: FactId, file: FileId) {
  const inner = map[fact]
  if (!inner || !(file in inner)) return map
  const { [file]: _gone, ...rest } = inner
  return { ...map, [fact]: rest }
}

function editSource(state: FactsState, a: Extract<FactsAction, { type: 'editSource' }>): FactsState {
  const from = state.values[a.fact]
  if (from === undefined || !Number.isFinite(a.to) || sameValue(from, a.to)) return state
  const def = state.facts[a.fact]
  const bandMoved = bandOf(def, from) !== bandOf(def, a.to)

  const files: Record<FileId, FileDecision> = {}
  for (const f of filesUsing(state, a.fact)) {
    files[f] = {
      figures: f === a.file ? 'self' : 'open',
      sentence: fileHasSentence(state, f, a.fact) && bandMoved ? 'open' : null,
    }
  }
  const update: FactUpdate = { id: a.id, fact: a.fact, from, to: a.to, by: a.by, at: a.at, where: a.file, files }

  // A newer change replaces anything still open from an older one of the same fact.
  const replace = (d: Decision | null): Decision | null => (d === 'open' ? 'replaced' : d)
  const older = state.updates.map((u) =>
    u.fact !== a.fact
      ? u
      : {
          ...u,
          files: Object.fromEntries(
            Object.entries(u.files).map(([f, d]) => [f, { figures: replace(d.figures) as Decision, sentence: replace(d.sentence) }]),
          ),
        },
  )

  // The file the edit was made in changes at once.
  const kept = a.file in files ? setIn(state.kept, a.fact, a.file, a.to) : state.kept
  // The editing file's sentence still reads true when the band did not move.
  let keptWords = state.keptWords
  if (!bandMoved && state.keptWords[a.fact]?.[a.file] !== undefined) {
    keptWords = setIn(keptWords, a.fact, a.file, a.to)
  }

  return {
    ...state,
    values: { ...state.values, [a.fact]: a.to },
    kept,
    keptWords,
    updates: settledCap([update, ...older]),
  }
}

function decide(state: FactsState, updateId: string, file: FileId, part: 'figures' | 'sentence', v: 'kept' | 'undone'): FactsState {
  const u = state.updates.find((x) => x.id === updateId)
  const d = u?.files[file]
  if (!u || !d || d[part] !== 'open') return state
  const updates = state.updates.map((x) =>
    x.id !== updateId ? x : { ...x, files: { ...x.files, [file]: { ...d, [part]: v } } },
  )
  if (v === 'undone') return { ...state, updates }
  return part === 'figures'
    ? { ...state, updates, kept: setIn(state.kept, u.fact, file, u.to) }
    : { ...state, updates, keptWords: setIn(state.keptWords, u.fact, file, u.to) }
}

function sameUse(a: FactUse, b: FactUse) {
  return a.fact === b.fact && a.kind === b.kind && a.where === b.where
}

export function factsReducer(state: FactsState, action: FactsAction): FactsState {
  switch (action.type) {
    case 'defineFact': {
      const { fact, value } = action
      if (!fact.id || !Number.isFinite(value)) return state
      const values = fact.id in state.values ? state.values : { ...state.values, [fact.id]: value }
      return { ...state, facts: { ...state.facts, [fact.id]: fact }, values }
    }
    case 'useFact': {
      const { file, use } = action
      const value = state.values[use.fact]
      if (value === undefined) return state
      const list = state.uses[file] ?? []
      if (list.some((u) => sameUse(u, use))) return state
      const kept = state.kept[use.fact]?.[file] === undefined ? setIn(state.kept, use.fact, file, value) : state.kept
      const keptWords =
        use.kind === 'sentence' && state.keptWords[use.fact]?.[file] === undefined
          ? setIn(state.keptWords, use.fact, file, value)
          : state.keptWords
      return { ...state, uses: { ...state.uses, [file]: [...list, use] }, kept, keptWords }
    }
    case 'dropUse': {
      const { file, fact, where } = action
      const list = state.uses[file] ?? []
      const rest = list.filter((u) => !(u.fact === fact && (where === undefined || u.where === where)))
      if (rest.length === list.length) return state
      const uses = { ...state.uses }
      if (rest.length) uses[file] = rest
      else delete uses[file]
      let next: FactsState = { ...state, uses }
      const stillValue = rest.some((u) => u.fact === fact)
      const stillSentence = rest.some((u) => u.fact === fact && u.kind === 'sentence')
      if (!stillValue) next = { ...next, kept: withoutFile(next.kept, fact, file) }
      if (!stillSentence) next = { ...next, keptWords: withoutFile(next.keptWords, fact, file) }
      // Nothing left to decide for a file that no longer shows the figure.
      next = {
        ...next,
        updates: next.updates.map((u) => {
          const d = u.files[file]
          if (u.fact !== fact || !d) return u
          const nd: FileDecision = {
            figures: !stillValue && d.figures === 'open' ? 'replaced' : d.figures,
            sentence: !stillSentence && d.sentence === 'open' ? 'replaced' : d.sentence,
          }
          return { ...u, files: { ...u.files, [file]: nd } }
        }),
      }
      return next
    }
    case 'editSource':
      return editSource(state, action)
    case 'keepFile':
      return decide(state, action.update, action.file, 'figures', 'kept')
    case 'keepOld':
      return decide(state, action.update, action.file, 'figures', 'undone')
    case 'keepSentence':
      return decide(state, action.update, action.file, 'sentence', 'kept')
    case 'declineSentence':
      return decide(state, action.update, action.file, 'sentence', 'undone')
    default:
      return state
  }
}
