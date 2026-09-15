import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { en, ko } from "@redrob/ui";
import { describe, expect, it } from "vitest";

/**
 * The pay sheet's promises, checked where they are written.
 *
 * Two of them are worth a test rather than a review. It must never handle a card,
 * which means no input of any kind and a link out to the console. And it must
 * never say a payment worked, because it cannot know: credit arrives on the
 * console's webhook, so the only honest sequence is pay, then try again.
 */

const here = dirname(fileURLToPath(import.meta.url));
const sheet = readFileSync(join(here, "PaySheet.tsx"), "utf8");

describe("the pay sheet", () => {
  it("collects nothing itself, and opens the console instead", () => {
    expect(sheet).not.toMatch(/<input/);
    expect(sheet).not.toMatch(/<form/);
    expect(sheet).not.toMatch(/card(Number|Expiry|Cvc)/i);
    // No Stripe element, script or SDK: the console's page owns all of that.
    expect(sheet).not.toMatch(/from ["']@stripe|js\.stripe\.com|<script/);
    expect(sheet).toContain("openExternal");
  });

  it("sends people to the console's own payment and credit pages", () => {
    expect(sheet).toContain("REDROB_CONSOLE_URL}/start");
    expect(sheet).toContain("REDROB_CONSOLE_URL}/billing");
  });

  it("asks the main process for the state rather than trusting a screen", () => {
    expect(sheet).toMatch(/window\.office\s*\.?\s*\n?\s*\.getCreditState\(\)/);
    expect(sheet).toMatch(/window\.office\s*\.?\s*\n?\s*\.clearCreditBlock\(\)/);
  });

  it("has no success state of its own to reach", () => {
    // Nothing in here decides a payment settled; there is no such branch to set.
    expect(sheet).not.toMatch(/paid\s*[:=]\s*true/);
    expect(sheet).not.toMatch(/setPaid\(/);
    expect(sheet).not.toMatch(/success/i);
  });
});

describe("the pay sheet's copy", () => {
  const catalogs = { en, ko } as const;

  function payStrings(locale: "en" | "ko"): Array<[string, string]> {
    const tree = (catalogs[locale] as Record<string, unknown>).paySheet;
    expect(tree, `${locale} is missing paySheet copy`).toBeTruthy();
    return Object.entries(tree as Record<string, string>);
  }

  it("exists in both languages with the same keys", () => {
    expect(payStrings("ko").map(([key]) => key).sort()).toEqual(
      payStrings("en").map(([key]) => key).sort(),
    );
  });

  it("uses no em dash, in either language", () => {
    for (const locale of ["en", "ko"] as const) {
      for (const [key, value] of payStrings(locale)) {
        expect(value, `${locale} paySheet.${key} has an em dash`).not.toMatch(
          /[—–]/,
        );
      }
    }
  });

  it("says where paying happens, and that the app cannot see the card or the balance", () => {
    const enCopy = Object.fromEntries(payStrings("en"));
    expect(enCopy.whereItHappens).toMatch(/console\.redrob\.ai/);
    expect(enCopy.noCardHere).toMatch(/never sees your card/i);
    expect(enCopy.noBalanceHere).toMatch(/cannot read your balance/i);
    expect(enCopy.afterPaying).toMatch(/send your request again/i);
  });

  it("promises no credit that has not been bought", () => {
    for (const locale of ["en", "ko"] as const) {
      for (const [key, value] of payStrings(locale)) {
        expect(value, `${locale} paySheet.${key} offers free credit`).not.toMatch(
          /free credit|trial|무료 크레딧 제공|체험/i,
        );
      }
    }
  });
});

describe("what opens the sheet", () => {
  const shell = readFileSync(join(here, "App.tsx"), "utf8");
  const chat = readFileSync(join(here, "ChatPanel.tsx"), "utf8");
  const settings = readFileSync(join(here, "SettingsPanel.tsx"), "utf8");

  it("opens when the console refuses a turn for want of credit", () => {
    expect(chat).toContain("result.outOfCredit");
    expect(chat).toContain("announceOutOfCredit()");
    expect(shell).toContain("onOutOfCredit(");
    expect(shell).toContain("setPayOpen(true)");
  });

  it("is also reachable before anything has been refused", () => {
    expect(settings).toContain("paySheet.settingsOpen");
    expect(settings).toContain("<PaySheet");
  });
});
