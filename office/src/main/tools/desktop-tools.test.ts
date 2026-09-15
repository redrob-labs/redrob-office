import { describe, expect, it } from "vitest";
import { selectElements, uiElements } from "../desktop/ui-elements.js";
import { bestMatch, inputTypeTool } from "./desktop-tools.js";

/*
 * Typing is the step that loses a run.
 *
 * A search box holding the last query turns the next attempt into
 * "redrob-labsredrob-labs", the wrong conversation opens, and everything after
 * that is confident and wrong. So typing blind is refused while the field is
 * sitting there in the element list with a name and an id.
 */

const WINDOW = { x: 0, y: 0, width: 1920, height: 1080 };

function readElements(fields: Array<{ name: string; value?: string }>): void {
  const elements = selectElements(
    fields.map((field, index) => ({
      name: field.name,
      role: "Edit",
      rect: { x: 400, y: 40 + index * 60, width: 300, height: 30 },
      ...(field.value === undefined ? {} : { value: field.value }),
    })),
    { window: WINDOW, generation: uiElements.nextGeneration() },
  );
  uiElements.replace(
    { hwnd: 1, title: "Slack", process: "slack", rect: WINDOW },
    elements,
  );
}

// Searching for a channel worked; clicking the row it found did not. Picking
// by name takes the id-juggling out of the step that kept failing.
describe("bestMatch", () => {
  const rect = { x: 0, y: 0, width: 1920, height: 1080 };
  const rows = selectElements(
    [
      {
        name: "strategy_redrob-ai",
        role: "ListItem",
        rect: { x: 200, y: 300, width: 400, height: 30 },
      },
      {
        name: "redrob-labs",
        role: "ListItem",
        rect: { x: 200, y: 340, width: 400, height: 30 },
      },
      {
        name: "redrob-labs",
        role: "Text",
        rect: { x: 210, y: 345, width: 200, height: 20 },
      },
      {
        name: "redrob-labs 채널에 올린 어제 공지 보셨나요",
        role: "Text",
        rect: { x: 700, y: 500, width: 600, height: 20 },
      },
    ],
    { window: rect, generation: 1 },
  );

  it("takes the row with that name, not the message that mentions it", () => {
    const picked = bestMatch(rows, "redrob-labs");
    expect(picked?.name).toBe("redrob-labs");
    expect(picked?.role).toBe("ListItem");
  });

  it("does not settle for a channel that merely starts the same", () => {
    expect(bestMatch(rows, "strategy_redrob-ai")?.name).toBe(
      "strategy_redrob-ai",
    );
    expect(bestMatch(rows, "nothing-like-this")).toBe(null);
  });

  it("ignores the difference between #name, name and Name", () => {
    expect(bestMatch(rows, "#Redrob Labs")?.name).toBe("redrob-labs");
  });
});

describe("input.type without a field", () => {
  it("refuses, and says which fields it could have been given", async () => {
    readElements([{ name: "Search", value: "redrob-labs" }]);
    const result = await inputTypeTool.handler({ text: "redrob-labs" }, {
      userDataPath: "",
    } as never);
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/elementId/);
    expect(result.error).toMatch(/holding "redrob-labs"/);
  });

  it("leaves a way through for a place the reader cannot see", async () => {
    readElements([{ name: "Search" }]);
    const result = await inputTypeTool.handler(
      { text: "안녕하세요", append: true },
      { userDataPath: "" } as never,
    ).catch((err: Error) => err);
    // Desktop control is off in a test, so the escape hatch reaches the
    // backend gate rather than the refusal above.
    expect(result).not.toMatchObject({ ok: false, summary: "No field named" });
  });

  it("types blind when nothing was read", async () => {
    uiElements.replace(
      { hwnd: 1, title: "Slack", process: "slack", rect: WINDOW },
      [],
    );
    const result = await inputTypeTool
      .handler({ text: "hello" }, { userDataPath: "" } as never)
      .catch((err: Error) => err);
    expect(result).not.toMatchObject({ ok: false, summary: "No field named" });
  });
});
