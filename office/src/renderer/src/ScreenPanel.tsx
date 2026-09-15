import { useState } from "react";
import { useI18n } from "@redrob/ui";
import { handleSubmitHotkey } from "./submit-hotkey";
import { mapDeskError } from "./desk-errors";

export function ScreenPanel(): JSX.Element {
  const { t } = useI18n();
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<Array<{ id: string; path: string; score: number }>>([]);

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    try {
      const raw = (await window.office.runScreenRank({ query, k: 20 })) as {
        items: Array<{ id: string; path: string; score: number }>;
        method: string;
      };
      setItems(raw.items);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(mapDeskError(message, t));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="panel"
      onKeyDown={(event) =>
        handleSubmitHotkey(event, !busy && query.trim().length > 0, () => void run())
      }
    >
      <div className="surface p-6">
        <p className="text-lg font-semibold tracking-tight">{t("screen.title")}</p>
        <p className="mt-1.5 text-sm leading-relaxed text-gray-500">{t("screen.body")}</p>
        <label className="mt-4 block">
          <span className="field-label">{t("screen.query")}</span>
          <textarea
            className="field-input min-h-32"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("screen.queryHint")}
          />
        </label>
        <div>
          <button
            type="button"
            className="btn-primary mt-5"
            disabled={busy || query.trim().length === 0}
            onClick={() => void run()}
          >
            {busy ? t("screen.working") : t("screen.run")}
          </button>
        </div>
        {error ? (
          <p className="mt-4 rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
        ) : null}
      </div>
      {items.length > 0 ? (
        <div className="surface p-6">
          <p className="font-semibold tracking-tight">{t("screen.results")}</p>
          <ol className="mt-4 space-y-3">
            {items.map((item, index) => (
              <li
                key={item.id}
                className="flex items-center justify-between gap-3 rounded bg-gray-50 px-4 py-3 text-sm ring-1 ring-inset ring-gray-300"
              >
                <span className="min-w-0 truncate font-medium">
                  <span className="mr-2 text-gray-400">{index + 1}.</span>
                  {item.path.split(/[/\\]/).pop() || item.path}
                </span>
                <span className="shrink-0 text-gray-500">{(item.score * 100).toFixed(0)}%</span>
              </li>
            ))}
          </ol>
        </div>
      ) : null}
    </div>
  );
}
