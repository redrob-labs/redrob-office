export * from './model'
export { factsReducer, MAX_SETTLED_UPDATES, type FactsAction } from './reducer'
export { normalizeFactDef, normalizeFactsState, normalizeFactUse } from './normalize'
export { FACTS_CHANNELS, type FactsApi, type FactsCommand } from './ipc'
export { factsBridge, type FactsBridgeApi, type FactsIpcLike } from './bridge'
export {
  FACT_ID_RE,
  factChoices,
  figureFieldName,
  parseFigureField,
  figureRewrites as placedFigureRewrites,
  insertText as figureInsertText,
  isFactId,
  keptText as keptFigureText,
  placedUse,
  syncUses as syncPlacedUses,
  type PlacedFigure,
} from './figures'
export { FactsStore, MemoryFactsRepository, type FactsListener, type FactsRepository } from './repository'
