import { getLlama, LlamaLogLevel } from "../packages/kernel/node_modules/node-llama-cpp/dist/index.js";
// argv[2]=A|B|C|D  argv[3]=verbose (1=debug logs)
const combo = (process.argv[2] || "A").toUpperCase();
const verbose = process.argv[3] === "1";
const path = `${process.env.LOCALAPPDATA}/redrob/models/verify/Qwen_Qwen3-1.7B-Q4_K_M.gguf`;
const loadOpts =
  combo === "A" ? { modelPath: path, gpuLayers: "auto", useMmap: true } :
  combo === "B" ? { modelPath: path, gpuLayers: "auto" } :
  combo === "C" ? { modelPath: path, useMmap: true } :
  combo === "D" ? { modelPath: path } :
  null;
if (!loadOpts) throw new Error(`bad combo ${combo}`);
const ts = (s) => console.log(`${new Date().toISOString()} ${s}`);
try {
  ts(`combo=${combo} loadOpts=${JSON.stringify(loadOpts)}`);
  const llamaOpts = {
    gpu: "cuda",
    build: "never",
    usePrebuiltBinaries: true,
    skipDownload: true,
    ...(verbose ? {
      logLevel: LlamaLogLevel.debug,
      debug: true,
      logger: (level, message) => {
        process.stderr.write(`[llama:${level}] ${message}\n`);
      },
    } : {}),
  };
  const llama = await getLlama(llamaOpts);
  ts(`llama gpu=${llama.gpu} logLevel=${llama.logLevel}`);
  const m = await llama.loadModel(loadOpts);
  ts(`loaded ${m.typeDescription} gpuLayers=${m.gpuLayers}`);
  await m.dispose();
  await llama.dispose();
  ts("done");
} catch (e) {
  console.error(`${new Date().toISOString()} FAIL`, e?.stack || e);
  process.exitCode = 1;
}
