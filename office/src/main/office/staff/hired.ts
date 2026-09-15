import { randomUUID } from "node:crypto";
import type { TimeSource } from "../time/index.js";
import { asNumber, asText, type FloorDb } from "../queue/sqlite.js";
import type { StaffLayer, StaffSpec } from "./types.js";

export const ROLE_MAX = 40;
export const PERSONALITY_MAX = 1_000;

/**
 * What a hired seat is for. The layer is not decoration: gates run on
 * deliveries into `review`, a BLOCK routes to `lead`, and `production` stops
 * first when the approval tray overflows. A person picks the job; the office
 * derives the tools and the budget from it, because a tool picker is a
 * permission surface nobody should have to reason about to hire a colleague.
 */
export const HIREABLE_LAYERS = ["research", "editorial", "review", "production"] as const;

export type HireableLayer = (typeof HIREABLE_LAYERS)[number];

export function isHireableLayer(value: string): value is HireableLayer {
  return (HIREABLE_LAYERS as readonly string[]).includes(value);
}

// Looking something up is as ordinary as reading a file, so every hired seat
// gets it too. A colleague who cannot find out today's date is not much use.
const READ_TOOLS = ["fs.read", "fs.list", "web.search", "web.fetch"];
const DOC_READ_TOOLS = ["doc.open", "doc.outline", "doc.readRange", "doc.search", "doc.close"];
const DOC_WRITE_TOOLS = ["doc.insertSection", "doc.applyStyle", "doc.findReplace"];
// A hired writer asked for a spreadsheet has to be able to start one, the same
// way the built-in Writer can. Without these it can only ever write text.
const MAKE_TOOLS = [
  "doc.create",
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

const LAYER_TOOLS: Record<HireableLayer, string[]> = {
  research: [...READ_TOOLS, "net.httpPost"],
  editorial: [
    ...READ_TOOLS,
    "fs.write",
    ...DOC_READ_TOOLS,
    ...DOC_WRITE_TOOLS,
    ...MAKE_TOOLS,
  ],
  review: [...READ_TOOLS, "shell.exec", ...DOC_READ_TOOLS],
  production: [...READ_TOOLS, "net.httpPost"],
};

const LAYER_BUDGET: Record<HireableLayer, StaffSpec["budget"]> = {
  research: { perTaskTokens: 8_000, perDayTokens: 80_000 },
  editorial: { perTaskTokens: 12_000, perDayTokens: 90_000 },
  review: { perTaskTokens: 10_000, perDayTokens: 80_000 },
  production: { perTaskTokens: 6_000, perDayTokens: 40_000 },
};

const LAYER_ITERATIONS: Record<HireableLayer, number> = {
  research: 8,
  editorial: 8,
  review: 8,
  production: 6,
};

export interface HiredStaff {
  id: string;
  role: string;
  layer: HireableLayer;
  /** The instructions this seat works to, in the person's own words. */
  personality: string;
  createdAt: number;
  updatedAt: number;
}

function rowToHired(row: Record<string, unknown>): HiredStaff {
  const layer = asText(row["layer"], "research");
  return {
    id: asText(row["id"]),
    role: asText(row["role"]),
    layer: isHireableLayer(layer) ? layer : "research",
    personality: asText(row["personality"]),
    createdAt: asNumber(row["created_at"]),
    updatedAt: asNumber(row["updated_at"]),
  };
}

/**
 * A hired seat is a role, a job and instructions. Everything else a StaffSpec
 * needs is derived, so a person never has to know what a tool group is to add
 * a colleague to the office.
 */
export function specFromHired(hired: HiredStaff, peers: readonly string[]): StaffSpec {
  return {
    id: hired.id,
    role: hired.role,
    layer: hired.layer as StaffLayer,
    host: "local",
    tools: LAYER_TOOLS[hired.layer],
    scope: hired.personality,
    budget: LAYER_BUDGET[hired.layer],
    peers: peers.filter((peer) => peer !== hired.id),
    maxIterations: LAYER_ITERATIONS[hired.layer],
    custom: true,
  };
}

/** `Legal Counsel` → `legal-counsel`, unique against the ids already taken. */
export function staffIdFromRole(role: string, taken: ReadonlySet<string>): string {
  const base =
    role
      .trim()
      .toLowerCase()
      .replace(/[\s.]+/g, "-")
      .replace(/[^a-z0-9\-_가-힣]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 32) || "staff";
  if (!taken.has(base)) return base;
  for (let n = 2; n < 1_000; n += 1) {
    const candidate = `${base}-${n}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${randomUUID().slice(0, 8)}`;
}

export class HiredStaffStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  list(): HiredStaff[] {
    const rows = this.#db
      .prepare("SELECT * FROM staff ORDER BY created_at ASC")
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToHired);
  }

  get(id: string): HiredStaff | null {
    const row = this.#db.prepare("SELECT * FROM staff WHERE id = ?").get(id) as
      | Record<string, unknown>
      | undefined;
    return row ? rowToHired(row) : null;
  }

  hire(input: { id: string; role: string; layer: HireableLayer; personality: string }): HiredStaff {
    const now = this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO staff (id, role, layer, personality, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?)`,
      )
      .run(
        input.id,
        input.role.slice(0, ROLE_MAX),
        input.layer,
        input.personality.slice(0, PERSONALITY_MAX),
        now,
        now,
      );
    const hired = this.get(input.id);
    if (!hired) throw new Error(`Staff ${input.id} could not be hired`);
    return hired;
  }

  update(
    id: string,
    patch: { role?: string; layer?: HireableLayer; personality?: string },
  ): HiredStaff | null {
    const current = this.get(id);
    if (!current) return null;
    this.#db
      .prepare("UPDATE staff SET role = ?, layer = ?, personality = ?, updated_at = ? WHERE id = ?")
      .run(
        (patch.role ?? current.role).slice(0, ROLE_MAX),
        patch.layer ?? current.layer,
        (patch.personality ?? current.personality).slice(0, PERSONALITY_MAX),
        this.#clock.now(),
        id,
      );
    return this.get(id);
  }

  dismiss(id: string): boolean {
    const result = this.#db.prepare("DELETE FROM staff WHERE id = ?").run(id);
    return asNumber(result.changes) > 0;
  }
}
