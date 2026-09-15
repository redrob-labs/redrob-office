import { z } from "zod";
import { artifactRefSchema, evidenceRefSchema } from "../bus/types.js";

/**
 * A StaffMember's final answer is not prose: it is one typed message. Anything
 * else is treated as a BLOCK, which is why there is no free-text path between
 * desks even when the model rambles.
 */
const outputSchema = z.discriminatedUnion("type", [
  /**
   * Answer the person, rather than turning what they said into work.
   *
   * Without this exit the only way out of an intake turn was a REQUEST to a
   * seat, so a question - "오늘 날씨 뭐냐" - had to become a project with steps
   * and an owner, and a manager that could see it was not a project could only
   * refuse. `text` goes to the channel as it is written, so it has to be in the
   * language the person used.
   */
  z.object({
    type: z.literal("ANSWER"),
    text: z.string().min(1),
  }),
  z.object({
    type: z.literal("REQUEST"),
    to: z.string().min(1),
    needs: z.array(artifactRefSchema).min(1),
    dueByMinutes: z.number().int().positive().max(24 * 60),
    instruction: z.string().min(1),
  }),
  z.object({
    type: z.literal("DELIVER"),
    to: z.string().min(1),
    artifactRef: artifactRefSchema,
    claim: z.string().min(1),
  }),
  z.object({
    type: z.literal("CHALLENGE"),
    to: z.string().min(1),
    targetClaim: z.string().min(1),
    evidenceRef: z.array(evidenceRefSchema).min(1),
    alternative: z.string().min(1),
  }),
  z.object({
    type: z.literal("ESCALATE"),
    reason: z.string().min(1),
    options: z.array(z.string().min(1)).min(2),
    evidenceRef: z.array(evidenceRefSchema).default([]),
  }),
  z.object({
    type: z.literal("BLOCK"),
    reason: z.string().min(1),
    unblockCondition: z.string().min(1),
  }),
]);

export type StaffOutput = z.infer<typeof outputSchema>;

/**
 * Everything except an ANSWER, which is the one output with no next desk: it is
 * addressed to a person, so there is nothing for the bus to route.
 */
export type BusStaffOutput = Exclude<StaffOutput, { type: "ANSWER" }>;

export type StaffOutputParse =
  | { ok: true; output: StaffOutput }
  | { ok: false; reason: string };

const FENCE = /```(?:json)?\s*([\s\S]*?)```/g;

function candidates(text: string): string[] {
  const found: string[] = [];
  for (const match of text.matchAll(FENCE)) {
    if (match[1]) found.push(match[1].trim());
  }
  const firstBrace = text.indexOf("{");
  const lastBrace = text.lastIndexOf("}");
  if (firstBrace >= 0 && lastBrace > firstBrace) {
    found.push(text.slice(firstBrace, lastBrace + 1));
  }
  return found;
}

/** A short stable id from free text, for a `needs` entry the model only named. */
function slug(text: string): string {
  const cleaned = text
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, "-")
    .replace(/^-+|-+$/g, "");
  return (cleaned || "task").slice(0, 60);
}

function taskRef(label: string): { kind: "task"; id: string; label: string } {
  return { kind: "task", id: slug(label), label: label.slice(0, 200) };
}

/**
 * Repair the shapes a small model reliably gets wrong before validating.
 *
 * `needs` is the worst offender. It is bookkeeping - a label for the handoff
 * the channel reads back as "{role} was given: {task}" - but the contract used
 * to demand an array of typed refs, so a 4B model writing the obvious
 * `"needs":["오늘 날씨"]` had its whole turn thrown away, and the reader was
 * shown `needs.0: Invalid input: expected object, received string`. A string is
 * an unambiguous label, an absent list can be named from the instruction, and
 * neither is worth losing a plan over. Anything genuinely ambiguous is left
 * alone for the schema to refuse.
 */
function coerce(json: unknown): unknown {
  if (!json || typeof json !== "object" || Array.isArray(json)) return json;
  const value = { ...(json as Record<string, unknown>) };
  if (value["type"] !== "REQUEST") return value;

  const needs = value["needs"];
  const named: string[] =
    typeof needs === "string"
      ? [needs]
      : Array.isArray(needs)
        ? needs.filter((item): item is string => typeof item === "string")
        : [];

  if (named.length > 0 && Array.isArray(needs)) {
    // Mixed arrays keep the objects they already had and lift the bare strings.
    value["needs"] = needs.map((item) =>
      typeof item === "string" ? taskRef(item) : item,
    );
    return value;
  }
  if (named.length > 0) {
    value["needs"] = named.map(taskRef);
    return value;
  }
  const empty = needs === undefined || (Array.isArray(needs) && needs.length === 0);
  if (empty && typeof value["instruction"] === "string" && value["instruction"]) {
    value["needs"] = [taskRef(value["instruction"] as string)];
  }
  return value;
}

export function parseStaffOutput(text: string): StaffOutputParse {
  const tried = candidates(text);
  if (tried.length === 0) {
    return { ok: false, reason: "No typed message found in the final answer" };
  }
  let lastError = "unparseable";
  for (const candidate of tried) {
    let json: unknown;
    try {
      json = JSON.parse(candidate);
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
      continue;
    }
    const parsed = outputSchema.safeParse(coerce(json));
    if (parsed.success) return { ok: true, output: parsed.data };
    lastError = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "(root)"}: ${issue.message}`)
      .join("; ");
  }
  return { ok: false, reason: lastError };
}

/** Appended to every Task prompt so the contract is stated, not assumed. */
export const OUTPUT_CONTRACT_PROMPT = [
  "Your final answer must be exactly one fenced json block and nothing else.",
  'It must be one of: {"type":"ANSWER","text":"..."}',
  ' | {"type":"REQUEST","to":...,"needs":[{"kind":"task","id":"short-slug","label":"what is needed"}],"dueByMinutes":N,"instruction":"..."}',
  ' | {"type":"DELIVER","to":...,"artifactRef":{...},"claim":"..."}',
  ' | {"type":"CHALLENGE","to":...,"targetClaim":"...","evidenceRef":[{...}],"alternative":"..."}',
  ' | {"type":"ESCALATE","reason":"...","options":["...","..."]}',
  ' | {"type":"BLOCK","reason":"...","unblockCondition":"..."}',
  "A CHALLENGE without at least one evidenceRef is refused by the bus.",
  "An ESCALATE needs at least two options.",
  "ANSWER when what was said is a question or a request for information you can settle yourself, including with your tools. Write it in the language the person used. It goes straight to them, so write it to them and not about them.",
  "Only REQUEST when something has to be produced, checked or sent. A question is not a project.",
].join("\n");

/** Asks for the typed message again, with nothing else left to do. */
export const OUTPUT_RETAKE_PROMPT = [
  "Stop and put your answer in the contract now.",
  "Reply with the json object only: no prose around it, no fences, no tool calls.",
].join("\n");
