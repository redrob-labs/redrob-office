import { createHash, randomUUID } from "node:crypto";
import type Database from "better-sqlite3";
import { phoneticNormalize, phoneSuffix } from "../identity.js";
import type { Store } from "../db.js";

export type LinkMethod = "exact_block" | "embedding" | "model_adjudication";

export interface Entity {
  id: string;
  displayName: string;
  phoneticKey: string;
  dob: string | null;
  phoneSuffix: string | null;
  createdAt: string;
}

export interface EntityCandidate {
  displayName: string;
  dob?: string;
  phone?: string;
  documentId: string;
}

export interface EntityLink {
  id: string;
  documentId: string;
  entityId: string;
  method: LinkMethod;
  score: number;
  createdAt: string;
}

function blockingKey(candidate: EntityCandidate): string {
  const phone = candidate.phone ? phoneSuffix(candidate.phone) : "";
  const dob = candidate.dob?.trim() ?? "";
  return `${phoneticNormalize(candidate.displayName)}|${dob}|${phone}`;
}

/**
 * Block on normalised phonetic key + DOB + phone suffix.
 * Embedding / model adjudication hooks are explicit next steps — this records
 * which method decided each link and never silently claims embedding matches.
 */
export function linkEntity(store: Store, candidate: EntityCandidate): EntityLink {
  const key = blockingKey(candidate);
  const existing = store.db
    .prepare(
      `SELECT id, display_name AS displayName, phonetic_key AS phoneticKey,
              dob, phone_suffix AS phoneSuffix, created_at AS createdAt
       FROM entities WHERE phonetic_key = ? AND IFNULL(dob, '') = ? AND IFNULL(phone_suffix, '') = ?`,
    )
    .get(
      phoneticNormalize(candidate.displayName),
      candidate.dob?.trim() ?? "",
      candidate.phone ? phoneSuffix(candidate.phone) : "",
    ) as Entity | undefined;

  let entityId: string;
  let method: LinkMethod = "exact_block";
  let score = 1;

  if (existing) {
    entityId = existing.id;
  } else {
    entityId = `ent_${createHash("sha256").update(key).digest("hex").slice(0, 16)}`;
    store.db
      .prepare(
        `INSERT INTO entities (id, display_name, phonetic_key, dob, phone_suffix, embedding, created_at)
         VALUES (@id, @displayName, @phoneticKey, @dob, @phoneSuffix, NULL, @createdAt)`,
      )
      .run({
        id: entityId,
        displayName: candidate.displayName,
        phoneticKey: phoneticNormalize(candidate.displayName),
        dob: candidate.dob?.trim() ?? null,
        phoneSuffix: candidate.phone ? phoneSuffix(candidate.phone) : null,
        createdAt: new Date().toISOString(),
      });
  }

  const link: EntityLink = {
    id: randomUUID(),
    documentId: candidate.documentId,
    entityId,
    method,
    score,
    createdAt: new Date().toISOString(),
  };
  store.db
    .prepare(
      `INSERT INTO entity_links (id, document_id, entity_id, method, score, created_at)
       VALUES (@id, @documentId, @entityId, @method, @score, @createdAt)`,
    )
    .run(link);
  return link;
}

export function findDuplicateDocumentIds(db: Database.Database, entityId: string): string[] {
  const rows = db
    .prepare(`SELECT document_id AS documentId FROM entity_links WHERE entity_id = ?`)
    .all(entityId) as Array<{ documentId: string }>;
  return rows.map((row) => row.documentId);
}
