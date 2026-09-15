/**
 * Assess must refuse transcripts that skipped VAD — hallucinated Whisper
 * lines would otherwise pass citation checks because they exist in the text.
 */
import { hostCompare } from "../inference-host.js";
import {
  assertTranscriptAssessable,
  toNumberedText,
  type TranscriptDocument,
} from "./types.js";

export async function assessTranscriptDocument(input: {
  transcript: TranscriptDocument;
  rubricId: string;
}): Promise<unknown> {
  assertTranscriptAssessable(input.transcript);
  return hostCompare({
    artifact: { kind: "text", content: toNumberedText(input.transcript) },
    rubricId: input.rubricId,
  });
}
