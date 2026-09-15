/**
 * Whether a bare word the editor spotted should become a link.
 *
 * The rule that finds links looks for a dot followed by something that could
 * be a country, and a great many file names fit: `launch-notes.md` is Moldova,
 * `main.rs` is Serbia. In an app where people ask for documents by name, that
 * turned half the things they typed into links to nowhere. A word ending in a
 * file extension is a file, and a link has to earn it.
 */

const FILE_SUFFIXES = new Set([
  "markdown",
  "md",
  "txt",
  "rtf",
  "pdf",
  "doc",
  "docx",
  "xls",
  "xlsx",
  "ppt",
  "pptx",
  "hwp",
  "hwpx",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "xml",
  "html",
  "htm",
  "png",
  "jpg",
  "jpeg",
  "gif",
  "svg",
  "webp",
  "ico",
  "zip",
  "tar",
  "gz",
  "rar",
  "log",
  "sql",
  "ini",
  "toml",
  "env",
  "exe",
  "dmg",
  "mp3",
  "mp4",
  "mov",
  "webm",
  "wav",
  "py",
  "rb",
  "rs",
  "java",
  "ts",
  "tsx",
  "jsx",
  "css",
  "scss",
  "sh",
]);

export function looksLikeALink(url: string): boolean {
  const withoutScheme = url.replace(/^[a-z][a-z0-9+.-]*:\/\//i, "");
  const host = withoutScheme.split(/[/?#]/)[0] ?? "";
  const suffix = host.split(".").pop()?.toLowerCase() ?? "";
  // A path says the writer meant an address: example.md/notes is a site.
  if (withoutScheme.length > host.length) return true;
  return !FILE_SUFFIXES.has(suffix);
}
