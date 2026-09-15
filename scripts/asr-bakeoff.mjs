#!/usr/bin/env node
/**
 * ASR bake-off helper — fill docs/asr-voice.md table when whisper.cpp + 2 KO wavs exist.
 * Usage: node scripts/asr-bakeoff.mjs path/to/a.wav path/to/b.wav
 */
import { spawnSync } from "node:child_process";
import { existsSync } from "node:fs";

const wavs = process.argv.slice(2);
if (wavs.length < 2) {
  console.error("Usage: node scripts/asr-bakeoff.mjs clipA.wav clipB.wav");
  process.exit(1);
}

const binary = process.env.REDROB_WHISPER_CLI ?? "whisper-cli";
const models = [
  { id: "small", path: process.env.REDROB_WHISPER_SMALL ?? "ggml-small.bin" },
  { id: "large-v3-turbo", path: process.env.REDROB_WHISPER_TURBO ?? "ggml-large-v3-turbo.bin" },
];

console.log("binary", binary, existsSync(binary) || binary);
for (const model of models) {
  for (const wav of wavs) {
    const started = Date.now();
    const result = spawnSync(binary, ["-m", model.path, "-l", "ko", "-f", wav], {
      encoding: "utf8",
      maxBuffer: 20 * 1024 * 1024,
    });
    const ms = Date.now() - started;
    console.log(
      JSON.stringify({
        model: model.id,
        wav,
        exit: result.status,
        ms,
        stderrTail: (result.stderr ?? "").slice(-400),
        stdoutTail: (result.stdout ?? "").slice(-400),
      }),
    );
  }
}
