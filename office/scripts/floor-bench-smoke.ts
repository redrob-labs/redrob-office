/** Smallest possible check that Electron can boot a TypeScript entry point. */
import { app } from "electron";
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";

const out = join(tmpdir(), "redrob-floor-smoke.txt");

void app.whenReady().then(() => {
  writeFileSync(out, `electron ${process.versions["electron"]} node ${process.versions.node}\n`);
  console.log(`smoke ok -> ${out}`);
  app.exit(0);
});
