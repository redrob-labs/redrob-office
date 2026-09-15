import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useI18n } from "@redrob/ui";
import { BrandLogo } from "./BrandLogo";

/** v5 dropped the task-catalog stops: the tour now walks chat, skills, documents. */
export const PRODUCT_TOUR_STORAGE_KEY = "redrob.productTour.v5";

export type TourTab =
  | "chat"
  | "work"
  | "flows"
  | "documents"
  | "device"
  | "settings";

type TourStepDef = {
  id: string;
  kind: "welcome" | "intro" | "spotlight" | "finish";
  target?: string;
  tab?: TourTab;
  titleKey: string;
  bodyKey?: string;
};

const STEPS: readonly TourStepDef[] = [
  {
    id: "welcome",
    kind: "welcome",
    tab: "chat",
    titleKey: "tour.welcomeTitle",
    bodyKey: "tour.welcomeBody",
  },
  {
    id: "privacy",
    kind: "intro",
    tab: "chat",
    titleKey: "tour.privacyTitle",
    bodyKey: "tour.privacyBody",
  },
  {
    id: "warmup",
    kind: "intro",
    tab: "chat",
    titleKey: "tour.warmupTitle",
    bodyKey: "tour.warmupBody",
  },
  {
    id: "speed",
    kind: "intro",
    tab: "chat",
    titleKey: "tour.speedTitle",
    bodyKey: "tour.speedBody",
  },
  {
    id: "chat",
    kind: "spotlight",
    target: "chat-panel",
    tab: "chat",
    titleKey: "tour.chatTitle",
    bodyKey: "tour.chatBody",
  },
  {
    id: "flows",
    kind: "spotlight",
    target: "nav-flows",
    tab: "flows",
    titleKey: "tour.flowsTitle",
    bodyKey: "tour.flowsBody",
  },
  {
    id: "documents",
    kind: "spotlight",
    target: "nav-documents",
    tab: "documents",
    titleKey: "tour.documentsTitle",
    bodyKey: "tour.documentsBody",
  },
  {
    id: "finish",
    kind: "finish",
    tab: "chat",
    titleKey: "tour.finishTitle",
    bodyKey: "tour.finishBody",
  },
] as const;

const INTRO_ICON_PATHS: Record<string, string[]> = {
  privacy: [
    "M12 3l7 3v5c0 5-3.5 8-7 9-3.5-1-7-4-7-9V6l7-3z",
    "M9 12l2 2 4-4",
  ],
  warmup: ["M12 4v0a8 8 0 1 0 0 16 8 8 0 0 0 0-16z", "M12 8v4l3 2"],
  speed: ["M13 2 4 14h6l-1 8 9-12h-6l1-8z"],
};

function IntroIcon({ id }: { id: string }): JSX.Element | null {
  const paths = INTRO_ICON_PATHS[id];
  if (!paths) return null;
  return (
    <svg
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.75}
      strokeLinecap="round"
      strokeLinejoin="round"
      className="h-7 w-7 text-white"
      aria-hidden
    >
      {paths.map((d) => (
        <path key={d} d={d} />
      ))}
    </svg>
  );
}

type Rect = { top: number; left: number; width: number; height: number };

function readRect(el: Element | null): Rect | null {
  if (!el) return null;
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return null;
  return {
    top: r.top,
    left: r.left,
    width: r.width,
    height: r.height,
  };
}

function inflate(rect: Rect, pad: number): Rect {
  return {
    top: rect.top - pad,
    left: rect.left - pad,
    width: rect.width + pad * 2,
    height: rect.height + pad * 2,
  };
}

function clamp(n: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, n));
}

function isTourDone(): boolean {
  try {
    return localStorage.getItem(PRODUCT_TOUR_STORAGE_KEY) === "done";
  } catch {
    return false;
  }
}

export function markTourDone(): void {
  try {
    localStorage.setItem(PRODUCT_TOUR_STORAGE_KEY, "done");
  } catch {
    // ignore
  }
}

export function clearTourDone(): void {
  try {
    localStorage.removeItem(PRODUCT_TOUR_STORAGE_KEY);
  } catch {
    // ignore
  }
}

export function shouldStartProductTour(): boolean {
  if (typeof window !== "undefined" && window.location.search.includes("notour")) {
    return false;
  }
  return !isTourDone();
}

type ProductTourProps = {
  onTabChange: (tab: TourTab) => void;
  onExpandSidebar: () => void;
  onComplete: () => void;
};

export function ProductTour({
  onTabChange,
  onExpandSidebar,
  onComplete,
}: ProductTourProps): JSX.Element {
  const { t } = useI18n();
  const [index, setIndex] = useState(0);
  const [targetRect, setTargetRect] = useState<Rect | null>(null);
  const [cardSize, setCardSize] = useState({ w: 360, h: 220 });
  const [visible, setVisible] = useState(false);

  const step = STEPS[index] ?? STEPS[0]!;
  const total = STEPS.length;
  const spotlightTotal = STEPS.filter((s) => s.kind === "spotlight").length;
  const spotlightCurrent = STEPS.slice(0, index + 1).filter(
    (s) => s.kind === "spotlight",
  ).length;
  const progress = spotlightCurrent / Math.max(1, spotlightTotal);
  const introSteps = useMemo(
    () => STEPS.filter((s) => s.kind === "intro"),
    [],
  );
  const introIndex = introSteps.findIndex((s) => s.id === step.id);

  const measure = useCallback(() => {
    if (step.kind !== "spotlight" || !step.target) {
      setTargetRect((prev) => (prev === null ? prev : null));
      return;
    }
    const el = document.querySelector(`[data-tour="${step.target}"]`);
    const next = readRect(el);
    setTargetRect((prev) => {
      if (!prev && !next) return prev;
      if (!prev || !next) return next;
      if (
        Math.abs(prev.top - next.top) < 1 &&
        Math.abs(prev.left - next.left) < 1 &&
        Math.abs(prev.width - next.width) < 1 &&
        Math.abs(prev.height - next.height) < 1
      ) {
        return prev;
      }
      return next;
    });
  }, [step]);

  useEffect(() => {
    onExpandSidebar();
    if (step.tab) onTabChange(step.tab);
    // Intentionally only re-run when the step changes; parent callbacks are unstable.
    // eslint-disable-next-line react-hooks/exhaustive-deps -- step-driven side effects
  }, [step.id, step.tab]);

  // Mount once — keep the card visible between intro/welcome steps (no opacity flash).
  useEffect(() => {
    setVisible(true);
  }, []);

  const prevKindRef = useRef(step.kind);
  useLayoutEffect(() => {
    const prevKind = prevKindRef.current;
    prevKindRef.current = step.kind;
    measure();

    // Only fade when crossing into/out of spotlight (hole overlay appears/disappears).
    const crossedSpotlight =
      (prevKind === "spotlight") !== (step.kind === "spotlight");
    if (!crossedSpotlight) return;

    setVisible(false);
    const timer = window.setTimeout(() => setVisible(true), 40);
    return () => window.clearTimeout(timer);
  }, [measure, index, step.kind]);

  useEffect(() => {
    if (step.kind !== "spotlight") return;
    const onResize = (): void => measure();
    window.addEventListener("resize", onResize);
    window.addEventListener("scroll", onResize, true);
    const timer = window.setInterval(measure, 500);
    return () => {
      window.removeEventListener("resize", onResize);
      window.removeEventListener("scroll", onResize, true);
      window.clearInterval(timer);
    };
  }, [measure, step.kind]);

  const cardRef = useRef<HTMLDivElement | null>(null);
  useLayoutEffect(() => {
    const node = cardRef.current;
    if (!node) return;
    const r = node.getBoundingClientRect();
    setCardSize((prev) => {
      if (Math.abs(r.width - prev.w) <= 2 && Math.abs(r.height - prev.h) <= 2) {
        return prev;
      }
      return { w: r.width, h: r.height };
    });
  }, [index, step.id]);

  const hole = useMemo(
    () => (targetRect ? inflate(targetRect, 8) : null),
    [targetRect],
  );

  const cardPos = useMemo(() => {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const cw = cardSize.w;
    const ch = cardSize.h;
    const margin = 20;

    if (!hole || step.kind !== "spotlight") {
      return {
        left: (vw - cw) / 2,
        top: Math.max(margin, (vh - ch) / 2 - 24),
        side: "center" as const,
      };
    }

    const spaceRight = vw - (hole.left + hole.width);
    const spaceLeft = hole.left;
    const spaceBottom = vh - (hole.top + hole.height);
    const spaceTop = hole.top;

    type Side = "right" | "left" | "bottom" | "top";
    const ranked: Side[] = (
      [
        ["right", spaceRight],
        ["left", spaceLeft],
        ["bottom", spaceBottom],
        ["top", spaceTop],
      ] as Array<[Side, number]>
    )
      .sort((a, b) => b[1] - a[1])
      .map(([side]) => side);

    const gap = 28;
    for (const side of ranked) {
      if (side === "right" && spaceRight >= cw + gap) {
        return {
          left: hole.left + hole.width + gap,
          top: clamp(hole.top + hole.height / 2 - ch / 2, margin, vh - ch - margin),
          side,
        };
      }
      if (side === "left" && spaceLeft >= cw + gap) {
        return {
          left: hole.left - cw - gap,
          top: clamp(hole.top + hole.height / 2 - ch / 2, margin, vh - ch - margin),
          side,
        };
      }
      if (side === "bottom" && spaceBottom >= ch + gap) {
        return {
          left: clamp(hole.left + hole.width / 2 - cw / 2, margin, vw - cw - margin),
          top: hole.top + hole.height + gap,
          side,
        };
      }
      if (side === "top" && spaceTop >= ch + gap) {
        return {
          left: clamp(hole.left + hole.width / 2 - cw / 2, margin, vw - cw - margin),
          top: hole.top - ch - gap,
          side,
        };
      }
    }

    return {
      left: clamp(hole.left + hole.width + gap, margin, vw - cw - margin),
      top: clamp(hole.top, margin, vh - ch - margin),
      side: "right" as const,
    };
  }, [hole, cardSize, step.kind]);

  const arrow = useMemo(() => {
    if (!hole || step.kind !== "spotlight") return null;
    const cardCx = cardPos.left + cardSize.w / 2;
    const cardCy = cardPos.top + cardSize.h / 2;
    const holeCx = hole.left + hole.width / 2;
    const holeCy = hole.top + hole.height / 2;

    let x1 = cardCx;
    let y1 = cardCy;
    let x2 = holeCx;
    let y2 = holeCy;

    if (cardPos.side === "right") {
      x1 = cardPos.left;
      y1 = cardCy;
      x2 = hole.left + hole.width;
      y2 = holeCy;
    } else if (cardPos.side === "left") {
      x1 = cardPos.left + cardSize.w;
      y1 = cardCy;
      x2 = hole.left;
      y2 = holeCy;
    } else if (cardPos.side === "bottom") {
      x1 = cardCx;
      y1 = cardPos.top;
      x2 = holeCx;
      y2 = hole.top + hole.height;
    } else if (cardPos.side === "top") {
      x1 = cardCx;
      y1 = cardPos.top + cardSize.h;
      x2 = holeCx;
      y2 = hole.top;
    }

    const dx = x2 - x1;
    const dy = y2 - y1;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (-dy / len) * Math.min(48, len * 0.25);
    const oy = (dx / len) * Math.min(48, len * 0.25);
    const c1x = x1 + dx * 0.35 + ox;
    const c1y = y1 + dy * 0.35 + oy;
    const c2x = x1 + dx * 0.65 + ox;
    const c2y = y1 + dy * 0.65 + oy;

    return {
      d: `M ${x1} ${y1} C ${c1x} ${c1y}, ${c2x} ${c2y}, ${x2} ${y2}`,
      tipX: x2,
      tipY: y2,
      angle: (Math.atan2(y2 - c2y, x2 - c2x) * 180) / Math.PI,
    };
  }, [hole, cardPos, cardSize, step.kind]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === "Escape") {
        markTourDone();
        onComplete();
        return;
      }
      if (event.key === "ArrowLeft") {
        event.preventDefault();
        setIndex((i) => Math.max(0, i - 1));
        return;
      }
      if (event.key === "ArrowRight" || event.key === "Enter") {
        event.preventDefault();
        if (index >= STEPS.length - 1) {
          markTourDone();
          onComplete();
          return;
        }
        setIndex((i) => i + 1);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [index, onComplete]);

  function finish(): void {
    markTourDone();
    onComplete();
  }

  function next(): void {
    if (index >= total - 1) {
      finish();
      return;
    }
    setIndex((i) => i + 1);
  }

  function back(): void {
    if (index <= 0) return;
    setIndex((i) => i - 1);
  }

  const isCenter =
    step.kind === "welcome" || step.kind === "intro" || step.kind === "finish";
  const showSkip = step.kind === "intro" || step.kind === "spotlight";

  return (
    <div
      className="tour-root fixed inset-0 z-[80]"
      role="dialog"
      aria-modal="true"
      aria-label={t("tour.aria")}
    >
      {/* Blocks clicks into the app while the tour is open */}
      <div className="absolute inset-0 z-0" aria-hidden />

      {/* Dim + spotlight hole */}
      <div className="pointer-events-none absolute inset-0 z-[1]">
        {hole ? (
          <div
            className={`tour-hole absolute rounded transition-all duration-300 ease-[cubic-bezier(0.2,0.8,0.2,1)] ${
              visible ? "opacity-100" : "opacity-0"
            }`}
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
              /*
               * The sheet over the rest of the window, then the brand ring around the hole in it.
               * Both from tokens: `--overlay` is the sheet the product draws over everything, and
               * the ring is the accent, so the coachmark is the same blue as the button it points at.
               */
              boxShadow: [
                "0 0 0 9999px var(--overlay)",
                "0 0 0 3px color-mix(in srgb, var(--primary) 55%, transparent)",
                "0 12px 40px color-mix(in srgb, var(--primary) 25%, transparent)",
              ].join(", "),
            }}
          />
        ) : (
          <div
            className={`absolute inset-0 bg-overlay transition-opacity duration-300 ${
              visible ? "opacity-100" : "opacity-0"
            }`}
          />
        )}
        {hole ? (
          <div
            className="tour-pulse pointer-events-none absolute rounded ring-2 ring-brand-400/70"
            style={{
              top: hole.top,
              left: hole.left,
              width: hole.width,
              height: hole.height,
            }}
          />
        ) : null}
      </div>

      {/* Curved arrow */}
      {arrow && visible ? (
        <svg
          key={step.id}
          className="pointer-events-none absolute inset-0 z-[2] h-full w-full overflow-visible"
          aria-hidden
        >
          <defs>
            <linearGradient id="tour-arrow-grad" x1="0%" y1="0%" x2="100%" y2="0%">
              {/* The accent fading in, not a blue of its own. Colour in `styles.css`. */}
              <stop className="tour-arrow-stop" offset="0%" stopOpacity="0.2" />
              <stop className="tour-arrow-stop" offset="100%" stopOpacity="1" />
            </linearGradient>
          </defs>
          <path
            d={arrow.d}
            fill="none"
            stroke="url(#tour-arrow-grad)"
            strokeWidth="2.5"
            strokeLinecap="round"
            pathLength={1}
            className="tour-arrow-path"
          />
          <g
            transform={`translate(${arrow.tipX}, ${arrow.tipY}) rotate(${arrow.angle})`}
          >
            <path d="M -10 -6 L 0 0 L -10 6 Z" className="tour-arrow-head" />
          </g>
        </svg>
      ) : null}

      {/* Floating orbs on welcome/finish */}
      {isCenter ? (
        <div className="pointer-events-none absolute inset-0 overflow-hidden" aria-hidden>
          <div className="tour-orb tour-orb-a absolute -left-24 top-16 h-72 w-72 rounded-full bg-brand-500/30 blur-3xl" />
          <div className="tour-orb tour-orb-b absolute -right-16 bottom-10 h-80 w-80 rounded-full bg-blue-300/25 blur-3xl" />
          <div className="tour-orb tour-orb-c absolute left-1/3 top-1/4 h-40 w-40 rounded-full bg-white/10 blur-2xl" />
        </div>
      ) : null}

      {/* Coach card */}
      <div
        ref={cardRef}
        className={`tour-card absolute z-[3] w-[min(22.5rem,calc(100vw-2rem))] rounded bg-white p-5 shadow-[var(--shadow-elevated)] transition-[opacity,transform] duration-200 ease-out dark:border dark:border-gray-800 dark:bg-gray-900 ${
          visible
            ? "translate-y-0 scale-100 opacity-100"
            : "translate-y-1 scale-[0.99] opacity-0"
        } ${isCenter ? "text-center" : "text-left"}`}
        style={{ left: cardPos.left, top: cardPos.top }}
      >
        {step.kind === "welcome" ? (
          <div className="mb-4 flex justify-center">
            <div className="relative flex h-16 w-16 items-center justify-center rounded bg-gradient-to-br from-brand-500 to-blue-700 shadow-lg shadow-brand-500/30">
              <BrandLogo variant="mark" theme="onDark" className="h-8 w-8" />
              <span className="tour-spark absolute -right-1 -top-1 h-3 w-3 rounded-full bg-warning" />
            </div>
          </div>
        ) : null}

        {step.kind === "intro" ? (
          <div className="mb-4 flex justify-center">
            <div className="flex h-14 w-14 items-center justify-center rounded bg-gradient-to-br from-brand-500 to-blue-700 shadow-lg shadow-brand-500/25">
              <IntroIcon id={step.id} />
            </div>
          </div>
        ) : null}

        {step.kind === "finish" ? (
          <div className="mb-4 flex justify-center" aria-hidden>
            <div className="tour-finish-burst relative flex h-16 w-16 items-center justify-center rounded-full bg-primary-soft text-3xl">
              ✦
            </div>
          </div>
        ) : null}

        {!isCenter ? (
          <p className="mb-2 text-[0.6875rem] font-semibold uppercase tracking-[0.08em] text-brand-600 dark:text-brand-300">
            {t("tour.step", { current: spotlightCurrent, total: spotlightTotal })}
          </p>
        ) : null}

        <h2 className="text-[1.35rem] font-bold leading-snug tracking-tight text-gray-900 dark:text-white">
          {t(step.titleKey)}
        </h2>
        {step.bodyKey ? (
          <p className="mt-2 text-[0.9375rem] leading-relaxed text-gray-500 dark:text-gray-400">
            {t(step.bodyKey)}
          </p>
        ) : null}

        {step.kind === "intro" ? (
          <div className="mt-4 flex items-center justify-center gap-1.5" aria-hidden>
            {introSteps.map((s, i) => (
              <span
                key={s.id}
                className={`h-1.5 rounded-full transition-all duration-300 ${
                  i === introIndex
                    ? "w-5 bg-brand-500"
                    : "w-1.5 bg-gray-200 dark:bg-gray-700"
                }`}
              />
            ))}
          </div>
        ) : null}

        <div
          className={`mt-5 flex items-center gap-2 ${
            showSkip ? "justify-between" : "justify-center"
          }`}
        >
          {showSkip ? (
            <button
              type="button"
              className="text-sm font-medium text-gray-400 transition-colors hover:text-gray-700 dark:hover:text-gray-200"
              onClick={finish}
            >
              {t("tour.skip")}
            </button>
          ) : (
            <span className="w-0" />
          )}

          <div className="flex items-center gap-2">
            {index > 0 && step.kind !== "finish" ? (
              <button type="button" className="btn-secondary" onClick={back}>
                {t("tour.back")}
              </button>
            ) : null}
            <button type="button" className="btn-primary min-w-[6.5rem]" onClick={next}>
              {step.kind === "welcome"
                ? t("tour.start")
                : step.kind === "finish"
                  ? t("tour.done")
                  : t("tour.next")}
            </button>
          </div>
        </div>

        {!isCenter ? (
          <div className="mt-4 h-1 overflow-hidden rounded-full bg-gray-100 dark:bg-gray-800">
            <div
              className="h-full rounded-full bg-brand-500 transition-[width] duration-300 ease-out"
              style={{ width: `${Math.max(8, progress * 100)}%` }}
            />
          </div>
        ) : null}
      </div>
    </div>
  );
}
