import { describe, expect, it } from "vitest";
import {
  conversationText,
  excerptAround,
  queryTerms,
  rankPassages,
  searchWorkspace,
  type BrainPassage,
} from "./workspace-brain.js";

describe("queryTerms", () => {
  it("drops the furniture of a question", () => {
    expect(queryTerms("What did we decide about the pricing page?")).toEqual([
      "pricing",
      "page",
    ]);
  });

  it("keeps something to search for when the question is all common words", () => {
    expect(queryTerms("what did we say")).toEqual(["what", "did", "we", "say"]);
  });

  it("does not repeat a term or keep punctuation", () => {
    expect(queryTerms("pricing, pricing (pricing)!")).toEqual(["pricing"]);
  });
});

describe("rankPassages", () => {
  const passages: BrainPassage[] = [
    {
      source: "note",
      title: "Remembered note",
      text: "The team ships on Thursdays.",
    },
    {
      source: "document",
      title: "Pricing page copy",
      text: "The pricing page leads with the team plan at $19 per seat.",
      ref: "doc-1",
    },
    {
      source: "conversation",
      title: "Launch chat",
      text: "Asked: should the pricing page show annual billing?\nAnswered: yes, annual first.",
      ref: "chat-1",
    },
    {
      source: "document",
      title: "Unrelated invoice",
      text: "Invoice 4021 for office chairs.",
      ref: "doc-2",
    },
  ];

  it("ranks a passage that covers the whole question above one that repeats a word", () => {
    const hits = rankPassages("pricing page", passages);
    expect(hits.map((hit) => hit.ref ?? hit.source)).toEqual(["doc-1", "chat-1"]);
  });

  it("returns nothing rather than everything when no passage matches", () => {
    expect(rankPassages("kubernetes", passages)).toEqual([]);
  });

  it("carries an excerpt that contains the match", () => {
    const [hit] = rankPassages("annual billing", passages);
    expect(hit?.excerpt.toLowerCase()).toContain("annual");
  });

  it("credits a title match, so a document named for the subject wins", () => {
    const hits = rankPassages("invoice", passages);
    expect(hits[0]?.ref).toBe("doc-2");
  });

  it("honours the limit", () => {
    expect(rankPassages("the", passages, 2).length).toBeLessThanOrEqual(2);
  });
});

describe("excerptAround", () => {
  it("centres the window on the match and marks what it cut", () => {
    const text = `${"padding ".repeat(60)}needle${" padding".repeat(60)}`;
    const excerpt = excerptAround(text, ["needle"], 120);
    expect(excerpt).toContain("needle");
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt.length).toBeLessThan(140);
  });

  it("leaves a short passage alone", () => {
    expect(excerptAround("  short   text ", ["short"], 100)).toBe("short text");
  });
});

describe("conversationText", () => {
  it("reads a saved session into who asked and who answered", () => {
    const json = JSON.stringify([
      { role: "user", content: "Where did we land on the deck?" },
      { role: "assistant", content: "Six slides, no appendix." },
      { role: "assistant", content: "   " },
      { kind: "tool" },
    ]);
    expect(conversationText(json)).toBe(
      "Asked: Where did we land on the deck?\nAnswered: Six slides, no appendix.",
    );
  });

  it("skips a session it cannot read instead of failing the whole search", () => {
    expect(conversationText("not json")).toBe("");
    expect(conversationText("{}")).toBe("");
  });
});

describe("searchWorkspace", () => {
  const sources = {
    notes: () => [{ body: "Renewal date for the Acme contract is 3 March." }],
    documents: async () => [
      { id: "doc-9", title: "Acme renewal brief", body: "Acme wants a two-year term." },
    ],
    conversations: () => [
      {
        id: "chat-9",
        title: "Acme",
        messagesJson: JSON.stringify([
          { role: "user", content: "Did Acme sign?" },
          { role: "assistant", content: "Not yet — legal is reading the term sheet." },
        ]),
      },
    ],
  };

  it("finds the same subject across all three stores", async () => {
    const hits = await searchWorkspace({ query: "Acme renewal", sources });
    expect(new Set(hits.map((hit) => hit.source))).toEqual(
      new Set(["note", "document", "conversation"]),
    );
  });

  it("can be pointed at one store", async () => {
    const hits = await searchWorkspace({
      query: "Acme",
      sources,
      only: ["document"],
    });
    expect(hits).toHaveLength(1);
    expect(hits[0]?.ref).toBe("doc-9");
  });

  it("returns nothing for an empty question rather than the whole workspace", async () => {
    expect(await searchWorkspace({ query: "   ", sources })).toEqual([]);
  });
});
