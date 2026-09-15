/** @type {import('tailwindcss').Config} */

/*
 * The Redrob brand primitives, transcribed from `src/styles/design-tokens-brand.css`.
 *
 * A literal and not a `var()`, because Tailwind v3 builds an opacity modifier by rewriting the
 * colour value, and it cannot rewrite a `var()` that resolves to a HEX string: `bg-gray-800/60` and
 * `ring-brand-500/40` would silently stop working. These steps are theme-independent by
 * construction, declared once and never re-pointed per theme, so a build-time literal is the same
 * value at every use. `src/design-tokens.test.ts` fails if either copy drifts from the other.
 *
 * Roles that DO change with the theme are bound below as `var()`, where there is no literal to
 * drift and an opacity modifier would be the wrong tool anyway: a screen that needs a lighter
 * border names `border-border-subtle`, not `border-border/40`.
 */
const rr = {
  blue: {
    1: "#eff4ff",
    2: "#d9e6ff",
    3: "#bad2ff",
    4: "#8aafff",
    5: "#507fff",
    6: "#2b52ff",
    7: "#1733d5",
    8: "#09209c",
    9: "#061460",
    10: "#030c34",
  },
  gray: {
    1: "#f8f9fb",
    2: "#eff1f4",
    3: "#dfe2e8",
    4: "#cbcfd7",
    5: "#aab0bb",
    6: "#7c8390",
    7: "#576071",
    8: "#292e37",
    9: "#141719",
  },
  black: "#0a0b0c",
  white: "#ffffff",
  /*
   * The raised panel on a dark theme. The brand scale has nothing between Gray 9 and Gray 8, so a
   * surface above the page would jump twelve steps of lightness at once; this is the 45/55 mix of
   * the two that Console uses for the same surface, resolved to a literal for the reason above.
   */
  grayPanel: "#1d2126",
};

export default {
  darkMode: "class",
  // Resolve from this config, not from whichever workspace/package happened
  // to invoke Tailwind. Without `relative`, @redrob/ui looked included here but
  // its classes (Select's `pl-8`, Radix data states, shared Button sizes) never
  // made it into the production CSS.
  content: {
    relative: true,
    files: [
      "./index.html",
      "./src/**/*.{js,ts,jsx,tsx}",
      "../../../packages/ui/src/**/*.{js,ts,jsx,tsx}",
      /*
       * Not the tests. `design-tokens.test.ts` writes class names in its prose to say
       * which ones are wrong, and the scanner cannot tell a warning from a call site:
       * `dark:bg-destructive-soft` appeared in the production stylesheet because a
       * comment named it. A test file ships in no build, so it contributes no class.
       */
      "!./src/**/*.test.{ts,tsx}",
      "!../../../packages/ui/src/**/*.test.{ts,tsx}",
    ],
  },
  theme: {
    /*
     * The whole palette, not an extension of Tailwind's.
     *
     * `extend.colors` used to hold the ramps and the roles, which left Tailwind's own eleven-step
     * hues sitting underneath them. `red`, `amber`, `emerald`, `sky`, `rose`, `violet` and `teal`
     * reached 355 call sites in this renderer, and `slate` through `fuchsia` were one keystroke away
     * from reaching more. Nothing names them now that the status roles have those call sites, and a
     * palette that still offers them is a palette that grows a second opinion about what danger is.
     *
     * So this is `colors` and not `extend.colors`, and the list below is the list: a hue that is not
     * written here does not compile. It is the one ratchet that cannot be forgotten, because it
     * fails at the utility rather than in a review.
     *
     * `blue`, `brand` and `gray` are this product's own ramps and stay. `black` is Redrob Black
     * rather than #000, and `white` is written out for the same reason: both are brand values.
     */
    colors: {
      inherit: "inherit",
      current: "currentColor",
      transparent: "transparent",
      white: rr.white,
      black: rr.black,
      /*
       * Blue, the source scale the Figma foundation draws with, and `brand` the semantic group
       * aliased onto it. That is the shape `src/styles/design-tokens.css` already describes, and
       * having both here is what makes the `dark:bg-blue-600` twins written beside a `bg-brand-600`
       * fill correct rather than a second, slightly different blue: there is one blue in this
       * product. New code should name `primary`, which also carries the theme.
       */
      blue: {
        50: rr.blue[1],
        100: rr.blue[2],
        200: rr.blue[3],
        300: rr.blue[4],
        400: rr.blue[5],
        500: rr.blue[6],
        600: rr.blue[7],
        700: rr.blue[8],
        800: rr.blue[9],
        900: rr.blue[10],
      },
      /*
       * The brand ramp, ten steps onto the brand's ten. `brand-500` is Redrob Blue.
       *
       * `.btn-primary` and the shared Button used to fill with `brand-600` rather than
       * `brand-500`, because white on the old brand-500 measured 3.68:1. Redrob Blue is 5.6:1
       * with white, so that step is no longer needed; the shared controls now name `bg-primary`,
       * which is Blue 6, and the remaining `brand-600` call sites are a shade darker than the
       * accent rather than wrong.
       */
      brand: {
        50: rr.blue[1],
        100: rr.blue[2],
        200: rr.blue[3],
        300: rr.blue[4],
        400: rr.blue[5],
        500: rr.blue[6],
        600: rr.blue[7],
        700: rr.blue[8],
        800: rr.blue[9],
        900: rr.blue[10],
      },
      /*
       * The neutral ramp, eleven steps onto the brand's nine plus Redrob Black.
       *
       * Lightest to darkest, one for one, until the dark end, where the three surfaces a dark
       * theme needs have to stay apart: `gray-900` is the page (Gray 9), `gray-800` the panel
       * above it, `gray-700` the hover on that panel (Gray 8), and `gray-950` the recessed layer
       * beneath the page (Redrob Black). Those are the same four roles Console's dark
       * `--background`, `--card`, `--accent-active` and `--background-secondary` carry.
       */
      gray: {
        50: rr.gray[1],
        100: rr.gray[2],
        200: rr.gray[3],
        300: rr.gray[4],
        400: rr.gray[5],
        500: rr.gray[6],
        600: rr.gray[7],
        700: rr.gray[8],
        800: rr.grayPanel,
        900: rr.gray[9],
        950: rr.black,
      },

      /*
       * The semantic layer, the same role names Console binds in its `@theme inline` block and
       * the same values, so `bg-card` is one colour across both products. Declared in
       * `src/styles/design-tokens-semantic.css` and re-pointed there per theme, which is why
       * every entry is a `var()` resolved at use rather than substituted here.
       *
       * No colour is decided in this block. A literal here would be a third layer.
       *
       * These replace the `positive` / `negative` / `warning` families that stood here before.
       * Those had no caller in the renderer or in `packages/ui`, and `warning` in particular now
       * names a role the semantic layer also names: two sets of aliases for one set of values is
       * the thing that rots, because a component picks whichever it saw last.
       */
      background: {
        DEFAULT: "var(--background)",
        secondary: "var(--background-secondary)",
      },
      foreground: "var(--foreground)",
      card: {
        DEFAULT: "var(--card)",
        foreground: "var(--card-foreground)",
      },
      popover: {
        DEFAULT: "var(--popover)",
        foreground: "var(--popover-foreground)",
      },
      muted: {
        DEFAULT: "var(--muted)",
        foreground: "var(--muted-foreground)",
      },
      subtle: { foreground: "var(--subtle-foreground)" },
      disabled: { foreground: "var(--disabled-foreground)" },
      primary: {
        DEFAULT: "var(--primary)",
        foreground: "var(--primary-foreground)",
        hover: "var(--primary-hover)",
        muted: "var(--primary-muted)",
        soft: "var(--primary-soft)",
        ink: "var(--primary-ink)",
      },
      secondary: {
        DEFAULT: "var(--secondary)",
        foreground: "var(--secondary-foreground)",
      },
      accent: {
        DEFAULT: "var(--accent)",
        foreground: "var(--accent-foreground)",
        active: "var(--accent-active)",
      },
      border: {
        DEFAULT: "var(--border)",
        subtle: "var(--border-subtle)",
        strong: "var(--border-strong)",
      },
      input: "var(--input)",
      ring: "var(--ring)",
      success: {
        DEFAULT: "var(--success)",
        foreground: "var(--success-foreground)",
        soft: "var(--success-soft)",
        muted: "var(--success-muted)",
        ink: "var(--success-ink)",
      },
      warning: {
        DEFAULT: "var(--warning)",
        foreground: "var(--warning-foreground)",
        soft: "var(--warning-soft)",
        muted: "var(--warning-muted)",
        ink: "var(--warning-ink)",
      },
      destructive: {
        DEFAULT: "var(--destructive)",
        foreground: "var(--destructive-foreground)",
        hover: "var(--destructive-hover)",
        soft: "var(--destructive-soft)",
        muted: "var(--destructive-muted)",
        ink: "var(--destructive-ink)",
      },
      overlay: "var(--overlay)",
      tooltip: {
        DEFAULT: "var(--tooltip)",
        foreground: "var(--tooltip-foreground)",
      },
      sidebar: {
        DEFAULT: "var(--sidebar)",
        foreground: "var(--sidebar-foreground)",
        primary: "var(--sidebar-primary)",
        "primary-foreground": "var(--sidebar-primary-foreground)",
        accent: "var(--sidebar-accent)",
        "accent-foreground": "var(--sidebar-accent-foreground)",
        border: "var(--sidebar-border)",
        ring: "var(--sidebar-ring)",
      },
      spectrum: {
        teal: "var(--spectrum-teal)",
        sky: "var(--spectrum-sky)",
        violet: "var(--spectrum-violet)",
        pink: "var(--spectrum-pink)",
        red: "var(--spectrum-red)",
        orange: "var(--spectrum-orange)",
        yellow: "var(--spectrum-yellow)",
        lime: "var(--spectrum-lime)",
        green: "var(--spectrum-green)",
        foreground: "var(--spectrum-foreground)",
      },
      code: {
        comment: "var(--code-comment)",
        string: "var(--code-string)",
        number: "var(--code-number)",
        keyword: "var(--code-keyword)",
        literal: "var(--code-literal)",
        property: "var(--code-property)",
        variable: "var(--code-variable)",
        operator: "var(--code-operator)",
        punctuation: "var(--code-punctuation)",
      },
    },
    extend: {
      /*
       * A bare `ring` used to be Tailwind's own blue at half opacity, which is 2.2:1 at best against
       * what surrounds it and under the 3:1 a focus indicator has to clear. It is Redrob Blue now, and
       * drawn at full opacity: 5.6:1 on the page.
       *
       * A literal rather than `var(--ring)`, and the one place in this file that is not a choice: the
       * ring plugin blends the default with `ringOpacity` and falls back to a blue of Tailwind's own
       * when it is handed a value it cannot blend. Anything that wants the ring to follow the theme
       * writes `ring-ring`, which does read the role.
       */
      ringColor: {
        DEFAULT: rr.blue[6],
      },
      ringOpacity: {
        DEFAULT: "1",
      },
      /*
       * The scale stays a scale; the product just uses one step of it.
       * `rounded` is the 8px corner everything wears (radius-300).
       */
      borderRadius: {
        sm: "var(--radius-100)",
        DEFAULT: "var(--radius-300)",
        md: "var(--radius-400)",
        lg: "var(--radius-500)",
        xl: "var(--radius-600)",
      },
      /*
       * Pretendard is the single Redrob product family and the only approved product typeface, and
       * this is the same stack Console names. `font-mono` is code only: editor surfaces, token
       * values, terminal output, diffs. `font-display` is a deliberate alias, because there is no
       * second display face; brand moments use the same family at a heavier weight.
       */
      fontFamily: {
        sans: "var(--font-sans)",
        display: "var(--font-display)",
        mono: "var(--font-mono)",
      },
      spacing: {
        18: "4.5rem",
      },
    },
  },
  plugins: [],
};
