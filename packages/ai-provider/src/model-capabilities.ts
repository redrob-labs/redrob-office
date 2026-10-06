/**
 * What the selected model can take, asked of the engine (main process only).
 *
 * The answer is cached per model in this process and returned so a main process can pass
 * it to its renderer over `ai:capabilities`. If the engine cannot be asked, the
 * conservative defaults apply and nothing fails: an editor must open without AI.
 */
import { capabilitiesFromEngineModel, engineCapabilities, setModelCapabilities, type EngineCapabilities } from './console-capabilities'
import { EngineClient } from './engine-client'
import { engineModelOf } from './engine-model'
import { currentEngineTarget } from './engine-turn'

export async function readModelCapabilities(model: string): Promise<EngineCapabilities> {
  const id = engineModelOf({ model })
  try {
    const models = await new EngineClient(await currentEngineTarget()).models()
    for (const m of models) setModelCapabilities(m.id, capabilitiesFromEngineModel(m))
  } catch {
    // keep whatever is known
  }
  return engineCapabilities(id)
}
