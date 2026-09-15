import { describe, expect, it } from "vitest";
import { capabilitySentence } from "./capability-sentence.js";

describe("capabilitySentence", () => {
  it("names the workflow tools as flows, present and past", () => {
    const search = capabilitySentence("workflow.search", { query: "hiring" });
    expect(search.present).toBe("Searching your flows for “hiring”");
    expect(search.past).toBe("Searched your flows for “hiring”");

    const run = capabilitySentence("workflow.execute", {
      workflow: "Backend hiring",
      mode: "run",
    });
    expect(run.present).toBe("Running your flow “Backend hiring”");
    expect(run.past).toBe("Ran your flow “Backend hiring”");

    const guide = capabilitySentence("workflow.execute", {
      workflow: "Backend hiring",
      mode: "guide",
    });
    expect(guide.present).toContain("Opening your flow");
  });

  it("never leaks a raw tool id when it can help it", () => {
    const sentence = capabilitySentence("doc.create", { name: "Offer" });
    expect(sentence.present).toBe("Creating a document “Offer”");
    expect(sentence.past).toBe("Created a document “Offer”");
  });

  it("truncates long details so a line stays glanceable", () => {
    const long = "x".repeat(200);
    const sentence = capabilitySentence("web.fetch", { url: long });
    expect(sentence.present.length).toBeLessThan(80);
    expect(sentence.present).toContain("…");
  });

  it("derives a verb from an unmapped verb-first name", () => {
    const sentence = capabilitySentence("read.inbox", {});
    expect(sentence.present).toBe("Reading…");
    expect(sentence.past).toBe("Read");
  });

  it("falls back to the label, then the name, for a fully unknown tool", () => {
    expect(capabilitySentence("zzz.plok", {}, "Doing a thing").present).toBe(
      "Doing a thing",
    );
    expect(capabilitySentence("zzz.plok", {}).present).toBe("zzz.plok");
  });
});
