import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { nowIso } from "../../app-time.js";

// PLACEHOLDER LEGAL — RELEASE BLOCKER. Counsel must supply final consent copy.
export interface ConsentRecord {
  id: string;
  at: string;
  speakerKind: "self" | "others";
  /** Whether the caller acknowledged placeholder legal copy (must not invent `true`). */
  acknowledgedPlaceholders: boolean;
  note?: string;
}

export function consentPath(userData: string): string {
  return join(userData, "asr-consent.json");
}

export async function listConsentRecords(userData: string): Promise<ConsentRecord[]> {
  try {
    const raw = await readFile(consentPath(userData), "utf8");
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed) ? (parsed as ConsentRecord[]) : [];
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw error;
  }
}

/**
 * Creates an auditable acknowledgement. Record it with saveConsentRecord before
 * starting a transcription; recordings containing other people require the explicit flag.
 * Persists the caller's acknowledgement bit — never force `true`.
 */
export function requireConsent(
  speakerKind: ConsentRecord["speakerKind"],
  acknowledgedPlaceholders?: boolean,
  note?: string,
): ConsentRecord {
  const acknowledged = acknowledgedPlaceholders ?? false;
  if (speakerKind === "others" && !acknowledged) {
    throw new Error("Consent required: recordings of others need explicit acknowledgement");
  }
  if (!acknowledged) {
    throw new Error("Consent required: placeholder legal copy must be acknowledged");
  }
  return {
    id: randomUUID(),
    at: nowIso(),
    speakerKind,
    acknowledgedPlaceholders: acknowledged,
    ...(note?.trim() ? { note: note.trim() } : {}),
  };
}

export async function saveConsentRecord(userData: string, record: ConsentRecord): Promise<void> {
  const path = consentPath(userData);
  await mkdir(join(userData), { recursive: true });
  const records = await listConsentRecords(userData);
  records.push(record);
  await writeFile(path, `${JSON.stringify(records, null, 2)}\n`, "utf8");
}
