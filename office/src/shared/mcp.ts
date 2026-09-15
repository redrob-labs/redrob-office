/**
 * Model Context Protocol (MCP) server definitions and client runtime.
 *
 * Lets users configure external MCP servers (stdio or SSE / Streamable HTTP) such as
 * Figma MCP, GitHub MCP, SQLite MCP, Postgres MCP, etc.
 * Discovered tools are surfaced to the tool registry and available to Chat turns.
 */

export type McpTransportType = "stdio" | "sse";

export interface McpServerConfig {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransportType;
  /** Command to run for stdio transport (e.g. "npx", "docker", "python") */
  command?: string | undefined;
  /** Arguments for stdio transport (e.g. ["-y", "@modelcontextprotocol/server-figma"]) */
  args?: string[] | undefined;
  /** Environment variables for the stdio process */
  env?: Record<string, string> | undefined;
  /** URL for SSE / HTTP transport */
  url?: string | undefined;
  /** Description / notes */
  description?: string | undefined;
  /** Auto-connect on app startup */
  autoConnect?: boolean | undefined;
}

export interface McpToolView {
  name: string;
  /** Full tool name including prefix, e.g. "mcp__figma__get_file" */
  fullName: string;
  serverId: string;
  serverName: string;
  description: string;
  inputSchema: Record<string, unknown>;
}

export type McpServerStatus =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error";

export interface McpServerView {
  id: string;
  name: string;
  enabled: boolean;
  transport: McpTransportType;
  command?: string | undefined;
  args?: string[] | undefined;
  env?: Record<string, string> | undefined;
  url?: string | undefined;
  description?: string | undefined;
  status: McpServerStatus;
  error?: string | undefined;
  tools: McpToolView[];
}

export interface McpConfigState {
  servers: McpServerConfig[];
}

/**
 * A string a provider will accept inside a tool name.
 *
 * Case is kept, because the tool name is what a model reads and what an
 * approval prompt is built from: `mcp__Chrome_DevTools__new_page` says which
 * server is being asked for, and `mcp__mcp_1786949012_ab3xy__new_page` does not.
 */
export function mcpToolSlug(value: string): string {
  return value.replace(/[^a-zA-Z0-9_]+/g, "_").replace(/^_+|_+$/g, "");
}

/**
 * The server a hub entry should write to, or null to add a new one.
 *
 * The hub button turns into "Configure / Reinstall" once an entry is installed,
 * so pressing it again has to land on the server that is already there. Adding
 * a second copy would leave two servers under one name, and from then on every
 * tool has to carry a slice of an internal id to say which one it came from.
 */
export function mcpInstallTarget(
  servers: readonly { id: string; name: string }[],
  name: string,
): string | null {
  const wanted = name.trim().toLowerCase();
  return servers.find((s) => s.name.trim().toLowerCase() === wanted)?.id ?? null;
}

export interface McpHubCatalogItem {
  id: string;
  name: string;
  category:
    | "communication"
    | "design"
    | "devtools"
    | "database"
    | "productivity"
    | "search";
  description: string;
  icon: string;
  author: string;
  transport: McpTransportType;
  command?: string | undefined;
  args?: string[] | undefined;
  envTemplate?: Record<string, string> | undefined;
  url?: string | undefined;
  docsUrl?: string | undefined;
}

/**
 * The servers offered for one-click install.
 *
 * Every entry is a currently published package with a documented invocation.
 * A community integration says so in its description; a vendor-hosted API is
 * never presented as an official app integration when it is not one.
 * The first generation of `@modelcontextprotocol/server-*` packages is archived
 * and marked deprecated on npm — installing one either fails outright or lands
 * a server that no longer gets fixes, so none of them appear here. A `command`
 * plus `args` here is run verbatim, so it has to be the real invocation.
 */
export const MCP_HUB_CATALOG: McpHubCatalogItem[] = [
  {
    id: "slack",
    name: "Slack",
    category: "communication",
    description:
      "Read and send Slack messages without opening the app. Community server, signed in with your own browser session.",
    icon: "Slack",
    author: "Revasser Labs",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@jtalk22/slack-mcp"],
    envTemplate: {
      SLACK_TOKEN: "your_xoxc_token_here",
      SLACK_COOKIE: "your_xoxd_cookie_here",
      SLACK_MCP_TOOLS: "essentials",
    },
    docsUrl: "https://github.com/jtalk22/slack-mcp-server#install",
  },
  {
    id: "discord",
    name: "Discord",
    category: "communication",
    description:
      "Read and send channel messages and DMs through your own Discord bot. Community server.",
    icon: "Discord",
    author: "PaSympa",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@pasympa/discord-mcp"],
    envTemplate: {
      DISCORD_TOKEN: "your_discord_bot_token_here",
      DISCORD_MCP_TOOLSETS: "discovery,messages,dm",
      DISCORD_ALLOWED_GUILDS: "your_allowed_guild_ids_here",
    },
    docsUrl: "https://github.com/PaSympa/discord-mcp#quick-start",
  },
  {
    id: "whatsapp",
    name: "WhatsApp",
    category: "communication",
    description:
      "Read, send, and schedule WhatsApp messages. Needs a connected Blueticks account.",
    icon: "WhatsApp",
    author: "Blueticks",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@blueticks/mcp"],
    envTemplate: {
      BLUETICKS_API_KEY: "bt_live_your_key_here",
    },
    docsUrl: "https://dev.blueticks.co/docs/mcp",
  },
  {
    id: "figma",
    name: "Figma",
    category: "design",
    description: "Inspect design files, components, styles, and export assets directly from Figma.",
    icon: "Figma",
    author: "Framelink",
    transport: "stdio",
    command: "npx",
    args: ["-y", "figma-developer-mcp", "--stdio"],
    envTemplate: {
      FIGMA_API_KEY: "your_figma_token_here",
    },
    docsUrl: "https://help.figma.com/hc/en-us/articles/8085703771159",
  },
  {
    id: "github",
    name: "GitHub",
    category: "devtools",
    description:
      "Search repos, read files, manage issues, pull requests, and branches. Needs Docker installed.",
    icon: "GitHub",
    author: "GitHub",
    transport: "stdio",
    command: "docker",
    args: [
      "run",
      "-i",
      "--rm",
      "-e",
      "GITHUB_PERSONAL_ACCESS_TOKEN",
      "ghcr.io/github/github-mcp-server",
    ],
    envTemplate: {
      GITHUB_PERSONAL_ACCESS_TOKEN: "your_github_token_here",
    },
    docsUrl: "https://github.com/settings/tokens",
  },
  {
    id: "brave-search",
    name: "Brave Search",
    category: "search",
    description: "Deep web and local search with privacy-first web index for live agent research.",
    icon: "Search",
    author: "Brave",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@brave/brave-search-mcp-server", "--transport", "stdio"],
    envTemplate: {
      BRAVE_API_KEY: "your_brave_api_key_here",
    },
    docsUrl: "https://brave.com/search/api/",
  },
  {
    id: "postgres",
    name: "PostgreSQL",
    category: "database",
    description: "Query, introspect schema, and analyze tables in Postgres databases securely.",
    icon: "Database",
    author: "Bytebase",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@bytebase/dbhub", "--transport", "stdio"],
    envTemplate: {
      DSN: "postgres://user:password@localhost:5432/mydb",
    },
    docsUrl: "https://github.com/bytebase/dbhub",
  },
  {
    id: "notion",
    name: "Notion",
    category: "productivity",
    description: "Search and interact with Notion databases, workspace pages, and team notes.",
    icon: "Notion",
    author: "Notion",
    transport: "stdio",
    command: "npx",
    args: ["-y", "@notionhq/notion-mcp-server"],
    envTemplate: {
      NOTION_TOKEN: "your_notion_token_here",
    },
    docsUrl: "https://developers.notion.com/docs/mcp",
  },
  {
    id: "chrome-devtools",
    name: "Chrome DevTools",
    category: "devtools",
    // The one server here that needs no credential, so it is the one to try
    // first: install it and it connects.
    description:
      "Drive a real Chrome: navigate, click, fill forms, read the console, and audit performance. No API key.",
    icon: "Browser",
    author: "Google Chrome",
    transport: "stdio",
    command: "npx",
    args: ["-y", "chrome-devtools-mcp@latest"],
    docsUrl: "https://github.com/ChromeDevTools/chrome-devtools-mcp",
  },
];
