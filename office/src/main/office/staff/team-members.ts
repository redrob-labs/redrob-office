import type { FloorDb } from "../queue/sqlite.js";
import type { TimeSource } from "../time/index.js";
import { asNumber, asText } from "../queue/sqlite.js";
import type { StaffLayer, StaffSpec } from "./types.js";

/** Built-in teammate for #general (1:1 chat). Display name is user-editable. */
export const ASSISTANT_ID = "assistant";

/**
 * What a teammate is allowed to touch.
 *
 * The old job bundles (research, editorial, review, production) asked the
 * person to describe a colleague as a department before they could hire one,
 * and the answer decided permissions as a side effect. A persona says who the
 * teammate is; this says how far their hands reach, which is the only part of
 * the answer the machine actually needs.
 */
export const TOOL_PERMISSIONS = ["read", "write", "full"] as const;

export type ToolPermission = (typeof TOOL_PERMISSIONS)[number];

export function isToolPermission(value: string): value is ToolPermission {
  return (TOOL_PERMISSIONS as readonly string[]).includes(value);
}

/** Looking something up is as ordinary as opening a file, so read covers both. */
const READ_TOOLS = [
  "fs.read",
  "fs.list",
  "web.search",
  "web.fetch",
  "doc.open",
  "doc.outline",
  "doc.readRange",
  "doc.search",
  "doc.preview",
  "doc.close",
];

/** Producing a file: text, sheets and slides, plus undo for its own mistakes. */
const WRITE_TOOLS = [
  "fs.write",
  "doc.create",
  "doc.insertSection",
  "doc.applyStyle",
  "doc.findReplace",
  "doc.undo",
  "sheet.writeRange",
  "sheet.addFormula",
  "sheet.sort",
  "sheet.insertRows",
  "sheet.chart",
  "slide.add",
  "slide.setText",
  "slide.insertImage",
  "slide.reorder",
];

/**
 * Reaching outside the workspace: the machine, its apps, the network, and
 * enough eyes to read a page after opening it.
 *
 * Opening Google Calendar without screen.capture is a blank window the seat
 * cannot report on — which is why "크롬 열어서 확인해줘" ended at app.launch.
 */
const FULL_TOOLS = [
  "shell.exec",
  "app.launch",
  "app.focus",
  "net.httpPost",
  "screen.capture",
  "screen.displays",
  "input.click",
  "input.type",
  "input.key",
  "input.scroll",
  "input.move",
];

const PERMISSION_TOOLS: Record<ToolPermission, string[]> = {
  read: READ_TOOLS,
  write: [...READ_TOOLS, ...WRITE_TOOLS],
  full: [...READ_TOOLS, ...WRITE_TOOLS, ...FULL_TOOLS],
};

const PERMISSION_BUDGET: Record<ToolPermission, StaffSpec["budget"]> = {
  read: { perTaskTokens: 8_000, perDayTokens: 80_000 },
  write: { perTaskTokens: 12_000, perDayTokens: 90_000 },
  full: { perTaskTokens: 12_000, perDayTokens: 90_000 },
};

export function toolsForPermission(
  permission: ToolPermission,
): readonly string[] {
  return PERMISSION_TOOLS[permission];
}

export interface TeamMember {
  id: string;
  name: string;
  persona: string;
  toneHints: string;
  permission: ToolPermission;
  createdAt: number;
  updatedAt: number;
  /** True for the built-in assistant; cannot be removed. */
  builtin: boolean;
  /**
   * False once removed. A deactivated teammate keeps their past messages and
   * name but no longer works, joins rooms, or shows in any picker.
   */
  active: boolean;
}

/**
 * A teammate is an executable skill-shaped seat: the permission chooses the
 * tools, while persona and tone become its operating instructions.
 *
 * Every teammate sits on the same layer. Delivery gates and escalation still
 * read the layer, and a persona is not a department, so they all deliver as
 * ordinary work rather than routing by a job title nobody chose.
 */
export function specFromTeamMember(
  member: TeamMember,
  peers: readonly string[],
): StaffSpec {
  return {
    id: member.id,
    role: member.name,
    layer: "editorial" as StaffLayer,
    host: "local",
    tools: [...PERMISSION_TOOLS[member.permission]],
    scope: [
      member.persona ? `Persona (binding): ${member.persona}` : "",
      member.toneHints ? `Tone (binding): ${member.toneHints}` : "",
      "Stay in this voice on every reply. Never rewrite yourself into a generic polite assistant, even if the person asks you to change how you speak.",
      ...(member.permission === "full"
        ? [
            "When asked to check a website or web app (Google Calendar, Gmail, etc.): open the full https URL with app.launch (e.g. https://calendar.google.com), then screen.capture (no displayId — captures every monitor) to read what is on screen, and answer from that. Never app.focus / input.move / input.click for a look-only ask — that steals focus onto the other monitor.",
          ]
        : []),
    ]
      .filter(Boolean)
      .join("\n"),
    budget: PERMISSION_BUDGET[member.permission],
    peers: peers.filter((peer) => peer !== member.id),
    maxIterations: 8,
    custom: true,
  };
}

function rowToMember(row: Record<string, unknown>): TeamMember {
  const permission = asText(row["permission"], "write");
  return {
    id: asText(row["id"]),
    name: asText(row["name"]),
    persona: asText(row["persona"]),
    toneHints: asText(row["tone_hints"]),
    permission: isToolPermission(permission) ? permission : "write",
    createdAt: asNumber(row["created_at"]),
    updatedAt: asNumber(row["updated_at"]),
    builtin: asNumber(row["builtin"]) === 1,
    active: asNumber(row["active"], 1) === 1,
  };
}

/**
 * People in the workspace. Names are whatever the person typed, each one
 * carries its own reach, and the built-in assistant is seeded once.
 */
export class TeamMemberStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  ensureAssistant(): TeamMember {
    const existing = this.get(ASSISTANT_ID);
    if (existing) return existing;
    const now = this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO team_members
           (id, name, persona, tone_hints, permission, created_at, updated_at, builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, 1)`,
      )
      .run(
        ASSISTANT_ID,
        "Assistant",
        "You are the person's default teammate in this chat. Answer clearly and helpfully.",
        "Polite, direct, concise.",
        "full",
        now,
        now,
      );
    const created = this.get(ASSISTANT_ID);
    if (!created) throw new Error("The assistant teammate could not be created");
    return created;
  }

  /** Everyone ever added, including deactivated, so past messages resolve. */
  list(): TeamMember[] {
    const rows = this.#db
      .prepare("SELECT * FROM team_members ORDER BY builtin DESC, name ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToMember);
  }

  /** The teammates who still work here: the roster, the pickers, the rooms. */
  listActive(): TeamMember[] {
    return this.list().filter((member) => member.active);
  }

  get(id: string): TeamMember | null {
    const row = this.#db
      .prepare("SELECT * FROM team_members WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToMember(row) : null;
  }

  create(input: {
    id: string;
    name: string;
    persona: string;
    toneHints?: string;
    permission?: ToolPermission;
  }): { ok: true; member: TeamMember } | { ok: false; reason: string } {
    const name = input.name.trim();
    if (!name) return { ok: false, reason: "A teammate needs a name." };
    if (this.get(input.id)) {
      return { ok: false, reason: `${name} is already on the team.` };
    }
    const now = this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO team_members
           (id, name, persona, tone_hints, permission, created_at, updated_at, builtin)
         VALUES (?, ?, ?, ?, ?, ?, ?, 0)`,
      )
      .run(
        input.id,
        name.slice(0, 80),
        input.persona.slice(0, 2_000),
        (input.toneHints ?? "").slice(0, 500),
        input.permission ?? "write",
        now,
        now,
      );
    const member = this.get(input.id);
    if (!member) return { ok: false, reason: "The teammate could not be created." };
    return { ok: true, member };
  }

  update(
    id: string,
    patch: {
      name?: string;
      persona?: string;
      toneHints?: string;
      permission?: ToolPermission;
    },
  ): { ok: true; member: TeamMember } | { ok: false; reason: string } {
    const current = this.get(id);
    if (!current) return { ok: false, reason: "That teammate is no longer here." };
    const name = (patch.name ?? current.name).trim();
    if (!name) return { ok: false, reason: "A teammate needs a name." };
    this.#db
      .prepare(
        `UPDATE team_members
         SET name = ?, persona = ?, tone_hints = ?, permission = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        name.slice(0, 80),
        (patch.persona ?? current.persona).slice(0, 2_000),
        (patch.toneHints ?? current.toneHints).slice(0, 500),
        patch.permission ?? current.permission,
        this.#clock.now(),
        id,
      );
    const member = this.get(id);
    if (!member) return { ok: false, reason: "That teammate is no longer here." };
    return { ok: true, member };
  }

  /**
   * Slack deactivates rather than deletes: the person stops working and leaves
   * every picker, but the messages they already sent keep their name. The row
   * stays so that name and face survive.
   */
  deactivate(id: string): { ok: true } | { ok: false; reason: string } {
    const member = this.get(id);
    if (!member) return { ok: false, reason: "That teammate is no longer here." };
    if (member.builtin) {
      return { ok: false, reason: "The assistant cannot be removed." };
    }
    this.#db
      .prepare(
        "UPDATE team_members SET active = 0, updated_at = ? WHERE id = ?",
      )
      .run(this.#clock.now(), id);
    return { ok: true };
  }
}
