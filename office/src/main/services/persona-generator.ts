/**
 * AI Persona Generator.
 *
 * Takes a short description or job title and generates a complete teammate persona:
 * - A natural human name (matching locale / context)
 * - Detailed persona prompt with domain knowledge, constraints, and tasks
 * - Tone guidelines
 * - Appropriate tool permissions (read, write, or full)
 */

import {
  generateCloudChatWithFallback,
  redrobAvailableFromEnv,
  resolveInferenceRoute,
  type InferenceRouteMode,
  type LlmProviderSecrets,
} from "@redrob/kernel";
import type { ToolPermissionView } from "../../shared/office-api.js";
import { loadSetupState } from "./setup.js";
import { hostGenerateChat, hostGetPlan } from "./inference-host.js";

export interface GeneratedPersonaResult {
  name: string;
  persona: string;
  tone: string;
  permission: ToolPermissionView;
}

const SYSTEM_PROMPT = `You are an expert AI team architect. Given a description or role for a new AI teammate, generate a rich, professional, and practical persona configuration in valid JSON format.

JSON schema:
{
  "name": "string (A realistic, professional name. If Korean is used in the prompt or locale is ko, use a natural Korean name like 김민준, 이서연, 박지훈, etc. If English, use a natural English name like Devon Miller, Sarah Chen, Alex Rivera, Marcus Vance, etc.)",
  "persona": "string (2-3 concise paragraphs defining their expertise, domain capabilities, how they approach problems, what documents/code/artifacts they produce, and quality standards)",
  "tone": "string (Short description of their communication style, e.g. 'Concise, design-focused, constructive, visual')",
  "permission": "string (One of: 'read', 'write', 'full'. Use 'write' for most authoring/document/coding roles, 'read' for research/auditing, 'full' only if shell/terminal execution is explicitly requested)"
}

Respond ONLY with valid JSON. No markdown backticks, no preamble, no postscript.`;

/**
 * Deterministic fallback generator when offline or if LLM call fails.
 */
function fallbackPersona(
  prompt: string,
  locale = "en",
): GeneratedPersonaResult {
  const p = prompt.toLowerCase();
  const isKo = locale.startsWith("ko") || /[가-힣]/.test(prompt);

  if (p.includes("design") || p.includes("figma") || p.includes("ui") || p.includes("디자인")) {
    return {
      name: isKo ? "이지은" : "Devon Miller",
      persona: isKo
        ? "UI/UX 및 프로덕트 디자인 전문가. Figma 컴포넌트 시스템, 반응형 웹 인터페이스, 와이어프레임 및 디자인 토큰 설계에 능숙하며, 직관적이고 아름다운 사용자 경험을 만드는 데 집중합니다."
        : "Senior Product & UI/UX Designer. Expert in Figma component architectures, responsive interface design, and design-to-code translation. Focuses on intuitive user journeys and modern typography.",
      tone: isKo ? "시각적이고 구조적이며 명확한 설명" : "Visual, structured, constructive, and precise",
      permission: "write",
    };
  }

  if (p.includes("code") || p.includes("dev") || p.includes("frontend") || p.includes("backend") || p.includes("개발") || p.includes("엔지니어")) {
    return {
      name: isKo ? "박준혁" : "Alex Rivera",
      persona: isKo
        ? "풀스택 소프트웨어 엔지니어. React, TypeScript, Node.js 기반의 고성능 웹 애플리케이션 개발과 깔끔한 코드 아키텍처 구현을 주도합니다. 철저한 테스트와 안정적인 구현을 지향합니다."
        : "Full-Stack Software Engineer. Specializes in TypeScript, modern web frameworks, clean architecture, and rapid prototyping. Delivers well-structured code with automated tests.",
      tone: isKo ? "기술적으로 정확하고 간결하며 실용적" : "Technically precise, concise, and pragmatic",
      permission: "write",
    };
  }

  if (p.includes("finance") || p.includes("analyst") || p.includes("재무") || p.includes("분석") || p.includes("data")) {
    return {
      name: isKo ? "김도윤" : "Marcus Vance",
      persona: isKo
        ? "데이터 및 재무 분석 전문가. SaaS 비즈니스 지표, 재무 모델링, 시장 분석 스프레드시트 및 시각화 리포트를 정확하고 신뢰성 높게 작성합니다."
        : "Financial & Data Analyst. Expert in SaaS unit economics, financial modeling, KPI forecasting, and executive reporting decks. Rigorous with figures and methodology.",
      tone: isKo ? "데이터 기반의 논리적이고 객관적인 톤" : "Data-driven, objective, thorough, and analytical",
      permission: "write",
    };
  }

  return {
    name: isKo ? "정시우" : "Morgan Hayes",
    persona: isKo
      ? `${prompt} 분야의 전문 업무를 담당하는 AI 팀원입니다. 복잡한 요구사항을 분석하고 고품질 문서 및 솔루션을 신속하게 작성합니다.`
      : `AI domain specialist focused on ${prompt}. Analyzes requirements carefully and produces high-quality, actionable documentation and deliverables.`,
    tone: isKo ? "전문적이고 협력적이며 간결한 어조" : "Professional, collaborative, proactive, and concise",
    permission: "write",
  };
}

function parsePersonaJson(raw: string): GeneratedPersonaResult | null {
  const trimmed = raw.trim();
  const jsonCandidate =
    trimmed.startsWith("{") && trimmed.endsWith("}")
      ? trimmed
      : trimmed.match(/\{[\s\S]*\}/)?.[0];

  if (!jsonCandidate) return null;

  try {
    const parsed = JSON.parse(jsonCandidate) as Record<string, unknown>;
    const name = String(parsed["name"] || "").trim();
    const persona = String(parsed["persona"] || "").trim();
    const tone = String(parsed["tone"] || "").trim();
    let permission: ToolPermissionView = "write";
    const rawPerm = String(parsed["permission"] || "").toLowerCase();
    if (rawPerm === "read" || rawPerm === "full" || rawPerm === "write") {
      permission = rawPerm;
    }

    if (name && persona) {
      return {
        name,
        persona,
        tone: tone || "Professional and concise",
        permission,
      };
    }
  } catch {
    /* fallback */
  }
  return null;
}

export async function generatePersona(
  prompt: string,
  locale = "en",
  userDataPath = "",
): Promise<GeneratedPersonaResult> {
  const trimmedPrompt = prompt.trim();
  if (!trimmedPrompt) {
    return fallbackPersona("General Assistant", locale);
  }

  try {
    if (userDataPath) {
      const setup = await loadSetupState(userDataPath);
      const inferenceRoute = (setup.inferenceRoute ?? "auto") as InferenceRouteMode;
      const providers = (setup.llmProviders ?? {}) as LlmProviderSecrets;
      const plan = await hostGetPlan();
      const localAvailable = Boolean(plan.modelPath);

      const route = resolveInferenceRoute({
        mode: inferenceRoute,
        providers,
        localAvailable,
        redrobAvailable: redrobAvailableFromEnv(),
        workload: { kind: "draft", text: trimmedPrompt },
      });

      const userMessage = `Role or description: "${trimmedPrompt}"\nPreferred language / locale: ${locale}\nGenerate the persona JSON now.`;
      let responseText = "";

      if (route.provider === "local") {
        const turn = await hostGenerateChat({
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          maxTokens: 512,
          temperature: 0.3,
        });
        responseText = turn.text;
      } else if (route.provider !== "redrob_remote") {
        const cloud = await generateCloudChatWithFallback({
          provider: route.provider,
          model: route.model,
          thinking: false,
          providers,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userMessage },
          ],
          maxTokens: 512,
          temperature: 0.3,
        });
        responseText = cloud.text;
      }

      const parsed = parsePersonaJson(responseText);
      if (parsed) return parsed;
    }
  } catch (err) {
    console.warn("[persona-generator] Inference fallback triggered:", err);
  }

  return fallbackPersona(trimmedPrompt, locale);
}
