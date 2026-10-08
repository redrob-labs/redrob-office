/**
 * The kit's `Tabs` with a panel for every tab.
 *
 * Kit 1.0.2 gives each tab `aria-controls="panel-<id>"` but renders only the
 * selected panel (and only when it is given children), so the other tabs point
 * at nothing, and its ids are global (`tab-<id>`), so two tab lists with a
 * "table" tab on one page collide. This prefixes the ids and renders one
 * `role="tabpanel"` per tab, hidden unless selected, with the content in the
 * selected one. See docs/redrob-ui-gaps.md.
 */
import type { ReactNode } from "react";
import { Tabs } from "@redrob-labs/ui";

export interface TabbedPanelsItem<T extends string> {
  id: T;
  label: string;
  disabled?: boolean;
}

export interface TabbedPanelsProps<T extends string> {
  /** Unique on the page; prefixes every tab and panel id. */
  idPrefix: string;
  /** Names the tab list for assistive technology. */
  label: string;
  items: Array<TabbedPanelsItem<T>>;
  value: T;
  onChange: (id: T) => void;
  variant?: "line" | "pill" | "enclosed";
  className?: string;
  panelClassName?: string;
  /** Content of the selected panel. */
  children?: ReactNode;
}

export function TabbedPanels<T extends string>({
  idPrefix,
  label,
  items,
  value,
  onChange,
  variant = "line",
  className,
  panelClassName,
  children,
}: TabbedPanelsProps<T>): React.JSX.Element {
  const full = (id: T) => `${idPrefix}-${id}`;
  const byFull = new Map(items.map((it) => [full(it.id), it.id]));
  return (
    <>
      <Tabs
        label={label}
        variant={variant}
        className={className}
        value={full(value)}
        items={items.map((it) => ({
          id: full(it.id),
          label: it.label,
          disabled: it.disabled,
        }))}
        onChange={(id) => {
          const next = byFull.get(id);
          if (next !== undefined) onChange(next);
        }}
      />
      {items.map((it) => (
        <div
          key={it.id}
          role="tabpanel"
          id={`panel-${full(it.id)}`}
          aria-labelledby={`tab-${full(it.id)}`}
          hidden={it.id !== value}
          className={panelClassName}
        >
          {it.id === value ? children : null}
        </div>
      ))}
    </>
  );
}
