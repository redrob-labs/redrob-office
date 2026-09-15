import { useEffect, useRef, useState } from "react";
import { useI18n } from "@redrob/ui";
import type { CompanyProfileView } from "../../shared/office-api";
import { assembleJdMarkdown, emptyCompanyProfile } from "../../shared/jd-assemble";
import { handleSubmitHotkey } from "./submit-hotkey";
import { estimateOperationMs, useWorkResult } from "./work-result";
import { mapDeskError } from "./desk-errors";

const LENGTH_OPTIONS = [
  { value: 256, key: "short" },
  { value: 512, key: "medium" },
  { value: 1024, key: "long" },
] as const;

const DEFAULT_MAX_TOKENS = 512;
const PLACEHOLDER_ONLY =
  /^(몰라|모름|알아서|대충|아무거나|개발해야겠지|todo|tbd|n\/?a|없음|xxx+|asdf+|test|테스트)$/i;

function previewValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "string") return value;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  if (Array.isArray(value)) {
    return value
      .map((item) => previewValue(item))
      .filter((item) => item && item !== "—")
      .join("\n");
  }
  if (typeof value === "object") {
    const obj = value as Record<string, unknown>;
    if (typeof obj.text === "string") return obj.text;
    if (typeof obj.value === "string") return obj.value;
    if (typeof obj.content === "string") return obj.content;
    if (Array.isArray(obj.items)) return previewValue(obj.items);
    if (Array.isArray(obj.lines)) return previewValue(obj.lines);
  }
  try {
    return JSON.stringify(value);
  } catch {
    return "—";
  }
}

function slotTextFromStream(value: unknown): string {
  const text = previewValue(value);
  return text === "—" ? "" : text.trim();
}

function isPlaceholderBlob(text: string): boolean {
  const compact = text.replace(/\s+/g, " ").trim();
  if (!compact) return true;
  if (PLACEHOLDER_ONLY.test(compact)) return true;
  const lines = compact.split(/\n/).map((l) => l.replace(/^[-•*]\s*/, "").trim());
  return lines.length > 0 && lines.every((line) => PLACEHOLDER_ONLY.test(line));
}

/** Non-empty and not a joke placeholder — the model expands short notes. */
function bodyLooksReady(text: string): boolean {
  const trimmed = text.trim();
  return Boolean(trimmed) && !isPlaceholderBlob(trimmed);
}

function slotIdFromStream(path: string, streamTarget: string): string {
  const raw = (streamTarget || path).replace(/^\//, "");
  return raw.split("/").pop() ?? raw;
}

function profileHasContent(profile: CompanyProfileView): boolean {
  return Boolean(
    profile.name.trim() ||
      profile.about.trim() ||
      profile.benefits.trim() ||
      profile.workConditions.trim() ||
      profile.applicationProcess.trim(),
  );
}

export function JdPanel(): JSX.Element {
  const { t, locale } = useI18n();
  const { setResult, setLiveBody, startProgress, failProgress, clearProgress } = useWorkResult();
  const [roleTitle, setRoleTitle] = useState("");
  const [responsibilities, setResponsibilities] = useState("");
  const [qualifications, setQualifications] = useState("");
  const [location, setLocation] = useState("");
  const [maxTokens, setMaxTokens] = useState(DEFAULT_MAX_TOKENS);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [liveSlot, setLiveSlot] = useState<{ target: string; value: string } | null>(null);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfileView>(emptyCompanyProfile());
  const [sourceUrl, setSourceUrl] = useState("");
  const [fetchBusy, setFetchBusy] = useState(false);
  const slotsRef = useRef<Record<string, string>>({});
  const profileRef = useRef(companyProfile);
  profileRef.current = companyProfile;

  useEffect(() => {
    void window.office
      .getDeskProfile()
      .then((p) => setCompanyProfile(p.company))
      .catch(() => setCompanyProfile(emptyCompanyProfile()));
  }, []);

  useEffect(() => {
    return window.office.onSlotStream((event) => {
      if (event.operation !== "draftJd") return;
      const id = slotIdFromStream(event.path, event.streamTarget);
      const value = previewValue(event.value);
      setLiveSlot({ target: event.streamTarget, value });
      const text = slotTextFromStream(event.value);
      if (text) {
        slotsRef.current = { ...slotsRef.current, [id]: text };
        setLiveBody(assembleJdMarkdown(slotsRef.current, profileRef.current, locale));
      }
    });
  }, [locale, setLiveBody]);

  async function importFromUrl(): Promise<void> {
    const url = sourceUrl.trim();
    if (!url || fetchBusy) return;
    setFetchBusy(true);
    setError(null);
    try {
      const page = await window.office.fetchPage({ url });
      if (page.blocked) {
        setError(t("jd.urlChallenge"));
      }
      const blob = [page.title, page.text].filter(Boolean).join("\n\n").trim();
      if (!blob) {
        setError(t("jd.urlEmpty"));
        return;
      }
      // Seed facts; title guess from page title when role is empty.
      if (!roleTitle.trim() && page.title.trim()) {
        setRoleTitle(page.title.trim().slice(0, 120));
      }
      setResponsibilities((prev) =>
        prev.trim() ? `${prev.trim()}\n\n${blob.slice(0, 6000)}` : blob.slice(0, 6000),
      );
      if (!qualifications.trim()) {
        setQualifications(t("jd.urlQualSeed"));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setFetchBusy(false);
    }
  }

  async function run(): Promise<void> {
    setBusy(true);
    setError(null);
    setWarnings([]);
    setLiveSlot(null);
    slotsRef.current = {};
    setLiveBody(null);
    const etaMs = await estimateOperationMs("draftJd", 45_000);
    startProgress({
      operation: "draftJd",
      title: t("jd.preview"),
      etaMs,
      steps: [
        { id: "prepare", label: t("progress.jd.prepare"), status: "active" },
        { id: "model", label: t("progress.jd.model"), status: "pending" },
        { id: "generate", label: t("progress.jd.generate"), status: "pending" },
        { id: "save", label: t("progress.jd.save"), status: "pending" },
      ],
    });
    try {
      const result = (await window.office.draftJd({
        roleTitle,
        responsibilities,
        qualifications,
        maxTokens,
        locale,
        ...(location.trim() ? { location } : {}),
      })) as {
        markdown: string;
        source?: "model" | "template";
        timingMs?: number;
        modelError?: string;
        warnings?: string[];
        unfilled?: string[];
      };
      const qualityNotes = (result.warnings ?? []).map((code) => mapDeskError(code, t));
      setWarnings(qualityNotes);
      setResult({
        title: t("jd.preview"),
        body: result.markdown,
        ...(result.source ? { source: result.source } : {}),
        meta: [
          typeof result.timingMs === "number" ? `${Math.round(result.timingMs)} ms` : null,
          result.source === "template" || result.modelError ? t("jd.modelFallback") : null,
          result.unfilled && result.unfilled.length > 0
            ? t("jd.warnings.unfilled", { slots: result.unfilled.join(", ") })
            : null,
        ]
          .filter(Boolean)
          .join(" · "),
      });
      if (result.modelError) {
        setError(t("jd.modelFallbackDetail", { error: result.modelError }));
      }
    } catch (err) {
      failProgress();
      clearProgress();
      const message = err instanceof Error ? err.message : String(err);
      setError(mapDeskError(message, t));
    } finally {
      setBusy(false);
      setLiveSlot(null);
    }
  }

  const ready =
    roleTitle.trim().length >= 2 &&
    bodyLooksReady(responsibilities) &&
    bodyLooksReady(qualifications);

  return (
    <div
      className="flex flex-col gap-4"
      onKeyDown={(event) => handleSubmitHotkey(event, !busy && ready, () => void run())}
    >
      <p className="text-sm leading-relaxed text-gray-500">{t("jd.body")}</p>
      {!profileHasContent(companyProfile) ? (
        <p className="rounded border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-500">
          {t("jd.companyHint")}
        </p>
      ) : null}
      <label className="block">
        <span className="field-label">{t("jd.sourceUrl")}</span>
        <div className="flex flex-wrap gap-2">
          <input
            className="field-input min-w-0 flex-1"
            value={sourceUrl}
            onChange={(event) => setSourceUrl(event.target.value)}
            placeholder={t("jd.sourceUrlHint")}
            disabled={busy || fetchBusy}
          />
          <button
            type="button"
            className="btn-secondary shrink-0"
            disabled={busy || fetchBusy || !sourceUrl.trim()}
            onClick={() => void importFromUrl()}
          >
            {fetchBusy ? t("jd.urlFetching") : t("jd.urlFetch")}
          </button>
        </div>
        <span className="mt-1 block text-xs text-gray-400">{t("jd.sourceUrlHelp")}</span>
      </label>
      <label className="block">
        <span className="field-label">{t("jd.roleTitle")}</span>
        <input
          className="field-input"
          value={roleTitle}
          onChange={(event) => setRoleTitle(event.target.value)}
          placeholder={t("jd.roleTitleHint")}
        />
      </label>
      <label className="block">
        <span className="field-label">{t("jd.responsibilities")}</span>
        <textarea
          className="field-input min-h-28"
          value={responsibilities}
          onChange={(event) => setResponsibilities(event.target.value)}
          placeholder={t("jd.responsibilitiesHint")}
        />
      </label>
      <label className="block">
        <span className="field-label">{t("jd.qualifications")}</span>
        <textarea
          className="field-input min-h-28"
          value={qualifications}
          onChange={(event) => setQualifications(event.target.value)}
          placeholder={t("jd.qualificationsHint")}
        />
      </label>
      <label className="block">
        <span className="field-label">{t("jd.location")}</span>
        <input
          className="field-input"
          value={location}
          onChange={(event) => setLocation(event.target.value)}
          placeholder={t("jd.locationHint")}
        />
      </label>
      <label className="block">
        <span className="field-label">{t("jd.length")}</span>
        <select
          className="field-input"
          value={maxTokens}
          onChange={(event) => setMaxTokens(Number(event.target.value))}
        >
          {LENGTH_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {t(`jd.lengthOption.${option.key}`)}
            </option>
          ))}
        </select>
        <span className="mt-1 block text-xs text-gray-400">{t("jd.lengthHint")}</span>
      </label>
      <button type="button" className="btn-primary self-start" disabled={busy || !ready} onClick={() => void run()}>
        {busy ? t("jd.working") : t("jd.run")}
      </button>
      {busy && liveSlot ? (
        <p className="truncate text-xs text-gray-500">
          {t("jd.slotStream", { target: liveSlot.target, value: liveSlot.value })}
        </p>
      ) : null}
      {error ? (
        <p className="rounded border border-destructive-muted bg-destructive-soft p-3 text-sm text-destructive-ink">{error}</p>
      ) : null}
      {warnings.length > 0 ? (
        <ul className="space-y-2 rounded border border-warning-muted bg-warning-soft p-3 text-sm text-warning-ink">
          {warnings.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
