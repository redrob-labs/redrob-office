# setup-experience — in-app installer / uninstaller prototype

A **design prototype** of the Redrob Office installer and uninstaller, rendered
inside the shell renderer so the look, motion and copy can be reviewed before
any packaging work. It touches **no backend or infrastructure** — pure React +
strings + CSS, all local state.

> The real installer is the NSIS/DMG config in
> `office-src/apps/shell/electron-builder.cjs`, **not** on this UI-only branch.
> `PORTING.md` maps every string, asset and screen here onto that config.

## How to see it

It is **opt-in and side-effect-free**: the normal app boots to Home unchanged.
The flows render only when the renderer URL carries a query param:

| URL | shows |
|---|---|
| `?screen=setup` | the install wizard |
| `?screen=uninstall` | the uninstaller |
| `…&lang=ko` / `&lang=zh` | preview a locale (en / ko / zh) without changing the stored setting |
| `…&nosplash` | skip the splash and jump straight to the flow |

`main.tsx` reads `pickSetupScreen()` and branches before first paint; with no
param, `pickSetupScreen()` returns null and Home boots as normal.

## Files

| File | What |
|---|---|
| `SetupExperience.tsx` | opt-in host: plays the splash once, then the chosen flow. Exports `pickSetupScreen()`. |
| `SplashReveal.tsx` | two-frame brand reveal — full Redrob logo (40° uncover) → Office mark + "Redrob Office" text. See its header for the documented motion-law departure. |
| `InstallFlow.tsx` | welcome → license → location → installing → finish. |
| `UninstallFlow.tsx` | confirm → feedback (mock) → removing → done. |
| `SetupWindow.tsx` | shared chrome: card, Office brand bar, body, footer slot. |
| `OfficeMark.tsx` | the shared Office identity (icon raster + "Redrob Office" text), used by the splash and the brand bar. |
| `useFakeProgress.ts` | the cosmetic 0→100 bar for the installing / removing steps. |
| `setup-env.ts` | shared `prefersReducedMotion()` / `isDark()` reads. |
| `setup-copy.ts` | SINGLE SOURCE OF TRUTH for every string, keyed to the real installer field. en defines the keys; zh + ko are type-checked to match. |
| `license-excerpt.ts` | the opening of the LICENSE shown on the license page (the real page shows the packaged full file). |
| `setup-experience.css` | window chrome + splash styles, all design-system tokens (light/dark + reduced-motion safe). |
| `PORTING.md` | how each string / asset / screen maps onto `electron-builder.cjs`. |

## Rules this module keeps

- **No backend/infra.** No packaging config, no telemetry, no file I/O. The
  uninstall feedback is a mock (collected locally, discarded).
- **One Office identity.** The splash frame 2 and both brand bars render the
  same `OfficeMark` — never the Redrob group logo, never just "Office".
- **Theme + motion.** All colour via tokens (readable light/dark); every
  animation is off under `prefers-reduced-motion`.
