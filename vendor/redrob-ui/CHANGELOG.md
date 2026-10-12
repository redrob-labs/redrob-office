# Changelog

## 1.5.0

Brings the library to the Redrob Group Design System 2026 delivery that renames the **Cowork** product (formerly **Desk**) and recolours the band and spectrum grounds. Nothing is removed from the public surface, and every repository-ahead correction is kept.

### Changed
- **Desk → Cowork.** The product is renamed everywhere it was `Desk`/`desk`: the fifteen `ScreenDesk*` reference screens are now `ScreenCowork*`; `Band`'s product ground, the `AppShell` product key and the `--product-*` / `.rr-band--p-*` token namespace move from `desk` to `cowork`; and the product's name in default copy (`ComposerMode`, `CrossCheckSetting`, `Disputed`, the `COMPOSER_MODES` hints) now reads "Cowork". `BandProduct` is `'chat' | 'cowork' | 'browser' | 'console' | 'office' | 'design' | 'code'`.
- **Band and spectrum grounds recoloured** to the new delivery: `--spec-1..7` and every `.rr-band--p-*` ground take the delivery's new values, and the social seam note moves to 3px. The deep-ground screenshot contrast note is updated.
- `Toast`: the `danger` tone is now announced assertively (`role="alert"`, `aria-live="assertive"`), as `Alert` is — a failure the person needs now is worth interrupting for. Every other tone stays polite.
- Reference bundle, stylesheet, type declarations and all 164 component preview cases refreshed from the new delivery; `src/icons/index.tsx` regenerated from it (252 glyphs).

### Kept
- The accessibility corrections already carried ahead of the delivery (`--ink-muted` #686e78, dark `--surface-sunken` #1c1f26), the Insights group and its tokens, the 136 `--product-*` declarations `references.js` requires, the Hindi/Devanagari font stack and `:lang(hi)` italic guard, and the ModelGuide 1.4.0 work this change stacks on.
- `router` is dropped as a product key, matching the new delivery; the six unreleased products (`mail`, `books`, `jobs`, `skill-tests`, `passport`, `craft`) the delivery previews are intentionally **not** added to the public API in this release.

### Fixed
- `PrivacyProtection` and `PRIVACY_LEVELS`: the defaults no longer say where the privacy check runs. Strict's detail ended "Nothing can be sent from the web or a phone, where the check cannot run", and that is false in a product whose web app does run the check. It now reads "High, plus addresses, amounts and dates." The other defaults have changed too: `running` is "Running" (was "Running on this laptop"), `offTitle` is "Privacy protection is off" (was "... off here") and `offText` is "What you send goes to the AI as written." (was a sentence about the laptop and the desktop app). Consumers that pass these props render exactly as before. A product that knows where its check runs should say so through `running`, `offText` or `levels`. The reference delivery bundle has been updated to carry the same neutral defaults, so `PrivacyProtection` and `ComposerStatus` stay at parity.
- `ScheduleRow`: in a narrow column the name and cadence were squeezed to a few characters a line beside the last run and the switch. Below 480px of its own width (a container query, with a 480px viewport query as the fallback), the body takes the full row and the last run and switch wrap under it. This is CSS only. The markup is unchanged, and so is parity.
- Generated ids are now stable across server and client rendering. Components that minted an id at mount (`AgentAction`, `Chart`, `Composer`, `ConsentBar`, `Diagram`, `Drawer`, `FileUpload`, `Form`, `LangSwitch`, `Modal`, `ModelPicker`, `NewsSection`, `PostList`, `SiteHeader`, `ThemeSwitch`) now derive it with `React.useId`, so server-rendered markup matches the first client render and React no longer warns about a hydration mismatch. `yarn ids:check` guards that no component mints a non-deterministic id. Markup and parity are unchanged.
- `BarList`: a group whose amounts are all under one (shares, rates) scaled every bar to a hidden maximum of 1, so a 0.4 drew at 40% of the track regardless of the other groups. It now scales to the largest amount present, like every other case, so the widest bar fills the track. A list whose amounts already exceed one is unchanged. `yarn insights:check` covers both.

## 1.4.0

### Added
- `ModelGuide`: `summary="glance"`, a comparison strip in place of each row's effort meter.
  - Quality, reliability, speed and value (the cost score), each as five steps against the best pick shown for the task (95%, 85%, 70%, 50% of it, and below), under one set of column heads that line up with every row.
  - "Tied with #1" on a pick whose total is within the 95% intervals of #1's. "Best value" on the most quality per dollar among picks with at least 80% of the best quality.
  - A partly estimated ranking (`kind: 'estimate'`) is hatched, as `Chart` marks an estimate, and says so in the strip's accessible name. Each step's tooltip gives the figure and the best on the task.
  - With it, the effort is written out ("Thinking: High") in the detail and in a chain's steps instead of metered, because a maker's own scale says little beside another maker's.
  - Labels for translation: `glanceLabels`, `tiedLabel`, `bestValueLabel`, `thinkingLabel`.
- `ModelGuide`: `map`, in advanced mode a quality-against-price chart above the list.
  - Price is on a log scale because the picks on one task span up to 100x.
  - The picks nothing on the task beats on both are joined as the trade-off line.
  - Each dot is a keyboard-reachable control, named with rank, model, quality and price, that opens its pick.
  - Labels: `mapLabels`.
- `GuidePick.unavailable`: why a pick cannot be used from here. The use action is disabled and the reason shown beside it.
- `ModelGuide`: a sample `output` given as rendered markup (a consumer's markdown, say) gets `rr-guide__output--rich`, with its own headings, lists, tables and code blocks instead of pre-wrapped text. A plain-string output is unchanged.
- `ModelGuide`: a sample can carry a task card (`sample.card`: brief, what was given, what was asked, the limit, what makes it hard), a scorecard (`sample.scorecard`: a verdict per check, pass / partial / miss, with the passage of the answer that earned it) and run facts (`sample.run`). Such a sample reads card, scorecard, the answer folded under "Read the full answer", then the run; the exact prompt folds inside the card. The pick's row shows its score. Verdicts are said in words for screen readers, not only marked. Labels: `sampleLabels`.
- `GlanceLabels`, `GuideMapLabels`, `GuideTaskCard`, `GuideScorecard`, `GuideVerdict` and `GuideSampleLabels` types are exported.

All of these are optional and render no markup when absent, so parity with the reference is unchanged. `yarn guide:check` asserts each one and its absence.

## 1.3.1

### Fixed
- `Chart`: an axis with more points than room for a label each (thirty days on a half-width card) printed every label on top of its neighbours. It now prints every n-th label, counted back from the last point so the latest is always named, plus the hovered point. The figures table still lists every label, and a chart whose labels fit is unchanged. `yarn insights:check` covers both.

## 1.3.0

### Added
- Insights, a new group of ten analytics marks for AI-adoption views, moved in from the Crew prototype when Crew's screens moved into Console: `MixBar`, `MixColumns` and `MixKey` (an ordinal mix such as the six modes of AI use, as one bar, as columns over time, and its legend), `BulletBar` (a figure against its target and a comparison), `BarList` (groups on one scale, with a hatched, number-free row for a group under the privacy floor), `CompareBar` (one group against a wider one), `Histogram`, `HeatCell` (a compare-grid `td` shaded by distance from a baseline, unshaded within 3 points), `Delta` (a signed, direction-judged change) and `PrivacyFloor` (the lock and "Groups of 3 or more"). Plus `heatBand()` and the `MixStep`/`HeatBand` types. Every mark carries its figures as text as well, and every English default can be replaced for translation. None has a case in the reference delivery, so `yarn insights:check` (now in CI, beside `yarn shell:check`) asserts their behaviour.
- Tokens for them, light and dark: `--chart-track`, `--chart-good`, `--chart-bad`, the ordinal ramp `--ordinal-0..5` with `--ordinal-ink-0..5`, and `--heat-pos-1..3` / `--heat-neg-1..3`. On dark the ordinal ramp runs the other way, so the deepest step is still the strongest.
- `AppShell`: `onNavigate(href, event)`, called on a plain click of a nav link so an app with a client-side router (Next.js, React Router) can call `event.preventDefault()` and route itself instead of reloading the page. Clicks with a modifier key or another button stay with the browser, so opening a link in a new tab still works. Without it the links render exactly as before, with no handler.
- Console, the eighth product. `AppShell product="Console"` (or "Redrob Console") now sets `data-product="console"` instead of being dropped, and `Band product="console"` wears its grounds. Console is the Group's own product, so it takes Redrob Blue rather than an eighth hue: `--product-console-1..10` reference `--blue-1..10`, with the same wash/fill/line roles (steps 1/2/3 light, 10/9/8 dark) and `beyond` gradients as every other product. `tokens.json` and the native headers carry the 17 new tokens. The suite spectrum seam is unchanged: it already opens on the brand's own teal and blue.
- `AppShell`: `windowInset` (`top`, `end`, `endHeight`) keeps a frameless desktop window's own controls off the page - the macOS traffic lights above the sidebar brand, the Windows caption buttons at the top-right of the header (or the rail) - and `dragRegion` makes the brand row and header drag the window while their controls stay clickable. Both are off by default; a shell without them renders no new class or inline style.
- `AppShell`: `asideFolded`, what stays at the bottom of the sidebar when it is folded (or narrower than 900px) in place of `aside`, e.g. the account as an avatar-only menu button. Without it the folded shell renders as before.
- `ModelGuide`: `harnessLabel`, `rankLabel` and `effortUnit`, so the "on <harness>", "#1 for <task>" and "<level> effort" text can be translated. Without them the English defaults render as before.
- `ModelGuide`: an output select ("I need": documents, presentations, graphics...). It takes `outputs`, `output`, `defaultOutput`, `onOutputChange`, `deliverableLabel` and `anyOutputLabel`, and re-ranks each task from `picksByOutput[output][language]`.
  - It lists "Anything" plus only the outputs the current task is ranked for.
  - An output the task is not ranked for reads as "Anything".
  - A keyed output with no ranking for the working language falls back to the task's ranking.
  - The props are `deliverable*` because `outputLabel` already labels a pick's sample output.
- `ModelGuide`: benchmark picks (`GuidePick.benchmark`, `benchmarkLabel`, `benchmarkNote`). These show the same ranking on another product, for comparison.
  - The row is greyed and unranked, and takes no slot in the top `limit`.
  - It is never the pick opened by default.
  - Its detail has no use action or effort control.

The ModelGuide output and benchmark additions are optional and render no markup when absent, so parity with the reference is unchanged. `yarn guide:check` asserts both behaviours and their absence.

### Fixed
- `ModelGuide`: reflows on its own width instead of the window's (container queries, with the 900px media query kept as a fallback). In a product frame with a menu and a side panel open, the two-column grid used to stay side by side in a ~480px column, the selects ran past its edge and the effort label overlapped the ranking note. Below 880px the grid and selects stack; below 480px the pick's header puts the cost under the model name.
- `AppShell`: folded nav links show the design-system `Tooltip` (label and count) instead of a native `title`, placed against the window so the narrow sidebar cannot cut it off. The folded sidebar no longer scrolls sideways. `yarn shell:check` covers the folded state.
- Overlays are no longer cut off by the container they sit in. `Menu`, `ComposerStatus`, `ModelPicker`, `Select`, `Combobox`, `DatePicker`, `TimePicker`, `LangSwitch` and `Tooltip` now place their open overlay against the window (`position: fixed`), flip to the side with more room, slide back inside the edges and cap their height to the space they have. A `ComposerStatus` panel above a composer in the middle of an empty chat used to run off the top of its column. Closed components render the same markup as before; the placement is inline style added only while open. `yarn floating:check` covers the placement.
- `ModelGuide`: a pick with no sample run (no `task.prompt`, `sample.prompt` or `sample.output`) no longer shows empty "What it was asked" and "What it wrote" boxes.

## 1.2.0

### Added
- `ModelGuide`: a working-language select (`languages`, `language`, `defaultLanguage`, `onLanguageChange`) that switches each task to `picksByLanguage[language]`, falling back to `picks`.
- `ModelGuide`: picks that run models in sequence (`steps`, named "A → B", with each step's role and effort).
- `ModelGuide`: where each figure comes from (`kind`, `monthlyKind`: measured / published / derived / estimate), a monthly range (`monthlyRange`), tool tags with planned and missing tools (`tools`, `comingSoon`, `missingLabel`), caveats (`flags`) and a sources list (`sources`).
- Types `GuideKind`, `GuideStep`, `GuideSource`, `GuideTool`.

These go beyond the 4 October 2026 delivery, whose ModelGuide has none of them. Every one is optional and renders no markup when absent, so parity with the reference is unchanged; `yarn guide:check` (in CI) asserts their behaviour and that absence.

## 1.1.0

Brings the library to the Redrob Group Design System 2026 delivery of 4 October 2026. Nothing is removed.

### Added
- `ComposerMode`, `ProtectionStatus`, `CrossCheckSetting` (with `CrossCheckSetting.value`), `Opinion`, `ThreadNote`, `PlanQuestions`, `PlanDocument`, `FactCheckReport`, `ChallengeReport`, `AccessList`, `Meter`, `ScheduleRow`, and their prop types.
- `COMPOSER_MODES`, `CROSS_CHECKS`, `CROSS_CHECK_LEVELS`, `EffortLevel`, `EffortNoteContext`.

### Changed
- `Menu`: an icon-only trigger (`icon` without `label`, named by `ariaLabel`).
- `ModelPicker` and `ModelGuide`: effort levels a person can set on a pick (`effort`, `defaultEffort`).
- `LangSwitch`: closes on outside click and Escape; `placement="up"`, `align="left"`.
- `PostList`: `variant="section"` is the homepage news band.
- `PrivacyProtection` and `MemoryScope` head their panels with `ProtectionStatus`.
- `system.css` is the new delivery's stylesheet. `tokens.css` is unchanged.

### Deprecated (still exported in 1.x)
| Old | Use |
|---|---|
| `StatusCard` | `ProtectionStatus` (forwards to it) |
| `ScopeBadge` | `AccessList` (forwards to it) |
| `Schedule` | `ScheduleRow` |
| `SecondOpinionSetting` | `CrossCheckSetting` (now an adapter onto it: one value sets both checks, because its `rr-opset` styles are gone) |
| `CostMeter`, `MemoryMeter` | `Meter` |
| `Disputed`, `OpinionAdded` | `Opinion` |
| `ModelSwitch`, `MemorySaved` | `ThreadNote` |
| `NewsSection` | `PostList variant="section"` |
| `AvatarMark` | `Avatar` |

`yarn aliases:check` (in CI) asserts each one still exports and renders.

### Tooling
- `reference/` is the 4 October 2026 delivery. `.gitattributes` keeps it LF on Windows checkouts.
- Parity reports the 30 product screens that load a whole prototype app as not compared.
