import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";

const officeRoot = resolve(import.meta.dirname, "../..");
const repoRoot = resolve(officeRoot, "..");

describe("signed desktop release configuration", () => {
  it("publishes stable updates to the Redrob GitHub repository", () => {
    const config = readFileSync(
      resolve(officeRoot, "electron-builder.yml"),
      "utf8",
    );
    expect(config).toContain("forceCodeSigning: true");
    expect(config).toContain("owner: redrob-labs");
    expect(config).toContain("repo: redrob-office");
    expect(config).toContain("releaseType: release");
    expect(config).toContain("target: nsis");
    expect(config).toContain("Redrob-Office-Setup-${version}-${arch}.${ext}");
    expect(config).not.toContain("${productName}-Setup");
  });

  it("publishes Windows updater metadata after Authenticode verification", () => {
    const workflow = readFileSync(
      resolve(repoRoot, ".github/workflows/release-desktop.yml"),
      "utf8",
    );
    expect(workflow).toContain("WIN_CSC_LINK");
    expect(workflow).toContain("WIN_CSC_KEY_PASSWORD");
    expect(workflow).toContain("Get-AuthenticodeSignature");
    expect(workflow).toContain("SignerCertificate");
    expect(workflow).toContain("office/release/latest.yml");
    expect(workflow).toContain("needs: [windows]");
    expect(workflow).not.toContain("MAC_CSC_LINK");
    expect(workflow).not.toContain("latest-mac.yml");
  });
});
