import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { configureUserWorkflows, getWorkflow, saveWorkflow } from "./workflow.js";

/**
 * A schedule is only real if it survives being saved.
 *
 * The trigger field existed on the type and was dropped on the way to disk, so a
 * person could pick "every weekday at nine", see "Saved", and have nothing
 * scheduled. These tests are that round trip.
 */
describe("saveWorkflow with a schedule", () => {
  let dir = "";

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), "redrob-workflow-save-"));
    configureUserWorkflows(dir);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  const steps = [{ engine: "process" as const, action: "custom", title: "Do the thing" }];

  it("writes a cron schedule that comes back off disk", () => {
    const { workflow } = saveWorkflow({
      workspaceId: "general",
      title: "Weekday digest",
      steps,
      trigger: {
        type: "cron",
        cron: "0 9 * * 1-5",
        targetChannelId: "general",
        enabled: true,
      },
    });
    expect(workflow.trigger?.cron).toBe("0 9 * * 1-5");

    const reloaded = getWorkflow(workflow.id);
    expect(reloaded?.trigger).toEqual({
      type: "cron",
      cron: "0 9 * * 1-5",
      targetChannelId: "general",
      enabled: true,
    });
  });

  it("stores nothing for a manual skill, so nothing watches the clock for it", () => {
    const { workflow } = saveWorkflow({
      workspaceId: "general",
      title: "Only by hand",
      steps,
      trigger: { type: "manual" },
    });
    expect(workflow.trigger).toBeUndefined();
    expect(getWorkflow(workflow.id)?.trigger).toBeUndefined();
  });

  it("refuses a schedule this machine cannot keep, at the moment of saving", () => {
    expect(() =>
      saveWorkflow({
        workspaceId: "general",
        title: "Broken cron",
        steps,
        trigger: { type: "cron", cron: "@daily", enabled: true },
      }),
    ).toThrow(/five-field cron/);

    expect(() =>
      saveWorkflow({
        workspaceId: "general",
        title: "Zero interval",
        steps,
        trigger: { type: "interval", intervalMinutes: 0, enabled: true },
      }),
    ).toThrow(/whole number of minutes/);

    // And nothing was left behind by the refused save.
    expect(getWorkflow("general/broken-cron")).toBeNull();
  });

  it("keeps an interval schedule with the channel it reports to", () => {
    const { workflow } = saveWorkflow({
      workspaceId: "general",
      title: "Every ten minutes",
      steps,
      trigger: {
        type: "interval",
        intervalMinutes: 10,
        targetChannelId: "brief",
        enabled: true,
      },
    });
    expect(getWorkflow(workflow.id)?.trigger).toEqual({
      type: "interval",
      intervalMinutes: 10,
      targetChannelId: "brief",
      enabled: true,
    });
  });
});
