// Compare what two engines paint, independent of how runs are grouped.
//
// The engine's layer tree records text runs as they sit in the model, and the
// grouping depends on edit history: "가나" + "다" is one run here and two there,
// yet the glyphs land on the same pixels. So convergence is judged on glyphs:
// every character with its absolute position and its run's style, plus every
// non-text paint op as is.

interface Cluster {
  textRangeUtf16: { start: number; end: number }
  origin: { x: number; y: number }
}

interface TextRunOp {
  type: 'textRun'
  text: string
  placement?: { runToPage?: { a: number; b: number; c: number; d: number; e: number; f: number } }
  clusters?: Cluster[]
  [key: string]: unknown
}

const RUN_GEOMETRY = new Set(['type', 'text', 'bbox', 'placement', 'clusters', 'sourceNodeId'])

function style(op: TextRunOp): string {
  const s: Record<string, unknown> = {}
  for (const [k, v] of Object.entries(op)) if (!RUN_GEOMETRY.has(k)) s[k] = v
  return JSON.stringify(s)
}

const round = (n: number) => Math.round(n * 1000) / 1000

/** Canonical paint of one page: sorted glyph tuples and other ops. */
export function canonicalPaint(layerTreeJson: string): string[] {
  const tree = JSON.parse(layerTreeJson) as { root: unknown }
  const out: string[] = []
  const walk = (node: { ops?: Array<Record<string, unknown>>; children?: unknown[] }) => {
    for (const op of node.ops ?? []) {
      if (op.type === 'textRun') {
        const run = op as unknown as TextRunOp
        const m = run.placement?.runToPage ?? { a: 1, b: 0, c: 0, d: 1, e: 0, f: 0 }
        const units = [...run.text]
        const st = style(run)
        for (const c of run.clusters ?? []) {
          const ch = run.text.slice(c.textRangeUtf16.start, c.textRangeUtf16.end)
          const x = m.a * c.origin.x + m.c * c.origin.y + m.e
          const y = m.b * c.origin.x + m.d * c.origin.y + m.f
          out.push(`g ${round(x)} ${round(y)} ${ch} ${st}`)
        }
        if (!run.clusters) out.push(`t ${units.join('')} ${st}`)
      } else {
        const { sourceNodeId: _id, ...rest } = op
        out.push(`o ${JSON.stringify(rest)}`)
      }
    }
    for (const c of node.children ?? []) walk(c as never)
  }
  walk(tree.root as never)
  return out.sort()
}
