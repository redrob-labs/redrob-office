import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureUserWorkflows, saveWorkflow } from "../services/workflow.js";
import {
  resolveWorkflow,
  skillCard,
  workflowExecuteTool,
  workflowSaveTool,
  workflowSearchTool,
} from "./workflow-tools.js";
import type { ToolContext } from "./types.js";

let dir: string;
let ctx: ToolContext;

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), "redrob-workflow-tools-"));
  configureUserWorkflows(dir);
  ctx = { allowedPaths: [dir], userDataPath: dir };
});

afterEach(async () => {
  await rm(dir, { recursive: true, force: true });
});

function saveHiringFlow(): void {
  saveWorkflow({
    workspaceId: "recruiting",
    title: "Backend hiring",
    description: "Hiring a backend engineer, job post through decision email",
    instructions: "Draft the post from the role brief, then build criteria from it.",
    steps: [
      { engine: "process", action: "jd", title: "Draft the job post" },
      { engine: "process", action: "rubric", title: "Scoring criteria" },
      { engine: "review", action: "verify", title: "Check credentials" },
    ],
  });
}

describe("workflow.search", () => {
  it("says there is nothing yet, and points at the tool that fixes that", async () => {
    const result = await workflowSearchTool.handler({}, ctx);

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("workflow.save");
    expect((result.data as { matches: unknown[] }).matches).toEqual([]);
  });

  it("ranks by the query against title, description and steps", async () => {
    saveHiringFlow();
    saveWorkflow({
      workspaceId: "legal",
      title: "Contract pass",
      description: "Read a contract",
      steps: [{ engine: "review", action: "contract", title: "Review" }],
    });

    const result = await workflowSearchTool.handler({ query: "backend" }, ctx);
    const matches = (
      result.data as { matches: Array<{ id: string; title: string }> }
    ).matches;

    expect(matches[0]?.id).toBe("recruiting/backend-hiring");
    expect(result.summary).toContain("Backend hiring");
    expect(result.summary).not.toContain("Contract pass");
  });
});

describe("workflow.execute", () => {
  it("returns a skill guide when inputs are missing (auto)", async () => {
    saveHiringFlow();

    const result = await workflowExecuteTool.handler(
      { workflow: "Backend hiring" },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect(result.summary).toContain("Skill “Backend hiring”");
    expect(result.summary).toContain("Draft the post from the role brief");
    expect(result.summary).toContain("roleTitle");
    expect((result.data as { mode: string }).mode).toBe("guide");
  });

  it("returns the guide on mode=guide even when inputs are present", async () => {
    saveHiringFlow();

    const result = await workflowExecuteTool.handler(
      {
        workflow: "Backend hiring",
        mode: "guide",
        roleTitle: "Backend Engineer",
        responsibilities: "Build APIs",
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect((result.data as { mode: string }).mode).toBe("guide");
    expect(result.summary).toContain("Opened as a skill guide");
  });

  it("refuses mode=run when required inputs are missing", async () => {
    saveHiringFlow();

    const result = await workflowExecuteTool.handler(
      { workflow: "Backend hiring", mode: "run" },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Missing input: roleTitle, responsibilities");
  });

  it("opens a by-hand-only flow as a guide", async () => {
    saveWorkflow({
      workspaceId: "recruiting",
      title: "Paperwork only",
      steps: [
        { engine: "review", action: "verify", title: "Check credentials" },
        { engine: "process", action: "publish", title: "Publish report" },
      ],
    });

    const result = await workflowExecuteTool.handler(
      { workflow: "Paperwork only" },
      ctx,
    );

    expect(result.ok).toBe(true);
    expect((result.data as { mode: string }).mode).toBe("guide");
    expect(result.summary).toContain("Check credentials");
  });

  it("lists what exists when the name matches nothing", async () => {
    saveHiringFlow();

    const result = await workflowExecuteTool.handler({ workflow: "payroll" }, ctx);

    expect(result.ok).toBe(false);
    expect(result.summary).toContain("recruiting/backend-hiring");
  });

  it("stops on an intake folder it cannot read", async () => {
    saveWorkflow({
      workspaceId: "recruiting",
      title: "Intake only",
      steps: [{ engine: "lookup", action: "intake", title: "Bring in resumes" }],
    });

    const result = await workflowExecuteTool.handler(
      {
        workflow: "Intake only",
        mode: "run",
        resumeFolder: join(dir, "no-such-folder"),
      },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.summary).toMatch(/Could not read|No readable resumes/);
  });
});

describe("workflow.save", () => {
  it("saves a flow chat can then search by name", async () => {
    const result = await workflowSaveTool.handler(
      {
        title: "Contract review pass",
        description: "Read a contract and leave a review",
        instructions: "Pull the clause list, then score each risk.",
        steps: [
          { action: "clause", title: "Draft the clause" },
          { action: "contract", title: "Review it" },
        ],
      },
      ctx,
    );

    expect(result.ok).toBe(true);
    const listed = await workflowSearchTool.handler(
      { query: "contract" },
      ctx,
    );
    expect(listed.summary).toContain("Contract review pass");
    expect(listed.summary).toContain("Read a contract");
  });

  it("hands back the vocabulary when the action is made up", async () => {
    const result = await workflowSaveTool.handler(
      { title: "Nonsense", steps: [{ action: "teleport" }] },
      ctx,
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBe("Unknown action");
    expect((result.data as { actions: string[] }).actions).toContain("assess");
  });
});

describe("skillCard / resolveWorkflow", () => {
  it("marks automatic vs by-hand steps", () => {
    saveHiringFlow();
    const flow = resolveWorkflow("Backend hiring", [
      {
        id: "recruiting/backend-hiring",
        version: 1,
        title: "Backend hiring",
        workspaceId: "recruiting",
        steps: [
          { id: "step-1", engine: "process", action: "jd", title: "Draft" },
          { id: "step-2", engine: "review", action: "verify", title: "Check" },
        ],
        updatedAt: "2026-08-16T00:00:00.000Z",
      },
    ])!;
    const card = skillCard(flow);
    expect(card.runsAutomatically).toEqual(["jd"]);
    expect(card.byHand).toEqual(["Check"]);
    expect(card.needs).toEqual(["roleTitle", "responsibilities"]);
  });

  it("takes the id, the slug, the title, or a sentence containing it", () => {
    const flows = [
      {
        id: "recruiting/backend-hiring",
        version: 1,
        title: "Backend hiring",
        workspaceId: "recruiting",
        steps: [],
        updatedAt: "2026-08-16T00:00:00.000Z",
      },
    ];
    expect(resolveWorkflow("recruiting/backend-hiring", flows)?.id).toBe(
      "recruiting/backend-hiring",
    );
    expect(resolveWorkflow("backend-hiring", flows)?.title).toBe("Backend hiring");
    expect(resolveWorkflow("run my backend hiring flow", flows)?.title).toBe(
      "Backend hiring",
    );
    expect(resolveWorkflow("payroll", flows)).toBeUndefined();
  });
});
