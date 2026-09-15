/**
 * Search results belong under one lid.
 *
 * A turn that searches four times used to drop four separate cards into the
 * transcript, so the answer people came for sat below a wall of link lists.
 * Consecutive source and page blocks fold into a single collapsed accordion:
 * the run's citations, deduped by URL, in the order they were found.
 */

export interface SourceRef {
  url: string;
  title: string;
  snippet?: string;
  /** Whether the URL came from a search hit or a page the turn fetched. */
  from: "search" | "page";
  blocked?: boolean;
}

export interface SourceGroup {
  id: string;
  kind: "source-group";
  /** Every query in this run, in order, without repeats. */
  queries: string[];
  refs: SourceRef[];
  /** A search in this run hit a challenge/CAPTCHA page. */
  blocked: boolean;
}

interface SourcesMessage {
  id: string;
  kind: "sources";
  query: string;
  results: ReadonlyArray<{ title: string; url: string; snippet?: string }>;
  blocked?: boolean;
}

interface PagesMessage {
  id: string;
  kind: "pages";
  pages: ReadonlyArray<{ url: string; title: string; blocked?: boolean }>;
}

type Foldable = { id: string; kind: string };

function isSources(item: Foldable): item is Foldable & SourcesMessage {
  return item.kind === "sources";
}

function isPages(item: Foldable): item is Foldable & PagesMessage {
  return item.kind === "pages";
}

/**
 * Replace each run of adjacent source/page blocks with one group. Anything
 * else passes through untouched and in place, so the transcript order the
 * caller built is preserved.
 */
export function foldSourceRuns<T extends Foldable>(
  messages: readonly T[],
): Array<Exclude<T, { kind: "sources" | "pages" }> | SourceGroup> {
  const out: Array<Exclude<T, { kind: "sources" | "pages" }> | SourceGroup> =
    [];
  let index = 0;
  while (index < messages.length) {
    const item = messages[index]!;
    if (!isSources(item) && !isPages(item)) {
      out.push(item as Exclude<T, { kind: "sources" | "pages" }>);
      index += 1;
      continue;
    }
    const queries: string[] = [];
    const refs: SourceRef[] = [];
    const seen = new Set<string>();
    let blocked = false;
    let first: Foldable | undefined;
    while (index < messages.length) {
      const next = messages[index]!;
      if (isSources(next)) {
        first ??= next;
        const query = next.query.trim();
        if (query && !queries.includes(query)) queries.push(query);
        if (next.blocked) blocked = true;
        for (const hit of next.results) {
          if (!hit.url || seen.has(hit.url)) continue;
          seen.add(hit.url);
          refs.push({
            url: hit.url,
            title: hit.title || hit.url,
            from: "search",
            ...(hit.snippet ? { snippet: hit.snippet } : {}),
          });
        }
        index += 1;
        continue;
      }
      if (isPages(next)) {
        first ??= next;
        for (const page of next.pages) {
          if (!page.url || seen.has(page.url)) continue;
          seen.add(page.url);
          refs.push({
            url: page.url,
            title: page.title || page.url,
            from: "page",
            ...(page.blocked ? { blocked: true as const } : {}),
          });
        }
        index += 1;
        continue;
      }
      break;
    }
    out.push({
      id: `sources-${first?.id ?? String(index)}`,
      kind: "source-group",
      queries,
      refs,
      blocked,
    });
  }
  return out;
}
