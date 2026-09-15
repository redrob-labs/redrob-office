/*
 * Copyright 2026 Redrob
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

/**
 * The single place that knows llama.cpp release asset names.
 *
 * The version is pinned in the app rather than resolved from the GitHub releases
 * API: we ship the build we actually verified, and an offline or GitHub-blocked
 * machine must fail with install instructions instead of silently drifting onto
 * whatever is newest. Every backend uses the same pinned version — a mixed-version
 * install is not a supported configuration.
 *
 * GitHub publishes no checksums for release assets, so each SHA-256 below was
 * computed from the downloaded artifact and pinned alongside the file name. A
 * name that does not resolve is a hard failure; nothing here guesses.
 */

/** llama.cpp release tag. Bumping this requires re-pinning every digest below. */
export const LLAMA_CPP_RELEASE = "b10068";

/** Upstream commit for the pinned release, for logs and bug reports. */
export const LLAMA_CPP_COMMIT = "571d0d540";

const RELEASE_BASE = `https://github.com/ggml-org/llama.cpp/releases/download/${LLAMA_CPP_RELEASE}`;

export type BackendId =
  | "win-x64-cuda"
  | "win-x64-vulkan"
  | "win-x64-openvino"
  | "darwin-arm64-metal"
  | "linux-x64-cuda";

/** Inference engine a backend maps onto. Mirrors llama-server's device support. */
export type BackendEngine = "cuda" | "vulkan" | "openvino" | "metal";

export interface BackendArchive {
  /** Exact release asset file name. Never constructed at call sites. */
  fileName: string;
  url: string;
  /** SHA-256 of the published asset, computed at pin time. */
  sha256: string;
  sizeBytes: number;
}

export interface BackendDescriptor {
  id: BackendId;
  engine: BackendEngine;
  platform: NodeJS.Platform;
  arch: "x64" | "arm64";
  /**
   * Archives extracted into the same backend directory, in order. CUDA ships the
   * runtime separately from the binaries and both must land side by side.
   */
  archives: readonly BackendArchive[] | null;
  /** Name of the server executable once extracted. */
  serverBinary: string;
  /**
   * False when llama-server on this backend cannot load a multimodal projector.
   * Vision is disabled and routed to cloud opt-in instead.
   */
  supportsVision: boolean;
  /**
   * Set when upstream publishes no prebuilt archive for this target at the pinned
   * version. The backend is offered but must be installed by hand.
   */
  unavailableReason?: string;
  /** Hardware floor, surfaced in setup UI. */
  requirements?: string;
}

/**
 * Supported backends. `archives: null` means there is nothing to download and the
 * user has to supply the binaries; see `unavailableReason`.
 */
export const BACKENDS: Readonly<Record<BackendId, BackendDescriptor>> = Object.freeze({
  "win-x64-cuda": {
    id: "win-x64-cuda",
    engine: "cuda",
    platform: "win32",
    arch: "x64",
    serverBinary: "llama-server.exe",
    supportsVision: true,
    archives: [
      {
        fileName: `llama-${LLAMA_CPP_RELEASE}-bin-win-cuda-12.4-x64.zip`,
        url: `${RELEASE_BASE}/llama-${LLAMA_CPP_RELEASE}-bin-win-cuda-12.4-x64.zip`,
        sha256: "a249fb8d3f072d2746e8bd93af3f901eadaff7dedc7ff27a415af488da2d8411",
        sizeBytes: 249_038_576,
      },
      {
        fileName: "cudart-llama-bin-win-cuda-12.4-x64.zip",
        url: `${RELEASE_BASE}/cudart-llama-bin-win-cuda-12.4-x64.zip`,
        sha256: "8c79a9b226de4b3cacfd1f83d24f962d0773be79f1e7b75c6af4ded7e32ae1d6",
        sizeBytes: 391_443_627,
      },
    ],
    requirements: "NVIDIA GPU with a CUDA 12.4 capable driver",
  },
  "win-x64-vulkan": {
    id: "win-x64-vulkan",
    engine: "vulkan",
    platform: "win32",
    arch: "x64",
    serverBinary: "llama-server.exe",
    supportsVision: true,
    archives: [
      {
        fileName: `llama-${LLAMA_CPP_RELEASE}-bin-win-vulkan-x64.zip`,
        url: `${RELEASE_BASE}/llama-${LLAMA_CPP_RELEASE}-bin-win-vulkan-x64.zip`,
        sha256: "4f3e6fd215fdf22d2fd6232a5501f9e791a93d9193db4faf59e391eff90f6169",
        sizeBytes: 33_271_704,
      },
    ],
    requirements: "GPU with a Vulkan 1.2 driver",
  },
  "win-x64-openvino": {
    id: "win-x64-openvino",
    engine: "openvino",
    platform: "win32",
    arch: "x64",
    serverBinary: "llama-server.exe",
    // The OpenVINO build has no mmproj support, so this tier is text only.
    supportsVision: false,
    archives: [
      {
        fileName: `llama-${LLAMA_CPP_RELEASE}-bin-win-openvino-2026.2.1-x64.zip`,
        url: `${RELEASE_BASE}/llama-${LLAMA_CPP_RELEASE}-bin-win-openvino-2026.2.1-x64.zip`,
        sha256: "277c0b2b5e8425120f1cc57fefce583507563ef63e0706ac53b2861bb367da55",
        sizeBytes: 80_244_531,
      },
    ],
    requirements: "Intel NPU (VPU 4.0 / Core Ultra) or later, or an Xe-LPG or later iGPU",
  },
  "darwin-arm64-metal": {
    id: "darwin-arm64-metal",
    engine: "metal",
    platform: "darwin",
    arch: "arm64",
    serverBinary: "llama-server",
    supportsVision: true,
    archives: [
      {
        fileName: `llama-${LLAMA_CPP_RELEASE}-bin-macos-arm64.tar.gz`,
        url: `${RELEASE_BASE}/llama-${LLAMA_CPP_RELEASE}-bin-macos-arm64.tar.gz`,
        sha256: "13aa2d40c76ad1dcb8ebeec5f0d2814bf3b2f84a66935c7d4dc6f7cca8e38d68",
        sizeBytes: 10_603_591,
      },
    ],
    requirements: "Apple Silicon",
  },
  "linux-x64-cuda": {
    id: "linux-x64-cuda",
    engine: "cuda",
    platform: "linux",
    arch: "x64",
    serverBinary: "llama-server",
    supportsVision: true,
    // Upstream b10068 publishes ubuntu x64, vulkan, rocm, sycl and openvino builds
    // but no CUDA one. Guessing an asset name here would 404 at download time.
    archives: null,
    unavailableReason:
      `llama.cpp ${LLAMA_CPP_RELEASE} publishes no prebuilt Linux CUDA archive. ` +
      "Build llama-server from that tag with -DGGML_CUDA=ON and point REDROB_LLAMA_SERVER at it.",
    requirements: "NVIDIA GPU with a CUDA capable driver",
  },
});

export const BACKEND_IDS = Object.freeze(Object.keys(BACKENDS) as BackendId[]);

export function backendDescriptor(id: BackendId): BackendDescriptor {
  const descriptor = BACKENDS[id];
  if (!descriptor) throw new Error(`Unknown backend id: ${id}`);
  return descriptor;
}

/** Backends installable on the current platform/arch, in preference order. */
export function backendsForHost(
  platform: NodeJS.Platform = process.platform,
  arch: string = process.arch,
): BackendDescriptor[] {
  return BACKEND_IDS.map((id) => BACKENDS[id]).filter(
    (backend) => backend.platform === platform && backend.arch === arch,
  );
}

/** Total bytes to fetch for a backend, or null when it must be installed by hand. */
export function backendDownloadBytes(id: BackendId): number | null {
  const { archives } = backendDescriptor(id);
  if (!archives) return null;
  return archives.reduce((total, archive) => total + archive.sizeBytes, 0);
}

export function backendSupportsVision(id: BackendId): boolean {
  return backendDescriptor(id).supportsVision;
}
