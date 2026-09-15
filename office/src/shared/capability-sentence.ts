/**
 * A tool call, said as a sentence instead of shown as JSON.
 *
 * Borrowed from OpenWork's `capability-call.ts`: a run is easier to trust when
 * each step reads as "Searching your flows" / "Ran your flow" than when it is a
 * property name and an argument blob. The mapping is pure so it can be unit
 * tested without a browser, and it never leaks an opaque id into the sentence.
 */

export interface CapabilitySentence {
  /** Present tense, shown while the step runs. */
  present: string;
  /** Past tense, shown once it returned. */
  past: string;
}

const VERB: Record<string, { present: string; past: string }> = {
  search: { present: "Searching", past: "Searched" },
  find: { present: "Finding", past: "Found" },
  read: { present: "Reading", past: "Read" },
  list: { present: "Listing", past: "Listed" },
  open: { present: "Opening", past: "Opened" },
  write: { present: "Writing", past: "Wrote" },
  create: { present: "Creating", past: "Created" },
  run: { present: "Running", past: "Ran" },
  save: { present: "Saving", past: "Saved" },
  fetch: { present: "Fetching", past: "Fetched" },
  send: { present: "Sending", past: "Sent" },
  update: { present: "Updating", past: "Updated" },
};

/** Long text is quoted and cut so a line stays glanceable. */
function quote(text: string, max = 60): string {
  const flat = text.replace(/\s+/g, " ").trim();
  if (!flat) return "";
  const cut = flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
  return `“${cut}”`;
}

function withDetail(base: { present: string; past: string }, detail?: string): CapabilitySentence {
  const tail = detail ? ` ${detail}` : "";
  return { present: `${base.present}${tail}`, past: `${base.past}${tail}` };
}

/**
 * Turn a tool name + already-parsed args into a sentence.
 *
 * The registry hands the renderer a `label` (a present-ish title) and a `name`;
 * this maps the ones worth naming specially and falls back to the label for the
 * rest, so an unmapped tool still reads as a phrase rather than an id.
 */
export function capabilitySentence(
  name: string,
  args: Record<string, unknown> = {},
  fallbackLabel?: string,
): CapabilitySentence {
  const str = (key: string): string => {
    const value = args[key];
    return typeof value === "string" ? value.trim() : "";
  };

  switch (name) {
    case "workflow.search":
    case "workflow.list": {
      const q = str("query");
      return withDetail(
        { present: "Searching your flows", past: "Searched your flows" },
        q ? `for ${quote(q)}` : undefined,
      );
    }
    case "workflow.execute":
    case "workflow.run": {
      const flow = str("workflow");
      const mode = str("mode");
      if (mode === "guide") {
        return withDetail(
          { present: "Opening your flow", past: "Opened your flow" },
          flow ? quote(flow) : undefined,
        );
      }
      return withDetail(
        { present: "Running your flow", past: "Ran your flow" },
        flow ? quote(flow) : undefined,
      );
    }
    case "workflow.save":
      return withDetail(
        { present: "Saving a flow", past: "Saved a flow" },
        quote(str("title")) || undefined,
      );
    case "memory.manage": {
      const action = str("action") || "list";
      const map: Record<string, CapabilitySentence> = {
        list: { present: "Reading what it remembers", past: "Read what it remembers" },
        add: { present: "Remembering that", past: "Remembered that" },
        update: { present: "Updating a memory", past: "Updated a memory" },
        delete: { present: "Forgetting that", past: "Forgot that" },
      };
      return map[action] ?? map.list!;
    }
    case "settings.update":
      return { present: "Changing a setting", past: "Changed a setting" };
    case "web.fetch":
      return withDetail(
        { present: "Reading a page", past: "Read a page" },
        quote(str("url")) || undefined,
      );
    case "web_search":
    case "web.search":
      return withDetail(
        { present: "Searching the web", past: "Searched the web" },
        quote(str("query")) || undefined,
      );
    case "doc.create":
      return withDetail(
        { present: "Creating a document", past: "Created a document" },
        quote(str("name")) || undefined,
      );
    case "fs.write":
      return withDetail(
        { present: "Writing a file", past: "Wrote a file" },
        quote(str("path")) || undefined,
      );
    default:
      break;
  }

  // Derive from the name's leading verb (`doc.open` → open, `sheet.writeRange` → write).
  const verbKey = name.split(/[.\-_]/)[0]?.toLowerCase() ?? "";
  const verb = VERB[verbKey];
  if (verb) return { present: `${verb.present}…`, past: `${verb.past}` };

  const label = fallbackLabel?.trim();
  if (label) return { present: label, past: label };
  return { present: name, past: name };
}
