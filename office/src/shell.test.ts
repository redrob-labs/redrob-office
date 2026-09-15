import { describe, expect, it } from "vitest";
import { CATEGORIES, WORKSPACES, listCatalogItems } from "@redrob/ui";

describe("desk shell", () => {
  it("loads category definitions for the template bar", () => {
    expect(WORKSPACES.length).toBe(CATEGORIES.length);
    expect(WORKSPACES[0]?.id).toBe("create");
    expect(WORKSPACES[0]?.modules.some((m) => m.id === "workflow")).toBe(false);
  });

  it("keeps chat out of the template bar", () => {
    for (const workspace of WORKSPACES) {
      expect(workspace.modules.some((m) => m.id === "ask")).toBe(false);
    }
  });

  /**
   * Nothing browses these any more, but a saved skill can hand any of them off
   * as a step, so every one still needs a panel behind it.
   */
  it("gives every step a skill can hand off a panel to render", () => {
    const routed = new Set([
      "jd",
      "rubric",
      "screen",
      "assess",
      "verify",
      "email",
      "transcribe",
      "publish",
      "daylog",
      "documentEdit",
      "intake",
      "checklist",
      "draft",
      "deck",
      "graphic",
      "research",
    ]);
    for (const item of listCatalogItems()) {
      expect(routed).toContain(item.template.id);
    }
  });
});
