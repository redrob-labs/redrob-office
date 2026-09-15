import { describe, expect, it } from "vitest";
import {
  koreanNameParts,
  personNameVariants,
  pickPersonName,
  romanizeHangul,
  searchTermsFor,
  stripHonorifics,
} from "./person-name.js";

describe("stripHonorifics", () => {
  it("drops a corporate title before the shorter one inside it", () => {
    expect(stripHonorifics("석승현 부대표님")).toBe("석승현");
    expect(stripHonorifics("김영희 대표")).toBe("김영희");
  });

  it("drops bare politeness suffixes", () => {
    expect(stripHonorifics("승현님")).toBe("승현");
    expect(stripHonorifics("박민수 씨")).toBe("박민수");
  });

  it("leaves a plain name alone", () => {
    expect(stripHonorifics("석승현")).toBe("석승현");
    expect(stripHonorifics("Janghoon Lee")).toBe("Janghoon Lee");
  });
});

describe("romanizeHangul", () => {
  it("follows the standard, syllable by syllable", () => {
    expect(romanizeHangul("석")).toBe("seok");
    expect(romanizeHangul("승현")).toBe("seunghyeon");
    expect(romanizeHangul("김")).toBe("gim");
    expect(romanizeHangul("정영")).toBe("jeongyeong");
  });

  it("passes non-Hangul through untouched", () => {
    expect(romanizeHangul("Lee 이")).toBe("Lee i");
  });
});

describe("koreanNameParts", () => {
  it("splits a normal name after the family name", () => {
    expect(koreanNameParts("석승현")).toEqual({
      surname: "석",
      given: "승현",
    });
  });

  it("knows the two-syllable family names", () => {
    expect(koreanNameParts("남궁민수")).toEqual({
      surname: "남궁",
      given: "민수",
    });
  });

  it("declines anything that is not a Korean name", () => {
    expect(koreanNameParts("Seunghyun Seok")).toBeNull();
    expect(koreanNameParts("석")).toBeNull();
  });
});

describe("personNameVariants", () => {
  it("covers how Slack actually lists the person", () => {
    const variants = personNameVariants("석승현 부대표님");
    expect(variants).toContain("석승현");
    expect(variants).toContain("승현");
    expect(variants).toContain("Seunghyun Seok");
    expect(variants).toContain("Seok Seunghyun");
  });

  it("offers the conventional family-name spelling, not only the standard one", () => {
    const variants = personNameVariants("김민수");
    expect(variants.some((item) => item.includes("Kim"))).toBe(true);
    expect(variants.some((item) => item.includes("Gim"))).toBe(true);
  });

  it("leaves a Latin name as the single spelling", () => {
    expect(personNameVariants("Janghoon Lee")).toEqual(["Janghoon Lee"]);
  });

  it("has nothing to say about an empty ask", () => {
    expect(personNameVariants("  ")).toEqual([]);
  });
});

describe("pickPersonName", () => {
  it("takes the name out of a phrase that starts with a verb", () => {
    expect(pickPersonName("열어서 석승현 부대표님")).toBe("석승현");
    expect(pickPersonName("석승현 부대표님")).toBe("석승현");
  });

  it("keeps a Latin name whole", () => {
    expect(pickPersonName("Janghoon Lee")).toBe("Janghoon Lee");
  });
});

describe("searchTermsFor", () => {
  it("offers the Korean given name before its romanisation", () => {
    expect(searchTermsFor("석승현 부대표님")).toEqual([
      "승현",
      "Seunghyun",
      "Seunghyeon",
      "Sunghyeon",
    ]);
  });
});
