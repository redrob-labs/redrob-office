import type { TaskTemplate } from "../tasks/templates.js";
import type { StaffSpec } from "../staff/types.js";

/**
 * The price-patrol roster the Floor shipped with before it became a general
 * office. It stays as a fixture because the scheduler tests lean on its shape:
 * one producer, one reviewer whose deliveries run gates, one editorial seat.
 * Production code uses DEFAULT_ROSTER instead.
 */
export const PRICE_WATCHER_ID = "price-watcher";
export const REPRO_VERIFIER_ID = "repro-verifier";
export const EDITOR_ID = "editor";

export const PRICE_ROSTER: StaffSpec[] = [
  {
    id: PRICE_WATCHER_ID,
    role: "Price Watcher",
    layer: "production",
    host: "local",
    tools: ["fs.read", "fs.list", "fs.write", "net.httpPost"],
    scope: [
      "You diff model-provider price tables against the last snapshot on disk.",
      "Report only differences you can point at in the fetched snapshot.",
      "Deliver a DELIVER message with an artifactRef to the diff you wrote.",
    ].join(" "),
    budget: { perTaskTokens: 6_000, perDayTokens: 60_000 },
    peers: [REPRO_VERIFIER_ID, EDITOR_ID],
    maxIterations: 6,
  },
  {
    id: REPRO_VERIFIER_ID,
    role: "Repro Verifier",
    layer: "review",
    host: "local",
    tools: ["fs.read", "fs.list", "shell.exec"],
    scope: [
      "You verify that every number in a deliverable matches the source log.",
      "Run deterministic checks first (hash, schema, grep, tests).",
      "Only after those are exhausted may you judge the remainder yourself.",
      "On mismatch send CHALLENGE with the exact evidence locator and block publication.",
    ].join(" "),
    budget: { perTaskTokens: 8_000, perDayTokens: 80_000 },
    peers: [PRICE_WATCHER_ID, EDITOR_ID],
    maxIterations: 8,
  },
  {
    id: EDITOR_ID,
    role: "Editor",
    layer: "editorial",
    host: "local",
    tools: ["fs.read", "fs.list", "fs.write"],
    scope: [
      "You assemble the DailyBrief. You are the only path from the Floor to a person.",
      "Every approval line needs one sentence, an evidence link and the dissenting view.",
      "Never soften an interruption: report the gap with times.",
    ].join(" "),
    budget: { perTaskTokens: 10_000, perDayTokens: 60_000 },
    peers: [PRICE_WATCHER_ID, REPRO_VERIFIER_ID],
    maxIterations: 6,
  },
];

export const PRICE_TASK_TEMPLATES: TaskTemplate[] = [
  {
    id: "office/price-patrol",
    title: "Model price table patrol",
    staffId: PRICE_WATCHER_ID,
    instruction: [
      "Read the current provider price snapshot and the previous one from the workspace.",
      "Write a diff file listing every changed price with the provider, model and both values.",
      "Then report what changed.",
    ].join(" "),
    gates: ["schema"],
    source: "builtin",
  },
  {
    id: "office/repro-verify",
    title: "Reproduce reported numbers",
    staffId: REPRO_VERIFIER_ID,
    instruction: [
      "Verify every number in the delivered diff against the raw source log.",
      "Run the deterministic checks first and quote the exact line you compared.",
      "If anything disagrees, challenge it with that locator.",
    ].join(" "),
    gates: ["hash", "grep", "test"],
    source: "builtin",
  },
  {
    id: "office/daily-brief",
    title: "Assemble the DailyBrief",
    staffId: EDITOR_ID,
    instruction: [
      "Assemble the morning one-pager from the Floor audit log.",
      "Shipped, approvals, blocks, spend, anomalies and the handoff.",
    ].join(" "),
    gates: ["schema"],
    source: "builtin",
  },
  {
    id: "office/publish-diff",
    title: "Publish the confirmed price change",
    staffId: PRICE_WATCHER_ID,
    instruction: [
      "Post the confirmed price change to the external pricing webhook.",
      "This leaves the machine, so it must go through approval.",
    ].join(" "),
    gates: ["hash"],
    source: "builtin",
  },
];

