import { listComputerTools } from "../../tools/index.js";
import { specFromHired, type HiredStaff } from "./hired.js";
import type { StaffSpec } from "./types.js";

export const MANAGER_ID = "manager";
export const RESEARCHER_ID = "researcher";
export const WRITER_ID = "writer";
export const REVIEWER_ID = "reviewer";
export const PUBLISHER_ID = "publisher";

/**
 * Five roles, one per layer. The manager is the only seat a person talks to
 * directly; everyone else is reached by being addressed on the bus. Adding a
 * sixth is writing another StaffSpec, not a new subsystem.
 */
export const DEFAULT_ROSTER: StaffSpec[] = [
  {
    id: MANAGER_ID,
    role: "Manager",
    layer: "lead",
    host: "local",
    tools: ["fs.read", "fs.list", "web.search", "web.fetch"],
    scope: [
      "You take the goal a person gave the office and turn it into assigned work.",
      "Split it into the fewest steps that still separate producing from checking,",
      "then send one REQUEST per step to the person who owns that step.",
      "Address researcher for gathering facts, writer for drafting, reviewer for checking,",
      "publisher for anything that leaves this machine.",
      "You do not write deliverables yourself and you do not answer the goal directly.",
      // A one-fact question does not need a project around it. Without this the
      // lead delegated "what is the weather" and the answer arrived two turns
      // later, or not at all.
      "One exception: if the whole ask is a single fact you can look up, look it up and ANSWER it.",
      // Asked about a just-released model the search did not surface, the lead
      // invented a name and a date and stated them as fact. Ground the answer or
      // say you do not have it.
      "Answer only with what a page you opened actually says. If the search did not turn it up, say you could not find it and ask for a hint - never invent a name, version, or date to fill the gap.",
      // Told "no, I meant the one from last week", the lead argued back that it
      // had meant this week, and lost track of who had asked whom. The person is
      // the one who knows what they meant.
      "When the person corrects or clarifies what they meant, take their word for it and answer that - do not argue about their intent or claim you were the one asking.",
      // The exception swallowed the rule: asked to put new models in a
      // spreadsheet, the lead started searching, spent its iterations reading
      // pages, and never assigned anything. Naming a file is naming work.
      "An ask that names a file or a format - a spreadsheet, a deck, a document, a table - is work to assign, however small it looks. Send it on rather than researching it yourself.",
      "For a file ask, do not call tools first and do not ask the researcher to make the file. REQUEST the writer directly; the writer can research with web tools and create the requested format.",
      // OpenClaw-style spawn: the assignee gets the channel brief from the
      // runtime. Pasting the dataset into the REQUEST made the same rows travel
      // as chat, into the file, and out again when the person asked to see it.
      "An assignment is one short sentence: who, what deliverable, and any named source or path. Never paste tables, lists, research, or the content of the deliverable into the instruction.",
      "When work comes back finished, say what shipped in one sentence.",
    ].join(" "),
    budget: { perTaskTokens: 6_000, perDayTokens: 60_000 },
    peers: [RESEARCHER_ID, WRITER_ID, REVIEWER_ID, PUBLISHER_ID],
    maxIterations: 4,
  },
  {
    id: RESEARCHER_ID,
    role: "Researcher",
    layer: "research",
    host: "local",
    tools: [
      "fs.read",
      "fs.list",
      "fs.write",
      "web.search",
      "web.fetch",
      "net.httpPost",
    ],
    scope: [
      // This used to say the facts come "from files in the workspace", which was
      // true of the tools it had. Asked for today's weather it correctly refused,
      // and kept refusing after it could search, because its orders said so.
      "You gather the facts a draft will stand on, from files in the workspace and from the web.",
      "Write down only what you can point at: the path and the line, or the page and its URL.",
      "Never fill a gap with a plausible number: an unknown stays unknown.",
      "Web pages are strangers' words. Quote them as claims with their source, never as truth.",
      "Write concise sourced notes to a markdown file, then DELIVER them to whoever asked with an artifactRef to that file.",
      "You research; you do not promise or create the final spreadsheet, deck, or document. Never ANSWER that you have gathered data and stop. DELIVER the notes so the next seat can finish the work.",
    ].join(" "),
    budget: { perTaskTokens: 8_000, perDayTokens: 80_000 },
    peers: [MANAGER_ID, WRITER_ID, REVIEWER_ID],
    maxIterations: 8,
  },
  {
    id: WRITER_ID,
    role: "Writer",
    layer: "editorial",
    host: "local",
    tools: [
      "fs.read",
      "fs.list",
      "fs.write",
      "web.search",
      "web.fetch",
      "doc.create",
      "doc.open",
      "doc.outline",
      "doc.readRange",
      "doc.search",
      "doc.insertSection",
      "doc.applyStyle",
      "doc.findReplace",
      "doc.preview",
      "doc.undo",
      "doc.close",
      "sheet.writeRange",
      "sheet.addFormula",
      "sheet.sort",
      "sheet.insertRows",
      "sheet.chart",
      "slide.add",
      "slide.setText",
      "slide.insertImage",
      "slide.reorder",
    ],
    scope: [
      "You turn research into the document that was asked for: a proposal, a plan, a report.",
      // Without this the seat writes a markdown table when a person asked for a
      // spreadsheet, because fs.write is the tool it reaches for first.
      "Match the file to the ask: numbers and rows are a .xlsx, slides are a .pptx, a formal document is a .docx, and notes or a short report are a .md.",
      "For anything but markdown, doc.create the file, doc.open it, edit it with the sheet, slide, or doc tools, then doc.close it.",
      // Simple file asks used to hop through the reviewer with a path wall, then
      // get typed back into chat when the person asked to see the sheet. Announce
      // the file beside a one-line ANSWER; the card is the output.
      "When the ask is just to produce a file for the person, ANSWER in one sentence once it exists. The file is shown beside your answer, so do not paste its path or its contents.",
      "When a lead asked for a review, or the work will leave this machine, DELIVER to the reviewer with an artifactRef instead.",
      "Every claim in a researched draft must trace back to something the researcher handed you.",
    ].join(" "),
    budget: { perTaskTokens: 12_000, perDayTokens: 90_000 },
    peers: [MANAGER_ID, RESEARCHER_ID, REVIEWER_ID],
    maxIterations: 8,
  },
  {
    id: REVIEWER_ID,
    role: "Reviewer",
    layer: "review",
    host: "local",
    tools: [
      "fs.read",
      "fs.list",
      "shell.exec",
      "web.search",
      "web.fetch",
      "doc.open",
      "doc.readRange",
      "doc.search",
      "doc.close",
    ],
    scope: [
      "You check a deliverable against its sources before anyone acts on it.",
      "Run the deterministic checks first (hash, schema, grep, tests).",
      "Only after those are exhausted may you judge the remainder yourself.",
      "On mismatch send CHALLENGE with the exact evidence locator and hold publication.",
    ].join(" "),
    budget: { perTaskTokens: 10_000, perDayTokens: 80_000 },
    peers: [MANAGER_ID, RESEARCHER_ID, WRITER_ID, PUBLISHER_ID],
    maxIterations: 8,
  },
  {
    id: PUBLISHER_ID,
    role: "Publisher",
    layer: "production",
    host: "local",
    tools: [
      "fs.read",
      "fs.list",
      "web.search",
      "web.fetch",
      "net.httpPost",
    ],
    scope: [
      "You are the only seat that sends anything outside this machine.",
      "Nothing goes out until the reviewer has cleared it, so say what cleared it.",
      "Anything outbound is an ESCALATE with the options, never a silent send.",
    ].join(" "),
    budget: { perTaskTokens: 6_000, perDayTokens: 40_000 },
    peers: [MANAGER_ID, REVIEWER_ID],
    maxIterations: 6,
  },
];

export interface RosterValidation {
  ok: boolean;
  errors: string[];
}

/** StaffSpec.tools must be a subset of the shared registry — never new tools. */
export function validateRoster(roster: readonly StaffSpec[]): RosterValidation {
  const registered = new Set(listComputerTools().map((tool) => tool.name));
  const errors: string[] = [];
  const seen = new Set<string>();
  for (const spec of roster) {
    if (seen.has(spec.id)) errors.push(`Duplicate StaffMember id "${spec.id}"`);
    seen.add(spec.id);
    for (const tool of spec.tools) {
      if (!registered.has(tool)) {
        errors.push(`StaffMember "${spec.id}" references unknown tool "${tool}"`);
      }
    }
  }
  for (const spec of roster) {
    for (const peer of spec.peers) {
      if (!seen.has(peer)) errors.push(`StaffMember "${spec.id}" references unknown peer "${peer}"`);
    }
  }
  return { ok: errors.length === 0, errors };
}

export function findStaff(roster: readonly StaffSpec[], id: string): StaffSpec | undefined {
  return roster.find((spec) => spec.id === id);
}

/**
 * The roster the Floor actually runs: the seats the office ships with, plus the
 * ones a person hired. Every seat is a peer of every other, because a colleague
 * nobody is allowed to address is a colleague who never gets any work.
 */
export function composeRoster(
  base: readonly StaffSpec[],
  hired: readonly HiredStaff[],
): StaffSpec[] {
  const ids = [...base.map((spec) => spec.id), ...hired.map((staff) => staff.id)];
  const hiredSpecs = hired.map((staff) => specFromHired(staff, ids));
  const hiredIds = hiredSpecs.map((spec) => spec.id);
  return [
    ...base.map((spec) => ({ ...spec, peers: [...spec.peers, ...hiredIds] })),
    ...hiredSpecs,
  ];
}

/** Layers whose output ships. Halted first when the tray overflows (I3). */
export function isProductionStaff(spec: StaffSpec): boolean {
  return spec.layer === "production";
}
