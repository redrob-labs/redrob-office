import { useState } from "react";
import { useI18n } from "@redrob/ui";
import { openChatWithDraft } from "./chat-draft";

const STARTERS = [
  "research.starterCompetitors",
  "research.starterBrief",
  "research.starterNews",
] as const;

/**
 * Research is chat-native: web search + synthesis. This panel hands a clear
 * ask into Chat rather than inventing a second search UI.
 */
export function ResearchPanel(): JSX.Element {
  const { t } = useI18n();
  const [custom, setCustom] = useState("");

  function ask(text: string): void {
    const body = text.trim();
    if (!body) return;
    openChatWithDraft(body);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-4 overflow-auto p-1">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-gray-900">
          {t("research.title")}
        </h2>
        <p className="mt-1 max-w-xl text-sm leading-relaxed text-gray-600">
          {t("research.body")}
        </p>
      </div>
      <ul className="flex flex-col gap-2">
        {STARTERS.map((key) => (
          <li key={key}>
            <button
              type="button"
              className="w-full rounded border border-gray-200 bg-white px-4 py-3 text-left text-sm text-gray-800 transition-colors hover:border-gray-300 hover:bg-gray-50"
              onClick={() => ask(t(key))}
            >
              {t(key)}
            </button>
          </li>
        ))}
      </ul>
      <div className="rounded border border-gray-200 bg-gray-50 p-3">
        <label className="block text-xs font-medium text-gray-500">
          {t("research.customLabel")}
        </label>
        <textarea
          className="mt-2 w-full resize-y rounded border border-gray-200 bg-white px-3 py-2 text-sm text-gray-900 outline-none focus:border-gray-400"
          rows={3}
          value={custom}
          placeholder={t("research.customPlaceholder")}
          onChange={(event) => setCustom(event.target.value)}
        />
        <button
          type="button"
          className="btn-primary mt-2 text-xs"
          disabled={!custom.trim()}
          onClick={() => ask(custom)}
        >
          {t("research.askChat")}
        </button>
      </div>
    </div>
  );
}
