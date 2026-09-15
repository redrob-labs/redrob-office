const LOGO_ASSETS: Readonly<Record<string, string>> = {
  "brave-search": "./integrations/brave.svg",
  "chrome-devtools": "./integrations/chrome.svg",
  discord: "./integrations/discord.svg",
  figma: "./integrations/figma.svg",
  github: "./integrations/github.svg",
  notion: "./integrations/notion.svg",
  postgres: "./integrations/postgresql.svg",
  slack: "./integrations/slack.svg",
  whatsapp: "./integrations/whatsapp.svg",
};

const NAME_ALIASES: ReadonlyArray<readonly [RegExp, string]> = [
  [/whats\s*app|whatsapp/i, "whatsapp"],
  [/discord/i, "discord"],
  [/slack/i, "slack"],
  [/chrome|browser/i, "chrome-devtools"],
  [/postgres/i, "postgres"],
  [/notion/i, "notion"],
  [/brave/i, "brave-search"],
  [/github/i, "github"],
  [/figma/i, "figma"],
];

/** Resolve only known brands; custom servers keep a neutral initials tile. */
export function mcpLogoAsset(idOrName: string): string | null {
  const normalized = idOrName.trim().toLowerCase();
  if (LOGO_ASSETS[normalized]) return LOGO_ASSETS[normalized]!;
  for (const [pattern, logoId] of NAME_ALIASES) {
    if (pattern.test(normalized)) return LOGO_ASSETS[logoId] ?? null;
  }
  return null;
}

export function McpLogo({
  idOrName,
  className = "h-5 w-5",
}: {
  idOrName: string;
  className?: string;
}): JSX.Element {
  const asset = mcpLogoAsset(idOrName);
  if (asset) {
    return (
      <img
        src={asset}
        alt=""
        aria-hidden="true"
        className={`${className} shrink-0 object-contain`}
      />
    );
  }

  return (
    <span
      aria-hidden="true"
      className={`${className} flex shrink-0 items-center justify-center rounded bg-gray-100 text-[10px] font-bold uppercase text-gray-700 dark:bg-gray-800 dark:text-gray-200`}
    >
      {idOrName.slice(0, 2)}
    </span>
  );
}
