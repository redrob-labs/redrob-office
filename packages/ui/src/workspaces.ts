export type EngineId = "lookup" | "process" | "review";
export type ModuleScale = "bulk" | "triage" | "deep";

/**
 * The catalog is browsed by what you are doing, not by which department you
 * sit in. Industry lives on `domains` instead, where it is still searchable and
 * still decides the backend namespace.
 *
 * Axes: create artifacts, research the web, bring data in, analyze/score,
 * edit existing files, and run timed/background automations.
 */
export type ActionId =
  | "create"
  | "research"
  | "extract"
  | "analyze"
  | "edit"
  | "automate";

/**
 * What a task hands back. Only kinds the app can actually produce today —
 * xlsx generation still throws in @redrob/generate, and PDF is an export step
 * in the Documents tab rather than a task output.
 */
export type OutputId = "doc" | "slides" | "graphic" | "report" | "data" | "message";

/**
 * Backend workspace namespace. Persisted with saved rubrics and workflows and
 * validated as `/^[a-z]+$/` in the main process, so these strings are data, not
 * labels.
 */
export type DomainId =
  | "general"
  | "recruiting"
  | "product"
  | "finance"
  | "engineering"
  | "design"
  | "legal"
  | "sales"
  | "marketing";

/**
 * `general` is where work lands unless someone picks an industry. It owns no
 * templates — it is the namespace for skills that are not about any one
 * department, which is most of them. The rest are alphabetical: putting an
 * industry second in the list reads as the one this app is really for.
 */
export const DOMAINS: readonly DomainId[] = [
  "general",
  "design",
  "engineering",
  "finance",
  "legal",
  "marketing",
  "product",
  "recruiting",
  "sales",
] as const;

export const OUTPUTS: readonly OutputId[] = [
  "doc",
  "slides",
  "graphic",
  "report",
  "data",
  "message",
] as const;

/** One output format of an otherwise identical template (same slots, different file). */
export interface VariantFormat {
  id: string;
  registryId: string;
}

/**
 * A subject a template can be pointed at. Every variant of a template runs the
 * same panel; only the registry id and the copy change. This is what used to be
 * a separate catalog row per subject.
 */
export interface TemplateVariant {
  id: string;
  /** Registry template, rubric, or schema id the panel loads. */
  registryId: string;
  domain: DomainId;
  /** Chip label. */
  labelKey: string;
  /** Panel heading and blurb, when the panel takes them. */
  titleKey?: string;
  bodyKey?: string;
  formats?: readonly VariantFormat[];
}

export interface TemplateDef {
  id: string;
  label: string;
  action: ActionId;
  engine: EngineId;
  scale: ModuleScale;
  output: OutputId;
  /** Every domain this template can be pointed at; drives search and filtering. */
  domains: readonly DomainId[];
  registryIds: string[];
  /** Present when one panel covers several subjects. */
  variants?: readonly TemplateVariant[];
}

/** Top-level catalog section — one per action. */
export interface CategoryDef {
  id: ActionId;
  label: string;
  templates: TemplateDef[];
}

/** @deprecated Prefer TemplateDef */
export type ModuleDef = TemplateDef;
/** @deprecated Prefer CategoryDef */
export type WorkspaceDef = CategoryDef & { modules: TemplateDef[] };

function asWorkspace(category: CategoryDef): WorkspaceDef {
  return { ...category, modules: category.templates };
}

const MEMO_FORMATS: readonly VariantFormat[] = [
  { id: "markdown", registryId: "legal/memo" },
  { id: "docx", registryId: "legal/memo-docx" },
  { id: "hwpx", registryId: "legal/memo-hwpx" },
];

const DECK_FORMATS: readonly VariantFormat[] = [
  { id: "markdown", registryId: "marketing/deck-outline" },
  { id: "pptx", registryId: "marketing/deck-pptx" },
];

/**
 * Every subject that used to be its own "write a X" catalog row. They all run
 * SlotDraftPanel against a different registry template.
 */
const DRAFT_VARIANTS: readonly TemplateVariant[] = [
  {
    id: "memo",
    registryId: "legal/memo",
    domain: "legal",
    labelKey: "module.memo",
    titleKey: "legalMemo.title",
    bodyKey: "legalMemo.body",
    formats: MEMO_FORMATS,
  },
  {
    id: "clause",
    registryId: "legal/clause",
    domain: "legal",
    labelKey: "module.clause",
    titleKey: "legalClause.title",
    bodyKey: "legalClause.body",
  },
  {
    id: "spec",
    registryId: "product/screen-spec",
    domain: "product",
    labelKey: "module.spec",
    titleKey: "productSpec.title",
    bodyKey: "productSpec.body",
  },
  {
    id: "handoff",
    registryId: "product/handoff",
    domain: "product",
    labelKey: "module.handoff",
    titleKey: "productHandoff.title",
    bodyKey: "productHandoff.body",
  },
  {
    id: "triage",
    registryId: "engineering/triage-note",
    domain: "engineering",
    labelKey: "module.triage",
    titleKey: "engTriage.title",
    bodyKey: "engTriage.body",
  },
  {
    id: "access",
    registryId: "design/access-check",
    domain: "design",
    labelKey: "module.access",
    titleKey: "designAccess.title",
    bodyKey: "designAccess.body",
  },
  {
    id: "model",
    registryId: "finance/budget-model",
    domain: "finance",
    labelKey: "module.model",
    titleKey: "financeModel.title",
    bodyKey: "financeModel.body",
  },
  {
    id: "outreach",
    registryId: "sales/outreach",
    domain: "sales",
    labelKey: "module.outreach",
    titleKey: "salesOutreach.title",
    bodyKey: "salesOutreach.body",
  },
  {
    id: "discovery",
    registryId: "sales/discovery",
    domain: "sales",
    labelKey: "module.discovery",
    titleKey: "salesDiscovery.title",
    bodyKey: "salesDiscovery.body",
  },
  {
    id: "brief",
    registryId: "marketing/campaign-brief",
    domain: "marketing",
    labelKey: "module.brief",
    titleKey: "marketingBrief.title",
    bodyKey: "marketingBrief.body",
  },
  {
    id: "copy",
    registryId: "marketing/channel-copy",
    domain: "marketing",
    labelKey: "module.copy",
    titleKey: "marketingCopy.title",
    bodyKey: "marketingCopy.body",
  },
];

/** Everything that scores pasted text against a packaged rubric. */
const CHECK_VARIANTS: readonly TemplateVariant[] = [
  {
    id: "conform",
    registryId: "product/prd-completeness",
    domain: "product",
    labelKey: "module.conform",
    titleKey: "productConform.title",
    bodyKey: "productConform.body",
  },
  {
    id: "classify",
    registryId: "finance/chart-of-accounts",
    domain: "finance",
    labelKey: "module.classify",
    titleKey: "financeClassify.title",
    bodyKey: "financeClassify.body",
  },
  {
    id: "review",
    registryId: "engineering/nestjs-conventions",
    domain: "engineering",
    labelKey: "module.review",
    titleKey: "engReview.title",
    bodyKey: "engReview.body",
  },
  {
    id: "overflow",
    registryId: "design/i18n-overflow",
    domain: "design",
    labelKey: "module.overflow",
    titleKey: "designOverflow.title",
    bodyKey: "designOverflow.body",
  },
  {
    id: "tokens",
    registryId: "design/tokens",
    domain: "design",
    labelKey: "module.tokens",
    titleKey: "designTokens.title",
    bodyKey: "designTokens.body",
  },
  {
    id: "contract",
    registryId: "legal/contract-review",
    domain: "legal",
    labelKey: "module.contract",
    titleKey: "legalContract.title",
    bodyKey: "legalContract.body",
  },
  {
    id: "qualify",
    registryId: "sales/lead-qualify",
    domain: "sales",
    labelKey: "module.qualify",
    titleKey: "salesQualify.title",
    bodyKey: "salesQualify.body",
  },
];

/** Folder intake, one variant per packaged extraction schema. */
const INTAKE_VARIANTS: readonly TemplateVariant[] = [
  {
    id: "resume",
    registryId: "recruiting/resume",
    domain: "recruiting",
    labelKey: "variant.resume",
  },
  {
    id: "certificate",
    registryId: "recruiting/degree-certificate.in",
    domain: "recruiting",
    labelKey: "variant.certificate",
  },
  {
    id: "receipt",
    registryId: "finance/receipt",
    domain: "finance",
    labelKey: "variant.receipt",
  },
  {
    id: "taxInvoice",
    registryId: "finance/tax-invoice.kr",
    domain: "finance",
    labelKey: "variant.taxInvoice",
  },
];

const GRAPHIC_VARIANTS: readonly TemplateVariant[] = [
  {
    id: "diagram",
    registryId: "design/diagram",
    domain: "design",
    labelKey: "module.diagram",
    titleKey: "designDiagram.title",
    bodyKey: "designDiagram.body",
  },
  {
    id: "svgAsset",
    registryId: "design/svg-asset",
    domain: "design",
    labelKey: "module.svgAsset",
    titleKey: "designSvgAsset.title",
    bodyKey: "designSvgAsset.body",
  },
];

function variantDomains(variants: readonly TemplateVariant[]): readonly DomainId[] {
  return [...new Set(variants.map((variant) => variant.domain))];
}

function variantRegistryIds(variants: readonly TemplateVariant[]): string[] {
  return variants.flatMap((variant) =>
    variant.formats ? variant.formats.map((format) => format.registryId) : [variant.registryId],
  );
}

export const CATEGORIES: readonly CategoryDef[] = [
  {
    id: "create",
    label: "Create",
    templates: [
      {
        id: "draft",
        label: "Draft",
        action: "create",
        engine: "process",
        scale: "deep",
        output: "doc",
        domains: variantDomains(DRAFT_VARIANTS),
        registryIds: variantRegistryIds(DRAFT_VARIANTS),
        variants: DRAFT_VARIANTS,
      },
      {
        id: "deck",
        label: "Deck",
        action: "create",
        engine: "process",
        scale: "deep",
        output: "slides",
        domains: ["marketing"],
        registryIds: ["marketing/deck-outline", "marketing/deck-pptx"],
        variants: [
          {
            id: "deck",
            registryId: "marketing/deck-outline",
            domain: "marketing",
            labelKey: "module.deck",
            titleKey: "marketingDeck.title",
            bodyKey: "marketingDeck.body",
            formats: DECK_FORMATS,
          },
        ],
      },
      {
        id: "graphic",
        label: "Graphic",
        action: "create",
        engine: "process",
        scale: "deep",
        output: "graphic",
        domains: ["design"],
        registryIds: variantRegistryIds(GRAPHIC_VARIANTS),
        variants: GRAPHIC_VARIANTS,
      },
      {
        id: "jd",
        label: "JD",
        action: "create",
        engine: "process",
        scale: "deep",
        output: "doc",
        domains: ["recruiting"],
        registryIds: ["recruiting/jd"],
      },
      {
        id: "email",
        label: "Email",
        action: "create",
        engine: "process",
        scale: "deep",
        output: "message",
        domains: ["recruiting"],
        registryIds: ["recruiting/decision-email"],
      },
      {
        id: "publish",
        label: "Publish",
        action: "create",
        engine: "process",
        scale: "deep",
        output: "report",
        domains: ["recruiting"],
        registryIds: ["recruiting/candidate-report"],
      },
      {
        id: "rubric",
        label: "Rubric",
        action: "create",
        engine: "process",
        scale: "deep",
        output: "data",
        domains: ["recruiting"],
        registryIds: [],
      },
    ],
  },
  {
    id: "research",
    label: "Research",
    templates: [
      {
        id: "research",
        label: "Research",
        action: "research",
        engine: "lookup",
        scale: "deep",
        output: "report",
        domains: ["product", "sales", "marketing", "recruiting", "engineering"],
        registryIds: [],
      },
    ],
  },
  {
    id: "extract",
    label: "Transform",
    templates: [
      {
        id: "intake",
        label: "Intake",
        action: "extract",
        engine: "lookup",
        scale: "bulk",
        output: "data",
        domains: variantDomains(INTAKE_VARIANTS),
        registryIds: variantRegistryIds(INTAKE_VARIANTS),
        variants: INTAKE_VARIANTS,
      },
      {
        id: "transcribe",
        label: "Transcribe",
        action: "extract",
        engine: "lookup",
        scale: "bulk",
        output: "doc",
        domains: ["recruiting"],
        registryIds: ["recruiting/interview-comment"],
      },
    ],
  },
  {
    id: "analyze",
    label: "Analyze",
    templates: [
      {
        id: "checklist",
        label: "Checklist",
        action: "analyze",
        engine: "review",
        scale: "triage",
        output: "report",
        domains: variantDomains(CHECK_VARIANTS),
        registryIds: variantRegistryIds(CHECK_VARIANTS),
        variants: CHECK_VARIANTS,
      },
      {
        id: "screen",
        label: "Screen",
        action: "analyze",
        engine: "process",
        scale: "triage",
        output: "report",
        domains: ["recruiting"],
        registryIds: ["recruiting/candidate-6axis"],
      },
      {
        id: "assess",
        label: "Assess",
        action: "analyze",
        engine: "process",
        scale: "deep",
        output: "report",
        domains: ["recruiting"],
        registryIds: ["recruiting/candidate-6axis"],
      },
      {
        id: "verify",
        label: "Verify",
        action: "analyze",
        engine: "review",
        scale: "deep",
        output: "report",
        domains: ["recruiting"],
        registryIds: ["recruiting/degree-certificate.in"],
      },
    ],
  },
  {
    id: "edit",
    label: "Edit",
    templates: [
      {
        id: "documentEdit",
        label: "Document edit",
        action: "edit",
        engine: "process",
        scale: "deep",
        output: "doc",
        domains: ["legal"],
        registryIds: [],
      },
    ],
  },
  {
    id: "automate",
    label: "Automate",
    templates: [
      {
        id: "daylog",
        label: "Day log",
        action: "automate",
        engine: "lookup",
        scale: "deep",
        output: "report",
        domains: ["product"],
        registryIds: [],
      },
    ],
  },
] as const;

/** Flat catalog entry — the action category doubles as the section header. */
export type CatalogItem = {
  categoryId: ActionId;
  category: CategoryDef;
  template: TemplateDef;
};

export function listCatalogItems(): readonly CatalogItem[] {
  return CATEGORIES.flatMap((category) =>
    category.templates.map((template) => ({
      categoryId: category.id,
      category,
      template,
    })),
  );
}

export function findCatalogItem(
  categoryId: string,
  templateId: string,
): CatalogItem | undefined {
  const category = CATEGORIES.find((item) => item.id === categoryId);
  const template = category?.templates.find((item) => item.id === templateId);
  if (!category || !template) return undefined;
  return { categoryId: category.id, category, template };
}

/**
 * Resolve a saved workflow step's `action` to a catalog entry. Step actions are
 * persisted data and still use the pre-collapse task names, so a step can land
 * either on a template or on one of its variants.
 */
export function findTemplateForAction(
  action: string,
): { category: CategoryDef; template: TemplateDef; variantId?: string } | undefined {
  for (const category of CATEGORIES) {
    for (const template of category.templates) {
      if (template.id === action) return { category, template };
      const variant = template.variants?.find((item) => item.id === action);
      if (variant) return { category, template, variantId: variant.id };
    }
  }
  return undefined;
}

/** The domain a panel reports to the backend as `workspaceId`. */
export function templateDomain(template: TemplateDef, variantId?: string): DomainId {
  if (template.variants && variantId) {
    const variant = template.variants.find((item) => item.id === variantId);
    if (variant) return variant.domain;
  }
  return template.variants?.[0]?.domain ?? template.domains[0] ?? "general";
}

/** Back-compat for callers still expecting WORKSPACES / modules. */
export const WORKSPACES: readonly WorkspaceDef[] = CATEGORIES.map(asWorkspace);
