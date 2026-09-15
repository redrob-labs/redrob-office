import { describe, expect, it } from "vitest";
import { STAFF_OUTPUT_GBNF } from "./output-grammar.js";
import { parseStaffOutput } from "./output-contract.js";

/** Rule bodies with literals and character classes taken out. */
function bodies(gbnf: string): Map<string, string> {
  const found = new Map<string, string>();
  const parts = gbnf.split(/^([a-z][a-z0-9-]*)\s*::=/gm);
  for (let index = 1; index < parts.length; index += 2) {
    const name = parts[index]!;
    const body = (parts[index + 1] ?? "")
      .replace(/"(?:[^"\\]|\\.)*"/g, " ")
      .replace(/\[(?:[^\]\\]|\\.)*\]/g, " ");
    if (found.has(name)) throw new Error(`rule defined twice: ${name}`);
    found.set(name, body);
  }
  return found;
}

/**
 * A grammar cannot be compiled without llama-server, so what is checked here is
 * the class of mistake that does not need one: a rule that is referenced and
 * never defined, or defined and never reached. Either one only shows up as a
 * staff turn failing in the middle of somebody's work.
 */
describe("staff output grammar", () => {
  const rules = bodies(STAFF_OUTPUT_GBNF);

  it("defines every rule it references", () => {
    for (const [name, body] of rules) {
      for (const reference of body.match(/[a-z][a-z0-9-]*/g) ?? []) {
        expect(rules.has(reference), `${name} references ${reference}`).toBe(
          true,
        );
      }
    }
  });

  it("reaches every rule it defines from the root", () => {
    const reached = new Set<string>(["root"]);
    const pending = ["root"];
    while (pending.length > 0) {
      const body = rules.get(pending.pop()!) ?? "";
      for (const reference of body.match(/[a-z][a-z0-9-]*/g) ?? []) {
        if (reached.has(reference)) continue;
        reached.add(reference);
        pending.push(reference);
      }
    }
    expect([...rules.keys()].filter((name) => !reached.has(name))).toEqual([]);
  });

  // llama.cpp's parse_char takes \\ \" \[ \] \n \r \t \x \u \U and nothing else,
  // so a literal hyphen has to sit at the end of a class rather than be escaped.
  it("uses no escape llama.cpp refuses", () => {
    const classes = STAFF_OUTPUT_GBNF.match(/\[(?:[^\]\\]|\\.)*\]/g) ?? [];
    for (const group of classes) {
      // An escaped backslash goes first, or its second character reads as the
      // start of another escape and every legal `\\` looks like a mistake.
      expect(
        group.replaceAll("\\\\", ""),
        "illegal escape in a character class",
      ).not.toMatch(/\\[^"[\]nrtxuU]/);
    }
  });

  // llama.cpp closes a rule at the first newline outside brackets, so a rule laid
  // out over several lines is read as far as the break and the next line is taken
  // for a rule name. That rejects the whole grammar, and the seat that asked for
  // it gets an HTTP 400 instead of a turn.
  it("keeps every rule on one line", () => {
    for (const line of STAFF_OUTPUT_GBNF.split("\n")) {
      if (line.trim() === "") continue;
      expect(line, "line does not open a rule").toMatch(
        /^[a-z][a-z0-9-]*\s*::=/,
      );
    }
  });

  it("covers every message the contract accepts", () => {
    // Each type the parser can return has to be reachable, or a seat is holding
    // a shape the sampler will not let it produce.
    for (const type of [
      "ANSWER",
      "REQUEST",
      "DELIVER",
      "CHALLENGE",
      "ESCALATE",
      "BLOCK",
    ]) {
      expect(STAFF_OUTPUT_GBNF).toContain(`\\"${type}\\"`);
    }
    expect(
      parseStaffOutput(JSON.stringify({ type: "ANSWER", text: "맑아요." })).ok,
    ).toBe(true);
  });
});
