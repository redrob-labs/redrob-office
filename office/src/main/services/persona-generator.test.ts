import { describe, expect, it } from "vitest";
import { generatePersona } from "./persona-generator.js";

describe("persona-generator", () => {
  it("generates a persona with name, persona description, tone, and permissions for designer", async () => {
    const result = await generatePersona("Figma UI/UX Designer", "en");
    expect(result.name).toBeTruthy();
    expect(result.persona).toBeTruthy();
    expect(result.tone).toBeTruthy();
    expect(result.permission).toBe("write");
  });

  it("generates a persona in Korean when locale is ko", async () => {
    const result = await generatePersona("프론트엔드 React 개발자", "ko");
    expect(result.name).toBeTruthy();
    expect(result.persona).toBeTruthy();
    expect(result.tone).toBeTruthy();
    expect(result.permission).toBe("write");
  });

  it("handles empty or generic prompts gracefully", async () => {
    const result = await generatePersona("", "en");
    expect(result.name).toBeTruthy();
    expect(result.persona).toBeTruthy();
  });
});
