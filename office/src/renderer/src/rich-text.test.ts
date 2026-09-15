import { describe, expect, it } from "vitest";
import { docToMarkdown, isDocEmpty, type RichNode } from "./rich-text";

function doc(...content: RichNode[]): RichNode {
  return { type: "doc", content };
}

function para(...content: RichNode[]): RichNode {
  return { type: "paragraph", content };
}

function text(value: string, ...marks: string[]): RichNode {
  return marks.length > 0
    ? { type: "text", text: value, marks: marks.map((type) => ({ type })) }
    : { type: "text", text: value };
}

describe("docToMarkdown", () => {
  it("turns a /flow chip into a run request carrying the exact id", () => {
    const chip: RichNode = {
      type: "slashFlow",
      attrs: { id: "recruiting/backend-hiring", label: "Backend hiring" },
    };
    expect(docToMarkdown(doc(para(chip)))).toBe(
      "Run my “Backend hiring” flow (flow id: recruiting/backend-hiring).",
    );
  });

  it("writes GFM for the marks the toolbar offers", () => {
    expect(docToMarkdown(doc(para(text("a", "bold"))))).toBe("**a**");
    expect(docToMarkdown(doc(para(text("a", "italic"))))).toBe("_a_");
    expect(docToMarkdown(doc(para(text("a", "strike"))))).toBe("~~a~~");
    expect(docToMarkdown(doc(para(text("a", "code"))))).toBe("`a`");
  });

  it("nests marks in a stable order with code closest to the text", () => {
    expect(docToMarkdown(doc(para(text("a", "bold", "italic"))))).toBe(
      "**_a_**",
    );
    expect(docToMarkdown(doc(para(text("a", "italic", "bold"))))).toBe(
      "**_a_**",
    );
    expect(docToMarkdown(doc(para(text("a", "bold", "code"))))).toBe("**`a`**");
  });

  it("wraps a link around whatever else the run carries", () => {
    const linked: RichNode = {
      type: "text",
      text: "docs",
      marks: [
        { type: "bold" },
        { type: "link", attrs: { href: "https://x.dev" } },
      ],
    };
    expect(docToMarkdown(doc(para(linked)))).toBe("[**docs**](https://x.dev)");
  });

  // Typing "labs.redrob.ai 근황 정리해줘" came back as
  // "[labs.redrob.ai](http://labs.redrob.ai) 근황 정리해줘" — the person's own
  // sentence, wearing markup they never typed.
  it("writes an autolinked address as itself, not as a labelled link", () => {
    const autolinked = (text: string, href: string): RichNode => ({
      type: "text",
      text,
      marks: [{ type: "link", attrs: { href } }],
    });
    expect(
      docToMarkdown(doc(para(autolinked("labs.redrob.ai", "http://labs.redrob.ai")))),
    ).toBe("labs.redrob.ai");
    expect(
      docToMarkdown(doc(para(autolinked("https://redrob.ai/", "https://redrob.ai")))),
    ).toBe("https://redrob.ai/");
    expect(
      docToMarkdown(doc(para(autolinked("a@b.com", "mailto:a@b.com")))),
    ).toBe("a@b.com");
  });

  it("still writes a link that carries a label of its own", () => {
    const labelled: RichNode = {
      type: "text",
      text: "the notes",
      marks: [{ type: "link", attrs: { href: "https://redrob.ai/notes" } }],
    };
    expect(docToMarkdown(doc(para(labelled)))).toBe(
      "[the notes](https://redrob.ai/notes)",
    );
  });

  it("escapes characters that would otherwise become markup", () => {
    expect(docToMarkdown(doc(para(text("2 * 3 _ 4"))))).toBe("2 \\* 3 \\_ 4");
  });

  it("leaves inline code alone, because nothing inside it is markup", () => {
    expect(docToMarkdown(doc(para(text("a_b*c", "code"))))).toBe("`a_b*c`");
  });

  it("holds one mark across runs instead of reopening it at each seam", () => {
    // Reopening per run writes `**a****b**`, and markdown shows the asterisks.
    expect(
      docToMarkdown(doc(para(text("a", "bold"), text("b", "bold", "italic")))),
    ).toBe("**a_b_**");
    expect(docToMarkdown(doc(para(text("a", "bold"), text("b", "bold"))))).toBe(
      "**ab**",
    );
  });

  it("closes emphasis around a line break, which cannot span one", () => {
    expect(
      docToMarkdown(
        doc(para(text("a", "bold"), { type: "hardBreak" }, text("b", "bold"))),
      ),
    ).toBe("**a**\n**b**");
  });

  it("keeps separate links apart while merging one link across runs", () => {
    const link = (
      value: string,
      href: string,
      ...marks: string[]
    ): RichNode => ({
      type: "text",
      text: value,
      marks: [
        ...marks.map((type) => ({ type })),
        { type: "link", attrs: { href } },
      ],
    });
    expect(
      docToMarkdown(doc(para(link("a", "u"), link("b", "u", "bold")))),
    ).toBe("[a**b**](u)");
    expect(docToMarkdown(doc(para(link("a", "u"), link("b", "v"))))).toBe(
      "[a](u)[b](v)",
    );
  });

  it("escapes a marker typed as text, which would otherwise open a block", () => {
    expect(docToMarkdown(doc(para(text("- one"))))).toBe("\\- one");
    expect(docToMarkdown(doc(para(text("+ one"))))).toBe("\\+ one");
    expect(docToMarkdown(doc(para(text("> one"))))).toBe("\\> one");
    expect(docToMarkdown(doc(para(text("# one"))))).toBe("\\# one");
    expect(docToMarkdown(doc(para(text("1. one"))))).toBe("1\\. one");
    expect(docToMarkdown(doc(para(text("2) one"))))).toBe("2\\) one");
  });

  it("leaves a marker alone in the middle of a line", () => {
    expect(docToMarkdown(doc(para(text("one - two"))))).toBe("one - two");
    expect(docToMarkdown(doc(para(text("step 1. go"))))).toBe("step 1. go");
  });

  it("escapes a marker after a line break too, since that starts a line", () => {
    expect(
      docToMarkdown(
        doc(para(text("one"), { type: "hardBreak" }, text("- two"))),
      ),
    ).toBe("one\n\\- two");
  });

  it("keeps a dash typed inside a list item from nesting the list", () => {
    // Typing the marker by hand used to serialise as `- - one`, which reads
    // back as a bullet inside a bullet.
    const items: RichNode[] = [
      { type: "listItem", content: [para(text("one"))] },
      { type: "listItem", content: [para(text("- two"))] },
    ];
    expect(docToMarkdown(doc({ type: "bulletList", content: items }))).toBe(
      "- one\n- \\- two",
    );
  });

  it("separates blocks with a blank line", () => {
    expect(docToMarkdown(doc(para(text("one")), para(text("two"))))).toBe(
      "one\n\ntwo",
    );
  });

  it("keeps a soft break inside one paragraph", () => {
    expect(
      docToMarkdown(doc(para(text("one"), { type: "hardBreak" }, text("two")))),
    ).toBe("one\ntwo");
  });

  it("writes lists, numbering ordered items from one", () => {
    const items = (...labels: string[]): RichNode[] =>
      labels.map((label) => ({
        type: "listItem",
        content: [para(text(label))],
      }));
    expect(
      docToMarkdown(doc({ type: "bulletList", content: items("a", "b") })),
    ).toBe("- a\n- b");
    expect(
      docToMarkdown(doc({ type: "orderedList", content: items("a", "b") })),
    ).toBe("1. a\n2. b");
  });

  it("indents a wrapped list item under its marker", () => {
    const item: RichNode = {
      type: "listItem",
      content: [para(text("one")), para(text("still one"))],
    };
    expect(docToMarkdown(doc({ type: "bulletList", content: [item] }))).toBe(
      "- one\n\n  still one",
    );
  });

  it("prefixes every line of a quote", () => {
    const quote: RichNode = {
      type: "blockquote",
      content: [para(text("one")), para(text("two"))],
    };
    expect(docToMarkdown(doc(quote))).toBe("> one\n> \n> two");
  });

  it("fences a code block verbatim, with its language", () => {
    const code: RichNode = {
      type: "codeBlock",
      attrs: { language: "ts" },
      content: [{ type: "text", text: "const x = *1*" }],
    };
    expect(docToMarkdown(doc(code))).toBe("```ts\nconst x = *1*\n```");
  });

  it("writes headings", () => {
    expect(
      docToMarkdown(
        doc({ type: "heading", attrs: { level: 2 }, content: [text("hi")] }),
      ),
    ).toBe("## hi");
  });
});

describe("isDocEmpty", () => {
  it("treats an untouched document as empty", () => {
    expect(isDocEmpty(doc(para()))).toBe(true);
    expect(isDocEmpty(null)).toBe(true);
    expect(isDocEmpty(doc(para(text(" "))))).toBe(true);
  });

  it("treats anything a reader would see as not empty", () => {
    expect(isDocEmpty(doc(para(text("a"))))).toBe(false);
  });
});
