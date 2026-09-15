/**
 * What a tool call is about to do, in a sentence.
 *
 * A permission prompt is the one moment where a person has to decide something
 * about software they cannot see the inside of, and `screen.capture needs
 * approval` asks them to decide about a property name. The answer they give is
 * only as good as the question, so the question is written in words: what will
 * happen, and to what.
 *
 * Arguments are already validated by the time this runs, but they arrive here
 * as unknowns from a model, so every read is defensive: a prompt that throws
 * is a prompt nobody sees.
 */

import { uiElements } from "../desktop/ui-elements.js";

export interface ToolSentence {
  /** The action, as a person would say it. */
  title: string;
  /** The specifics — a file, a point, the words being typed. May be empty. */
  detail: string;
}

function str(args: Record<string, unknown>, key: string): string {
  const value = args[key];
  return typeof value === "string" ? value.trim() : "";
}

function num(args: Record<string, unknown>, key: string): number | null {
  const value = args[key];
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

/** Long text is quoted and cut, so a prompt stays one glanceable line. */
function quote(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, " ").trim();
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return `“${cut}”`;
}

function point(args: Record<string, unknown>): string {
  const x = num(args, "x");
  const y = num(args, "y");
  return x === null || y === null ? "" : `at ${x}, ${y}`;
}

/**
 * A click on a named element can say the name, which is a far better question
 * to put to a person than a pair of coordinates.
 */
function clickTarget(args: Record<string, unknown>): string {
  const elementId = str(args, "elementId");
  if (!elementId) return point(args);
  try {
    const element = uiElements.resolve(elementId);
    return `${quote(element.name)} (${element.role.toLowerCase()})`;
  } catch {
    return point(args);
  }
}

const BUTTON_WORD: Record<string, string> = {
  left: "Click",
  right: "Right-click",
  middle: "Middle-click",
};

/** The last part of a path, which is the part a person recognises. */
function fileName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts[parts.length - 1] ?? path;
}

export function describeToolCall(
  name: string,
  args: Record<string, unknown>,
): ToolSentence {
  switch (name) {
    case "workflow.search": {
      const query = str(args, "query");
      return {
        title: "Look through your saved flows",
        detail: query ? quote(query) : "",
      };
    }
    case "workflow.execute": {
      const flow = str(args, "workflow");
      return { title: "Run your flow", detail: flow ? quote(flow) : "" };
    }
    case "workflow.save": {
      const title = str(args, "title");
      return { title: "Save a flow for you", detail: title ? quote(title) : "" };
    }
    case "workflow.list":
      return { title: "Look through your saved flows", detail: "" };
    case "workspace.search": {
      const query = str(args, "query");
      return {
        title: "Search your notes, documents and past chats",
        detail: query ? quote(query) : "",
      };
    }
    case "agents.delegate": {
      const assignments = Array.isArray(args["assignments"])
        ? args["assignments"]
        : [];
      const access = assignments
        .map((item) =>
          item && typeof item === "object"
            ? str(item as Record<string, unknown>, "permission")
            : "",
        )
        .filter(Boolean);
      return {
        title: `Run ${assignments.length || "several"} independent agents`,
        detail:
          access.length > 0
            ? `Access: ${access.join(", ")}`
            : "Each run gets only the tools named in the plan.",
      };
    }
    case "workflow.run": {
      const flow = str(args, "workflow");
      return { title: "Run your flow", detail: flow ? quote(flow) : "" };
    }
    case "screen.capture":
      return { title: "Take a picture of your screen", detail: "" };
    case "screen.displays":
      return { title: "Check what displays are attached", detail: "" };
    case "ui.elements":
      return {
        title: "Read the buttons and fields of a window",
        detail: str(args, "app"),
      };
    case "screen.record.start":
      return { title: "Start recording your screen", detail: "" };
    case "screen.record.stop":
      return { title: "Stop recording your screen", detail: "" };
    case "input.move":
      return { title: "Move your mouse", detail: point(args) };
    case "input.click": {
      const count = num(args, "count") ?? 1;
      const button = BUTTON_WORD[str(args, "button") || "left"] ?? "Click";
      return {
        title:
          count > 1
            ? `Double-click on your screen`
            : `${button} on your screen`,
        detail: clickTarget(args),
      };
    }
    case "input.type": {
      const text = str(args, "text");
      return {
        title: "Type on your keyboard",
        detail: text ? quote(text) : "",
      };
    }
    case "input.key":
      return { title: "Press a key", detail: str(args, "keys") };
    case "input.scroll": {
      const ticks = num(args, "ticks") ?? 0;
      return {
        title: ticks < 0 ? "Scroll down" : "Scroll up",
        detail: point(args),
      };
    }
    case "app.launch": {
      const target = str(args, "target");
      if (target && /^https?:\/\//i.test(target)) {
        return { title: "Open in browser", detail: target };
      }
      if (
        target &&
        !target.includes("\\") &&
        !target.includes("/") &&
        /^[\w.-]+\.[a-z]{2,}/i.test(target)
      ) {
        return { title: "Open in browser", detail: target };
      }
      return { title: "Open an app", detail: target ? fileName(target) : "" };
    }
    case "app.focus":
      return { title: "Switch to another window", detail: str(args, "title") };
    case "shell.exec": {
      const command = str(args, "command");
      const rest = Array.isArray(args["args"])
        ? (args["args"] as unknown[]).filter(
            (a): a is string => typeof a === "string",
          )
        : [];
      return {
        title: "Run a program",
        detail: [command, ...rest].filter(Boolean).join(" ").trim(),
      };
    }
    case "doc.create": {
      const path = str(args, "path");
      const name = str(args, "name");
      return {
        title: "Create a document",
        detail: name || (path ? fileName(path) : ""),
      };
    }
    case "fs.write":
      return { title: "Write a file", detail: fileName(str(args, "path")) };
    case "fs.read":
      return { title: "Read a file", detail: fileName(str(args, "path")) };
    case "fs.list":
      return { title: "List a folder", detail: fileName(str(args, "path")) };
    case "apply_patch":
      return { title: "Edit a file", detail: fileName(str(args, "path")) };
    case "fs.patch.undo":
      return { title: "Undo a file edit", detail: "" };
    case "net.httpPost":
      return { title: "Send data to a website", detail: str(args, "url") };
    default: {
      // A tool from a connected MCP server: `mcp__Chrome_DevTools__new_page`.
      // The server it belongs to is the part worth reading out — being asked to
      // allow "Mcp chrome devtools new page" tells a person nothing about who
      // they would be trusting.
      if (name.startsWith("mcp__")) {
        const [, server = "", ...rest] = name.split("__");
        const server_ = server.replace(/_+/g, " ").trim();
        const action = rest.join(" ").replace(/_+/g, " ").trim();
        return {
          title: server_ ? `Use ${server_}` : "Use a connected tool",
          detail: action,
        };
      }
      // Anything unnamed still reads as an action rather than as a symbol:
      // "doc.findReplace" becomes "Doc find replace".
      const words = name
        .replace(/[._]/g, " ")
        .replace(/([a-z])([A-Z])/g, "$1 $2")
        .toLowerCase();
      return {
        title: words.charAt(0).toUpperCase() + words.slice(1),
        detail: "",
      };
    }
  }
}

/** The whole thing on one line, for a log or a headline. */
export function toolSentence(
  name: string,
  args: Record<string, unknown>,
): string {
  const { title, detail } = describeToolCall(name, args);
  return detail ? `${title}: ${detail}` : title;
}
