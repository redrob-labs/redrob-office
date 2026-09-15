import {
  GRADE_RAM_MB,
  GRADE_VRAM_MIB,
  backendsForHost,
  dedicatedVramMib,
  detectNvidiaDgpu,
  detectOtherGpu,
  type ModelGrade,
} from "@redrob/kernel";
import { getSetupSnapshot } from "./setup.js";
import type { LocalCapability, LocalShortfall } from "../../shared/office-api.js";

/**
 * Whether this machine can do the work on device, and where it falls short.
 *
 * This exists so the answer is computed once, in the place that can actually
 * see the hardware, instead of three screens each half-deriving it from a
 * different signal. It reports ids and numbers only: the sentence a person
 * reads is the renderer's job, in their language.
 *
 * A shortfall is `blocking` when local inference cannot run at all, and
 * `warning` when it will run but badly. Only a blocking shortfall is a reason
 * to steer someone to the cloud.
 */
export async function detectLocalCapability(userData: string): Promise<LocalCapability> {
  const setup = await getSetupSnapshot(userData);
  const grade: ModelGrade = setup.state.chatQualityMode;
  const shortfalls: LocalShortfall[] = [];

  const platformBackends = backendsForHost();
  if (platformBackends.length === 0) {
    shortfalls.push({ id: "platform", severity: "blocking", need: 0, have: 0 });
  } else {
    // llama-server is GPU-only. A machine with neither an NVIDIA dGPU nor a
    // Vulkan-capable GPU has nothing to run the weights on, whatever else it
    // has, and no download will change that.
    const [nvidia, other] = await Promise.all([
      detectNvidiaDgpu().catch(() => false),
      detectOtherGpu().catch(() => false),
    ]);
    if (!nvidia && !other && process.platform !== "darwin") {
      shortfalls.push({ id: "gpu", severity: "blocking", need: 0, have: 0 });
    }
  }

  if (!setup.canFitMinimal) {
    shortfalls.push({
      id: "disk",
      severity: "blocking",
      need: setup.plan.minimalBytes,
      have: setup.freeBytes,
    });
  }

  const vram = await dedicatedVramMib().catch(() => null);
  if (vram !== null && vram < GRADE_VRAM_MIB[grade]) {
    shortfalls.push({
      id: "vram",
      severity: "warning",
      need: GRADE_VRAM_MIB[grade],
      have: vram,
    });
  }

  const { detectDeviceProfile } = await import("@redrob/kernel");
  const device = await detectDeviceProfile().catch(() => null);
  if (device && device.totalRamMb < GRADE_RAM_MB[grade]) {
    shortfalls.push({
      id: "ram",
      severity: "warning",
      need: GRADE_RAM_MB[grade],
      have: device.totalRamMb,
    });
  }

  const cloudConfigured = Boolean(
    setup.state.llmProviders?.openai?.apiKey,
  );

  return {
    grade,
    runnable: !shortfalls.some((item) => item.severity === "blocking"),
    shortfalls,
    cloudConfigured,
  };
}
