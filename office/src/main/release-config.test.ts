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

  it("release workflow targets the Redrob Office suite shell, not the legacy office app", () => {
    // The desktop release pipeline now builds/signs/packages @genoffice/shell
    // (the product), not @redrob/office (the legacy recruiting app). This test
    // guards against a regression back to the office/* paths.
    const workflow = readFileSync(
      resolve(repoRoot, ".github/workflows/release-desktop.yml"),
      "utf8",
    );
    // Authenticode verification is preserved.
    expect(workflow).toContain("WIN_CSC_LINK");
    expect(workflow).toContain("WIN_CSC_KEY_PASSWORD");
    expect(workflow).toContain("Get-AuthenticodeSignature");
    expect(workflow).toContain("SignerCertificate");
    expect(workflow).toContain("needs: [windows]");
    expect(workflow).not.toContain("MAC_CSC_LINK");

    // Targets the shell, not the legacy office app.
    expect(workflow).toContain("@genoffice/shell");
    expect(workflow).toContain("apps/shell/release/latest.yml");
    expect(workflow).toContain("require('./apps/shell/package.json').version");
    expect(workflow).not.toContain("@redrob/office");
    expect(workflow).not.toContain("office/release");
    expect(workflow).not.toContain("require('./office/package.json')");
  });
});
