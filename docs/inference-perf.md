# Inference performance (desktop)

Desktop axes are **not** Android T0/T1/T2.

## Tier axes

| Axis | Values | Role |
|------|--------|------|
| **MemTier** | `T4` / `T8` / `T16` | Model pack selection (existing) |
| **ExecTier** | `cpu` / `vulkan` / `metal` / `cuda` | llama.cpp compute backend |

Bench aggregates **MemTier × ExecTier**. Do not collapse these names.

## Phase 0 instrumentation

- CLI: `pnpm bench -- --mem-tier T4 --exec-tier cpu --quick`
- Full sweep (threads ±2 physical, mmap on/off, KV default vs Q8): omit `--quick`
- Output: local JSONL only under `bench-results/` (append). **Not** product telemetry / OTLP / SigNoz.
- Workloads: `(a)` short extract, `(b)` long extract, `(c)` prose JSON gen, `(d)` GBNF-only prompt vs fields-in-prompt accuracy (value_wrong / miss / hallucination)

### Phase timing fields

| Field | Meaning |
|-------|---------|
| `modelLoadMs` / `modelLoadCold` | Weight load; cold after cache clear |
| `grammarMs` | GBNF compile |
| `tokenizeMs` | Prompt tokenize |
| `ttftMs` | Time to first generated token |
| `prefillMs` | Estimated `ttftMs - meanDecodeTokMs` (null if &lt;2 tokens) |
| `decodeMs` | After first token |
| `adapterMs` | JSON parse |
| `cacheHit` | Always `false` until Phase 2 |
| `prefillTokPerSec` / `decodeTokPerSec` | Derived |

Gate: sum of reported phase pieces should reconcile to `totalMs` within ~5% when cold-load included in total.

### Next-phase rule (from Phase 0)

If mean(`prefillMs` / `totalMs`) ≥ 40% → **Phase 2** (context reuse / prefix cache) first.  
Else → **Phase 1** (backend activation).

Vision (Phase 5) is **out of sequence** — no VLM path yet.

## Product timing note

`extract` returns `encodeMs_unreliable` / `generateMs_unreliable` (wall-clock placeholders). **Do not** use them as optimization baselines. Use bench JSONL.

## Results table (fill after real-device runs)

| MemTier | ExecTier | Workload | Sweep | prefillShare | totalMs | Notes |
|---------|----------|----------|-------|--------------|---------|-------|
| — | — | — | — | — | — | No T0/T1-class desktop baselines attached yet |

**No improvement claims until JSONL from accessible real machines is attached.**
