/**
 * The name someone is called by is not the name their chat app shows.
 *
 * A person asks for "석승현 부대표님" and Slack lists "Seunghyun Seok". The
 * model finds the search box, types the whole phrase including the title, and
 * matches nothing. So before it searches, hand it the spellings the same person
 * plausibly appears under: the title removed, the given name on its own, and
 * the romanisations people actually use rather than only the strict standard.
 */

/** Longest first, so 부대표 is taken before 대표. */
const TITLES = [
  "부사장",
  "부대표",
  "부회장",
  "본부장",
  "센터장",
  "그룹장",
  "파트장",
  "선생님",
  "선배님",
  "매니저",
  "총괄",
  "대표",
  "사장",
  "회장",
  "전무",
  "상무",
  "이사",
  "실장",
  "단장",
  "팀장",
  "부장",
  "차장",
  "과장",
  "대리",
  "주임",
  "사원",
  "인턴",
  "교수",
  "박사",
  "변호사",
  "기자",
  "감독",
  "코치",
  "선배",
  "후배",
  "리드",
  "CEO",
  "CTO",
  "COO",
  "CFO",
  "PM",
];

/** Two-syllable Korean family names, which break the "first char" rule. */
const TWO_CHAR_SURNAMES = [
  "남궁",
  "황보",
  "제갈",
  "사공",
  "선우",
  "서문",
  "독고",
  "동방",
  "망절",
  "어금",
];

const CHO = [
  "g", "kk", "n", "d", "tt", "r", "m", "b", "pp", "s",
  "ss", "", "j", "jj", "ch", "k", "t", "p", "h",
];
const JUNG = [
  "a", "ae", "ya", "yae", "eo", "e", "yeo", "ye", "o", "wa",
  "wae", "oe", "yo", "u", "wo", "we", "wi", "yu", "eu", "ui", "i",
];
const JONG = [
  "", "k", "k", "k", "n", "n", "n", "t", "l", "k",
  "m", "l", "l", "l", "p", "l", "m", "p", "p", "t",
  "t", "ng", "t", "t", "k", "t", "p", "t",
];

/** How common Korean family names are spelled on a business card. */
const SURNAME_SPELLINGS: Record<string, string[]> = {
  gim: ["Kim"],
  i: ["Lee", "Yi"],
  bak: ["Park", "Pak"],
  choe: ["Choi"],
  jeong: ["Jung", "Chung", "Jeong"],
  gang: ["Kang"],
  jo: ["Cho"],
  yun: ["Yoon"],
  im: ["Lim", "Im"],
  o: ["Oh"],
  sin: ["Shin"],
  gwon: ["Kwon"],
  an: ["Ahn"],
  go: ["Ko", "Koh"],
  mun: ["Moon"],
  son: ["Sohn"],
  baek: ["Baek", "Paik"],
  heo: ["Hur", "Heo"],
  yu: ["Yoo", "Ryu"],
  no: ["Noh", "Roh"],
  gwak: ["Kwak"],
  seong: ["Sung"],
  ju: ["Joo"],
  u: ["Woo"],
  gu: ["Koo"],
  seok: ["Seok", "Suk"],
  jeon: ["Jun", "Chun"],
  bang: ["Bang", "Pang"],
  byeon: ["Byun"],
};

/**
 * Strict romanisation → the spellings people pick for themselves, the most
 * likely one first. 현 is "hyeon" by the standard and "hyun" on every business
 * card, and it is the card that Slack is showing.
 */
function popularSpellings(strict: string): string[] {
  const swaps: Array<[RegExp, string]> = [
    [/yeong/g, "young"],
    [/eong/g, "ung"],
    [/eo/g, "u"],
    [/oe/g, "oi"],
    [/eu/g, "u"],
  ];
  const found = [strict];
  for (const [pattern, replacement] of swaps) {
    for (const seed of [...found]) {
      const next = seed.replace(pattern, replacement);
      if (next !== seed && !found.includes(next)) found.push(next);
    }
  }
  // The strict form is the least likely spelling to be in someone's profile.
  const [first, ...rest] = found;
  return rest.length > 0 ? [...rest, first!] : found;
}

function capitalize(text: string): string {
  return text ? text[0]!.toUpperCase() + text.slice(1) : text;
}

export function isHangul(text: string): boolean {
  return /[가-힣]/.test(text);
}

/** Revised Romanization, syllable by syllable. Non-Hangul passes through. */
export function romanizeHangul(text: string): string {
  let out = "";
  for (const char of text) {
    const code = char.codePointAt(0)!;
    if (code < 0xac00 || code > 0xd7a3) {
      out += char;
      continue;
    }
    const offset = code - 0xac00;
    const jong = offset % 28;
    const jung = Math.floor(offset / 28) % 21;
    const cho = Math.floor(offset / 28 / 21);
    out += `${CHO[cho]}${JUNG[jung]}${JONG[jong]}`;
  }
  return out;
}

/** Drop 부대표님 / 팀장 / 님 / 씨 so what is left is the name. */
export function stripHonorifics(text: string): string {
  let out = text.trim();
  for (let pass = 0; pass < 4; pass++) {
    const before = out;
    for (const title of TITLES) {
      out = out.replace(new RegExp(`\\s*${title}\\s*님?\\s*$`, "i"), "");
    }
    out = out.replace(/\s*(?:님|씨|군|양)\s*$/, "");
    out = out.trim();
    if (out === before) break;
  }
  return out;
}

export interface KoreanName {
  surname: string;
  given: string;
}

export function koreanNameParts(name: string): KoreanName | null {
  const clean = name.replace(/\s+/g, "");
  if (!/^[가-힣]{2,5}$/.test(clean)) return null;
  const two = TWO_CHAR_SURNAMES.find((item) => clean.startsWith(item));
  if (two && clean.length > two.length) {
    return { surname: two, given: clean.slice(two.length) };
  }
  return { surname: clean.slice(0, 1), given: clean.slice(1) };
}

/**
 * Every spelling the same person might be listed under, best search term first.
 */
export function personNameVariants(rawName: string): string[] {
  const name = stripHonorifics(rawName);
  if (!name) return [];
  const out: string[] = [name];

  const parts = koreanNameParts(name);
  if (!parts) {
    // Already Latin, or something we should not take apart.
    return [...new Set(out)];
  }

  out.push(parts.given);

  const givenRoman = popularSpellings(romanizeHangul(parts.given)).map(
    capitalize,
  );
  // The given name alone is the search term that works most often.
  out.push(...givenRoman);
  const surnameRoman = romanizeHangul(parts.surname);
  const surnames = [
    ...(SURNAME_SPELLINGS[surnameRoman] ?? []),
    capitalize(surnameRoman),
  ];

  for (const given of givenRoman) {
    for (const surname of surnames) {
      out.push(`${given} ${surname}`);
      out.push(`${surname} ${given}`);
    }
  }

  // Hyphenated given names are common on Korean Slack profiles.
  const syllables = [...parts.given];
  if (syllables.length === 2) {
    const hyphen = syllables
      .map((syllable) => popularSpellings(romanizeHangul(syllable))[0] ?? "")
      .filter(Boolean);
    if (hyphen.length === 2) {
      out.push(capitalize(`${hyphen[0]}-${hyphen[1]}`));
    }
  }

  return [...new Set(out.filter(Boolean))].slice(0, 12);
}

/**
 * "슬랙 열어서 석승현 부대표님한테" hands us three words and one of them is a
 * name. Titles are already gone; what is left of a Korean phrase is the last
 * word, because Korean puts the name right before the particle.
 */
export function pickPersonName(phrase: string): string {
  const clean = stripHonorifics(phrase);
  const words = clean.split(/\s+/).filter(Boolean);
  if (words.length <= 1) return clean;
  if (!isHangul(clean)) return clean;
  const last = words[words.length - 1]!;
  return /^[가-힣]{2,5}$/.test(last) ? last : clean;
}

/** One line for a prompt: the spellings to search for and to recognise. */
export function describeNameVariants(rawName: string): string {
  const variants = personNameVariants(rawName);
  if (variants.length <= 1) return "";
  return variants.join(", ");
}

/**
 * What to type into a search box, in the order worth trying: the Korean given
 * name, then its romanisation, because a profile carries one or the other.
 */
export function searchTermsFor(rawName: string): string[] {
  const name = stripHonorifics(rawName);
  if (!name) return [];
  const parts = koreanNameParts(name);
  if (!parts) return [name];
  const strict = romanizeHangul(parts.given);
  const roman = popularSpellings(strict).map(capitalize);
  // Korean name, then the spelling on the business card, then the standard one.
  return [
    ...new Set([parts.given, roman[0]!, capitalize(strict), ...roman, name]),
  ].slice(0, 4);
}
