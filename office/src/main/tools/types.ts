import type {
  CanonicalExecPlan,
  ExecAskMode,
  ExecSecurityMode,
  SecurityPolicyBundle,
} from "../security/types.js";
import type { DocDiff } from "../docs/types.js";

export type ToolRisk = "low" | "high";
export type { DocDiff };

export interface ToolContext {
  allowedPaths: string[];
  userDataPath: string;
  signal?: AbortSignal;
  policy?: SecurityPolicyBundle;
  execSecurity?: ExecSecurityMode;
  execAsk?: ExecAskMode;
  execAllowlist?: string[];
  /** When true, call is running under elevated entry (denylist still applies). */
  elevated?: boolean;
  /** Approved canonical plan that must match at exec time. */
  approvedExecPlan?: CanonicalExecPlan;
  /**
   * A line for whoever is waiting, from a tool that takes long enough to look
   * stuck. Multi-step work (running a saved flow) says where it is instead of
   * returning one summary minutes later.
   */
  onProgress?: (message: string) => void;
}

export interface ToolResult {
  ok: boolean;
  /** Human/model-facing summary (not full dumps for huge payloads). */
  summary: string;
  /** Structured payload returned to the model (may be truncated). */
  data?: unknown;
  error?: string;
  /**
   * Something this call produced that has to be looked at rather than read
   * about. A tool result is text, so the file is passed alongside it: an image
   * also goes to the model, and both go to the person watching.
   * Dual monitors may return more than one screenshot.
   */
  media?:
    | { path: string; kind: "image" | "video" }
    | Array<{ path: string; kind: "image" | "video" }>;
  /**
   * A document this call brought into being. The app opens it, because a
   * document that exists only as a sentence in a transcript is one the person
   * has to go and find.
   */
  artifactId?: string;
}

export function toolMediaList(
  media: ToolResult["media"],
): Array<{ path: string; kind: "image" | "video" }> {
  if (!media) return [];
  return Array.isArray(media) ? media : [media];
}

// Zod 4: schema output typing is erased at the registry boundary after safeParse.
export interface RegisteredTool {
  name: string;
  description: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  inputSchema: any;
  risk: ToolRisk;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  handler: (input: any, ctx: ToolContext) => Promise<ToolResult>;
}

export interface ToolCallRequest {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export type TaskStreamEvent =
  | { kind: "status"; message: string }
  | { kind: "text"; text: string }
  | { kind: "tool_request"; callId: string; name: string; args: Record<string, unknown>; risk: ToolRisk }
  | {
      kind: "approval_needed";
      callId: string;
      name: string;
      args: Record<string, unknown>;
      risk: ToolRisk;
      elevated?: boolean;
      execPlan?: CanonicalExecPlan;
      /** Structured document diff from dryRun (not a string to parse). */
      docDiff?: DocDiff;
      opHash?: string;
    }
  | {
      kind: "tool_result";
      callId: string;
      name: string;
      ok: boolean;
      summary: string;
      approved: boolean | null;
      elevated?: boolean;
      /** A file this call produced, for whoever is watching to see. */
      media?: { path: string; kind: "image" | "video" };
      /** A document this call created, for the app to open. */
      artifactId?: string;
    }
  | {
      kind: "done";
      text: string;
      iterations: number;
      /**
       * Answers worth offering as one click, when the run ended in a question
       * rather than a result — "which of these people did you mean".
       */
      options?: string[];
    }
  | { kind: "error"; message: string }
  | { kind: "aborted" };
