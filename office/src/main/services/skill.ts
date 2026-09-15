import { BrowserWindow, dialog } from "electron";
import { readFile, writeFile } from "node:fs/promises";
import { basename } from "node:path";
import {
  SkillDependencyError,
  packSkill,
  parseSkillFile,
  skillToJson,
  unpackSkill,
  type UnpackSkillResult,
} from "@redrob/registry";

export type ExportSkillResult =
  | { ok: true; path: string }
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string; missingIds?: string[] };

export type ImportSkillResult =
  | ({ ok: true } & UnpackSkillResult)
  | { ok: false; canceled: true }
  | { ok: false; canceled?: false; error: string; missingIds?: string[] };

function focusedWindow(eventSender?: Electron.WebContents): BrowserWindow | null {
  if (eventSender) {
    return BrowserWindow.fromWebContents(eventSender) ?? BrowserWindow.getFocusedWindow();
  }
  return BrowserWindow.getFocusedWindow() ?? BrowserWindow.getAllWindows()[0] ?? null;
}

function asError(error: unknown): { error: string; missingIds?: string[] } {
  if (error instanceof SkillDependencyError) {
    return { error: error.message, missingIds: error.missingIds };
  }
  return { error: error instanceof Error ? error.message : String(error) };
}

export async function exportSkillToFile(options: {
  workflowId: string;
  description?: string;
  author?: string;
  sender?: Electron.WebContents;
}): Promise<ExportSkillResult> {
  try {
    const skill = packSkill(options.workflowId, {
      ...(options.description ? { description: options.description } : {}),
      ...(options.author ? { author: options.author } : {}),
    });
    const win = focusedWindow(options.sender);
    const defaultName = `${skill.manifest.id.replace(/\//g, "-")}.redrobskill`;
    const saveOptions = {
      title: "Export Redrob Office skill",
      defaultPath: defaultName,
      filters: [{ name: "Redrob Office skill", extensions: ["redrobskill"] }],
    };
    const save = win
      ? await dialog.showSaveDialog(win, saveOptions)
      : await dialog.showSaveDialog(saveOptions);
    if (save.canceled || !save.filePath) {
      return { ok: false, canceled: true };
    }
    const destPath = save.filePath.endsWith(".redrobskill")
      ? save.filePath
      : `${save.filePath}.redrobskill`;
    await writeFile(destPath, skillToJson(skill), "utf8");
    return { ok: true, path: destPath };
  } catch (error) {
    return { ok: false, ...asError(error) };
  }
}

export async function importSkillFromFile(options?: {
  sender?: Electron.WebContents;
  /** Button / dialog labels from the renderer (i18n). */
  confirm?: {
    title: string;
    cancel: string;
    confirm: string;
    /** Templates; `{title}`, `{workflow}`, `{count}` filled after parse. */
    messageTemplate?: string;
    detailTemplate?: string;
  };
}): Promise<ImportSkillResult> {
  const win = focusedWindow(options?.sender);
  const openOptions = {
    title: "Import a skill",
    filters: [
      // A person importing from Claude or OpenClaw is holding a SKILL.md or a
      // playbook YAML, and a filter that hides those reads as "not supported".
      {
        name: "Skill or playbook",
        extensions: ["redrobskill", "json", "md", "markdown", "yaml", "yml"],
      },
    ],
    properties: ["openFile" as const],
  };
  const open = win
    ? await dialog.showOpenDialog(win, openOptions)
    : await dialog.showOpenDialog(openOptions);
  if (open.canceled || !open.filePaths[0]) {
    return { ok: false, canceled: true };
  }

  let skill;
  try {
    const raw = await readFile(open.filePaths[0], "utf8");
    skill = parseSkillFile(raw, basename(open.filePaths[0]));
  } catch (error) {
    return { ok: false, ...asError(error) };
  }

  const fill = (template: string): string =>
    template
      .replaceAll("{title}", skill.manifest.title)
      .replaceAll("{workflow}", skill.workflow.title)
      .replaceAll("{count}", String(skill.rubrics.length));

  const confirmCopy = {
    title: options?.confirm?.title ?? "Import skill?",
    message: fill(
      options?.confirm?.messageTemplate ?? 'Add "{title}" to this device?',
    ),
    detail: fill(
      options?.confirm?.detailTemplate ??
        "Workflow: {workflow}\nRubrics to add: {count}",
    ),
    cancel: options?.confirm?.cancel ?? "Cancel",
    confirm: options?.confirm?.confirm ?? "Import",
  };
  const confirmOptions = {
    type: "question" as const,
    buttons: [confirmCopy.cancel, confirmCopy.confirm],
    defaultId: 1,
    cancelId: 0,
    title: confirmCopy.title,
    message: confirmCopy.message,
    detail: confirmCopy.detail,
  };
  const confirm = win
    ? await dialog.showMessageBox(win, confirmOptions)
    : await dialog.showMessageBox(confirmOptions);
  if (confirm.response !== 1) {
    return { ok: false, canceled: true };
  }

  try {
    const result = unpackSkill(skill, { onCollision: "rename" });
    return { ok: true, ...result };
  } catch (error) {
    return { ok: false, ...asError(error) };
  }
}
