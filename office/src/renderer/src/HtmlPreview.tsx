import { useMemo } from "react";
import { useI18n } from "@redrob/ui";

/**
 * Sandboxed HTML preview.
 *
 * Scripts run, because a page whose scripts do not run is not a preview of it:
 * asked for a five-slide deck with arrow-key navigation, the person saw slide
 * one and no way to leave it, and could not tell whether their deck worked.
 *
 * `allow-scripts` without `allow-same-origin` is the point: the frame gets an
 * opaque origin, so it cannot read this window, the app's storage, or anything
 * else of the person's. Top-level navigation, popups and forms stay unlisted.
 */
export function HtmlPreview({ source }: { source: string }): JSX.Element {
  const { t } = useI18n();
  const srcdoc = useMemo(() => {
    const trimmed = source.trim();
    if (!trimmed) return "<!doctype html><html><body></body></html>";
    if (/^<!doctype html/i.test(trimmed) || /^<html[\s>]/i.test(trimmed)) {
      return trimmed;
    }
    /*
     * The frame has an opaque origin, which is the point of the sandbox above, so it cannot fetch
     * `/fonts/PretendardVariable.woff2` from this one and cannot read a custom property declared out
     * here either. Pretendard is named anyway, for a machine that has it installed, and the values
     * are Gray 9 written out. This is the one renderer surface where the token layer does not reach.
     */
    return `<!doctype html><html><head><meta charset="utf-8" /><style>
      body{font-family:Pretendard,system-ui,sans-serif;margin:1.25rem;line-height:1.5;color:#141719}
    </style></head><body>${trimmed}</body></html>`;
  }, [source]);

  return (
    <div className="overflow-hidden rounded bg-white ring-1 ring-inset ring-gray-300">
      <p className="border-b border-gray-200 px-3 py-1.5 text-[0.6875rem] font-medium text-gray-400">
        {t("workbench.htmlPreview")}
      </p>
      <iframe
        title={t("workbench.htmlPreview")}
        className="min-h-[24rem] w-full border-0 bg-white"
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        srcDoc={srcdoc}
      />
    </div>
  );
}
