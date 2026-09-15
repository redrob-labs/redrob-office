import type { StaffProfile, StaffProfilePreset, ToolGroup } from "./types.js";
import { DOC_WRITE_TOOLS } from "./tool-groups.js";

const ALL_GROUPS: ToolGroup[] = [
  "group:fs",
  "group:runtime",
  "group:ui",
  "group:automation",
  "group:doc",
  "group:web",
  "group:network",
];

export function profileFromPreset(preset: StaffProfilePreset): StaffProfile {
  switch (preset) {
    case "full":
      return {
        preset: "full",
        allowedGroups: [...ALL_GROUPS],
        deniedTools: [],
        writeAllowed: true,
        editAllowed: true,
        execAllowed: true,
      };
    case "author":
      return {
        preset: "author",
        // Everything readonly may do, and writing files and documents on top.
        // Not exec, and not group:network: authoring a file inside the sandbox
        // stays on this machine, while running a command or sending something
        // out does not, so those keep needing the full profile.
        allowedGroups: [
          "group:fs",
          "group:ui",
          "group:automation",
          "group:doc",
          "group:web",
        ],
        deniedTools: [],
        writeAllowed: true,
        editAllowed: true,
        execAllowed: false,
      };
    case "minimal":
      return {
        preset: "minimal",
        allowedGroups: ["group:ui", "group:automation"],
        deniedTools: [],
        writeAllowed: false,
        editAllowed: false,
        execAllowed: false,
      };
    case "readonly":
    default:
      return {
        preset: "readonly",
        // Looking something up is reading, so it belongs in the readonly profile
        // exactly as reading a file does.
        allowedGroups: [
          "group:fs",
          "group:ui",
          "group:automation",
          "group:doc",
          "group:web",
        ],
        deniedTools: [
          "fs.write",
          "apply_patch",
          "fs.patch.undo",
          ...DOC_WRITE_TOOLS,
        ],
        writeAllowed: false,
        editAllowed: false,
        execAllowed: false,
      };
  }
}
