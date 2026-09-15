import { describe, expect, it } from "vitest";
import {
  parseBingHtml,
  parseDdgHtml,
  parseYahooHtml,
  resultsLookOffLocale,
  unwrapSearchUrlForTest,
} from "./web-search.js";

const SAMPLE = `
<html><body>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Falpha&amp;rut=x">Alpha &amp; Co</a>
      </h2>
      <a class="result__snippet" href="//duckduckgo.com/l/?uddg=https%3A%2F%2Fexample.com%2Falpha">Snippet about <b>alpha</b>.</a>
    </div>
  </div>
  <div class="result results_links results_links_deep web-result">
    <div class="links_main links_deep result__body">
      <h2 class="result__title">
        <a rel="nofollow" class="result__a" href="https://example.com/beta">Beta Site</a>
      </h2>
      <a class="result__snippet" href="https://example.com/beta">Second hit.</a>
    </div>
  </div>
</body></html>
`;

describe("parseDdgHtml", () => {
  it("unwraps uddg links and strips tags", () => {
    const hits = parseDdgHtml(SAMPLE, 6);
    expect(hits.length).toBeGreaterThanOrEqual(2);
    expect(hits[0]?.url).toBe("https://example.com/alpha");
    expect(hits[0]?.title).toContain("Alpha");
    expect(hits[0]?.snippet).toMatch(/alpha/i);
    expect(hits[1]?.url).toBe("https://example.com/beta");
  });
});

describe("parseBingHtml", () => {
  it("unwraps bing redirect links", () => {
    const target = "https://example.com/from-bing";
    const enc = `a1${Buffer.from(target, "utf8").toString("base64")}`;
    const href = `https://www.bing.com/ck/a?!&&p=x&u=${encodeURIComponent(enc)}`;
    const html = `
      <ol id="b_results">
        <li class="b_algo">
          <h2><a href="${href}">From Bing</a></h2>
          <div class="b_caption"><p>Snippet text.</p></div>
        </li>
      </ol>
    `;
    const hits = parseBingHtml(html, 6);
    expect(hits).toHaveLength(1);
    expect(hits[0]?.url).toBe(target);
    expect(hits[0]?.title).toBe("From Bing");
    expect(hits[0]?.snippet).toMatch(/Snippet/);
  });
});

describe("parseYahooHtml", () => {
  it("unwraps RU redirects and reads algo-sr blocks", () => {
    const target = "https://mckinleyrice.com/";
    const href = `https://r.search.yahoo.com/_ylt=x/RV=2/RE=1/RO=10/RU=${encodeURIComponent(target)}/RK=2/RS=y`;
    const html = `
      <div class="dd algo algo-sr relsrch Sr">
        <a href="${href}">
          <h3 class="title">맥킨리라이스</h3>
        </a>
        <div class="compText aAbs">
          <p class="fc-dustygray fz-14">서울 강남구 글로벌 HR</p>
        </div>
      </div>
      <div class="dd algo algo-sr relsrch Sr">
        <a href="https://r.search.yahoo.com/_ylt=x/RU=${encodeURIComponent("https://www.wanted.co.kr/company/9316")}/RK=2">
          <h3>원티드 기업정보</h3>
        </a>
        <p class="fc-dustygray">채용 공고</p>
      </div>
      <div id="right"></div>
    `;
    const hits = parseYahooHtml(html, 6);
    expect(hits).toHaveLength(2);
    expect(hits[0]?.url).toBe(target);
    expect(hits[0]?.title).toContain("맥킨리");
    expect(hits[0]?.snippet).toMatch(/강남/);
    expect(hits[1]?.url).toBe("https://www.wanted.co.kr/company/9316");
  });
});

describe("unwrapSearchUrlForTest", () => {
  it("decodes bing u= payload", () => {
    const target = "https://docs.example.com/path";
    const enc = `a1${Buffer.from(target, "utf8").toString("base64")}`;
    const raw = `https://www.bing.com/ck/a?u=${encodeURIComponent(enc)}`;
    expect(unwrapSearchUrlForTest(raw)).toBe(target);
  });

  it("decodes yahoo RU= payload", () => {
    const target = "https://mckinleyrice.com/";
    const raw = `https://r.search.yahoo.com/_ylt=a/RU=${encodeURIComponent(target)}/RK=2/RS=b`;
    expect(unwrapSearchUrlForTest(raw)).toBe(target);
  });
});

describe("resultsLookOffLocale", () => {
  it("flags Chinese-only SERP for Hangul query", () => {
    expect(
      resultsLookOffLocale("맥킨리라이스", [
        { title: "如何在电脑上安装", url: "https://zhihu.com/a", snippet: "百度知道 知乎 问题" },
        { title: "发现 - 知乎", url: "https://zhihu.com/b", snippet: "国内外有哪些" },
      ]),
    ).toBe(true);
  });

  it("allows Korean or English hits for Hangul query", () => {
    expect(
      resultsLookOffLocale("맥킨리라이스", [
        { title: "McKinley Rice", url: "https://mckinleyrice.com", snippet: "CareerChat" },
        { title: "맥킨리라이스 기업정보", url: "https://wanted.co.kr/x", snippet: "서울 강남구" },
      ]),
    ).toBe(false);
  });
});
