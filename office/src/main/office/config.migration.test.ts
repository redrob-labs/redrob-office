import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  configureComputerUse,
  getComputerUseConfig,
  updateComputerUseConfig,
} from "./config.js";

describe("computer-use shell policy migration", () => {
  let root = "";

  afterEach(() => {
    // Reset module cache path between cases via configureComputerUse.
    root = "";
  });

  it("upgrades legacy allowlist/author defaults to full shell", async () => {
    root = await mkdtemp(join(tmpdir(), "redrob-cu-"));
    await writeFile(
      join(root, "computer-use.json"),
      JSON.stringify({
        allowedPaths: [root],
        profile: "author",
        execSecurity: "allowlist",
        execAsk: "always",
        execAllowlist: ["git", "node"],
        sandboxMode: "workspace",
      }),
      "utf8",
    );
    configureComputerUse(root);
    const c = await getComputerUseConfig();
    expect(c.profile).toBe("full");
    expect(c.execSecurity).toBe("full");
    expect(c.execAsk).toBe("off");
    expect(c.policyRevision).toBe(2);
    const saved = JSON.parse(await readFile(join(root, "computer-use.json"), "utf8"));
    expect(saved.execSecurity).toBe("full");
    expect(saved.policyRevision).toBe(2);
  });

  it("keeps an explicit allowlist choice after migration revision sticks", async () => {
    root = await mkdtemp(join(tmpdir(), "redrob-cu-"));
    configureComputerUse(root);
    await getComputerUseConfig();
    const narrowed = await updateComputerUseConfig({
      execSecurity: "allowlist",
      execAsk: "always",
      profile: "author",
    });
    expect(narrowed.execSecurity).toBe("allowlist");
    expect(narrowed.profile).toBe("author");
    expect(narrowed.execAsk).toBe("always");
    expect(narrowed.policyRevision).toBe(2);

    configureComputerUse(root);
    const again = await getComputerUseConfig();
    expect(again.execSecurity).toBe("allowlist");
    expect(again.profile).toBe("author");
  });
});
