import { describe, expect, it } from "vitest";
import {
  coerceMessageText,
  openaiCompatibleChat,
  usesAdaptiveThinking,
} from "./openai-compatible.js";
import type { CloudChatRequest } from "./types.js";
import { LlmProviderError } from "./types.js";

function sseResponse(events: unknown[]): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      const encoder = new TextEncoder();
      for (const event of events) {
        controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
      }
      controller.enqueue(encoder.encode("data: [DONE]\n\n"));
      controller.close();
    },
  });
  return new Response(body, { status: 200 });
}

function request(overrides: Partial<CloudChatRequest> = {}): CloudChatRequest {
  return {
    provider: "openrouter",
    credential: { apiKey: "sk-or-test-key-123" },
    model: "deepseek/deepseek-v4-flash",
    messages: [{ role: "user", content: "hi" }],
    ...overrides,
  };
}

describe("openaiCompatibleChat streaming", () => {
  it("emits text chunks as they arrive", async () => {
    const chunks: string[] = [];
    const result = await openaiCompatibleChat(
      request({ onTextChunk: (chunk) => chunks.push(chunk) }),
      async () =>
        sseResponse([
          { choices: [{ delta: { content: "안녕" } }] },
          { choices: [{ delta: { content: "하세요" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]),
    );
    expect(chunks).toEqual(["안녕", "하세요"]);
    expect(result.text).toBe("안녕하세요");
    expect(result.finishReason).toBe("stop");
  });

  it("reassembles tool calls split across deltas", async () => {
    const chunks: string[] = [];
    const result = await openaiCompatibleChat(
      request({
        onTextChunk: (chunk) => chunks.push(chunk),
        tools: [
          {
            name: "web_search",
            description: "search",
            parameters: { type: "object", properties: {} },
          },
        ],
      }),
      async () =>
        sseResponse([
          { choices: [{ delta: { content: "찾아볼게요" } }] },
          {
            choices: [
              {
                delta: {
                  tool_calls: [
                    { index: 0, id: "call_1", function: { name: "web_search", arguments: '{"qu' } },
                  ],
                },
              },
            ],
          },
          {
            choices: [
              {
                delta: { tool_calls: [{ index: 0, function: { arguments: 'ery":"서울 날씨"}' } }] },
                finish_reason: "tool_calls",
              },
            ],
          },
        ]),
    );
    expect(chunks).toEqual(["찾아볼게요"]);
    expect(result.finishReason).toBe("tool_calls");
    expect(result.toolCalls).toEqual([
      { id: "call_1", name: "web_search", arguments: '{"query":"서울 날씨"}' },
    ]);
  });

  it("keeps reasoning disabled for DeepSeek flash on openrouter", async () => {
    let sent: Record<string, unknown> = {};
    await openaiCompatibleChat(
      request({ onTextChunk: () => undefined, thinking: false }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        return sseResponse([{ choices: [{ delta: { content: "ok" } }] }]);
      },
    );
    expect(sent.stream).toBe(true);
    expect(sent.reasoning).toEqual({ enabled: false, effort: "none" });
    expect(sent.thinking).toEqual({ type: "disabled" });
  });

  it("sends Claude 5 no sampling parameters at all", async () => {
    // temperature / top_p / top_k are a 400 on these models rather than being
    // ignored, so the usual default would fail every single call.
    let sent: Record<string, unknown> = {};
    await openaiCompatibleChat(
      request({
        model: "anthropic/claude-sonnet-5",
        onTextChunk: () => undefined,
        thinking: false,
      }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<
          string,
          unknown
        >;
        return sseResponse([{ choices: [{ delta: { content: "ok" } }] }]);
      },
    );
    expect(sent.temperature).toBeUndefined();
    expect(sent.top_p).toBeUndefined();
    // Thinking is on unless switched off, and there is no budget to name.
    expect(sent.reasoning).toEqual({ enabled: false });
    expect(sent.thinking).toBeUndefined();
  });

  it("leaves Claude 5 thinking alone when Pro asks for it", async () => {
    // Naming an effort makes the gateway translate it into a thinking budget,
    // which these models reject. The default already is adaptive at high.
    let sent: Record<string, unknown> = {};
    await openaiCompatibleChat(
      request({
        model: "anthropic/claude-sonnet-5",
        onTextChunk: () => undefined,
        thinking: true,
      }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<
          string,
          unknown
        >;
        return sseResponse([{ choices: [{ delta: { content: "ok" } }] }]);
      },
    );
    expect(sent.reasoning).toBeUndefined();
    expect(sent.temperature).toBeUndefined();
    // Thinking and the answer share this budget; too tight truncates the reply.
    expect(sent.max_tokens).toBeGreaterThanOrEqual(16_000);
  });

  it("gives Claude 5 room for its bigger tokenizer", () => {
    expect(usesAdaptiveThinking("anthropic/claude-sonnet-5")).toBe(true);
    expect(usesAdaptiveThinking("claude-sonnet-5")).toBe(true);
    expect(usesAdaptiveThinking("anthropic/claude-sonnet-4.6")).toBe(false);
    expect(usesAdaptiveThinking("google/gemini-2.5-flash")).toBe(false);
  });

  it("renames dotted tools for Claude and routes the call back", async () => {
    // Claude 400s on any tool name outside ^[a-zA-Z0-9_-]{1,128}$, which is
    // every tool here.
    let sent: Record<string, unknown> = {};
    const result = await openaiCompatibleChat(
      request({
        model: "anthropic/claude-sonnet-5",
        tools: [
          { name: "screen.capture", description: "d", parameters: {} },
          { name: "apply_patch", description: "d", parameters: {} },
        ],
        messages: [
          {
            role: "assistant",
            content: "",
            toolCalls: [
              { id: "c1", name: "screen.capture", arguments: "{}" },
            ],
          },
          { role: "tool", toolCallId: "c1", content: "{}" },
        ],
      }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<
          string,
          unknown
        >;
        return Response.json({
          choices: [
            {
              message: {
                tool_calls: [
                  {
                    id: "c2",
                    function: { name: "screen_capture", arguments: "{}" },
                  },
                ],
              },
              finish_reason: "tool_calls",
            },
          ],
        });
      },
    );
    const tools = sent.tools as Array<{ function: { name: string } }>;
    expect(tools.map((tool) => tool.function.name)).toEqual([
      "screen_capture",
      "apply_patch",
    ]);
    // The replayed history has to use the same names as the tool list.
    const messages = sent.messages as Array<{
      tool_calls?: Array<{ function: { name: string } }>;
    }>;
    expect(messages[0]?.tool_calls?.[0]?.function.name).toBe("screen_capture");
    // And what comes back is the name the runtime knows.
    expect(result.toolCalls?.[0]?.name).toBe("screen.capture");
  });

  it("plain-encodes dotted tool names on the wire for every model", async () => {
    let sent: Record<string, unknown> = {};
    await openaiCompatibleChat(
      request({
        model: "google/gemini-2.5-flash",
        tools: [{ name: "screen.capture", description: "d", parameters: {} }],
      }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<
          string,
          unknown
        >;
        return Response.json({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        });
      },
    );
    const tools = sent.tools as Array<{ function: { name: string } }>;
    expect(tools[0]?.function.name).toBe("screen_capture");
  });

  it("omits reasoning disable for Gemini flash on openrouter", async () => {
    let sent: Record<string, unknown> = {};
    await openaiCompatibleChat(
      request({
        model: "google/gemini-2.5-flash",
        thinking: false,
        // Multimodal disables stream; still a non-stream JSON body.
        messages: [
          {
            role: "user",
            content: [
              { type: "text", text: "look" },
              {
                type: "image_url",
                image_url: { url: "data:image/png;base64,AA==" },
              },
            ],
          },
        ],
      }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        return Response.json({
          choices: [{ message: { content: "ok" }, finish_reason: "stop" }],
        });
      },
    );
    expect(sent.reasoning).toBeUndefined();
    expect(sent.thinking).toBeUndefined();
  });

  it("accepts tool calls that omit id", async () => {
    const result = await openaiCompatibleChat(
      request({
        model: "google/gemini-2.5-flash",
        tools: [
          {
            name: "screen.capture",
            description: "shot",
            parameters: { type: "object", properties: {} },
          },
        ],
      }),
      async () =>
        Response.json({
          choices: [
            {
              finish_reason: "stop",
              message: {
                content: "",
                tool_calls: [
                  {
                    type: "function",
                    function: { name: "screen.capture", arguments: "{}" },
                  },
                ],
              },
            },
          ],
        }),
    );
    expect(result.toolCalls?.[0]?.name).toBe("screen.capture");
    expect(result.toolCalls?.[0]?.id).toMatch(/^call_/);
  });

  it("streams OpenRouter reasoning deltas separately from content", async () => {
    const textChunks: string[] = [];
    const reasonChunks: string[] = [];
    const result = await openaiCompatibleChat(
      request({
        thinking: true,
        model: "deepseek/deepseek-v4-pro",
        onTextChunk: (chunk) => textChunks.push(chunk),
        onReasoningChunk: (chunk) => reasonChunks.push(chunk),
      }),
      async (_url, init) => {
        const sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        expect(sent.reasoning).toEqual({ enabled: true, effort: "high" });
        expect(sent.max_tokens).toBeGreaterThanOrEqual(4096);
        return sseResponse([
          { choices: [{ delta: { reasoning: "먼저 " } }] },
          { choices: [{ delta: { reasoning: "계산하고" } }] },
          { choices: [{ delta: { content: "답은 " } }] },
          { choices: [{ delta: { content: "42" } }] },
          { choices: [{ delta: {}, finish_reason: "stop" }] },
        ]);
      },
    );
    expect(reasonChunks).toEqual(["먼저 ", "계산하고"]);
    expect(textChunks).toEqual(["답은 ", "42"]);
    expect(result.reasoning).toBe("먼저 계산하고");
    expect(result.text).toBe("답은 42");
  });

  // A GBNF means nothing to a hosted API, so a caller that needed a typed
  // answer got a guarantee on local weights and a polite request in the cloud.
  // The office wore that as a manager replying in prose and then apologising.
  it("holds a hosted model to JSON when a shape was demanded", async () => {
    let sent: Record<string, unknown> = {};
    await openaiCompatibleChat(
      request({
        jsonOnly: true,
        grammar: "root ::= object",
        onTextChunk: () => undefined,
      }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        return sseResponse([{ choices: [{ delta: { content: "{}" } }] }]);
      },
    );
    expect(sent.response_format).toEqual({ type: "json_object" });
    // The grammar itself is not sent: nothing hosted can compile one.
    expect(sent.grammar).toBeUndefined();
  });

  it("leaves the shape alone when tools are on the call", async () => {
    let sent: Record<string, unknown> = {};
    await openaiCompatibleChat(
      request({
        jsonOnly: true,
        onTextChunk: () => undefined,
        tools: [
          {
            name: "web_search",
            description: "search",
            parameters: { type: "object", properties: {} },
          },
        ],
      }),
      async (_url, init) => {
        sent = JSON.parse(String((init as RequestInit).body)) as Record<string, unknown>;
        return sseResponse([{ choices: [{ delta: { content: "ok" } }] }]);
      },
    );
    // A tool call is not a JSON object of ours, so demanding one would refuse
    // the model the only other thing it is allowed to do.
    expect(sent.response_format).toBeUndefined();
  });

  it("accepts reasoning_details text chunks", async () => {
    const reasonChunks: string[] = [];
    const result = await openaiCompatibleChat(
      request({
        thinking: true,
        onTextChunk: () => undefined,
        onReasoningChunk: (chunk) => reasonChunks.push(chunk),
      }),
      async () =>
        sseResponse([
          {
            choices: [
              {
                delta: {
                  reasoning_details: [{ type: "reasoning.text", text: "step one" }],
                },
              },
            ],
          },
          { choices: [{ delta: { content: "done" } }] },
        ]),
    );
    expect(reasonChunks).toEqual(["step one"]);
    expect(result.reasoning).toBe("step one");
    expect(result.text).toBe("done");
  });
});

describe("coerceMessageText", () => {
  it("joins OpenAI-style content parts", () => {
    expect(
      coerceMessageText([
        { type: "text", text: "hello " },
        { type: "text", text: "world" },
      ]),
    ).toBe("hello world");
  });
});

describe("openaiCompatibleChat non-stream", () => {
  it("accepts array content parts", async () => {
    const result = await openaiCompatibleChat(request(), async () =>
      Response.json({
        choices: [
          {
            message: {
              content: [{ type: "text", text: "from parts" }],
            },
          },
        ],
      }),
    );
    expect(result.text).toBe("from parts");
  });

  it("explains reasoning-only empty replies", async () => {
    await expect(
      openaiCompatibleChat(request({ thinking: true }), async () =>
        Response.json({
          choices: [
            {
              finish_reason: "length",
              message: {
                content: "",
                reasoning: "thinking hard about tools",
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow(LlmProviderError);
    await expect(
      openaiCompatibleChat(request({ thinking: true }), async () =>
        Response.json({
          choices: [
            {
              finish_reason: "length",
              message: {
                content: "",
                reasoning: "thinking hard about tools",
              },
            },
          ],
        }),
      ),
    ).rejects.toThrow(/reasoning|finish_reason=length/);
  });
});
