/**
 * The staff output contract as a grammar, so a seat cannot produce an answer the
 * floor is unable to read.
 *
 * Stating the shape in the prompt asks a model to remember it. A 4B manager told
 * to send `"needs":[...]` writes down what it needs - `["오늘 날씨"]` - and the
 * whole turn is thrown away over a shape it was only described in prose. Held at
 * the sampler, that answer is not a mistake the model can make.
 *
 * One rule per line, and no rule wrapped across lines. This is not house style:
 * llama.cpp ends a rule at the first newline outside brackets, so a rule laid
 * out over several lines parses as far as the line break and the next line is
 * then read as a new rule name. Written that way, the whole grammar was rejected
 * with `failed to parse grammar` and every seat's retake turn died with it.
 *
 * The dialect is the one the field-fill grammars use, down to details like `\-`
 * being illegal inside a character class. Key order is fixed because fixing it
 * costs nothing and removes a branch from the sampler.
 *
 * `sha256` and `artifactId` are left out of `ref` on purpose. A model cannot know
 * a content hash, and the Floor fills the library id in after filing, so putting
 * either within reach only invites an invented one.
 */

const OBJECT_RULES = [
  String.raw`answer ::= "{" ws "\"type\"" ws ":" ws "\"ANSWER\"" ws "," ws "\"text\"" ws ":" ws string ws "}"`,
  String.raw`request ::= "{" ws "\"type\"" ws ":" ws "\"REQUEST\"" ws "," ws "\"to\"" ws ":" ws string ws "," ws "\"needs\"" ws ":" ws refs ws "," ws "\"dueByMinutes\"" ws ":" ws minutes ws "," ws "\"instruction\"" ws ":" ws string ws "}"`,
  String.raw`deliver ::= "{" ws "\"type\"" ws ":" ws "\"DELIVER\"" ws "," ws "\"to\"" ws ":" ws string ws "," ws "\"artifactRef\"" ws ":" ws ref ws "," ws "\"claim\"" ws ":" ws string ws "}"`,
  String.raw`challenge ::= "{" ws "\"type\"" ws ":" ws "\"CHALLENGE\"" ws "," ws "\"to\"" ws ":" ws string ws "," ws "\"targetClaim\"" ws ":" ws string ws "," ws "\"evidenceRef\"" ws ":" ws refs ws "," ws "\"alternative\"" ws ":" ws string ws "}"`,
  String.raw`escalate ::= "{" ws "\"type\"" ws ":" ws "\"ESCALATE\"" ws "," ws "\"reason\"" ws ":" ws string ws "," ws "\"options\"" ws ":" ws options ws "}"`,
  String.raw`block ::= "{" ws "\"type\"" ws ":" ws "\"BLOCK\"" ws "," ws "\"reason\"" ws ":" ws string ws "," ws "\"unblockCondition\"" ws ":" ws string ws "}"`,
];

const SHARED_RULES = [
  String.raw`refs ::= "[" ws ref (ws "," ws ref)* ws "]"`,
  String.raw`ref ::= "{" ws "\"kind\"" ws ":" ws kind ws "," ws "\"id\"" ws ":" ws string (ws "," ws "\"label\"" ws ":" ws string)? ws "}"`,
  String.raw`kind ::= "\"artifact\"" | "\"file\"" | "\"log\"" | "\"url\"" | "\"task\"" | "\"message\""`,
  String.raw`options ::= "[" ws string (ws "," ws string)+ ws "]"`,
  String.raw`minutes ::= [1-9] [0-9]*`,
  String.raw`string ::= "\"" char+ "\""`,
  // Control characters are out, the same way llama.cpp's own JSON-schema output
  // keeps them out: a raw newline inside a string is not JSON, so allowing one
  // hands the Floor a message that only fails later, at the parse.
  String.raw`char ::= [^"\\\x00-\x1F] | [\\] (["\\/bfnrt] | "u" hex hex hex hex)`,
  String.raw`hex ::= [0-9a-fA-F]`,
  String.raw`ws ::= [ \t\n\r]*`,
];

export const STAFF_OUTPUT_GBNF = [
  "root ::= ws message ws",
  "message ::= answer | request | deliver | challenge | escalate | block",
  ...OBJECT_RULES,
  ...SHARED_RULES,
].join("\n");
