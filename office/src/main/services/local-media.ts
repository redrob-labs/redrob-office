import { readFile } from "node:fs/promises";
import { extname, isAbsolute, relative, resolve } from "node:path";

/**
 * Screenshots live under userData. The Vite renderer is http://, so file://
 * URLs never paint — hand back a data URL the img tag can actually show.
 */
export function isUnderDir(filePath: string, root: string): boolean {
  const resolved = resolve(filePath);
  const base = resolve(root);
  const rel = relative(base, resolved);
  return rel !== "" && !rel.startsWith("..") && !isAbsolute(rel);
}

function mimeOf(filePath: string): string | null {
  const ext = extname(filePath).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".jpg" || ext === ".jpeg") return "image/jpeg";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  if (ext === ".webm") return "video/webm";
  if (ext === ".mp4") return "video/mp4";
  return null;
}

export async function readLocalMediaDataUrl(
  filePath: string,
  allowedRoots: readonly string[],
): Promise<{ dataUrl: string; mime: string } | null> {
  const trimmed = filePath.trim();
  if (!trimmed) return null;
  if (!allowedRoots.some((root) => isUnderDir(trimmed, root))) return null;
  const mime = mimeOf(trimmed);
  if (!mime) return null;
  const bytes = await readFile(resolve(trimmed));
  return {
    mime,
    dataUrl: `data:${mime};base64,${bytes.toString("base64")}`,
  };
}
