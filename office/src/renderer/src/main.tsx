import { StrictMode } from "react";
import ReactDOM from "react-dom/client";
import { I18nProvider } from "@redrob/ui";
import { App } from "./App";
import { ErrorBoundary } from "./ErrorBoundary";
import { ensureOfficeBridge } from "./desk-bridge";
import { banWebSpeechApis } from "./ban-web-speech";
import { applyTheme, getStoredThemeMode } from "./theme";
import "./styles.css";

ensureOfficeBridge();
banWebSpeechApis();
applyTheme(getStoredThemeMode());

/**
 * A file dropped anywhere but the composer is ignored, not opened.
 *
 * Electron treats a drop on the window as navigation, so missing the composer by
 * an inch replaced the whole app with the contents of the file and took the
 * session with it. The composer calls `preventDefault` on its own drops, so this
 * only ever catches the misses.
 */
for (const kind of ["dragover", "drop"] as const) {
  window.addEventListener(kind, (event) => event.preventDefault());
}

const rootEl = document.getElementById("root");
if (!rootEl) {
  throw new Error("Root element #root not found");
}

if (typeof ReactDOM.createRoot !== "function") {
  rootEl.textContent =
    "Failed to start React (createRoot missing). Delete office/node_modules/.vite and restart pnpm dev.";
  throw new Error("react-dom/client createRoot is not available");
}

ReactDOM.createRoot(rootEl).render(
  <StrictMode>
    <I18nProvider>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </I18nProvider>
  </StrictMode>,
);
