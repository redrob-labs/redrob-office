import type { TimeSource } from "../time/index.js";
import { asNumber, asText, type FloorDb } from "../queue/sqlite.js";

/**
 * The channel every office starts with, named the way Slack names its own.
 *
 * It cannot be deleted: the Floor always needs somewhere to put a goal, and a
 * channel list that can reach zero is a dead end the user has no way out of.
 */
export const DEFAULT_CHANNEL_ID = "general";
export const DEFAULT_CHANNEL_NAME = "general";

/**
 * A one-to-one chat is a person, not a room.
 *
 * Its transcript still needs somewhere to live, so it is stored as a channel
 * row under this prefix and kept out of the channel list. Nobody names it,
 * nobody invites anybody into it, and it goes when the person goes.
 */
export const DM_CHANNEL_PREFIX = "dm-";

export function isDmChannelId(id: string): boolean {
  return id.startsWith(DM_CHANNEL_PREFIX);
}

export function dmChannelId(memberId: string): string {
  return `${DM_CHANNEL_PREFIX}${memberId}`;
}

/** Slack's limit. Long names are legal but unreadable in a sidebar. */
export const CHANNEL_NAME_MAX = 80;
export const CHANNEL_PURPOSE_MAX = 250;

export interface Channel {
  id: string;
  /** Slack-shaped: lowercase, no spaces, unique. Shown after a `#`. */
  name: string;
  /** One line under the name. What this channel is for. */
  purpose: string;
  createdAt: number;
  updatedAt: number;
  /** The starting channel. Neither renamable nor deletable. */
  system: boolean;
  /** Teammate ids in this chat. */
  memberIds: string[];
  /** Who answers when there is no @mention in a multi-member chat. */
  defaultMemberId: string;
  /**
   * Derived: a one-to-one chat, which is a person rather than a room.
   *
   * It is the `dm-` address that makes it one, not how few people are in it. A
   * new room starts with only Redrob in it and is still a room: counting heads
   * here is what made every fresh channel open looking like a DM with Redrob.
   */
  isDM: boolean;
}

function parseMemberIds(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw || "[]") as unknown;
    if (!Array.isArray(parsed)) return ["assistant"];
    const ids = parsed.filter(
      (item): item is string => typeof item === "string" && item.length > 0,
    );
    return ids.length > 0 ? ids : ["assistant"];
  } catch {
    return ["assistant"];
  }
}

function rowToChannel(row: Record<string, unknown>): Channel {
  const memberIds = parseMemberIds(asText(row["member_ids"]));
  const defaultMemberId =
    asText(row["default_member_id"]) || memberIds[0] || "assistant";
  const id = asText(row["id"]);
  return {
    id,
    name: asText(row["name"]),
    purpose: asText(row["purpose"]),
    createdAt: asNumber(row["created_at"]),
    updatedAt: asNumber(row["updated_at"]),
    system: asNumber(row["system"]) === 1,
    memberIds,
    defaultMemberId,
    isDM: isDmChannelId(id),
  };
}

/**
 * Slack's rules: lowercase letters, digits, hyphens and underscores, up to 80
 * characters, starting with a letter or digit. Hyphens are the separator, not
 * underscores, which is convention rather than validation — Slack accepts both
 * and so do we.
 *
 * Slack normalises rather than refuses ("We will validate the submitted channel
 * name and modify it to meet the above criteria"), and so does this: a person
 * typing `Q3 Hiring Plan!` gets `q3-hiring-plan` instead of an error about
 * punctuation.
 *
 * Hangul is kept, which Slack's documented rule does not mention but its
 * product allows. Refusing it here would mean a Korean-first office cannot name
 * a channel in Korean.
 */
export function normalizeChannelName(input: string): string {
  const slug = input
    .trim()
    .toLowerCase()
    .replace(/[\s._]+/g, "-")
    .replace(/[^a-z0-9\-가-힣]/g, "")
    .replace(/-{2,}/g, "-")
    // A leading separator would make the name unaddressable after the `#`.
    .replace(/^[-]+|[-]+$/g, "");
  return slug.slice(0, CHANNEL_NAME_MAX);
}

export class ChannelStore {
  readonly #db: FloorDb;
  readonly #clock: TimeSource;

  constructor(db: FloorDb, clock: TimeSource) {
    this.#db = db;
    this.#clock = clock;
  }

  /**
   * Guarantees the default channel exists before anything reads the list, and
   * that it is still called `#general`. The name is the address the whole
   * workspace shares, so a row that drifted off it is put back rather than
   * left as a room nobody recognises.
   */
  ensureDefault(purpose: string): Channel {
    const existing = this.get(DEFAULT_CHANNEL_ID);
    if (existing) {
      if (existing.name === DEFAULT_CHANNEL_NAME) return existing;
      this.#db
        .prepare("UPDATE channels SET name = ? WHERE id = ?")
        .run(DEFAULT_CHANNEL_NAME, DEFAULT_CHANNEL_ID);
      return this.get(DEFAULT_CHANNEL_ID) ?? existing;
    }
    const now = this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO channels
           (id, name, purpose, created_at, updated_at, system, member_ids, default_member_id)
         VALUES (?, ?, ?, ?, ?, 1, ?, ?)`,
      )
      .run(
        DEFAULT_CHANNEL_ID,
        DEFAULT_CHANNEL_NAME,
        purpose,
        now,
        now,
        '["assistant"]',
        "assistant",
      );
    const created = this.get(DEFAULT_CHANNEL_ID);
    if (!created) throw new Error("The default channel could not be created");
    return created;
  }

  /** The rooms. One-to-one chats live in the teammate list instead. */
  list(): Channel[] {
    const rows = this.#db
      .prepare(
        `SELECT * FROM channels
         WHERE id NOT LIKE '${DM_CHANNEL_PREFIX}%'
         ORDER BY system DESC, name ASC`,
      )
      .all() as Array<Record<string, unknown>>;
    return rows.map(rowToChannel);
  }

  get(id: string): Channel | null {
    const row = this.#db
      .prepare("SELECT * FROM channels WHERE id = ?")
      .get(id) as Record<string, unknown> | undefined;
    return row ? rowToChannel(row) : null;
  }

  findByName(name: string): Channel | null {
    const row = this.#db
      .prepare("SELECT * FROM channels WHERE name = ?")
      .get(name) as Record<string, unknown> | undefined;
    return row ? rowToChannel(row) : null;
  }

  create(input: {
    id: string;
    name: string;
    purpose: string;
    memberIds?: string[];
    defaultMemberId?: string;
  }): { ok: true; channel: Channel } | { ok: false; reason: string } {
    const name = normalizeChannelName(input.name);
    if (!name) {
      return {
        ok: false,
        reason: "A channel needs a name made of letters, digits or hyphens.",
      };
    }
    // #general is reserved: it is the default room everyone shares and it is
    // seeded once, so nobody may mint a second channel that answers to it.
    if (name === DEFAULT_CHANNEL_NAME && input.id !== DEFAULT_CHANNEL_ID) {
      return { ok: false, reason: `#${DEFAULT_CHANNEL_NAME} is reserved.` };
    }
    if (this.findByName(name)) {
      return { ok: false, reason: `#${name} already exists.` };
    }
    const memberIds =
      input.memberIds && input.memberIds.length > 0
        ? input.memberIds
        : ["assistant"];
    const defaultMemberId =
      input.defaultMemberId && memberIds.includes(input.defaultMemberId)
        ? input.defaultMemberId
        : memberIds[0]!;
    const now = this.#clock.now();
    this.#db
      .prepare(
        `INSERT INTO channels
           (id, name, purpose, created_at, updated_at, system, member_ids, default_member_id)
         VALUES (?, ?, ?, ?, ?, 0, ?, ?)`,
      )
      .run(
        input.id,
        name,
        input.purpose.slice(0, CHANNEL_PURPOSE_MAX),
        now,
        now,
        JSON.stringify(memberIds),
        defaultMemberId,
      );
    const channel = this.get(input.id);
    if (!channel)
      return { ok: false, reason: "The channel could not be created." };
    return { ok: true, channel };
  }

  update(
    id: string,
    patch: {
      name?: string;
      purpose?: string;
      memberIds?: string[];
      defaultMemberId?: string;
    },
  ): { ok: true; channel: Channel } | { ok: false; reason: string } {
    const current = this.get(id);
    if (!current)
      return { ok: false, reason: "That channel no longer exists." };
    // #general is the default group chat everyone is in; its name is fixed so
    // the one room the whole office shares cannot be renamed out from under it.
    const name =
      current.system || patch.name === undefined
        ? current.name
        : normalizeChannelName(patch.name);
    if (!name) {
      return {
        ok: false,
        reason: "A channel needs a name made of letters, digits or hyphens.",
      };
    }
    const clash = this.findByName(name);
    if (clash && clash.id !== id)
      return { ok: false, reason: `#${name} already exists.` };
    const purpose = (patch.purpose ?? current.purpose).slice(
      0,
      CHANNEL_PURPOSE_MAX,
    );
    const memberIds =
      patch.memberIds && patch.memberIds.length > 0
        ? patch.memberIds
        : current.memberIds;
    const defaultMemberId =
      patch.defaultMemberId && memberIds.includes(patch.defaultMemberId)
        ? patch.defaultMemberId
        : memberIds.includes(current.defaultMemberId)
          ? current.defaultMemberId
          : memberIds[0]!;
    this.#db
      .prepare(
        `UPDATE channels
         SET name = ?, purpose = ?, member_ids = ?, default_member_id = ?, updated_at = ?
         WHERE id = ?`,
      )
      .run(
        name,
        purpose,
        JSON.stringify(memberIds),
        defaultMemberId,
        this.#clock.now(),
        id,
      );
    const channel = this.get(id);
    if (!channel)
      return { ok: false, reason: "That channel no longer exists." };
    return { ok: true, channel };
  }

  remove(id: string): { ok: true } | { ok: false; reason: string } {
    const channel = this.get(id);
    if (!channel)
      return { ok: false, reason: "That channel no longer exists." };
    if (channel.system) {
      return {
        ok: false,
        reason: `#${channel.name} is the office channel and cannot be deleted.`,
      };
    }
    this.#db.prepare("DELETE FROM channels WHERE id = ?").run(id);
    return { ok: true };
  }
}
