# Redrob UI gaps in Office

Office's chrome runs on `@redrob-labs/ui` 1.0.2 through `@genoffice/ui` (see "Design system" in
`AGENTS.md`). This file lists where the suite does not use a kit component as shipped, why, and what
would close each gap. Upstream fixes belong in `redrob-labs/redrob-ui`.

## Kit components Office wraps or does not use

| Gap                                                     | What Office does                                                                                                                        | To close                                                            |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------- |
| The kit `Input` does not forward a ref.                 | Inputs that need a ref (focus or selection management) use the kit's CSS classes on a native `<input>`.                                 | `forwardRef` in the kit `Input`.                                    |
| The kit `Composer` has no Esc, paste or ref hooks.      | `AgentComposer` in `@genoffice/ui` wraps it so Esc stops a run, pasted files become attachments and the panel can focus the textarea.   | Kit `Composer` props for `onKeyDown`, `onPaste` and a textarea ref. |
| The kit `ModelPicker` expects its own model data shape. | Office's model list comes from the engine in a different shape, so model choice keeps an Office control and the kit picker is not used. | An adapter, or a looser `ModelPicker` item type.                    |
| The kit has no dense menu dropdown or hover ScreenTip.  | `Dropdown` and `installScreenTips` stay as Office components, restyled with kit tokens.                                                 | Kit `Menu` density and a tooltip with a delay and rich body.        |
| Some i18n strings are not props on the kit component.   | The kit's CSS-class form is used, or the component is wrapped so every string comes from `@genoffice/i18n`.                             | String props on every user-visible label.                           |
| The design system defines `Avatar` and `AvatarMark`, but kit 1.0.2 does not ship them. | `PresenceFaces` in `@genoffice/ui` (`src/frame/PresenceFaces.tsx`) draws initials on a seat colour (`--office-peer-*`). It has no photos. | Ship `Avatar` in the kit, then build `PresenceFaces` on it. |
| The design system defines `ComposerMode`, `PlanDocument` and `Opinion`, but kit 1.0.2 does not ship them. | `@genoffice/ui` builds them in `src/Plan.tsx` and `src/plan.css` with the design system's anatomy (`go-cmode`, `go-plandoc`) on kit tokens. `Opinion` composes the kit's own `Disputed` and `OpinionAdded`. Every label is a prop. | Ship the three in the kit with the same props, then delete `Plan.tsx` and `plan.css`. |

## Office surfaces still short of the kit pattern

- The Docs ribbon tabs are plain buttons, not a `tablist`. The panels below them are rebuilt on
  every switch, so arrow-key tab roving was not added.
- The Univer sheet bar (the sheet tabs at the bottom of Sheets) is restyled by an override layer
  rather than replaced with a kit tabs component. Univer owns its DOM and events.
- `@fluentui/react-icons` remains in Sheets. It is the catalogue behind Insert > Icons, which is
  document content, not chrome. Chrome icons come from the kit.
- The Hangul studio gets kit token values injected (`studio-theme.ts`) but not the kit's fonts. The
  studio's own font stack still renders its menus.

## Tokens

`packages/genoffice-ui/src/tokens.css` keeps a small set of Office extension tokens. These are values
the kit has no semantic token for, picked per theme from its ramps:

- `--border-control`, `--border-hover`, `--color-border-strong`;
- `--pressed`, `--active-bg`, `--bg-hover-strong`, `--bg-hover-accent`, `--icon-muted`;
- `--danger-bg`, `--danger-border`, `--success-bg`, `--success-border`, `--color-error-hover`;
- `--font-chrome`, `--fs-body-lg`, `--fs-small`, `--fs-caption`, `--transition-fast`;
- `--office-peer-1-bg` … `--office-peer-6-ink`, one fill and ink pair per seat for people in a shared
  file, from the accent ramps (step 1 on step 5 in light, the reverse in dark). Docs paints carets on
  the paper with its own paper constants, `--docs-paper-peer-*`, in the same seat order.
  `apps/docs/tests/peer-contrast.test.ts` holds both sets to 4.5:1.

Each could become a kit semantic token (for example a control border, a pressed fill or tinted
status backgrounds). Once that happens, the extension token should be renamed at its use sites and
deleted here.

## Residual CSS

The Docs, Sheets and Slides stylesheets still hold rules for markup the kit components replaced.
Their ribbons kept their legacy class names, restyled in CSS, because descendant selectors made a
rename risky. Some of the older panel rules no longer match anything. Pruning them needs the visual
suite to confirm that each removed rule was dead.

## Bundle candidates

These are the Office-only parts the design system lists as bundle candidates. Each one is built on kit
tokens, and every user-visible string is a prop, so it can move into the kit unchanged. The props below
are final. Fields marked optional (`?`) may be omitted.

### In `@genoffice/ui` today

| Component | Props |
| --- | --- |
| `EditorFrame` (`src/frame/EditorFrame.tsx`) | `strings`, `fileName`, `search: { tools, strings, onAsk? }`, `toolbar`, `onToolbarChange`, `toolbarStrings`, `simpleToolbar`, `classicToolbar`, `children`, `panelOpen`, `onPanelOpenChange`, `panelWidth`, `onPanelWidthChange`; slots `fileMenu?`, `title?`, `saveStatus?`, `faces?`, `share?`, `banner?`, `rail?`, `railWidth?`, `panel?`, `status?`; `onUndo?`, `onRedo?`, `canUndo?`, `canRedo?`, `mode?: ModeMenuProps`, `className?` |
| `ModeMenu`: Editing, Suggesting, Viewing (`src/frame/parts.tsx`) | `value: EditMode`, `onChange(mode)`, `strings: ModeMenuStrings`, `unavailable?: EditMode[]` |
| `ToolbarSwitch`: Simple or Classic (`src/frame/parts.tsx`) | `value: ToolbarChoice`, `onChange(choice)`, `strings: ToolbarSwitchStrings`, `tip?: boolean` |
| `FormatChip` (`src/frame/parts.tsx`) | `file: string` (a name or an extension) |
| `CommandSearch` (`src/frame/CommandSearch.tsx`) | `tools: FrameTool[]` (`id`, `label`, `keywords?`, `group?`, `run`, `disabled?`), `strings: CommandSearchStrings`, `onAsk?(query)`, `limit?`, `className?` |
| `PresenceFaces` (`src/frame/PresenceFaces.tsx`) | `people: { key, name, where? }[]`, `strings: { label, person, personHere, more }`, `max?` (default 4) |

### In an app today, to move

| Component | Where | Props |
| --- | --- | --- |
| Linked figure card | `apps/docs/src/renderer/linked/FigureCard.tsx` | `state: FactsState`, `file`, `fact`, `part`, `anchor: { left, top, bottom }`, `command(cmd: FactsCommand)`, `onClose`, `readOnly?` |
| Sources rail | `apps/docs/src/renderer/linked/SourcesRail.tsx` | `state: FactsState \| null`, `file`, `figures: DocFigure[]`, `onPick(figure)`, `onClose` |
| Updates review | `apps/shell/src/renderer/src/home/UpdatesView.tsx` | `facts: { state, loadFailed, retry, command }`, `openPath(path)` |
| Comment box with @mentions and @Redrob | `apps/docs/src/renderer/comments/MentionTextarea.tsx` | `value`, `onChange`, `people: { name, redrob? }[]`, `onSubmit`, `onEscape?`, `placeholder?`, `className?`, `autoFocus?`, `textareaRef?`, `listLabel`, `redrobHint` |
| Catch-up | `apps/docs/src/renderer/versions/CatchUp.tsx` | `since: string` (ISO), `items: CatchUpItem[]`, `onShow(item)`, `onDismiss` |
| Version history | `apps/docs/src/renderer/versions/VersionHistory.tsx` | `open`, `onClose`, `path: string \| null`, `fileName`, `api: { listVersions, nameVersion, restoreVersion }` |
| Share | `apps/docs/src/renderer/share/ShareDialog.tsx` | `open`, `onClose`, `path: string \| null`, `fileName`, `api: ShareApi` |
| Presence cursors | `apps/docs/src/renderer/live/collab.ts` | A ProseMirror plugin, not a component. Carets are `.docs-peer-caret.docs-peer--{seat}` with a name label, and selections are `.docs-peer-sel`. The seat comes from `seatOf(accountId)`. |

Before the app-side parts can move, their strings need to become props. Their copy is English constants
next to each component today (`figT`, `MENTION_STRINGS`, `verT`, `SHARE_STRINGS`, `LIVE_STRINGS`).
