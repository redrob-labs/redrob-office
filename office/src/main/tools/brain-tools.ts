import { z } from "zod";
import { listChatSessions, getChatSession, listMemories } from "@redrob/store";
import { getArtifact, listArtifacts } from "../services/artifacts.js";
import {
  searchWorkspace,
  type BrainHit,
  type BrainSearchSources,
} from "../services/workspace-brain.js";
import { toolStore } from "./tool-store.js";
import type { RegisteredTool, ToolResult } from "./types.js";

/**
 * Look something up in the workspace instead of asking the person to remember.
 *
 * Everything an assistant needs to answer "what did we decide" is already on
 * this machine — notes it was told to remember, documents it wrote, chats it
 * had — and none of it was reachable mid-answer. So it either guessed or asked
 * the person to paste it back in.
 */

const BINARY_KINDS = new Set(["xlsx", "pptx", "docx", "pdf", "image"]);

/** Documents whose text can be read back; a spreadsheet's bytes cannot. */
async function readableDocuments(): Promise<
  Array<{ id: string; title: string; body: string; createdAt?: string }>
> {
  const metas = await listArtifacts();
  const readable: Array<{ id: string; title: string; body: string; createdAt?: string }> = [];
  for (const meta of metas) {
    if (meta.encoding === "binary" || BINARY_KINDS.has(meta.kind)) {
      // The title is still worth matching on, even when the body is bytes.
      readable.push({ id: meta.id, title: meta.title, body: "", createdAt: meta.createdAt });
      continue;
    }
    const full = await getArtifact(meta.id);
    if (!full) continue;
    readable.push({
      id: meta.id,
      title: meta.title,
      body: full.body,
      createdAt: meta.createdAt,
    });
  }
  return readable;
}

export function brainSources(userDataPath: string): BrainSearchSources {
  const store = toolStore(userDataPath);
  return {
    notes: () =>
      listMemories(store).map((memory) => ({
        body: memory.body,
        updatedAt: memory.updatedAt,
      })),
    documents: readableDocuments,
    conversations: () =>
      listChatSessions(store, 60)
        .map((summary) => {
          const record = getChatSession(store, summary.id);
          return record
            ? {
                id: record.id,
                title: record.title,
                messagesJson: record.messagesJson,
                updatedAt: record.updatedAt,
              }
            : null;
        })
        .filter(
          (session): session is {
            id: string;
            title: string;
            messagesJson: string;
            updatedAt: string;
          } => session !== null,
        ),
  };
}

/** What the model reads back: where each hit lives, and enough of it to quote. */
export function formatHits(hits: readonly BrainHit[]): string {
  if (hits.length === 0) {
    return "Nothing in the workspace matches that. Say so rather than guessing.";
  }
  const label: Record<BrainHit["source"], string> = {
    note: "remembered note",
    document: "document",
    conversation: "past chat",
  };
  return hits
    .map(
      (hit) =>
        `- [${label[hit.source]}] ${hit.title}${hit.ref ? ` (${hit.ref})` : ""}\n  ${hit.excerpt}`,
    )
    .join("\n");
}

export const workspaceSearchTool: RegisteredTool = {
  name: "workspace.search",
  description:
    "Search everything this workspace already holds — remembered notes, documents in the " +
    "Documents tab, and past conversations — for words in a question. Call it when the user " +
    "refers to earlier work ('the pricing deck', 'what we decided about Acme', 'that draft " +
    "from last week') instead of guessing or asking them to paste it back. Returns where each " +
    "hit lives and an excerpt; read the document itself with fs.read or doc tools when you " +
    "need more than the excerpt. This is keyword matching, so try the subject's own words.",
  risk: "low",
  inputSchema: z.object({
    query: z.string().min(2).describe("The subject in the words it would be written in"),
    only: z
      .array(z.enum(["note", "document", "conversation"]))
      .optional()
      .describe("Limit the search to some of the three stores"),
    limit: z.number().int().min(1).max(20).optional(),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    try {
      const hits = await searchWorkspace({
        query: input.query,
        sources: brainSources(ctx.userDataPath),
        ...(input.limit !== undefined ? { limit: input.limit } : {}),
        ...(input.only !== undefined ? { only: input.only } : {}),
      });
      return {
        ok: true,
        summary:
          hits.length === 0
            ? `No match for “${input.query}” in notes, documents, or past chats.`
            : `${hits.length} match${hits.length === 1 ? "" : "es"} for “${input.query}”:\n${formatHits(hits)}`,
        data: {
          hits: hits.map((hit) => ({
            source: hit.source,
            title: hit.title,
            ref: hit.ref,
            excerpt: hit.excerpt,
          })),
        },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, summary: `Workspace search failed: ${message}`, error: message };
    }
  },
};

export const BRAIN_TOOLS: RegisteredTool[] = [workspaceSearchTool];
