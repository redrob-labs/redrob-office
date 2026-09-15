import { describe, expect, it } from "vitest";
import type { FloorChannelPost } from "../../shared/office-api";
import { GROUP_WINDOW_MS, buildFloorRows } from "./floor-messages";

const DAY = 24 * 60 * 60_000;
/** A fixed local noon, so a divider never lands on a timezone boundary. */
const NOON = new Date(2026, 7, 7, 12, 0, 0).getTime();

function post(patch: Partial<FloorChannelPost>): FloorChannelPost {
  return {
    id: `p${patch.createdAt ?? 0}`,
    channelId: "general",
    kind: "message",
    type: "REQUEST",
    from: "writer",
    to: "",
    origin: "staff",
    body: "body",
    detail: "",
    evidence: [],
    artifact: null,
    options: [],
    createdAt: NOON,
    notBefore: NOON,
    pending: false,
    traceId: "t1",
    meetingId: null,
    progress: null,
    ...patch,
  };
}

function kinds(rows: ReturnType<typeof buildFloorRows>): string[] {
  return rows.map((row) => row.kind);
}

describe("buildFloorRows", () => {
  it("keeps one nameplate for a run from the same sender", () => {
    const rows = buildFloorRows({
      posts: [
        post({ id: "a", createdAt: NOON }),
        post({ id: "b", createdAt: NOON + 30_000 }),
        post({ id: "c", createdAt: NOON + 60_000 }),
      ],
    });
    expect(kinds(rows)).toEqual(["date", "message", "message", "message"]);
    expect(
      rows.map((row) => (row.kind === "message" ? row.grouped : null)),
    ).toEqual([null, false, true, true]);
  });

  it("starts a new block when the sender changes", () => {
    const rows = buildFloorRows({
      posts: [
        post({ id: "a", from: "writer", createdAt: NOON }),
        post({ id: "b", from: "reviewer", createdAt: NOON + 1_000 }),
      ],
    });
    const grouped = rows.filter((row) => row.kind === "message");
    expect(grouped.every((row) => row.kind === "message" && !row.grouped)).toBe(
      true,
    );
  });

  it("starts a new block after a long enough silence", () => {
    const rows = buildFloorRows({
      posts: [
        post({ id: "a", createdAt: NOON }),
        post({ id: "b", createdAt: NOON + GROUP_WINDOW_MS + 1 }),
      ],
    });
    const messages = rows.filter((row) => row.kind === "message");
    expect(messages).toHaveLength(2);
    expect(messages[1]?.kind === "message" && messages[1].grouped).toBe(false);
  });

  it("breaks a run when the office says something in the middle of it", () => {
    const rows = buildFloorRows({
      posts: [
        post({ id: "a", createdAt: NOON }),
        post({
          id: "n",
          kind: "system",
          createdAt: NOON + 1_000,
          body: "Production halted",
        }),
        post({ id: "b", createdAt: NOON + 2_000 }),
      ],
    });
    expect(kinds(rows)).toEqual(["date", "message", "note", "message"]);
    const last = rows[3];
    expect(last?.kind === "message" && last.grouped).toBe(false);
  });

  it("reads intake speaking for itself as a note, and a person's goal as a message", () => {
    const rows = buildFloorRows({
      posts: [
        post({
          id: "a",
          from: "floor-intake",
          origin: "system",
          createdAt: NOON,
        }),
        post({
          id: "b",
          from: "floor-intake",
          origin: "human",
          createdAt: NOON + 1_000,
        }),
      ],
    });
    expect(kinds(rows)).toEqual(["date", "note", "message"]);
  });

  it("draws a divider on every new calendar day", () => {
    const rows = buildFloorRows({
      posts: [
        post({ id: "a", createdAt: NOON }),
        post({ id: "b", createdAt: NOON + DAY }),
      ],
    });
    expect(kinds(rows)).toEqual(["date", "message", "date", "message"]);
  });

  it("groups a person's own messages together rather than with the intake desk", () => {
    const rows = buildFloorRows({
      posts: [
        post({
          id: "a",
          from: "floor-intake",
          origin: "human",
          createdAt: NOON,
        }),
        post({
          id: "b",
          from: "floor-intake",
          origin: "human",
          createdAt: NOON + 1_000,
        }),
      ],
    });
    const messages = rows.filter((row) => row.kind === "message");
    expect(messages[1]?.kind === "message" && messages[1].grouped).toBe(true);
  });

  it("threads an unconfirmed line into the conversation by time, not at the end", () => {
    const rows = buildFloorRows({
      posts: [post({ id: "later", from: "writer", createdAt: NOON + 10_000 })],
      sending: [post({ id: "mine", origin: "human", createdAt: NOON })],
    });
    expect(rows.map((row) => row.id)).toEqual([
      "date-2026-7-7",
      "mine",
      "later",
    ]);
    const mine = rows.find((row) => row.id === "mine");
    expect(mine?.kind === "message" && mine.sending).toBe(true);
    const later = rows.find((row) => row.id === "later");
    expect(later?.kind === "message" && later.sending).toBe(false);
  });
});

describe("progress notes", () => {
  const progress = (id: string, from: string, offset: number, target: string) =>
    post({
      id,
      from,
      createdAt: NOON + offset,
      kind: "system",
      type: "task.progress",
      origin: "system",
      body: `${from} is reading ${target}`,
      progress: { activity: "reading", target, elapsedMs: 60_000, spoken: false },
    });

  /** The same note, but said out loud as the seat reached for the tool. */
  const announce = (id: string, from: string, offset: number, target: string) =>
    post({
      id,
      from,
      createdAt: NOON + offset,
      kind: "system",
      type: "task.progress",
      origin: "system",
      body: `${from} is looking up ${target}`,
      progress: { activity: "looking", target, elapsedMs: 0, spoken: true },
    });

  const said = (id: string, from: string, offset: number, body: string) =>
    post({ id, from, createdAt: NOON + offset, body });

  it("keeps only the newest update from one person", () => {
    const rows = buildFloorRows({
      posts: [
        progress("p1", "writer", 1_000, "a.md"),
        progress("p2", "writer", 2_000, "b.md"),
        progress("p3", "writer", 3_000, "c.md"),
      ],
    });
    const shown = rows.filter((row) => row.kind === "progress");
    expect(shown).toHaveLength(1);
    expect(
      shown[0]?.kind === "progress" && shown[0].post.progress?.target,
    ).toBe("c.md");
  });

  it("keeps one line per person, because two people are two updates", () => {
    const rows = buildFloorRows({
      posts: [
        progress("p1", "writer", 1_000, "a.md"),
        progress("p2", "research", 2_000, "b.md"),
      ],
    });
    expect(rows.filter((row) => row.kind === "progress")).toHaveLength(2);
  });

  it("retires an update once that person actually says something", () => {
    const rows = buildFloorRows({
      posts: [
        progress("p1", "writer", 1_000, "a.md"),
        said("m1", "writer", 2_000, "here it is"),
      ],
    });
    expect(rows.filter((row) => row.kind === "progress")).toHaveLength(0);
  });

  // Said before the search runs, so overwriting it with the next status would
  // take the announcement away before it had been read.
  it("keeps every line a seat said, rather than replacing it with the next", () => {
    const rows = buildFloorRows({
      posts: [
        announce("s1", "writer", 1_000, "레드롭 시그널"),
        announce("s2", "writer", 2_000, "models.xlsx"),
      ],
    });
    expect(kinds(rows)).toEqual(["date", "said", "said"]);
  });

  it("drops the spinner once the seat says what it is starting", () => {
    const rows = buildFloorRows({
      posts: [
        progress("p1", "writer", 1_000, "a.md"),
        announce("s1", "writer", 2_000, "b.md"),
      ],
    });
    expect(kinds(rows)).toEqual(["date", "said"]);
  });

  it("leaves an update from someone who has not spoken yet", () => {
    const rows = buildFloorRows({
      posts: [
        progress("p1", "research", 1_000, "a.md"),
        said("m1", "writer", 2_000, "here it is"),
      ],
    });
    expect(rows.filter((row) => row.kind === "progress")).toHaveLength(1);
  });

  it("shows a fresh update after the person speaks again", () => {
    const rows = buildFloorRows({
      posts: [
        progress("p1", "writer", 1_000, "a.md"),
        said("m1", "writer", 2_000, "starting"),
        progress("p2", "writer", 3_000, "b.md"),
      ],
    });
    const shown = rows.filter((row) => row.kind === "progress");
    expect(shown).toHaveLength(1);
    expect(shown[0]?.kind === "progress" && shown[0].post.progress?.target).toBe("b.md");
  });

  it("breaks a run, so a delivery does not group onto what came before it", () => {
    const rows = buildFloorRows({
      posts: [
        said("m1", "writer", 1_000, "starting"),
        progress("p1", "writer", 2_000, "a.md"),
        said("m2", "writer", 3_000, "done"),
      ],
    });
    const last = rows[rows.length - 1];
    expect(last?.kind).toBe("message");
    expect(last?.kind === "message" && last.grouped).toBe(false);
  });
});
