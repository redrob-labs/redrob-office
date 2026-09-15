/**
 * Electron utilityProcess entry — runs GGUF inference off the UI main process.
 * Isolation choice: utilityProcess (not a separate sidecar binary).
 */
import {
  applyExecutionPlan,
  formatExecutionPlanLog,
  generateChatHttp,
  generateFieldFill,
  generateLocalChatWithTools,
  generateTextHttp,
  getActiveExecutionPlan,
  peekExecutionPlan,
  preloadInference,
  type ChatHttpOptions,
  type CloudChatMessage,
  type CloudChatResult,
  type CloudToolDefinition,
  type FieldFillResultItem,
  type GenerateFieldFillOptions,
  type ModelGrade,
} from "@redrob/kernel";
import { compare, type CompareInput } from "@redrob/compare";
import { assertProductSlotGrammarsCompile } from "./services/assert-product-grammars.js";

/** `generateTextHttp` takes an inline object, so its payload is derived from it. */
export type GenerateTextHttpOptions = Parameters<typeof generateTextHttp>[0];

type FieldFillPayload = Omit<GenerateFieldFillOptions, "onField"> & {
  streamFields?: boolean;
};

type ComparePayload = Omit<CompareInput, "onField"> & {
  streamFields?: boolean;
};

type TextPayload = Omit<GenerateTextHttpOptions, "onTextChunk"> & {
  streamText?: boolean;
};

type ChatPayload = Omit<ChatHttpOptions, "onTextChunk" | "onReasoningChunk" | "signal"> & {
  streamText?: boolean;
};

type ChatToolsPayload = {
  messages: CloudChatMessage[];
  maxTokens?: number;
  temperature?: number;
  thinking?: boolean;
  tools?: CloudToolDefinition[];
  toolChoice?: "auto" | "none" | "required";
  streamText?: boolean;
};

type RequestMessage =
  | { id: string; type: "ping" }
  /**
   * `grade` is how a local weight-size switch reaches the pack. This process was
   * forked with the grade that was selected then, and env cannot be changed from
   * outside afterwards, so main names the grade rather than letting this side
   * read a stale one. `ensureLlamaServer` replaces the process when the model
   * path changes, so a switch swaps the weights instead of stacking a server.
   */
  | { id: string; type: "preload"; payload?: { grade?: ModelGrade } }
  | { id: string; type: "getPlan" }
  | { id: string; type: "fieldFill"; payload: FieldFillPayload }
  | { id: string; type: "generateText"; payload: TextPayload }
  | { id: string; type: "chat"; payload: ChatPayload }
  | { id: string; type: "chatTools"; payload: ChatToolsPayload }
  | { id: string; type: "compare"; payload: ComparePayload };

type ResponseMessage =
  | { id: string; ok: true; result: unknown }
  | { id: string; ok: false; error: string }
  | { type: "log"; line: string }
  | {
      type: "field";
      requestId: string;
      field: FieldFillResultItem | { path: string; value: unknown; streamTarget: string };
    }
  | { type: "textChunk"; requestId: string; chunk: string };

declare const process: NodeJS.Process & {
  parentPort?: {
    on: (event: "message", listener: (message: RequestMessage) => void) => void;
    postMessage: (message: ResponseMessage) => void;
  };
};

function emitField(
  requestId: string,
  field: FieldFillResultItem | { path: string; value: unknown; streamTarget: string },
): void {
  process.parentPort?.postMessage({ type: "field", requestId, field });
}

function emitText(requestId: string, chunk: string): void {
  process.parentPort?.postMessage({ type: "textChunk", requestId, chunk });
}

async function handle(message: RequestMessage): Promise<unknown> {
  switch (message.type) {
    case "ping":
      return { pong: true, isolation: "utilityProcess" };
    case "preload": {
      try {
        const grade = message.payload?.grade;
        const plan = await preloadInference(grade ? { grade } : {});
        const asserted = await assertProductSlotGrammarsCompile();
        process.parentPort?.postMessage({
          type: "log",
          line: `grammar-assert: product slots ok fields=${asserted.fieldCount} schemas=${asserted.schemaCount} rubrics=${asserted.rubricCount} templates=${asserted.templateCount} jd=${asserted.jdSlotCount}`,
        });
        process.parentPort?.postMessage({
          type: "log",
          line: formatExecutionPlanLog(plan),
        });
        return plan;
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        if (/grammar compile failed|fillable map failed/.test(detail)) {
          throw error;
        }
        // Missing weights are reported as such so Device/Settings can offer the
        // download. Everything else is surfaced as-is: llama-server is GPU-only,
        // so there is no CPU backend left to demote to.
        if (
          /ENOENT|not available at|no such file/i.test(detail) ||
          (error as NodeJS.ErrnoException)?.code === "ENOENT"
        ) {
          throw Object.assign(
            new Error(`ERR_INFER_MODEL_MISSING: ${detail}`),
            { code: "ERR_INFER_MODEL_MISSING" as const },
          );
        }
        throw error;
      }
    }
    case "getPlan": {
      const existing = getActiveExecutionPlan() ?? peekExecutionPlan();
      if (existing) return existing;
      return applyExecutionPlan({ skipBackendProbe: true });
    }
    case "fieldFill": {
      const { streamFields, ...rest } = message.payload;
      return generateFieldFill({
        ...rest,
        ...(streamFields ? { onField: (field) => emitField(message.id, field) } : {}),
      });
    }
    case "generateText": {
      const { streamText, ...rest } = message.payload;
      return generateTextHttp({
        ...rest,
        ...(streamText ? { onTextChunk: (chunk) => emitText(message.id, chunk) } : {}),
      });
    }
    case "chat": {
      const { streamText, ...rest } = message.payload;
      return generateChatHttp({
        ...rest,
        ...(streamText ? { onTextChunk: (chunk) => emitText(message.id, chunk) } : {}),
      });
    }
    case "chatTools": {
      const { streamText, ...rest } = message.payload;
      return generateLocalChatWithTools({
        ...rest,
        ...(streamText ? { onTextChunk: (chunk) => emitText(message.id, chunk) } : {}),
      }) as Promise<CloudChatResult>;
    }
    case "compare": {
      const { streamFields, ...rest } = message.payload;
      return compare({
        ...rest,
        ...(streamFields
          ? {
              onField: (field) =>
                emitField(message.id, {
                  path: field.path,
                  value: field.value,
                  streamTarget: field.streamTarget,
                }),
            }
          : {}),
      });
    }
    default:
      throw new Error(`Unknown inference sidecar message`);
  }
}

process.parentPort?.on("message", (raw: unknown) => {
  const envelope = raw as { data?: RequestMessage } | RequestMessage;
  const message =
    envelope && typeof envelope === "object" && "data" in envelope && envelope.data
      ? envelope.data
      : (envelope as RequestMessage);
  void handle(message)
    .then((result) => {
      process.parentPort?.postMessage({ id: message.id, ok: true, result });
    })
    .catch((error: unknown) => {
      process.parentPort?.postMessage({
        id: message.id,
        ok: false,
        error: error instanceof Error ? error.message : String(error),
      });
    });
});
