import { join } from "node:path";
import { z } from "zod";
import { WorkflowValidationError, type WorkflowDefinition } from "@redrob/registry";
import {
  listWorkflows,
  saveWorkflow,
} from "../services/workflow.js";
import { listTextFiles } from "../services/intake.js";
import { runRecruitingPipeline } from "../services/recruiting-pipeline.js";
import { planWorkflowRun, pipelineStepForAction } from "../../shared/workflow-plan.js";
import { workflowActionIds, workflowActionSpec } from "../../shared/workflow-actions.js";
import { toolStore } from "./tool-store.js";
import type { RegisteredTool, ToolResult } from "./types.js";

/**
 * The person's own flows, as Claude-style skills the chat can search and run.
 *
 * OpenWork's pattern is two tools that scale forever: search finds a capability,
 * execute runs it (or returns its body for the model to follow). The same rail
 * sits here — workflow.search / workflow.execute — with workflow.save so a flow
 * can be written from the chat box the way a skill is written in a SKILL.md.
 */

export function resolveWorkflow(
  reference: string,
  all: readonly WorkflowDefinition[],
): WorkflowDefinition | undefined {
  const needle = reference.trim().toLowerCase();
  if (!needle) return undefined;
  return (
    all.find((flow) => flow.id.toLowerCase() === needle) ??
    all.find((flow) => flow.title.toLowerCase() === needle) ??
    all.find((flow) => flow.id.split("/")[1]?.toLowerCase() === needle) ??
    all.find((flow) => flow.title.toLowerCase().includes(needle)) ??
    all.find((flow) => needle.includes(flow.title.toLowerCase()))
  );
}

function scoreFlow(flow: WorkflowDefinition, query: string): number {
  if (!query) return 1;
  const q = query.toLowerCase();
  let score = 0;
  if (flow.id.toLowerCase() === q) score += 100;
  if (flow.title.toLowerCase() === q) score += 80;
  if (flow.title.toLowerCase().includes(q)) score += 40;
  if (flow.description?.toLowerCase().includes(q)) score += 30;
  if (flow.instructions?.toLowerCase().includes(q)) score += 15;
  if (flow.id.toLowerCase().includes(q)) score += 20;
  for (const step of flow.steps) {
    if (step.title.toLowerCase().includes(q)) score += 8;
    if (step.action.toLowerCase().includes(q)) score += 5;
    if (step.notes?.toLowerCase().includes(q)) score += 4;
  }
  if (q.includes(flow.title.toLowerCase())) score += 25;
  return score;
}

/** The skill card a model reads when it is guiding rather than driving. */
export function skillCard(flow: WorkflowDefinition): {
  id: string;
  title: string;
  description?: string;
  instructions?: string;
  steps: Array<{
    action: string;
    title: string;
    notes?: string;
    runsAutomatically: boolean;
  }>;
  runsAutomatically: string[];
  byHand: string[];
  needs: string[];
} {
  const plan = planWorkflowRun(flow.steps);
  const needs: string[] = [];
  if (plan.needsJdInput) needs.push("roleTitle", "responsibilities");
  if (plan.needsResumeInput) needs.push("resumeFolder");
  return {
    id: flow.id,
    title: flow.title,
    ...(flow.description ? { description: flow.description } : {}),
    ...(flow.instructions ? { instructions: flow.instructions } : {}),
    steps: flow.steps.map((step) => ({
      action: step.action,
      title: step.title,
      ...(step.notes ? { notes: step.notes } : {}),
      runsAutomatically: pipelineStepForAction(step.action) !== undefined,
    })),
    runsAutomatically: plan.steps,
    byHand: plan.manual.map((step) => step.title),
    needs,
  };
}

function guideSummary(flow: WorkflowDefinition): string {
  const card = skillCard(flow);
  const lines = [
    `Skill “${card.title}” (${card.id})`,
    card.description ? `When: ${card.description}` : null,
    card.instructions ? `How:\n${card.instructions}` : null,
    "Steps:",
    ...card.steps.map(
      (step, index) =>
        `  ${index + 1}. ${step.title} (${step.action}${
          step.runsAutomatically ? ", automatic" : ", by hand / with other tools"
        })${step.notes ? ` — ${step.notes}` : ""}`,
    ),
    card.needs.length > 0
      ? `To drive the automatic steps, call workflow.execute again with mode=run and: ${card.needs.join(", ")}.`
      : card.runsAutomatically.length > 0
        ? "Call workflow.execute with mode=run to drive the automatic steps."
        : "There is nothing automatic here — follow the steps with the other tools.",
  ];
  return lines.filter((line): line is string => Boolean(line)).join("\n");
}

export const workflowSearchTool: RegisteredTool = {
  name: "workflow.search",
  description:
    "Find the person's saved flows (skills they wrote). Pass a short query — a title word, " +
    "an outcome, an industry — or omit it to list everything. Returns id, title, description, " +
    "and what each one needs. Call this before workflow.execute when you are unsure which flow " +
    "they mean.",
  risk: "low",
  inputSchema: z.object({
    query: z
      .string()
      .optional()
      .describe("Words from the title, description, or steps; omit to list all"),
    workspaceId: z
      .string()
      .optional()
      .describe("Only flows of one area, e.g. general or finance"),
  }),
  async handler(input): Promise<ToolResult> {
    const all = listWorkflows(input.workspaceId);
    if (all.length === 0) {
      return {
        ok: true,
        summary:
          "This person has not saved any skills yet. They can build one in Skills, or you can " +
          "save one for them with workflow.save.",
        data: { matches: [] },
      };
    }
    const query = input.query?.trim() ?? "";
    const ranked = all
      .map((flow) => ({ flow, score: scoreFlow(flow, query) }))
      .filter((row) => (query ? row.score > 0 : true))
      .sort((a, b) => b.score - a.score || a.flow.title.localeCompare(b.flow.title));

    if (ranked.length === 0) {
      return {
        ok: true,
        summary:
          `No flow matches "${query}". Saved flows: ` +
          all.map((flow) => `${flow.id} (${flow.title})`).join(", "),
        data: { matches: [], query },
      };
    }

    const matches = ranked.slice(0, 12).map(({ flow, score }) => ({
      ...skillCard(flow),
      score,
    }));
    const lines = matches.map((match) => {
      const steps = match.steps.map((step) => step.title).join(" → ");
      return `- ${match.id} — ${match.title}${
        match.description ? `: ${match.description}` : ""
      }\n  ${steps}${
        match.needs.length > 0 ? `\n  needs: ${match.needs.join(", ")}` : ""
      }`;
    });
    return {
      ok: true,
      summary: `${matches.length} matching flow${matches.length === 1 ? "" : "s"}:\n${lines.join("\n")}`,
      data: { matches, query: query || undefined },
    };
  },
};

export const workflowExecuteTool: RegisteredTool = {
  name: "workflow.execute",
  description:
    "Run one of the person's saved skills, or open it as a skill guide. `workflow` takes the skill " +
    "id or its title. mode=guide is the usual path: it returns the author's instructions and step " +
    "list for you to carry out with the other tools (Claude-skill style). mode=run drives the one " +
    "packaged pipeline this device executes end to end — the hiring steps (job post → criteria → " +
    "intake → score → email) — and needs roleTitle/responsibilities (and resumeFolder when intake " +
    "is in the skill). mode=auto (default) runs that pipeline when its inputs are present, " +
    "otherwise returns the guide. Steps this device cannot drive are always reported back.",
  risk: "high",
  inputSchema: z.object({
    workflow: z.string().describe("Flow id (workspace/slug) or its exact title"),
    mode: z
      .enum(["auto", "guide", "run"])
      .optional()
      .describe("guide = skill body; run = drive automatic steps; auto = run when inputs are ready"),
    roleTitle: z.string().optional().describe("Role being hired, for the job post step"),
    responsibilities: z
      .string()
      .optional()
      .describe("What the role does, one item per line"),
    qualifications: z
      .string()
      .optional()
      .describe("What the role requires, one item per line"),
    location: z.string().optional(),
    resumeFolder: z
      .string()
      .optional()
      .describe("Absolute path to a folder of resumes, for the intake step"),
    passThreshold: z
      .number()
      .min(0)
      .max(1)
      .optional()
      .describe("Share of the maximum score needed to pass; default 0.7"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const flows = listWorkflows();
    const flow = resolveWorkflow(input.workflow, flows);
    if (!flow) {
      return {
        ok: false,
        summary:
          `No saved flow matches "${input.workflow}". Call workflow.search, or saved flows are: ` +
          (flows.length > 0
            ? flows.map((item) => `${item.id} (${item.title})`).join(", ")
            : "none yet."),
        error: "Flow not found",
      };
    }

    const plan = planWorkflowRun(flow.steps);
    const mode = input.mode ?? "auto";
    const missing: string[] = [];
    if (plan.needsJdInput) {
      if (!input.roleTitle?.trim()) missing.push("roleTitle");
      if (!input.responsibilities?.trim()) missing.push("responsibilities");
    }
    if (plan.needsResumeInput && !input.resumeFolder?.trim()) {
      missing.push("resumeFolder");
    }
    const canRun = plan.steps.length > 0 && missing.length === 0;
    const wantRun =
      mode === "run" || (mode === "auto" && canRun && plan.steps.length > 0);

    if (!wantRun) {
      const why =
        mode === "guide"
          ? "Opened as a skill guide."
          : plan.steps.length === 0
            ? "This flow has no automatic steps."
            : missing.length > 0
              ? `Automatic steps need ${missing.join(", ")} — ask for those, or follow the guide below.`
              : "Opened as a skill guide.";
      return {
        ok: true,
        summary: `${why}\n\n${guideSummary(flow)}`,
        data: {
          mode: "guide" as const,
          skill: skillCard(flow),
          ...(missing.length > 0 ? { missing } : {}),
        },
      };
    }

    if (mode === "run" && missing.length > 0) {
      return {
        ok: false,
        summary:
          `"${flow.title}" needs ${missing.join(", ")} before it can run. Ask the person for ` +
          "those and call workflow.execute again — do not make them up. Or call with mode=guide " +
          "to read the skill body first.",
        error: `Missing input: ${missing.join(", ")}`,
        data: { skill: skillCard(flow), missing },
      };
    }

    let intakeFilePaths: string[] | undefined;
    if (plan.needsResumeInput && input.resumeFolder) {
      try {
        intakeFilePaths = await listTextFiles(input.resumeFolder.trim());
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return {
          ok: false,
          summary: `Could not read ${input.resumeFolder}: ${message}`,
          error: message,
        };
      }
      if (intakeFilePaths.length === 0) {
        return {
          ok: false,
          summary: `No readable resumes in ${input.resumeFolder}. Ask for the right folder.`,
          error: "Empty intake folder",
        };
      }
    }

    const total = plan.steps.length;
    try {
      const result = await runRecruitingPipeline(
        toolStore(ctx.userDataPath),
        {
          workspaceId: flow.workspaceId,
          steps: plan.steps,
          ...(plan.needsJdInput
            ? {
                jd: {
                  roleTitle: input.roleTitle!.trim(),
                  responsibilities: input.responsibilities!.trim(),
                  qualifications: input.qualifications?.trim() ?? "",
                  ...(input.location?.trim()
                    ? { location: input.location.trim() }
                    : {}),
                },
              }
            : {}),
          ...(intakeFilePaths ? { intakeFilePaths } : {}),
          ...(input.passThreshold !== undefined
            ? { passThreshold: input.passThreshold }
            : {}),
        },
        {
          intakeStateDirectory: join(ctx.userDataPath, "intake-runs"),
          onProgress: (progress) => {
            if (progress.step === "done") return;
            ctx.onProgress?.(
              `${flow.title} — ${progress.step} (${progress.index}/${total})`,
            );
          },
        },
      );

      const context = result.context;
      const done: string[] = [];
      if (context.jdMarkdown) {
        done.push(`job post drafted (${context.jdMarkdown.length} characters)`);
      }
      if (context.rubricId) done.push(`scoring criteria saved as ${context.rubricId}`);
      if (context.documentIds.length > 0) {
        done.push(`${context.documentIds.length} resumes brought in`);
      }
      for (const assessment of context.assessResults) {
        done.push(
          `scored ${assessment.scoreSum}/${assessment.scoreMax} — ${assessment.decision}`,
        );
      }
      if (context.emailArtifactIds.length > 0) {
        done.push(`${context.emailArtifactIds.length} decision emails drafted`);
      }
      const byHand =
        plan.manual.length > 0
          ? `\nStill for the person (or for you with other tools): ${plan.manual
              .map((step) => step.title)
              .join(", ")}.`
          : "";
      const primaryArtifact =
        context.jdArtifactId ??
        context.rubricArtifactId ??
        context.emailArtifactIds[0];

      return {
        ok: true,
        summary:
          `Ran “${flow.title}” in ${(result.timingMs / 1000).toFixed(1)}s.\n` +
          done.map((line) => `- ${line}`).join("\n") +
          byHand,
        data: {
          mode: "run" as const,
          workflowId: flow.id,
          ranSteps: plan.steps,
          manualSteps: plan.manual.map((step) => step.title),
          skill: skillCard(flow),
          context,
          timingMs: result.timingMs,
        },
        ...(primaryArtifact ? { artifactId: primaryArtifact } : {}),
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return {
        ok: false,
        summary: `“${flow.title}” stopped: ${message}`,
        error: message,
      };
    }
  },
};

export const workflowSaveTool: RegisteredTool = {
  name: "workflow.save",
  description:
    "Save a flow/skill for this person so they (and you) can find it with workflow.search and " +
    "call it with workflow.execute — the same thing they would build in Skills. Give it a " +
    "title, a one-line description of when to use it, optional longer instructions (the skill " +
    "body), and its steps in order. Each step needs one of the known actions; call with an empty " +
    "steps array to get the action list. Saving a flow with the same title replaces it.",
  risk: "high",
  inputSchema: z.object({
    title: z.string().describe("What the person will call this flow"),
    description: z
      .string()
      .max(400)
      .optional()
      .describe("When to use it, in one line. This is what search and the prompt read."),
    instructions: z
      .string()
      .max(4000)
      .optional()
      .describe("How to do the work — the skill body returned by mode=guide"),
    workspaceId: z
      .string()
      .optional()
      .describe("Area the skill belongs to, lowercase letters; default general"),
    steps: z
      .array(
        z.object({
          action: z
            .string()
            .describe("A known action id, e.g. research, memo, deck, documentEdit, custom"),
          title: z.string().optional().describe("What this step does, in the person's words"),
          notes: z.string().optional(),
        }),
      )
      .describe("Steps in the order they should happen"),
  }),
  async handler(input): Promise<ToolResult> {
    const known = workflowActionIds();
    if (!Array.isArray(input.steps) || input.steps.length === 0) {
      return {
        ok: false,
        summary: `A flow needs at least one step. Known actions: ${known.join(", ")}.`,
        error: "No steps",
        data: { actions: known },
      };
    }
    const unknown = input.steps
      .map((step: { action: string }) => step.action)
      .filter((action: string) => !workflowActionSpec(action));
    if (unknown.length > 0) {
      return {
        ok: false,
        summary:
          `Unknown step actions: ${unknown.join(", ")}. Use one of: ${known.join(", ")}.`,
        error: "Unknown action",
        data: { actions: known },
      };
    }
    const workspaceId = (input.workspaceId ?? "general").toLowerCase();
    if (!/^[a-z]+$/.test(workspaceId)) {
      return {
        ok: false,
        summary: `Invalid workspaceId "${workspaceId}"; use lowercase letters only.`,
        error: "Invalid workspaceId",
      };
    }
    try {
      const { workflow } = saveWorkflow({
        workspaceId,
        title: input.title,
        ...(input.description?.trim()
          ? { description: input.description.trim() }
          : {}),
        ...(input.instructions?.trim()
          ? { instructions: input.instructions.trim() }
          : {}),
        steps: input.steps.map(
          (step: { action: string; title?: string; notes?: string }) => {
            const spec = workflowActionSpec(step.action)!;
            return {
              engine: spec.engine,
              action: spec.action,
              title: step.title?.trim() || spec.action,
              ...(spec.registryId ? { registryId: spec.registryId } : {}),
              ...(step.notes?.trim() ? { notes: step.notes.trim() } : {}),
            };
          },
        ),
      });
      const plan = planWorkflowRun(workflow.steps);
      return {
        ok: true,
        summary:
          `Saved “${workflow.title}” as ${workflow.id}. It appears in Skills, and you can ` +
          `find it with workflow.search and call it with workflow.execute. Runs automatically: ${
            plan.steps.length > 0 ? plan.steps.join(" → ") : "nothing yet"
          }${
            plan.manual.length > 0
              ? `; by hand: ${plan.manual.map((step) => step.title).join(", ")}`
              : ""
          }.`,
        data: { workflow },
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      // A validation failure carries a stable code, so the model is told exactly
      // what to fix (title_too_long, dup_step_id…) instead of a prose message.
      const code =
        err instanceof WorkflowValidationError ? err.code : "save_failed";
      return {
        ok: false,
        summary: `Could not save the flow: ${message}`,
        error: message,
        data: { code },
      };
    }
  },
};

export const WORKFLOW_TOOLS: RegisteredTool[] = [
  workflowSearchTool,
  workflowExecuteTool,
  workflowSaveTool,
];

/** @deprecated Use workflowSearchTool — kept so older tests/imports resolve during rename. */
export const workflowListTool = workflowSearchTool;
/** @deprecated Use workflowExecuteTool. */
export const workflowRunTool = workflowExecuteTool;
