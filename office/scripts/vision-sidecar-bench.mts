/**
 * Step 4 measurement harness for temporary llama-server vision sidecar (CPU).
 *
 * Run: cd office && npx tsx ./scripts/vision-sidecar-bench.mts
 *
 * Reports cold/warm sidecar boot, prefill vs decode, token budgets 512/1024/2048,
 * trim on/off, 1/5/10-page wall-clock, and llama-mtmd-cli baseline on the same image.
 */
import { spawn } from "node:child_process";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { prepareImageForModel } from "@redrob/kernel";
import {
  ensureVisionSidecar,
  generateVisionChat,
  resetVisionSidecarForTests,
  resolveLlamaServerBinary,
  resolveVisionLmPath,
  resolveVisionMmprojPath,
  shutdownVisionSidecar,
  stopVisionSidecar,
} from "../src/main/services/vision/index.ts";

const OUT_DIR = join(
  process.env.USERPROFILE ?? homedir(),
  "redrob",
  "redrob-office",
  "tmp",
  "qwen35-ab-phase0",
);
const PROBE_RAW = join(OUT_DIR, "probe.png");
const DAYLOG_DIR = join(
  process.env.APPDATA ?? join(homedir(), "AppData", "Roaming"),
  "@redrob",
  "desk",
  "day-logs",
  "daylog-msgnc2m9",
);

const CANARY_PROMPT =
  "What exact alphanumeric token is printed in the white box on the cyan background? Reply with only that token, nothing else.";
const ATTR_PROMPT =
  "Extract the alphanumeric token visible in the white box. Reply with only that token.";
const MULTI_PROMPT =
  "For each screenshot in order, list one short line: index) likely app or task visible. Korean ok. Be brief.";

type Row = Record<string, string | number | boolean | null>;

const rows: { section: string; row: Row }[] = [];

function ms(n: number | null | undefined): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n < 1000 ? `${Math.round(n)}ms` : `${(n / 1000).toFixed(1)}s`;
}

function push(section: string, row: Row): void {
  rows.push({ section, row });
  console.log(`[${section}]`, JSON.stringify(row));
}

async function listDayLogPngs(): Promise<string[]> {
  if (!existsSync(DAYLOG_DIR)) return [];
  const names = await readdir(DAYLOG_DIR);
  return names
    .filter((n) => n.endsWith(".png"))
    .sort()
    .map((n) => join(DAYLOG_DIR, n));
}

async function measureBoot(kind: "cold" | "warm"): Promise<number> {
  stopVisionSidecar();
  if (kind === "cold") {
    // Best-effort: pause so prior process teardown settles. True disk-cold needs
    // admin standby-list flush; note OS page cache may still be warm.
    await new Promise((r) => setTimeout(r, 3000));
  }
  const t0 = Date.now();
  await ensureVisionSidecar({ imageMaxTokens: 1024, ctxSize: 4096 });
  return Date.now() - t0;
}

async function runCliBaseline(options: {
  imagePath: string;
  imageMaxTokens: number;
  prompt: string;
}): Promise<{
  wallMs: number;
  encodeMs: number | null;
  exitCode: number | null;
  text: string;
  stderrTail: string;
}> {
  const mtmd =
    resolveLlamaServerBinary()?.replace(/llama-server(\.exe)?$/i, "llama-mtmd-cli$1") ?? null;
  const model = await resolveVisionLmPath();
  const mmproj = resolveVisionMmprojPath();
  if (!mtmd || !existsSync(mtmd) || !model || !mmproj) {
    throw new Error("mtmd-cli / model / mmproj missing for CLI baseline");
  }

  const args = [
    "-m",
    model,
    "--mmproj",
    mmproj,
    "--image",
    options.imagePath,
    "-p",
    options.prompt,
    "-n",
    "256",
    "-ngl",
    "0",
    "-c",
    "4096",
    "--temp",
    "0.1",
    "--image-min-tokens",
    String(Math.min(1024, options.imageMaxTokens)),
    "--image-max-tokens",
    String(options.imageMaxTokens),
  ];

  const t0 = Date.now();
  const result = await new Promise<{
    code: number | null;
    stdout: string;
    stderr: string;
  }>((resolve) => {
    const proc = spawn(mtmd, args, { windowsHide: true });
    let stdout = "";
    let stderr = "";
    proc.stdout.on("data", (d) => {
      stdout += String(d);
    });
    proc.stderr.on("data", (d) => {
      stderr += String(d);
    });
    proc.on("close", (code) => resolve({ code, stdout, stderr }));
  });
  const wallMs = Date.now() - t0;
  const encodeMatch = result.stderr.match(/mtmd batch encoding done in (\d+)\s*ms/i);
  const encodeMs = encodeMatch ? Number(encodeMatch[1]) : null;
  const text = result.stdout.trim();
  return {
    wallMs,
    encodeMs,
    exitCode: result.code,
    text,
    stderrTail: result.stderr.slice(-800),
  };
}

async function main(): Promise<void> {
  await mkdir(OUT_DIR, { recursive: true });
  resetVisionSidecarForTests();
  process.env.REDROB_VISION_NGL = process.env.REDROB_VISION_NGL ?? "0";

  const probeRaw = await readFile(PROBE_RAW);
  const probePrepared = await prepareImageForModel(probeRaw);
  const preparedPath = join(OUT_DIR, "bench-probe.prepared.png");
  await writeFile(preparedPath, probePrepared);

  const daylog = await listDayLogPngs();
  console.log("assets", {
    probeRaw: PROBE_RAW,
    daylogCount: daylog.length,
    server: resolveLlamaServerBinary(),
    mmproj: resolveVisionMmprojPath(),
    lm: await resolveVisionLmPath(),
  });

  // --- 0) Boot cold then warm (process restart; disk may stay OS-cached) ---
  console.log("\n=== boot cold/warm ===");
  const coldMs = await measureBoot("cold");
  push("boot", {
    kind: "cold",
    note: "first ensure after stop+3s; OS page cache may still be warm",
    ms: coldMs,
  });
  stopVisionSidecar();
  const warmMs = await measureBoot("warm");
  push("boot", {
    kind: "warm",
    note: "kill then immediate ensure (LM+mmproj likely in OS cache)",
    ms: warmMs,
  });

  // Keep server for token-budget runs
  await ensureVisionSidecar({ imageMaxTokens: 1024, ctxSize: 4096 });

  // --- 1) Token budgets 512 / 1024 / 2048 (canary attr extract, trim on) ---
  console.log("\n=== token budgets (trim on, 1 image) ===");
  for (const budget of [512, 1024, 2048] as const) {
    const result = await generateVisionChat({
      prompt: ATTR_PROMPT,
      images: [{ mimeType: "image/png", bytes: probeRaw }],
      maxTokens: 64,
      temperature: 0.1,
      prepareImages: true,
      sidecar: {
        imageMaxTokens: budget,
        imageMinTokens: Math.min(budget, 1024),
        ctxSize: Math.max(4096, budget + 2048),
      },
    });
    const ok = result.text.includes("ZEBRA-7741");
    push("budget", {
      imageMaxTokens: budget,
      trim: true,
      ok,
      text: result.text.slice(0, 80),
      prompt_ms: result.timings?.promptMs ?? null,
      predicted_ms: result.timings?.predictedMs ?? null,
      prompt_n: result.timings?.promptTokens ?? null,
      predicted_n: result.timings?.predictedTokens ?? null,
      wall_ms: result.wallMs,
      prompt_tok_s: result.timings?.promptTokensPerSecond ?? null,
      decode_tok_s: result.timings?.predictedTokensPerSecond ?? null,
    });
  }

  // --- 2) Trim on vs off @ 1024 ---
  console.log("\n=== trim on/off @ 1024 ===");
  for (const trim of [true, false] as const) {
    const result = await generateVisionChat({
      prompt: ATTR_PROMPT,
      images: [{ mimeType: "image/png", bytes: probeRaw }],
      maxTokens: 64,
      temperature: 0.1,
      prepareImages: trim,
      sidecar: { imageMaxTokens: 1024, ctxSize: 4096 },
    });
    push("trim", {
      trim,
      ok: result.text.includes("ZEBRA-7741"),
      text: result.text.slice(0, 80),
      prompt_ms: result.timings?.promptMs ?? null,
      predicted_ms: result.timings?.predictedMs ?? null,
      prompt_n: result.timings?.promptTokens ?? null,
      wall_ms: result.wallMs,
    });
  }

  // --- 3) Pages 1 / 5 / 10 wall-clock @ 1024, trim on ---
  console.log("\n=== pages wall-clock ===");
  if (daylog.length === 0) {
    push("pages", { error: "no day-log captures found", dir: DAYLOG_DIR });
  } else {
    const pool = [...daylog];
    while (pool.length < 10) pool.push(daylog[pool.length % daylog.length]!);
    for (const n of [1, 5, 10] as const) {
      const paths = pool.slice(0, n);
      const images = [];
      for (const p of paths) {
        images.push({ mimeType: "image/png" as const, bytes: await readFile(p) });
      }
      const ctxSize = Math.max(16_384, n * 1024 + 4096);
      const t0 = Date.now();
      try {
        const result = await generateVisionChat({
          prompt: MULTI_PROMPT,
          images,
          maxTokens: 256,
          temperature: 0.2,
          prepareImages: true,
          sidecar: { imageMaxTokens: 1024, ctxSize },
        });
        push("pages", {
          pages: n,
          ok: result.text.length > 0,
          text_preview: result.text.replace(/\s+/g, " ").slice(0, 120),
          wall_ms: Date.now() - t0,
          http_wall_ms: result.wallMs,
          prompt_ms: result.timings?.promptMs ?? null,
          predicted_ms: result.timings?.predictedMs ?? null,
          prompt_n: result.timings?.promptTokens ?? null,
          predicted_n: result.timings?.predictedTokens ?? null,
          reused_captures: n > daylog.length,
        });
      } catch (err) {
        push("pages", {
          pages: n,
          ok: false,
          error: err instanceof Error ? err.message : String(err),
          wall_ms: Date.now() - t0,
        });
      }
    }
  }

  // --- 4) CLI baseline same prepared image @ budgets (isolate sidecar vs encode) ---
  console.log("\n=== CLI baseline (mtmd) ===");
  stopVisionSidecar();
  for (const budget of [512, 1024, 2048] as const) {
    const cli = await runCliBaseline({
      imagePath: preparedPath,
      imageMaxTokens: budget,
      prompt: ATTR_PROMPT,
    });
    push("cli_baseline", {
      imageMaxTokens: budget,
      trim: true,
      path: "llama-mtmd-cli",
      ok: cli.text.includes("ZEBRA-7741"),
      text: cli.text.replace(/\s+/g, " ").slice(0, 80),
      encode_ms: cli.encodeMs,
      wall_ms: cli.wallMs,
      // decode ≈ wall - encode when encode known (includes model load on cold CLI)
      decode_proxy_ms:
        cli.encodeMs != null ? Math.max(0, cli.wallMs - cli.encodeMs) : null,
      exit: cli.exitCode,
    });
  }

  // Sidecar vs CLI at 1024 on same prepared bytes (sidecar already trimmed path)
  stopVisionSidecar();
  await ensureVisionSidecar({ imageMaxTokens: 1024, ctxSize: 4096 });
  const side = await generateVisionChat({
    prompt: ATTR_PROMPT,
    images: [{ mimeType: "image/png", bytes: probePrepared }],
    maxTokens: 64,
    temperature: 0.1,
    prepareImages: false, // already prepared file
    sidecar: { imageMaxTokens: 1024, ctxSize: 4096 },
  });
  push("sidecar_vs_cli", {
    imageMaxTokens: 1024,
    path: "llama-server sidecar",
    ok: side.text.includes("ZEBRA-7741"),
    prompt_ms_prefill: side.timings?.promptMs ?? null,
    predicted_ms_decode: side.timings?.predictedMs ?? null,
    wall_ms: side.wallMs,
    note: "prefill includes vision encode + LM prompt eval; compare encode_ms on CLI row",
  });

  // Canary with/without image still diverge at 512 (branch point)
  const a512 = await generateVisionChat({
    prompt: CANARY_PROMPT,
    images: [{ mimeType: "image/png", bytes: probeRaw }],
    maxTokens: 64,
    temperature: 0.1,
    prepareImages: true,
    sidecar: { imageMaxTokens: 512, imageMinTokens: 512, ctxSize: 4096 },
  });
  let b512 = "";
  try {
    const b = await generateVisionChat({
      prompt: CANARY_PROMPT,
      images: [],
      maxTokens: 64,
      temperature: 0.1,
      sidecar: { imageMaxTokens: 512, imageMinTokens: 512, ctxSize: 4096 },
    });
    b512 = b.text;
  } catch (err) {
    b512 = `THREW:${err instanceof Error ? err.message : String(err)}`;
  }
  push("canary_512", {
    a_ok: a512.text.includes("ZEBRA-7741"),
    a_text: a512.text.slice(0, 80),
    b_has_zebra: b512.includes("ZEBRA-7741"),
    b_text: b512.slice(0, 120),
    diverge: a512.text.includes("ZEBRA-7741") && !b512.includes("ZEBRA-7741"),
    prompt_ms: a512.timings?.promptMs ?? null,
    predicted_ms: a512.timings?.predictedMs ?? null,
  });

  const md = renderMarkdown(rows, { coldMs, warmMs });
  const mdPath = join(OUT_DIR, "BENCH.md");
  const jsonPath = join(OUT_DIR, "bench.json");
  await writeFile(mdPath, md, "utf8");
  await writeFile(jsonPath, `${JSON.stringify(rows, null, 2)}\n`, "utf8");
  console.log("\nWrote", mdPath);
  console.log(md);
}

function renderMarkdown(
  data: { section: string; row: Row }[],
  boot: { coldMs: number; warmMs: number },
): string {
  const lines: string[] = [
    "# Qwen3.5-4B vision sidecar bench (CPU)",
    "",
    `Date: ${new Date().toISOString()}`,
    "ngl=0, `--reasoning off`, mmproj=`qwen35-4b-mmproj/mmproj-F16.gguf`",
    "",
    "## Sidecar boot (process cold vs warm)",
    "",
    "| kind | wall | note |",
    "|---|---|---|",
    `| cold | ${ms(boot.coldMs)} | stop+3s then first /health; OS file cache may still be warm |`,
    `| warm | ${ms(boot.warmMs)} | kill then immediate restart (LM+mmproj in OS cache) |`,
    "",
  ];

  const by = (section: string) => data.filter((d) => d.section === section).map((d) => d.row);

  lines.push("## Token budget × attr extract (trim on, 1× canary)");
  lines.push("");
  lines.push(
    "| image-max-tokens | ZEBRA ok | prefill (prompt_ms) | decode (predicted_ms) | prompt_n | wall |",
  );
  lines.push("|---|---|---|---|---|---|");
  for (const r of by("budget")) {
    lines.push(
      `| ${r.imageMaxTokens} | ${r.ok} | ${ms(r.prompt_ms as number)} | ${ms(r.predicted_ms as number)} | ${r.prompt_n ?? "—"} | ${ms(r.wall_ms as number)} |`,
    );
  }
  lines.push("");
  lines.push(
    "> Branch point: **512** must keep attr extract (`ZEBRA-7741`). If false, product floor is 1024+.",
  );
  lines.push("");

  lines.push("## Trim on vs off (`image-max-tokens=1024`)");
  lines.push("");
  lines.push("| trim | ZEBRA ok | prefill | decode | prompt_n | wall |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of by("trim")) {
    lines.push(
      `| ${r.trim} | ${r.ok} | ${ms(r.prompt_ms as number)} | ${ms(r.predicted_ms as number)} | ${r.prompt_n ?? "—"} | ${ms(r.wall_ms as number)} |`,
    );
  }
  lines.push("");

  lines.push("## Pages wall-clock (`image-max-tokens=1024`, trim on)");
  lines.push("");
  lines.push("| pages | ok | prefill | decode | prompt_n | total wall |");
  lines.push("|---|---|---|---|---|---|");
  for (const r of by("pages")) {
    if (r.error) {
      lines.push(`| ${r.pages ?? "—"} | false | — | — | — | ${ms(r.wall_ms as number)} (${r.error}) |`);
    } else {
      lines.push(
        `| ${r.pages} | ${r.ok} | ${ms(r.prompt_ms as number)} | ${ms(r.predicted_ms as number)} | ${r.prompt_n ?? "—"} | ${ms(r.wall_ms as number)} |`,
      );
    }
  }
  lines.push("");

  lines.push("## CLI baseline (`llama-mtmd-cli`, same prepared canary)");
  lines.push("");
  lines.push(
    "| image-max-tokens | ZEBRA ok | vision encode (stderr) | wall−encode (proxy) | total wall |",
  );
  lines.push("|---|---|---|---|---|");
  for (const r of by("cli_baseline")) {
    lines.push(
      `| ${r.imageMaxTokens} | ${r.ok} | ${ms(r.encode_ms as number)} | ${ms(r.decode_proxy_ms as number)} | ${ms(r.wall_ms as number)} |`,
    );
  }
  lines.push("");
  lines.push(
    "CLI wall includes **model load** each run; encode_ms is the vision batch only. Sidecar `prompt_ms` is encode+prompt eval with weights already resident.",
  );
  lines.push("");

  for (const r of by("sidecar_vs_cli")) {
    lines.push("## Sidecar same prepared image @ 1024 (weights resident)");
    lines.push("");
    lines.push(
      `| path | ok | prefill | decode | http wall |\n|---|---|---|---|---|\n| sidecar | ${r.ok} | ${ms(r.prompt_ms_prefill as number)} | ${ms(r.predicted_ms_decode as number)} | ${ms(r.wall_ms as number)} |`,
    );
    lines.push("");
  }

  for (const r of by("canary_512")) {
    lines.push("## Canary diverge @ 512");
    lines.push("");
    lines.push(
      `- A (image): \`${r.a_text}\` ok=${r.a_ok} prefill=${ms(r.prompt_ms as number)} decode=${ms(r.predicted_ms as number)}`,
    );
    lines.push(`- B (no image): \`${r.b_text}\` zebra=${r.b_has_zebra}`);
    lines.push(`- diverge=${r.diverge}`);
    lines.push("");
  }

  return `${lines.join("\n")}\n`;
}

main()
  .catch((err) => {
    console.error(err);
    process.exitCode = 1;
  })
  .finally(() => {
    shutdownVisionSidecar();
  });
