import { existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { MCP_HUB_CATALOG } from "../../shared/mcp";
import { mcpLogoAsset } from "./McpLogo";

describe("MCP integration logos", () => {
  it("uses a checked-in brand asset for every hub integration", () => {
    for (const item of MCP_HUB_CATALOG) {
      const asset = mcpLogoAsset(item.id);
      expect(asset, item.id).not.toBeNull();
      const file = fileURLToPath(
        new URL(`../public/${asset!.replace(/^\.\//, "")}`, import.meta.url),
      );
      expect(existsSync(file), `${item.id}: ${file}`).toBe(true);
    }
  });

  it("matches installed messaging server names and leaves custom servers neutral", () => {
    expect(mcpLogoAsset("My Slack Workspace")).toContain("slack.svg");
    expect(mcpLogoAsset("Discord")).toContain("discord.svg");
    expect(mcpLogoAsset("Whats App")).toContain("whatsapp.svg");
    expect(mcpLogoAsset("Acme Internal MCP")).toBeNull();
  });
});
