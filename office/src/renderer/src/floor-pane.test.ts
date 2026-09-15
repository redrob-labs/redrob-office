import { describe, expect, it } from "vitest";
import { isPaneOpen, nextPaneTab, togglePane, type FloorPane } from "./floor-pane";

const profile = (staffId: string): FloorPane => ({ kind: "profile", staffId });

describe("togglePane", () => {
  it("opens a view when the pane is closed", () => {
    expect(togglePane(null, { kind: "files" })).toEqual({ kind: "files" });
  });

  it("closes the view that is already open", () => {
    expect(togglePane({ kind: "files" }, { kind: "files" })).toBeNull();
  });

  it("switches between views without closing", () => {
    expect(togglePane({ kind: "files" }, { kind: "details" })).toEqual({ kind: "details" });
  });

  it("treats another person as a switch, and the same person as a close", () => {
    expect(togglePane(profile("a"), profile("b"))).toEqual(profile("b"));
    expect(togglePane(profile("a"), profile("a"))).toBeNull();
  });

  it("treats another message the same way", () => {
    const message = (postId: string): FloorPane => ({ kind: "message", postId });
    expect(togglePane(message("1"), message("2"))).toEqual(message("2"));
    expect(togglePane(message("1"), message("1"))).toBeNull();
  });

  it("opens a profile over any other view", () => {
    expect(togglePane({ kind: "details" }, profile("a"))).toEqual(profile("a"));
  });
});

describe("isPaneOpen", () => {
  it("reports the open view, and nothing when the pane is closed", () => {
    expect(isPaneOpen({ kind: "files" }, "files")).toBe(true);
    expect(isPaneOpen({ kind: "files" }, "details")).toBe(false);
    expect(isPaneOpen(null, "files")).toBe(false);
  });
});

describe("nextPaneTab", () => {
  it("wraps around the bar in both directions", () => {
    expect(nextPaneTab("details", "ArrowLeft")).toBe("directives");
    expect(nextPaneTab("directives", "ArrowRight")).toBe("details");
    expect(nextPaneTab("meeting", "ArrowRight")).toBe("files");
  });

  it("jumps to the ends", () => {
    expect(nextPaneTab("files", "Home")).toBe("details");
    expect(nextPaneTab("files", "End")).toBe("directives");
  });

  it("ignores keys the bar does not own", () => {
    expect(nextPaneTab("details", "Enter")).toBeNull();
    expect(nextPaneTab("details", "ArrowDown")).toBeNull();
  });
});
