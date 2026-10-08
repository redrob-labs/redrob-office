// Node entry: initialise the engine from the wasm file on disk.
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { initHwpCoreSync } from './index'

export * from './index'

// From the import.meta.url string, not `new URL(...)`: test DOMs (jsdom) replace the global
// URL class with one node:url's fileURLToPath rejects.
export const HWP_CORE_WASM_PATH = join(dirname(fileURLToPath(import.meta.url)), '../wasm/rhwp_bg.wasm')

/**
 * Where the wasm is at run time. In the source tree and in tests it sits next
 * to this package. A packaged app bundles main-process code and ships no
 * node_modules, so electron-builder copies the file to Resources/wasm
 * (apps/shell/electron-builder.cjs), as it does for pdfium.
 */
export function hwpCoreWasmPath(): string {
  if (existsSync(HWP_CORE_WASM_PATH)) return HWP_CORE_WASM_PATH
  const resources = (process as NodeJS.Process & { resourcesPath?: string }).resourcesPath
  if (resources) {
    const packaged = join(resources, 'wasm', 'rhwp_bg.wasm')
    if (existsSync(packaged)) return packaged
  }
  return HWP_CORE_WASM_PATH
}

/** Load the wasm bytes and initialise. Idempotent. */
export function initHwpCoreNode(wasmPath: string = hwpCoreWasmPath()): void {
  initHwpCoreSync(readFileSync(wasmPath))
}
