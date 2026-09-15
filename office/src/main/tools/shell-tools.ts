import { spawn } from "node:child_process";
import { z } from "zod";
import {
  assertPlanMatchesApproval,
  buildCanonicalExecPlan,
  gateShellExec,
} from "../security/index.js";
import { assertAllowedPath, isUnderAllowed } from "./path-policy.js";
import type { RegisteredTool, ToolResult } from "./types.js";

const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 120_000;
const MAX_CAPTURE_CHARS = 50_000;

export const shellExecTool: RegisteredTool = {
  name: "shell.exec",
  description:
    "Run a program with an argument array (no shell string concatenation). " +
    "cwd must be inside an allowed folder. Captures stdout/stderr with a timeout. " +
    "Any executable is allowed when exec security is full (the default); " +
    "approval follows exec ask mode and canonical-plan checks. " +
    "On Windows prefer ipconfig/dir/where; on Linux/macOS prefer ifconfig|ip/ls/which.",
  risk: "high",
  inputSchema: z.object({
    command: z.string().min(1).describe("Executable name or absolute path"),
    args: z
      .array(z.string())
      .default([])
      .describe("Argument vector; never pass a single concatenated shell string"),
    cwd: z.string().min(1).describe("Working directory (must be allowed)"),
    timeoutMs: z
      .number()
      .int()
      .positive()
      .max(MAX_TIMEOUT_MS)
      .optional()
      .describe("Timeout in ms (default 30000)"),
  }),
  async handler(input, ctx): Promise<ToolResult> {
    const cwd = assertAllowedPath(input.cwd, ctx.allowedPaths, "shell.exec cwd");
    if (
      input.command.includes("/") ||
      input.command.includes("\\") ||
      /^[A-Za-z]:[\\/]/.test(input.command)
    ) {
      if (!isUnderAllowed(input.command, ctx.allowedPaths)) {
        return {
          ok: false,
          summary: "Executable path not allowed",
          error: "Executable path is outside allowed folders",
        };
      }
    }

    const args = input.args ?? [];
    const security = ctx.execSecurity ?? "full";
    const ask = ctx.execAsk ?? "off";
    const allowlist = ctx.execAllowlist ?? [];
    const gate = gateShellExec({
      command: input.command,
      args,
      cwd,
      security,
      ask,
      allowlist,
    });
    if (!gate.allowed) {
      return {
        ok: false,
        summary: gate.reason || "Exec denied by policy",
        error: gate.reason || "Exec denied",
      };
    }

    const currentPlan = buildCanonicalExecPlan({
      command: input.command,
      args,
      cwd,
    });
    if (ctx.approvedExecPlan) {
      try {
        assertPlanMatchesApproval(ctx.approvedExecPlan, currentPlan);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return { ok: false, summary: message, error: message };
      }
    }

    const timeoutMs = Math.min(input.timeoutMs ?? DEFAULT_TIMEOUT_MS, MAX_TIMEOUT_MS);

    return await new Promise<ToolResult>((resolvePromise) => {
      let settled = false;
      const finish = (result: ToolResult): void => {
        if (settled) return;
        settled = true;
        resolvePromise(result);
      };

      const child = spawn(input.command, args, {
        cwd,
        windowsHide: true,
        shell: false,
        signal: ctx.signal,
        env: process.env,
      });

      let stdout = "";
      let stderr = "";
      child.stdout?.setEncoding("utf8");
      child.stderr?.setEncoding("utf8");
      child.stdout?.on("data", (chunk: string) => {
        if (stdout.length < MAX_CAPTURE_CHARS) {
          stdout += chunk.slice(0, MAX_CAPTURE_CHARS - stdout.length);
        }
      });
      child.stderr?.on("data", (chunk: string) => {
        if (stderr.length < MAX_CAPTURE_CHARS) {
          stderr += chunk.slice(0, MAX_CAPTURE_CHARS - stderr.length);
        }
      });

      const timer = setTimeout(() => {
        child.kill("SIGTERM");
        setTimeout(() => child.kill("SIGKILL"), 2000);
        finish({
          ok: false,
          summary: `Timed out after ${timeoutMs}ms`,
          error: `Timeout ${timeoutMs}ms`,
          data: {
            timedOut: true,
            stdoutChars: stdout.length,
            stderrChars: stderr.length,
            stdout: stdout.slice(0, 8000),
            stderr: stderr.slice(0, 4000),
          },
        });
      }, timeoutMs);

      child.on("error", (err) => {
        clearTimeout(timer);
        finish({
          ok: false,
          summary: `Failed to spawn: ${err.message}`,
          error: err.message,
        });
      });

      child.on("close", (code, signal) => {
        clearTimeout(timer);
        const ok = code === 0;
        finish({
          ok,
          summary: ok
            ? `Exit 0 (stdout ${stdout.length} chars, stderr ${stderr.length} chars)`
            : `Exit ${code ?? "null"} signal=${signal ?? "none"} (stdout ${stdout.length}, stderr ${stderr.length})`,
          data: {
            code,
            signal,
            stdoutChars: stdout.length,
            stderrChars: stderr.length,
            stdout: stdout.slice(0, 8000),
            stderr: stderr.slice(0, 4000),
          },
          ...(ok ? {} : { error: `Non-zero exit ${code}` }),
        });
      });
    });
  },
};
