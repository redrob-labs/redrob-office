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

## 2. App icon, favicon and the splash

The browser-tab/taskbar identity now uses the **Redrob Office product icon**,
not the generic Redrob group symbol (brand rule, `10-logo.md`: product icons
are for dock/taskbar/tab/install-prompt). All icon artwork is the authoritative
design-system files, copied verbatim.

| prototype asset | real installer destination |
|---|---|
| `assets/redrob-office-favicon.svg` (via `index.html` `<link rel="icon">`) | the app window icon is set from the packaged icon, not a favicon; this is the in-app/dev-tab equivalent only |
| `assets/splash/redrob-office-icon-1024.png` | the reliable raster used by the shared **OfficeMark** (splash frame 2 + both header brand bars). Also `config.win.icon` (`.ico`), the source for `config.mac.icon` (`.icns`), and `config.nsis.installerIcon` / `uninstallerIcon` |
| `assets/redrob-office-icon.svg` / `-dark` / `-16` / `-32` | the vector icons; NOTE the masked-gradient SVG renders faint at small sizes via `<img>`, so the prototype UI uses the raster above. On the real build these vectors are rasterised into the `.ico`/`.icns` sets |
| `assets/redrob-office-icon-small.svg` | the tab-bar product icon inside the running app (`TabBar.tsx`) — ships as-is, not an installer field |

**OfficeMark (`OfficeMark.tsx`).** The single Office identity — the Office icon
raster + "Redrob Office" as plain text — reused by splash frame 2 AND both
flows' header brand bar, so nothing shows the Redrob group logo or the baked
lockup image. On porting, the installer's branding image is generated from the
same icon + wordmark (see §3).

**Splash (`SplashReveal.tsx` + `setup-experience.css` `.setup-splash*`).** The
real splash is a window the Electron main process shows before the renderer is
ready; it is NOT part of the NSIS/DMG installer. It ports onto the desktop app's
own splash (`office-src/apps/shell` main-process splash / `BrowserWindow`), built
as a Lottie or Android animated-vector per `40-surfaces-and-motion.md`. Two
frames (Felix's spec):

- **Frame 1** — the FULL official Redrob logo (`redrob-logo-primary.png` /
  `-white`, 1080×216 symbol + "Redrob" wordmark) uncovers once along a 40° edge.
  The uncover is a **masked linear-gradient sweep at 130°** (not a clip-path):
  a mask only controls alpha, so the wide lockup is never geometrically clipped
  — fixing the earlier cut-off.
- **Frame 2** — the Redrob Office ICON (the `redrob-office-icon-1024.png`
  raster, via OfficeMark) settles in, with "Redrob Office" beside it as PLAIN
  STATIC TEXT (not animated, not a baked image).

**DOCUMENTED DEPARTURE:** animating the Office mark and swapping the Redrob logo
for it bends the motion law (one logo animation per splash; type never animates
in; the lockup never swaps for another mark). This is intentional, by Felix's
direction. The "Redrob Office" text is kept STATIC to stay as close to the law
as the brief allows. When porting, reproduce the two frames but know the real
splash may be held to the strict law instead — ask before shipping. The Redrob
lockup shows at 200px wide, the Office icon at 64px.

**Progress / removing lines.** On both the install progress step and the
uninstall removing step the status is a SINGLE line that changes in place (not a
stacked checklist), swapping through `progress.steps[]` / `removingSteps[]` as
the bar advances. These lines are cosmetic flavour; see §3/§4 for how (and
whether) they port to NSIS `DetailPrint`.

## 3. Windows — NSIS pages

NSIS exposes installer UI through electron-builder's `nsis` block plus an
optional custom `include` script (`.nsh`) and a `installerSidebar` /
`installerHeader` image. Map:

| prototype copy key | NSIS destination |
|---|---|
| `welcome.title` / `welcome.body` | `MUI_WELCOMEPAGE_TITLE` / `MUI_WELCOMEPAGE_TEXT` via a custom `include` .nsh, or `nsis.oneClick=false` welcome page |
| `welcome.features[]` | the four Office capabilities — on NSIS, render as `MUI_WELCOMEPAGE_TEXT` body lines or a custom welcome-page bitmap; on the DMG, bake into the background image. Keep the in-Office names ("Redrob Auto", "Cross-check"), never "Expert Match" |
| `welcome.cta` | welcome-page Next button (`.nsh`) |
| `license.*` | `nsis.license` (point at packaged `LICENSE`); `MUI_PAGE_LICENSE` button text via `.nsh` |
| `license-excerpt.ts` | REPLACE with the packaged full `LICENSE` file — the prototype only shows the opening |
| `location.title` / `location.body` / `location.label` | `MUI_PAGE_DIRECTORY` page strings (`.nsh` `MUI_DIRECTORYPAGE_TEXT_TOP` / `MUI_DIRECTORYPAGE_TEXT_DESTINATION`) |
| `location.defaultHintWin` | informational only; real path is `$INSTDIR` / `$PROGRAMFILES64\Redrob Office` |
| `progress.title` | NSIS install page title (`.nsh`) |
| `progress.steps[]` | the playful "Reticulating splines" lines — cosmetic in the prototype. NSIS shows real `DetailPrint` output, so these port as `DetailPrint` strings only if you want them; otherwise they are prototype flavour and are dropped |
| `finish.title` / `finish.body` | `MUI_FINISHPAGE_TITLE` / `MUI_FINISHPAGE_TEXT` (`.nsh`) |
| `finish.runApp` | `MUI_FINISHPAGE_RUN_TEXT` (the "run app" checkbox label) |

Branding images (the Office lockup shown in `BrandBar`): become
`nsis.installerSidebar` (164x314 BMP) and `nsis.installerHeader` (150x57 BMP),
generated from `assets/splash/redrob-office-lockup*.png`.

## 3. Windows — NSIS uninstaller

| prototype copy key | NSIS destination |
|---|---|
| `uninstall.confirmTitle` | `MUI_UNCONFIRMPAGE` title + Add/Remove Programs `DisplayName` (`Redrob Office`) |
| `uninstall.confirmBody` / `keepDataNote` | `MUI_UNCONFIRMPAGE_TEXT_TOP` (`.nsh`) |
| `uninstall.cancel` ("Keep it") / `uninstall.confirm` | uninstaller confirm/cancel button text (`.nsh`) |
| `uninstall.removingTitle` | uninstall progress page title |
| `uninstall.removingSteps[]` | playful removing lines — cosmetic; port as `DetailPrint` only if wanted, else drop |
| `uninstall.doneTitle` / `doneBody` | `MUI_UNFINISHPAGE` strings |
| `uninstall.feedback*` + `feedbackReasons[]` | MOCK — see §6, does not port without a backend + privacy review |

## 4. macOS — DMG

The DMG has no multi-page wizard; it is a styled drag-to-Applications window.

| prototype element | DMG destination |
|---|---|
| `welcome.*` wording + lockup | `config.dmg.background` image + window title (`config.dmg.title`) |
| `license.*` | `config.dmg.` + a packaged license agreement shown by `hdiutil` (SLA) |
| install "action" | there is no installer step on macOS — the user drags the app; the prototype's progress/finish pages have no DMG analogue |
| uninstall | macOS uninstall = drag to Trash; the prototype's uninstaller maps to Windows/Linux only. Keep it for Windows; it is informational on macOS |

## 5. The feedback step (MOCK)

`uninstall.feedback*`, `uninstall.feedbackReasons[]`, and the reason chips +
`Textarea` in `UninstallFlow.tsx` are a **mock**: the real NSIS/DMG uninstaller
has **no network transport**, and all transport is stubbed on this branch. The
selected reason and text are read locally and discarded (`dropFeedback()`). If a
goodbye survey is ever wanted for real, it is a *separate* decision requiring a
backend endpoint and a privacy review — it is **not** part of porting this
prototype. When porting, either drop the step or replace `dropFeedback()` with a
real, reviewed transport. Do not silently wire telemetry into the installer.

## 6. Locales

`setup-copy.ts` ships three locales: `en` (defines the key set), `zh`, and `ko`
(both type-checked to match `en` exactly via the `Copy` interface). Korean is
written as a complete system in 해요체, not translated English, per the brand's
localisation rule. When porting:

- NSIS: one language block per locale (`!insertmacro MUI_LANGUAGE`), strings
  pulled from the matching `copy[lang]`.
- DMG: a background image + SLA per language.
- The `?lang=` query override is prototype-only (preview any locale without
  changing the stored setting) and does not port.

## 6. What does NOT port

- `main.tsx` opt-in branch and `?screen=` routing — prototype-only; the real
  installer is a separate binary, not a renderer route.
- `setup-experience.css` window chrome — the real installer draws native OS
  chrome; only the brand images and copy carry over.
- The fake progress timers — NSIS/DMG report real progress.
