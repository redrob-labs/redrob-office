# redrob-ui

한국어: [README.ko.md](./README.ko.md)

The **Redrob Group Design System 2026**, as typed React components: 133 components and 260 icons,
written in TypeScript, styled with plain CSS on design tokens.

`@redrob-labs/ui`

## Install

```bash
yarn add @redrob-labs/ui
# or
npm install @redrob-labs/ui
```

Published to the public npm registry. No authentication, no `.npmrc` entry, nothing to configure —
the previous release went to GitHub Packages, which required every consumer to hold a token just to
install a public package.

`react` and `react-dom` are peer dependencies (`^18.2.0 || ^19.0.0`). Your project provides them.

## Use

Import the stylesheets once, at your application's entry point. There is no Tailwind config, no
PostCSS step and no build plugin: the system is plain CSS on custom properties.

```javascript
import '@redrob-labs/ui/tokens.css';
import '@redrob-labs/ui/styles.css';
import '@redrob-labs/ui/preflight.css'; // only when the system owns the whole page — see below
```

```jsx
import { Button, Hero, Display } from '@redrob-labs/ui';

function Landing() {
  return (
    <Hero
      lede="Every claim on this page says what it is measured over."
      action={<Button tone="primary">Read the method</Button>}
      secondary="See the data"
      secondaryHref="/data"
    >
      <Display>Hiring decisions you can check.</Display>
    </Hero>
  );
}
```

`src/index.ts` is the single entry point. Every export is listed there, grouped by system group,
with its prop types.

The 18 font faces ship in `dist/fonts/` and `system.css` references them relatively, so they
resolve wherever the package is served from.

### The page background is yours, not the library's

Neither `system.css` nor the design system's own bundle declares a rule for `html` or `body`. That is
deliberate: a library that paints the page takes a decision away from the application embedding it,
and an app with its own shell would have to undo it.

The cost is a trap. Set `data-theme="dark"` and the components go dark while the page behind them
stays browser-default white. Either import `preflight.css`, or set it yourself:

```css
html, body { background: var(--surface-base); color: var(--ink-primary); }
[data-theme='dark'] { color-scheme: dark; }
```

`preflight.css` also carries `color-scheme`, which is the only way the scrollbar and native
`<select>` popups follow the theme, plus the Korean font stack under `:lang(ko)` and a
`prefers-reduced-motion` block. Import it on a product surface; skip it for a widget mounted inside
somebody else's page.

## Using this outside React

The React components are one of three layers, and only the top one needs React. A Redrob product
that cannot run React can still be the same product visually.

| layer | what it is | who it is for |
| --- | --- | --- |
| `@redrob-labs/ui` | 133 typed components | Next and Electron renderers: the sites, console, chat, Office |
| `tokens.css` + `styles.css` + `fonts/` | 149 class blocks, 1,239 selectors, no React | Vue, Solid, Chromium WebUI, plain HTML |
| `tokens.json` + `native/*` | 332 tokens resolved to literals | C++ window chrome, Android, iOS |

### CSS only — Vue, Solid, Chromium WebUI, plain HTML

Take the two stylesheets and the fonts. The class names are the contract; no JavaScript is involved.

```javascript
import '@redrob-labs/ui/tokens.css';
import '@redrob-labs/ui/styles.css';
```

```html
<button class="rr-btn rr-btn--primary rr-btn--md"><span>Go</span></button>
```

Every rendering in the generated documentation shows the exact markup a component produces, so the
class combination for any component can be read off the docs rather than guessed.

### Native — a surface that cannot evaluate CSS

`var(--surface-base)` is a CSS feature. The browser's window chrome is painted in C++ and an Android
app in Kotlin; neither can read it. So the `var()` chains are resolved here, per theme, and handed
over as literals:

```
@redrob-labs/ui/tokens.json        332 tokens, both themes, with the chain each one resolved through
@redrob-labs/ui/native/redrob_tokens.h    89 colours × 2 themes, 0xAARRGGBB for SkColor
@redrob-labs/ui/native/RedrobTokens.kt    the same, as Kotlin Longs
```

```cpp
#include "redrob_tokens.h"

// Pick by the active theme, not by a build flag: the browser can be dark while the OS is light.
SkColor page = dark_mode ? redrob::tokens::dark::kSurfaceBase   // 0xFF0A0B0C
                         : redrob::tokens::light::kSurfaceBase; // 0xFFFFFFFF
```

Alpha is carried, not dropped — two tokens in the set are genuinely translucent, and treating them as
opaque paints a block where the design has a veil.

`yarn tokens` regenerates all three from `tokens.css`, and `tokens:check` fails CI when the committed
`tokens.json` has fallen behind. Written by hand in two languages, the numbers drift on the first
colour change and the drift is invisible until someone photographs a window beside a web page.

### What this does not cover

React Native renders to native views, not to `div` and CSS classes, so neither the components nor the
stylesheets apply there — only the token layer does. A mobile app inside a WebView or as a PWA uses
all three layers unchanged.

Of the 332 tokens, 29 are CSS `font` shorthands that still contain a `var()` — every text style is
`600 21px/28px var(--font-sans)`, and only a whole-value alias can be followed further. They are
flagged `containsVar` in `tokens.json`. No colour is among them, so the native headers are unaffected.

**Hindi has no font wired, and that gap is the delivery's, reproduced faithfully.** The design
system's typography spec names `--font-sans-hi` and prescribes a full Hindi type scale — `hi-display-1`
at 72/94, a 13px size floor, weight 600 instead of italic — but the delivery's own `tokens.css`
declares none of it, and neither does ours: 0 Hindi tokens on both sides, byte-identical apart from our
`@font-face` path fix. `NotoSansDevanagari-Variable.woff2` and `Newsreader-Display.woff2` ship in
`dist/fonts/` with no `@font-face` rule referencing them, in the delivery too. Wiring them means
choosing leading values, and the spec says its own numbers are unreviewed by a Hindi reader — so it is
a decision to take deliberately, not a line to add quietly.

## Both module formats

The package ships CommonJS and ESM, selected through the `exports` map. This is not a formality:

```
importing Button alone, minified, react external
  dist/index.js      (CommonJS)   405,590 bytes
  dist/esm/index.js  (ESM)          1,143 bytes
```

A CommonJS module's exports are decided at runtime, so a bundler must keep every component the barrel
file names. `yarn exports:check` loads both halves in separate Node processes and compares their
export lists, because a bundler papers over a broken ESM specifier and Node does not.

## The parity harness

This library is a transcription of the design system's own reference bundle, so "does it look
right" is not the standard. The gate is exact markup equality:

```bash
yarn test        # every component vs the reference bundle
yarn test:self   # the reference vs itself, to prove the harness still compares anything
```

`node tools/parity/run.js [Names]` renders each component twice — once from the delivery's
reference bundle, once from our built `dist` — against the delivery's **own** `preview.html` case,
and compares the normalised markup. The cases are the delivery's, not ours, so they cannot drift
toward the implementation they are meant to check.

`reference/` holds a vendored 2 MB slice of the 141 MB delivery: `bundle.js`, its stylesheet, the
prop contract, and all 148 preview cases. It is committed so the gate runs in CI. Point
`REDROB_DS_DIR` at a full delivery to refresh it or to try a newer one.

Two things this harness has caught that review would not:

- A circle whose inline style emitted `width;height` where the reference emits `height;width`.
  Invisible on screen, and a real difference in the DOM.
- `tsc` used to write output **even when it reported errors**, so a component with a real type error
  still rendered and parity passed on the broken build. Closed two ways: `noEmitOnError` is on, and
  `yarn build` deletes `dist/` first so a failed build cannot leave a stale-but-valid tree. **Parity
  green with a red build is still not a pass** — read the build's exit code separately.

## Develop

Node.js 20.x. Yarn 1.x (`yarn.lock` is v1 and CI installs with `--frozen-lockfile`).

```bash
git clone https://github.com/redrob-labs/redrob-ui.git
cd redrob-ui
yarn install
yarn build && yarn test
```

| Command | What it does |
|---|---|
| `yarn build` | `tsc` to `dist/`, then copies `src/styles/*.css` and `src/fonts/*.woff2`. |
| `yarn test` | Parity against the reference bundle. The gate. |
| `yarn test:self` | Renders the reference against itself. Proves the harness works. |
| `yarn icons` | Regenerates `src/icons/index.tsx` from the delivery's icon table. |
| `yarn icons:check` | Fails if the checked-in icon module is out of date. |
| `yarn docs` | Builds `site/` and regenerates `llms.txt` and `llms-full.txt`. |
| `yarn docs:check` | Fails if the committed agent reference no longer matches the code. |

## Documentation

Two surfaces, generated by one pass over the same sources, so they cannot disagree.

**For people:** [the component reference](https://redrob-labs.github.io/redrob-ui) — a page per
component with the component actually rendered, its prop table and its import line. The rendering on
each page is the delivery's own preview case run against this package's build, which is the same
rendering the parity gate compares to the reference bundle. A demo here is therefore not a separate
example that could be wrong on its own.

**For agents:** [`llms.txt`](https://redrob-labs.github.io/redrob-ui/llms.txt) is the index, and
[`llms-full.txt`](https://redrob-labs.github.io/redrob-ui/llms-full.txt) is every component's
description and full prop list in one fetch. Both are committed at the repository root as well, so
an agent reading the source finds the same reference as one reading the site.

The site deploys from `main`, which is the released state — `publish.yml` refuses a tag that is not an
ancestor of `main`. So the version the site names is the version you can install, and the site does not
move until a promotion. Documentation describing an unreleased tree is worse than documentation that
lags, because a reader cannot tell which one they have.

Nothing in either surface is typed by hand. Grouping and order come from `src/index.ts`, descriptions
from the JSDoc above each export, props from each `<Name>Props` interface read with the TypeScript
AST, and the renderings from `dist/`. A docs page cannot claim a prop the type does not declare.
`yarn docs:check` runs in CI because a stale committed `llms.txt` is what an agent would read, and
nothing else in the pipeline would notice it had gone wrong.

`src/icons/index.tsx` is **generated**. Edit the generator, not the file — a hand-edit is
overwritten by the next `yarn icons` without warning, which is why CI checks it.

Components are written with `React.createElement` rather than JSX. That is deliberate: the port
transcribes the reference's `h()` calls, and the gate compares markup exactly, so keeping the call
shape identical makes a difference in the output easy to find.

There is no Storybook. The delivery's 148 `preview.html` cases are the gallery, and the parity
harness already renders every component against all of them — hand-written stories would be a
third copy of the same cases, free to drift from both.

## Contributing

[CONTRIBUTING.md](./CONTRIBUTING.md) — branch names, the pull request path, and how a release
is cut. Branching follows the organization's
[gitflow standard](https://github.com/mckinley-and-rice/.github/blob/main/docs/GITFLOW.md):
`develop` is the default branch, `main` is the released state.

## Support

- Bugs and feature requests: [issues](https://github.com/redrob-labs/redrob-ui/issues).
- Security vulnerabilities: never in an issue. See the organization's
  [security policy](https://github.com/redrob-labs/.github/blob/main/SECURITY.md).

## License

MIT. See [LICENSE](./LICENSE).
