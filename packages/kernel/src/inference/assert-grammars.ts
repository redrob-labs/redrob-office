/*
 * Copyright 2026 Redrob
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

import {
  fieldValueToGbnf,
  schemaFieldsToFillable,
  type FillableField,
} from "../field-fill-grammar.js";
import { grammarCacheKey, hashDocument } from "./grammar-cache.js";
import { llamaServerAuthHeaders, requireLlamaServerBaseUrl } from "./llama-server.js";
import { applyExecutionPlan } from "./runtime.js";

/**
 * Ask the server to parse a GBNF without generating anything meaningful.
 * llama-server builds the grammar when it accepts the task, so a malformed one
 * comes back as an HTTP error rather than surfacing mid-extraction later.
 */
async function assertGrammarParses(baseUrl: string, gbnf: string, label: string): Promise<void> {
  const response = await fetch(`${baseUrl}/completion`, {
    method: "POST",
    headers: { "content-type": "application/json", ...llamaServerAuthHeaders() },
    body: JSON.stringify({
      prompt: "",
      grammar: gbnf,
      n_predict: 1,
      temperature: 0,
      cache_prompt: false,
    }),
  });
  if (response.ok) {
    await response.body?.cancel().catch(() => undefined);
    return;
  }
  const detail = await response.text().catch(() => "");
  throw new Error(
    `grammar compile failed for ${label}: HTTP ${response.status} ${detail.slice(0, 300)}\nGBNF:\n${gbnf}`,
  );
}

/**
 * Check one hand-written GBNF against the running server.
 *
 * The generated field grammars are covered by the schema sweep below. A grammar
 * written by hand has no generator to trust, and a bad one is otherwise found
 * by a model turn failing in the middle of somebody's work, so it belongs in the
 * same boot check.
 */
export async function assertGbnfCompiles(gbnf: string, label: string): Promise<void> {
  await applyExecutionPlan();
  await assertGrammarParses(requireLlamaServerBaseUrl(), gbnf, label);
}

/**
 * Validate every field GBNF against the running server. Throws on the first
 * illegal grammar. Call at boot — same fail-fast layer as budget invariants.
 *
 * Grammars are deduplicated by the same cache key the fill path uses, so a
 * schema with many same-shaped fields costs one check, not one per field.
 */
export async function assertFieldGrammarsCompile(
  fields: readonly FillableField[],
): Promise<void> {
  if (fields.length === 0) return;
  await applyExecutionPlan();
  const baseUrl = requireLlamaServerBaseUrl();
  const documentHash = hashDocument("__boot__");

  const seen = new Set<string>();
  for (const field of fields) {
    const key = grammarCacheKey(field, documentHash);
    if (seen.has(key)) continue;
    seen.add(key);
    await assertGrammarParses(baseUrl, fieldValueToGbnf(field), field.path);
  }
}

/** Dedupe by grammar cache key material (path-independent static keys). */
export async function assertSchemaFieldsGrammarsCompile(
  schemas: ReadonlyArray<{
    id: string;
    fields: ReadonlyArray<{
      path: string;
      type: string;
      required: boolean;
      description?: string;
      semanticType?: string;
    }>;
  }>,
): Promise<void> {
  const merged: FillableField[] = [];
  for (const schema of schemas) {
    try {
      merged.push(...schemaFieldsToFillable(schema.fields));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`schema ${schema.id} fillable map failed: ${message}`);
    }
  }
  await assertFieldGrammarsCompile(merged);
}
