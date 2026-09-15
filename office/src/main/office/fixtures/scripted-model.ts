import type { TaskModelCall } from "../../office/runtime.js";
import type { CloudToolCall } from "@redrob/kernel";

/**
 * A fixture transport for the model, plugged into the same `callModel` seam the
 * production loop uses. It supplies the model's side of the conversation and
 * nothing else: tools, policy, approval, pacing, budgets and the audit log all
 * run for real.
 */
export interface ScriptStep {
  /** Tool calls to issue this turn. */
  toolCalls?: Array<{ name: string; arguments: Record<string, unknown> }>;
  /** Final answer when there are no tool calls. */
  text?: string;
}

export interface ScriptEntry {
  /** Matched against the concatenated system + first user message. */
  match: (prompt: string) => boolean;
  label: string;
  steps: ScriptStep[];
}

interface ConversationState {
  entry: ScriptEntry;
  step: number;
}

function promptKey(messages: Array<{ role: string; content: unknown }>): string {
  const parts: string[] = [];
  for (const message of messages) {
    if (message.role !== "system" && message.role !== "user") continue;
    parts.push(typeof message.content === "string" ? message.content : JSON.stringify(message.content));
    if (parts.length >= 2) break;
  }
  return parts.join("\n");
}

export class ScriptedModel {
  readonly #entries: ScriptEntry[];
  readonly #conversations = new Map<string, ConversationState>();
  #calls = 0;
  readonly unmatched: string[] = [];

  constructor(entries: ScriptEntry[]) {
    this.#entries = entries;
  }

  get callCount(): number {
    return this.#calls;
  }

  reset(): void {
    this.#conversations.clear();
  }

  asModelCall(): TaskModelCall {
    return async (input) => {
      this.#calls += 1;
      const key = promptKey(input.messages);
      let state = this.#conversations.get(key);
      if (!state) {
        const entry = this.#entries.find((candidate) => candidate.match(key));
        if (!entry) {
          this.unmatched.push(key.slice(0, 400));
          return {
            text: JSON.stringify({
              type: "BLOCK",
              reason: "No scripted response for this prompt",
              unblockCondition: "Add a fixture entry",
            }),
            timingMs: 0,
            modelId: "fixture",
            provider: "openrouter" as const,
            finishReason: "stop" as const,
          };
        }
        state = { entry, step: 0 };
        this.#conversations.set(key, state);
      }

      // A re-delivered message replays the entry's final answer rather than
      // inventing a new one, the way a deterministic model would.
      const index = Math.min(state.step, state.entry.steps.length - 1);
      const step = state.entry.steps[index];
      state.step += 1;
      if (!step) {
        return {
          text: JSON.stringify({
            type: "BLOCK",
            reason: `Fixture "${state.entry.label}" has no steps`,
            unblockCondition: "Extend the fixture",
          }),
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          finishReason: "stop" as const,
        };
      }

      if (step.toolCalls && step.toolCalls.length > 0) {
        const toolCalls: CloudToolCall[] = step.toolCalls.map((call, index) => ({
          id: `fixture-${this.#calls}-${index}`,
          name: call.name,
          arguments: JSON.stringify(call.arguments),
        }));
        return {
          text: "",
          timingMs: 0,
          modelId: "fixture",
          provider: "openrouter" as const,
          toolCalls,
          finishReason: "tool_calls" as const,
        };
      }

      const text = step.text ?? "";
      input.onTextChunk?.(text);
      return {
        text,
        timingMs: 0,
        modelId: "fixture",
        provider: "openrouter" as const,
        finishReason: "stop" as const,
      };
    };
  }
}
