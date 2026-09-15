import { describe, expect, it } from "vitest";
import { foldSourceRuns, type SourceGroup } from "./chat-sources";

const chat = (id: string) => ({ id, kind: "chat" as const });

const sources = (
  id: string,
  query: string,
  urls: string[],
  blocked?: boolean,
) => ({
  id,
  kind: "sources" as const,
  query,
  results: urls.map((url) => ({ title: `T ${url}`, url, snippet: "s" })),
  ...(blocked ? { blocked: true as const } : {}),
});

const pages = (id: string, urls: string[]) => ({
  id,
  kind: "pages" as const,
  pages: urls.map((url) => ({ url, title: `P ${url}` })),
});

function onlyGroups(items: ReturnType<typeof foldSourceRuns>): SourceGroup[] {
  return items.filter(
    (item): item is SourceGroup => item.kind === "source-group",
  );
}

describe("foldSourceRuns", () => {
  it("folds a run of searches into one group", () => {
    const folded = foldSourceRuns([
      chat("u1"),
      sources("s1", "레드롭", ["https://a", "https://b"]),
      sources("s2", "redrob office", ["https://c"]),
      chat("a1"),
    ]);

    expect(folded.map((item) => item.kind)).toEqual([
      "chat",
      "source-group",
      "chat",
    ]);
    const [group] = onlyGroups(folded);
    expect(group!.queries).toEqual(["레드롭", "redrob office"]);
    expect(group!.refs.map((ref) => ref.url)).toEqual([
      "https://a",
      "https://b",
      "https://c",
    ]);
  });

  it("keeps one entry per URL across searches and fetched pages", () => {
    const folded = foldSourceRuns([
      sources("s1", "q", ["https://a", "https://b"]),
      pages("p1", ["https://b", "https://d"]),
    ]);

    const [group] = onlyGroups(folded);
    expect(group!.refs.map((ref) => ref.url)).toEqual([
      "https://a",
      "https://b",
      "https://d",
    ]);
    expect(group!.refs.map((ref) => ref.from)).toEqual([
      "search",
      "search",
      "page",
    ]);
  });

  it("starts a new group when an answer separates two runs", () => {
    const folded = foldSourceRuns([
      sources("s1", "q1", ["https://a"]),
      chat("a1"),
      sources("s2", "q2", ["https://b"]),
    ]);

    expect(onlyGroups(folded)).toHaveLength(2);
  });

  it("keeps an empty blocked search so the challenge is still reported", () => {
    const folded = foldSourceRuns([sources("s1", "q", [], true)]);

    const [group] = onlyGroups(folded);
    expect(group!.refs).toEqual([]);
    expect(group!.blocked).toBe(true);
    expect(group!.queries).toEqual(["q"]);
  });

  it("leaves a transcript without sources untouched", () => {
    const items = [chat("u1"), chat("a1")];
    expect(foldSourceRuns(items)).toEqual(items);
  });
});
