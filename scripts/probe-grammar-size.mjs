/**
 * One-off: quote vs score GBNF sizes for CPU stack-loss investigation.
 */
import { join } from "node:path";
import { pathToFileURL } from "node:url";

const g = await import(
  pathToFileURL(join(process.cwd(), "packages/kernel/dist/field-fill-grammar.js")).href
);

const lines = [
  "skills: TypeScript, NestJS, PostgreSQL",
  "experience: 4 years backend at SaaS",
  "delivered API platform used by 20 teams",
];
const choices = g.quoteSubstringChoices(lines);
const quoteGbnf = g.fieldValueToGbnf({
  path: "/quote",
  type: "string",
  required: true,
  stringChoices: choices,
});
const scoreGbnf = g.fieldValueToGbnf({
  path: "/score",
  type: "integer",
  required: true,
  enumValues: [1, 2, 3, 4, 5],
});

console.log(
  JSON.stringify(
    {
      choicesCount: choices.length,
      longestChoice: Math.max(...choices.map((c) => c.length)),
      quoteGbnfLen: quoteGbnf.length,
      scoreGbnfLen: scoreGbnf.length,
      scoreGbnf,
    },
    null,
    2,
  ),
);
