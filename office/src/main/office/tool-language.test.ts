import { describe, expect, it } from "vitest";
import { describeToolCall, toolSentence } from "./tool-language";

describe("describeToolCall", () => {
  it("says what will happen to the screen, not which method does it", () => {
    expect(describeToolCall("screen.capture", {}).title).toBe("Take a picture of your screen");
    expect(describeToolCall("screen.record.start", {}).title).toBe("Start recording your screen");
  });

  it("names the point a click will land on", () => {
    expect(describeToolCall("input.click", { x: 853, y: 111 })).toEqual({
      title: "Click on your screen",
      detail: "at 853, 111",
    });
  });

  it("distinguishes the button and the double click", () => {
    expect(describeToolCall("input.click", { x: 1, y: 2, button: "right" }).title).toBe(
      "Right-click on your screen",
    );
    expect(describeToolCall("input.click", { x: 1, y: 2, count: 2 }).title).toBe(
      "Double-click on your screen",
    );
  });

  it("shows the words about to be typed, which is the thing worth checking", () => {
    expect(describeToolCall("input.type", { text: "example.com" }).detail).toBe("“example.com”");
  });

  it("cuts text too long to read at a glance", () => {
    const detail = describeToolCall("input.type", { text: "x".repeat(200) }).detail;
    expect(detail.length).toBeLessThan(90);
    expect(detail).toContain("…");
  });

  it("flattens newlines, so a prompt stays one line", () => {
    expect(describeToolCall("input.type", { text: "one\n\ntwo" }).detail).toBe("“one two”");
  });

  it("names a file by its name rather than its whole path", () => {
    expect(describeToolCall("fs.write", { path: "/home/me/notes/plan.md" }).detail).toBe("plan.md");
    expect(describeToolCall("app.launch", { target: "C:\\\\Program Files\\\\thing.exe" }).detail).toBe(
      "thing.exe",
    );
  });

  it("shows a command with its arguments, since that is what will run", () => {
    expect(describeToolCall("shell.exec", { command: "pnpm", args: ["run", "build"] }).detail).toBe(
      "pnpm run build",
    );
  });

  it("reads a scroll by its direction", () => {
    expect(describeToolCall("input.scroll", { x: 1, y: 2, ticks: -3 }).title).toBe("Scroll down");
    expect(describeToolCall("input.scroll", { x: 1, y: 2, ticks: 3 }).title).toBe("Scroll up");
  });

  it("still reads as an action for a tool it has no words for", () => {
    expect(describeToolCall("doc.findReplace", {}).title).toBe("Doc find replace");
  });

  it("names the server behind a tool from a connected MCP service", () => {
    expect(describeToolCall("mcp__Chrome_DevTools__new_page", {})).toEqual({
      title: "Use Chrome DevTools",
      detail: "new page",
    });
    expect(describeToolCall("mcp__Figma__get_file_2", {})).toEqual({
      title: "Use Figma",
      detail: "get file 2",
    });
    // Nothing usable after the prefix still has to read as a sentence.
    expect(describeToolCall("mcp__", {}).title).toBe("Use a connected tool");
  });

  it("shows the number of independent runs and their access levels", () => {
    expect(
      describeToolCall("agents.delegate", {
        assignments: [
          { task: "Read source A", permission: "read" },
          { task: "Create the file", permission: "write" },
        ],
      }),
    ).toEqual({
      title: "Run 2 independent agents",
      detail: "Access: read, write",
    });
  });

  it("survives arguments that are missing or the wrong type", () => {
    expect(describeToolCall("input.click", {}).detail).toBe("");
    expect(describeToolCall("input.type", { text: 42 }).detail).toBe("");
    expect(describeToolCall("fs.write", {}).detail).toBe("");
    expect(describeToolCall("shell.exec", { command: "ls", args: "not-an-array" }).detail).toBe(
      "ls",
    );
  });

  it("never leaves a dotted identifier in the title", () => {
    for (const name of [
      "screen.capture",
      "input.move",
      "input.key",
      "app.focus",
      "net.httpPost",
      "fs.patch.undo",
    ]) {
      expect(describeToolCall(name, {}).title).not.toMatch(/\./);
    }
  });
});

describe("toolSentence", () => {
  it("joins the action and its specifics", () => {
    expect(toolSentence("input.click", { x: 5, y: 6 })).toBe("Click on your screen: at 5, 6");
  });

  it("is just the action when there is nothing to add", () => {
    expect(toolSentence("screen.capture", {})).toBe("Take a picture of your screen");
  });
});
