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
- `--font-chrome`, `--fs-body-lg`, `--fs-small`, `--fs-caption`, `--transition-fast`.

Each could become a kit semantic token (for example a control border, a pressed fill or tinted
status backgrounds). Once that happens, the extension token should be renamed at its use sites and
deleted here.

## Residual CSS

The Docs, Sheets and Slides stylesheets still hold rules for markup the kit components replaced.
Their ribbons kept their legacy class names, restyled in CSS, because descendant selectors made a
rename risky. Some of the older panel rules no longer match anything. Pruning them needs the visual
suite to confirm that each removed rule was dead.
