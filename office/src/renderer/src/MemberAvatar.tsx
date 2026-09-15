import type { JSX } from "react";

/** Initials for an avatar: two words give two letters, one word gives two chars. */
export function memberInitials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean);
  if (words.length === 0) return "?";
  if (words.length === 1) return words[0]!.slice(0, 2).toUpperCase();
  return `${words[0]![0]}${words[1]![0]}`.toUpperCase();
}

/**
 * The category colours a teammate is drawn in, from the accent spectrum, which is the role the
 * brand document scopes to exactly this: category distinction and point colour rather than product
 * chrome. Seven of the nine hues, and the two that are missing are missing for a reason.
 *
 * Violet is out because the initials have to stay readable in both themes. The spectrum steps from
 * level 4 on light to level 3 on dark, so the ink steps with it, White to Redrob Black, and Redrob
 * Black on Violet 3 is 4.07:1 where every other hue clears 4.5:1. Lime takes its place.
 *
 * Blue is out because it is the brand accent, and an avatar that is Redrob Blue reads as a selected
 * avatar. The spectrum's own blue, sky, is here instead, so the set still holds a blue.
 */
const TONES = [
  "bg-spectrum-sky",
  "bg-spectrum-green",
  "bg-spectrum-orange",
  "bg-spectrum-pink",
  "bg-spectrum-teal",
  "bg-spectrum-lime",
  "bg-spectrum-yellow",
] as const;

/** Same teammate keeps the same colour across the sidebar, bubbles and cards. */
export function memberTone(seed: string): string {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 100_000;
  }
  return TONES[hash % TONES.length]!;
}

export function MemberAvatar({
  name,
  seed,
  size = "md",
  className = "",
}: {
  name: string;
  /** Stable id, so a rename does not change the colour. */
  seed?: string;
  size?: "sm" | "md";
  className?: string;
}): JSX.Element {
  const box = size === "sm" ? "h-6 w-6 text-[0.625rem]" : "h-8 w-8 text-[0.6875rem]";
  return (
    <span
      aria-hidden="true"
      className={`flex shrink-0 items-center justify-center rounded font-bold text-spectrum-foreground ${box} ${memberTone(seed ?? name)} ${className}`}
    >
      {memberInitials(name)}
    </span>
  );
}
