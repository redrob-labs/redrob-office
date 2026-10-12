# Porting the Setup / Uninstall prototype onto the real installer

This folder is a **design prototype** of the Redrob Office installer and
uninstaller, rendered in-app so the look and wording can be approved before any
packaging work. It touches **no backend or infrastructure code**.

The real installer lives in the full desktop tree, not on this UI-only branch:

```
office-src/apps/shell/electron-builder.cjs
```

That config produces an **NSIS assisted installer** on Windows
(`nsis.oneClick=false`, `allowToChangeInstallationDirectory=true`) and a
**drag-to-Applications DMG** on macOS. Linux ships deb/rpm/AppImage with no
custom installer UI.

Once the copy and visuals here are approved, porting is mechanical: lift each
string from `setup-copy.ts` into its mapped destination below. Nothing in this
prototype is thrown away blindly — every value already carries the name of the
field it feeds.

---

## 1. Product facts (already pinned, do not change)

`setup-copy.ts -> PRODUCT` is copied verbatim from `electron-builder.cjs`:

| prototype `PRODUCT.*` | real config field |
|---|---|
| `displayName` = "Redrob Office" | `config.productName` |
| `appId` = "com.redrob.app" | `config.appId` |
| `binaryName` = "redrob" | `config.executableName` |
| `windowsInstallerName` | `config.nsis.artifactName` (`Redrob-Setup-${version}.exe`) |
| `macInstallerName` | `config.mac.artifactName` (`Redrob-${version}-${arch}.dmg`) |

## 2. Windows — NSIS pages

NSIS exposes installer UI through electron-builder's `nsis` block plus an
optional custom `include` script (`.nsh`) and a `installerSidebar` /
`installerHeader` image. Map:

| prototype copy key | NSIS destination |
|---|---|
| `welcome.title` / `welcome.body` | `MUI_WELCOMEPAGE_TITLE` / `MUI_WELCOMEPAGE_TEXT` via a custom `include` .nsh, or `nsis.oneClick=false` welcome page |
| `license.*` | `nsis.license` (point at packaged `LICENSE`); `MUI_PAGE_LICENSE` button text via `.nsh` |
| `license-excerpt.ts` | REPLACE with the packaged full `LICENSE` file — the prototype only shows the opening |
| `location.title` / `location.body` / `location.label` | `MUI_PAGE_DIRECTORY` page strings (`.nsh` `MUI_DIRECTORYPAGE_TEXT_TOP` / `MUI_DIRECTORYPAGE_TEXT_DESTINATION`) |
| `location.defaultHintWin` | informational only; real path is `$INSTDIR` / `$PROGRAMFILES64\Redrob Office` |
| `progress.title` | NSIS install page title (`.nsh`); `progress.steps` are cosmetic in the prototype — NSIS shows real `DetailPrint` lines |
| `finish.title` / `finish.body` | `MUI_FINISHPAGE_TITLE` / `MUI_FINISHPAGE_TEXT` (`.nsh`) |
| `finish.runApp` | `MUI_FINISHPAGE_RUN_TEXT` (the "run app" checkbox label) |

Branding images (the lockup shown in `BrandBar`): become
`nsis.installerSidebar` (164x314 BMP) and `nsis.installerHeader` (150x57 BMP),
generated from the same `assets/splash/redrob-logo-primary*.png` used here.

## 3. Windows — NSIS uninstaller

| prototype copy key | NSIS destination |
|---|---|
| `uninstall.confirmTitle` | `MUI_UNCONFIRMPAGE` title + Add/Remove Programs `DisplayName` (`Redrob Office`) |
| `uninstall.confirmBody` / `keepDataNote` | `MUI_UNCONFIRMPAGE_TEXT_TOP` (`.nsh`) |
| `uninstall.removingTitle` | uninstall progress page title |
| `uninstall.doneTitle` / `doneBody` | `MUI_UNFINISHPAGE` strings |

## 4. macOS — DMG

The DMG has no multi-page wizard; it is a styled drag-to-Applications window.

| prototype element | DMG destination |
|---|---|
| `welcome.*` wording + lockup | `config.dmg.background` image + window title (`config.dmg.title`) |
| `license.*` | `config.dmg.` + a packaged license agreement shown by `hdiutil` (SLA) |
| install "action" | there is no installer step on macOS — the user drags the app; the prototype's progress/finish pages have no DMG analogue |
| uninstall | macOS uninstall = drag to Trash; the prototype's uninstaller maps to Windows/Linux only. Keep it for Windows; it is informational on macOS |

## 5. The feedback step (MOCK)

`uninstall.feedback*` and the `Textarea` in `UninstallFlow.tsx` are a **mock**:
the real NSIS/DMG uninstaller has **no network transport**, and all transport
is stubbed on this branch. If a goodbye survey is ever wanted for real, it is a
*separate* decision requiring a backend endpoint and a privacy review — it is
**not** part of porting this prototype. When porting, either drop the step or
replace `dropFeedback()` with a real, reviewed transport. Do not silently wire
telemetry into the installer.

## 6. What does NOT port

- `main.tsx` opt-in branch and `?screen=` routing — prototype-only; the real
  installer is a separate binary, not a renderer route.
- `setup-experience.css` window chrome — the real installer draws native OS
  chrome; only the brand images and copy carry over.
- The fake progress timers — NSIS/DMG report real progress.
