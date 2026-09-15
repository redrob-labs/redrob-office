export const STORE_TABLES = [
  "documents",
  "fields",
  "corrections",
  "entities",
  "entity_links",
  "runs",
  "findings",
  "audit",
  "memories",
  "chat_sessions",
] as const;

export type StoreTable = (typeof STORE_TABLES)[number];

export function requiredStoreTables(): readonly StoreTable[] {
  return STORE_TABLES;
}

export { openStore, type Store } from "./db.js";
export { phoneticNormalize, phoneSuffix } from "./identity.js";
export { logCorrection, listCorrections, type Correction, type LogCorrectionInput } from "./repos/corrections.js";
export {
  upsertField,
  markReviewed,
  getField,
  listUnreviewedFieldsBelowThreshold,
  listFieldsByDocument,
  type Field,
  type UpsertFieldInput,
} from "./repos/fields.js";
export { upsertDocument, getDocument, listDocuments, type Document } from "./repos/documents.js";
export { appendAudit, listAudit, type AuditEntry } from "./repos/audit.js";
export {
  linkEntity,
  findDuplicateDocumentIds,
  type Entity,
  type EntityCandidate,
  type EntityLink,
  type LinkMethod,
} from "./repos/entities.js";
export { createRun, updateRun, getRun, type Run } from "./repos/runs.js";
export {
  insertFinding,
  listFindingsByRun,
  listRecentFindings,
  type Finding,
  type UpsertFindingInput,
} from "./repos/findings.js";
export {
  listMemories,
  addMemory,
  updateMemory,
  deleteMemory,
  importMemories,
  type Memory,
  type MemorySource,
  type AddMemoryInput,
} from "./repos/memories.js";
export {
  listChatSessions,
  getChatSession,
  saveChatSession,
  renameChatSession,
  autotitleChatSession,
  setChatSessionPinned,
  deleteChatSession,
  type ChatSessionSummary,
  type ChatSessionRecord,
  type SaveChatSessionInput,
} from "./repos/chat-sessions.js";
