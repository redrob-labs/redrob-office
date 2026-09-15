import type { Store } from "@redrob/store";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecruitingPipelineProgress } from "../../shared/office-api.js";

const mocks = vi.hoisted(() => ({
  draftJd: vi.fn(),
  generateAndSaveRubric: vi.fn(),
  runIntakeBatch: vi.fn(),
  runAssess: vi.fn(),
  draftDecisionEmail: vi.fn(),
}));

vi.mock("./jd.js", () => ({ draftJd: mocks.draftJd }));
vi.mock("./rubric.js", () => ({
  generateAndSaveRubric: mocks.generateAndSaveRubric,
}));
vi.mock("./intake.js", () => ({ runIntakeBatch: mocks.runIntakeBatch }));
vi.mock("./assess.js", () => ({ runAssess: mocks.runAssess }));
vi.mock("./email.js", () => ({
  draftDecisionEmail: mocks.draftDecisionEmail,
}));

import { runRecruitingPipeline } from "./recruiting-pipeline.js";

describe("runRecruitingPipeline", () => {
  const store = {} as Store;

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("threads context through every service in order and applies the threshold", async () => {
    const order: string[] = [];
    const progress: RecruitingPipelineProgress[] = [];
    mocks.draftJd.mockImplementation(async () => {
      order.push("jd");
      return {
        markdown: "# Platform Engineer",
        artifactId: "artifact-jd",
      };
    });
    mocks.generateAndSaveRubric.mockImplementation(async () => {
      order.push("rubric");
      return {
        rubric: { id: "recruiting/from-jd" },
        artifactId: "artifact-rubric",
      };
    });
    mocks.runIntakeBatch.mockImplementation(async () => {
      order.push("intake");
      return {
        runId: "intake-run",
        items: [
          { path: "/resumes/a.pdf", ok: true, documentId: "document-a" },
          { path: "/resumes/b.pdf", ok: true, documentId: "document-b" },
          { path: "/resumes/broken.pdf", ok: false, error: "unreadable" },
        ],
      };
    });
    mocks.runAssess
      .mockImplementationOnce(async () => {
        order.push("assess:document-a");
        return {
          runId: "assess-a",
          compare: {
            scores: [
              { axisId: "experience", value: 4, max: 5 },
              { axisId: "skills", value: 3, max: 5 },
            ],
          },
        };
      })
      .mockImplementationOnce(async () => {
        order.push("assess:document-b");
        return {
          runId: "assess-b",
          compare: {
            scores: [
              { axisId: "experience", value: 4, max: 5 },
              { axisId: "skills", value: 2, max: 5 },
            ],
          },
        };
      });
    mocks.draftDecisionEmail
      .mockImplementationOnce(async () => {
        order.push("email:document-a");
        return { artifactId: "artifact-email-a" };
      })
      .mockImplementationOnce(async () => {
        order.push("email:document-b");
        return { artifactId: "artifact-email-b" };
      });

    const result = await runRecruitingPipeline(
      store,
      {
        workspaceId: "recruiting",
        locale: "en",
        jd: {
          roleTitle: "Platform Engineer",
          responsibilities: "Build the platform",
          qualifications: "TypeScript",
          location: "Remote",
        },
        intakeFilePaths: [
          "/resumes/a.pdf",
          "/resumes/b.pdf",
          "/resumes/broken.pdf",
        ],
        passThreshold: 0.7,
      },
      { onProgress: (event) => progress.push(event) },
    );

    expect(order).toEqual([
      "jd",
      "rubric",
      "intake",
      "assess:document-a",
      "assess:document-b",
      "email:document-a",
      "email:document-b",
    ]);
    expect(mocks.draftJd).toHaveBeenCalledWith({
      roleTitle: "Platform Engineer",
      responsibilities: "Build the platform",
      qualifications: "TypeScript",
      location: "Remote",
      locale: "en",
    });
    expect(mocks.generateAndSaveRubric).toHaveBeenCalledWith({
      jdText: "# Platform Engineer",
      workspaceId: "recruiting",
    });
    expect(mocks.runIntakeBatch).toHaveBeenCalledWith({
      store,
      workspaceId: "recruiting",
      schemaId: "recruiting/resume",
      filePaths: [
        "/resumes/a.pdf",
        "/resumes/b.pdf",
        "/resumes/broken.pdf",
      ],
    });
    expect(mocks.runAssess).toHaveBeenNthCalledWith(1, store, {
      workspaceId: "recruiting",
      documentId: "document-a",
      rubricId: "recruiting/from-jd",
    });
    expect(mocks.draftDecisionEmail).toHaveBeenNthCalledWith(1, store, {
      documentId: "document-a",
      decision: "pass",
      roleTitle: "Platform Engineer",
      notes: "Assessment score: 7/10.",
      locale: "en",
    });
    expect(mocks.draftDecisionEmail).toHaveBeenNthCalledWith(2, store, {
      documentId: "document-b",
      decision: "reject",
      roleTitle: "Platform Engineer",
      notes: "Assessment score: 6/10.",
      locale: "en",
    });
    expect(result.context).toEqual({
      workspaceId: "recruiting",
      locale: "en",
      roleTitle: "Platform Engineer",
      jdMarkdown: "# Platform Engineer",
      jdArtifactId: "artifact-jd",
      rubricId: "recruiting/from-jd",
      rubricArtifactId: "artifact-rubric",
      intakeRunId: "intake-run",
      documentIds: ["document-a", "document-b"],
      assessResults: [
        {
          documentId: "document-a",
          runId: "assess-a",
          scoreSum: 7,
          scoreMax: 10,
          decision: "pass",
        },
        {
          documentId: "document-b",
          runId: "assess-b",
          scoreSum: 6,
          scoreMax: 10,
          decision: "reject",
        },
      ],
      emailArtifactIds: ["artifact-email-a", "artifact-email-b"],
    });
    expect(result.timingMs).toBeGreaterThanOrEqual(0);
    expect(progress.map((event) => event.step)).toEqual([
      "jd",
      "rubric",
      "intake",
      "assess",
      "email",
      "done",
    ]);
  });

  it("throws a clear dependency error for an explicitly selected step", async () => {
    await expect(
      runRecruitingPipeline(store, {
        steps: ["assess"],
        context: { documentIds: ["document-a"] },
      }),
    ).rejects.toThrow(
      "Recruiting pipeline assess step requires context.rubricId",
    );
    expect(mocks.runAssess).not.toHaveBeenCalled();
  });
});
