import type {
  ChannelEventView,
  ChannelMemoryView,
  FloorChannel,
  FloorChannelPost,
  FloorHiredStaff,
  FloorSeatView,
  FloorSnapshotView,
  FloorStaffLayer,
  OfficeApi,
  TeamMemberView,
} from "../../shared/office-api";
import { nowMs } from "./clock";

/**
 * An in-memory Floor for the browser preview.
 *
 * The real one lives in the main process, on SQLite and a paced queue. This is
 * not that, and it is not trying to be: it exists so the channel list, the
 * hiring dialog, the optimistic send and the typing indicator can be looked at
 * without building and launching Electron. It fakes exactly one thing — a
 * staff member thinking for a couple of seconds and then answering — because
 * that delay is the whole reason those parts of the UI exist.
 */

const DEFAULT_CHANNEL_ID = "general";

type FloorApi = Pick<
  OfficeApi,
  | "floorSnapshot"
  | "floorChannel"
  | "floorSay"
  | "floorResolveApproval"
  | "floorDirective"
  | "floorCreateChannel"
  | "floorUpdateChannel"
  | "ensureDmChannel"
  | "inviteToChannel"
  | "removeFromChannel"
  | "floorDeleteChannel"
  | "floorHireStaff"
  | "floorUpdateStaff"
  | "floorDismissStaff"
  | "floorBrief"
  | "onFloorUpdate"
  | "channelEvents"
  | "listTeamMembers"
  | "generatePersona"
  | "addTeamMember"
  | "updateTeamMember"
  | "removeTeamMember"
  | "listChannelMemories"
  | "addChannelMemory"
  | "promoteChannelMemory"
  | "prepareChannelSend"
  | "appendChannelAssistant"
  | "truncateChannelEventsAfter"
>;

interface Seat {
  staffId: string;
  role: string;
  layer: string;
  personality: string;
  custom: boolean;
}

const BUILT_IN: Seat[] = [
  {
    staffId: "manager",
    role: "Manager",
    layer: "lead",
    personality: "",
    custom: false,
  },
  {
    staffId: "researcher",
    role: "Researcher",
    layer: "research",
    personality: "",
    custom: false,
  },
  {
    staffId: "writer",
    role: "Writer",
    layer: "editorial",
    personality: "",
    custom: false,
  },
  {
    staffId: "reviewer",
    role: "Reviewer",
    layer: "review",
    personality: "",
    custom: false,
  },
  {
    staffId: "publisher",
    role: "Publisher",
    layer: "production",
    personality: "",
    custom: false,
  },
];

function slug(input: string, fallback: string): string {
  return (
    input
      .trim()
      .toLowerCase()
      .replace(/[\s.]+/g, "-")
      .replace(/[^a-z0-9\-_가-힣]/g, "")
      .replace(/-{2,}/g, "-")
      .replace(/^[-_]+|[-_]+$/g, "")
      .slice(0, 40) || fallback
  );
}

/** Every line, so a quoted list stays inside the quote. */
function quote(text: string): string {
  return text
    .split("\n")
    .map((line) => `> ${line}`)
    .join("\n");
}

function channelRow(
  patch: Partial<FloorChannel> & Pick<FloorChannel, "id" | "name">,
): FloorChannel {
  const memberIds = patch.memberIds ?? ["assistant"];
  return {
    id: patch.id,
    name: patch.name,
    purpose: patch.purpose ?? "",
    createdAt: patch.createdAt ?? nowMs(),
    updatedAt: patch.updatedAt ?? nowMs(),
    system: patch.system ?? false,
    memberIds,
    defaultMemberId: patch.defaultMemberId ?? memberIds[0]!,
    // A `dm-` address is what makes a chat one-to-one, not a small room.
    isDM: patch.id.startsWith("dm-"),
  };
}

export function createMockFloorApi(): FloorApi {
  const listeners = new Set<(snapshot: FloorSnapshotView) => void>();
  let channels: FloorChannel[] = [
    channelRow({
      id: DEFAULT_CHANNEL_ID,
      name: "general",
      purpose: "Hand the office a goal and it works out who does what.",
      system: true,
      memberIds: ["assistant"],
      defaultMemberId: "assistant",
    }),
    channelRow({
      id: "project-launch",
      name: "project-launch",
      purpose: "Cross-functional work on the upcoming release.",
      system: false,
      memberIds: ["assistant", "designer", "engineer"],
      defaultMemberId: "assistant",
      updatedAt: nowMs() - 1000 * 60 * 30,
    }),
    channelRow({
      id: "design-critique",
      name: "design-critique",
      purpose: "UI review, Figma tokens, and component spec feedback.",
      system: false,
      memberIds: ["assistant", "designer"],
      defaultMemberId: "designer",
      updatedAt: nowMs() - 1000 * 60 * 120,
    }),
  ];
  let seats: Seat[] = [...BUILT_IN];
  let posts: FloorChannelPost[] = [];
  let events: ChannelEventView[] = [];
  let teamMembers: TeamMemberView[] = [
    {
      id: "assistant",
      name: "Assistant",
      persona: "Default teammate for this chat.",
      toneHints: "Polite, direct, concise.",
      permission: "full",
      createdAt: nowMs() - 1000 * 60 * 60 * 24,
      updatedAt: nowMs() - 1000 * 60 * 60 * 24,
      builtin: true,
      active: true,
    },
    {
      id: "designer",
      name: "Devon Miller",
      persona: "Senior Product & UI/UX Designer. Figma and design tokens.",
      toneHints: "Visual, structured, constructive.",
      permission: "write",
      createdAt: nowMs() - 1000 * 60 * 60 * 12,
      updatedAt: nowMs() - 1000 * 60 * 45,
      builtin: false,
      active: true,
    },
    {
      id: "engineer",
      name: "Alex Rivera",
      persona: "Full-Stack Software Engineer. TypeScript and React architectures.",
      toneHints: "Technically precise, concise, and pragmatic.",
      permission: "write",
      createdAt: nowMs() - 1000 * 60 * 60 * 6,
      updatedAt: nowMs() - 1000 * 60 * 15,
      builtin: false,
      active: true,
    },
  ];
  let memories: ChannelMemoryView[] = [];
  /** Who last took a turn in each channel — plain follow-ups stay with them. */
  const stickyByChannel = new Map<string, string>();
  const typing = new Set<string>();
  let counter = 0;
  let replyTimer: ReturnType<typeof setTimeout> | null = null;

  function pushEvent(
    patch: Omit<ChannelEventView, "id" | "ts"> & { id?: string; ts?: number },
  ): ChannelEventView {
    counter += 1;
    const row: ChannelEventView = {
      id: patch.id ?? `mock-evt-${counter}`,
      channelId: patch.channelId,
      authorId: patch.authorId,
      type: patch.type,
      payload: patch.payload,
      ts: patch.ts ?? nowMs(),
    };
    events.push(row);
    return row;
  }

  function post(patch: Partial<FloorChannelPost>): FloorChannelPost {
    counter += 1;
    return {
      id: `mock-${counter}`,
      channelId: DEFAULT_CHANNEL_ID,
      kind: "message",
      type: "REQUEST",
      from: "floor-intake",
      to: "",
      origin: "staff",
      body: "",
      detail: "",
      evidence: [],
      artifact: null,
      options: [],
      createdAt: nowMs(),
      notBefore: nowMs(),
      pending: false,
      traceId: "mock-trace",
      meetingId: null,
      progress: null,
      ...patch,
    };
  }

  function snapshot(): FloorSnapshotView {
    const seatViews: FloorSeatView[] = seats.map((seat) => ({
      staffId: seat.staffId,
      role: seat.role,
      layer: seat.layer,
      host: "local",
      state: typing.has(seat.staffId) ? "working" : "idle",
      taskId: null,
      taskTitle: null,
      traceId: typing.has(seat.staffId) ? "mock-trace" : null,
      lastMessageType: null,
      tokensToday: 0,
      personality: seat.personality,
      custom: seat.custom,
      typing: typing.has(seat.staffId),
    }));
    return {
      now: nowMs(),
      paused: false,
      productionHalted: false,
      channels: [...channels],
      seats: seatViews,
      meetings: [],
      agenda: [],
      tray: { pending: 0, threshold: 5, overflowing: false, items: [] },
      meter: { tokens: 0, budget: 400_000, ratio: 0, lightsOut: false },
      wall: { costMicros: 0, gatePassRate: 1, reworkRate: 0 },
      queue: { pending: 0, inFlight: 0, done: 0 },
      directives: [],
      interruptions: [],
    };
  }

  function emit(): void {
    const next = snapshot();
    for (const listener of listeners) listener(next);
  }

  return {
    floorSnapshot: async () => snapshot(),
    floorChannel: async (channelId) =>
      posts.filter(
        (item) => item.channelId === (channelId ?? DEFAULT_CHANNEL_ID),
      ),
    floorSay: async (text, channelId) => {
      const channel = channelId ?? DEFAULT_CHANNEL_ID;
      posts.push(
        post({
          channelId: channel,
          origin: "human",
          from: "floor-intake",
          body: text,
        }),
      );
      typing.add("manager");
      emit();
      if (replyTimer !== null) clearTimeout(replyTimer);
      replyTimer = setTimeout(() => {
        replyTimer = null;
        typing.delete("manager");
        posts.push(
          post({
            channelId: channel,
            from: "manager",
            to: "writer",
            origin: "staff",
            type: "REQUEST",
            body: `Draft what was asked for: ${text}`,
          }),
        );
        typing.add("research");
        emit();
      }, 2_200);
      const reports: Array<{
        activity: string;
        target: string;
        elapsedMs: number;
        spoken: boolean;
      }> = [
        {
          activity: "reading",
          target: "handbook.md",
          elapsedMs: 0,
          spoken: true,
        },
        {
          activity: "looking",
          target: "last quarter's notes",
          elapsedMs: 62_000,
          spoken: true,
        },
        {
          activity: "thinking",
          target: "",
          elapsedMs: 124_000,
          spoken: false,
        },
      ];
      reports.forEach((progress, index) => {
        setTimeout(
          () => {
            pushEvent({
              channelId: channel,
              authorId: "researcher",
              type: "progress",
              payload: {
                activity: progress.activity,
                target: progress.target,
                role: "Researcher",
                elapsedMs: progress.elapsedMs,
              },
            });
            posts.push(
              post({
                channelId: channel,
                kind: "system",
                type: "task.progress",
                from: "research",
                origin: "system",
                body: `research is ${progress.activity}`,
                progress,
              }),
            );
            emit();
          },
          3_000 + index * 4_000,
        );
      });
      setTimeout(() => {
        typing.delete("research");
        const body = `Here is what I found, with the **sources** below.\n\n${quote(text)}`;
        pushEvent({
          channelId: channel,
          authorId: "researcher",
          type: "message",
          payload: { role: "assistant", text: body },
        });
        posts.push(
          post({
            channelId: channel,
            from: "research",
            to: "",
            origin: "staff",
            type: "DELIVER",
            body,
            evidence: [
              { label: "Team handbook", locator: "4" },
              { label: "Last quarter's notes", locator: "12" },
            ],
          }),
        );
        emit();
      }, 15_000);
      return {
        ok: true,
        taskId: `mock-task-${counter}`,
        traceId: "mock-trace",
      };
    },
    floorResolveApproval: async () => ({ ok: true, pending: 0 }),
    floorDirective: async () => ({
      ok: true as const,
      appliesFrom: nowMs(),
      etaMinutes: 5,
    }),
    floorCreateChannel: async (input) => {
      const id = slug(input.name, `channel-${counter + 1}`);
      if (channels.some((row) => row.name === id)) {
        return { ok: false, reason: `#${id} already exists.` };
      }
      const channel = channelRow({
        id,
        name: id,
        purpose: input.purpose,
        memberIds: ["assistant"],
      });
      channels = [...channels, channel];
      emit();
      return { ok: true, channel };
    },
    floorUpdateChannel: async (id, patch) => {
      const current = channels.find((row) => row.id === id);
      if (!current) return { ok: false, reason: "That chat no longer exists." };
      const next = channelRow({
        ...current,
        ...patch,
        name: patch.name ? slug(patch.name, current.name) : current.name,
        updatedAt: nowMs(),
      });
      channels = channels.map((row) => (row.id === id ? next : row));
      emit();
      return { ok: true, channel: next };
    },
    ensureDmChannel: async (memberId) => {
      const member = teamMembers.find((row) => row.id === memberId);
      if (!member) return { ok: false, reason: "That teammate is not here." };
      const id = `dm-${memberId}`;
      const existing = channels.find((row) => row.id === id);
      if (existing) return { ok: true, channel: existing };
      const channel = channelRow({
        id,
        name: id,
        memberIds: [memberId],
        defaultMemberId: memberId,
      });
      channels = [...channels, channel];
      emit();
      return { ok: true, channel };
    },
    inviteToChannel: async (channelId, memberIds) => {
      const current = channels.find((row) => row.id === channelId);
      if (!current) return { ok: false, reason: "That chat no longer exists." };
      const known = memberIds.filter((id) =>
        teamMembers.some((row) => row.id === id),
      );
      if (known.length === 0) return { ok: false, reason: "Nobody to invite." };
      const already = new Set(current.memberIds);
      const added = known.filter((id) => !already.has(id));
      const next = channelRow({
        ...current,
        memberIds: [...new Set([...current.memberIds, ...known])],
        updatedAt: nowMs(),
      });
      channels = channels.map((row) => (row.id === channelId ? next : row));
      for (const memberId of added) {
        const member = teamMembers.find((row) => row.id === memberId);
        pushEvent({
          channelId,
          authorId: "system",
          type: "system",
          payload: {
            kind: "invite",
            memberId,
            name: member?.name ?? memberId,
          },
        });
      }
      emit();
      return { ok: true, channel: next };
    },
    removeFromChannel: async (channelId, memberId) => {
      const current = channels.find((row) => row.id === channelId);
      if (!current) return { ok: false, reason: "That chat no longer exists." };
      if (channelId === DEFAULT_CHANNEL_ID) {
        return {
          ok: false,
          reason: "Everybody is in #general. Remove the teammate instead.",
        };
      }
      if (!current.memberIds.includes(memberId)) {
        return { ok: true, channel: current };
      }
      const memberIds = current.memberIds.filter((id) => id !== memberId);
      if (memberIds.length === 0) {
        return {
          ok: false,
          reason: "A conversation needs at least one teammate in it.",
        };
      }
      const member = teamMembers.find((row) => row.id === memberId);
      const next = channelRow({ ...current, memberIds, updatedAt: nowMs() });
      channels = channels.map((row) => (row.id === channelId ? next : row));
      pushEvent({
        channelId,
        authorId: "system",
        type: "system",
        payload: {
          kind: "remove",
          memberId,
          name: member?.name ?? memberId,
        },
      });
      typing.delete(memberId);
      if (stickyByChannel.get(channelId) === memberId) {
        stickyByChannel.delete(channelId);
      }
      emit();
      return { ok: true, channel: next };
    },
    floorDeleteChannel: async (id) => {
      if (id === DEFAULT_CHANNEL_ID) {
        return { ok: false, reason: "The starting chat cannot be deleted." };
      }
      channels = channels.filter((row) => row.id !== id);
      events = events.filter((row) => row.channelId !== id);
      memories = memories.filter((row) => row.channelId !== id);
      stickyByChannel.delete(id);
      emit();
      return { ok: true };
    },
    floorHireStaff: async (input) => {
      const id = slug(input.role, `seat-${counter + 1}`);
      seats = [
        ...seats,
        {
          staffId: id,
          role: input.role,
          layer: input.layer,
          personality: input.personality,
          custom: true,
        },
      ];
      emit();
      const hired: FloorHiredStaff = {
        id,
        role: input.role,
        layer: input.layer as FloorStaffLayer,
        personality: input.personality,
        createdAt: nowMs(),
        updatedAt: nowMs(),
      };
      return { ok: true, staff: hired };
    },
    floorUpdateStaff: async (id, patch) => {
      const seat = seats.find((row) => row.staffId === id);
      if (!seat || !seat.custom) {
        return { ok: false, reason: "That teammate cannot be edited." };
      }
      seats = seats.map((row) =>
        row.staffId === id
          ? {
              ...row,
              role: patch.role ?? row.role,
              layer: patch.layer ?? row.layer,
              personality: patch.personality ?? row.personality,
            }
          : row,
      );
      emit();
      return {
        ok: true,
        staff: {
          id,
          role: patch.role ?? seat.role,
          layer: (patch.layer ?? seat.layer) as FloorStaffLayer,
          personality: patch.personality ?? seat.personality,
          createdAt: nowMs(),
          updatedAt: nowMs(),
        },
      };
    },
    floorDismissStaff: async (id) => {
      const seat = seats.find((row) => row.staffId === id);
      if (!seat?.custom) {
        return { ok: false, reason: "Built-in teammates stay." };
      }
      seats = seats.filter((row) => row.staffId !== id);
      emit();
      return { ok: true };
    },
    floorBrief: async () => ({
      brief: {
        generatedAt: nowMs(),
        dayIndex: 0,
        banner: "Preview brief",
        shipped: ["This is the browser mock."],
        approvals: [],
        blocked: [],
        spend: { tokens: 0, budget: 400_000, costMicros: 0 },
        anomalies: [],
        handoff: {
          scheduled: 0,
          completed: 0,
          interruptions: [],
          summary: "",
        },
      },
      markdown: "# Preview brief\n\nThis is the browser mock.",
    }),
    onFloorUpdate: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    channelEvents: async (channelId, sinceTs) =>
      events.filter(
        (row) =>
          row.channelId === (channelId ?? DEFAULT_CHANNEL_ID) &&
          row.ts >= (sinceTs ?? 0),
      ),
    listTeamMembers: async () => [...teamMembers],
    generatePersona: async (prompt: string, _locale?: string) => {
      const p = prompt.toLowerCase();
      if (p.includes("design") || p.includes("figma") || p.includes("ui")) {
        return {
          name: "Devon Miller",
          persona:
            "Senior Product & UI/UX Designer. Expert in Figma component architectures, responsive interface design, and design-to-code translation.",
          tone: "Visual, structured, constructive, and precise",
          permission: "write",
        };
      }
      return {
        name: "Alex Rivera",
        persona:
          "Full-Stack Software Engineer. Specializes in TypeScript, modern web frameworks, clean architecture, and rapid prototyping.",
        tone: "Technically precise, concise, and pragmatic",
        permission: "write",
      };
    },
    addTeamMember: async (input) => {
      counter += 1;
      const member: TeamMemberView = {
        id: `member-mock-${counter}`,
        name: input.name.trim(),
        persona: input.persona,
        toneHints: input.toneHints ?? "",
        permission: input.permission ?? "write",
        createdAt: nowMs(),
        updatedAt: nowMs(),
        builtin: false,
        active: true,
      };
      if (!member.name) {
        return { ok: false, reason: "A teammate needs a name." };
      }
      teamMembers = [...teamMembers, member];
      // Everybody is in #general; the rooms somebody made stay invite-only.
      channels = channels.map((row) =>
        row.id === DEFAULT_CHANNEL_ID
          ? channelRow({
              ...row,
              memberIds: [...new Set([...row.memberIds, member.id])],
              updatedAt: nowMs(),
            })
          : row,
      );
      emit();
      return { ok: true, member };
    },
    updateTeamMember: async (id, patch) => {
      const current = teamMembers.find((row) => row.id === id);
      if (!current) return { ok: false, reason: "That teammate is gone." };
      const member: TeamMemberView = {
        ...current,
        name: patch.name?.trim() || current.name,
        persona: patch.persona ?? current.persona,
        toneHints: patch.toneHints ?? current.toneHints,
        permission: patch.permission ?? current.permission,
        updatedAt: nowMs(),
      };
      teamMembers = teamMembers.map((row) => (row.id === id ? member : row));
      return { ok: true, member };
    },
    removeTeamMember: async (id) => {
      const current = teamMembers.find((row) => row.id === id);
      if (!current) return { ok: false, reason: "That teammate is gone." };
      if (current.builtin) {
        return { ok: false, reason: "The assistant cannot be removed." };
      }
      // Deactivate, do not delete: their past messages keep a name. Their chat
      // history stays too, it just leaves the rooms and the pickers.
      teamMembers = teamMembers.map((row) =>
        row.id === id ? { ...row, active: false, updatedAt: nowMs() } : row,
      );
      channels = channels.map((row) => {
        if (!row.memberIds.includes(id)) return row;
        const memberIds = row.memberIds.filter((member) => member !== id);
        return channelRow({
          ...row,
          memberIds: memberIds.length > 0 ? memberIds : ["assistant"],
          updatedAt: nowMs(),
        });
      });
      emit();
      return { ok: true };
    },
    listChannelMemories: async (input) =>
      memories.filter((row) => {
        if (row.channelId !== input.channelId) return false;
        if (input.memberId && row.memberId !== input.memberId) {
          if (!(input.includeShared && row.kind === "shared")) return false;
        }
        return true;
      }),
    addChannelMemory: async (input) => {
      counter += 1;
      const row: ChannelMemoryView = {
        id: `mem-mock-${counter}`,
        memberId: input.memberId,
        channelId: input.channelId,
        kind: "channel",
        content: input.content,
        createdAt: nowMs(),
      };
      memories = [...memories, row];
      return row;
    },
    promoteChannelMemory: async (id, channelId) => {
      const current = memories.find(
        (row) => row.id === id && row.channelId === channelId,
      );
      if (!current) return null;
      const next: ChannelMemoryView = { ...current, kind: "shared" };
      memories = memories.map((row) => (row.id === id ? next : row));
      return next;
    },
    prepareChannelSend: async (input) => {
      const channelId = input.channelId ?? DEFAULT_CHANNEL_ID;
      const channel = channels.find((row) => row.id === channelId);
      if (!channel) return { ok: false, reason: "That chat no longer exists." };
      const text = input.text.trim();
      if (!text) return { ok: false, reason: "Nothing to send." };
      const userEvent = pushEvent({
        channelId,
        authorId: "human",
        type: "message",
        payload: { role: "user", text },
      });
      // Keep pace with main-process routing: @mentions and bare Korean calls
      // ("장훈아") both name a seat. Exact copy of that matcher lives in
      // channels/routing.ts — this mock only has to feel the same.
      const bare = (raw: string): string =>
        raw.toLowerCase().replace(/\s+/g, "").replace(/(?:님|씨|아|야|이여)$/u, "");
      const matchMember = (raw: string) => {
        const token = bare(raw);
        if (!token) return null;
        let best: { id: string; score: number } | null = null;
        for (const member of teamMembers) {
          if (!channel.memberIds.includes(member.id)) continue;
          const name = member.name.toLowerCase().replace(/\s+/g, "");
          const idHit = member.id.toLowerCase() === token;
          const exact = name === token;
          const hangul =
            /^[\uAC00-\uD7A3]+$/u.test(name) &&
            /^[\uAC00-\uD7A3]+$/u.test(token) &&
            name.length >= token.length + 1 &&
            name.endsWith(token);
          if (!idHit && !exact && !hangul) continue;
          if (idHit || exact) return member.id;
          if (!best || name.length > best.score) {
            best = { id: member.id, score: name.length };
          }
        }
        return best?.id ?? null;
      };
      let to = channel.defaultMemberId;
      let viaChat = to === "assistant";
      if (input.to && channel.memberIds.includes(input.to)) {
        to = input.to;
        viaChat = to === "assistant";
      } else {
        let hit: string | null = null;
        for (const match of text.matchAll(/(?:^|\s)@([\p{L}\p{N}_-]+)/gu)) {
          hit = matchMember(match[1]!);
          if (hit) break;
        }
        if (!hit) {
          for (const word of text.match(/[\p{L}\p{N}_-]+/gu) ?? []) {
            const named = matchMember(word);
            if (named) {
              hit = named;
              break;
            }
          }
        }
        if (!hit) {
          const sticky = stickyByChannel.get(channelId);
          if (sticky && channel.memberIds.includes(sticky)) hit = sticky;
        }
        if (hit) {
          to = hit;
          viaChat = to === "assistant";
        }
      }
      stickyByChannel.set(channelId, to);
      return { ok: true, channelId, to, viaChat, userEventId: userEvent.id };
    },
    appendChannelAssistant: async (input) => {
      pushEvent({
        channelId: input.channelId,
        authorId: input.authorId,
        type: "message",
        payload: { role: "assistant", text: input.text },
      });
    },
    truncateChannelEventsAfter: async (input) => {
      const anchorIdx = events.findIndex(
        (row) => row.id === input.eventId && row.channelId === input.channelId,
      );
      if (anchorIdx < 0) return 0;
      const before = events.length;
      events = events.filter(
        (row, idx) => row.channelId !== input.channelId || idx <= anchorIdx,
      );
      return before - events.length;
    },
  };
}
