/**
 * A chart drawn as an SVG, from the numbers and their labels alone.
 *
 * The office suite drew these before; the numbers a chart carries are enough to
 * draw it again without one. Column and bar for comparisons, line for a trend,
 * pie for a share of a whole — the four a spreadsheet actually produces.
 */
import type { XlsxChartView } from "../doc-render.js";
import { escapeHtml } from "./escape.js";

const PALETTE = [
  "#2563eb",
  "#16a34a",
  "#f59e0b",
  "#dc2626",
  "#7c3aed",
  "#0891b2",
  "#db2777",
  "#65a30d",
];

const W = 640;
const H = 360;

function niceMax(value: number): number {
  if (value <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(value)));
  const n = value / pow;
  const step = n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10;
  return step * pow;
}

function fmt(n: number): string {
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, "");
}

function title(chart: XlsxChartView): string {
  if (!chart.title) return "";
  return `<text x="${W / 2}" y="24" text-anchor="middle" font-size="16" font-weight="600" fill="#111827">${escapeHtml(chart.title)}</text>`;
}

function legend(chart: XlsxChartView): string {
  if (chart.series.length < 2) return "";
  const items = chart.series
    .map((s, i) => {
      const x = 60 + i * 140;
      const color = PALETTE[i % PALETTE.length];
      return `<rect x="${x}" y="${H - 20}" width="12" height="12" fill="${color}"/><text x="${x + 16}" y="${H - 10}" font-size="12" fill="#374151">${escapeHtml(s.name)}</text>`;
    })
    .join("");
  return items;
}

function axes(maxY: number, plot: Plot): string {
  const ticks = 4;
  let out = `<line x1="${plot.left}" y1="${plot.top}" x2="${plot.left}" y2="${plot.bottom}" stroke="#9ca3af"/><line x1="${plot.left}" y1="${plot.bottom}" x2="${plot.right}" y2="${plot.bottom}" stroke="#9ca3af"/>`;
  for (let i = 0; i <= ticks; i += 1) {
    const v = (maxY / ticks) * i;
    const y = plot.bottom - (plot.bottom - plot.top) * (i / ticks);
    out += `<line x1="${plot.left - 4}" y1="${y}" x2="${plot.left}" y2="${y}" stroke="#9ca3af"/><text x="${plot.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${fmt(v)}</text>`;
  }
  return out;
}

interface Plot {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

const PLOT: Plot = { left: 56, right: W - 24, top: 40, bottom: H - 40 };

function categoryLabels(categories: string[], plot: Plot): string {
  const band = (plot.right - plot.left) / Math.max(1, categories.length);
  return categories
    .map((c, i) => {
      const x = plot.left + band * (i + 0.5);
      return `<text x="${x}" y="${plot.bottom + 16}" text-anchor="middle" font-size="11" fill="#6b7280">${escapeHtml(c)}</text>`;
    })
    .join("");
}

function columns(chart: XlsxChartView, maxY: number, plot: Plot): string {
  const groups = chart.categories.length;
  const band = (plot.right - plot.left) / Math.max(1, groups);
  const per = chart.series.length;
  const barW = (band * 0.7) / Math.max(1, per);
  const height = plot.bottom - plot.top;
  let out = "";
  for (let g = 0; g < groups; g += 1) {
    for (let s = 0; s < per; s += 1) {
      const value = chart.series[s]?.values[g] ?? 0;
      const h = maxY > 0 ? (Math.max(0, value) / maxY) * height : 0;
      const x = plot.left + band * g + band * 0.15 + s * barW;
      const y = plot.bottom - h;
      out += `<rect x="${x.toFixed(1)}" y="${y.toFixed(1)}" width="${barW.toFixed(1)}" height="${h.toFixed(1)}" fill="${PALETTE[s % PALETTE.length]}"/>`;
    }
  }
  return out;
}

function bars(chart: XlsxChartView, maxY: number, plot: Plot): string {
  // Horizontal: categories down the side, value along the bottom.
  const groups = chart.categories.length;
  const band = (plot.bottom - plot.top) / Math.max(1, groups);
  const per = chart.series.length;
  const barH = (band * 0.7) / Math.max(1, per);
  const width = plot.right - plot.left;
  let out = "";
  for (let g = 0; g < groups; g += 1) {
    for (let s = 0; s < per; s += 1) {
      const value = chart.series[s]?.values[g] ?? 0;
      const w = maxY > 0 ? (Math.max(0, value) / maxY) * width : 0;
      const y = plot.top + band * g + band * 0.15 + s * barH;
      out += `<rect x="${plot.left}" y="${y.toFixed(1)}" width="${w.toFixed(1)}" height="${barH.toFixed(1)}" fill="${PALETTE[s % PALETTE.length]}"/>`;
    }
  }
  return out;
}

function line(chart: XlsxChartView, maxY: number, plot: Plot): string {
  const groups = chart.categories.length;
  const band = (plot.right - plot.left) / Math.max(1, groups);
  const height = plot.bottom - plot.top;
  return chart.series
    .map((s, si) => {
      const points = s.values
        .map((value, g) => {
          const x = plot.left + band * (g + 0.5);
          const y = plot.bottom - (maxY > 0 ? (value / maxY) * height : 0);
          return `${x.toFixed(1)},${y.toFixed(1)}`;
        })
        .join(" ");
      const color = PALETTE[si % PALETTE.length];
      const dots = s.values
        .map((value, g) => {
          const x = plot.left + band * (g + 0.5);
          const y = plot.bottom - (maxY > 0 ? (value / maxY) * height : 0);
          return `<circle cx="${x.toFixed(1)}" cy="${y.toFixed(1)}" r="3" fill="${color}"/>`;
        })
        .join("");
      return `<polyline points="${points}" fill="none" stroke="${color}" stroke-width="2"/>${dots}`;
    })
    .join("");
}

function pie(chart: XlsxChartView): string {
  const values = chart.series[0]?.values ?? [];
  const total = values.reduce((a, b) => a + Math.max(0, b), 0);
  const cx = W / 2;
  const cy = H / 2;
  const r = 120;
  if (total <= 0) return "";
  let angle = -Math.PI / 2;
  let out = "";
  values.forEach((value, i) => {
    const slice = (Math.max(0, value) / total) * Math.PI * 2;
    const x1 = cx + r * Math.cos(angle);
    const y1 = cy + r * Math.sin(angle);
    angle += slice;
    const x2 = cx + r * Math.cos(angle);
    const y2 = cy + r * Math.sin(angle);
    const large = slice > Math.PI ? 1 : 0;
    out += `<path d="M ${cx} ${cy} L ${x1.toFixed(1)} ${y1.toFixed(1)} A ${r} ${r} 0 ${large} 1 ${x2.toFixed(1)} ${y2.toFixed(1)} Z" fill="${PALETTE[i % PALETTE.length]}"/>`;
  });
  const key = chart.categories
    .map((c, i) => {
      const y = 60 + i * 20;
      return `<rect x="${W - 150}" y="${y}" width="12" height="12" fill="${PALETTE[i % PALETTE.length]}"/><text x="${W - 132}" y="${y + 11}" font-size="12" fill="#374151">${escapeHtml(c)}</text>`;
    })
    .join("");
  return out + key;
}

export function chartSvg(chart: XlsxChartView): string {
  const flat = chart.series.flatMap((s) => s.values);
  const maxY = niceMax(Math.max(0, ...flat));
  let body: string;
  if (chart.type === "pie") {
    body = pie(chart);
  } else if (chart.type === "bar") {
    body =
      axes(maxY, PLOT) +
      bars(chart, maxY, PLOT) +
      chart.categories
        .map((c, i) => {
          const band = (PLOT.bottom - PLOT.top) / Math.max(1, chart.categories.length);
          const y = PLOT.top + band * (i + 0.5);
          return `<text x="${PLOT.left - 8}" y="${y + 4}" text-anchor="end" font-size="11" fill="#6b7280">${escapeHtml(c)}</text>`;
        })
        .join("") +
      legend(chart);
  } else if (chart.type === "line") {
    body =
      axes(maxY, PLOT) + line(chart, maxY, PLOT) + categoryLabels(chart.categories, PLOT) + legend(chart);
  } else {
    body =
      axes(maxY, PLOT) +
      columns(chart, maxY, PLOT) +
      categoryLabels(chart.categories, PLOT) +
      legend(chart);
  }
  return `<svg viewBox="0 0 ${W} ${H}" width="${W}" height="${H}" xmlns="http://www.w3.org/2000/svg" role="img">${title(chart)}${body}</svg>`;
}
