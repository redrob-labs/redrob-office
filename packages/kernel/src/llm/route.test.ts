import { describe, expect, it } from "vitest";
import {
  CHEAP_MODELS,
  modelNeedsThinking,
  needsThinking,
  resolveInferenceRoute,
  VISION_MODELS,
} from "./route.js";

describe("needsThinking", () => {
  it("skips short chat", () => {
    expect(needsThinking("chat", "hi")).toBe(false);
  });

  it("skips field fill", () => {
    expect(needsThinking("fieldFill", "Please debug why this fails ".repeat(20))).toBe(false);
  });

  it("flags hard judge", () => {
    expect(needsThinking("hardJudge", "x")).toBe(true);
  });
});

describe("resolveInferenceRoute", () => {
  it("auto prefers local for field fill when available", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: { openrouter: { apiKey: "sk-or-test-key-123" } },
      localAvailable: true,
      redrobAvailable: true,
      workload: { kind: "fieldFill", text: "doc" },
    });
    expect(decision.provider).toBe("local");
    expect(decision.confidenceDegraded).toBe(false);
  });

  it("auto uses redrob for field fill when local missing", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: {},
      localAvailable: false,
      redrobAvailable: true,
      workload: { kind: "fieldFill", text: "doc" },
    });
    expect(decision.provider).toBe("redrob_remote");
  });

  it("auto uses cloud for field fill when only cloud keys exist", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: { openrouter: { apiKey: "sk-or-test-key-123" } },
      localAvailable: false,
      redrobAvailable: false,
      workload: { kind: "fieldFill", text: "doc" },
    });
    expect(decision.provider).toBe("openrouter");
    expect(decision.model).toBe(CHEAP_MODELS.openrouter);
    expect(decision.confidenceDegraded).toBe(true);
  });

  it("auto prefers cloud for chat when a key exists even if local is available", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: { openrouter: { apiKey: "sk-or-test-key-123" } },
      localAvailable: true,
      redrobAvailable: false,
      workload: { kind: "chat", text: "hello" },
    });
    expect(decision.provider).toBe("openrouter");
    expect(decision.model).toBe(CHEAP_MODELS.openrouter);
    expect(decision.reason).toBe("auto_cloud");
    expect(decision.thinking).toBe(false);
  });

  // One measured OpenRouter default answers every chat turn — no grade dial.
  it("chat always uses the one OpenRouter default", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: { openrouter: { apiKey: "sk-or-test-key-123" } },
      localAvailable: false,
      workload: {
        kind: "chat",
        text: "Please analyze and compare the trade-offs of these designs step by step ".repeat(5),
      },
    });
    expect(decision.thinking).toBe(false);
    expect(decision.model).toBe(CHEAP_MODELS.openrouter);
    expect(decision.model).toBe("openai/gpt-5.6-luna");
  });

  it("keeps other providers on their own default", () => {
    const decision = resolveInferenceRoute({
      mode: "anthropic",
      providers: { anthropic: { apiKey: "sk-ant-test-key-123" } },
      localAvailable: false,
      workload: { kind: "chat", text: "hi" },
    });
    expect(decision.thinking).toBe(false);
    expect(decision.model).toBe(CHEAP_MODELS.anthropic);
  });

  it("auto falls back to local for chat when no cloud keys", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: {},
      localAvailable: true,
      workload: { kind: "chat", text: "hello" },
    });
    expect(decision.provider).toBe("local");
    expect(decision.reason).toBe("auto_local_fallback");
  });

  // On device the grade buys weights, not a reasoning pass. A GGUF asked to
  // think spends the budget on it and hands back reasoning with no answer, so
  // thinkingOverride must not switch it on for a local route.
  it("never thinks on a local route, even with thinkingOverride", () => {
    for (const mode of ["local", "auto"] as const) {
      const decision = resolveInferenceRoute({
        mode,
        providers: {},
        localAvailable: true,
        workload: { kind: "chat", text: "hello" },
        thinkingOverride: true,
      });
      expect(decision.provider).toBe("local");
      expect(decision.thinking).toBe(false);
    }
  });

  it("forced openai ignores local", () => {
    const decision = resolveInferenceRoute({
      mode: "openai",
      providers: { openai: { apiKey: "sk-openai-test-key" } },
      localAvailable: true,
      workload: { kind: "chat", text: "hello" },
    });
    expect(decision.provider).toBe("openai");
  });
});

describe("work that has to see the screen", () => {
  const keyed = { openrouter: { apiKey: "sk-or-test-key-123" } };

  it("picks a model that can look at a picture", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: keyed,
      localAvailable: false,
      workload: { kind: "chat", text: "open the browser" },
      needsVision: true,
    });
    expect(decision.model).toBe(VISION_MODELS.openrouter.default);
  });

  it("leaves ordinary work on the cheap model", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: keyed,
      localAvailable: false,
      workload: { kind: "chat", text: "open the browser" },
    });
    expect(decision.model).toBe(CHEAP_MODELS.openrouter);
  });

  it("names models that refuse thinking off", () => {
    expect(modelNeedsThinking("openai/gpt-5-mini")).toBe(true);
    expect(modelNeedsThinking("openai/gpt-5.6-luna")).toBe(true);
    expect(modelNeedsThinking("google/gemini-3.7-flash")).toBe(true);
    expect(modelNeedsThinking("google/gemini-2.5-flash")).toBe(false);
  });

  it("uses a named cloud model instead of the cheap default", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: keyed,
      localAvailable: false,
      workload: { kind: "chat", text: "write me a job posting" },
      cloudModel: "openai/gpt-5.6-luna",
    });
    expect(decision.model).toBe("openai/gpt-5.6-luna");
    expect(decision.provider).toBe("openrouter");
  });

  it("ignores a blank override rather than asking for a model called nothing", () => {
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: keyed,
      localAvailable: false,
      workload: { kind: "chat", text: "write me a job posting" },
      cloudModel: "   ",
    });
    expect(decision.model).toBe(CHEAP_MODELS.openrouter);
  });

  it("keeps a seeing model even when a text-only override is named", () => {
    // The override is a price experiment; it must not put a blind model in
    // front of work that has to find a button on a screen.
    const decision = resolveInferenceRoute({
      mode: "auto",
      providers: keyed,
      localAvailable: false,
      workload: { kind: "chat", text: "click the submit button" },
      needsVision: true,
      cloudModel: "deepseek/deepseek-v4-flash",
    });
    expect(decision.model).toBe(VISION_MODELS.openrouter.default);
  });

  it("still picks a seeing model when the provider was chosen by hand", () => {
    const decision = resolveInferenceRoute({
      mode: "openrouter",
      providers: keyed,
      localAvailable: false,
      workload: { kind: "chat", text: "open the browser" },
      needsVision: true,
    });
    expect(decision.model).toBe(VISION_MODELS.openrouter.default);
  });

  it("never routes a picture to a model that cannot see one", () => {
    // The bug this guards: the OpenRouter default was DeepSeek, which takes
    // text only, so a blind model was being asked where to click.
    const textOnly = [/^deepseek\//i, /-instruct-text\b/i];
    for (const provider of ["openai", "openrouter", "anthropic"] as const) {
      for (const model of [
        VISION_MODELS[provider].default,
        VISION_MODELS[provider].thinking,
      ]) {
        expect(textOnly.some((re) => re.test(model))).toBe(false);
      }
    }
  });
});
