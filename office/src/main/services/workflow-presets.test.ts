import { describe, expect, it } from "vitest";
import { workflowActionIds } from "../../shared/workflow-actions.js";
import { listWorkflowPresets } from "./workflow.js";

describe("packaged skill presets", () => {
  it("defaults to general skills, not to one industry", () => {
    const presets = listWorkflowPresets(undefined, "en");
    expect(presets.length).toBeGreaterThan(0);
    for (const preset of presets) {
      expect(preset.workspaceId).toBe("general");
    }
  });

  /**
   * The whole point of the general set: someone who has never hired anyone
   * should still recognize their own work in the first thing Skills shows them.
   */
  it("keeps hiring vocabulary out of the default set", () => {
    const text = JSON.stringify(listWorkflowPresets("general", "en")).toLowerCase();
    for (const word of ["resume", "candidate", "job post", "hiring", "recruit"]) {
      expect(text).not.toContain(word);
    }
  });

  it("builds every default step from a known action", () => {
    const known = new Set(workflowActionIds());
    for (const preset of listWorkflowPresets("general", "en")) {
      expect(preset.steps.length).toBeGreaterThan(1);
      for (const step of preset.steps) {
        expect(known).toContain(step.action);
      }
    }
  });

  it("still ships the industry sets for people who go looking", () => {
    expect(listWorkflowPresets("recruiting", "en").length).toBeGreaterThan(0);
    expect(listWorkflowPresets("finance", "en").length).toBeGreaterThan(0);
    expect(listWorkflowPresets("nosuchdomain", "en")).toEqual([]);
  });

  it("localizes both languages", () => {
    const [en] = listWorkflowPresets("general", "en");
    const [ko] = listWorkflowPresets("general", "ko");
    expect(en?.slug).toBe(ko?.slug);
    expect(en?.title).not.toBe(ko?.title);
    expect(ko?.description).toBeTruthy();
  });
});
