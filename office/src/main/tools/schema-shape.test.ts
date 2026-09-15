import { describe, expect, it } from "vitest";
import { computerToolsAsCloudDefinitions } from "./registry.js";

/**
 * Anthropic checks every tool schema against JSON Schema draft 2020-12 and
 * refuses the entire list when one is wrong, so a single tool written with the
 * wrong helper takes the whole desktop offline.
 */
describe("tool schemas the providers will accept", () => {
  // The definitions as they are actually sent, not a second conversion that
  // could stay right while the real one drifts.
  const tools = computerToolsAsCloudDefinitions();

  it("has tools to check", () => {
    expect(tools.length).toBeGreaterThan(10);
  });

  it("names tools in the character set Claude allows", () => {
    // `screen.capture` is renamed on the way out; the part before the dot still
    // has to survive it, and nothing may carry a space or a colon.
    for (const tool of tools) {
      expect(tool.name).toMatch(/^[a-zA-Z0-9_.-]{1,120}$/);
    }
  });

  it("writes exclusive bounds as numbers, not draft-4 booleans", () => {
    // fs.read's z.positive() was going out as `exclusiveMinimum: true`, which
    // 400s the whole request.
    for (const tool of tools) {
      for (const [path, value] of exclusiveBounds(tool.parameters)) {
        expect(
          typeof value,
          `${tool.name} ${path} is ${JSON.stringify(value)}`,
        ).toBe("number");
      }
    }
  });

  it("gives every tool an object at the root and no $schema", () => {
    for (const tool of tools) {
      const json = tool.parameters as { type?: unknown; $schema?: unknown };
      expect(json.type, tool.name).toBe("object");
      expect(json.$schema, tool.name).toBeUndefined();
    }
  });
});

function* exclusiveBounds(
  node: unknown,
  path = "$",
): Generator<[string, unknown]> {
  if (Array.isArray(node)) {
    for (const [index, item] of node.entries()) {
      yield* exclusiveBounds(item, `${path}[${index}]`);
    }
    return;
  }
  if (!node || typeof node !== "object") return;
  for (const [key, value] of Object.entries(node)) {
    if (key === "exclusiveMinimum" || key === "exclusiveMaximum") {
      yield [`${path}.${key}`, value];
      continue;
    }
    yield* exclusiveBounds(value, `${path}.${key}`);
  }
}
