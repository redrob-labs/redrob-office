/**
 * Lets Node run the TypeScript sources directly.
 *
 * Node strips types on its own; what it will not do is follow the `./x.js`
 * specifiers TypeScript emits for a `./x.ts` file. This hook fills that gap so
 * the demo scripts execute the same source the app builds from, with no
 * bundler and no extra dependency.
 */
import { existsSync } from "node:fs";
import { registerHooks } from "node:module";
import { fileURLToPath } from "node:url";

registerHooks({
  resolve(specifier, context, nextResolve) {
    const relative = specifier.startsWith("./") || specifier.startsWith("../");
    if (relative && specifier.endsWith(".js") && context.parentURL) {
      const asJs = new URL(specifier, context.parentURL);
      if (!existsSync(fileURLToPath(asJs))) {
        const asTs = `${specifier.slice(0, -3)}.ts`;
        if (existsSync(fileURLToPath(new URL(asTs, context.parentURL)))) {
          return nextResolve(asTs, context);
        }
      }
    }
    return nextResolve(specifier, context);
  },
});
