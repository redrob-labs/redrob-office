import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { en, ko } from "@redrob/ui";
import { describe, expect, it } from "vitest";

/**
 * What the connect flow promises the person, checked against the source rather
 * than a screenshot.
 *
 * There is no DOM in this suite, so these read the files. That is enough for the
 * two things that would actually hurt: a screen that offers connecting and
 * quietly loses the paste field someone still needs, and copy that says a key
 * came with credit.
 */

const here = dirname(fileURLToPath(import.meta.url));

function source(name: string): string {
  return readFileSync(join(here, name), "utf8");
}

const CONNECT_SURFACES = [
  "BetaAccessGate.tsx",
  "CloudNudge.tsx",
  "SettingsPanel.tsx",
];

describe("device connect surfaces", () => {
  it("offers connecting everywhere a key was asked for", () => {
    for (const name of CONNECT_SURFACES) {
      expect(source(name), `${name} should offer connecting`).toContain(
        "DeviceConnectPanel",
      );
    }
  });

  it("keeps pasting a key reachable on every one of them", () => {
    // The paste field, the save call, and the way back to it from the gate.
    expect(source("BetaAccessGate.tsx")).toContain("betaAccess.keyPlaceholder");
    expect(source("BetaAccessGate.tsx")).toContain("deviceConnect.pasteInstead");
    expect(source("CloudNudge.tsx")).toContain("cloudNudge.keyPlaceholder");
    expect(source("SettingsPanel.tsx")).toContain(
      "settings.redrobKeyPlaceholder",
    );
    for (const name of CONNECT_SURFACES) {
      expect(source(name), `${name} should still save a pasted key`).toContain(
        "saveLlmSettings",
      );
    }
  });

  it("never asks the renderer to hold a device code or a key", () => {
    const connect = source("DeviceConnect.tsx");
    expect(connect).not.toContain("deviceCode");
    expect(connect).not.toContain("apiKey");
  });
});

describe("device connect copy", () => {
  const catalogs = { en, ko } as const;

  function connectStrings(locale: "en" | "ko"): Array<[string, string]> {
    const tree = (catalogs[locale] as Record<string, unknown>).deviceConnect;
    expect(tree, `${locale} is missing deviceConnect copy`).toBeTruthy();
    return Object.entries(tree as Record<string, string>);
  }

  it("is written in both languages", () => {
    const enKeys = connectStrings("en").map(([key]) => key).sort();
    const koKeys = connectStrings("ko").map(([key]) => key).sort();
    expect(koKeys).toEqual(enKeys);
    expect(enKeys).toContain("cta");
    expect(enKeys).toContain("noCredit");
  });

  it("uses no em dash, in either language", () => {
    for (const locale of ["en", "ko"] as const) {
      for (const [key, value] of connectStrings(locale)) {
        expect(value, `${locale} deviceConnect.${key} has an em dash`).not.toMatch(
          /[—–]/,
        );
      }
    }
  });

  it("says out loud that connecting brings no credit with it", () => {
    const enNoCredit = connectStrings("en").find(([key]) => key === "noCredit");
    const koNoCredit = connectStrings("ko").find(([key]) => key === "noCredit");
    expect(enNoCredit?.[1]).toMatch(/does not add credit/i);
    expect(enNoCredit?.[1]).toMatch(/no free credit/i);
    expect(koNoCredit?.[1]).toContain("무료 크레딧도 없습니다");
  });

  it("never claims a connection is finished before the console says so", () => {
    const connect = source("DeviceConnect.tsx");
    // The connected phase is only reachable from the main process's answer.
    const setsConnected = connect.match(/setPhase\("connected"\)/g) ?? [];
    expect(setsConnected).toHaveLength(1);
    expect(connect).toContain('if (result.status === "connected")');
  });
});
