import { describe, expect, it } from "vitest";
import type { FloorChannelPost } from "../../shared/office-api";
import { collectFloorFiles, matchesFloorSearch } from "./floor-channel";

function post(patch: Partial<FloorChannelPost>): FloorChannelPost {
  return {
    id: "p1",
    kind: "message",
    channelId: "general",
    type: "DELIVER",
    from: "staff-1",
    to: "floor-intake",
    origin: "staff",
    body: "",
    detail: "",
    evidence: [],
    artifact: null,
    options: [],
    createdAt: 1,
    notBefore: 1,
    pending: false,
    traceId: "t1",
    meetingId: null,
    progress: null,
    ...patch,
  };
}

describe("matchesFloorSearch", () => {
  const line = post({
    body: "Draft is ready for review",
    detail: "second pass",
    artifact: { kind: "docx", ref: "jd-backend.docx", label: "Backend JD", artifactId: "a1" },
    evidence: [{ label: "rubric v3", locator: "4" }],
  });

  it("keeps every line when the query is blank", () => {
    expect(matchesFloorSearch(line, "Writer", "  ")).toBe(true);
  });

  it("matches body, detail, sender, file and evidence, case insensitively", () => {
    expect(matchesFloorSearch(line, "Writer", "READY")).toBe(true);
    expect(matchesFloorSearch(line, "Writer", "second")).toBe(true);
    expect(matchesFloorSearch(line, "Writer", "writer")).toBe(true);
    expect(matchesFloorSearch(line, "Writer", "backend jd")).toBe(true);
    expect(matchesFloorSearch(line, "Writer", "jd-backend.docx")).toBe(true);
    expect(matchesFloorSearch(line, "Writer", "rubric")).toBe(true);
  });

  it("drops lines that match nothing on the line", () => {
    expect(matchesFloorSearch(line, "Writer", "payroll")).toBe(false);
  });
});

describe("collectFloorFiles", () => {
  const senderOf = (staffId: string): string => `role:${staffId}`;

  it("skips lines with no file and reads the sender through the map", () => {
    const files = collectFloorFiles(
      [
        post({ id: "a", artifact: null }),
        post({
          id: "b",
          from: "staff-9",
          createdAt: 5,
          artifact: { kind: "docx", ref: "one.docx", label: "One", artifactId: "a1" },
        }),
      ],
      senderOf,
    );
    expect(files).toHaveLength(1);
    expect(files[0]?.from).toBe("role:staff-9");
  });

  it("collapses a redelivered file onto its newest delivery", () => {
    const files = collectFloorFiles(
      [
        post({
          id: "b",
          createdAt: 5,
          artifact: { kind: "docx", ref: "one.docx", label: "One", artifactId: "a1" },
        }),
        post({
          id: "c",
          createdAt: 9,
          from: "staff-2",
          artifact: { kind: "docx", ref: "one.docx", label: "One v2", artifactId: "a1" },
        }),
      ],
      senderOf,
    );
    expect(files).toHaveLength(1);
    expect(files[0]?.deliveredAt).toBe(9);
    expect(files[0]?.artifact.label).toBe("One v2");
  });

  it("orders newest first", () => {
    const files = collectFloorFiles(
      [
        post({
          id: "b",
          createdAt: 2,
          artifact: { kind: "docx", ref: "old.docx", label: "Old", artifactId: null },
        }),
        post({
          id: "c",
          createdAt: 8,
          artifact: { kind: "xlsx", ref: "new.xlsx", label: "New", artifactId: null },
        }),
      ],
      senderOf,
    );
    expect(files.map((file) => file.artifact.ref)).toEqual(["new.xlsx", "old.docx"]);
  });
});
