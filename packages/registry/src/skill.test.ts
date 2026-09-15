import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  SkillDependencyError,
  packSkill,
  parseSkillFile,
  parseSkillJson,
  skillToJson,
  unpackSkill,
  validateSkill,
} from "./skill.js";
import { setUserRubricsDir, saveUserRubric } from "./user-rubrics.js";
import { setUserWorkflowsDir, saveUserWorkflow, loadUserWorkflow } from "./user-workflows.js";

describe("redrob skill pack/unpack", () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), "redrob-skill-"));
    setUserRubricsDir(join(root, "rubrics"));
    setUserWorkflowsDir(join(root, "workflows"));
  });

  afterEach(() => {
    setUserRubricsDir(null);
    setUserWorkflowsDir(null);
    rmSync(root, { recursive: true, force: true });
  });

  it("round-trips a workflow that only references bundled registry ids", () => {
    saveUserWorkflow({
      id: "recruiting/assess-flow",
      version: 1,
      title: "Score candidates",
      workspaceId: "recruiting",
      updatedAt: "2026-08-05T00:00:00.000Z",
      steps: [
        {
          id: "step-1",
          engine: "lookup",
          action: "intake",
          title: "Intake",
          registryId: "recruiting/resume",
        },
        {
          id: "step-2",
          engine: "process",
          action: "assess",
          title: "Assess",
          registryId: "recruiting/candidate-6axis",
        },
      ],
    });

    const packed = packSkill("recruiting/assess-flow", {
      description: "Intake resumes then score against the 6-axis rubric",
      skillId: "community/assess-candidates",
    });
    expect(packed.format).toBe("redrob.skill");
    expect(packed.rubrics).toEqual([]);
    expect(packed.workflow.steps).toHaveLength(2);

    const json = skillToJson(packed);
    setUserWorkflowsDir(join(root, "workflows-b"));
    setUserRubricsDir(join(root, "rubrics-b"));

    const result = unpackSkill(parseSkillJson(json));
    expect(result.workflowId).toBe("recruiting/assess-flow");
    expect(loadUserWorkflow("recruiting/assess-flow")?.title).toBe("Score candidates");
  });

  it("bundles user rubrics and renames on collision", () => {
    saveUserRubric({
      id: "recruiting/custom-axis",
      version: 1,
      axes: [
        {
          id: "A",
          label: "Fit",
          range: [1, 5],
          guidance: "Role fit",
        },
      ],
      rules: [],
    });
    saveUserWorkflow({
      id: "recruiting/custom-flow",
      version: 1,
      title: "Custom score",
      workspaceId: "recruiting",
      updatedAt: "2026-08-05T00:00:00.000Z",
      steps: [
        {
          id: "step-1",
          engine: "process",
          action: "assess",
          title: "Assess",
          registryId: "recruiting/custom-axis",
        },
      ],
    });

    const packed = packSkill("recruiting/custom-flow", {
      description: "Custom rubric flow",
    });
    expect(packed.rubrics).toHaveLength(1);

    // Pre-create colliding rubric + workflow on destination
    setUserWorkflowsDir(join(root, "workflows-b"));
    setUserRubricsDir(join(root, "rubrics-b"));
    saveUserRubric({
      id: "recruiting/custom-axis",
      version: 1,
      axes: [
        {
          id: "A",
          label: "Other",
          range: [1, 5],
          guidance: "Other",
        },
      ],
      rules: [],
    });
    saveUserWorkflow({
      id: "recruiting/custom-flow",
      version: 1,
      title: "Existing",
      workspaceId: "recruiting",
      updatedAt: "2026-08-05T00:00:00.000Z",
      steps: [
        {
          id: "step-1",
          engine: "process",
          action: "jd",
          title: "JD",
          registryId: "recruiting/jd",
        },
      ],
    });

    const result = unpackSkill(packed, { onCollision: "rename" });
    expect(result.workflowId).toBe("recruiting/custom-flow-2");
    expect(result.addedRubrics).toContain("recruiting/custom-axis-2");
    expect(result.renamed.length).toBeGreaterThanOrEqual(2);
    const imported = loadUserWorkflow("recruiting/custom-flow-2");
    expect(imported?.steps[0]?.registryId).toBe("recruiting/custom-axis-2");
  });

  it("rejects skills that reference missing registry ids", () => {
    expect(() =>
      validateSkill({
        format: "redrob.skill",
        formatVersion: 1,
        manifest: {
          id: "community/broken",
          title: "Broken",
          description: "Missing dep",
          workspaceId: "recruiting",
          createdAt: "2026-08-05T00:00:00.000Z",
        },
        workflow: {
          id: "recruiting/broken",
          version: 1,
          title: "Broken",
          workspaceId: "recruiting",
          updatedAt: "2026-08-05T00:00:00.000Z",
          steps: [
            {
              id: "step-1",
              engine: "process",
              action: "assess",
              title: "Assess",
              registryId: "recruiting/does-not-exist",
            },
          ],
        },
        rubrics: [],
      }),
    ).toThrow(SkillDependencyError);
  });

  it("reads a Claude skill file as a flow, keeping its instructions whole", () => {
    const skill = parseSkillJson(
      JSON.stringify({
        name: "Competitor teardown",
        description: "Compare three competitors and write the positioning up.",
        instructions:
          "Find each competitor's pricing page, quote the tiers, then say where we sit.",
      }),
    );
    expect(skill.format).toBe("redrob.skill");
    expect(skill.manifest.author).toBe("Claude skill");
    expect(skill.workflow.id).toBe("custom/competitor-teardown");
    expect(skill.workflow.version).toBe(1);
    expect(skill.workflow.instructions).toContain("pricing page");
    expect(skill.workflow.steps).toHaveLength(1);
    expect(skill.workflow.steps[0]!.engine).toBe("process");
    // It has to survive the app's own validation, or importing it fails later.
    expect(unpackSkill(skill).workflowId).toBe("custom/competitor-teardown");
  });

  it("reads an OpenClaw playbook, and a step that asks for approval stays a review", () => {
    const skill = parseSkillJson(
      JSON.stringify({
        agent: "Weekly brief",
        goal: "Collect the week's numbers and post the brief.",
        playbook: [
          { title: "Pull the numbers", action: "lookup.metrics", engine: "lookup" },
          { name: "Draft the brief", prompt: "Write it in five bullets." },
          { title: "Send it", confirm: true },
        ],
      }),
    );
    expect(skill.manifest.author).toBe("OpenClaw playbook");
    expect(skill.workflow.steps.map((step) => step.engine)).toEqual([
      "lookup",
      "process",
      "review",
    ]);
    expect(skill.workflow.steps[1]!.notes).toBe("Write it in five bullets.");
    expect(skill.workflow.steps.map((step) => step.id)).toEqual([
      "step-1",
      "step-2",
      "step-3",
    ]);
    expect(unpackSkill(skill).workflowTitle).toBe("Weekly brief");
  });

  it("reads a Claude SKILL.md, front matter for the name and the body as the guide", () => {
    const skill = parseSkillFile(
      [
        "---",
        "name: Weekly revenue check",
        "description: Pull the week's numbers and say what moved.",
        "license: Apache-2.0",
        "---",
        "",
        "# Weekly revenue check",
        "",
        "Open the billing export, total the week, compare it with the week before.",
      ].join("\n"),
      "SKILL.md",
    );
    expect(skill.manifest.author).toBe("Claude skill");
    expect(skill.manifest.title).toBe("Weekly revenue check");
    expect(skill.manifest.description).toContain("what moved");
    expect(skill.workflow.id).toBe("custom/weekly-revenue-check");
    expect(skill.workflow.instructions).toContain("billing export");
    // The body lives on the flow, so the step does not repeat it.
    expect(skill.workflow.steps[0]!.notes).toBeUndefined();
    expect(unpackSkill(skill).workflowTitle).toBe("Weekly revenue check");
  });

  it("names a markdown skill from its first heading when there is no front matter", () => {
    const skill = parseSkillFile(
      "# Inbox triage\n\nSort the morning mail into reply, delegate, and ignore.",
      "inbox-triage.md",
    );
    expect(skill.manifest.title).toBe("Inbox triage");
    expect(skill.workflow.instructions).toContain("morning mail");
  });

  it("reads an OpenClaw playbook written as YAML", () => {
    const skill = parseSkillFile(
      [
        "agent: Release notes",
        "goal: Turn the merged pull requests into notes customers can read.",
        "playbook:",
        "  - title: Collect the merges",
        "    action: lookup.commits",
        "    engine: lookup",
        "  - name: Write the notes",
        "    prompt: Group them by what a customer would notice.",
        "  - title: Post it",
        "    confirm: true",
      ].join("\n"),
      "claw.yaml",
    );
    expect(skill.manifest.author).toBe("OpenClaw playbook");
    expect(skill.workflow.steps.map((step) => step.engine)).toEqual([
      "lookup",
      "process",
      "review",
    ]);
    expect(unpackSkill(skill).workflowId).toBe("custom/release-notes");
  });

  it("still reads a skill whose extension says nothing useful", () => {
    const asJson = parseSkillFile(
      JSON.stringify({ name: "Ad hoc", description: "No extension to go on." }),
      "skill",
    );
    expect(asJson.manifest.title).toBe("Ad hoc");
    const asYaml = parseSkillFile("agent: Ad hoc\ngoal: No extension to go on.", "skill");
    expect(asYaml.manifest.author).toBe("OpenClaw playbook");
  });

  it("refuses a file that does not describe one skill", () => {
    expect(() => parseSkillFile("- one\n- two\n", "list.yaml")).toThrow(
      /must describe one skill/,
    );
  });

  it("parses shipped sample .redrobskill files", async () => {
    const { readFileSync, readdirSync } = await import("node:fs");
    const { dirname, join } = await import("node:path");
    const { fileURLToPath } = await import("node:url");
    const skillsDir = join(dirname(fileURLToPath(import.meta.url)), "..", "skills");
    const files = readdirSync(skillsDir).filter((name) => name.endsWith(".redrobskill"));
    expect(files.length).toBeGreaterThanOrEqual(2);
    for (const name of files) {
      const skill = parseSkillJson(readFileSync(join(skillsDir, name), "utf8"));
      expect(skill.manifest.id).toMatch(/^community\//);
      const result = unpackSkill(skill);
      expect(result.workflowId).toBeTruthy();
    }
  });
});
