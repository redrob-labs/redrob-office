/**
 * First-run availability of the agent engine.
 *
 * Redrob Code is the only engine, and it ships with the app (a bundled binary
 * pointed to by `REDROB_CODE_BIN`, or a source checkout via
 * `REDROB_CODE_DEV_ROOT` in development). There is nothing for the person to
 * install, so onboarding only needs to know whether the engine is locatable and,
 * if not, say so in Redrob-branded copy. No em dashes.
 */
import { resolveRedrobCodeCommand } from "./sidecar.js";
import { redrobCodeEngineAvailable } from "./engine.js";

export interface EngineStatusView {
  /** True when the engine can be located and a turn may run. */
  available: boolean;
  /** How the engine was located: the bundled binary, a dev checkout, or none. */
  source: "REDROB_CODE_BIN" | "REDROB_CODE_DEV_ROOT" | "PATH";
  /** Branded reason to show when it is not available. */
  reason?: string;
}

export function getEngineStatus(env: NodeJS.ProcessEnv = process.env): EngineStatusView {
  const command = resolveRedrobCodeCommand(env);
  if (redrobCodeEngineAvailable(env)) {
    return { available: true, source: command.source };
  }
  return {
    available: false,
    source: command.source,
    reason:
      "The Redrob agent engine is not available in this build. Reinstall Redrob Office, " +
      "or set REDROB_CODE_BIN to a Redrob engine binary, then try again.",
  };
}
