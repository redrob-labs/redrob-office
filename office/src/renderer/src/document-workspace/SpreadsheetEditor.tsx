import { useEffect, useMemo, useState } from "react";
import { useI18n } from "@redrob/ui";
import type {
  ArtifactView,
  DocRenderModel,
} from "../../../shared/office-api";
import type { XlsxSheetView } from "../../../shared/doc-render";
import { Spinner } from "../Spinner";

type CellChange = { row: number; column: number; value: string };

function cellKey(row: number, column: number): string {
  return `${row}:${column}`;
}

function dimensions(sheet: XlsxSheetView): { rows: number; columns: number } {
  return {
    rows: Math.max(1, sheet.rows.length),
    columns: Math.max(
      1,
      sheet.columnWidths.length,
      ...sheet.rows.map((row) => row.cells.length),
    ),
  };
}

/**
 * A deliberately small spreadsheet editor: the rendered workbook remains the
 * source of truth and only changed cells are sent back, so formulas, styling,
 * charts and untouched sheets survive the save.
 */
export function SpreadsheetEditor({
  artifact,
  onSaved,
}: {
  artifact: ArtifactView;
  onSaved?: (next: ArtifactView) => void;
}): JSX.Element {
  const { t } = useI18n();
  const [model, setModel] = useState<Extract<
    DocRenderModel,
    { kind: "xlsx" }
  > | null>(null);
  const [sheetName, setSheetName] = useState("");
  const [changes, setChanges] = useState<Map<string, CellChange>>(new Map());
  const [extraRows, setExtraRows] = useState(0);
  const [extraColumns, setExtraColumns] = useState(0);
  const [busy, setBusy] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setBusy(true);
    setError(null);
    setModel(null);
    void window.office
      .docRenderModel(artifact.absolutePath)
      .then((next) => {
        if (!alive) return;
        if (next.kind !== "xlsx") {
          throw new Error("This file is not a spreadsheet.");
        }
        setModel(next);
        setSheetName((current) =>
          next.sheets.some((sheet) => sheet.name === current)
            ? current
            : (next.sheets[0]?.name ?? ""),
        );
        setChanges(new Map());
        setExtraRows(0);
        setExtraColumns(0);
      })
      .catch((reason: unknown) => {
        if (alive) setError(reason instanceof Error ? reason.message : String(reason));
      })
      .finally(() => {
        if (alive) setBusy(false);
      });
    return () => {
      alive = false;
    };
  }, [artifact.id, artifact.revision, artifact.absolutePath]);

  const sheet = useMemo(
    () => model?.sheets.find((item) => item.name === sheetName) ?? null,
    [model, sheetName],
  );
  const size = sheet ? dimensions(sheet) : { rows: 1, columns: 1 };
  const rowCount = size.rows + extraRows;
  const columnCount = size.columns + extraColumns;

  function valueAt(row: number, column: number): string {
    const changed = changes.get(cellKey(row, column));
    if (changed) return changed.value;
    return sheet?.rows[row - 1]?.cells[column - 1]?.text ?? "";
  }

  function changeCell(row: number, column: number, value: string): void {
    setChanges((current) => {
      const next = new Map(current);
      next.set(cellKey(row, column), { row, column, value });
      return next;
    });
  }

  async function save(): Promise<void> {
    if (!sheet || changes.size === 0) return;
    setSaving(true);
    setError(null);
    try {
      const next = await window.office.updateSpreadsheetArtifact({
        id: artifact.id,
        sheet: sheet.name,
        changes: [...changes.values()],
        baseRevision: artifact.revision,
      });
      setChanges(new Map());
      onSaved?.(next);
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : String(reason));
    } finally {
      setSaving(false);
    }
  }

  if (busy) {
    return (
      <p className="flex items-center gap-2 p-4 text-xs text-gray-500">
        <Spinner className="h-3.5 w-3.5" />
        {t("documentsPanel.previewBuilding")}
      </p>
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded border border-gray-200">
      <div className="flex shrink-0 items-center gap-2 border-b border-gray-200 bg-gray-50 px-3 py-2">
        <label className="flex items-center gap-2 text-xs text-gray-600">
          {t("documentsPanel.sheet")}
          <select
            className="rounded border border-gray-300 bg-white px-2 py-1 text-xs text-gray-900"
            value={sheetName}
            onChange={(event) => {
              setSheetName(event.target.value);
              setChanges(new Map());
              setExtraRows(0);
              setExtraColumns(0);
            }}
          >
            {(model?.sheets ?? []).map((item) => (
              <option key={item.name} value={item.name}>
                {item.name}
              </option>
            ))}
          </select>
        </label>
        <span className="flex-1" />
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => setExtraRows((count) => count + 1)}
        >
          {t("documentsPanel.addRow")}
        </button>
        <button
          type="button"
          className="btn-secondary text-xs"
          onClick={() => setExtraColumns((count) => count + 1)}
        >
          {t("documentsPanel.addColumn")}
        </button>
        <button
          type="button"
          className="btn-primary text-xs"
          disabled={saving || changes.size === 0}
          onClick={() => void save()}
        >
          {saving ? t("documentsPanel.saving") : t("documentWorkspace.save")}
        </button>
      </div>
      {error ? (
        <p className="m-3 shrink-0 rounded border border-warning-muted bg-warning-soft px-3 py-2 text-xs text-warning-ink">
          {error}
        </p>
      ) : null}
      <div className="min-h-0 flex-1 overflow-auto bg-white">
        <table className="border-collapse text-xs">
          <tbody>
            {Array.from({ length: rowCount }, (_, rowIndex) => (
              <tr key={rowIndex}>
                <th className="sticky left-0 z-10 min-w-10 border border-gray-200 bg-gray-50 px-2 text-right font-normal text-gray-400">
                  {rowIndex + 1}
                </th>
                {Array.from({ length: columnCount }, (_, columnIndex) => (
                  <td key={columnIndex} className="border border-gray-200 p-0">
                    <input
                      className="h-8 min-w-28 bg-transparent px-2 text-gray-900 outline-none focus:bg-brand-50 focus:ring-1 focus:ring-inset focus:ring-brand-400"
                      value={valueAt(rowIndex + 1, columnIndex + 1)}
                      onChange={(event) =>
                        changeCell(
                          rowIndex + 1,
                          columnIndex + 1,
                          event.target.value,
                        )
                      }
                    />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
