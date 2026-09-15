import { describe, expect, it } from "vitest";
import {
  backgroundBlockedReason,
  focusStealerBlockedReason,
  isLookOnlyInstruction,
} from "./look-only.js";

describe("look-only", () => {
  it("treats calendar check asks as look-only", () => {
    expect(
      isLookOnlyInstruction(
        "나 구글 캘린던데 그냥 크롬 열어서 캘린다 간다음에 확인해줘",
      ),
    ).toBe(true);
    expect(isLookOnlyInstruction("오늘 일정 확인해줘")).toBe(true);
  });

  it("allows real interaction asks", () => {
    expect(isLookOnlyInstruction("캘린더에서 회의 클릭해서 열어줘")).toBe(
      false,
    );
    expect(isLookOnlyInstruction("제목에 입력해줘")).toBe(false);
  });

  it("blocks focus stealers only on look-only asks", () => {
    expect(
      focusStealerBlockedReason("app.focus", "캘린더 확인해줘"),
    ).toMatch(/blocked/);
    expect(
      focusStealerBlockedReason("input.click", "캘린더 확인해줘"),
    ).toMatch(/blocked/);
    expect(
      focusStealerBlockedReason("screen.capture", "캘린더 확인해줘"),
    ).toBeNull();
    expect(
      focusStealerBlockedReason("app.focus", "버튼 클릭해줘"),
    ).toBeNull();
  });
});

describe("background mode", () => {
  it("blocks focus stealers whatever the ask was", () => {
    for (const tool of ["app.focus", "input.click", "input.type"]) {
      expect(backgroundBlockedReason(tool)).toMatch(/background mode is on/);
    }
  });

  it("leaves the tools that need no foreground alone", () => {
    expect(backgroundBlockedReason("screen.capture")).toBeNull();
    expect(backgroundBlockedReason("browser.click")).toBeNull();
    expect(backgroundBlockedReason("browser.type")).toBeNull();
  });

  it("names the browser tools as the way through", () => {
    const reason = backgroundBlockedReason("input.type") ?? "";
    expect(reason).toContain("browser.type");
    expect(reason).toContain("screen.capture");
  });
});
