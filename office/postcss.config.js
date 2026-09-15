import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export default {
  plugins: {
    tailwindcss: { config: resolve(__dirname, "src/renderer/tailwind.config.js") },
    autoprefixer: {},
  },
};
