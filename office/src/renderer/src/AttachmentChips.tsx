import { useI18n } from "@redrob/ui";
import type { ChatAttachment } from "../../shared/office-api";
import { Spinner } from "./Spinner";

/**
 * What is attached to the message being written, above the box.
 *
 * Shared by both composers: an attachment means the same thing in the office as
 * it does in chat, and a picture has to be shown rather than named, or there is
 * no way to tell which screenshot you pasted.
 */
export function AttachmentChips({
  files,
  onRemove,
  disabled = false,
  attaching = false,
}: {
  files: readonly ChatAttachment[];
  onRemove: (id: string) => void;
  disabled?: boolean;
  attaching?: boolean;
}): JSX.Element | null {
  const { t } = useI18n();
  if (files.length === 0 && !attaching) return null;
  return (
    <ul className="mb-2 flex flex-wrap items-center gap-1.5 px-1">
      {files.map((file) => (
        <li
          key={file.id}
          className="inline-flex items-center gap-1.5 rounded border border-gray-200 bg-white py-1 pl-1 pr-2.5 text-xs text-gray-700 shadow-sm"
        >
          {file.image ? (
            <img
              // Staged on disk rather than held as a data URL, so the thumbnail
              // costs a file read instead of a copy of the whole picture.
              src={`file://${file.image.path.replace(/\\/g, "/")}`}
              alt={file.name}
              className="h-6 w-6 rounded object-cover"
            />
          ) : null}
          <span className={`max-w-[10rem] truncate ${file.image ? "" : "pl-1.5"}`}>
            {file.name}
          </span>
          {file.truncated ? (
            <span className="text-gray-600">
              {t("chat.attachmentTruncated")}
            </span>
          ) : null}
          <button
            type="button"
            className="rounded p-0.5 text-gray-600 hover:bg-gray-100 hover:text-gray-900"
            aria-label={t("chat.removeAttachment", { name: file.name })}
            disabled={disabled}
            onClick={() => onRemove(file.id)}
          >
            ×
          </button>
        </li>
      ))}
      {attaching ? (
        <li className="inline-flex items-center gap-1.5 px-1 text-xs text-gray-500">
          <Spinner className="h-3 w-3 text-gray-400" />
          {t("composer.attaching")}
        </li>
      ) : null}
    </ul>
  );
}
