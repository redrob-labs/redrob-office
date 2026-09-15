/** Shared JD markdown assembly (main + renderer live preview). */

export interface CompanyProfile {
  name: string;
  about: string;
  benefits: string;
  workConditions: string;
  applicationProcess: string;
}

export function emptyCompanyProfile(): CompanyProfile {
  return {
    name: "",
    about: "",
    benefits: "",
    workConditions: "",
    applicationProcess: "",
  };
}

type JdLocale = "en" | "ko";

const SECTION_TITLES: Record<
  JdLocale,
  {
    responsibilities: string;
    qualifications: string;
    niceToHave: string;
    location: string;
    team: string;
    benefits: string;
    workConditions: string;
    application: string;
    about: string;
  }
> = {
  ko: {
    responsibilities: "주요 업무",
    qualifications: "자격 요건",
    niceToHave: "우대 사항",
    location: "근무지",
    team: "팀 / 제품",
    benefits: "복리후생",
    workConditions: "근무조건",
    application: "지원절차",
    about: "회사소개",
  },
  en: {
    responsibilities: "Responsibilities",
    qualifications: "Qualifications",
    niceToHave: "Nice to have",
    location: "Location",
    team: "Team / product",
    benefits: "Benefits",
    workConditions: "Work conditions",
    application: "How to apply",
    about: "About the company",
  },
};

export function jdLocale(locale?: string): JdLocale {
  return locale?.toLowerCase().startsWith("ko") ? "ko" : "en";
}

function normalizeBody(text: string): string {
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join("\n")
    .trim();
}

function section(title: string, body: string | undefined): string[] {
  const trimmed = body?.trim();
  if (!trimmed) return [];
  return ["", `## ${title}`, trimmed];
}

function aboutBody(profile: CompanyProfile): string | undefined {
  const name = profile.name.trim();
  const about = profile.about.trim();
  if (!name && !about) return undefined;
  if (name && about) return `${name}\n\n${about}`;
  return name || about;
}

/** Deterministic JD assembly: model slots + company-profile boilerplate. */
export function assembleJdMarkdown(
  slots: Record<string, string>,
  profile: CompanyProfile,
  locale?: string,
): string {
  const titles = SECTION_TITLES[jdLocale(locale)];
  const fallbackTitle = jdLocale(locale) === "ko" ? "직무명 미정" : "Untitled role";
  const roleTitle = slots.roleTitle?.trim() || fallbackTitle;
  // List sections keep LLM formatting as-is (no forced "- " prefixes).
  const parts = [
    `# ${roleTitle}`,
    ...(slots.oneLiner?.trim() ? ["", slots.oneLiner.trim()] : []),
    ...section(
      titles.responsibilities,
      slots.responsibilities ? normalizeBody(slots.responsibilities) : undefined,
    ),
    ...section(
      titles.qualifications,
      slots.qualifications ? normalizeBody(slots.qualifications) : undefined,
    ),
    ...section(
      titles.niceToHave,
      slots.niceToHave ? normalizeBody(slots.niceToHave) : undefined,
    ),
    ...section(titles.location, slots.location),
    ...section(titles.team, slots.teamContext),
    ...section(titles.benefits, profile.benefits),
    ...section(titles.workConditions, profile.workConditions),
    ...section(titles.application, profile.applicationProcess),
    ...section(titles.about, aboutBody(profile)),
  ];
  return `${parts.join("\n").trim()}\n`;
}
