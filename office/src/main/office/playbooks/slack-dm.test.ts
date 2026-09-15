import { describe, expect, it } from "vitest";
import {
  isSlackDmAsk,
  parseSlackDmAsk,
  slackDmPlaybook,
} from "./slack-dm.js";

describe("slack-dm playbook", () => {
  it("detects Slack send asks", () => {
    expect(
      isSlackDmAsk(
        "슬랙 열어서 석승현 부대표한테 Redrob Office에서 테스트 메시지 보내줘",
      ),
    ).toBe(true);
    expect(isSlackDmAsk("Open Slack and DM Janghoon a short hello")).toBe(
      true,
    );
    expect(isSlackDmAsk("슬랙 채널 목록 보여줘")).toBe(false);
    expect(isSlackDmAsk("이메일 보내줘")).toBe(false);
  });

  // Posting to a channel names a destination as plainly as 한테 does, and this
  // one never said "Slack", so it went to chat and came back as a promise.
  it("detects a channel post without the word Slack", () => {
    expect(
      isSlackDmAsk("redrob-labs 채널에 labs.redrob.ai 근황 정리해서 올려줘"),
    ).toBe(true);
    expect(isSlackDmAsk("#redrob-labs 에 공유해줘")).toBe(true);
    expect(isSlackDmAsk("post it to channel redrob-labs")).toBe(true);
    // A sentence about a channel is not an errand into one.
    expect(isSlackDmAsk("redrob-labs 채널 어제 뭐 있었어")).toBe(false);
  });

  it("parses the channel and points the playbook at it", () => {
    const ask = "redrob-labs 채널에 labs.redrob.ai 근황 정리해서 올려줘";
    expect(parseSlackDmAsk(ask).channel).toBe("redrob-labs");
    const book = slackDmPlaybook(ask);
    expect(book).toMatch(/#redrob-labs/);
    expect(book).toMatch(/channel post playbook/i);
    // Nobody is being looked up by name here.
    expect(book).not.toMatch(/부대표님/);
  });

  it("parses recipient and body when present", () => {
    const parsed = parseSlackDmAsk(
      "슬랙에서 석승현 부대표한테 \"Redrob Office 테스트입니다\" 보내줘",
    );
    expect(parsed.recipient).toMatch(/석승현/);
    expect(parsed.body).toMatch(/Redrob Office/);
  });

  it("reads the recipient the person supplied when asked", () => {
    // The run stopped on "who to?", the chat folded the answer back in.
    const merged = "슬랙으로 보내드려 요약해서 더 짧게\n받는 사람: 석승현 부대표님";
    expect(isSlackDmAsk(merged)).toBe(true);
    expect(parseSlackDmAsk(merged).recipient).toBe("석승현");
    expect(parseSlackDmAsk("Slack it to them\nrecipient: Janghoon Lee").recipient).toBe(
      "Janghoon Lee",
    );
  });

  it("builds a playbook that forces visual confirmation", () => {
    const book = slackDmPlaybook(
      "슬랙 열어서 석승현 부대표한테 테스트 메시지 보내줘",
    );
    expect(book).toMatch(/app\.launch/);
    expect(book).toMatch(/app\.focus/);
    expect(book).toMatch(/screen\.capture/);
    expect(book).toMatch(/frameId/);
    // Elements before pixels: guessing coordinates off a screenshot is the bug.
    expect(book).toMatch(/ui\.elements/);
    expect(book).toMatch(/elementId/);
    expect(book).toMatch(/석승현/);
    expect(book).toMatch(/REQUIRED/);
    expect(book).toMatch(/hard failure/);
  });

  it("hands over the spellings Slack might list the person under", () => {
    const book = slackDmPlaybook(
      "슬랙 열어서 석승현 부대표님한테 테스트 메시지 보내줘",
    );
    expect(book).toMatch(/Seunghyun Seok/);
    expect(book).toMatch(/승현/);
    // The title is what made the search fail; it must not become a search term.
    expect(book).not.toMatch(/"석승현 부대표님"/);
  });
});
