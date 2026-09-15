/** Temporary llama-server vision path — remove when node-llama-cpp mmproj lands. */
export {
  DEFAULT_CTX_SIZE,
  DEFAULT_IMAGE_MAX_TOKENS,
  VISION_DISABLED_NGL_ZERO,
  VISION_DISABLED_NO_CUDA,
  VISION_DISABLED_NO_CUDA_BIN,
  enforceVisionGpuRequirement,
  ensureVisionSidecar,
  getVisionSidecarStatus,
  resetVisionSidecarForTests,
  resolveLlamaServerBinary,
  resolveVisionLmPath,
  resolveVisionMmprojPath,
  resolveVisionWeights,
  setVisionSidecarDisabledHandler,
  shutdownVisionSidecar,
  stopVisionSidecar,
  visionSidecarAssetsReady,
  type VisionSidecarOptions,
  type VisionSidecarStatus,
  type VisionWeightPaths,
} from "./llama-vision-sidecar.js";
export {
  generateVisionChat,
  type VisionChatImage,
  type VisionChatResult,
  type VisionChatTimings,
} from "./llama-vision-chat.js";
