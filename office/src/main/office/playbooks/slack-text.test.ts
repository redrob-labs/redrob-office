import { describe, expect, it } from "vitest";
import { hasMarkdown, slackMessageText } from "./slack-text.js";

describe("slackMessageText", () => {
  it("turns a heading into a bold line", () => {
    expect(slackMessageText("## labs.redrob.ai 근황")).toBe(
      "*labs.redrob.ai 근황*",
    );
  });

  it("gives a list real bullets instead of asterisks", () => {
    expect(slackMessageText("- Eval 공개\n- Studio 공개")).toBe(
      "• Eval 공개\n• Studio 공개",
    );
    expect(slackMessageText("* Eval 공개")).toBe("• Eval 공개");
  });

  it("writes bold and italic the way Slack reads them", () => {
    expect(slackMessageText("**Series A** 는 _중요_ 합니다")).toBe(
      "*Series A* 는 _중요_ 합니다",
    );
    expect(slackMessageText("이건 *강조* 입니다")).toBe("이건 _강조_ 입니다");
  });

  it("keeps a link's label and drops the brackets", () => {
    expect(slackMessageText("[the notes](https://labs.redrob.ai/notes)")).toBe(
      "<https://labs.redrob.ai/notes|the notes>",
    );
  });

  it("leaves a bare address as an address", () => {
    expect(slackMessageText("[labs.redrob.ai](http://labs.redrob.ai)")).toBe(
      "http://labs.redrob.ai",
    );
  });

  it("does not touch a code fence", () => {
    const fenced = "설명\n```\n- not a bullet\n**not bold**\n```\n끝";
    expect(slackMessageText(fenced)).toBe(fenced);
  });

  it("keeps the line breaks that make it readable", () => {
    const written = "## 근황\n\n- Eval\n- Studio\n\n자세한 건 내일 공유할게요.";
    expect(slackMessageText(written)).toBe(
      "*근황*\n\n• Eval\n• Studio\n\n자세한 건 내일 공유할게요.",
    );
  });

  it("knows when there is nothing to rewrite", () => {
    expect(hasMarkdown("안녕하세요. 오늘 근황 공유드립니다.")).toBe(false);
    expect(hasMarkdown("- 항목")).toBe(true);
    expect(hasMarkdown("**굵게**")).toBe(true);
  });
});
