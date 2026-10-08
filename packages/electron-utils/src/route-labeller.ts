/**
 * The on-device route labeller for the editors' main processes.
 *
 * Redrob Auto routes on the ModelGuide: the request's profession and task, then that cell's best model
 * at its ranked effort. This labels a turn on this computer with @redrob-labs/route-labeller - the
 * same package and the same model Redrob Cowork and Redrob Design use - and hands the label to the AI
 * layer through `setRouteLabeller`, which puts it on the request as `redrob.route`. Only the two ids
 * and the runners-up leave the machine; the text was going to Console anyway.
 *
 * The model (about 140 MB) is not shipped in the installer. It is fetched into userData on first use
 * from the pinned Hugging Face revision the package names, and kept only when every file hashes to
 * the package's manifest. Until it is there, and if it never arrives, the labeller runs on words
 * alone, which is the same pass Console runs on an unlabelled request.
 *
 * WebAssembly (onnxruntime-web) rather than the native runtime: it runs in an Electron main process
 * as it is, so none of the editors' packaging has to learn about a native module, and one sentence a
 * turn is well inside what it does in a fraction of a second.
 */
import { existsSync } from 'node:fs'
import { readFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'

import {
  fetchGuide,
  guideProfessions,
  LEXICON,
  MANIFEST,
  PROTOTYPES,
  RouteLabeller,
  SentenceEncoder,
  type GuideProfession,
  type OrtRuntime,
  type RouteLabel,
} from '@redrob-labs/route-labeller'
import { prepareRouteModel, routeModelPresent } from '@redrob-labs/route-labeller/node'

export type RouteLabelFn = (text: string) => Promise<Record<string, unknown> | null>

/** onnxruntime-web, pointed at its own .wasm files beside it on disk. */
async function loadWasmRuntime(): Promise<OrtRuntime> {
  const ort = (await import('onnxruntime-web')) as unknown as OrtRuntime & {
    env: { wasm: { numThreads: number; wasmPaths?: string } }
  }
  const require = createRequire(import.meta.url)
  // Packaged, the .wasm files are unpacked beside the asar (electron-builder asarUnpack), because
  // WebAssembly is compiled from a real file and not from inside the archive.
  const dist = dirname(require.resolve('onnxruntime-web')).replace(/app\.asar([\\/])/, 'app.asar.unpacked$1')
  ort.env.wasm.wasmPaths = pathToFileURL(`${dist}/`).href
  // One thread: a turn is one sentence, and worker threads in a main process buy nothing here.
  ort.env.wasm.numThreads = 1
  return ort
}

async function loadEncoder(directory: string): Promise<SentenceEncoder> {
  const read = (file: string) => readFile(join(directory, file)).then((buffer) => new Uint8Array(buffer))
  const [model, tokenizer, dense] = await Promise.all([
    read(MANIFEST.model.file),
    read(MANIFEST.tokenizer.file),
    read(MANIFEST.dense.file),
  ])
  return SentenceEncoder.load({ manifest: MANIFEST, model, tokenizer, dense }, await loadWasmRuntime())
}

/**
 * A labeller for `setRouteLabeller`. Lexical from the first call; the embedding pass joins once the
 * model is on disk, fetched in the background from launch when it is not.
 */
const shared = new Map<string, RouteLabelFn>()

/**
 * One labeller per model folder for the whole process. Docs, Sheets and Slides each register the AI
 * layer's hooks, and three copies of a 150 MB model would be three times the memory for one answer.
 */
export function createRouteLabeller(options: {
  /** e.g. join(app.getPath('userData'), 'route-model') */
  modelDir: string
  /** false keeps the labeller on words alone and never downloads; for tests and managed installs. */
  download?: boolean
  log?: (line: string) => void
}): RouteLabelFn {
  const existing = shared.get(options.modelDir)
  if (existing) return existing
  const log = options.log ?? ((line: string) => console.warn(`[route-labeller] ${line}`))
  let labeller = new RouteLabeller(LEXICON, null, null)

  const upgrade = async (): Promise<void> => {
    if (!(await routeModelPresent(options.modelDir))) {
      if (options.download === false) return
      await prepareRouteModel(options.modelDir, { log })
    }
    labeller = new RouteLabeller(LEXICON, PROTOTYPES, await loadEncoder(options.modelDir))
  }

  /**
   * Started now, at launch - the editors create this when their main process registers its handlers -
   * rather than on the first turn. Until the model is here a turn is labelled by words alone, which
   * Console routes on its legacy table rather than the ModelGuide, so the sooner it arrives the sooner
   * Auto routes on the guide.
   */
  const upgrading = upgrade().catch((error: unknown) => {
    log(`labelling by words alone: ${error instanceof Error ? error.message : String(error)}`)
  })
  const onDisk = existsSync(join(options.modelDir, 'manifest.json'))

  const label = async (text: string): Promise<RouteLabel | null> => {
    // A model already on disk is worth waiting for; a download in flight is not.
    if (onDisk) await upgrading
    try {
      return await labeller.label(text)
    } catch {
      return null
    }
  }
  shared.set(options.modelDir, label)
  return label
}

/**
 * The ModelGuide edition Redrob Auto routes on, from Console's `GET /v1/guide`, as the ModelGuide
 * component's props in the UI language. Null when Console cannot be reached; the settings say so.
 */
export async function loadModelGuide(
  baseUrl: string,
  locale: 'en' | 'ko',
  fetchImpl: typeof fetch = fetch,
): Promise<{ asOf: string; professions: GuideProfession[] } | null> {
  const edition = await fetchGuide(baseUrl, fetchImpl)
  return edition ? { asOf: edition.asOf, professions: guideProfessions(edition, locale) } : null
}
