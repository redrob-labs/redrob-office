import { execFile } from "node:child_process";
import { promisify } from "node:util";
import si from "systeminformation";

const execFileAsync = promisify(execFile);

export type GpuInfo = {
  vendor: string;
  renderer: string;
  vramMib: number | null;
};

type GraphicsSnapshot = Awaited<ReturnType<typeof si.graphics>>;

let graphicsProbe: Promise<GraphicsSnapshot | null> | null = null;
let nvidiaSmiProbe: Promise<GpuInfo | null> | null = null;
let macDisplayProbe: Promise<GpuInfo | null> | null = null;

/** Windows/Linux only — Apple Silicon has no nvidia-smi path. */
export function nvidiaSmiSupportedPlatform(platform: NodeJS.Platform = process.platform): boolean {
  return platform === "win32" || platform === "linux";
}

/** si.graphics() can hang on some Windows stacks — cache + soft timeout. */
export function probeGraphics(timeoutMs = 4_000): Promise<GraphicsSnapshot | null> {
  if (!graphicsProbe) {
    graphicsProbe = new Promise<GraphicsSnapshot | null>((resolve) => {
      const timer = setTimeout(() => resolve(null), timeoutMs);
      void si
        .graphics()
        .then((value) => {
          clearTimeout(timer);
          resolve(value);
        })
        .catch(() => {
          clearTimeout(timer);
          resolve(null);
        });
    });
  }
  return graphicsProbe;
}

/**
 * Prefer nvidia-smi over WMI/graphics when the NVIDIA driver is installed.
 * No-op on macOS (Metal path) and soft-fails when the binary is missing.
 */
export function probeNvidiaSmi(timeoutMs = 2_500): Promise<GpuInfo | null> {
  if (!nvidiaSmiSupportedPlatform()) {
    return Promise.resolve(null);
  }
  if (!nvidiaSmiProbe) {
    nvidiaSmiProbe = (async () => {
      try {
        const { stdout } = await execFileAsync(
          "nvidia-smi",
          ["--query-gpu=name,memory.total", "--format=csv,noheader,nounits"],
          {
            timeout: timeoutMs,
            windowsHide: true,
            encoding: "utf8",
            env: process.env,
          },
        );
        const line = String(stdout)
          .split(/\r?\n/)
          .map((row) => row.trim())
          .find((row) => row.length > 0);
        if (!line) return null;
        const parts = line.split(",").map((part) => part.trim());
        const name = parts[0] ?? "";
        const mem = Number(parts[1]);
        if (!name) return null;
        return {
          vendor: "NVIDIA",
          renderer: name,
          vramMib: Number.isFinite(mem) && mem > 0 ? Math.round(mem) : null,
        };
      } catch {
        return null;
      }
    })();
  }
  return nvidiaSmiProbe;
}

/** macOS display chip via system_profiler (Apple Silicon / Intel Mac). */
function probeMacDisplays(timeoutMs = 2_500): Promise<GpuInfo | null> {
  if (process.platform !== "darwin") return Promise.resolve(null);
  if (!macDisplayProbe) {
    macDisplayProbe = (async () => {
      try {
        const { stdout } = await execFileAsync(
          "system_profiler",
          ["SPDisplaysDataType", "-json"],
          { timeout: timeoutMs, encoding: "utf8" },
        );
        const parsed = JSON.parse(String(stdout)) as {
          SPDisplaysDataType?: Array<Record<string, unknown>>;
        };
        const first = parsed.SPDisplaysDataType?.[0];
        if (!first) return null;
        const renderer =
          String(first.sppci_model ?? first._name ?? first["spdisplays_device-id"] ?? "").trim() ||
          "Apple GPU";
        const vendor = /apple/i.test(renderer) ? "Apple" : "GPU";
        return { vendor, renderer, vramMib: null };
      } catch {
        return null;
      }
    })();
  }
  return macDisplayProbe;
}

function gpuFromGraphicsControllers(
  graphics: GraphicsSnapshot | null,
): GpuInfo | null {
  const controller = graphics?.controllers?.[0];
  if (!controller) return null;
  const vendor = (controller.vendor || "Unknown").trim() || "Unknown";
  const renderer = (controller.model || "Unknown").trim() || "Unknown";
  const vram = controller.vram ?? 0;
  return {
    vendor,
    renderer,
    vramMib: vram > 0 ? vram : null,
  };
}

/** Best-effort GPU label for Device panel / planning across OS. */
export async function detectGpuInfo(timeoutMs = 4_000): Promise<GpuInfo | null> {
  const smiTimeout = Math.min(timeoutMs, 2_500);

  if (process.platform === "darwin") {
    const [graphics, mac] = await Promise.all([
      probeGraphics(timeoutMs),
      probeMacDisplays(smiTimeout),
    ]);
    return mac ?? gpuFromGraphicsControllers(graphics);
  }

  const [smi, graphics] = await Promise.all([
    probeNvidiaSmi(smiTimeout),
    probeGraphics(timeoutMs),
  ]);
  return smi ?? gpuFromGraphicsControllers(graphics);
}

export async function detectNvidiaDgpu(): Promise<boolean> {
  if (process.platform === "darwin") return false;
  try {
    const smi = await probeNvidiaSmi();
    if (smi) return true;

    const graphics = await probeGraphics();
    if (!graphics) return false;
    return graphics.controllers.some((controller) => {
      const vendor = `${controller.vendor ?? ""} ${controller.model ?? ""}`.toLowerCase();
      const vram = controller.vram ?? 0;
      const nvidia =
        vendor.includes("nvidia") || vendor.includes("geforce") || vendor.includes("rtx");
      return (
        nvidia &&
        (vram === -1 || vram === 0 || vram >= 2048 || vendor.includes("rtx") || vendor.includes("geforce"))
      );
    });
  } catch {
    return false;
  }
}

export async function detectOtherGpu(): Promise<boolean> {
  try {
    if (process.platform === "darwin") {
      // Apple GPU is handled by Metal, not Vulkan "other".
      return false;
    }
    const graphics = await probeGraphics();
    if (!graphics) return false;
    return graphics.controllers.some((controller) => {
      const vendor = `${controller.vendor ?? ""} ${controller.model ?? ""}`.toLowerCase();
      if (!vendor.trim()) return false;
      if (vendor.includes("nvidia")) return false;
      return (
        vendor.includes("intel") ||
        vendor.includes("amd") ||
        vendor.includes("radeon") ||
        vendor.includes("apple")
      );
    });
  } catch {
    return false;
  }
}

export async function dedicatedVramMib(): Promise<number | null> {
  try {
    const info = await detectGpuInfo();
    return info?.vramMib ?? null;
  } catch {
    return null;
  }
}
