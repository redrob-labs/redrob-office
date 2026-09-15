/**

 * Prompt layout for prefix reuse. Order must stay fixed or KV reuse is invalid.

 *   [system + schema/fields] + [document / rubric] + [query]

 */



export interface InferencePromptParts {

  system: string;

  /** Schema, field list, rubric axes — structural instructions. */

  schema: string;

  /** Document or numbered artifact / facts. */

  document: string;

  /** Optional per-turn query (axis label, user question, …). */

  query?: string;

}



export function assembleInferencePrompt(parts: InferencePromptParts): string {

  const blocks = [parts.system.trim(), parts.schema.trim(), "Document:", parts.document.trim()];

  const query = parts.query?.trim();

  if (query) {

    blocks.push("", "Query:", query);

  }

  return blocks.filter((block) => block.length > 0).join("\n");

}



/**

 * Fit document into a context budget (CPU path uses 4096).

 * Uses a conservative chars≈tokens heuristic so we can truncate before tokenize.

 * Returns a notice string when truncated (caller should surface it).

 */

export function truncateDocumentForContext(

  document: string,

  contextSize: number,

  reservedTokens = 768,

): { document: string; truncated: boolean; notice: string | null } {

  const budgetChars = Math.max(512, (contextSize - reservedTokens) * 3);

  if (document.length <= budgetChars) {

    return { document, truncated: false, notice: null };

  }

  const sliced = document.slice(0, budgetChars);

  const notice = `Document truncated to fit contextSize=${contextSize} (kept ~${budgetChars} chars of ${document.length}).`;

  return { document: sliced, truncated: true, notice };

}


