/*
 * Asset paths here are relative on purpose.
 *
 * These files live in `public/`, which Vite copies verbatim and never
 * rewrites, so whatever is written is what ships. In the packaged app the
 * window is loaded with `loadFile`, so the document is a `file://` URL and a
 * leading slash resolves to the root of the disk rather than to the bundle,
 * which is why the logo was missing everywhere in a build and fine in dev.
 * `index.html` already references them this way for the same reason.
 */

type BrandLogoProps = {
  variant?: "mark" | "full";
  /** `onDark` uses the square mark on its dark tile, for chat avatars and dark chrome. */
  theme?: "light" | "onDark";
  className?: string;
};

export function BrandLogo({
  variant = "full",
  theme = "light",
  className,
}: BrandLogoProps): JSX.Element {
  if (variant === "mark") {
    return (
      <img
        src={theme === "onDark" ? "./logo-on-dark.svg" : "./logo.svg"}
        alt="Redrob"
        width={24}
        height={24}
        draggable={false}
        className={className?.trim() ? className : "h-6 w-6"}
      />
    );
  }
  return (
    <img
      src="./logo-long.svg"
      alt="Redrob"
      width={120}
      height={30}
      draggable={false}
      className={className?.trim() ? className : "h-6 w-auto max-w-[7.5rem]"}
    />
  );
}

/**
 * The first thing the app shows while it works out what it is allowed to do.
 *
 * This used to be the word "Loading", which tells the reader nothing about
 * whose app is starting or whether it is stuck. The logo says whose, and one
 * turning ring says "still coming" without pretending to know how far along
 * it is.
 *
 * Deliberately the same markup and classes as the splash in `index.html`, which
 * has already been on screen since the document painted. Continuing it rather
 * than mounting something new is what makes the handoff from document to app
 * invisible instead of a flicker.
 */
export function BrandSplash({ label }: { label: string }): JSX.Element {
  return (
    <div className="brand-boot" role="status" aria-live="polite" aria-label={label}>
      <img className="brand-boot-mark" src="./logo.svg" alt="Redrob" draggable={false} />
      <span className="brand-boot-loader" />
    </div>
  );
}
