// Redrob design system - component types.
// Documentation only: the bundle is a classic script that assigns window.Redrob.

import type { ReactNode, CSSProperties, ComponentType } from 'react';

type Tone = 'info' | 'success' | 'warning' | 'danger';
type BadgeTone = 'neutral' | 'brand' | Tone;
type Size = 'sm' | 'md' | 'lg';

interface Common {
  className?: string;
  style?: CSSProperties;
}

export interface ButtonProps extends Common {
  /** Visual weight. One `primary` per view. */
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger';
  size?: Size;
  disabled?: boolean;
  /** Disables the button and swaps the leading icon for a spinner. */
  loading?: boolean;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
  fullWidth?: boolean;
  type?: 'button' | 'submit' | 'reset';
  /** Fully rounded. One prominent action per view. */
  shape?: 'rounded' | 'pill';
  /** Soft brand halo around the one action a view is about. */
  emphasis?: boolean;
  onClick?: (event: MouseEvent) => void;
  children?: ReactNode;
}

export interface IconButtonProps extends Common {
  /** Required: becomes aria-label and the native tooltip. */
  label: string;
  variant?: 'ghost' | 'primary' | 'secondary';
  size?: Size;
  round?: boolean;
  disabled?: boolean;
  /** Native button type. Defaults to "button". */
  type?: 'button' | 'submit' | 'reset';
  onClick?: (event: MouseEvent) => void;
  /** The icon node. */
  children?: ReactNode;
}

interface FieldProps extends Common {
  label?: ReactNode;
  hint?: ReactNode;
  /** Sets aria-invalid and replaces the hint. */
  error?: ReactNode;
  invalid?: boolean;
  required?: boolean;
  id?: string;
  disabled?: boolean;
}

export interface InputProps extends FieldProps {
  size?: Size;
  type?: string;
  value?: string | number;
  defaultValue?: string | number;
  placeholder?: string;
  onChange?: (event: Event) => void;
}

export interface TextareaProps extends FieldProps {
  rows?: number;
  value?: string;
  defaultValue?: string;
  placeholder?: string;
  onChange?: (event: Event) => void;
}

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
  /** A second line under the label, in the open list only. */
  detail?: string;
}

export interface SelectProps extends FieldProps {
  options: Array<SelectOption | string>;
  /** Rendered as a disabled first option. */
  placeholder?: string;
  size?: Size;
  value?: string;
  defaultValue?: string;
  /** Called with a change-like event ({ target: { value, name } }) and the chosen option. */
  onChange?: (event: { target: { value: string; name?: string; id: string } }, option?: SelectOption) => void;
  /** Sent with a form through a hidden input. */
  name?: string;
  /** The platform's own select element and list. For long lists on a phone, or a form that must work without JavaScript. */
  native?: boolean;
}

export interface ChoiceProps extends Common {
  label?: ReactNode;
  hint?: ReactNode;
  checked?: boolean;
  defaultChecked?: boolean;
  disabled?: boolean;
  name?: string;
  value?: string;
  onChange?: (event: Event) => void;
}

export interface CheckboxProps extends ChoiceProps {
  /** Partial selection: shows a dash and sets the DOM indeterminate flag. */
  indeterminate?: boolean;
}

export type RadioProps = ChoiceProps;

export interface SwitchProps extends ChoiceProps {
  size?: 'sm' | 'md';
}

export interface BadgeProps extends Common {
  tone?: BadgeTone;
  variant?: 'subtle' | 'solid' | 'outline';
  size?: 'sm' | 'md';
  dot?: boolean;
  children?: ReactNode;
}

export interface AvatarProps extends Common {
  /** false renders the flat initials tile instead of the generated mark. */
  art?: boolean;
  /** Seed for the generated mark. Prefer an account id over the name. */
  seed?: string;
  /** Forces one accent family on the generated mark. Fixtures only. */
  family?: 'teal' | 'sky' | 'violet' | 'pink' | 'red' | 'orange' | 'yellow' | 'lime' | 'green';
  /** Alt text, initials source and accessible name. Pass it even with src. */
  name?: string;
  src?: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  shape?: 'circle' | 'square';
  status?: 'online' | 'busy' | 'away' | 'offline';
  /** Overrides the initials background. */
  color?: string;
}

export interface CardProps extends Common {
  /** Tick plus a Pretendard label in sentence case. An array is joined with a middle dot. */
  meta?: ReactNode | ReactNode[];
  /** Deprecated: renders as `meta`. This system has no all-caps eyebrow. */
  eyebrow?: ReactNode;
  /** feature: 24px with a square top-left notch. quiet: no box, a hairline instead. */
  variant?: 'default' | 'feature' | 'quiet';
  title?: ReactNode;
  description?: ReactNode;
  media?: ReactNode;
  footer?: ReactNode;
  /** Renders the card as a button. Do not nest other buttons inside. */
  interactive?: boolean;
  padding?: 'default' | 'tight';
  onClick?: (event: MouseEvent) => void;
  children?: ReactNode;
  /** Applies the quiet wash and grain. 'brand' uses the stronger wash. */
  wash?: boolean | 'brand';
}

export interface SectionMarkProps extends Common {
  label: ReactNode | ReactNode[];
  tone?: 'default' | 'muted';
  trailing?: ReactNode;
  /** Render as the section's real heading. */
  as?: 'heading';
  level?: number;
}

export interface AlertProps extends Common {
  tone?: Tone;
  title?: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children?: ReactNode;
}

export interface ToastProps extends Common {
  tone?: Tone;
  title: ReactNode;
  action?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children?: ReactNode;
}

export interface ModalProps extends Common {
  open?: boolean;
  title: ReactNode;
  footer?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  width?: string | number;
  children?: ReactNode;
}

export interface TooltipProps extends Common {
  content: ReactNode;
  placement?: 'top' | 'bottom' | 'left' | 'right';
  /** Forces the bubble visible. */
  open?: boolean;
  /** Set false when the child is already focusable. */
  focusable?: boolean;
  children?: ReactNode;
}

export interface TabItem {
  id: string;
  label: ReactNode;
  count?: number | string;
  disabled?: boolean;
}

export interface TabsProps extends Common {
  items: TabItem[];
  value?: string;
  onChange?: (id: string) => void;
  variant?: 'line' | 'pill';
  /** Accessible name of the tablist. */
  label?: string;
  children?: ReactNode;
}

export interface TableColumn<Row = Record<string, unknown>> {
  key: string;
  header: ReactNode;
  /** Right for quantities you would compare. Dates read better left. */
  align?: 'left' | 'right';
  width?: string | number;
  /** Every column hugs its content and ONE takes the surplus width. Default:
   * the first. Set this on the column that should hold the prose. */
  grow?: boolean;
  /** A hugging column does not wrap, because it sizes to its longest cell.
   * Set this on a second column that genuinely has to. */
  wrap?: boolean;
  /** Pin the currency symbol left and the figure right, so a column holding won,
   * rupees and dollars lines all three up. Give the cell as "<symbol> <figure>". */
  money?: boolean;
  /** The cell's own language. Korean keep-all is scoped to `:lang(ko)` and a data table
   * of mixed scripts has no page-level lang to inherit, so set it per column or per row. */
  lang?: string | ((row: Row) => string | undefined);
  render?: (row: Row) => ReactNode;
}

export interface TableProps<Row = Record<string, unknown>> extends Common {
  columns: Array<TableColumn<Row>>;
  rows: Row[];
  dense?: boolean;
  caption?: ReactNode;
}

export interface ProgressProps extends Common {
  value?: number;
  max?: number;
  label?: ReactNode;
  showValue?: boolean;
  tone?: 'brand' | 'success' | 'warning' | 'danger';
  size?: 'sm' | 'md';
  /** Unknown duration: drops the value attributes and animates. */
  indeterminate?: boolean;
  ariaLabel?: string;
}

export interface PaginationProps extends Common {
  page: number;
  pageCount: number;
  onChange?: (page: number) => void;
  label?: string;
  previousLabel?: string;
  nextLabel?: string;
}

export interface BreadcrumbItem {
  label: ReactNode;
  href?: string;
  onClick?: (event: MouseEvent) => void;
}

export interface BreadcrumbProps extends Common {
  items: BreadcrumbItem[];
  label?: string;
}

export interface MenuItem {
  id?: string;
  type?: 'separator';
  label?: ReactNode;
  icon?: ReactNode;
  shortcut?: string;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  onSelect?: (item: MenuItem) => void;
}

export interface MenuProps extends Common {
  /** Visible label. Omit it and pass `icon` for an icon-only trigger. */
  label?: ReactNode;
  /** An icon before the label, or the whole trigger when there is no label. */
  icon?: ReactNode;
  /** Accessible name. Required when the label is not a string or there is no label. */
  ariaLabel?: string;
  /** 'up' opens the list above the trigger, for a menu at the foot of a panel. Default 'down'. */
  placement?: 'down' | 'up';
  items: MenuItem[];
  onSelect?: (item: MenuItem) => void;
  align?: 'left' | 'right';
  variant?: 'primary' | 'secondary' | 'ghost';
  size?: Size;
  defaultOpen?: boolean;
}

export interface ComboboxOption {
  value: string;
  label: string;
  /** Second, quieter line on the option row. */
  description?: string;
  disabled?: boolean;
}

export interface ComboboxProps extends FieldProps {
  /** false when the options are already filtered (a server search); the list is shown as given. Default true. */
  filter?: boolean;
  options: Array<ComboboxOption | string>;
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string, option: ComboboxOption) => void;
  placeholder?: string;
  emptyText?: string;
  size?: Size;
  defaultOpen?: boolean;
}

export interface DatePickerProps extends FieldProps {
  /** ISO date, YYYY-MM-DD. */
  value?: string | null;
  defaultValue?: string | null;
  onChange?: (value: string | null, date: Date | null) => void;
  placeholder?: string;
  /** Overrides the trigger's date formatting. */
  format?: (date: Date) => string;
  size?: Size;
  todayLabel?: string;
  clearLabel?: string;
  calendarLabel?: string;
  /** BCP 47 locale for month names and week start. Defaults to the document's lang. */
  locale?: string;
  /** 0 Sunday to 6 Saturday. Defaults from the locale. */
  weekStart?: number;
  prevLabel?: string;
  nextLabel?: string;
  defaultOpen?: boolean;
}

export interface UploadedFile {
  name: string;
  size?: number;
}

export interface FileUploadProps extends Common {
  files?: UploadedFile[];
  onFiles?: (files: File[]) => void;
  onRemove?: (file: UploadedFile, index: number) => void;
  multiple?: boolean;
  /** Shown as text under the zone; also passed to the native input. */
  accept?: string;
  title?: ReactNode;
  hint?: ReactNode;
  maxLabel?: ReactNode;
  invalid?: boolean;
}

export interface SkeletonProps extends Common {
  variant?: 'text' | 'rect' | 'circle';
  /** text only: how many lines; the last is short. */
  lines?: number;
  width?: string | number;
  height?: string | number;
  /** circle only. */
  size?: number;
}

export interface EmptyStateProps extends Common {
  icon?: ReactNode;
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  compact?: boolean;
  wash?: boolean | 'brand';
}

export interface AccordionItem {
  id: string;
  title: ReactNode;
  meta?: ReactNode;
  content?: ReactNode;
  disabled?: boolean;
}

export interface AccordionProps extends Common {
  items: AccordionItem[];
  /** Allow several panels open at once. */
  multiple?: boolean;
  defaultOpen?: string | string[];
}

export interface StepperStep {
  id?: string;
  label: ReactNode;
  description?: ReactNode;
}

export interface StepperProps extends Common {
  steps: StepperStep[];
  /** Zero-based index of the current step. */
  current?: number;
  orientation?: 'horizontal' | 'vertical';
  label?: string;
}

export interface StatProps extends Common {
  label: ReactNode;
  value: ReactNode;
  /** Signed change; 0 renders neutral. */
  delta?: number;
  deltaSuffix?: string;
  /** Names what the delta is measured against. */
  period?: ReactNode;
  /** false where a fall is the good news. */
  upIsGood?: boolean;
  /** About a dozen points; drawn as a sparkline. */
  trend?: number[];
  wash?: boolean | 'brand';
}

export interface DrawerProps extends Common {
  open?: boolean;
  title: ReactNode;
  description?: ReactNode;
  side?: 'right' | 'left';
  width?: string | number;
  footer?: ReactNode;
  onClose?: () => void;
  closeLabel?: string;
  children?: ReactNode;
}

export interface MessageProps extends Common {
  role?: 'user' | 'assistant';
  author?: ReactNode;
  /** Overrides the initials in the avatar mark. */
  mark?: ReactNode;
  /** Citations, confidence, actions. */
  footer?: ReactNode;
  children?: ReactNode;
}

export interface StreamingProps extends Common {
  state?: 'thinking' | 'streaming' | 'done';
  /** What it is doing, shown in every state, beside the text it is producing. */
  label?: ReactNode;
  /** Always provide it: an uninterruptible model is the top complaint. */
  onStop?: () => void;
  stopLabel?: string;
  children?: ReactNode;
}

export interface CitationProps extends Common {
  index?: number;
  source?: ReactNode;
  title?: string;
  href?: string;
}

export interface AgentActionProps extends Common {
  name: string;
  summary?: ReactNode;
  state?: 'running' | 'done' | 'error';
  stateLabel?: string;
  duration?: string;
  defaultOpen?: boolean;
  /** The payload, already formatted and redacted. */
  children?: ReactNode;
}

export interface ConfidenceProps extends Common {
  level?: 'low' | 'medium' | 'high';
  label?: string;
  /** Why - the part that makes it actionable. */
  note?: ReactNode;
}

export interface ApprovalStepProps extends Common {
  title: ReactNode;
  description?: ReactNode;
  /** Exactly what will happen: recipients, template, timing. */
  detail?: ReactNode;
  onApprove?: () => void;
  onReject?: () => void;
  onAlways?: () => void;
  approveLabel?: string;
  rejectLabel?: string;
  alwaysLabel?: string;
}

export interface AgentStep {
  id?: string | number;
  label: ReactNode;
  state?: 'done' | 'active' | 'todo' | 'error';
  meta?: ReactNode;
  detail?: ReactNode;
  /** Nest a AgentAction or ApprovalStep under the step. */
  children?: ReactNode;
}

export interface AgentTimelineProps extends Common {
  steps: AgentStep[];
  label?: string;
}

export interface PromptSuggestionsProps extends Common {
  items: Array<string | { label: string; value?: string }>;
  onSelect?: (value: string, item: unknown) => void;
  label?: string;
}

/** Effort in the maker's own words and scale: Claude's Low to Max (5 steps),
 *  ChatGPT's Instant to Pro (5), Gemini's Low to High (3). */
export interface Effort {
  label: string;
  level: number;
  of: number;
}

/** One level a person can set on a pick: only the levels its app runs, on the maker's scale. */
export interface EffortLevel extends Effort {
  /** A month of the task at this level, in `currency` (USD) */
  monthly?: number;
  /** Its place on this task when the Router ranked it too; absent means not ranked */
  place?: number;
  /** The id of a pick in the same list that is this level, so choosing it selects that place */
  pick?: string;
}

/** What EffortTune says about the level chosen, for a custom `effortNote` */
export interface EffortNoteContext {
  level: EffortLevel; ranked: EffortLevel; custom: boolean; place?: number; times?: number | null; price: ReactNode; per: string;
}

/** One ranked combination: a model, how hard it thinks, and where it runs. */
export interface ModelPick {
  id: string;
  /** Full model name, e.g. "Claude Opus 5.5" */
  model: string;
  /** Shorter name for the composer trigger, e.g. "Opus 5.5" */
  short?: string;
  /** Where the model runs, e.g. "Redrob Cowork", "Claude Cowork", "ChatGPT Work" */
  harness: string;
  /** The effort it was ranked at */
  effort: Effort;
  /** Every level a person can set on it, the ranked one included. With two or more, a pinned pick shows the effort control. */
  efforts?: EffortLevel[];
  /** One plain sentence on why it ranks here, about the work */
  why?: string;
  /** Estimated monthly cost in `currency` (USD) */
  monthly?: number;
  /** ModelGuide: the four dimension scores (0 to 100) and the 95% interval half-width */
  score?: { quality: number; reliability: number; speed: number; cost: number; ci?: number };
  /** ModelGuide advanced: what was measured, per dimension, in words */
  measured?: Partial<Record<'quality' | 'reliability' | 'speed' | 'cost', string>>;
  /** ModelGuide advanced: [label, value] pairs (model ID, effort parameter, runs, tokens, prices, graders) */
  facts?: [string, string][];
  note?: string;
  /** What it wrote: an excerpt. `illustrative` until the leaderboard publishes real runs. */
  sample?: { output: ReactNode; more?: string; illustrative?: boolean };
  runHref?: string;
}

export interface ModelTask {
  id: string;
  label: string;
  /** Says whose ranking this is, e.g. "Top 5 for a lawyer drafting contracts" */
  title?: string;
  /** The month the prices assume, e.g. "Priced for about 12 contracts drafted a month." */
  usage?: string;
  /** Ranked, best first. At most two per model maker. */
  picks: ModelPick[];
  /** ModelGuide: the test prompt, shown as an excerpt */
  prompt?: ReactNode;
  weights?: { quality: number; reliability: number; speed: number; cost: number };
  formula?: string;
  basis?: string;
  /** Shown when the task has no ranking yet */
  emptyText?: string;
}

export interface ModelProfession {
  id: string;
  label: string;
  tasks?: ModelTask[];
  disabled?: boolean;
}

export interface ModelPickerProps extends Common {
  professions: ModelProfession[];
  defaultProfession?: string;
  defaultTask?: string;
  /** The pinned pick's id. With `auto`, null means Redrob Auto decides. */
  value?: string | null;
  defaultValue?: string | null;
  /** pick is null when the person goes back to Redrob Auto. taskMode is 'auto' or a task id. */
  onChange?: (pick: ModelPick | null, context: { profession: ModelProfession; task: ModelTask; taskMode?: string }) => void;
  /** Redrob Auto: "I want to" gains "Match each message", and with nothing pinned the
   *  highest place that runs `here` answers each message. Choosing a row pins it. */
  auto?: boolean;
  /** The harness this picker sits in, e.g. "Redrob Cowork". Picks that run anywhere else
   *  stay in the list at their true place, grayed out and not selectable. */
  here?: string;
  /** Controlled task: 'auto' (match each message) or a task id */
  task?: string;
  onTaskChange?: (task: string, profession: ModelProfession) => void;
  /** Under Auto, the task the last message was matched to, whose top five is shown */
  matchedTask?: string;
  autoLabel?: string;
  autoTaskLabel?: string;
  autoText?: string;
  autoTaskText?: string;
  autoPickLabel?: string;
  matchedLabel?: string;
  awayLabel?: string;
  awayNote?: string;
  backLabel?: string;
  /** Where the ranking comes from, e.g. { name: 'Redrob Leaderboard', edition: 'September 2026', note: 'Updated monthly' } */
  source?: { name: string; edition?: string; note?: string };
  /** Currency of `monthly`, default USD */
  currency?: string;
  /** Units of each currency per one `currency`, supplied with the ranking: { KRW: 1356.18, INR: 95.82 } */
  rates?: Record<string, number>;
  /** Page language, default the document's. It picks the currency shown (ko: KRW, hi: INR). */
  locale?: string;
  /** Override the language-to-currency map */
  currencyByLang?: Record<string, string>;
  basis?: ReactNode;
  basisLabel?: string;
  professionLabel?: string;
  taskLabel?: string;
  perLabel?: string;
  limit?: number;
  label?: string;
  defaultOpen?: boolean;
  placement?: 'top' | 'bottom';
  align?: 'start' | 'end';
  /** A link to the full ModelGuide at the foot of the panel */
  guideHref?: string;
  onOpenGuide?: (task: ModelTask, profession: ModelProfession) => void;
  guideLabel?: string;
  /** Effort set by the person on the pinned pick: a level number on its scale, null for the ranked one. Reset when the pick changes. */
  effort?: number | null;
  defaultEffort?: number | null;
  /** level is null when the person goes back to the ranked effort */
  onEffortChange?: (level: EffortLevel | null, pick: ModelPick) => void;
  effortLabel?: string; rankedLabel?: string; resetEffortLabel?: string; yoursLabel?: string;
  /** Replace the line under the control, e.g. for another language */
  effortNote?: (context: EffortNoteContext) => ReactNode;
}

export interface ModelGuideProps extends Common {
  professions: ModelProfession[];
  defaultProfession?: string;
  defaultTask?: string;
  /** Controlled profession and task: how a ModelPicker opens the guide on its own task */
  profession?: string;
  task?: string;
  onTaskChange?: (task: string, profession: string) => void;
  mode?: 'simple' | 'advanced';
  defaultMode?: 'simple' | 'advanced';
  onModeChange?: (mode: 'simple' | 'advanced') => void;
  /** "Use this in the chat" */
  /** effort is the level the reader tried on the pick, or null for the ranked one */
  onUse?: (pick: ModelPick, context: { profession: ModelProfession; task: ModelTask; effort: EffortLevel | null }) => void;
  source?: { name: string; edition?: string; note?: string };
  currency?: string;
  rates?: Record<string, number>;
  locale?: string;
  currencyByLang?: Record<string, string>;
  /** "Try another effort" in the detail; `effortHint` is the line beside it */
  effortLabel?: string; effortHint?: string; rankedLabel?: string; resetEffortLabel?: string;
  effortNote?: (context: EffortNoteContext) => ReactNode;
  /** How Redrob tests and ranks: opens by default in advanced mode */
  method?: ReactNode;
  /** Default weights when a task gives none */
  weights?: { quality: number; reliability: number; speed: number; cost: number };
  title?: string;
  lede?: string;
  limit?: number;
  topLabel?: string; useLabel?: string; runLabel?: string; promptLabel?: string; outputLabel?: string;
  illustrativeLabel?: string; calcLabel?: string; noteLabel?: string; perLabel?: string; methodLabel?: string;
  professionLabel?: string; taskLabel?: string; modeLabel?: string; simpleLabel?: string; advancedLabel?: string;
  emptyTitle?: string; emptyText?: string;
}

export interface ComposerProps extends Common {
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  /** Enter sends; Shift+Enter is a new line */
  onSubmit?: (value: string) => void;
  placeholder?: string;
  /** Chips above the text, e.g. the folder the agent is working in */
  context?: ReactNode;
  /** Left of the bar. Defaults to an Add files button; pass null for none. */
  leading?: ReactNode;
  onAdd?: () => void;
  /** Right of the bar, before Send: a ComposerMode (Plan or Run), then the ModelPicker */
  tools?: ReactNode;
  /** The agent is working: Send becomes Stop */
  busy?: boolean;
  onStop?: () => void;
  disabled?: boolean;
  maxRows?: number;
  /** A ComposerStatus under the field. Its panels open above the whole composer. */
  status?: ReactNode;
  label?: string;
  addLabel?: string;
  submitLabel?: string;
  stopLabel?: string;
}

export interface IconProps {
  width?: number | string;
  height?: number | string;
  className?: string;
}

export declare const Button: ComponentType<ButtonProps>;
export declare const IconButton: ComponentType<IconButtonProps>;
export declare const Input: ComponentType<InputProps>;
export declare const Textarea: ComponentType<TextareaProps>;
export declare const Select: ComponentType<SelectProps>;
export declare const Checkbox: ComponentType<CheckboxProps>;
export declare const Radio: ComponentType<RadioProps>;
export declare const Switch: ComponentType<SwitchProps>;
export declare const Badge: ComponentType<BadgeProps>;
export declare const Avatar: ComponentType<AvatarProps>;
export declare const Card: ComponentType<CardProps>;
export declare const SectionMark: ComponentType<SectionMarkProps>;
export declare const Alert: ComponentType<AlertProps>;
export declare const Toast: ComponentType<ToastProps>;
export declare const Modal: ComponentType<ModalProps>;
export declare const Tooltip: ComponentType<TooltipProps>;
export declare const Tabs: ComponentType<TabsProps>;
export declare const Table: ComponentType<TableProps>;
export declare const Progress: ComponentType<ProgressProps>;
export declare const Pagination: ComponentType<PaginationProps>;
export declare const Breadcrumb: ComponentType<BreadcrumbProps>;
export declare const Menu: ComponentType<MenuProps>;
export declare const Combobox: ComponentType<ComboboxProps>;
export declare const DatePicker: ComponentType<DatePickerProps>;
export declare const FileUpload: ComponentType<FileUploadProps>;
export declare const Skeleton: ComponentType<SkeletonProps>;
export declare const EmptyState: ComponentType<EmptyStateProps>;
export declare const Accordion: ComponentType<AccordionProps>;
export declare const Stepper: ComponentType<StepperProps>;
export declare const Stat: ComponentType<StatProps>;
export declare const Drawer: ComponentType<DrawerProps>;
export declare const Message: ComponentType<MessageProps>;
export declare const Streaming: ComponentType<StreamingProps>;
export declare const Citation: ComponentType<CitationProps>;
export declare const AgentAction: ComponentType<AgentActionProps>;
export declare const Confidence: ComponentType<ConfidenceProps>;
export declare const ApprovalStep: ComponentType<ApprovalStepProps>;
export declare const AgentTimeline: ComponentType<AgentTimelineProps>;
export declare const PromptSuggestions: ComponentType<PromptSuggestionsProps>;
export declare const Composer: ComponentType<ComposerProps>;
export declare const ModelPicker: ComponentType<ModelPickerProps>;
export interface StatusLevel { n: number; of: number; }
export interface ComposerStatusItem {
  id: string;
  icon?: ReactNode;
  /** 'safe' green, 'on' brand, 'warn' amber (a protection that is off here), 'plain' */
  tone?: 'safe' | 'on' | 'warn' | 'plain';
  /** "Privacy", "Memory", "Cross-check": hidden below 720px, where the icon carries it */
  name: ReactNode;
  /** "High", "On for every AI", "When it matters", "Off on the web" */
  value: ReactNode;
  level?: StatusLevel;
  /** Shows a running light, with this as its text: "Running on this laptop" */
  live?: string;
  panel?: ReactNode;
  panelLabel?: string;
  onClick?: () => void;
}
export interface ComposerStatusProps extends Common { items: ComposerStatusItem[]; label?: string; open?: string | null; defaultOpen?: string | null; onOpenChange?: (id: string | null) => void; }
export interface ProtectionStatusProps extends Common { title: ReactNode; icon?: ReactNode; tone?: 'safe' | 'warn' | 'brand' | 'plain'; size?: 'md' | 'lg'; live?: string; as?: string; children?: ReactNode; }
export interface PrivacyLevel { id: string; label: string; n: number; detail: string; }
export interface PrivacyProtectionProps extends Common {
  /** 'off' where the check cannot run: the web and phones */
  state?: 'on' | 'off';
  /** Set by an admin; the person reads it here and never changes it. Default 'high'. */
  level?: string;
  levels?: PrivacyLevel[];
  running?: string;
  summary?: ReactNode;
  lede?: ReactNode | false;
  showLevels?: boolean;
  /** false leaves out the status card, for a page that heads itself with a large one */
  card?: boolean;
  /** What happened to the last message, with a link to what the AI saw */
  last?: ReactNode;
  foot?: ReactNode;
  onLabel?: string; offTitle?: string; offText?: ReactNode;
}
export interface MemoryScopeOption { value: string; label: ReactNode; detail?: ReactNode; summary?: ReactNode; off?: boolean; }
export interface MemoryScopeProps extends Common { options: MemoryScopeOption[]; value?: string; defaultValue?: string; onChange?: (value: string, option: MemoryScopeOption) => void; summary?: ReactNode; lede?: ReactNode | false; foot?: ReactNode; label?: string; onTitle?: string; offTitle?: string; offText?: ReactNode; }
/** Plan or Run, in the composer bar beside the ModelPicker. */
export interface ComposerModeOption { value: 'plan' | 'run' | string; label: string; /** An icon name from `icons` */ icon?: string; hint?: string; }
export interface ComposerModeProps extends Common { value?: string; defaultValue?: string; onChange?: (value: string, option: ComposerModeOption) => void; options?: ComposerModeOption[]; /** Icons only, labels kept for screen readers. Automatic below 560px. */ compact?: boolean; label?: string; }
export type CrossCheckLevel = 'off' | 'auto' | 'always';
/** One level per check, keyed by check id. The default checks are `factCheck` and `challenge`. */
export type CrossCheckValue = Record<string, CrossCheckLevel | string>;
export interface CrossCheckDefinition { id: string; name: ReactNode; text: ReactNode; }
export interface CrossCheckSettingProps extends Common { value?: CrossCheckValue; defaultValue?: CrossCheckValue; onChange?: (value: CrossCheckValue, changed: string) => void; checks?: CrossCheckDefinition[]; levels?: Array<{ value: string; label: string }>; title?: ReactNode; lede?: ReactNode; /** What When it matters means, under the checks */ whenItMatters?: ReactNode; foot?: ReactNode; }
export interface PlanQuestion { id: string; question: ReactNode; options: ReactNode[]; /** Several answers allowed */ multi?: boolean; /** An option index, or indexes when multi */ defaultValue?: number | number[]; }
export interface PlanQuestionsProps extends Common { questions: PlanQuestion[]; value?: Record<string, number | number[] | null>; defaultValue?: Record<string, number | number[] | null>; onChange?: (value: Record<string, number | number[] | null>) => void; onSubmit?: (value: Record<string, number | number[] | null>) => void; /** Folds to one line once answered */ done?: boolean; summary?: ReactNode; submitLabel?: string; hint?: ReactNode; anyLabel?: string; label?: string; }
export type PlanItem = ReactNode | { id?: string; /** Bold words that open the item */ lead?: ReactNode; text: ReactNode; note?: ReactNode; editable?: boolean };
export interface PlanSection { id?: string; heading: ReactNode; body?: ReactNode; items?: PlanItem[]; ordered?: boolean; }
export interface PlanTodo { id?: string; label: ReactNode; /** The AI that will do it */ who?: ReactNode; done?: boolean; }
export interface PlanDocumentProps extends Common {
  /** The plan's file name: "Plan · Ending the Seorin MSA.md" */
  file?: ReactNode; title?: ReactNode; summary?: ReactNode; sections?: PlanSection[]; todo?: PlanTodo[];
  /** How many To do items are done; overrides each item's `done` */
  done?: number;
  /** draft and kept can be edited in place; running and done are locked. Draft shows as edited once changed. */
  status?: 'draft' | 'edited' | 'running' | 'done' | 'kept';
  statusLabels?: Partial<Record<'draft' | 'edited' | 'running' | 'done' | 'kept', ReactNode>>;
  /** Which checks will run after, and why */ note?: ReactNode;
  onRun?: () => void; onKeep?: () => void; onEdit?: (e: unknown) => void;
  runLabel?: string; keepLabel?: string; hint?: ReactNode; todoLabel?: string; label?: string;
}
export type FactVerdict = 'holds' | 'partly' | 'wrong' | 'closed' | 'fixed';
export interface FactClaim { id?: string; verdict: FactVerdict; claim: ReactNode; source?: ReactNode; passage?: ReactNode; quote?: string; note?: ReactNode; }
export interface FactCheckReportProps extends Common {
  /** The AI that ran the check */ by?: ReactNode; took?: ReactNode; summary?: ReactNode;
  claims?: FactClaim[]; reasoning?: FindingProps[]; missed?: Array<{ by?: string; label?: ReactNode; text: ReactNode }>;
  fixed?: boolean; onFix?: () => void; onClose?: () => void; defaultOpen?: string | null;
  verdicts?: Partial<Record<FactVerdict, [BadgeTone | string, ReactNode]>>;
  title?: ReactNode; label?: string; fixLabel?: string; fixHint?: ReactNode; claimLabel?: string; sourcesLabel?: string; reasoningLabel?: string; missedLabel?: string; missedItemLabel?: string; closeLabel?: string;
}
export interface ChallengeReportProps extends Common {
  /** The conclusion under challenge, in the answer's words */ claim?: ReactNode;
  sides?: { for?: ReactNode; against?: ReactNode; judge?: ReactNode };
  rounds?: Array<{ for: ReactNode; against: ReactNode }>;
  state?: 'running' | 'done'; /** Rounds shown so far while running */ shown?: number; of?: number; took?: ReactNode;
  verdict?: Array<{ kind: 'broke' | 'held' | 'changed' | string; text: ReactNode }>; unsettled?: ReactNode;
  applied?: boolean; onApply?: () => void; onRerun?: () => void; onClose?: () => void; onStop?: () => void;
  title?: ReactNode; label?: string; claimLabel?: string; forLabel?: string; againstLabel?: string; judgeLabel?: string; roundLabel?: string; verdictLabel?: string; unsettledLabel?: string; applyLabel?: string; appliedLabel?: string; rerunLabel?: string; runningLabel?: string; progressLabel?: string; kindLabels?: Record<string, string>;
}
export interface AnswerReceiptItem { id: string; icon?: ReactNode; tone?: 'plain' | 'agree' | 'differ'; label: ReactNode; sub?: ReactNode; detail?: ReactNode; /** Still working: shows a loader and the label */ busy?: boolean; }
export interface AnswerReceiptProps extends Common { items: Array<AnswerReceiptItem | null | false>; }
export interface PrivateTextProps extends Common { /** What the AI saw instead: "Person 1" */ as?: string; /** Left out altogether (ID and bank numbers) */ out?: boolean; outLabel?: string; children?: ReactNode; }
export interface DisputedProps extends Common { n?: number; views: Array<{ who: ReactNode; said: ReactNode }>; open?: boolean; defaultOpen?: boolean; onOpenChange?: (open: boolean) => void; onSettle?: () => void; settleLabel?: string; closeLabel?: string; title?: string; hint?: string; children?: ReactNode; }
export interface OpinionAddedProps extends Common { by?: string; label?: ReactNode; children?: ReactNode; }
export interface ModelSwitchProps extends Common { to: ReactNode; /** 'auto' (Redrob Auto switched) or 'you' */ by?: 'auto' | 'you'; reason?: string; note?: ReactNode; }
/** What Fact check found, inside an answer. `kind="differs"` (default) marks a sentence another AI reads
 * differently, opened in place, and takes the DisputedProps fields; `kind="added"` is what it thinks
 * the answer missed, set after the answer, and takes `by` and `label`. */
export interface OpinionProps extends Omit<DisputedProps, 'views'>, OpinionAddedProps { kind?: 'differs' | 'added'; views?: Array<{ who: ReactNode; said: ReactNode }>; }
/** A one-line note in the conversation. `kind="model"` (default) when a different AI takes over
 * (ModelSwitchProps); `kind="memory"` when something is saved, with Undo (MemorySavedProps). */
export interface ThreadNoteProps extends Omit<ModelSwitchProps, 'to'>, Omit<MemorySavedProps, 'children'> { kind?: 'model' | 'memory'; to?: ReactNode; children?: ReactNode; }
export interface MemorySavedProps extends Common { children: ReactNode; onUndo?: () => void; label?: ReactNode; note?: ReactNode; undoLabel?: string; }
export interface MemoryNote { id?: string; text: ReactNode; source?: ReactNode; readBy?: ReactNode; locked?: boolean; lockedLabel?: string; }
export interface MemoryListProps extends Common { items: MemoryNote[]; onEdit?: (note: MemoryNote, i: number) => void; onForget?: (note: MemoryNote, i: number) => void; readByLabel?: string; editLabel?: string; forgetLabel?: string; }
export type OpinionVerdict = 'wrote' | 'agree' | 'differ' | 'added' | 'quiet';
export interface OpinionGridProps extends Common {
  columns: Array<{ id: string; model: ReactNode; role?: ReactNode; wrote?: boolean }>;
  rows: Array<{ id: string; label: ReactNode; where?: ReactNode; cells: Record<string, [OpinionVerdict] | [OpinionVerdict, ReactNode]> }>;
  pointLabel?: string; caption?: string;
}
export declare const ComposerStatus: ComponentType<ComposerStatusProps>;
export declare const ProtectionStatus: ComponentType<ProtectionStatusProps>;
export declare const PrivacyProtection: ComponentType<PrivacyProtectionProps>;
export declare const MemoryScope: ComponentType<MemoryScopeProps>;
export declare const CrossCheckSetting: ComponentType<CrossCheckSettingProps> & { /** What the status line says for a value: the shared level, "On", "1 of 2 on" or "Off" */ value: (value?: CrossCheckValue) => string };
export declare const ComposerMode: ComponentType<ComposerModeProps>;
export declare const PlanQuestions: ComponentType<PlanQuestionsProps>;
export declare const PlanDocument: ComponentType<PlanDocumentProps>;
export declare const FactCheckReport: ComponentType<FactCheckReportProps>;
export declare const ChallengeReport: ComponentType<ChallengeReportProps>;
export declare const AnswerReceipt: ComponentType<AnswerReceiptProps>;
export declare const PrivateText: ComponentType<PrivateTextProps>;
export declare const Opinion: ComponentType<OpinionProps>;
export declare const ThreadNote: ComponentType<ThreadNoteProps>;
export declare const MemoryList: ComponentType<MemoryListProps>;
export declare const OpinionGrid: ComponentType<OpinionGridProps>;
export declare const ModelGuide: ComponentType<ModelGuideProps>;
export declare const Changes: ComponentType<ChangesProps>;
export declare const Meter: ComponentType<MeterProps>;
export declare const AccessList: ComponentType<AccessListProps>;
export declare const TaskStatus: ComponentType<TaskStatusProps>;
export declare const AgentRoster: ComponentType<AgentRosterProps>;
export declare const AgentHandoff: ComponentType<AgentHandoffProps>;
export declare const ScheduleRow: ComponentType<ScheduleRowProps>;
export declare const CheckIn: ComponentType<CheckInProps>;
export declare const Scroller: ComponentType<ScrollerProps>;
export declare const MarkReveal: ComponentType<MarkRevealProps>;
export declare const Loader: ComponentType<LoaderProps>;
export declare const Statement: ComponentType<StatementProps>;
export declare const Quote: ComponentType<QuoteProps>;

/** What an agent altered, in plain words, with the two buttons that decide if it
 * stays. Not a code diff: no line numbers, no plus and minus columns, no path. */
export interface ChangesProps {
  /** What was changed: a document, a page, a record. */
  title?: string;
  /** Overrides the derived "3 changes". */
  summary?: string;
  items?: Array<{
    /** Derived from which of before/after is present, if omitted. */
    kind?: 'changed' | 'added' | 'removed';
    /** Where in the thing: 'Opening line', 'Date on the cover'. */
    label?: string;
    before?: string;
    after?: string;
    /** Why, or where it came from. One line. */
    note?: string;
  }>;
  onAccept?: () => void;
  onReject?: () => void;
  acceptLabel?: string;
  rejectLabel?: string;
  className?: string;
}

/** What has been used against what there is. Pass `segments` for the working-memory bar
 * (shares of one whole, MemoryMeterProps); otherwise `used` against `budget` (CostMeterProps). */
export interface MeterProps extends CostMeterProps, MemoryMeterProps {}

/** Meter without segments: what this run has spent, against what it was given. */
export interface CostMeterProps {
  used?: number;
  budget?: number;
  /** Shown after the budget, in the reader's words: 'tasks', not 'tokens'. */
  unit?: string;
  /** What is being measured, as a person would say it: 'Spent today'. */
  label?: string;
  format?: (v: number) => string;
  /** Where it went. A single bar without this is half a component. */
  breakdown?: Array<{ label: string; value: number }>;
  /** false drops the "of 9.00" - for a meter already expressed as a share. */
  showBudget?: boolean;
  /** Derived at 75% and 90% if unset. */
  tone?: 'default' | 'warning' | 'danger';
  className?: string;
}

/** Everything this agent can reach. List refusals as well as grants. */
export interface AccessListProps {
  scopes?: Array<{
    /** The five things a person actually pictures. */
    kind?: 'files' | 'apps' | 'web' | 'computer' | 'memory';
    /** Name the thing, not the path: 'Your Contracts folder'. */
    label: string;
    /** Rendered as 'Can read', 'Can read and write', 'No access'. */
    mode?: 'read' | 'write' | 'none';
  }>;
  label?: string;
  className?: string;
}

/** One run's state, in a line. */
export interface TaskStatusProps {
  state?: 'queued' | 'running' | 'blocked' | 'done' | 'failed' | 'stopped';
  /** '' suppresses the word and leaves the dot; omitted uses the default wording. */
  label?: string;
  elapsed?: string;
  className?: string;
}

/** Several agents at once: what each is doing, said as a job rather than a
 * process name. No model names, no token counts. */
export interface AgentRosterProps {
  agents?: Array<{
    id?: string | number;
    /** What it is doing, in words: 'Checking the numbers'. */
    name: string;
    state?: TaskStatusProps['state'];
    /** The current sentence, not the plan. */
    step?: string;
    elapsed?: string;
    /** Anything else worth one short phrase. */
    note?: string;
  }>;
  /** Adds a Stop to every running or queued row. */
  onStop?: (agent: any) => void;
  label?: string;
  className?: string;
}

/** One piece of work moving from whatever finished it to whatever picked it up,
 * and what traveled with it. Reads top to bottom, like a relay. */
export interface AgentHandoffProps {
  /** What finished, named as a job: 'Market research'. */
  from?: string;
  fromNote?: string;
  /** Default 'Finished'. */
  fromWhen?: string;
  /** May be a person. That is the most important handoff in the product. */
  to?: string;
  toNote?: string;
  /** Default 'Working on it now'. */
  toWhen?: string;
  /** Default 'Passed on'. */
  passLabel?: string;
  /** What crossed. Carry the doubts, not only the findings. */
  carried?: string[];
  /** Default 'What came with it'. */
  carriedLabel?: string;
  className?: string;
}

/** A recurring task: what it is, when it next runs, how it went last time. */
export interface ScheduleRowProps {
  name?: string;
  /** In words, with the timezone. */
  cadence?: string;
  nextRun?: string;
  lastRun?: { state?: TaskStatusProps['state']; at?: string; label?: string };
  enabled?: boolean;
  onToggle?: (next: boolean) => void;
  /** The switch's label: what is switched, not its state. Default "Runs on schedule: <name>". */
  switchLabel?: string;
  className?: string;
}

/** The agent has stopped because it needs a person, and is waiting rather than guessing. */
export interface CheckInProps {
  question?: string;
  /** What each answer costs. This is what makes the question answerable. */
  context?: string;
  options?: Array<{ label: string } | string>;
  /** Renders the waiting line. */
  askedAt?: string;
  mark?: string;
  onAnswer?: (option: any) => void;
  className?: string;
}

/** How full the agent's working memory of this job is. Shown as shares, because
 * nobody outside engineering knows whether 84,000 is a lot. */
export interface MemoryMeterProps {
  /** Default 'Working memory'. */
  label?: string;
  total?: number;
  /** Segment it or do not ship it. Colors are positional, not semantic. */
  segments?: Array<{ label: string; value: number; color?: string }>;
  /** Defaults to a percentage. Pass one only where raw counts are wanted. */
  format?: (v: number) => string;
  /** Default 'Room left'. */
  leftLabel?: string;
  className?: string;
}

/** The generated avatar for an account with no photo: a threshold, raked to 40 degrees. */
export interface AvatarMarkProps {
  /** The initials, and what the mark derives from when there is no seed. */
  name?: string;
  /** Anything stable and unique - an account id. Use it where the mark must
   * outlive a name change, or exist before the profile does. */
  seed?: string;
  /** Forces one of the nine accent families. Fixtures only. The threshold itself
   * is identical on every mark; only the color and the initials vary. */
  family?: 'teal' | 'sky' | 'violet' | 'pink' | 'red' | 'orange' | 'yellow' | 'lime' | 'green';
  /** An accessible name. Inside Avatar, leave it off. */
  label?: string;
  className?: string;
}

/** A scroll region with the system's own scrollbar and edge fades. */
export interface ScrollerProps {
  children?: ReactNode;
  /** 'x' also swaps the fades to the left and right edges. */
  axis?: 'y' | 'x';
  /** A number is treated as px. One of these is what makes it scroll. */
  maxHeight?: number | string;
  height?: number | string;
  /** The edge fades. false where the region sits against a hard border already. */
  fade?: boolean;
  /** How far the light falls. Default 28px. */
  fadeSize?: number | string;
  /** Set this whenever the region is not on the page background - the fade is a
   * gradient into this color. */
  background?: string;
  size?: 'default' | 'thin';
  tone?: 'default' | 'inverse';
  /** 'stable' reserves the track so content does not jump. Leave it. */
  gutter?: 'stable' | 'auto';
  /** Names the region; with it the view is a role="region". */
  label?: string;
  /** The view is focusable by default. A scroll region a keyboard cannot reach
   * is a WCAG 2.1.1 failure. */
  focusable?: boolean;
  onScroll?: (e: any) => void;
  className?: string;
  style?: any;
}

/** The one permitted logo animation: the lockup uncovered along a 40 degree edge. */
export interface MarkRevealProps {
  /** Required. The logo file; the white lockup with tone 'dark'. */
  src: string;
  /** 'splash' arrives once and stops. 'handoff' adds one quiet pass every 4.2s. */
  mode?: 'splash' | 'handoff';
  /** 240px, 360px, 520px of lockup width; 96px and 144px with `symbol`. */
  size?: 'sm' | 'md' | 'lg';
  /** The symbol alone, for a square launch screen. */
  symbol?: boolean;
  /** 'dark' puts it on redrob-black. Pass the white lockup with it. */
  tone?: 'light' | 'dark';
  /** The brand wash arriving at 40 degrees behind the mark. */
  ground?: boolean;
  /** Minimum height of the stage, in px. */
  height?: number;
  /** The accessible name for the whole block. */
  alt?: string;
  /** Fires when the arrival finishes, so a splash can hand off. */
  onDone?: () => void;
  className?: string;
}

/** Work in progress with no end in sight yet. The gateway, not a ring. */
export interface LoaderProps {
  /** 16px, 28px, 44px. `sm` inside a control, `lg` for a full-surface wait. */
  size?: 'sm' | 'md' | 'lg';
  /** `inverse` on the brand gradient or a dark surface; `muted` where it should not compete. */
  tone?: 'brand' | 'muted' | 'inverse';
  /** What is loading. Always set something real - this is what a screen reader announces. */
  label?: string;
  /** Renders the label beside the bars. Do this past about three seconds. */
  showLabel?: boolean;
  /** false drops aria-live when the region is already announced by its parent. */
  live?: boolean;
  className?: string;
}

/** The serif voice: one spoken sentence, alone on the surface. */
export interface StatementProps {
  /** The sentence. One or two lines; three means it is a paragraph. */
  children?: ReactNode;
  /** 1 = 64px (56px Korean). 2 = 40px, for a line carrying an argument into a section. */
  level?: 1 | 2;
  /** The single supporting paragraph. There is never a second. */
  lede?: ReactNode;
  /** Meta line above, rendered as a SectionMark. Sentence case. */
  mark?: string | string[];
  /** Loosens the measure from 19ch to 26ch. */
  wide?: boolean;
  /** Drives the face and the size correction. Always set it for Korean. */
  lang?: 'en' | 'ko';
  className?: string;
}

/** Someone else's words, in their voice. The second and last serif surface. */
export interface QuoteProps {
  /** The quotation. No quotation marks - the rule carries it. */
  children?: ReactNode;
  /** Who said it. A quote with no name does not ship. */
  cite?: string;
  /** Their role and place, muted, after the name. */
  role?: string;
  /** false removes the blue rule and the indent, for an epigraph. */
  rule?: boolean;
  /** Latin is italic, Korean is not - Nanum Myeongjo has no italic. */
  lang?: 'en' | 'ko';
  className?: string;
}

/** The display cut: Pretendard ExtraBold with the counter of every enclosing
 * letter opened on the 40 degree rake. Display only - the floor is 40px, and
 * there is no small size on this face. Never sets the wordmark. */
export interface DisplayProps {
  /** 1 is a cover headline, 2 a section opener, 3 the smallest permitted. */
  level?: 1 | 2 | 3;
  /** ko and hi fall back whole - the cut is Latin only. */
  lang?: string;
  as?: string;
  id?: string;
  className?: string;
  children?: any;
}

export declare const Display: ComponentType<DisplayProps>;

/** Depth by ground, never by shadow. Layer 0 is the claim, 1 the evidence,
 * 2 the source. Nesting is the API; a third nesting stays at 2 and warns. */
export interface LayerProps {
  /** Set explicitly only at the root. Otherwise it comes from the nesting. */
  depth?: 0 | 1 | 2;
  as?: string;
  id?: string;
  className?: string;
  children?: any;
}

export declare const Layer: ComponentType<LayerProps>;

/** A process drawn as a process. Shape says what a step is, ground says who
 * acted, sequence says when - and nothing carries an arrowhead, because
 * reading order already does that job. See 47-illustration.md. */
export interface DiagramStep {
  label: string;
  /** Who acted. Sets the ground and the top rule. */
  by?: 'person' | 'machine' | 'system' | 'decision';
  /** The number that makes the step worth believing: "14 clauses, 2 unreadable". */
  note?: string;
  state?: 'done' | 'current' | 'blocked';
}

export interface DiagramProps {
  title?: string;
  steps?: DiagramStep[];
  /** 'flow' is a row; 'stack' is a column. Both stack under 720px. */
  orientation?: 'flow' | 'stack';
  /** Two rows - a person, and the machine. Never three. */
  lanes?: boolean;
  laneLabels?: [string, string];
  /** A line under the diagram, for the encoding key or the source. */
  source?: string;
  className?: string;
}

export declare const Diagram: ComponentType<DiagramProps>;

/** The icon set the components draw with. 24px box, 2px stroke, butt caps, miter
 * joins, every diagonal at 40 degrees. Each renders at 1em in currentColor. */
export declare const icons: Record<
  'filePlus' |
  'code' |
  'terminal' |
  'database' |
  'server' |
  'cloud' |
  'cloudOff' |
  'wifi' |
  'wifiOff' |
  'sync' |
  'cpu' |
  'api' |
  'log' |
  'plug' |
  'power' |
  'gauge' |
  'package' |
  'pulse' |
  'monitor' |
  'sun' |
  'moon' |
  'signIn' |
  'signOut' |
  'shieldCheck' |
  'eyeOff' |
  'zoomIn' |
  'zoomOut' |
  'userPlus' |
  'userCheck' |
  'userX' |
  'userSearch' |
  'userOff' |
  'usersPlus' |
  'hierarchy' |
  'idCard' |
  'permission' |
  'resume' |
  'interview' |
  'invite' |
  'roster' |
  'timer' |
  'clockAlert' |
  'hourglass' |
  'calendarPlus' |
  'calendarCheck' |
  'calendarX' |
  'calendarRange' |
  'calendarGrid' |
  'calendarClock' |
  'repeat' |
  'alarm' |
  'desk' |
  'browser' |
  'kanban' |
  'pipeline' |
  'target' |
  'presentation' |
  'mobile' |
  'note' |
  'book' |
  'bookOpen' |
  'lightbulb' |
  'map' |
  'barcode' |
  'print' |
  'qr' |
  'move' |
  'keyboard' |
  'split' |
  'merge' |
  'dragHandle' |
  'megaphone' |
  'checkAll' |
  'sliders' |
  'accessibility' |
  'message' |
  'messages' |
  'comment' |
  'bell' |
  'bellOff' |
  'phone' |
  'videoCall' |
  'at' |
  'hash' |
  'share' |
  'reply' |
  'inbox' |
  'draft' |
  'image' |
  'images' |
  'camera' |
  'video' |
  'mic' |
  'micOff' |
  'volume' |
  'volumeOff' |
  'pause' |
  'skipBack' |
  'skipForward' |
  'record' |
  'help' |
  'question' |
  'alert' |
  'bug' |
  'verified' |
  'pending' |
  'blocked' |
  'circleCheck' |
  'circleX' |
  'circlePlus' |
  'circleMinus' |
  'dot' |
  'card' |
  'wallet' |
  'receipt' |
  'tag' |
  'cart' |
  'percent' |
  'coins' |
  'bank' |
  'invoice' |
  'arrowUp' |
  'arrowUpLeft' |
  'arrowDownLeft' |
  'arrowDownRight' |
  'chevronsRight' |
  'chevronsLeft' |
  'chevronsUp' |
  'chevronsDown' |
  'home' |
  'back' |
  'forward' |
  'expand' |
  'collapse' |
  'maximize' |
  'minimize' |
  'fullscreen' |
  'sidebar' |
  'panelRight' |
  'layout' |
  'fileText' |
  'fileCode' |
  'fileSheet' |
  'fileImage' |
  'fileZip' |
  'filePdf' |
  'folder' |
  'folderOpen' |
  'folderPlus' |
  'archive' |
  'clipboard' |
  'clipboardCheck' |
  'attachment' |
  'save' |
  'duplicate' |
  'trash' |
  'restore' |
  'bold' |
  'italic' |
  'underline' |
  'strikethrough' |
  'list' |
  'listOrdered' |
  'indent' |
  'outdent' |
  'alignLeft' |
  'alignCenter' |
  'alignRight' |
  'alignJustify' |
  'undo' |
  'redo' |
  'crop' |
  'door' |
  'threshold' |
  'passport' |
  'check' |
  'minus' |
  'plus' |
  'close' |
  'chevronDown' |
  'chevronUp' |
  'chevronLeft' |
  'chevronRight' |
  'arrowRight' |
  'arrowLeft' |
  'arrowUpRight' |
  'arrowDown' |
  'external' |
  'search' |
  'info' |
  'success' |
  'warning' |
  'danger' |
  'stop' |
  'sparkle' |
  'tool' |
  'shield' |
  'globe' |
  'key' |
  'lock' |
  'unlock' |
  'user' |
  'users' |
  'ladder' |
  'spark' |
  'mail' |
  'file' |
  'grid' |
  'chart' |
  'trend' |
  'clock' |
  'calendar' |
  'filter' |
  'sort' |
  'link' |
  'upload' |
  'download' |
  'send' |
  'refresh' |
  'more' |
  'menu' |
  'settings' |
  'eye' |
  'star' |
  'bookmark' |
  'copy' |
  'edit' |
  'play' |
  'bridge' |
  'translate' |
  'beacon' |
  'seal' |
  'clause' |
  'highlight' |
  'redact' |
  'stack' |
  'columns' |
  'checklist' |
  'signature' |
  'scan' |
  'scales' |
  'flag' |
  'compare' |
  'route' |
  'history' |
  'branch' |
  'briefcase' |
  'building' |
  'graduation' |
  'network' |
  'pin' |
  'anonymous',
  ComponentType<IconProps>
>;

/* ---- The evidence layer ------------------------------------------------ */

/** The request read back as the conditions the machine will actually apply,
 * each one marked as something the person said or something it assumed. The
 * point is that a wrong condition can be dropped before anything is searched. */
export interface CriteriaProps {
  /** Defaults to "What I am looking for". */
  title?: string;
  /** What the person actually typed, shown back to them in their own words. */
  request?: string;
  items?: Array<{
    id?: string;
    label: string;
    detail?: string;
    /** Must have / Good to have / Must not have. Defaults to 'required'. */
    weight?: 'required' | 'preferred' | 'excluded';
    /** 'inferred' marks the row as the machine's assumption, not the person's words. */
    source?: 'stated' | 'inferred';
    /** Dims the row without removing it. */
    off?: boolean;
  }>;
  /** Renders the drop control on every row. */
  onRemove?: (item: any, index: number) => void;
  onAdd?: () => void;
  addLabel?: string;
  note?: string;
  className?: string;
}

/** What an answer was able to read, and - the part that matters - what it was
 * not. A corpus product that silently drops the scanned PDFs has told the
 * reader nothing about the confidence they should place in the answer. */
export interface SourceSetProps {
  /** Defaults to "What this answer looked at". */
  title?: string;
  sources?: Array<{
    id?: string;
    name: string;
    count?: number;
    /** Overrides the halved estimate used for a partial source. */
    readCount?: number;
    state?: 'read' | 'partial' | 'skipped' | 'pending';
    stateLabel?: string;
    /** Why this one was not read. Required in practice for 'skipped'. */
    reason?: string;
    /** An icon from the set; defaults to icons.stack. */
    icon?: (props: any) => any;
  }>;
  /** Derived by summing the sources when omitted. */
  read?: number;
  total?: number;
  /** What the things are called: 'documents', 'profiles', 'filings'. */
  unit?: string;
  updated?: string;
  /** Replaces the derived "N were not read" sentence. */
  missedNote?: string;
  className?: string;
}

/** One passage, with the quoted part marked inside enough surrounding text to
 * judge whether the quote was fair. This is what a Citation opens into. */
export interface EvidenceProps {
  /** What the passage is offered as proof of. */
  claim?: string;
  claimLabel?: string;
  /** The surrounding text. A string lets `quote` be marked inside it. */
  passage?: string | any;
  /** The exact substring of `passage` to mark. Ignored if it is not found. */
  quote?: string;
  source?: string;
  href?: string;
  meta?: string;
  actions?: any;
  className?: string;
}

/** The same questions asked of every item in a set, with each answer openable
 * at the passage it came from and each uncertain one flagged for a person. */
export interface ReviewGridProps {
  columns?: Array<{ key: string; label: string; width?: string }>;
  rows?: Array<{
    id?: string;
    label: string;
    sub?: string;
    cells?: Record<string, {
      value?: string;
      /** 'pending' renders the waiting bar; 'none' renders "Not found". */
      state?: 'answered' | 'unsure' | 'none' | 'pending';
      /** A source number, rendered as a superscript on the cell. */
      source?: number | string;
    }>;
  }>;
  title?: string;
  caption?: string;
  /** The first column's heading. Defaults to "Document". */
  rowLabel?: string;
  onOpenCell?: (row: any, column: any, cell: any) => void;
  onOpenRow?: (row: any, index: number) => void;
  footNote?: string;
  className?: string;
}

/** One result read against the stated conditions, one condition at a time,
 * with the evidence for each. Deliberately has no score: see the guidelines. */
export interface MatchBreakdownProps {
  name?: string;
  sub?: string;
  /** Replaces the derived "Meets 4 of 6". */
  verdict?: string;
  items?: Array<{
    id?: string;
    label: string;
    state?: 'met' | 'partly' | 'missing' | 'unknown';
    /** The sentence that shows it. Absent renders the "nothing speaks to this" line. */
    evidence?: string;
    noEvidence?: string;
  }>;
  /** Makes each evidence line open its source. */
  onOpen?: (item: any, index: number) => void;
  className?: string;
}

/** A proposed change to wording, shown as the wording. Takes the passage in
 * parts so the deletions and insertions sit in the sentence rather than in a
 * second column, and carries the reason for the change. */
export interface RedlineProps {
  /** The clause or section this changes. */
  label?: string;
  source?: string;
  parts?: Array<{ text: string; kind?: 'same' | 'in' | 'out' }>;
  /** Why the change is proposed. Required: without it the change is an assertion. */
  why: string;
  state?: 'open' | 'kept' | 'reverted';
  stateLabel?: string;
  onKeep?: () => void;
  onRevert?: () => void;
  keepLabel?: string;
  revertLabel?: string;
  className?: string;
}

/** Something the machine flagged in a piece of work: how serious, where it is,
 * and what to do about it. Not a notification - a record that can be settled. */
export interface FindingProps {
  severity?: 'high' | 'medium' | 'low' | 'note';
  severityLabel?: string;
  title?: string;
  /** Where it is, in the reader's terms: "Clause 11.2, page 14". */
  where?: string;
  detail?: string;
  /** An Evidence, usually. */
  evidence?: any;
  suggestion?: string;
  suggestionLabel?: string;
  state?: 'open' | 'accepted' | 'dismissed';
  /** Makes `where` open the source. */
  onOpen?: () => void;
  actions?: any;
  className?: string;
}

/** A procedure a team saved and runs again: its steps in order, and which of
 * them stop and ask a person. The count of stops is the honest headline. */
export interface PlaybookProps {
  name?: string;
  purpose?: string;
  steps?: Array<{
    id?: string;
    label: string;
    detail?: string;
    /** Renders the "Asks you first" mark and counts toward the foot line. */
    approval?: boolean;
    approvalLabel?: string;
  }>;
  owner?: string;
  /** Free text: "run 34 times". */
  runs?: string;
  lastRun?: string;
  onRun?: () => void;
  runLabel?: string;
  className?: string;
}

/** The set someone is assembling while they keep looking. Held in view, with
 * every item removable, so a long list of results can become a short one. */
export interface ShortlistProps {
  /** Defaults to "Your shortlist". */
  title?: string;
  items?: Array<{ id?: string; label: string; sub?: string }>;
  /** Renders "3 of 8" rather than "3". */
  limit?: number;
  /** Required: a shortlist the person cannot edit is a verdict. */
  onRemove: (item: any, index: number) => void;
  /** Buttons for what happens next. */
  actions?: any;
  empty?: string;
  className?: string;
}

/** The disclosure shown to a person a machine helped make a decision about:
 * what the decision was, what was and was not considered, who reviewed it, and
 * what they can ask for. The component is the shape; the words are yours. */
export interface DecisionNoticeProps {
  /** Defaults to "How this decision was made". */
  title?: string;
  /** The decision, in the second person: "Whether to invite you to interview". */
  decision?: string;
  used?: string[];
  usedLabel?: string;
  notUsed?: string[];
  notUsedLabel?: string;
  /** Who looked at it, and when. An empty string here is itself a disclosure. */
  humanReview?: string;
  rights?: string[];
  rightsLabel?: string;
  auditHref?: string;
  auditLabel?: string;
  contact?: string;
  tone?: 'default' | 'quiet';
  className?: string;
}

export declare const Criteria: ComponentType<CriteriaProps>;
export declare const SourceSet: ComponentType<SourceSetProps>;
export declare const Evidence: ComponentType<EvidenceProps>;
export declare const ReviewGrid: ComponentType<ReviewGridProps>;
export declare const MatchBreakdown: ComponentType<MatchBreakdownProps>;
export declare const Redline: ComponentType<RedlineProps>;
export declare const Finding: ComponentType<FindingProps>;
export declare const Playbook: ComponentType<PlaybookProps>;
export declare const Shortlist: ComponentType<ShortlistProps>;
export declare const DecisionNotice: ComponentType<DecisionNoticeProps>;

/* ---- The web layer ----------------------------------------------------- */

/** The page frame: skip link, landmarks, and the `lang` attribute that the whole
 * Korean system keys off. Everything else in this layer assumes it is present. */
/** One full-name field. Not First and Last: a Korean name puts the family name
 * first, many South Indian names are an initial plus a given name with no family
 * name, and some people have one name. `value` is `{ full, second, preferred }`. */
/** Three text fields for a date somebody already knows. Nobody scrolls a
 * calendar back forty years to a birthday. The month field takes a word as well
 * as a number, because people write "jan" and being right should not be an error. */
export interface DateInputProps extends Common {
  value?: { day?: string; month?: string; year?: string; iso?: string | null };
  onChange?: (value: DateInputProps['value'], key: string) => void;
  label?: ReactNode;
  dayLabel?: string;
  monthLabel?: string;
  yearLabel?: string;
  /** Field order: "dmy" (the default), "mdy" or "ymd". */
  order?: 'dmy' | 'mdy' | 'ymd';
  /** Adds the bday autocomplete tokens. Only for an actual date of birth. */
  birthday?: boolean;
  required?: boolean;
  hint?: ReactNode;
  error?: ReactNode;
  locale?: string;
  id?: string;
}

export interface NameInputProps extends Common {
  value?: { full?: string; second?: string; preferred?: string };
  onChange?: (value: NameInputProps['value'], key: string) => void;
  label?: string;
  hint?: ReactNode;
  /** Show a second field for the name in the person's own script. Korean names
   * have no canonical romanization, so a transliteration is theirs to supply. */
  second?: boolean;
  secondLabel?: string;
  secondHint?: ReactNode;
  /** Show "What should we call you?" - the field that solves Korean formality
   * and preferred names without corrupting the legal name. */
  preferred?: boolean;
  preferredLabel?: string;
  preferredHint?: ReactNode;
  /** Only the full name can be required, and it is by default. */
  required?: boolean;
  error?: Record<string, ReactNode>;
  size?: Size;
  disabled?: boolean;
  id?: string;
}

/** An amount, formatted by `Intl` for the locale rather than by hand. */
export interface MoneyProps extends Common {
  amount: number;
  /** ISO 4217: KRW, INR, USD. */
  currency: string;
  /** Defaults to the document's `lang`. */
  locale?: string;
  /** Korea groups by ten thousands (2840만) and India by crore (2.8Cr). */
  compact?: boolean;
  /** Leave unset. `narrowSymbol` renders USD as a bare $ to a Korean reader and
   * undoes the disambiguation CLDR does for free; use `code` when several
   * currencies appear together. */
  display?: 'code' | 'name' | 'symbol';
  /** false stops Intl drawing .00 on a whole amount, for a headline figure. It
   * does not round: pass an amount you are happy to show. */
  decimals?: boolean;
  title?: string;
}

/** A converted figure with the rate, the benchmark, the markup and the date it
 * was taken. Without those it hides a decision somebody made about you. */
export interface ConvertedAmountProps extends Common {
  amount: number;
  currency: string;
  converted?: { amount: number; currency: string };
  /** Units of the converted currency per one of `currency`. */
  rate?: number;
  /** Name the benchmark: "ECB reference rate", "RBI reference rate". */
  benchmark?: string;
  /** Markup over the benchmark, as a rate: 0.02 renders as 2%. */
  markup?: number;
  /** The measurement date, written out. */
  at?: string;
  note?: ReactNode;
  decimals?: boolean;
  locale?: string;
}

/** A moment, in the reader's zone, always labeled. */
export interface TimestampProps extends Common {
  /** ISO 8601 or a Date. Store UTC. */
  at: string | Date;
  /** IANA zone to render in. Defaults to the viewer's. */
  zone?: string;
  /** A second zone to show beside it, for the other party to a deadline or a
   * meeting. Converting theirs away silently is the invisible kind of border. */
  originZone?: string;
  /** "3 hours ago", with the absolute value kept in the title. Never use it for
   * anything legal, financial or audited. */
  relative?: boolean;
  precision?: 'date' | 'minute' | 'second';
  zoneStyle?: 'short' | 'long' | 'shortOffset';
  locale?: string;
}

/** An address whose field order switches on country, with a textarea for the
 * countries this system has not been taught. */
export interface AddressInputProps extends Common {
  /** KR, IN or US. Anything else falls back to one textarea. */
  country?: string;
  value?: Record<string, string>;
  onChange?: (value: Record<string, string>, key: string) => void;
  label?: string;
  hint?: ReactNode;
  error?: Record<string, ReactNode>;
  id?: string;
}

/** One field and a country, stored as E.164. */
export interface PhoneInputProps extends Common {
  value?: { country?: string; local?: string; e164?: string };
  onChange?: (value: PhoneInputProps['value']) => void;
  country?: string;
  countries?: string[];
  countryLabel?: string;
  label?: string;
  hint?: ReactNode;
  error?: ReactNode;
  id?: string;
}

/** The eight drawings. Constructions are built from the mark's geometry and sit
 *  in ink-secondary; objects are the icon vocabulary at scale and sit in
 *  ink-primary. The component picks the ink from the name. `47-illustration.md`
 *  has the rules, including the one against drawing people. */
export type ConstructionName = 'threshold' | 'layers' | 'opening' | 'reach';
export type ObjectName = 'door' | 'waiting' | 'unreadable' | 'nothingYet';

export interface IllustrationProps extends Common {
  name: ConstructionName | ObjectName;
  size?: 'sm' | 'md' | 'lg' | 'xl';
  /** Empty unless the drawing is the only place a fact appears - and if it is,
   *  that is a layout defect rather than a reason for a long alt. */
  alt?: string;
  style?: CSSProperties;
}

export interface ChartSeries {
  name?: string;
  values: number[];
  color?: string;
  /** Index from which the values are projected rather than measured. */
  estimatedFrom?: number;
}

export interface ChartProps extends Common {
  kind?: 'bar' | 'line';
  series: ChartSeries[];
  labels?: string[];
  title?: ReactNode;
  alt?: string;
  height?: number;
  max?: number;
  format?: string;
  locale?: string;
  /** The date the figures were taken. A chart without one is a chart that hides
   *  how old it is. */
  measuredAt?: string;
  /** What is missing from the data, said on the chart rather than in a footnote. */
  missingNote?: ReactNode;
  /** What was deliberately left out, and why. */
  excluded?: ReactNode;
  tableLabel?: string;
  /** Label for the control once the figures are showing. Default "Hide the figures". */
  hideTableLabel?: string;
  labelHeader?: string;
}

export interface SparklineProps extends Common {
  values: number[];
  color?: string;
  alt?: string;
}

export interface MarkProps extends Common {
  /** The lockup for light grounds. */
  src: string;
  /** The lockup for dark grounds. Pass it: without it the wordmark disappears in dark. */
  darkSrc?: string;
  /** Rendered height in px; the width follows. */
  height?: number;
  /** Defaults to "Redrob". Pass "" where the name is already in the text beside it. */
  alt?: string;
  /** Force the variant for a panel whose ground does not follow the page theme:
   *  a dark band on a light page, a light card on a dark one. Leave it off and
   *  the lockup follows data-theme, which is right nearly everywhere. */
  tone?: 'light' | 'dark';
}

export interface AppShellNavItem {
  id?: string | number;
  label: ReactNode;
  icon?: ReactNode;
  href?: string;
  current?: boolean;
  /** A count or a time, set in tabular figures at the end of the row. */
  meta?: ReactNode;
  /** Makes this item a group heading instead of a link: the items after it belong to it. */
  heading?: ReactNode;
}

/** The frame a product screen lives in. `PageShell` is the website's; this is the other
 * one. Three regions - nav, work, context - a skip link, one `h1`, and the landmarks.
 * The rail drops at 1180px and the sidebar collapses to icons at 900px. */
export interface AppShellProps extends Common {
  /** The product name beside the lockup: Cowork, Browser, Office, Design. */
  product?: string;
  mark?: string;
  markDark?: string;
  nav?: AppShellNavItem[];
  navLabel?: string;
  /** Anything below the nav in the sidebar: a run list, a workspace switcher. */
  aside?: ReactNode;
  /** A ThemeSwitch, at the foot of the sidebar. */
  theme?: ReactNode;
  /** Shows a button that folds the sidebar into a tray of icons. */
  collapsible?: boolean;
  /** Controlled fold. Leave it off and the shell remembers the choice in this browser. */
  collapsed?: boolean;
  defaultCollapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** The symbol alone, shown in the tray where the lockup does not fit. */
  symbol?: string;
  collapseLabel?: string;
  expandLabel?: string;
  title?: ReactNode;
  /** The one line under the title: counts, elapsed, where it came from. */
  meta?: ReactNode;
  actions?: ReactNode;
  /** The context column. Omit it and the grid becomes two columns. */
  rail?: ReactNode;
  railLabel?: string;
  /** Pinned to the bottom of the work column: a compose bar, a save row. */
  foot?: ReactNode;
  /** The work column caps its children at `--work-max`, 860px. Set false for a
   * table or a canvas that should use the whole width. */
  measure?: boolean;
  skipLabel?: string;
  children?: ReactNode;
}

export interface PageShellProps {
  /** Written to the document element. 'ko' turns on keep-all and the Korean steps. */
  lang?: string;
  header?: any;
  footer?: any;
  /** The skip link's target and the main landmark's id. Defaults to 'main'. */
  mainId?: string;
  skipLabel?: string;
  children?: any;
  className?: string;
}

/** A full-bleed section. The ground change, not another border, is what separates
 * one part of a page from the next. There is no centering prop: content hangs from
 * the left of the rail, because a centered band is the first half of the named tell. */
export interface BandProps {
  /** `deep` is the dark construction ground: the rake, a lit seam, the light
   *  falling away. A ground, not a layer - content depth is Layer/strata. */
  ground?: 'base' | 'raised' | 'sunken' | 'brand' | 'wash' | 'deep';
  size?: 'sm' | 'lg';
  /** A product key (bundle.js PRODUCT_KEYS): the band takes that product's grounds
   *  (20-color.md). Every band on one product's own page; never with `threshold="spectrum"`. */
  product?: 'chat' | 'cowork' | 'browser' | 'console' | 'office' | 'design' | 'code' | 'mail' | 'books' | 'jobs' | 'skill-tests' | 'passport' | 'craft';
  /** Draws the threshold on the 40 degree axis. At most one band per page. On `brand` it is
   *  the social cards' cut: the ground beyond it lit, a teal seam; `'spectrum'` adds the seven
   *  product lines after the seam (suite surfaces only). Elsewhere, one hairline. */
  threshold?: boolean | 'spectrum';
  /** Grain rides on any ground but `base`. Pass false to take it off. */
  grain?: boolean;
  /** 1440px rail instead of 1180px, for a table or a wide figure. */
  wide?: boolean;
  /** A pattern from Pattern and texture: rake, threshold, weave, rule or grid. Never behind body copy. */
  texture?: 'rake' | 'threshold' | 'weave' | 'rule' | 'grid';
  /** fine or coarse; omitted is the middle scale. */
  textureScale?: 'fine' | 'coarse';
  /** The pattern fades off along the rake. Default true. */
  textureFade?: boolean;
  as?: string;
  id?: string;
  labelledBy?: string;
  children?: any;
  className?: string;
}

/** Site navigation - which `Menu` and `Tabs` both refuse to be. Up to six sections,
 * each optionally opening a panel, plus the language control and one action. */
export type ThemeMode = 'system' | 'light' | 'dark';

export interface ThemeSwitchProps extends Common {
  value?: ThemeMode;
  defaultValue?: ThemeMode;
  onChange?: (mode: ThemeMode) => void;
  /** Where data-theme is written. Default document.documentElement. */
  target?: HTMLElement;
  /** localStorage key to remember the choice (and apply it on load). Omit to remember nothing. */
  storageKey?: string;
  label?: string;
  labels?: Partial<Record<ThemeMode, string>>;
  size?: 'sm' | 'md';
}

export interface SiteHeaderProps {
  /** The lockup, as an img or svg node. */
  mark?: any;
  homeHref?: string;
  homeLabel?: string;
  /** More than six and the nav has become a sitemap. The seventh is dropped. */
  sections?: Array<{
    label: string;
    href?: string;
    items?: Array<{ label: string; href: string; detail?: string }>;
  }>;
  /** A LangSwitch, usually. */
  lang?: any;
  /** A ThemeSwitch. Sits before the language control; moves into the drawer below 900px. */
  theme?: any;
  themeLabel?: string;
  /** One Button. Not two. */
  action?: any;
  /** Sticks to the top with a wash-edge under it. */
  stuck?: boolean;
  navLabel?: string;
  menuLabel?: string;
  className?: string;
}

/** The site footer: the mark, one sentence, the columns and the legal links.
 * It does NOT carry registered offices. Korea's disclosure - a registration number,
 * the representative and a named privacy officer - is a legal page's job, and a
 * footer is where that goes to be scrolled past rather than read. */
export interface SiteFooterProps {
  mark?: any;
  /** One sentence. Not a mission statement. */
  line?: string;
  action?: any;
  /** `divider` starts a second group within a column (the endorsed brands after the
   *  suite); `external` marks a link to another site. */
  columns?: Array<{ title: string; items: Array<{ label: string; href: string; divider?: boolean; external?: boolean }> }>;
  copyright?: string;
  /** `onClick` instead of `href` renders a button - that is how the consent
   * preferences get reopened, which most privacy regimes require. */
  legal?: Array<{ label: string; href?: string; onClick?: () => void }>;
  className?: string;
}

/** The language control. Every entry's `href` is THE SAME PAGE in that language.
 * A language with no counterpart for this page renders as unavailable rather than
 * as a link to the home page, because dropping a reader on the home page when they
 * were reading a case study is the border this company is named after reversing. */
export interface LangSwitchProps {
  langs?: Array<{
    code: string;
    /** The language's name in its own language: 한국어, not Korean. */
    label: string;
    /** This page in that language. Omit it and the entry renders as unavailable. */
    href?: string;
  }>;
  current?: string;
  /** Up to this many languages render inline; more collapse into a menu. Default 3. */
  inlineUpTo?: number;
  /** 'up' opens the menu above the trigger, for a switch at the foot of a sidebar. Default 'down'. */
  placement?: 'down' | 'up';
  /** Which edge the menu lines up with. Default 'right'. */
  align?: 'left' | 'right';
  /** Accessible name for the control. */
  label?: string;
  missingLabel?: string;
  onChange?: (lang: any) => void;
  className?: string;
}

/** The cookie notice. Must render before any tag loads, not after. Nothing is on
 * by default except what is marked `required`, and declining is a real button in
 * the same row as accepting rather than a link in the small print. */
export interface ConsentBarProps {
  categories?: Array<{
    id: string;
    label: string;
    /** What this category actually does, in the reader's words. */
    detail?: string;
    /** Rendered checked and disabled, and always returned true. */
    required?: boolean;
  }>;
  /** Receives a map of category id to boolean. Nothing is stored for you. */
  onDecide?: (choices: Record<string, boolean>) => void;
  acceptLabel?: string;
  declineLabel?: string;
  chooseLabel?: string;
  saveLabel?: string;
  requiredLabel?: string;
  title?: string;
  children?: any;
  className?: string;
}

/** The top of a page. There is no alignment prop and there will not be one: the
 * recipe is fixed: the heading on a wash (or on the film), one button and one link,
 * nothing in a box, hanging from the left rail (Hero/README.md). */
export interface HeroProps {
  mark?: any;
  /** The heading: `Display as="h1"` on the homepage and product landing pages, a
   *  `Statement` everywhere else. Nothing else goes here. */
  children?: any;
  lede?: string;
  /** One Button, shape="pill" with emphasis. */
  action?: any;
  /** The second path is a link, never a second button - two equal buttons is the
   * generated hero's own signature. */
  secondary?: string;
  secondaryHref?: string;
  /** A qualifying line under the actions: what it costs, what it does not need. */
  foot?: string;
  /** A product render credited "as designed", or a screenshot once the software ships.
   *  Never an illustration, never stock photography. Ignored with `film`. */
  media?: any;
  /** A film behind the whole Band (46-imagery.md, Generated film). Silent and looping; it
   * does not play under reduced motion, on Save-Data or below 768px, where the poster
   * stands in. `label` is the credit and AI label shown beside Pause - required for
   * generated film. Put the hero in a `Band ground="deep"`. */
  film?: {
    src: string;
    webm?: string;
    poster: string;
    label: string;
    /** Accessible names for the icon control. Defaults: "Pause the film", "Play the film". */
    pauseLabel?: string; playLabel?: string;
  };
  className?: string;
}

export declare const DateInput: ComponentType<DateInputProps>;
export declare const NameInput: ComponentType<NameInputProps>;
export declare const Money: ComponentType<MoneyProps>;
export declare const ConvertedAmount: ComponentType<ConvertedAmountProps>;
export declare const Timestamp: ComponentType<TimestampProps>;
export declare const AddressInput: ComponentType<AddressInputProps>;
export declare const PhoneInput: ComponentType<PhoneInputProps>;
export declare const Illustration: ComponentType<IllustrationProps>;
export declare const Chart: ComponentType<ChartProps>;
export declare const Sparkline: ComponentType<SparklineProps>;
export declare const Mark: ComponentType<MarkProps>;
export declare const AppShell: ComponentType<AppShellProps>;
export declare const PageShell: ComponentType<PageShellProps>;
export declare const Band: ComponentType<BandProps>;
export declare const SiteHeader: ComponentType<SiteHeaderProps>;
export declare const SiteFooter: ComponentType<SiteFooterProps>;
export declare const LangSwitch: ComponentType<LangSwitchProps>;
export declare const ThemeSwitch: ComponentType<ThemeSwitchProps>;
export declare const ConsentBar: ComponentType<ConsentBarProps>;
export declare const Hero: ComponentType<HeroProps>;

/** One subject, with its media beside it. Takes a single subject and never an array,
 * because an array becomes a three-up grid the first time somebody passes three - which
 * is the layout `50-not-generated.md` names as the tell. Pass `index` and consecutive
 * rows alternate sides on their own. */
export interface FeatureRowProps {
  /** Position in the sequence. Odd rows put the media on the left. */
  index?: number;
  mark?: any;
  title?: string;
  /** Prose. One or two short paragraphs. */
  children?: any;
  /** Up to four. Each takes the raked tick rather than a bullet. */
  points?: string[];
  action?: any;
  /** A product render credited "as designed" or a screenshot, usually inside a Figure. */
  media?: any;
  /** Runs the media off the page edge. Exactly one row per page should do this. */
  bleed?: boolean;
  className?: string;
}

/** An image with a caption and no frame. The caption is what earns the element; a border
 * round a screenshot is the container this system argues against. */
export interface FigureProps {
  src?: string;
  srcSet?: string;
  /** Empty string is correct for decoration, and a real sentence for everything else. */
  alt?: string;
  /** CSS aspect-ratio, default '16 / 10'. Reserves the space so nothing jumps on load. */
  ratio?: string;
  /** Required in practice. A figure with no caption is an image. */
  caption?: string;
  credit?: string;
  /** Skips lazy loading, for a figure above the fold. */
  eager?: boolean;
  /** A video or a chart instead of an img. */
  children?: any;
  className?: string;
}

/** Customer marks under a sentence carrying a number and the period it was measured over.
 * The number is the difference between proof and decoration, and it is why this is not a
 * logo wall. Never place it directly under the hero - that is the third beat of the tell. */
export interface LogoRowProps {
  /** Optional. Redrob's own wall carries none. If used: specific, checkable, with its period. */
  claim?: string;
  /** Accessible name for the list of marks. Defaults to "Customers and partners". */
  label?: string;
  /** "as of March 2026". Without it the claim has no shelf life. */
  period?: string;
  /** In the order given. `scale` is a measured optical correction (0.8 to 1.3), never a ranking. */
  logos?: Array<{ name?: string; src: string; alt?: string; href?: string; scale?: number }>;
  /** Where the number comes from, if it needs saying. */
  note?: string;
  className?: string;
}

/** A customer, built around the number rather than the quote. `Quote` is capped at one per
 * page and that cap is load-bearing here: an employer often will not consent to being named
 * and a candidate's words are personal data about the person the system decided about. */
export interface CustomerStoryProps {
  customer?: string;
  sector?: string;
  logo?: any;
  /** The figure, large. '61%' or '9 days'. */
  figure?: string;
  /** What the figure is. A sentence, not a noun. */
  figureLabel?: string;
  /** What it was measured over. Required in practice. */
  period: string;
  children?: any;
  /** At most one Quote, and at most one on the page. */
  quote?: any;
  href?: string;
  moreLabel?: string;
  className?: string;
}

/** The form shell: field layout, an error summary that takes focus, the submit lifecycle,
 * a success state and a honeypot. The demo request, the newsletter capture and the contact
 * form are three configurations of this, not three components. No box - the fields sit on
 * the page ground and hang from the same left edge as everything else. */
export interface FormProps {
  title?: string;
  description?: string;
  /** Input, Select, Checkbox and the rest. */
  children?: any;
  /** 'pending' disables submit; 'done' replaces the whole form with the success state. */
  state?: 'idle' | 'pending' | 'done' | 'error';
  /** Rendered as a summary that RECEIVES FOCUS. `field` links to the input's id. */
  errors?: Array<{ field?: string; message: string }>;
  onSubmit?: (event: any) => void;
  submitLabel?: string;
  pendingLabel?: string;
  /** The consent checkbox. Marketing consent is its own affirmative box, never bundled
   * into acceptance of the privacy policy. */
  consent?: any;
  /** What happens next, and how long it takes. */
  note?: string;
  doneTitle?: string;
  doneText?: string;
  /** The honeypot field's name. Change it if a bot learns this one. */
  trapName?: string;
  errorsTitle?: string;
  className?: string;
}

/** Plans across, capabilities down. Not three cards ending in "Enterprise - contact us":
 * `00-narrative.md` rules out scarcity vocabulary because the thesis is access. One price
 * per plan: the one set for the market the page is being read in. Every market's number is
 * SET LOCALLY and never converted from another - "a price set in the wrong currency" is on
 * the company's own list of borders to reverse. Three plans; a fourth is a decision the
 * reader now has to make before they have read anything. */
export interface PriceTableProps {
  plans?: Array<{
    id?: string;
    name: string;
    /** The price for this market, already in its currency. Never a converted figure. */
    price?: string;
    /** What the price is per: "a seat, a month". */
    per?: string;
    detail?: string;
    action?: any;
  }>;
  /** `true` renders a check, `false` or absent renders a dash, a string renders as itself.
   * A row with only `group` set is a heading across the table. */
  rows?: Array<{
    label?: string;
    detail?: string;
    values?: Record<string, boolean | string>;
    group?: string;
  }>;
  rowLabel?: string;
  footNote?: string;
  className?: string;
}

/** A long read: blog, research or news. They differ by tag, not by layout. */
/** One author of a post. A plain string is the name alone. */
export interface PubAuthor {
  name: string;
  /** "Research lead, Seoul". Shown after the name, muted. */
  role?: string;
  /** An img URL or an Avatar node. Shown stacked before the names. */
  avatar?: any;
  /** The author's page. */
  href?: string;
}

export interface ArticleLayoutProps {
  /** 'h2' when the page's h1 is set above it (a StoryHeader claim). Default 'h1'. */
  titleAs?: 'h1' | 'h2';
  /** The same object PostList took. Every field below overrides the story's own. */
  story?: PubStory;
  /** Defaults to `story.kind`. */
  kicker?: string | string[];
  title?: string;
  /** One serif sentence under the title. Defaults to `story.summary`. */
  standfirst?: string;
  /** Everyone who wrote it, in byline order, each by name. Never "The Redrob team". */
  authors?: Array<string | PubAuthor>;
  /** One author. Kept for older pages; use `authors`. */
  author?: string;
  avatar?: any;
  date?: string;
  /** The machine-readable date for the time element. */
  dateTime?: string;
  reading?: string;
  /** Research: the one number under the standfirst, with its period. */
  finding?: { value: string; label: string; period?: string };
  /** Research: the method and data, in the meta row. */
  paper?: { href: string; label?: string };
  /** Renders the on-this-page nav. Worth it past about 1,200 words. */
  contents?: Array<{ id: string; label: string }>;
  contentsLabel?: string;
  tags?: Array<{ label: string; href: string }>;
  children?: any;
  className?: string;
}

/** A picture with its disclosure, shared by IndexHeader, NewsSection and a lead story. */
export interface PubImage {
  /** JPEG or PNG fallback. */
  src: string;
  /** WebP srcset, e.g. "a-1200.webp 1200w, a.webp 2400w". */
  webp?: string;
  alt?: string;
  /** What it shows, in a few words. Left of the caption row. */
  caption?: string;
  /** The AI disclosure, right of the caption row. Defaults to "AI-generated".
   *  With `generated: false` it is the credit ("As designed", a photographer). */
  label?: string;
  generated?: boolean;
  /** CSS object-position, to keep the subject in a phone crop. */
  position?: string;
}

/** One story, the same shape on Research, News, Blog and the homepage. A page looks the
 * way it does because of the fields its stories carry - there is no variant prop. */
export interface PubStory {
  id?: string;
  href: string;
  title: string;
  summary?: string;
  /** 'Research', 'Launch', 'Product', 'Engineering', 'News'. */
  kind?: string;
  /** As displayed: "22 September 2026". */
  date?: string;
  /** ISO date, for <time> and for group="year". */
  dateTime?: string;
  /** Research and Blog: who wrote it, in byline order. Real people only. */
  authors?: string | Array<string | PubAuthor>;
  /** Blog: "6 min". */
  reading?: string;
  /** Research: the one number, what it counts, and the period it was measured over. */
  finding?: { value: string; label: string; period?: string };
  /** Research: the method and data, as its own link. */
  paper?: { href: string; label?: string };
  /** Shown on the lead only. */
  image?: PubImage;
}

/** An index of posts. The newest takes the feature card with its square top-left notch and
 * the rest are hairlines - which is the rule that stops an index becoming a grid of
 * identical boxes. Pair it with `Pagination`. */
export interface PostListProps {
  /** 'section' is the homepage's news band and takes NewsSectionProps: `lead` is then the
   * newest story, `items` three headlines, `href` the News index. */
  variant?: 'index' | 'section';
  items?: PubStory[];
  /** false treats every item the same, for page two onward. With variant 'section', the lead story. */
  lead?: boolean | PubStory;
  title?: string;
  href?: string;
  allLabel?: string;
  id?: string;
  lang?: 'en' | 'ko';
  /** 'year' sets everything after the lead under year headings - the News archive. */
  group?: 'year';
  className?: string;
}

/** The top of Research, News and Blog: the page's name as the h1, a one-sentence lede,
 * topic links, and the page's one picture, labeled when generated. */
export interface IndexHeaderProps {
  /** The page's name: "Research", "News", "Blog". Not a slogan. */
  title: ReactNode;
  /** One sentence on what is here and why it is worth reading. */
  lede?: ReactNode;
  /** In-page filters as links. Mark the current one; it gets aria-current. */
  topics?: Array<{ label: string; href: string; current?: boolean }>;
  topicsLabel?: string;
  /** The page's one picture. Loaded eagerly: it is above the fold. */
  image?: PubImage;
  lang?: 'en' | 'ko';
  className?: string;
}

/** PostList variant 'section': news on the company homepage, the lead story with its own
 * picture, three dated headlines, and a link to the News page. */
export interface NewsSectionProps {
  /** Defaults to "News". The section's h2. */
  title?: string;
  /** The News index. */
  href?: string;
  /** Defaults to "All news". */
  allLabel?: string;
  /** The newest story, with its own picture if it has one. */
  lead?: PubStory;
  /** Three at most; a fourth is dropped. */
  items?: PubStory[];
  id?: string;
  lang?: 'en' | 'ko';
  className?: string;
}

/** The company's dated moments, oldest first: across the rail on a wide screen, down the
 * page on a phone. Years only; the last item is where the company is now. */
export interface MilestonesProps {
  /** Seven at most. Each text is one line: what happened, no adjectives. */
  items?: Array<{ year: number | string; text: string }>;
  /** Accessible name. Defaults to "Milestones". */
  label?: string;
  lang?: 'en' | 'ko';
  className?: string;
}

/** Who runs the company: name and title on hairlines, in the order given. */
export interface PeopleListProps {
  people?: Array<{
    name: string;
    title?: string;
    /** One or two sentences, optional. */
    bio?: string;
    /** A real photograph. Shown only when every person has one; never generated. */
    photo?: string;
    href?: string;
  }>;
  /** Accessible name. Defaults to "Leadership". */
  label?: string;
  lang?: 'en' | 'ko';
  className?: string;
}

/** The top of a case study: who, the claim, and the facts with the period each was
 * measured over. A figure with no period is on the ruled-out list. */
export interface StoryHeaderProps {
  customer?: string;
  sector?: string;
  logo?: any;
  /** What changed, in their terms, as a sentence. */
  claim?: string;
  /** Every fact carries the period it was measured over. */
  facts?: Array<{ label: string; value: string; period: string }>;
  className?: string;
}

/** A privacy policy, terms, a cookie policy. Numbered sections with anchors, the dates that
 * matter, a version history, and a print stylesheet - the privacy policy is the most printed
 * page on any site. One document per entity: Redrob Inc., McKinley Rice and the Indian entity
 * differ on what they must say, and one merged policy says the wrong thing in two places. */
export interface LegalDocProps {
  title?: string;
  /** Which legal entity this document is from. Required: a policy with no controller named
   * is not a policy. */
  entity: string;
  updated?: string;
  updatedLabel?: string;
  effective?: string;
  effectiveLabel?: string;
  /** What this says, in two sentences, before the clauses. */
  summary?: string;
  sections?: Array<{ id: string; title: string; body: any }>;
  contentsLabel?: string;
  /** What changed and when. A policy that changes silently has not been agreed to. */
  history?: Array<{ date: string; what: string }>;
  historyLabel?: string;
  contact?: any;
  className?: string;
}

export declare const FeatureRow: ComponentType<FeatureRowProps>;
export declare const Figure: ComponentType<FigureProps>;
export declare const LogoRow: ComponentType<LogoRowProps>;
export declare const CustomerStory: ComponentType<CustomerStoryProps>;
export declare const Form: ComponentType<FormProps>;
export declare const PriceTable: ComponentType<PriceTableProps>;
export declare const ArticleLayout: ComponentType<ArticleLayoutProps>;
export declare const PostList: ComponentType<PostListProps>;
export declare const IndexHeader: ComponentType<IndexHeaderProps>;
export declare const Milestones: ComponentType<MilestonesProps>;
export declare const PeopleList: ComponentType<PeopleListProps>;
export declare const StoryHeader: ComponentType<StoryHeaderProps>;
export declare const LegalDoc: ComponentType<LegalDocProps>;

/* ---- Playbooks, scheduling and connectors ---- */

export interface PlaybookRowProps extends Common {
  name: ReactNode;
  /** Two sentences on what Cowork does, with Cowork as the subject. */
  summary?: ReactNode;
  icon?: ReactNode;
  /** The steps; the count and the "Asks you first" line are derived from them. */
  steps?: Array<{ label?: ReactNode; approval?: boolean }>;
  /** Overrides the derived counts. */
  asks?: number;
  stepCount?: number;
  /** [figure, unit]: ['6 hours', 'back each quarter']. Sourced, or marked as an estimate. */
  impact?: [ReactNode, ReactNode?];
  highImpact?: boolean;
  owner?: string;
  href?: string;
  onClick?: (event: MouseEvent) => void;
  asksLabel?: string; straightLabel?: string; highImpactLabel?: string; ownerPrefix?: string;
}

export interface ConnectorCardProps extends Common {
  name: string;
  maker?: string;
  category?: string;
  /** The system icon for what the app is. Used until the maker approves a logo. */
  icon?: ReactNode;
  /** Only with the maker's written approval. */
  logo?: string;
  /** One sentence: what Cowork reads or does there. */
  description?: string;
  connected?: boolean;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onManage?: () => void;
  connectLabel?: string; disconnectLabel?: string; manageLabel?: string; connectedLabel?: string;
}

export interface TimePickerProps extends FieldProps {
  /** 24-hour "HH:MM". */
  value?: string;
  defaultValue?: string;
  onChange?: (value: string) => void;
  size?: 'sm' | 'md';
  /** An IANA zone. With it, the clock shows the same time in the offices below. */
  zone?: string;
  /** [IANA zone, city] pairs, or false for none. Default Seoul, Noida and New York. */
  offices?: Array<[string, string]> | false;
  /** One-tap times, or false for none. */
  presets?: string[] | false;
  /** The instant offsets are read at. Default now. */
  now?: Date;
  openLabel?: string; closeLabel?: string; dialogLabel?: string; doneLabel?: string; hourHint?: string; minuteHint?: string; howLabel?: string;
}

export interface TimeZonePickerProps extends FieldProps {
  /** An IANA zone: 'Asia/Seoul'. */
  value?: string;
  defaultValue?: string;
  onChange?: (zone: string) => void;
  /** [IANA zone, city] pairs. Default: 38 cities and UTC. */
  zones?: Array<[string, string]>;
  now?: Date;
  size?: Size;
  placeholder?: string;
  emptyText?: string;
}

export interface ScheduleValue {
  mode: 'once' | 'repeat' | 'event';
  /** ISO date, for once. */
  date?: string;
  /** ISO date a repeat starts. */
  start?: string;
  /** "HH:MM", 24-hour. */
  time?: string;
  /** IANA zone. */
  zone?: string;
  freq?: 'daily' | 'weekdays' | 'weekly' | 'monthly';
  /** Days of the week, '0' Sunday to '6' Saturday. */
  days?: string[];
  /** Day of the month, '1' to '28', or 'last'. */
  dom?: string;
}

export interface SchedulePickerProps extends Common {
  value?: Partial<ScheduleValue>;
  defaultValue?: Partial<ScheduleValue>;
  onChange?: (value: ScheduleValue) => void;
  /** Named in the summary for "On a new file": the project's name. */
  where?: string;
  now?: Date;
  zones?: Array<[string, string]>;
  offices?: Array<[string, string]> | false;
  locale?: string;
  weekStart?: number;
  /** [mode, label] triples in order. */
  modes?: Array<[ScheduleValue['mode'], string]>;
  /** The line under the summary, or false for none. */
  note?: ReactNode | false;
  label?: string; dateLabel?: string; repeatLabel?: string; dayOfMonthLabel?: string; timeLabel?: string; zoneLabel?: string; startLabel?: string;
}

export interface AppAccessApp {
  id: string;
  name: string;
  category?: string;
  maker?: string;
  description?: string;
  icon?: ReactNode;
  logo?: string;
  connected?: boolean;
}

export interface AppAccessProps extends Common {
  /** Every app that can be added. No limit by type. */
  apps: AppAccessApp[];
  /** The apps this playbook reaches, each 'read' or 'write'. */
  value?: Array<{ id: string; mode: 'read' | 'write' }>;
  defaultValue?: Array<{ id: string; mode: 'read' | 'write' }>;
  onChange?: (value: Array<{ id: string; mode: 'read' | 'write' }>) => void;
  /** Called for an app added or connected from here. */
  onConnect?: (id: string) => void;
  /** Leave undefined to hide the memory row. */
  memory?: boolean;
  onMemoryChange?: (on: boolean) => void;
  accessLabels?: { read: string; write: string };
  summary?: (reads: number, writes: number) => string;
  label?: string; addLabel?: string; dialogTitle?: string; filesLabel?: string; filesNote?: string; memoryLabel?: string; memoryOnNote?: string; memoryOffNote?: string;
  note?: string; startNote?: string; searchLabel?: string; searchPlaceholder?: string; emptyText?: string; connectedLabel?: string; connectsLabel?: string; notConnectedLabel?: string;
}

export declare const PlaybookRow: ComponentType<PlaybookRowProps>;
export declare const ConnectorCard: ComponentType<ConnectorCardProps>;
export declare const TimePicker: ComponentType<TimePickerProps>;
export declare const TimeZonePicker: ComponentType<TimeZonePickerProps>;
export declare const SchedulePicker: ComponentType<SchedulePickerProps>;
export declare const AppAccess: ComponentType<AppAccessProps>;
