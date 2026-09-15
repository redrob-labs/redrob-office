import { access, constants } from "node:fs/promises";
import { basename } from "node:path";
import { BrowserWindow } from "electron";
import {
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  type LlmProviderSecrets,
} from "@redrob/kernel";
import { loadSetupState } from "./setup.js";
import { hostGetPlan, localTurnReady } from "./inference-host.js";
import { buildSecurityBundle } from "../office/config.js";
import { listWorkflows } from "./workflow.js";
import {
  OfficeScheduler,
  type Channel,
  type ChannelPost,
  type FloorSnapshot,
  type HiredStaff,
} from "../office/scheduler.js";
import { DEFAULT_CHANNEL_ID } from "../office/channels/index.js";
import {
  renderDailyBrief,
  type DailyBrief,
} from "../office/brief/daily-brief.js";
import type { DirectiveKind } from "../office/traces/index.js";
let runtime: OfficeScheduler | null = null;
let starting: Promise<OfficeScheduler> | null = null;
let userDataPath = "";

/** Push the snapshot to every open window; the Floor has no per-window state. */
function broadcast(snapshot: FloorSnapshot): void {
  for (const window of BrowserWindow.getAllWindows()) {
    if (window.webContents.isDestroyed()) continue;
    window.webContents.send("office:floorUpdate", snapshot);
  }
}

export function configureFloor(dataPath: string): void {
  userDataPath = dataPath;
}

/**
 * The plan always names a model path, even when nothing is downloaded, so that
 * setup has somewhere to put the weights. Only the file on disk answers whether
 * a local route can serve a turn - and since the text floor moved to 4B, a
 * machine holding older smaller weights counts as having none.
 */
async function localModelAvailable(): Promise<boolean> {
  try {
    const plan = await hostGetPlan();
    if (!plan.modelPath) return false;
    await access(plan.modelPath, constants.R_OK);
    return true;
  } catch {
    return false;
  }
}

const NO_INFERENCE =
  "No inference route. Add a Redrob API key from console.redrob.ai in Settings.";

/**
 * Asked before every turn, and the only place a route is resolved.
 *
 * Everything expensive lives here on purpose: binding probes the GPU and stats
 * model weights, and a local route then has to load the weights before it can
 * answer. Doing that at the composer is what made sending a message wait
 * seconds on a cold cache for no benefit — a turn that cannot run still has to
 * say so in the channel either way.
 */
async function inferenceReady(): Promise<
  { ok: true } | { ok: false; reason: string }
> {
  const floor = peekFloor();
  if (!floor) return { ok: true };
  if (!floor.hasInference() && !(await bindInference(floor))) {
    return { ok: false, reason: NO_INFERENCE };
  }
  if (floor.boundProvider !== "local") return { ok: true };
  const ready = await localTurnReady();
  if (ready.ok) return ready;
  // Weights that will not load are not a reason to refuse the turn outright;
  // a cloud key may still be able to serve it.
  if (await bindInference(floor, { excludeLocal: true })) return { ok: true };
  return { ok: false, reason: `${ready.reason} ${NO_INFERENCE}` };
}

/**
 * Bind an inference route onto a running Floor.
 *
 * The same decision chat makes, from the same settings: a cloud key wins in
 * auto, local serves when there is no key or the user pinned it. The board
 * itself can start without either; only Task execution needs a bound route.
 */
async function bindInference(
  floor: OfficeScheduler,
  options?: { excludeLocal?: boolean },
): Promise<boolean> {
  if (!userDataPath) return false;
  const setup = await loadSetupState(userDataPath);
  const providers = (setup.llmProviders ?? {}) as LlmProviderSecrets;
  const localAvailable = options?.excludeLocal
    ? false
    : await localModelAvailable();
  const configured = setup.inferenceRoute ?? "auto";
  // A pinned local route cannot be honoured when local is ruled out; fall back
  // to auto so the cloud keys still get a chance.
  const mode =
    options?.excludeLocal && configured === "local" ? "auto" : configured;

  // The Floor routes the way chat does: auto takes a cloud key when there is
  // one and keeps local as the fallback. Preferring local here regardless left
  // the office running a 4B while chat next to it ran a frontier model on the
  // same machine. A machine with only GGUF is still served, because auto falls
  // back to local when no key exists, and a pinned local route is still honoured.
  // A provider pinned without its key resolves to nothing, and the office then
  // refused every turn with "change the model in Settings" - true, but the
  // person had changed it, and the weights on the machine could have answered.
  // Falling back to auto keeps the floor working the way a missing GPU does.
  const keyed =
    mode === "auto" ||
    mode === "local" ||
    (providers[mode]?.apiKey?.trim().length ?? 0) >= 8;
  try {
    const route = resolveInferenceRoute({
      mode: keyed ? mode : "auto",
      providers,
      localAvailable,
      redrobAvailable: redrobAvailableFromEnv(),
      workload: { kind: "chat", text: "floor" },
    });
    if (route.provider === "redrob_remote") {
      return false;
    }
    if (route.provider === "local") {
      if (!localAvailable) return false;
      floor.setInference({
        providers,
        provider: "local",
        model: "local",
        thinking: Boolean(route.thinking),
      });
      return true;
    }
    floor.setInference({
      providers,
      provider: route.provider,
      model: route.model,
      thinking: Boolean(route.thinking),
    });
    return true;
  } catch {
    return false;
  }
}

/**
 * A file a StaffMember delivered becomes a library artifact, so the channel
 * card opens it in Documents like anything else the user made.
 */
async function fileDeliverable(input: {
  path: string;
  title: string;
}): Promise<string | null> {
  const { artifactIdForPath, saveArtifact } = await import("./artifacts.js");
  // Delivering a document that already is one: file it under its own id rather
  // than making a second copy of the thing the person is already looking at.
  const existing = artifactIdForPath(input.path);
  if (existing) return existing;
  const saved = await saveArtifact({
    kind: "report",
    title: input.title || basename(input.path),
    sourcePath: input.path,
    source: "model",
  });
  return saved.id;
}

/**
 * The one web switch, read fresh for every turn.
 *
 * The office follows what a person set in the chat composer rather than having a
 * setting of its own, because "may this app look things up" is one decision.
 * Read per turn, so switching it off stops the seat that is about to start.
 */
async function webSearchAllowed(): Promise<boolean> {
  if (!userDataPath) return false;
  try {
    return (await loadSetupState(userDataPath)).webSearchEnabled !== false;
  } catch {
    return false;
  }
}

async function create(): Promise<OfficeScheduler> {
  if (!userDataPath) throw new Error("Floor is not configured yet");
  const setup = await loadSetupState(userDataPath);
  const providers = (setup.llmProviders ?? {}) as LlmProviderSecrets;

  // Start the board even when no route is ready yet. The channel list, the
  // snapshot and the tray must not depend on a model.
  const instance = new OfficeScheduler({
    userDataPath,
    basePolicy: await buildSecurityBundle(),
    providers,
    onChange: broadcast,
    fileDeliverable,
    inferenceReady,
    webSearchAllowed,
  });
  // Resolving a route probes the GPU and stats model weights, which takes
  // seconds on a cold cache. Opening the board must not wait for it; only
  // submitting a Task needs a route, and that path binds on demand.
  void bindInference(instance).catch(() => undefined);
  try {
    instance.addWorkflowTemplates(listWorkflows());
  } catch {
    // A malformed user workflow must not keep the Floor from starting.
  }
  await instance.start();
  return instance;
}

export async function getFloor(): Promise<OfficeScheduler> {
  if (runtime) return runtime;
  starting ??= create().then((instance) => {
    runtime = instance;
    starting = null;
    return instance;
  });
  return starting;
}

export function peekFloor(): OfficeScheduler | null {
  return runtime;
}

/**
 * Re-read the route after Settings changed it.
 *
 * A Floor binds once and then keeps what it has, so without this a running
 * board ignores the provider the user just picked until the app restarts -
 * which reads as the setting doing nothing.
 */
export async function rebindFloorInference(): Promise<void> {
  if (runtime) await bindInference(runtime);
}

export async function stopFloor(): Promise<void> {
  if (!runtime) return;
  await runtime.stop();
  runtime.close();
  runtime = null;
}

export async function floorSnapshot(): Promise<FloorSnapshot> {
  return (await getFloor()).snapshot();
}

/**
 * A person typed a goal at a channel. The lead picks it up from here, unless
 * they named a seat, in which case that seat does.
 *
 * This path deliberately does not wait for a model. The message is queued and
 * visible before anything is asked of an inference route; the route is
 * resolved by the pump, on the turn that actually needs it.
 */
export async function floorSay(
  text: string,
  channelId?: string,
  to?: string,
  attached?: string,
): Promise<
  { ok: true; taskId: string; traceId: string } | { ok: false; reason: string }
> {
  const floor = await getFloor();
  return floor.say(text, channelId ?? DEFAULT_CHANNEL_ID, to, attached);
}

/** Everything said in a channel since a point in time, oldest first. */
export async function floorChannel(
  channelId?: string,
  sinceCreatedAt?: number,
): Promise<ChannelPost[]> {
  return (await getFloor()).channel(
    channelId ?? DEFAULT_CHANNEL_ID,
    sinceCreatedAt ?? 0,
  );
}

export async function floorCreateChannel(input: {
  name: string;
  purpose: string;
  memberIds?: string[];
  defaultMemberId?: string;
}): Promise<{ ok: true; channel: Channel } | { ok: false; reason: string }> {
  return (await getFloor()).createChannel(input);
}

export async function floorUpdateChannel(
  id: string,
  patch: {
    name?: string;
    purpose?: string;
    memberIds?: string[];
    defaultMemberId?: string;
  },
): Promise<{ ok: true; channel: Channel } | { ok: false; reason: string }> {
  return (await getFloor()).updateChannel(id, patch);
}

/** Removing the person removes their chat; there is no way to keep one. */
export async function removeTeamMember(
  memberId: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return (await getFloor()).removeTeamMember(memberId);
}

/** The one-to-one chat with a teammate, opened the first time it is needed. */
export async function ensureDmChannel(
  memberId: string,
): Promise<{ ok: true; channel: Channel } | { ok: false; reason: string }> {
  return (await getFloor()).ensureDmChannel(memberId);
}

export async function inviteToChannel(
  channelId: string,
  memberIds: string[],
): Promise<{ ok: true; channel: Channel } | { ok: false; reason: string }> {
  return (await getFloor()).inviteToChannel(channelId, memberIds);
}

export async function removeFromChannel(
  channelId: string,
  memberId: string,
): Promise<{ ok: true; channel: Channel } | { ok: false; reason: string }> {
  return (await getFloor()).removeFromChannel(channelId, memberId);
}

export async function floorDeleteChannel(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return (await getFloor()).deleteChannel(id);
}

/** Clear every Floor channel conversation as part of Settings → wipe. */
export async function floorWipeChat(): Promise<{
  messages: number;
  channels: number;
  approvals: number;
}> {
  const floor = peekFloor() ?? (await getFloor());
  return floor.wipeChat();
}

export async function floorHireStaff(input: {
  role: string;
  layer: string;
  personality: string;
}): Promise<{ ok: true; staff: HiredStaff } | { ok: false; reason: string }> {
  return (await getFloor()).hireStaff(input);
}

export async function floorUpdateStaff(
  id: string,
  patch: { role?: string; layer?: string; personality?: string },
): Promise<{ ok: true; staff: HiredStaff } | { ok: false; reason: string }> {
  return (await getFloor()).updateStaff(id, patch);
}

export async function floorDismissStaff(
  id: string,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  return (await getFloor()).dismissStaff(id);
}

export async function floorResolveApproval(
  id: string,
  approved: boolean,
  decision: string,
): Promise<{ ok: boolean; pending: number }> {
  return (await getFloor()).resolveApproval(id, approved, decision);
}

export async function floorDirective(input: {
  kind: DirectiveKind;
  body: string;
  traceId?: string;
}): Promise<
  | { ok: true; appliesFrom: number; etaMinutes: number }
  | { ok: false; reason: string }
> {
  return (await getFloor()).applyDirective(input);
}

export async function floorBrief(): Promise<{
  brief: DailyBrief;
  markdown: string;
}> {
  const floor = await getFloor();
  const brief = floor.lastBrief() ?? (await floor.generateBrief());
  return { brief, markdown: renderDailyBrief(brief) };
}

export async function floorRegenerateBrief(): Promise<{
  brief: DailyBrief;
  markdown: string;
}> {
  const floor = await getFloor();
  const brief = await floor.generateBrief();
  return { brief, markdown: renderDailyBrief(brief) };
}

export async function channelEvents(
  channelId?: string,
  sinceTs?: number,
): Promise<import("../../shared/office-api.js").ChannelEventView[]> {
  const floor = await getFloor();
  return floor.channelEvents.list(
    channelId ?? DEFAULT_CHANNEL_ID,
    sinceTs ?? 0,
  );
}

export async function listTeamMembers(): Promise<
  import("../../shared/office-api.js").TeamMemberView[]
> {
  return (await getFloor()).teamMembers.list();
}

export async function updateTeamMember(
  id: string,
  patch: {
    name?: string;
    persona?: string;
    toneHints?: string;
    permission?: import("../office/staff/team-members.js").ToolPermission;
  },
): Promise<
  | { ok: true; member: import("../../shared/office-api.js").TeamMemberView }
  | { ok: false; reason: string }
> {
  return (await getFloor()).updateTeamMember(id, patch);
}

export async function addTeamMember(input: {
  name: string;
  persona: string;
  toneHints?: string;
  permission?: import("../office/staff/team-members.js").ToolPermission;
}): Promise<
  | { ok: true; member: import("../../shared/office-api.js").TeamMemberView }
  | { ok: false; reason: string }
> {
  const { randomUUID } = await import("node:crypto");
  const id = `member-${randomUUID().slice(0, 8)}`;
  const floor = await getFloor();
  const created = floor.addTeamMember({
    id,
    name: input.name,
    persona: input.persona,
    ...(input.toneHints !== undefined ? { toneHints: input.toneHints } : {}),
    ...(input.permission !== undefined ? { permission: input.permission } : {}),
  });
  // Hiring somebody does not put them in every room. They show up in the
  // teammate list, and a channel gets them when it invites them.
  return created;
}

export async function listChannelMemories(input: {
  channelId: string;
  memberId?: string;
  includeShared?: boolean;
}): Promise<import("../../shared/office-api.js").ChannelMemoryView[]> {
  return (await getFloor()).channelMemories.list(input);
}

export async function addChannelMemory(input: {
  channelId: string;
  memberId: string;
  content: string;
}): Promise<import("../../shared/office-api.js").ChannelMemoryView> {
  const { randomUUID } = await import("node:crypto");
  return (await getFloor()).channelMemories.add({
    id: `mem-${randomUUID()}`,
    ...input,
  });
}

export async function promoteChannelMemory(
  id: string,
  channelId: string,
): Promise<import("../../shared/office-api.js").ChannelMemoryView | null> {
  return (await getFloor()).channelMemories.promote(id, channelId);
}

/**
 * Decide who handles a line and record the user's message in the event log.
 * ChatPanel then either calls runChat (viaChat) or floorSay (office).
 */
export async function prepareChannelSend(input: {
  text: string;
  channelId?: string;
  to?: string;
}): Promise<
  | {
      ok: true;
      channelId: string;
      to: string;
      viaChat: boolean;
      userEventId: string;
    }
  | { ok: false; reason: string }
> {
  const floor = await getFloor();
  const channelId = input.channelId ?? DEFAULT_CHANNEL_ID;
  const channel = floor.channels.get(channelId);
  if (!channel) return { ok: false, reason: "That chat no longer exists." };
  const text = input.text.trim();
  if (!text) return { ok: false, reason: "Nothing to send." };

  const { appendUserMessage, resolveRecipient } =
    await import("../office/channels/routing.js");
  const userEvent = appendUserMessage(floor.channelEvents, channelId, text);

  const namesById = new Map(
    floor.teamMembers.list().map((member) => [member.id, member.name]),
  );
  for (const seat of floor.roster) {
    if (!namesById.has(seat.id)) namesById.set(seat.id, seat.role);
  }
  const routed = resolveRecipient({
    text,
    memberIds: channel.memberIds,
    defaultMemberId: channel.defaultMemberId,
    namesById,
    explicitTo: input.to ?? null,
    stickyMemberId: floor.stickyRecipient(channelId),
  });
  // ChatPanel decides the path from this return value, so sticky has to be
  // written here — waiting for say() never runs when the follow-up was
  // wrongly classified as viaChat.
  floor.rememberSticky(channelId, routed.to);
  return {
    ok: true,
    channelId,
    to: routed.to,
    viaChat: routed.viaChat,
    // Threaded onto the user bubble so a later regenerate can prune the log
    // back to exactly this line — see truncateChannelEventsAfter.
    userEventId: userEvent.id,
  };
}

/**
 * Prune a channel's shared log back to a user line when its answer is
 * regenerated, dropping the superseded reply (and anything said after it).
 *
 * Without this the `ingestChannelEvents` poll finds the old replies still on
 * the log after a refresh and appends them back onto the regenerated chat.
 */
export async function truncateChannelEventsAfter(input: {
  channelId: string;
  eventId: string;
}): Promise<number> {
  const floor = await getFloor();
  return floor.channelEvents.truncateAfter(input.channelId, input.eventId);
}

export async function appendChannelAssistant(input: {
  channelId: string;
  authorId: string;
  text: string;
}): Promise<void> {
  const floor = await getFloor();
  const { appendAssistantMessage } =
    await import("../office/channels/routing.js");
  appendAssistantMessage(
    floor.channelEvents,
    input.channelId,
    input.authorId,
    input.text,
  );
  floor; // emit via next snapshot poll
}
