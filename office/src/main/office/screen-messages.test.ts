import { describe, expect, it } from "vitest";
import type { CloudChatMessage } from "@redrob/kernel";
import {
  isScreenMessage,
  pngDataUrl,
  screenMessage,
  withoutOlderScreens,
} from "./screen-messages";

const said = (text: string): CloudChatMessage => ({ role: "user", content: text });

describe("screenMessage", () => {
  it("carries the note and the image the model has to look at", () => {
    const message = screenMessage("data:image/png;base64,AAA", "the desktop");
    expect(message.role).toBe("user");
    expect(Array.isArray(message.content)).toBe(true);
    const parts = message.content as Array<{ type: string; text?: string }>;
    expect(parts[0]?.type).toBe("text");
    expect(parts[1]?.text).toBe("Image 1");
    expect(parts[2]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,AAA" },
    });
  });

  it("can carry every monitor in one look", () => {
    const message = screenMessage(
      ["data:image/png;base64,AAA", "data:image/png;base64,BBB"],
      "both displays",
      ["Image 1 = displayId 1", "Image 2 = displayId 2"],
    );
    const parts = message.content as Array<{ type: string; text?: string }>;
    expect(parts).toHaveLength(5);
    expect(parts[1]?.text).toBe("Image 1 = displayId 1");
    expect(parts[3]?.text).toBe("Image 2 = displayId 2");
    expect(parts[4]).toEqual({
      type: "image_url",
      image_url: { url: "data:image/png;base64,BBB" },
    });
  });

  it("is recognisable afterwards, which is how the old ones get found", () => {
    expect(isScreenMessage(screenMessage("data:image/png;base64,AAA", "x"))).toBe(true);
  });
});

describe("isScreenMessage", () => {
  it("does not claim ordinary messages", () => {
    expect(isScreenMessage(said("hello"))).toBe(false);
    expect(isScreenMessage({ role: "assistant", content: "hi" })).toBe(false);
    expect(isScreenMessage({ role: "tool", toolCallId: "1", name: "fs.read", content: "{}" })).toBe(
      false,
    );
  });

  it("does not claim a picture somebody else attached", () => {
    const theirs: CloudChatMessage = {
      role: "user",
      content: [
        { type: "text", text: "what is this?" },
        { type: "image_url", image_url: { url: "data:image/png;base64,BBB" } },
      ],
    };
    expect(isScreenMessage(theirs)).toBe(false);
  });
});

describe("withoutOlderScreens", () => {
  it("drops the screenshots and keeps everything else in order", () => {
    const before: CloudChatMessage[] = [
      { role: "system", content: "rules" },
      said("open the browser"),
      screenMessage("data:image/png;base64,AAA", "one"),
      { role: "assistant", content: "looking" },
      screenMessage("data:image/png;base64,BBB", "two"),
    ];
    const after = withoutOlderScreens(before);
    expect(after).toHaveLength(3);
    expect(after.map((m) => m.role)).toEqual(["system", "user", "assistant"]);
  });

  it("leaves a conversation with no screenshots untouched", () => {
    const before: CloudChatMessage[] = [said("hello")];
    expect(withoutOlderScreens(before)).toEqual(before);
  });

  it("does not modify the array it was given", () => {
    const before: CloudChatMessage[] = [screenMessage("data:image/png;base64,AAA", "one")];
    withoutOlderScreens(before);
    expect(before).toHaveLength(1);
  });
});

describe("pngDataUrl", () => {
  it("writes the form these APIs accept an image in", () => {
    expect(pngDataUrl(Buffer.from([0x89, 0x50]))).toBe("data:image/png;base64,iVA=");
  });
});
