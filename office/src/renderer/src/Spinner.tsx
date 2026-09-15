type SpinnerProps = {
  /** Matches the surrounding text size by default. */
  className?: string;
  /** Read out instead of the ring, which carries no meaning on its own. */
  label?: string;
};

/**
 * The one busy indicator. A ring that turns says "still going" without
 * claiming to know how far along it is, which is the honest answer for work
 * whose length nobody can predict.
 *
 * `motion-reduce` swaps the spin for a pulse rather than dropping the signal:
 * a frozen ring next to the word "Loading" reads as a hang.
 */
export function Spinner({ className, label }: SpinnerProps): JSX.Element {
  return (
    <span
      className={`inline-block shrink-0 animate-spin rounded-full border-2 border-current border-r-transparent align-[-0.125em] motion-reduce:animate-pulse ${
        className?.trim() ? className : "h-4 w-4"
      }`}
      role={label ? "status" : undefined}
      aria-label={label}
      aria-hidden={label ? undefined : true}
    />
  );
}

/**
 * A whole panel that has nothing to show yet. The ring carries the waiting and
 * the sentence says what is being waited on.
 */
export function LoadingBlock({ label }: { label: string }): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-2.5 py-10 text-sm text-gray-500">
      <Spinner className="h-4 w-4 text-gray-400" label={label} />
      <span>{label}</span>
    </div>
  );
}
