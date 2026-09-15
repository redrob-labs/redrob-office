/**
 * Power handling. The goal is not to stop the machine sleeping, it is to
 * survive it: every transition below is a normal state change with a
 * checkpoint, not an error path.
 */
export type PowerEvent =
  | "suspend"
  | "resume"
  | "on-battery"
  | "on-ac"
  | "shutdown"
  | "lock-screen"
  | "unlock-screen";

export interface PowerHooks {
  onSuspend(): Promise<void> | void;
  onResume(): Promise<void> | void;
  onBattery(): Promise<void> | void;
  onAc(): Promise<void> | void;
  onShutdown(): Promise<void> | void;
}

interface ElectronPowerApi {
  powerMonitor: {
    on(event: string, listener: () => void): unknown;
    off?(event: string, listener: () => void): unknown;
    removeListener?(event: string, listener: () => void): unknown;
    onBatteryPower?: boolean;
  };
}

async function loadElectron(): Promise<ElectronPowerApi | null> {
  try {
    const mod = (await import("electron")) as unknown as ElectronPowerApi & {
      default?: ElectronPowerApi;
    };
    const api = mod.default ?? mod;
    if (!api.powerMonitor) return null;
    return api;
  } catch {
    return null;
  }
}

export interface PowerControllerStatus {
  available: boolean;
  onBattery: boolean;
}

export class PowerController {
  #electron: ElectronPowerApi | null = null;
  #listeners: Array<{ event: string; listener: () => void }> = [];
  #hooks: PowerHooks | null = null;
  #onBattery = false;

  async attach(hooks: PowerHooks): Promise<boolean> {
    this.#hooks = hooks;
    this.#electron = await loadElectron();
    if (!this.#electron) return false;
    const { powerMonitor } = this.#electron;

    const bind = (event: string, listener: () => void): void => {
      powerMonitor.on(event, listener);
      this.#listeners.push({ event, listener });
    };

    bind("suspend", () => {
      void this.#hooks?.onSuspend();
    });
    bind("resume", () => {
      void this.#hooks?.onResume();
    });
    bind("on-battery", () => {
      this.#onBattery = true;
      void this.#hooks?.onBattery();
    });
    bind("on-ac", () => {
      this.#onBattery = false;
      void this.#hooks?.onAc();
    });
    bind("shutdown", () => {
      void this.#hooks?.onShutdown();
    });

    this.#onBattery = Boolean(powerMonitor.onBatteryPower);
    return true;
  }

  status(): PowerControllerStatus {
    return {
      available: this.#electron !== null,
      onBattery: this.#onBattery,
    };
  }

  detach(): void {
    if (this.#electron) {
      const { powerMonitor } = this.#electron;
      for (const { event, listener } of this.#listeners) {
        if (typeof powerMonitor.off === "function") powerMonitor.off(event, listener);
        else if (typeof powerMonitor.removeListener === "function") {
          powerMonitor.removeListener(event, listener);
        }
      }
    }
    this.#listeners = [];
    this.#hooks = null;
  }

  /** Used by the sleep demo to drive the same handlers an OS event would. */
  async dispatch(event: PowerEvent): Promise<void> {
    if (!this.#hooks) return;
    switch (event) {
      case "suspend":
        await this.#hooks.onSuspend();
        return;
      case "resume":
        await this.#hooks.onResume();
        return;
      case "on-battery":
        this.#onBattery = true;
        await this.#hooks.onBattery();
        return;
      case "on-ac":
        this.#onBattery = false;
        await this.#hooks.onAc();
        return;
      case "shutdown":
        await this.#hooks.onShutdown();
        return;
      default:
        return;
    }
  }
}
