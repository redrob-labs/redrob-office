// Node entry: initialise the engine from the wasm file on disk.
import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initHwpCoreSync } from './index'

export * from './index'

// From the import.meta.url string, not `new URL(...)`: test DOMs (jsdom) replace the global
// URL class with one node:url's fileURLToPath rejects.
export const HWP_CORE_WASM_PATH = join(dirname(fileURLToPath(import.meta.url)), '../wasm/rhwp_bg.wasm')

/** Load the wasm bytes from this package and initialise. Idempotent. */
export function initHwpCoreNode(wasmPath: string = HWP_CORE_WASM_PATH): void {
  initHwpCoreSync(readFileSync(wasmPath))
}
