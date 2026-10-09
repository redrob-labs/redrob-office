/**
 * The work classifier, in its own Electron utility process.
 *
 * The model is about 780 MB resident and takes ~14 ms of CPU per label, so it stays out of the shell's
 * main process, where it would compete with every window. The main process sends `{ id, directory, text }`
 * for a session's first message and gets back `{ id, label }`; the text is labeled and dropped here.
 */
import { createRequire } from 'node:module'
import { join } from 'node:path'

import { WorkClassifierSource, type OrtRuntime, type WorkLabel } from '@redrob-labs/work-labeller/node'

export type LabelRequest = { id: number; directory: string; text: string }
export type LabelReply = { id: number; label: WorkLabel | null }

/**
 * onnxruntime-node from where packaging puts it (resources/node_modules, electron-builder.cjs), or from
 * the workspace in development. A native addon, so it is never bundled into this file.
 */
function loadRuntime(): Promise<OrtRuntime> {
  const resources = (process as { resourcesPath?: string }).resourcesPath
  const from = resources && process.env.NODE_ENV !== 'development' ? join(resources, 'node_modules', 'noop.js') : __filename
  try {
    return Promise.resolve(createRequire(from)('onnxruntime-node') as OrtRuntime)
  } catch {
    return Promise.resolve(createRequire(__filename)('onnxruntime-node') as OrtRuntime)
  }
}

/** One classifier per model folder, loaded on first use. Exported for tests. */
export function createLabeler(
  make: (directory: string) => Pick<WorkClassifierSource, 'label'> = (directory) => new WorkClassifierSource({ directory, loadRuntime }),
) {
  let current: { directory: string; source: Pick<WorkClassifierSource, 'label'> } | null = null
  return async (request: LabelRequest): Promise<LabelReply> => {
    if (current?.directory !== request.directory) current = { directory: request.directory, source: make(request.directory) }
    const label = await current.source.label(request.text).catch(() => null)
    return { id: request.id, label }
  }
}

type ParentPort = {
  on(event: 'message', listener: (event: { data: LabelRequest }) => void): void
  postMessage(message: LabelReply): void
}

const parentPort = (process as { parentPort?: ParentPort }).parentPort
if (parentPort) {
  const label = createLabeler()
  parentPort.on('message', ({ data }) => {
    void label(data).then((reply) => parentPort.postMessage(reply))
  })
}
