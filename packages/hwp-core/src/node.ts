// Node entry: initialise the engine from the wasm file on disk.
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { initHwpCoreSync } from './index'

export * from './index'

export const HWP_CORE_WASM_PATH = fileURLToPath(new URL('../wasm/rhwp_bg.wasm', import.meta.url))

/** Load the wasm bytes from this package and initialise. Idempotent. */
export function initHwpCoreNode(wasmPath: string = HWP_CORE_WASM_PATH): void {
  initHwpCoreSync(readFileSync(wasmPath))
}
