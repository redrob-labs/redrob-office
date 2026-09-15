import { describe, expect, it } from "vitest";
import {
  activityKey,
  activityOf,
  elapsedMinutes,
  nextUpdateAt,
  progressSummary,
  targetOf,
  THINKING,
} from "./progress";

const request = (name: string, args: Record<string, unknown> = {}) =>
  ({ kind: "tool_request", callId: "c1", name, args, risk: "low" }) as const;

describe("activityOf", () => {
  it("reads the activity off what the tool touches and does", () => {
    expect(activityOf(request("fs.read", { path: "/a/b/notes.md" }))).toEqual({
      kind: "reading",
      target: "notes.md",
    });
    expect(activityOf(request("doc.outline", { path: "plan.docx" }))?.kind).toBe("reading");
    expect(activityOf(request("fs.write", { path: "draft.md" }))?.kind).toBe("writing");
    expect(activityOf(request("sheet.addFormula", {}))?.kind).toBe("writing");
    expect(activityOf(request("shell.exec", { command: "pnpm test" }))).toEqual({
      kind: "running",
      target: "pnpm test",
    });
    expect(activityOf(request("net.httpPost", { url: "https://x.dev" }))?.kind).toBe("looking");
    // "search" is in the reading rule, so without a web rule ahead of it a
    // search reported as reading a file.
    expect(activityOf(request("web.search", { query: "레드롭 시그널" }))).toEqual({
      kind: "looking",
      target: "레드롭 시그널",
    });
  });

  it("falls back to running for a tool it cannot read", () => {
    expect(activityOf(request("weird.thing"))?.kind).toBe("running");
  });

  // Counting prose as an activity meant every turn announced itself one beat
  // before answering, so a greeting arrived under "Manager is writing it up".
  it("says nothing about prose arriving, because the answer is its own report", () => {
    expect(activityOf({ kind: "text", text: "Here is the plan" })).toBeNull();
    expect(activityOf({ kind: "text", text: "  " })).toBeNull();
  });

  it("treats a model turn as thinking", () => {
    expect(activityOf({ kind: "status", message: "Thinking (step 2)" })).toEqual(THINKING);
  });

  it("says nothing for events that report no activity", () => {
    expect(activityOf({ kind: "done", text: "", iterations: 1 })).toBeNull();
    expect(activityOf({ kind: "aborted" })).toBeNull();
    expect(activityOf({ kind: "error", message: "boom" })).toBeNull();
  });
});

describe("targetOf", () => {
  it("names a path by its file, and a query or command whole", () => {
    expect(targetOf({ path: "/long/way/down/report.docx" })).toBe("report.docx");
    expect(targetOf({ query: "q3 offsite venues" })).toBe("q3 offsite venues");
    expect(targetOf({ command: "pnpm run build" })).toBe("pnpm run build");
  });

  it("prefers the argument a person would recognise", () => {
    expect(targetOf({ name: "thing", path: "a.md" })).toBe("a.md");
  });

  it("truncates something too long to read at a glance", () => {
    const target = targetOf({ command: "x".repeat(80) });
    expect(target).toHaveLength(48);
    expect(target.endsWith("…")).toBe(true);
  });

  // A Korean page read off a search result showed up as
  // "매니저 %EC%A4%91%EA%B0%84%EB%B3%B4%EA%B3%A0 실행 중".
  it("names a page in the language it is written in", () => {
    expect(
      targetOf({
        url: "https://ko.wikipedia.org/wiki/%EC%A4%91%EA%B0%84%EB%B3%B4%EA%B3%A0",
      }),
    ).toBe("중간보고");
  });

  it("leaves a stray percent alone rather than failing on it", () => {
    expect(targetOf({ path: "/tmp/100%_done.md" })).toBe("100%_done.md");
  });

  it("returns nothing when no argument is worth naming", () => {
    expect(targetOf({})).toBe("");
    expect(targetOf({ path: "   " })).toBe("");
    expect(targetOf({ depth: 3 })).toBe("");
  });
});

describe("nextUpdateAt", () => {
  const pace = { progressQuietMs: 20_000, progressRepeatMs: 45_000 };

  it("waits out the quiet period before saying anything at all", () => {
    expect(nextUpdateAt(1_000, null, pace)).toBe(21_000);
  });

  it("spaces later updates from the last one, not from the start", () => {
    expect(nextUpdateAt(1_000, 30_000, pace)).toBe(75_000);
  });

  it("never schedules in a tight loop, however the pace is configured", () => {
    const now = 5_000;
    expect(nextUpdateAt(now, now, { progressQuietMs: 0, progressRepeatMs: 0 })).toBeGreaterThan(now);
  });
});

describe("activityKey", () => {
  it("tells a new tool apart from the one before it", () => {
    expect(activityKey({ kind: "reading", target: "a.md" })).not.toBe(
      activityKey({ kind: "reading", target: "b.md" }),
    );
    expect(activityKey({ kind: "reading", target: "a.md" })).not.toBe(
      activityKey({ kind: "writing", target: "a.md" }),
    );
  });

  it("treats the same activity as nothing new to say", () => {
    expect(activityKey({ kind: "writing", target: "sheet.xlsx" })).toBe(
      activityKey({ kind: "writing", target: "sheet.xlsx" }),
    );
  });
});

describe("progressSummary", () => {
  it("names what is being worked on", () => {
    expect(progressSummary("Writer", { kind: "reading", target: "notes.md" }, 0)).toBe(
      "Writer is reading notes.md",
    );
  });

  it("says how long once there is a minute to report", () => {
    expect(progressSummary("Writer", { kind: "writing", target: "" }, 125_000)).toBe(
      "Writer is still writing it up (2m in)",
    );
  });
});

describe("elapsedMinutes", () => {
  it("counts whole minutes and never goes negative", () => {
    expect(elapsedMinutes(59_000)).toBe(0);
    expect(elapsedMinutes(60_000)).toBe(1);
    expect(elapsedMinutes(-5)).toBe(0);
  });
});
