import { writeFile } from "node:fs/promises";

import type { FilledSlot } from "../slots.js";
import { escapeHtml, findSlot, markdownFromSlots } from "../slots.js";

export async function renderMarkdown(path: string, filled: FilledSlot[]): Promise<void> {
  await writeFile(path, markdownFromSlots(filled), "utf8");
}

export async function renderJson(path: string, filled: FilledSlot[]): Promise<void> {
  const payload = Object.fromEntries(filled.map((slot) => [slot.id, slot.value]));
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`, "utf8");
}

export async function renderHtml(path: string, filled: FilledSlot[]): Promise<void> {
  const title = findSlot(filled, "title") ?? "Diagram";
  const mermaid = findSlot(filled, "mermaid") ?? findSlot(filled, "diagram");
  const notes = findSlot(filled, "notes");

  if (mermaid?.trim()) {
    const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    :root { color-scheme: light; }
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
    main { max-width: 56rem; margin: 0 auto; padding: 2rem 1.25rem 3rem; }
    h1 { font-size: 1.5rem; font-weight: 650; letter-spacing: -0.02em; margin: 0 0 1.25rem; }
    .diagram { background: #fff; border: 1px solid #e2e8f0; border-radius: 0.75rem; padding: 1.25rem; overflow: auto; }
    .notes { margin-top: 1.25rem; white-space: pre-wrap; line-height: 1.5; color: #475569; font-size: 0.95rem; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    <div class="diagram">
      <pre class="mermaid">${escapeHtml(mermaid.trim())}</pre>
    </div>
    ${notes?.trim() ? `<p class="notes">${escapeHtml(notes.trim())}</p>` : ""}
  </main>
  <script type="module">
    import mermaid from "https://cdn.jsdelivr.net/npm/mermaid@11/dist/mermaid.esm.min.mjs";
    mermaid.initialize({ startOnLoad: true, securityLevel: "strict" });
  </script>
</body>
</html>
`;
    await writeFile(path, html, "utf8");
    return;
  }

  const sections = filled
    .filter((slot) => slot.id !== "title")
    .map(
      (slot) =>
        `<section><h2>${escapeHtml(slot.label)}</h2><pre>${escapeHtml(slot.value)}</pre></section>`,
    )
    .join("\n");
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(title)}</title>
  <style>
    body { margin: 0; font-family: "Segoe UI", system-ui, sans-serif; background: #f8fafc; color: #0f172a; }
    main { max-width: 48rem; margin: 0 auto; padding: 2rem 1.25rem; }
    h1 { font-size: 1.5rem; margin: 0 0 1rem; }
    h2 { font-size: 1rem; margin: 1.25rem 0 0.5rem; color: #334155; }
    pre { white-space: pre-wrap; background: #fff; border: 1px solid #e2e8f0; border-radius: 0.5rem; padding: 0.75rem 1rem; }
  </style>
</head>
<body>
  <main>
    <h1>${escapeHtml(title)}</h1>
    ${sections}
  </main>
</body>
</html>
`;
  await writeFile(path, html, "utf8");
}

export async function renderSvg(path: string, filled: FilledSlot[]): Promise<void> {
  const raw = findSlot(filled, "svg") ?? findSlot(filled, "markup");
  if (raw && /<svg[\s>]/i.test(raw.trim())) {
    await writeFile(path, `${raw.trim()}\n`, "utf8");
    return;
  }

  const title = findSlot(filled, "title") ?? "Asset";
  const body = (raw ?? findSlot(filled, "description") ?? title).trim();
  const width = Number(findSlot(filled, "width") ?? "640") || 640;
  const height = Number(findSlot(filled, "height") ?? "360") || 360;
  const lines = body.split(/\r?\n/).slice(0, 12);
  const textNodes = lines
    .map((line, index) => {
      const y = 64 + index * 28;
      return `  <text x="32" y="${y}" font-family="Segoe UI, system-ui, sans-serif" font-size="18" fill="#0f172a">${escapeXmlLine(line)}</text>`;
    })
    .join("\n");
  const svg = `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" role="img" aria-label="${escapeXmlLine(title)}">
  <rect width="100%" height="100%" fill="#f8fafc"/>
  <rect x="16" y="16" width="${width - 32}" height="${height - 32}" rx="12" fill="#ffffff" stroke="#e2e8f0"/>
  <text x="32" y="48" font-family="Segoe UI, system-ui, sans-serif" font-size="22" font-weight="600" fill="#0f172a">${escapeXmlLine(title)}</text>
${textNodes}
</svg>
`;
  await writeFile(path, svg, "utf8");
}

function escapeXmlLine(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}
