import { describe, expect, it } from "vitest";
import { extractArtifactsFromAssistantText } from "./chat-artifacts";

describe("extractArtifactsFromAssistantText", () => {
  it("pulls fenced artifact blocks out of the chat bubble", () => {
    const input = [
      "초안을 아래에 정리했어요.",
      "",
      "```artifact",
      "Title: Backend JD",
      "# Backend Engineer",
      "",
      "## Responsibilities",
      "- Own APIs",
      "```",
      "",
      "필요하면 톤을 더 줄일게요.",
    ].join("\n");

    const result = extractArtifactsFromAssistantText(input);
    expect(result.artifacts).toHaveLength(1);
    expect(result.artifacts[0]?.title).toBe("Backend JD");
    expect(result.artifacts[0]?.body).toContain("# Backend Engineer");
    expect(result.displayText).toContain("초안을 아래에 정리했어요.");
    expect(result.displayText).not.toContain("# Backend Engineer");
    expect(result.displayText).toContain("필요하면 톤을 더 줄일게요.");
  });

  it("does not promote ordinary markdown fences or long replies", () => {
    const fencedMd = [
      "여기 요약이에요.",
      "",
      "```markdown",
      "# Notes",
      "",
      "## One",
      "x".repeat(280),
      "",
      "## Two",
      "y".repeat(280),
      "```",
    ].join("\n");
    expect(extractArtifactsFromAssistantText(fencedMd).artifacts).toHaveLength(0);

    const longDoc = [
      "# Hiring plan",
      "",
      "## Goals",
      "x".repeat(280),
      "",
      "## Timeline",
      "y".repeat(280),
      "",
      "## Owners",
      "z".repeat(280),
    ].join("\n");
    expect(extractArtifactsFromAssistantText(longDoc).artifacts).toHaveLength(0);
  });

  it("ignores short replies", () => {
    const result = extractArtifactsFromAssistantText("짧게 답할게요. 서울 날씨는 맑아요.");
    expect(result.artifacts).toHaveLength(0);
    expect(result.displayText).toContain("짧게 답할게요");
  });

  it("keeps a page a page", () => {
    const page = [
      "Here is the deck site.",
      "",
      "```artifact html",
      "<!DOCTYPE html>",
      "<html><head><title>Launch deck</title></head>",
      "<body><section><h1>Slide one</h1></section></body></html>",
      "```",
    ].join("\n");
    const [artifact] = extractArtifactsFromAssistantText(page).artifacts;
    expect(artifact?.format).toBe("html");
    expect(artifact?.title).toBe("Launch deck");
  });

  it("reads the markup when the fence is not labelled", () => {
    const page = [
      "```artifact",
      "<!doctype html>",
      "<html><body><h1>Espresso, briefly</h1><p>A one page deck.</p></body></html>",
      "```",
    ].join("\n");
    const [artifact] = extractArtifactsFromAssistantText(page).artifacts;
    expect(artifact?.format).toBe("html");
    expect(artifact?.title).toBe("Espresso, briefly");

    const icon = [
      "```artifact",
      '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24">',
      '<circle cx="12" cy="12" r="9" fill="currentColor" /></svg>',
      "```",
    ].join("\n");
    expect(extractArtifactsFromAssistantText(icon).artifacts[0]?.format).toBe("svg");
  });

  it("still treats a prose document as markdown", () => {
    const doc = [
      "```artifact",
      "Title: Weekly notes",
      "# Weekly notes",
      "",
      "- shipped the importer",
      "```",
    ].join("\n");
    expect(extractArtifactsFromAssistantText(doc).artifacts[0]?.format).toBe("md");
  });
});
