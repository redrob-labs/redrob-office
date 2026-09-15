import { describe, expect, it } from "vitest";
import { extractHttpsUrls } from "./chat-urls";

describe("extractHttpsUrls", () => {
  it("finds https links and strips trailing punctuation", () => {
    expect(
      extractHttpsUrls("See https://example.com/docs. Also https://example.com/docs again."),
    ).toEqual(["https://example.com/docs"]);
  });

  it("ignores http and caps at limit", () => {
    expect(
      extractHttpsUrls(
        "http://insecure.example https://a.com https://b.com https://c.com https://d.com",
        3,
      ),
    ).toEqual(["https://a.com/", "https://b.com/", "https://c.com/"]);
  });
});
