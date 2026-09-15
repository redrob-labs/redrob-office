export type AppLocale = "en" | "ko";

export const APP_LOCALES: readonly AppLocale[] = ["en", "ko"] as const;

export type MessageTree = {
  readonly [key: string]: string | MessageTree;
};

export function detectBrowserLocale(): AppLocale {
  if (typeof navigator === "undefined") {
    return "en";
  }
  const candidates = [navigator.language, ...(navigator.languages ?? [])];
  for (const candidate of candidates) {
    if (candidate.toLowerCase().startsWith("ko")) {
      return "ko";
    }
  }
  return "en";
}

export function lookupMessage(
  tree: MessageTree,
  path: string,
  vars?: Readonly<Record<string, string | number>>,
): string {
  const parts = path.split(".");
  let current: string | MessageTree | undefined = tree;
  for (const part of parts) {
    if (current === undefined || typeof current === "string") {
      return path;
    }
    current = current[part];
  }
  if (typeof current !== "string") {
    return path;
  }
  if (!vars) {
    return current;
  }
  return current.replace(/\{(\w+)\}/g, (_match, key: string) => {
    const value = vars[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}
