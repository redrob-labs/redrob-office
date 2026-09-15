import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { ScriptEntry } from "./scripted-model.js";

export interface DemoWorkspace {
  root: string;
  previousSnapshot: string;
  currentSnapshot: string;
  sourceLog: string;
  diffPath: string;
}

/**
 * Seed data is a fixture; the code path is not. These are real files the tools
 * actually read and write.
 */
export function seedDemoWorkspace(root: string): DemoWorkspace {
  const prices = join(root, "prices");
  mkdirSync(prices, { recursive: true });

  const previousSnapshot = join(prices, "previous.json");
  const currentSnapshot = join(prices, "current.json");
  const sourceLog = join(prices, "fetch.log");
  const diffPath = join(prices, "price-diff.md");

  writeFileSync(
    previousSnapshot,
    `${JSON.stringify(
      {
        capturedAt: "2026-08-05T09:00:00Z",
        models: [
          { provider: "openai", model: "gpt-5.6-sol", inputPerMTok: 2.5, outputPerMTok: 10.0 },
          { provider: "anthropic", model: "claude-opus-5", inputPerMTok: 15.0, outputPerMTok: 75.0 },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  writeFileSync(
    currentSnapshot,
    `${JSON.stringify(
      {
        capturedAt: "2026-08-06T09:00:00Z",
        models: [
          { provider: "openai", model: "gpt-5.6-sol", inputPerMTok: 3.0, outputPerMTok: 10.0 },
          { provider: "anthropic", model: "claude-opus-5", inputPerMTok: 15.0, outputPerMTok: 75.0 },
        ],
      },
      null,
      2,
    )}\n`,
    "utf8",
  );

  // The raw log is the ground truth the reviewer greps. It says 3.0, so a
  // claim of 3.50 has to fail the deterministic check.
  writeFileSync(
    sourceLog,
    [
      "2026-08-06T09:00:01Z fetch openai pricing page ok",
      "2026-08-06T09:00:01Z openai gpt-5.6-sol inputPerMTok 3.0",
      "2026-08-06T09:00:01Z openai gpt-5.6-sol outputPerMTok 10.0",
      "2026-08-06T09:00:02Z anthropic claude-opus-5 inputPerMTok 15.0",
      "2026-08-06T09:00:02Z anthropic claude-opus-5 outputPerMTok 75.0",
      "",
    ].join("\n"),
    "utf8",
  );

  return { root, previousSnapshot, currentSnapshot, sourceLog, diffPath };
}

function json(value: unknown): string {
  return ["```json", JSON.stringify(value, null, 2), "```"].join("\n");
}

/**
 * The scripted half of the demo. Each entry is one StaffMember turn; the
 * runtime, tools and gates decide what actually happens next.
 */
export function demoScript(ws: DemoWorkspace): ScriptEntry[] {
  return [
    {
      label: "price-watcher: patrol and deliver",
      match: (prompt) =>
        prompt.includes("Price Watcher") &&
        prompt.includes("price snapshot") &&
        !prompt.includes("challenged your claim"),
      steps: [
        {
          toolCalls: [
            { name: "fs.read", arguments: { path: ws.previousSnapshot } },
            { name: "fs.read", arguments: { path: ws.currentSnapshot } },
          ],
        },
        {
          toolCalls: [
            {
              name: "fs.write",
              arguments: {
                path: ws.diffPath,
                content: [
                  "# Provider price diff 2026-08-06",
                  "",
                  "| provider | model | field | previous | current |",
                  "| --- | --- | --- | --- | --- |",
                  "| openai | gpt-5.6-sol | inputPerMTok | 2.5 | 3.50 |",
                  "",
                  "Source: prices/fetch.log",
                  "",
                ].join("\n"),
              },
            },
          ],
        },
        {
          text: json({
            type: "DELIVER",
            to: "repro-verifier",
            artifactRef: { kind: "file", id: ws.sourceLog, label: "provider fetch log" },
            claim: 'openai gpt-5.6-sol input price moved from 2.5 to "3.50" per MTok',
          }),
        },
      ],
    },
    {
      label: "repro-verifier: challenge the mismatch",
      match: (prompt) =>
        prompt.includes("Repro Verifier") && prompt.includes("Verify this delivery"),
      steps: [
        {
          text: json({
            type: "CHALLENGE",
            to: "price-watcher",
            targetClaim: 'input price moved to "3.50" per MTok',
            evidenceRef: [
              {
                kind: "log",
                id: ws.sourceLog,
                label: "provider fetch log",
                locator: "line 2: openai gpt-5.6-sol inputPerMTok 3.0",
              },
            ],
            alternative: "The log records 3.0, not 3.50. Publish 3.0 or refetch the page.",
          }),
        },
      ],
    },
    {
      label: "price-watcher: hold position (round 2)",
      match: (prompt) =>
        prompt.includes("Price Watcher") && prompt.includes("challenged your claim"),
      steps: [
        {
          text: json({
            type: "CHALLENGE",
            to: "repro-verifier",
            targetClaim: "The log line is authoritative",
            evidenceRef: [
              {
                kind: "file",
                id: ws.currentSnapshot,
                label: "current snapshot",
                locator: "models[0].inputPerMTok",
              },
            ],
            alternative: "The snapshot is the published artefact and the log is a fetch trace.",
          }),
        },
      ],
    },
    {
      label: "repro-verifier: press again (round 3 attempt)",
      match: (prompt) =>
        prompt.includes("Repro Verifier") && prompt.includes("challenged your claim"),
      steps: [
        {
          text: json({
            type: "CHALLENGE",
            to: "price-watcher",
            targetClaim: "The snapshot is authoritative",
            evidenceRef: [
              {
                kind: "log",
                id: ws.sourceLog,
                label: "provider fetch log",
                locator: "line 2",
              },
            ],
            alternative: "Neither number is published until a human picks one.",
          }),
        },
      ],
    },
    {
      label: "price-watcher: outbound publish attempt",
      match: (prompt) =>
        prompt.includes("Price Watcher") && prompt.includes("pricing webhook"),
      steps: [
        {
          toolCalls: [
            {
              name: "net.httpPost",
              arguments: {
                url: "https://hooks.redrob.example/pricing",
                body: '{"provider":"openai","model":"gpt-5.6-sol","inputPerMTok":3.0}',
              },
            },
          ],
        },
        {
          text: json({
            type: "BLOCK",
            reason: "The outbound post did not go through.",
            unblockCondition: "A human approves the webhook post, or the day shift starts",
          }),
        },
      ],
    },
    {
      label: "editor: assemble the brief",
      match: (prompt) => prompt.includes("Editor") && prompt.includes("one-pager"),
      steps: [
        {
          text: json({
            type: "DELIVER",
            to: "repro-verifier",
            artifactRef: { kind: "artifact", id: "daily-brief", label: "DailyBrief" },
            claim: "Morning brief assembled from the floor audit log",
          }),
        },
      ],
    },
  ];
}
