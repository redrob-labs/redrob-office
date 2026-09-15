import { readdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { pathToFileURL } from "node:url";

async function loadCatalog(rel) {
  const url = pathToFileURL(join(process.cwd(), rel)).href;
  const mod = await import(url);
  return mod.en ?? mod.ko ?? mod.default;
}

function flatten(tree, prefix = "") {
  const out = [];
  for (const [k, v] of Object.entries(tree)) {
    const p = prefix ? `${prefix}.${k}` : k;
    if (typeof v === "string") out.push([p, v]);
    else out.push(...flatten(v, p));
  }
  return out;
}

function hasPath(tree, path) {
  const parts = path.split(".");
  let cur = tree;
  for (const part of parts) {
    if (!cur || typeof cur === "string" || !(part in cur)) return false;
    cur = cur[part];
  }
  return typeof cur === "string";
}

async function walk(dir) {
  const entries = await readdir(dir, { withFileTypes: true });
  const files = [];
  for (const e of entries) {
    const p = join(dir, e.name);
    if (e.isDirectory()) files.push(...(await walk(p)));
    else if (/\.(tsx?|jsx?)$/.test(e.name)) files.push(p);
  }
  return files;
}

const en = (await import(pathToFileURL(join(process.cwd(), "packages/ui/dist/i18n/en.js")).href)).en;
const ko = (await import(pathToFileURL(join(process.cwd(), "packages/ui/dist/i18n/ko.js")).href)).ko;

const files = (
  await Promise.all([
    walk("office/src/renderer/src"),
    walk("packages/ui/src"),
  ])
).flat();

const used = new Set();
const dynamic = new Set();
const keyRe = /\bt\(\s*["']([^"']+)["']/g;
const propRe = /(titleKey|bodyKey)=["']([^"']+)["']/g;
const dynRe = /\bt\(\s*`([^`]+)`/g;

for (const file of files) {
  const text = await readFile(file, "utf8");
  let m;
  while ((m = keyRe.exec(text))) used.add(m[1]);
  while ((m = propRe.exec(text))) used.add(m[2]);
  while ((m = dynRe.exec(text))) {
    if (m[1].includes("${")) dynamic.add(`${file.replaceAll("\\", "/")}: \`${m[1]}\``);
  }
}

const missingEn = [...used].filter((k) => !hasPath(en, k)).sort();
const missingKo = [...used].filter((k) => !hasPath(ko, k)).sort();
const enEntries = flatten(en);
const koMap = Object.fromEntries(flatten(ko));
const emptyKo = enEntries.filter(([k, v]) => !(koMap[k] ?? "").trim()).map(([k]) => k);
const emptyEn = enEntries.filter(([, v]) => !v.trim()).map(([k]) => k);

let distOk = true;
let distMsg = "";
try {
  const enDist = (await import(pathToFileURL(join(process.cwd(), "packages/ui/dist/i18n/en.js")).href)).en;
  const koDist = (await import(pathToFileURL(join(process.cwd(), "packages/ui/dist/i18n/ko.js")).href)).ko;
  const srcKeys = flatten(en).map(([k]) => k).sort();
  const distKeys = flatten(enDist).map(([k]) => k).sort();
  const onlySrc = srcKeys.filter((k) => !distKeys.includes(k));
  const onlyDist = distKeys.filter((k) => !srcKeys.includes(k));
  const koDistKeys = new Set(flatten(koDist).map(([k]) => k));
  const missingKoDist = srcKeys.filter((k) => !koDistKeys.has(k));
  if (onlySrc.length || onlyDist.length || missingKoDist.length) {
    distOk = false;
    distMsg = [
      onlySrc.length ? `src-only: ${onlySrc.join(", ")}` : "",
      onlyDist.length ? `dist-only: ${onlyDist.join(", ")}` : "",
      missingKoDist.length ? `missing in dist ko: ${missingKoDist.join(", ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
  }
} catch (err) {
  distOk = false;
  distMsg = `dist missing or unreadable: ${err instanceof Error ? err.message : String(err)}`;
}

console.log(`literal t()/titleKey/bodyKey: ${used.size}`);
console.log("missing in en:", missingEn.length ? missingEn.join(", ") : "(none)");
console.log("missing in ko:", missingKo.length ? missingKo.join(", ") : "(none)");
console.log("empty en:", emptyEn.length ? emptyEn.join(", ") : "(none)");
console.log("empty ko:", emptyKo.length ? emptyKo.join(", ") : "(none)");
console.log("dynamic t():");
console.log([...dynamic].join("\n") || "(none)");
console.log("dist sync:", distOk ? "ok" : "STALE");
if (!distOk) console.log(distMsg);

const failed =
  missingEn.length ||
  missingKo.length ||
  emptyEn.length ||
  emptyKo.length ||
  !distOk;
process.exit(failed ? 1 : 0);
