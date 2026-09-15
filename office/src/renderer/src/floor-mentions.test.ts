import { describe, expect, it } from "vitest";
import { splitAddressee } from "./floor-mentions";

const ROSTER = ["manager", "researcher", "writer", "reviewer", "publisher"];

describe("splitAddressee", () => {
  it("takes a leading name off, because it was addressing and not words", () => {
    expect(splitAddressee("@researcher 이거 좀 찾아봐", ROSTER)).toEqual({
      to: "researcher",
      text: "이거 좀 찾아봐",
    });
  });

  it("keeps a name written inside a sentence, so no hole is left", () => {
    expect(splitAddressee("이건 @writer 한번 봐줘", ROSTER)).toEqual({
      to: "writer",
      text: "이건 @writer 한번 봐줘",
    });
  });

  it("aims at the first name when several are written", () => {
    expect(splitAddressee("@reviewer @writer 같이 봐", ROSTER).to).toBe(
      "reviewer",
    );
  });

  it("leaves a name nobody on the floor answers to as text", () => {
    const said = splitAddressee("@nobody 이거 해줘", ROSTER);
    expect(said.to).toBeUndefined();
    expect(said.text).toBe("@nobody 이거 해줘");
  });

  it("does not read an email address as addressing someone", () => {
    const said = splitAddressee("보낸 사람은 hi@writer.com 이야", ROSTER);
    expect(said.to).toBeUndefined();
  });

  it("matches a name whatever case it was typed in", () => {
    expect(splitAddressee("@Researcher find it", ROSTER).to).toBe("researcher");
  });

  it("leaves a message with no name alone, so the lead still decides", () => {
    expect(splitAddressee("이번 주 계획 잡아줘", ROSTER)).toEqual({
      text: "이번 주 계획 잡아줘",
    });
  });
});
