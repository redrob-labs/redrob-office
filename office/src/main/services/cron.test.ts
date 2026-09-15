import { describe, expect, it } from "vitest";
import { cronMatches, parseCron } from "./cron.js";

/** Local time, because a person writing "9am" means 9am where they are. */
function at(iso: string): Date {
  return new Date(iso);
}

describe("parseCron", () => {
  it("refuses anything that is not five fields", () => {
    expect(parseCron("0 9 * *")).toBeNull();
    expect(parseCron("0 9 * * 1-5 7")).toBeNull();
    expect(parseCron("")).toBeNull();
    // The @daily style is common and is not supported; saying so beats
    // accepting it and never firing.
    expect(parseCron("@daily")).toBeNull();
  });

  it("refuses values outside the field", () => {
    expect(parseCron("60 * * * *")).toBeNull();
    expect(parseCron("* 24 * * *")).toBeNull();
    expect(parseCron("* * 0 * *")).toBeNull();
    expect(parseCron("* * * 13 *")).toBeNull();
    expect(parseCron("* * * * 8")).toBeNull();
    expect(parseCron("30-10 * * * *")).toBeNull();
    expect(parseCron("*/0 * * * *")).toBeNull();
  });

  it("reads lists, ranges and steps", () => {
    expect([...parseCron("0,30 * * * *")!.minute]).toEqual([0, 30]);
    expect([...parseCron("*/15 * * * *")!.minute]).toEqual([0, 15, 30, 45]);
    expect([...parseCron("0 9-11 * * *")!.hour]).toEqual([9, 10, 11]);
    // A bare number with a step runs from that number to the end of the field.
    expect([...parseCron("5/20 * * * *")!.minute]).toEqual([5, 25, 45]);
  });

  it("takes both spellings of Sunday", () => {
    expect(parseCron("0 0 * * 0")!.dayOfWeek.has(0)).toBe(true);
    expect(parseCron("0 0 * * 7")!.dayOfWeek.has(0)).toBe(true);
  });
});

describe("cronMatches", () => {
  it("matches weekday mornings and nothing else", () => {
    // 2026-08-17 is a Monday.
    expect(cronMatches("0 9 * * 1-5", at("2026-08-17T09:00:00"))).toBe(true);
    expect(cronMatches("0 9 * * 1-5", at("2026-08-17T09:01:00"))).toBe(false);
    expect(cronMatches("0 9 * * 1-5", at("2026-08-17T10:00:00"))).toBe(false);
    // Saturday.
    expect(cronMatches("0 9 * * 1-5", at("2026-08-22T09:00:00"))).toBe(false);
  });

  it("ignores seconds, so a tick inside the minute still counts", () => {
    expect(cronMatches("0 9 * * *", at("2026-08-17T09:00:41"))).toBe(true);
  });

  it("treats the two day fields as or, the way cron does", () => {
    // The 1st of the month, and every Monday — not their intersection.
    const firstOrMonday = "0 0 1 * 1";
    expect(cronMatches(firstOrMonday, at("2026-09-01T00:00:00"))).toBe(true); // a Tuesday
    expect(cronMatches(firstOrMonday, at("2026-08-17T00:00:00"))).toBe(true); // a Monday
    expect(cronMatches(firstOrMonday, at("2026-08-19T00:00:00"))).toBe(false);
  });

  it("keeps the plain daily and monthly cases restricted to their day", () => {
    expect(cronMatches("30 8 * * *", at("2026-08-19T08:30:00"))).toBe(true);
    expect(cronMatches("0 0 15 * *", at("2026-08-15T00:00:00"))).toBe(true);
    expect(cronMatches("0 0 15 * *", at("2026-08-16T00:00:00"))).toBe(false);
  });

  it("never matches a line it could not read", () => {
    expect(cronMatches("nonsense", at("2026-08-17T09:00:00"))).toBe(false);
  });
});
