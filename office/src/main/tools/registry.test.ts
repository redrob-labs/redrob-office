import { describe, expect, it } from "vitest";
import { profileFromPreset } from "../security/index.js";
import type { SecurityPolicyBundle } from "../security/types.js";
import {
  getComputerTool,
  registryToolCloudDefinition,
  computerToolsAsCloudDefinitions,
} from "./registry.js";

describe("registryToolCloudDefinition", () => {
  it("builds a cloud definition from a registered tool's Zod schema", () => {
    const def = registryToolCloudDefinition("memory.manage");
    expect(def).toBeTruthy();
    expect(def!.name).toBe("memory.manage");
    // Parameters come straight from the Zod schema (single source of truth).
    const params = def!.parameters as { properties?: Record<string, unknown> };
    expect(params.properties).toHaveProperty("action");
  });

  it("keeps Zod .default() fields optional in the JSON Schema the model sees", () => {
    const launch = registryToolCloudDefinition("app.launch")!;
    const params = launch.parameters as {
      required?: string[];
      properties?: Record<string, unknown>;
    };
    expect(params.properties).toHaveProperty("target");
    expect(params.properties).toHaveProperty("args");
    expect(params.required).toEqual(["target"]);
    expect(params.required).not.toContain("args");

    const shell = registryToolCloudDefinition("shell.exec")!;
    const shellParams = shell.parameters as { required?: string[] };
    expect(shellParams.required).toContain("command");
    expect(shellParams.required).not.toContain("args");
  });

  it("returns undefined for an unknown tool", () => {
    expect(registryToolCloudDefinition("does.not.exist")).toBeUndefined();
  });

  it("exposes the app tools chat can drive", () => {
    expect(getComputerTool("memory.manage")).toBeTruthy();
    expect(getComputerTool("settings.update")).toBeTruthy();
  });

  it("registers the DOM-grounded browser tools with numbered-element schemas", () => {
    for (const name of ["browser.open", "browser.elements", "browser.click", "browser.type", "browser.read"]) {
      expect(getComputerTool(name)).toBeTruthy();
      expect(registryToolCloudDefinition(name)).toBeTruthy();
    }
    const click = registryToolCloudDefinition("browser.click")!;
    const params = click.parameters as { properties?: Record<string, unknown> };
    expect(params.properties).toHaveProperty("mark");
  });

  it("computerToolsAsCloudDefinitions reuses the same builder for every tool", () => {
    const all = computerToolsAsCloudDefinitions();
    const memory = all.find((d) => d.name === "memory.manage");
    expect(memory).toEqual(registryToolCloudDefinition("memory.manage"));
  });
});

describe("path tools name the folders they may use", () => {
  const bundle = (roots: string[]): SecurityPolicyBundle => ({
    global: {
      deniedGroups: [],
      deniedTools: [],
      execSecurity: "allowlist",
      execAsk: "always",
      execAllowlist: [],
      elevatedEnabled: false,
    },
    profile: profileFromPreset("author"),
    sandbox: { mode: "workspace", workspaceRoots: roots, readonly: false },
  });

  it("tells the model where it may write, so it does not have to guess", () => {
    const write = computerToolsAsCloudDefinitions(bundle(["/home/me/redrob/documents"])).find(
      (def) => def.name === "fs.write",
    );
    expect(write!.description).toContain("/home/me/redrob/documents");
    expect(write!.description).toContain("Allowed folder:");
  });

  it("lists every folder when there is more than one", () => {
    const read = computerToolsAsCloudDefinitions(bundle(["/a", "/b"])).find(
      (def) => def.name === "fs.read",
    );
    expect(read!.description).toContain("Allowed folders: /a, /b");
  });

  it("leaves tools that take no path alone", () => {
    const memory = computerToolsAsCloudDefinitions(bundle(["/a"])).find(
      (def) => def.name === "memory.manage",
    );
    expect(memory).toEqual(registryToolCloudDefinition("memory.manage"));
  });
});
