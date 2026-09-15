import { describe, expect, it } from "vitest";
import { formatHits, workspaceSearchTool } from "./brain-tools.js";
import type { BrainHit } from "../services/workspace-brain.js";

function hit(partial: Partial<BrainHit>): BrainHit {
  return {
    source: partial.source ?? "document",
    title: partial.title ?? "Something",
    text: partial.text ?? "",
    excerpt: partial.excerpt ?? "an excerpt",
    score: partial.score ?? 10,
    ...(partial.ref ? { ref: partial.ref } : {}),
  };
}

describe("formatHits", () => {
  it("names the store each hit came from in words, not codes", () => {
    const text = formatHits([
      hit({ source: "note", title: "Remembered note", excerpt: "ships on Thursdays" }),
      hit({ source: "document", title: "Pricing brief", ref: "doc-1" }),
      hit({ source: "conversation", title: "Launch chat", ref: "chat-1" }),
    ]);
    expect(text).toContain("[remembered note]");
    expect(text).toContain("[document] Pricing brief (doc-1)");
    expect(text).toContain("[past chat] Launch chat (chat-1)");
  });

  it("tells the model to say it found nothing rather than invent an answer", () => {
    expect(formatHits([])).toContain("rather than guessing");
  });
});

describe("workspaceSearchTool", () => {
  it("needs a query worth searching for", () => {
    expect(workspaceSearchTool.inputSchema.safeParse({}).success).toBe(false);
    expect(workspaceSearchTool.inputSchema.safeParse({ query: "a" }).success).toBe(false);
    expect(workspaceSearchTool.inputSchema.safeParse({ query: "acme" }).success).toBe(true);
  });

  it("only accepts the three stores that exist", () => {
    expect(
      workspaceSearchTool.inputSchema.safeParse({ query: "acme", only: ["document"] }).success,
    ).toBe(true);
    expect(
      workspaceSearchTool.inputSchema.safeParse({ query: "acme", only: ["email"] }).success,
    ).toBe(false);
  });

  it("is low risk, because it only reads what is already here", () => {
    expect(workspaceSearchTool.risk).toBe("low");
  });
});
