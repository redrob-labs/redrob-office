import { nowIso } from "./clock";

const STORAGE_KEY = "redrob.assessHandoff.v1";

export type AssessHandoff = {
  documentId: string;
  scoresText: string;
  recommendation: string;
  updatedAt: string;
};

export function saveAssessHandoff(input: Omit<AssessHandoff, "updatedAt">): void {
  try {
    const payload: AssessHandoff = {
      ...input,
      updatedAt: nowIso(),
    };
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  } catch {
    // ignore
  }
}

export function loadAssessHandoff(documentId?: string): AssessHandoff | null {
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as AssessHandoff;
    if (documentId && parsed.documentId !== documentId) return null;
    return parsed;
  } catch {
    return null;
  }
}
