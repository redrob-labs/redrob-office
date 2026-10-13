# Redrob Office — installer / uninstaller UX (in-app prototype)

This branch carries the UI-only Redrob Office extraction (the seven apps, the
vendored design system, the carried packages) **plus** a branded in-app
prototype of the Redrob Office **installer and uninstaller**. This document
describes the installer/uninstaller work specifically; for the wider UI-only
extraction see `UI-ONLY-NOTES.md`.

## What this is (and is not)

- **A design prototype**, rendered inside the shell renderer so the look,
  motion and copy can be reviewed before any packaging work.
- **Not the real installer.** The real installer is the NSIS (Windows) / DMG
  (macOS) config in `apps/shell/electron-builder.cjs` on the full desktop tree —
  it is deliberately NOT built on this UI-only branch. Every string, asset and
  screen in the prototype is mapped onto that config in
  `apps/shell/src/renderer/src/setup-experience/PORTING.md`.
- **No backend or infrastructure.** Pure React + strings + CSS, all local
  state. No packaging config, no telemetry, no file I/O.

## Where it lives

```
apps/shell/src/renderer/src/setup-experience/
```

- `README.md` — the developer entry point (file map, opt-in URL contract).
- `PORTING.md` — how each string / asset / screen maps onto electron-builder.
- Components: `SetupExperience`, `SplashReveal`, `InstallFlow`, `UninstallFlow`,
  `SetupWindow`, `OfficeMark`; helpers `useFakeProgress`, `setup-env`; data
  `setup-copy`, `license-excerpt`; styles `setup-experience.css`.

## How to see it (opt-in, side-effect-free)

The normal app boots to Home unchanged. The flows render only when the renderer
URL carries a query param:

| URL | shows |
|---|---|
| `?screen=setup` | the install wizard |
| `?screen=uninstall` | the uninstaller |
| `…&lang=ko` / `&lang=zh` | preview a locale (en / ko / zh) |
| `…&nosplash` | skip the splash |

`main.tsx` reads `pickSetupScreen()` and branches before first paint; with no
param it returns null and Home boots as normal — the shipped app is untouched.

## What the prototype shows

**App identity.** The browser-tab / taskbar icon and the in-app product mark use
the purpose-built **Redrob Office** product icon (not the generic Redrob group
symbol), per the brand rule that product icons are for dock/taskbar/tab/install
contexts. Favicon linked from `index.html`.

**Splash (two frames).** Frame 1: the full official Redrob logo uncovers once
along a 40° edge (a masked-gradient sweep, so a wide lockup is never clipped).
Frame 2: the Redrob Office icon settles in with "Redrob Office" as plain static
text. This is a **documented departure** from the design system's motion law
(which allows one logo animation per splash, no type animating in, no mark
swap) — made by explicit direction, recorded in `SplashReveal.tsx` and
`PORTING.md` so whoever ports it knows it bends the rules on purpose.

**Install flow.** Welcome → License → Choose location → Installing → Finish,
mirroring the real NSIS assisted-installer pages. The welcome screen is
feature-forward: the real Office capabilities (Runs offline, Redrob Auto,
Memory, Cross-check) as an honest one-line-each list, following the brand voice
(no superlatives, no refused words). Installing shows a single status line that
changes in place with dry-playful messages ("Unfolding the documents…", "Waking
the Hangul engine…").

**Uninstall flow.** Confirm → feedback → removing → goodbye, mirroring the NSIS
uninstaller. Warmer copy ("Sorry to see you go", "Hope to see you back soon"), a
quieter "Keep it" instead of "Cancel", and a row of reason chips. **The feedback
step is a MOCK** — reason + text are collected locally and discarded; there is no
transport on this branch, and a real survey would be a separate, privacy-reviewed
decision.

**Localisation.** Three locales: `en` (defines the key set), `zh`, `ko` (both
type-checked to match). Korean is written as a complete system in 해요체, not
translated English, per the brand's localisation rule.

**Theme + motion.** All colour via design-system tokens (readable light/dark);
every animation is off under `prefers-reduced-motion`.

## Commit shape

The installer/uninstaller work is the commits from the scaffold
(`feat(shell): scaffold branded Setup/Uninstall experience prototype`) onward:
the three flows, icons/favicon, the splash, feature-forward + playful copy and
Korean, the two-frame splash rebuild, single-line progress, the Office-mark
identity fixes, text normalisation, and a refactor sweep (shared `setup-env`,
`useFakeProgress`, `SetupWindow`) with refreshed docs. Each commit typechecks
and builds; the refactor commits changed no behaviour or rendered output.
