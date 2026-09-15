/**
 * Desk profile: personal identity (emails) + company boilerplate (JD).
 * Persisted as profile.json. Migrates company-profile.json if present.
 * Optional company override: REDROB_COMPANY_PROFILE_JSON.
 */
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  emptyCompanyProfile,
  type CompanyProfile,
} from "../../shared/jd-assemble.js";

export type { CompanyProfile };
export { emptyCompanyProfile };

export interface DeskProfile {
  displayName: string;
  jobTitle: string;
  signature: string;
  company: CompanyProfile;
}

export function emptyDeskProfile(): DeskProfile {
  return {
    displayName: "",
    jobTitle: "",
    signature: "",
    company: emptyCompanyProfile(),
  };
}

let userDataRoot: string | null = null;

export function configureCompanyProfile(userDataPath: string): void {
  userDataRoot = userDataPath;
}

/** @deprecated alias — same as configureCompanyProfile */
export const configureDeskProfile = configureCompanyProfile;

export function profilePath(userData: string): string {
  return join(userData, "profile.json");
}

export function companyProfilePath(userData: string): string {
  return join(userData, "company-profile.json");
}

function resolveUserData(explicit?: string): string {
  const path = explicit ?? userDataRoot;
  if (!path) {
    throw new Error("Desk profile path not configured");
  }
  return path;
}

function coerceCompany(parsed: Partial<CompanyProfile> | null | undefined): CompanyProfile {
  const empty = emptyCompanyProfile();
  if (!parsed || typeof parsed !== "object") return empty;
  return {
    name: typeof parsed.name === "string" ? parsed.name.trim() : empty.name,
    about: typeof parsed.about === "string" ? parsed.about.trim() : empty.about,
    benefits: typeof parsed.benefits === "string" ? parsed.benefits.trim() : empty.benefits,
    workConditions:
      typeof parsed.workConditions === "string"
        ? parsed.workConditions.trim()
        : empty.workConditions,
    applicationProcess:
      typeof parsed.applicationProcess === "string"
        ? parsed.applicationProcess.trim()
        : empty.applicationProcess,
  };
}

function coerceDeskProfile(parsed: Partial<DeskProfile> & Partial<CompanyProfile> | null | undefined): DeskProfile {
  const empty = emptyDeskProfile();
  if (!parsed || typeof parsed !== "object") return empty;
  // Legacy flat company-profile.json has company fields at the top level.
  const nestedCompany =
    "company" in parsed && parsed.company && typeof parsed.company === "object"
      ? coerceCompany(parsed.company)
      : coerceCompany(parsed as Partial<CompanyProfile>);
  return {
    displayName:
      typeof parsed.displayName === "string" ? parsed.displayName.trim() : empty.displayName,
    jobTitle: typeof parsed.jobTitle === "string" ? parsed.jobTitle.trim() : empty.jobTitle,
    signature: typeof parsed.signature === "string" ? parsed.signature.trim() : empty.signature,
    company: nestedCompany,
  };
}

function companyFromEnv(): Partial<CompanyProfile> | null {
  const raw = process.env.REDROB_COMPANY_PROFILE_JSON;
  if (!raw?.trim()) return null;
  try {
    return JSON.parse(raw) as Partial<CompanyProfile>;
  } catch {
    return null;
  }
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as unknown;
  } catch {
    return null;
  }
}

export async function loadDeskProfile(userData?: string): Promise<DeskProfile> {
  const root = resolveUserData(userData);
  const fromProfile = await readJson(profilePath(root));
  const fromLegacyCompany = fromProfile ? null : await readJson(companyProfilePath(root));
  const base = coerceDeskProfile(
    (fromProfile ?? fromLegacyCompany) as Partial<DeskProfile> | null,
  );
  const env = companyFromEnv();
  if (!env) return base;
  return {
    ...base,
    company: coerceCompany({ ...env, ...base.company }),
  };
}

export async function saveDeskProfile(
  profile: DeskProfile,
  userData?: string,
): Promise<DeskProfile> {
  const root = resolveUserData(userData);
  const next = coerceDeskProfile(profile);
  await mkdir(root, { recursive: true });
  await writeFile(profilePath(root), `${JSON.stringify(next, null, 2)}\n`, "utf8");
  return next;
}

export async function loadCompanyProfile(userData?: string): Promise<CompanyProfile> {
  return (await loadDeskProfile(userData)).company;
}

export async function saveCompanyProfile(
  company: CompanyProfile,
  userData?: string,
): Promise<CompanyProfile> {
  const prev = await loadDeskProfile(userData);
  const saved = await saveDeskProfile({ ...prev, company: coerceCompany(company) }, userData);
  return saved.company;
}

/** Sign-off block for outbound emails (signature wins over name/title). */
export function formatEmailSignOff(profile: DeskProfile): string {
  if (profile.signature.trim()) return profile.signature.trim();
  return [profile.displayName.trim(), profile.jobTitle.trim()].filter(Boolean).join("\n");
}
