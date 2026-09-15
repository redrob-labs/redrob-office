/**
 * Decide when chat should open the local browser and what DuckDuckGo query to use.
 * Follow-ups like "검색해서 알려줘" must reuse the prior topic (e.g. 맥킨리라이스),
 * not search the directive text itself.
 */

const SEARCH_DIRECTIVE =
  /(?:검새|검색|서치|찾아|찾아봐|찾아\s*봐|look\s*up|search(?:\s+for)?|google)/i;

/** Common KO typos / speech-to-text slips. */
export function normalizeSearchText(text: string): string {
  return text
    .replace(/검새/g, "검색")
    .replace(/\s+/g, " ")
    .trim();
}

export function isSearchDirective(text: string): boolean {
  const t = normalizeSearchText(text);
  if (!t) return false;
  // Pure or almost-pure "search for me" commands
  if (t.length <= 36 && SEARCH_DIRECTIVE.test(t)) {
    const stripped = t
      .replace(SEARCH_DIRECTIVE, " ")
      .replace(
        /(?:해서|해\s*줘|해줘|해\s*봐|해봐|좀|제발|부탁|알려\s*줘|알려줘|줘|봐|요|다|\.|,|!|\?)/gi,
        " ",
      )
      .replace(/\s+/g, " ")
      .trim();
    if (stripped.length <= 2) return true;
  }
  if (/^(?:그거|그것|그\s*회사|그\s*사람)?\s*(?:좀\s*)?(?:검색|찾아|서치)/i.test(t)) {
    return true;
  }
  return /^(?:웹\s*)?검색(?:해서|해\s*줘|해줘)?(?:\s*알려\s*줘)?\.?$/i.test(t);
}

/** Short clarifications that need the prior topic. */
export function isVagueFollowUp(text: string): boolean {
  const t = normalizeSearchText(text);
  if (!t || t.length > 48) return false;
  return /^(?:회사야|회사야\.?|그\s*회사(?:야|임|입니다)?|기업이야|그거(?:야|임)?|그게\s*회사|맞아|응|어|네|yes|yep|it'?s a (?:company|firm)|the company)\.?$/i.test(
    t,
  );
}

/** Questions that usually need live / external facts. */
export function needsLiveFacts(text: string): boolean {
  const t = normalizeSearchText(text);
  if (t.length < 2) return false;
  if (
    /(?:요즘|근황|최근|지금|현재|오늘|어제|올해|최신|뉴스|시세|주가|환율|날씨|공식\s*사이트|홈페이지)/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/(?:뭐해|뭐\s*해|뭐하니|뭐\s*하니|어떻해|어때|누구야|어디야|뭔\s*회사|어떤\s*회사)/i.test(t)) {
    return true;
  }
  if (
    /\b(?:latest|today|yesterday|recent|nowadays|what(?:'s| is) (?:he|she|they|it) (?:up to|doing)|who is|where is|news|price|weather)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  // Named entity-ish + question particle
  if (
    /[A-Za-z가-힣]{2,}/.test(t) &&
    /(?:\?|까\??|나요\??|세요\??|해줘|해\s*줘|알려|뭐야|뭐지)$/i.test(t)
  ) {
    // Skip pure drafting / workflow asks
    if (/(?:초안|써\s*줘|작성|요약해\s*줘|루브릭|메일\s*초안)/i.test(t)) return false;
    return true;
  }
  return false;
}

export function looksLikeWebQuery(text: string): boolean {
  const t = normalizeSearchText(text);
  if (t.length < 2) return false;
  if (isSearchDirective(t) || needsLiveFacts(t)) return true;
  if (/(?:검색|찾아줘|찾아\s*줘|뉴스|시세|주가|환율|날씨|최신|공식\s*사이트|홈페이지|\burl\b|링크)/i.test(t)) {
    return true;
  }
  if (
    /\b(?:search|google|bing|look\s*up|latest|today|yesterday|news|price|weather|who\s+is|what\s+is|when\s+did|official\s+site|website)\b/i.test(
      t,
    )
  ) {
    return true;
  }
  if (/\b20\d{2}\b/.test(t) && /(?:검색|찾아|latest|search|\?)/i.test(t)) return true;
  return false;
}

function sanitizeQuery(text: string): string {
  return text
    .replace(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, " ")
    .replace(/(?:\+?\d[\d\s().-]{7,}\d)/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

function stripDirectiveNoise(text: string): string {
  return normalizeSearchText(text)
    .replace(
      /(?:을|를|에\s*대해|에\s*관한)?\s*(?:웹\s*)?(?:검색|찾아|서치|look\s*up|search)(?:해서|해\s*줘|해줘|해\s*봐|해봐|좀)?(?:\s*알려\s*줘|\s*알려줘)?\.?$/i,
      " ",
    )
    .replace(/^(?:그거|그것|좀|제발)\s+/i, " ")
    .replace(/\s+/g, " ")
    .trim();
}

/** Drop question fluff so DDG gets the entity, not "뭐해?". */
function cleanTopicForSearch(text: string): string {
  return stripDirectiveNoise(text)
    .replace(/[?？！!]/g, " ")
    .replace(
      /(?:\s*(?:요즘|근황|최근))?\s*(?:뭐해|뭐\s*해|뭐하니|뭐\s*하니|어때|어떻해|알려줘|알려\s*줘)\s*$/i,
      " ",
    )
    .replace(/\s+/g, " ")
    .trim();
}

function followUpHints(text: string): string {
  const t = normalizeSearchText(text);
  const hints: string[] = [];
  if (/회사|기업|company|firm/i.test(t)) hints.push("회사");
  if (/사람|대표|ceo|인물/i.test(t)) hints.push("인물");
  if (/뉴스|근황|요즘|최근/i.test(t)) hints.push("최근");
  return hints.join(" ");
}

const KOREA_PLACE =
  /서울|부산|인천|대구|대전|광주|울산|세종|제주|수원|성남|고양|용인|창원|청주|전주|포항|안양|부천|경기|강원|충청|전라|경상|한국|대한민국/;

const LOCAL_WEATHER_OR_TIME =
  /날씨|기온|더운|추운|습도|미세먼지|몇\s*시|몇시|현재\s*시각|지금\s*몇|시각|시계|time\s*(?:now|is)|what\s*time|weather/i;

/** Korean weather/time asks without a city → default Seoul. */
export function withKoreaDefaultPlace(query: string): string {
  const q = query.trim();
  if (!q || !/[가-힣]/.test(q)) return q;
  if (KOREA_PLACE.test(q)) return q;
  if (!LOCAL_WEATHER_OR_TIME.test(q)) return q;
  return `서울 ${q}`;
}

function isSubstantiveUserTurn(text: string): boolean {
  const t = normalizeSearchText(text);
  if (!t || isSearchDirective(t) || isVagueFollowUp(t)) return false;
  const stripped = stripDirectiveNoise(t);
  return stripped.length >= 2;
}

/** Pick the best prior topic from earlier user messages. */
export function priorTopicFromHistory(userTexts: string[]): string | null {
  for (let i = userTexts.length - 1; i >= 0; i -= 1) {
    const raw = userTexts[i] ?? "";
    if (!isSubstantiveUserTurn(raw)) continue;
    const topic = cleanTopicForSearch(raw);
    if (topic.length >= 2) return topic;
  }
  return null;
}

export function assistantAdmittedIgnorance(text: string): boolean {
  return /(?:모르겠|정보가\s*없|가지고\s*있지\s*않|찾을\s*수\s*없|확인(?:할|하)?\s*수\s*없|잘\s*모르|I(?:'m| am) (?:not sure|unable)|I don'?t (?:know|have)|no (?:information|data) (?:on|about)|cannot find)/i.test(
    text,
  );
}

export function shouldAutoWebSearch(input: {
  latest: string;
  priorUserTexts: string[];
  lastAssistantText?: string;
  webSearchEnabled: boolean;
  force?: boolean;
}): boolean {
  if (!input.webSearchEnabled && !input.force) return false;
  if (input.force) return true;
  const latest = normalizeSearchText(input.latest);
  if (looksLikeWebQuery(latest) || isSearchDirective(latest) || needsLiveFacts(latest)) {
    return true;
  }
  if (isVagueFollowUp(latest) && priorTopicFromHistory(input.priorUserTexts)) {
    return true;
  }
  if (
    input.lastAssistantText &&
    assistantAdmittedIgnorance(input.lastAssistantText) &&
    (isSearchDirective(latest) || isVagueFollowUp(latest) || latest.length <= 48)
  ) {
    return true;
  }
  return false;
}

/**
 * Build the DuckDuckGo query. Never send bare "검색해서 알려줘".
 */
export function resolveWebSearchQuery(
  latest: string,
  priorUserTexts: string[],
): string {
  const normalized = normalizeSearchText(latest);
  const hints = followUpHints(normalized);

  if (isSearchDirective(normalized) || isVagueFollowUp(normalized)) {
    const topic = priorTopicFromHistory(priorUserTexts);
    if (topic) {
      return withKoreaDefaultPlace(
        sanitizeQuery([topic, hints].filter(Boolean).join(" ")),
      );
    }
    // No prior topic — still strip directive so we don't search "검색해서 알려줘"
    const stripped = stripDirectiveNoise(normalized);
    return withKoreaDefaultPlace(sanitizeQuery(stripped || normalized));
  }

  const stripped = cleanTopicForSearch(normalized);
  const topic = priorTopicFromHistory(priorUserTexts);
  // Short clarification after a named entity ask: merge with prior topic.
  if (stripped.length < 12 && topic && topic !== stripped) {
    return withKoreaDefaultPlace(
      sanitizeQuery([topic, stripped, hints].filter(Boolean).join(" ")),
    );
  }
  return withKoreaDefaultPlace(sanitizeQuery(stripped || normalized));
}
