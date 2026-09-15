export interface TranscriptLine {
  n: number;
  text: string;
  startMs: number;
  endMs: number;
  speaker?: string;
}

export interface TranscriptDocument {
  lines: TranscriptLine[];
  provenance: {
    model: string;
    vadApplied: boolean;
    vadModel: string;
    origin: "local";
    speechRatio?: number;
    vadThreshold?: number;
  };
  consentId?: string;
}

/** Prevent assessment from citing transcripts that did not pass local VAD. */
export function assertTranscriptAssessable(doc: TranscriptDocument): void {
  if (!doc.provenance.vadApplied) {
    throw new Error("Transcript is not assessable: VAD was not applied");
  }
  if (doc.provenance.origin !== "local") {
    throw new Error("Transcript is not assessable: origin must be local");
  }
}

/** Match the shared numberLines format: one-based `N|text` records. */
export function toNumberedText(doc: TranscriptDocument): string {
  return doc.lines.map((line) => `${line.n}|${line.text}`).join("\n");
}
