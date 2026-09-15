# Single llama-server backend, one model, reasoning as a toggle

Date: 2026-08-07
Status: accepted

Replaces the node-llama-cpp text runtime and the separate vision sidecar with one
llama-server process, drops the Qwen3 text family, and turns the Fast/Pro quality
split into a reasoning toggle.

## Why node-llama-cpp is removed

The deciding factor is backend coverage, not performance.

node-llama-cpp distributes prebuilt binaries for CUDA, Metal and Vulkan only.
That set is fixed by what the package publishes, and it has no OpenVINO build.
Intel NPU and iGPU inference therefore could not be reached through it at all:
not as a missing feature we could add, but as a permanently closed path, because
the binaries are not ours to produce.

llama.cpp publishes CUDA, Vulkan, OpenVINO, Metal, ROCm, SYCL and CPU builds for
each release. Talking to `llama-server` over HTTP means the set of backends we can
support is the set upstream ships, and adding one is a matter of pinning another
archive rather than waiting on a wrapper.

The second reason is that the two runtimes could not coexist cheaply. Vision
already required llama-server, because node-llama-cpp does not expose `mmproj`.
Since both wanted the same weights resident on the same GPU, starting the vision
sidecar meant evicting the in-process model first. Text and vision are the same
Qwen3.5 LM, so this was paying twice to load one model. One process holding `-m`
and `--mmproj` together removes the eviction dance entirely.

### What this costs

- **Automatic prebuilt management.** node-llama-cpp resolved and installed its own
  native binary at `npm install`. We now download, verify and extract llama.cpp
  archives ourselves, and pin a SHA-256 per asset because GitHub publishes no
  checksums.
- **Hardware detection is ours now.** The wrapper probed the GPU by attempting to
  load. We detect hardware directly and treat a missing backend binary as a setup
  step rather than something to fall back from.
- **A process boundary.** Inference failures arrive as HTTP errors and exit codes
  instead of exceptions. The upside is that a crashed decoder no longer takes the
  app with it.

### What was verified before removing it

`office/scripts/llama-server-smoke.mjs`, against the pinned build on an RTX 4060:

| Check | Result |
| --- | --- |
| One instance boots with `-m` and `--mmproj` | pass |
| Grammar-constrained field-fill over `/completion` | pass |
| `cache_prompt` prefix reuse | pass, prefill 132 → 12 → 4 tokens across three fields |
| Mid-decode abort | pass |
| Continue after abort, slot reusable | pass |
| Reasoning off yields content, no `reasoning_content` | pass |
| Reasoning on separates the two fields | pass |
| Vision served by the same instance | pass |

## Why Qwen3 is removed

Two text families meant two model ladders, two chat-template branches, two sets of
download entries and a `REDROB_TEXT_MODEL` switch through the middle of the
execution plan. Only one of them shipped by default, and the other could not do
vision, so keeping it meant maintaining a path that could never be the product.

Model selection is now sizing rather than choosing: 2B below 8 GiB of VRAM, 4B at
or above it, same artifact for text and vision.

### The accuracy cost we accepted

`docs/verify-qwen35-notes.md` records where Qwen3-4B measured better than Qwen3.5
on extraction. We are not re-measuring and we are not treating that gap as a
blocker. The reasoning is that a second family only pays for itself if a user can
actually reach it, and a Qwen3 user gets no vision, no shared instance, and a
second set of weights on disk. Uniformity is worth more than the delta.

If that judgement turns out wrong, the evidence to revisit it is in the verify
notes and the measurement records under `docs/measurements/`.

## Why a reasoning toggle instead of Fast and Pro

Fast and Pro were two names for a token budget, and neither name told the user
what changed. Users read them as quality levels, then asked why Pro was slow.

The real axis is whether the model thinks before answering, which is one boolean
with an observable difference. It defaults off.

Two constraints came out of the measurements:

**Field-fill is always off, regardless of the toggle.** It is structurally off, not
conditionally: `/completion` never applies a chat template, and the preamble
field-fill builds already contains a closed `<think></think>` block. Thinking
tokens cannot reach a grammar-constrained decode. Had this been a server-level
flag instead of per-request, the toggle would have corrupted every extraction.

**Reasoning on needs a retry path.** With a short budget the model spends all of it
thinking and returns empty `content` with populated `reasoning_content`. Measured
on the pinned build at `max_tokens: 24`: 88 characters of reasoning, zero content,
`finish_reason: length`. Treating that as a failure would surface a blank reply, so
the request is retried once at a larger budget, and a second empty result is
reported to the user rather than hidden.

Thinking is shown collapsed and hidden by default. The toggle state is recorded on
every request log so the effect on latency and output can be compared later.

## mmproj bindings are off the roadmap

Getting `mmproj` into node-llama-cpp would have let vision run in-process. That
work is dropped, since there is no in-process runtime left to add it to.

**GitHub issue 637 stays open.** It is a real upstream gap and other people want
it. Closing it because we routed around it would be noise for everyone else
tracking it.

## When CPU and NPU get reconsidered

Both are excluded now. GPU is a hard requirement and there is no CPU inference
path, not a slow one, none.

The condition to revisit is specific: **when the OpenVINO backend supports
multimodal projectors.** Until then that tier is text only, which means an NPU
machine gets a materially different product rather than a slower one, and shipping
it as an equal option would be misleading. When that lands, the OpenVINO tier can
be promoted to a full backend and the CPU/NPU question is worth reopening with it.

The OpenVINO tier ships in the meantime with its limits stated: no vision, routed
to cloud opt-in, a separate Q4_0 model file because the NPU runs stateless mode,
and no mmproj download.

## Learnings from the migration

Things found while doing the work that were not visible when the plan was written.
Recorded because several of them change what a future version of this decision
should assume.

### The backend matrix is not symmetric

We planned five downloadable backends. Four are downloadable.

llama.cpp b10068 publishes no Linux CUDA archive. The release has ubuntu x64,
vulkan, rocm, sycl, s390x, arm64 and openvino builds, and that is it. Linux CUDA
users have to build from the tag and point `REDROB_LLAMA_SERVER` at the result.
Rather than construct a plausible asset name, `linux-x64-cuda` carries
`archives: null` and fails with build instructions, per the rule that a name which
does not resolve must not be guessed.

The OpenVINO tier went the other way. The plan carried a contingency to mark it
deferred if upstream shipped no artifact. It does ship one
(`llama-b10068-bin-win-openvino-2026.2.1-x64.zip`), so the contingency was unused
and the tier is real.

The general lesson is that upstream coverage has to be checked per release, not
assumed from the project's capability list. llama.cpp *can* build CUDA on Linux;
it just does not publish it.

### Pinning a version costs a full download

GitHub publishes no checksums for release assets, so pinning a SHA-256 means
fetching the artifact and hashing it. Getting five digests required about 764 MB
of downloads, most of it the CUDA pair at 611 MiB.

That is a real cost on every version bump, and it is worth knowing before someone
treats "update the pinned release" as a one-line change. The digests and the file
names live together in `packages/kernel/src/runtime/backend-matrix.ts` so the bump
is at least a single-file edit with an obvious checklist.

### Prefix reuse has to be measured in prefill tokens

The first version of the smoke test compared wall-clock time per field and
reported that `cache_prompt` was not working. It was wrong. Wall time per field is
dominated by how many tokens the value decodes, so a long email address looks
slower than a short name no matter how much prefix was reused.

The correct signal is `timings.prompt_n` from the server, which counts tokens
actually prefilled. Measured across three fields sharing one document preamble:
132, then 12, then 4. The reuse was working the whole time.

Any future check on caching should read prefill counts. A latency comparison will
mislead.

### Per-request reasoning is what allows one shared instance

This turned out to be load-bearing rather than a detail.

The server runs `--reasoning auto` and every request states its own
`enable_thinking` through `chat_template_kwargs`. Had reasoning been set as a
process-level flag, one instance could not serve chat and field-fill at once, and
the toggle would have silently corrupted extraction the moment a user turned it
on. The single-instance design and the per-request toggle depend on each other.

Field-fill ends up safe for a second, independent reason: `/completion` applies no
chat template at all, and field-fill writes its own preamble containing a closed
`<think></think>` block. Two independent guarantees on the same property is the
right amount for something this easy to break.

### The empty-content failure is a budget problem, not an error

Reproduced exactly as predicted, on the pinned build at `max_tokens: 24`: 88
characters of `reasoning_content`, zero `content`, `finish_reason: length`.

Worth stating plainly because the naive handling is to treat an empty content
field as a failed generation and show an error. It is not a failure. The model ran
out of budget while thinking. The handling is one retry at a larger budget, and a
second empty result gets reported as empty rather than dressed up.

### Keeping the exported names kept the blast radius small

The app was expected to need broad rewiring. It needed almost none.

`generateFieldFill`, `FieldFillSession`, `onField` and the rest kept their names
and shapes while the transport underneath changed completely. The app package came
out of the migration with 26 type errors, only 19 of them caused by this work, and
those are concentrated in four files that talk to the runtime directly.

For a swap of this size, holding the interface fixed and moving everything behind
it was worth more than a cleaner set of names would have been.

### Vision stopped being NVIDIA-only

An unplanned gain. The old sidecar hard-gated vision on an NVIDIA GPU plus a CUDA
binary, because that was the only build we had wired up. Vision availability is now
a property of the backend descriptor, so Vulkan and Metal machines get it too. Only
OpenVINO is text-only, and for a real reason rather than an implementation gap.

### Boot grammar validation gained an ordering constraint

Grammars used to be compiled in process at boot to fail fast on illegal GBNF. There
is no in-process compiler now, so validation is a one-token `/completion` per unique
grammar, deduplicated by the same cache key the fill path uses.

This is equivalent in coverage but no longer free of ordering: the server has to be
running before the assert can execute. Anything that moves boot sequencing needs to
keep that dependency intact, or the check quietly stops running.

### The clean secret scan is narrower than it looks

`scripts/scan-secrets-history.mjs` found no credential patterns across 334 text
blobs. The caveat matters as much as the result: history begins 2026-08-05 and is
11 commits deep, which is consistent with a re-initialized repository.

The scan proves this repository is clean. It says nothing about whatever repository
preceded it. If the discarded Civitai and HuggingFace credentials were ever
committed, they are in that earlier history, and that is where they still need to
be dealt with.

### The OpenVINO quant needs no conversion work

`Qwen3.5-2B-Q4_0.gguf` and `Qwen3.5-4B-Q4_0.gguf` already exist in the same unsloth
repositories as the Q4_K_M weights. The NPU tier therefore needs a different
download entry, not a build step, which is why `openvinoFile` is a field on the
artifact rather than a separate pipeline.
