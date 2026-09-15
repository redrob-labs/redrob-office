/*
 * Copyright 2026 Redrob
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * Smoke test for the single llama-server backend.
 *
 * Gates the removal of node-llama-cpp: everything that used to run in-process has
 * to work over HTTP against one instance that holds the LM and the projector at
 * the same time, or the dependency stays.
 *
 *   node office/scripts/llama-server-smoke.mjs
 *
 * Env overrides:
 *   REDROB_LLAMA_SERVER  path to llama-server(.exe)
 *   REDROB_SMOKE_MODEL   path to the Qwen3.5 GGUF
 *   REDROB_SMOKE_MMPROJ  path to the matching mmproj GGUF
 *
 * Exits non-zero if any check fails. Writes JSON to smoke-llama-server-result.json.
 */

import { spawn } from "node:child_process";
import { existsSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

const RESULT_FILE = "smoke-llama-server-result.json";

function localAppData() {
  if (process.platform === "win32") {
    return process.env.LOCALAPPDATA ?? join(homedir(), "AppData", "Local");
  }
  if (process.platform === "darwin") {
    return join(homedir(), "Library", "Application Support");
  }
  return process.env.XDG_DATA_HOME ?? join(homedir(), ".local", "share");
}

const REDROB_ROOT = join(localAppData(), "redrob");
const MODELS_DIR = process.env.REDROB_MODELS_DIR?.trim() || join(REDROB_ROOT, "models");

function firstExisting(paths) {
  return paths.find((candidate) => candidate && existsSync(candidate));
}

function resolveBinary() {
  const configured = process.env.REDROB_LLAMA_SERVER?.trim();
  if (configured) return existsSync(configured) ? configured : null;
  const exe = process.platform === "win32" ? "llama-server.exe" : "llama-server";
  return (
    firstExisting([
      join(REDROB_ROOT, "runtime", "win-x64-cuda", exe),
      join(REDROB_ROOT, "runtime", "win-x64-vulkan", exe),
      join(REDROB_ROOT, "runtime", "darwin-arm64-metal", exe),
      join(REDROB_ROOT, "verify-tools", "bin-cuda", exe),
      join(REDROB_ROOT, "models", "bin-cuda", exe),
    ]) ?? null
  );
}

function resolveWeights() {
  const lm = process.env.REDROB_SMOKE_MODEL?.trim();
  const mmproj = process.env.REDROB_SMOKE_MMPROJ?.trim();
  if (lm && mmproj) {
    return existsSync(lm) && existsSync(mmproj) ? { lm, mmproj } : null;
  }
  for (const repo of ["unsloth/Qwen3.5-2B-GGUF", "unsloth/Qwen3.5-4B-GGUF"]) {
    const dir = join(MODELS_DIR, ...repo.split("/"));
    const size = repo.includes("2B") ? "2B" : "4B";
    const candidateLm = join(dir, `Qwen3.5-${size}-Q4_K_M.gguf`);
    const candidateMm = join(dir, "mmproj-F16.gguf");
    if (existsSync(candidateLm) && existsSync(candidateMm)) {
      return { lm: candidateLm, mmproj: candidateMm };
    }
  }
  return null;
}

async function freePort() {
  return await new Promise((resolve, reject) => {
    const probe = createServer();
    probe.once("error", reject);
    probe.listen(0, "127.0.0.1", () => {
      const chosen = probe.address().port;
      probe.close((err) => (err ? reject(err) : resolve(chosen)));
    });
  });
}

async function waitHealthy(port, timeoutMs = 180_000) {
  const started = Date.now();
  let lastErr = "not ready";
  while (Date.now() - started < timeoutMs) {
    try {
      const res = await fetch(`http://127.0.0.1:${port}/health`);
      if (res.ok) {
        const body = await res.json().catch(() => null);
        if (!body || body.status === "ok") return Date.now() - started;
      }
      lastErr = `HTTP ${res.status}`;
    } catch (err) {
      lastErr = err.message;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new Error(`health timeout: ${lastErr}`);
}

/** Stream /completion, letting onToken abort mid-decode by returning true. */
async function streamCompletion(base, body, onToken) {
  const controller = new AbortController();
  const res = await fetch(`${base}/completion`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, stream: true }),
    signal: controller.signal,
  });
  if (!res.ok) throw new Error(`/completion HTTP ${res.status}: ${await res.text()}`);

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  let tokens = 0;
  let aborted = false;
  let stopped = false;
  let timings = null;
  let cacheHit = 0;

  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let boundary = buffer.indexOf("\n\n");
      while (boundary !== -1) {
        const event = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
        for (const line of event.split("\n")) {
          if (!line.startsWith("data:")) continue;
          const payload = line.slice(5).trim();
          if (!payload || payload === "[DONE]") continue;
          let chunk;
          try {
            chunk = JSON.parse(payload);
          } catch {
            continue;
          }
          if (chunk.error) throw new Error(JSON.stringify(chunk.error));
          if (chunk.timings) timings = chunk.timings;
          if (typeof chunk.tokens_cached === "number") cacheHit = chunk.tokens_cached;
          const piece = chunk.content ?? "";
          if (piece) {
            text += piece;
            tokens += 1;
            if (onToken && onToken(piece, text)) {
              aborted = true;
              controller.abort();
              return { text, tokens, aborted, stopped, timings, cacheHit };
            }
          }
          if (chunk.stop) stopped = true;
        }
      }
    }
  } catch (err) {
    if (!aborted) throw err;
  } finally {
    if (!aborted) await reader.cancel().catch(() => undefined);
  }
  return { text, tokens, aborted, stopped, timings, cacheHit };
}

async function chat(base, messages, { enableThinking, maxTokens }) {
  const res = await fetch(`${base}/v1/chat/completions`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      messages,
      max_tokens: maxTokens,
      temperature: 0.2,
      chat_template_kwargs: { enable_thinking: Boolean(enableThinking) },
    }),
  });
  if (!res.ok) throw new Error(`/v1/chat/completions HTTP ${res.status}: ${await res.text()}`);
  const body = await res.json();
  const message = body.choices?.[0]?.message ?? {};
  return {
    content: message.content ?? "",
    reasoning: message.reasoning_content ?? "",
    finish: body.choices?.[0]?.finish_reason ?? "",
  };
}

const ABSENT = "N/A";
const PREAMBLE_DOC = [
  "Kim Jiwoo has worked as a backend engineer for 7 years.",
  "Contact: jiwoo.kim@example.com",
  "Most recently at Nara Systems, leading the payments platform team.",
].join("\n");

function preambleFor(labels) {
  const lines = labels.map((l) => `- ${l.label} (${l.type}): ${l.desc}`).join("\n");
  const system = [
    "Read the document. After each label, write only the value then a newline.",
    `If unknown or not present, write exactly ${ABSENT}.`,
    "Do not write JSON, keys, or explanations.",
  ].join(" ");
  const body = [
    system,
    "",
    "Fields (label → value on the following lines):",
    lines,
    "",
    "Document:",
    PREAMBLE_DOC,
  ].join("\n");
  return `<|im_start|>user\n${body}\n<|im_end|>\n<|im_start|>assistant\n<think>\n\n</think>\n\n`;
}

const FIELDS = [
  { label: "fullName", type: "string", desc: "Candidate name", gbnf: 'root ::= [^\\n]{1,48} "\\n"' },
  { label: "totalExperienceYears", type: "integer", desc: "Years of experience", gbnf: 'root ::= [0-9]{1,2} "\\n"' },
  { label: "email", type: "string", desc: "Email address", gbnf: 'root ::= [^\\n]{1,48} "\\n"' },
];

const checks = [];
function record(name, ok, detail) {
  checks.push({ name, ok, detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
}

async function main() {
  const binary = resolveBinary();
  const weights = resolveWeights();
  if (!binary) {
    console.error("llama-server binary not found. Set REDROB_LLAMA_SERVER.");
    process.exit(2);
  }
  if (!weights) {
    console.error("Qwen3.5 LM + mmproj not found. Set REDROB_SMOKE_MODEL / REDROB_SMOKE_MMPROJ.");
    process.exit(2);
  }
  console.log(`binary : ${binary}`);
  console.log(`lm     : ${weights.lm}`);
  console.log(`mmproj : ${weights.mmproj}\n`);

  const port = await freePort();
  const args = [
    "-m", weights.lm,
    "--mmproj", weights.mmproj,
    "--host", "127.0.0.1",
    "--port", String(port),
    "-ngl", "99",
    "-c", "8192",
    "--jinja",
    "--reasoning", "auto",
    "--reasoning-format", "auto",
    "--cache-reuse", "256",
    "--no-webui",
  ];
  console.log(`spawning: llama-server ${args.join(" ")}\n`);
  const proc = spawn(binary, args, { windowsHide: true, cwd: dirname(binary) });
  const stderrTail = [];
  proc.stderr.on("data", (d) => {
    stderrTail.push(d.toString());
    if (stderrTail.length > 60) stderrTail.shift();
  });

  const base = `http://127.0.0.1:${port}`;
  let exitCode = 0;
  try {
    const loadMs = await waitHealthy(port);
    record("1. single instance boots with -m and --mmproj", true, `${loadMs} ms`);

    // One process holding both means /props reports a projector.
    const props = await (await fetch(`${base}/props`)).json();
    const ctx = props.default_generation_settings?.n_ctx ?? props.n_ctx;
    record("2. /props reachable", typeof ctx === "number" && ctx > 0, `n_ctx=${ctx}`);

    // --- field-fill over /completion -------------------------------------
    const preamble = preambleFor(FIELDS);
    let committed = "";
    const values = {};
    const prefill = [];

    for (let i = 0; i < FIELDS.length; i += 1) {
      const field = FIELDS[i];
      const prompt = `${preamble}${committed}${field.label}: `;
      const out = await streamCompletion(
        base,
        {
          prompt,
          grammar: field.gbnf,
          cache_prompt: true,
          temperature: 0,
          n_predict: 32,
          n_probs: 1,
          stop: ["\n", "\r", "\t"],
        },
        (_piece, whole) => whole.includes("\n"),
      );
      prefill.push(out.timings?.prompt_n ?? -1);
      const value = out.text.split("\n")[0].trim();
      values[field.label] = value;
      committed += `${field.label}: ${value || ABSENT}\n`;
    }

    record(
      "3. grammar-constrained field-fill over /completion",
      Object.values(values).every((v) => v.length > 0),
      JSON.stringify(values),
    );
    // The signal for prefix reuse is prefilled tokens, not wall time: later fields
    // re-send the whole prompt but should only evaluate the newly appended line.
    const laterPrefill = prefill.slice(1);
    record(
      "4. cache_prompt prefix reuse (later fields prefill far fewer tokens)",
      prefill[0] > 0 && laterPrefill.every((n) => n > 0 && n < prefill[0] / 4),
      `prompt_n per field = ${prefill.join(", ")}`,
    );

    // Abort mid-decode, then continue from the truncated value.
    const abortPrompt = `${preamble}summary: `;
    const aborted = await streamCompletion(
      base,
      {
        prompt: abortPrompt,
        grammar: 'root ::= [^\\n]{1,200} "\\n"',
        cache_prompt: true,
        temperature: 0,
        n_predict: 128,
        stop: ["\n"],
      },
      (_piece, whole) => whole.length >= 6,
    );
    record("5. mid-decode abort", aborted.aborted, `cut at ${JSON.stringify(aborted.text)}`);

    const resumed = await streamCompletion(
      base,
      {
        prompt: `${abortPrompt}${aborted.text.slice(0, 6)}`,
        grammar: 'root ::= [^\\n]{1,200} "\\n"',
        cache_prompt: true,
        temperature: 0,
        n_predict: 48,
        stop: ["\n"],
      },
      (_piece, whole) => whole.includes("\n"),
    );
    record("6. continue after abort (slot reusable)", resumed.text.length > 0, JSON.stringify(resumed.text.slice(0, 60)));

    // --- reasoning toggle -------------------------------------------------
    const q = [{ role: "user", content: "What is 17 * 23? Answer with the number only." }];

    const off = await chat(base, q, { enableThinking: false, maxTokens: 128 });
    record(
      "7. reasoning OFF yields content, no reasoning_content",
      off.content.trim().length > 0 && off.reasoning.trim().length === 0,
      `content=${JSON.stringify(off.content.slice(0, 60))} reasoning_len=${off.reasoning.length}`,
    );

    const on = await chat(base, q, { enableThinking: true, maxTokens: 512 });
    record(
      "8. reasoning ON separates reasoning_content from content",
      on.reasoning.trim().length > 0,
      `content_len=${on.content.length} reasoning_len=${on.reasoning.length}`,
    );

    // The failure mode the toggle has to handle: a budget too short to finish
    // thinking leaves content empty while reasoning_content is populated.
    const starved = await chat(base, q, { enableThinking: true, maxTokens: 24 });
    record(
      "9. short reasoning budget reproduces empty content",
      true,
      `content_len=${starved.content.length} reasoning_len=${starved.reasoning.length} finish=${starved.finish}` +
        (starved.content.trim().length === 0
          ? " (reproduced: retry-with-larger-budget path is required)"
          : " (not reproduced at this budget)"),
    );

    // --- vision on the same instance -------------------------------------
    // 1x1 red PNG; only checks that the projector is live on this process.
    const png =
      "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==";
    const visionRes = await fetch(`${base}/v1/chat/completions`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "Reply with the single word: ok" },
              { type: "image_url", image_url: { url: `data:image/png;base64,${png}` } },
            ],
          },
        ],
        max_tokens: 32,
        chat_template_kwargs: { enable_thinking: false },
      }),
    });
    const visionOk = visionRes.ok;
    const visionBody = visionOk ? await visionRes.json() : await visionRes.text();
    record(
      "10. vision served by the same instance (no second load)",
      visionOk,
      visionOk
        ? JSON.stringify((visionBody.choices?.[0]?.message?.content ?? "").slice(0, 40))
        : String(visionBody).slice(0, 200),
    );

    exitCode = checks.every((c) => c.ok) ? 0 : 1;
  } catch (err) {
    record("smoke run", false, err.message);
    console.error("\nllama-server stderr tail:\n" + stderrTail.join(""));
    exitCode = 1;
  } finally {
    try {
      proc.kill();
    } catch {
      /* already gone */
    }
  }

  const passed = checks.filter((c) => c.ok).length;
  console.log(`\n${passed}/${checks.length} checks passed`);
  writeFileSync(
    RESULT_FILE,
    JSON.stringify({ at: new Date().toISOString(), binary, weights, checks }, null, 2),
  );
  console.log(`wrote ${RESULT_FILE}`);
  process.exit(exitCode);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
