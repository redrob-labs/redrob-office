import {
  generateCloudChatWithFallback,
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  type InferenceRouteMode,
  type LlmProviderSecrets,
} from "@redrob/kernel";
import { emptyCompanyProfile, type CompanyProfile } from "../../shared/jd-assemble.js";
import { hostGenerateChat, hostGetPlan } from "./inference-host.js";
import { fetchPage } from "./page-fetch.js";
import { loadSetupState } from "./setup.js";

export interface FillCompanyFromWebsiteResult {
  profile: CompanyProfile;
  sourceUrl: string;
  title: string;
  blocked?: boolean;
  timingMs: number;
}

function parseCompanyJson(text: string): CompanyProfile {
  const empty = emptyCompanyProfile();
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) return empty;
  try {
    const parsed = JSON.parse(match[0]) as Partial<CompanyProfile>;
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
  } catch {
    return empty;
  }
}

const SYSTEM = [
  "Extract company profile fields from the untrusted web page below.",
  "Reply with ONLY a JSON object with keys: name, about, benefits, workConditions, applicationProcess.",
  "Use empty strings when unknown. Do not invent specific benefits or legal claims.",
  "Write values in the same language as the page (prefer Korean for Korean sites).",
].join(" ");

export async function fillCompanyProfileFromWebsite(
  userData: string,
  url: string,
): Promise<FillCompanyFromWebsiteResult> {
  const started = performance.now();
  const page = await fetchPage({ url, keepOpen: false });
  const setup = await loadSetupState(userData);
  const inferenceRoute = (setup.inferenceRoute ?? "auto") as InferenceRouteMode;
  const providers = (setup.llmProviders ?? {}) as LlmProviderSecrets;

  let localAvailable = false;
  try {
    localAvailable = Boolean((await hostGetPlan()).modelPath);
  } catch {
    localAvailable = false;
  }

  const route = resolveInferenceRoute({
    mode: inferenceRoute,
    providers,
    localAvailable,
    redrobAvailable: redrobAvailableFromEnv(),
    workload: { kind: "draft", text: page.text.slice(0, 2000) },
  });

  const userContent = `${page.contextBlock}\n\nExtract the company profile JSON now.`;
  let text = "";

  if (route.provider === "local") {
    const turn = await hostGenerateChat({
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
      maxTokens: 1024,
      temperature: 0.2,
    });
    text = turn.text;
  } else if (route.provider === "redrob_remote") {
    throw new Error("Pick Auto, Local, or a cloud key for website → profile.");
  } else {
    const cloud = await generateCloudChatWithFallback({
      provider: route.provider,
      model: route.model,
      thinking: false,
      providers,
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userContent },
      ],
      maxTokens: 1024,
      temperature: 0.2,
    });
    text = cloud.text;
  }

  return {
    profile: parseCompanyJson(text),
    sourceUrl: page.url,
    title: page.title,
    ...(page.blocked ? { blocked: true } : {}),
    timingMs: performance.now() - started,
  };
}
