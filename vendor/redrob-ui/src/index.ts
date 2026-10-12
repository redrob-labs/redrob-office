/**
 * Redrob design system - React components.
 *
 * Built on the Redrob Group Design System 2026. Every component here is held to the system's own
 * reference bundle by `tools/parity/run.js`, which renders both against the delivery's preview cases
 * and compares the markup, so "looks right" is never the standard.
 *
 * Components are exported in the system's own order: the base, then the controls a person touches,
 * then what shows data, then the frames, then the product's surfaces, then the public site.
 */

export { icons, iconNames, svg } from './icons';
export type { IconName, IconProps, IconComponent } from './icons';

/* ---- Foundations --------------------------------------------------------- */
export { Mark } from './components/Mark/Mark';
export type { MarkProps } from './components/Mark/Mark';
export { MarkReveal } from './components/MarkReveal/MarkReveal';
export type { MarkRevealProps } from './components/MarkReveal/MarkReveal';
export { Layer, LayerContext, LAYER_MEANS } from './components/Layer/Layer';
export type { LayerProps } from './components/Layer/Layer';
export { Illustration } from './components/Illustration/Illustration';
export type { IllustrationProps } from './components/Illustration/Illustration';
export { Diagram } from './components/Diagram/Diagram';
export type { DiagramProps, DiagramStep, DiagramActor } from './components/Diagram/Diagram';
export { illustrations, illustrationNames, CONSTRUCTIONS, RAKE } from './internal/illustrations';

/* ---- Voice --------------------------------------------------------------- */
export { Display } from './components/Display/Display';
export type { DisplayProps } from './components/Display/Display';
export { Statement } from './components/Statement/Statement';
export type { StatementProps } from './components/Statement/Statement';
export { Quote } from './components/Quote/Quote';
export type { QuoteProps } from './components/Quote/Quote';
export { SectionMark } from './components/SectionMark/SectionMark';
export type { SectionMarkProps } from './components/SectionMark/SectionMark';

/* ---- Actions ------------------------------------------------------------- */
export { Button } from './components/Button/Button';
export type { ButtonProps } from './components/Button/Button';
export { IconButton } from './components/IconButton/IconButton';
export type { IconButtonProps } from './components/IconButton/IconButton';
export { Menu } from './components/Menu/Menu';
export type { MenuProps, MenuItem } from './components/Menu/Menu';

/* ---- Forms --------------------------------------------------------------- */
export { Form } from './components/Form/Form';
export type { FormProps, FormError } from './components/Form/Form';
export { Input } from './components/Input/Input';
export type { InputProps } from './components/Input/Input';
export { Textarea } from './components/Textarea/Textarea';
export type { TextareaProps } from './components/Textarea/Textarea';
export { Select } from './components/Select/Select';
export type { SelectProps, SelectOption } from './components/Select/Select';
export { Combobox } from './components/Combobox/Combobox';
export type { ComboboxProps, ComboboxOption } from './components/Combobox/Combobox';
export { Checkbox } from './components/Checkbox/Checkbox';
export type { CheckboxProps } from './components/Checkbox/Checkbox';
export { Radio } from './components/Radio/Radio';
export type { RadioProps } from './components/Radio/Radio';
export { Switch } from './components/Switch/Switch';
export type { SwitchProps } from './components/Switch/Switch';
export { DatePicker } from './components/DatePicker/DatePicker';
export type { DatePickerProps } from './components/DatePicker/DatePicker';
export { TimePicker } from './components/TimePicker/TimePicker';
export type { TimePickerProps } from './components/TimePicker/TimePicker';
export { TimeZonePicker } from './components/TimeZonePicker/TimeZonePicker';
export type { TimeZonePickerProps } from './components/TimeZonePicker/TimeZonePicker';
export { FileUpload } from './components/FileUpload/FileUpload';
export type { FileUploadProps, UploadedFile } from './components/FileUpload/FileUpload';

/* ---- Borders ------------------------------------------------------------- */
export { NameInput } from './components/NameInput/NameInput';
export type { NameInputProps, NameValue } from './components/NameInput/NameInput';
export { AddressInput } from './components/AddressInput/AddressInput';
export type { AddressInputProps, AddressValue } from './components/AddressInput/AddressInput';
export { PhoneInput } from './components/PhoneInput/PhoneInput';
export type { PhoneInputProps, PhoneValue } from './components/PhoneInput/PhoneInput';
export { DateInput } from './components/DateInput/DateInput';
export type { DateInputProps, DateInputValue } from './components/DateInput/DateInput';
export { Money } from './components/Money/Money';
export type { MoneyProps } from './components/Money/Money';
export { ConvertedAmount } from './components/ConvertedAmount/ConvertedAmount';
export type { ConvertedAmountProps } from './components/ConvertedAmount/ConvertedAmount';
export { Timestamp } from './components/Timestamp/Timestamp';
export type { TimestampProps } from './components/Timestamp/Timestamp';
/** Exported because a consumer validating its own date form needs the same answer DateInput uses. */
export { dateParts, toE164, tidyPostal } from './internal/borders';

/* ---- Navigation ---------------------------------------------------------- */
export { Tabs } from './components/Tabs/Tabs';
export type { TabsProps, TabItem } from './components/Tabs/Tabs';
export { Breadcrumb } from './components/Breadcrumb/Breadcrumb';
export type { BreadcrumbProps, BreadcrumbItem } from './components/Breadcrumb/Breadcrumb';
export { Pagination, pageList } from './components/Pagination/Pagination';
export type { PaginationProps } from './components/Pagination/Pagination';
export { Stepper } from './components/Stepper/Stepper';
export type { StepperProps, StepperStep } from './components/Stepper/Stepper';
export { Accordion } from './components/Accordion/Accordion';
export type { AccordionProps, AccordionItem } from './components/Accordion/Accordion';
export { Scroller } from './components/Scroller/Scroller';
export type { ScrollerProps } from './components/Scroller/Scroller';

/* ---- Feedback ------------------------------------------------------------ */
export { Alert } from './components/Alert/Alert';
export type { AlertProps } from './components/Alert/Alert';
export { Toast } from './components/Toast/Toast';
export type { ToastProps } from './components/Toast/Toast';
export { Modal } from './components/Modal/Modal';
export type { ModalProps } from './components/Modal/Modal';
export { Drawer } from './components/Drawer/Drawer';
export type { DrawerProps } from './components/Drawer/Drawer';
export { Tooltip } from './components/Tooltip/Tooltip';
export type { TooltipProps } from './components/Tooltip/Tooltip';
export { Progress } from './components/Progress/Progress';
export type { ProgressProps } from './components/Progress/Progress';
export { Loader } from './components/Loader/Loader';
export type { LoaderProps } from './components/Loader/Loader';
export { Skeleton } from './components/Skeleton/Skeleton';
export type { SkeletonProps } from './components/Skeleton/Skeleton';
export { EmptyState } from './components/EmptyState/EmptyState';
export type { EmptyStateProps } from './components/EmptyState/EmptyState';

/* ---- Data display -------------------------------------------------------- */
export { Card } from './components/Card/Card';
export type { CardProps } from './components/Card/Card';
export { Table } from './components/Table/Table';
export type { TableProps, TableColumn } from './components/Table/Table';
export { Stat } from './components/Stat/Stat';
export type { StatProps } from './components/Stat/Stat';
export { Chart } from './components/Chart/Chart';
export type { ChartProps, ChartSeries } from './components/Chart/Chart';
export { Sparkline } from './components/Sparkline/Sparkline';
export type { SparklineProps } from './components/Sparkline/Sparkline';
export { Badge } from './components/Badge/Badge';
export type { BadgeProps } from './components/Badge/Badge';
export { Avatar } from './components/Avatar/Avatar';
export type { AvatarProps } from './components/Avatar/Avatar';
export { AvatarMark } from './components/AvatarMark/AvatarMark';
export type { AvatarMarkProps } from './components/AvatarMark/AvatarMark';
export { seriesColor, niceMax, SERIES_LIGHT, SERIES_DARK } from './internal/chart';

/* ---- Insights ------------------------------------------------------------ */
/* Beyond the delivery: the analytics marks for AI-adoption views (Console Insights). */
export { MixBar } from './components/MixBar/MixBar';
export type { MixBarProps } from './components/MixBar/MixBar';
export { MixColumns } from './components/MixColumns/MixColumns';
export type { MixColumnsProps } from './components/MixColumns/MixColumns';
export { MixKey } from './components/MixKey/MixKey';
export type { MixKeyProps } from './components/MixKey/MixKey';
export { BulletBar } from './components/BulletBar/BulletBar';
export type { BulletBarProps } from './components/BulletBar/BulletBar';
export { BarList } from './components/BarList/BarList';
export type { BarListProps, BarListRow } from './components/BarList/BarList';
export { CompareBar } from './components/CompareBar/CompareBar';
export type { CompareBarProps } from './components/CompareBar/CompareBar';
export { Histogram } from './components/Histogram/Histogram';
export type { HistogramProps } from './components/Histogram/Histogram';
export { HeatCell } from './components/HeatCell/HeatCell';
export type { HeatCellProps } from './components/HeatCell/HeatCell';
export { Delta } from './components/Delta/Delta';
export type { DeltaProps } from './components/Delta/Delta';
export { PrivacyFloor } from './components/PrivacyFloor/PrivacyFloor';
export type { PrivacyFloorProps } from './components/PrivacyFloor/PrivacyFloor';
export { heatBand } from './internal/insight';
export type { HeatBand, MixStep } from './internal/insight';

/* ---- Agent chat ---------------------------------------------------------- */
export { Message } from './components/Message/Message';
export type { MessageProps } from './components/Message/Message';
export { Composer } from './components/Composer/Composer';
export type { ComposerProps } from './components/Composer/Composer';
export { ComposerMode } from './components/ComposerMode/ComposerMode';
export type { ComposerModeProps, ComposerModeOption } from './components/ComposerMode/ComposerMode';
export { ModelPicker } from './components/ModelPicker/ModelPicker';
export type {
  ModelPickerProps,
  ModelPick,
  ModelTask,
  ModelProfession,
} from './components/ModelPicker/ModelPicker';
export { ModelGuide } from './components/ModelGuide/ModelGuide';
export type {
  ModelGuideProps,
  GuidePick,
  GuideKind,
  GuideStep,
  GuideSource,
  GuideTool,
  GuideTask,
  GuideProfession,
} from './components/ModelGuide/ModelGuide';
export type { Effort, EffortLevel, EffortNoteContext } from './internal/model';
export type { GlanceLabels, GuideMapLabels } from './internal/guide-glance';
export type { GuideSampleLabels, GuideScorecard, GuideTaskCard, GuideVerdict } from './internal/guide-sample';
export { ComposerStatus } from './components/ComposerStatus/ComposerStatus';
export type { ComposerStatusProps, ComposerStatusItem } from './components/ComposerStatus/ComposerStatus';
export { AnswerReceipt } from './components/AnswerReceipt/AnswerReceipt';
export type { AnswerReceiptProps, AnswerReceiptItem } from './components/AnswerReceipt/AnswerReceipt';
export { PrivateText } from './components/PrivateText/PrivateText';
export type { PrivateTextProps } from './components/PrivateText/PrivateText';
export { Opinion } from './components/Opinion/Opinion';
export type { OpinionProps } from './components/Opinion/Opinion';
export { ThreadNote } from './components/ThreadNote/ThreadNote';
export type { ThreadNoteProps } from './components/ThreadNote/ThreadNote';
export { Disputed } from './components/Disputed/Disputed';
export type { DisputedProps, DisputedView } from './components/Disputed/Disputed';
export { OpinionAdded } from './components/OpinionAdded/OpinionAdded';
export type { OpinionAddedProps } from './components/OpinionAdded/OpinionAdded';
export { ModelSwitch } from './components/ModelSwitch/ModelSwitch';
export type { ModelSwitchProps } from './components/ModelSwitch/ModelSwitch';
export { MemorySaved } from './components/MemorySaved/MemorySaved';
export type { MemorySavedProps } from './components/MemorySaved/MemorySaved';
export { Streaming } from './components/Streaming/Streaming';
export type { StreamingProps } from './components/Streaming/Streaming';
export { PromptSuggestions } from './components/PromptSuggestions/PromptSuggestions';
export type { PromptSuggestionsProps, PromptSuggestion } from './components/PromptSuggestions/PromptSuggestions';
export { Citation } from './components/Citation/Citation';
export type { CitationProps } from './components/Citation/Citation';
export { Confidence } from './components/Confidence/Confidence';
export type { ConfidenceProps } from './components/Confidence/Confidence';
export { AgentAction } from './components/AgentAction/AgentAction';
export type { AgentActionProps } from './components/AgentAction/AgentAction';
export { AgentTimeline } from './components/AgentTimeline/AgentTimeline';
export type { AgentTimelineProps, AgentTimelineStep } from './components/AgentTimeline/AgentTimeline';
export { ApprovalStep } from './components/ApprovalStep/ApprovalStep';
export type { ApprovalStepProps } from './components/ApprovalStep/ApprovalStep';

/* ---- Safeguards ---------------------------------------------------------- */
export { ProtectionStatus } from './components/ProtectionStatus/ProtectionStatus';
export type { ProtectionStatusProps } from './components/ProtectionStatus/ProtectionStatus';
export { StatusCard } from './components/StatusCard/StatusCard';
export type { StatusCardProps } from './components/StatusCard/StatusCard';
export { PrivacyProtection } from './components/PrivacyProtection/PrivacyProtection';
export type { PrivacyProtectionProps } from './components/PrivacyProtection/PrivacyProtection';
export { MemoryScope } from './components/MemoryScope/MemoryScope';
export type { MemoryScopeProps, MemoryScopeOption } from './components/MemoryScope/MemoryScope';
export { CrossCheckSetting } from './components/CrossCheckSetting/CrossCheckSetting';
export type {
  CrossCheckSettingProps,
  CrossCheckLevel,
  CrossCheckValue,
  CrossCheckDefinition,
} from './components/CrossCheckSetting/CrossCheckSetting';
export { SecondOpinionSetting } from './components/SecondOpinionSetting/SecondOpinionSetting';
export type {
  SecondOpinionSettingProps,
  OpinionMode,
} from './components/SecondOpinionSetting/SecondOpinionSetting';
export { MemoryList } from './components/MemoryList/MemoryList';
export type { MemoryListProps, MemoryItem } from './components/MemoryList/MemoryList';
export { OpinionGrid } from './components/OpinionGrid/OpinionGrid';
export type { OpinionGridProps, OpinionColumn, OpinionRow } from './components/OpinionGrid/OpinionGrid';
export { PlanQuestions } from './components/PlanQuestions/PlanQuestions';
export type { PlanQuestionsProps, PlanQuestion } from './components/PlanQuestions/PlanQuestions';
export { PlanDocument } from './components/PlanDocument/PlanDocument';
export type { PlanDocumentProps, PlanItem, PlanSection, PlanTodo } from './components/PlanDocument/PlanDocument';
export { FactCheckReport } from './components/FactCheckReport/FactCheckReport';
export type { FactCheckReportProps, FactClaim, FactVerdict } from './components/FactCheckReport/FactCheckReport';
export { ChallengeReport } from './components/ChallengeReport/ChallengeReport';
export type { ChallengeReportProps } from './components/ChallengeReport/ChallengeReport';
export {
  PRIVACY_LEVELS,
  OPINION_MODES,
  OPINION_VERDICTS,
  COMPOSER_MODES,
  CROSS_CHECKS,
  CROSS_CHECK_LEVELS,
} from './internal/safeguards';

/* ---- Agent harness ------------------------------------------------------- */
export { TaskStatus } from './components/TaskStatus/TaskStatus';
export type { TaskStatusProps } from './components/TaskStatus/TaskStatus';
export { AgentRoster } from './components/AgentRoster/AgentRoster';
export type { AgentRosterProps, RosterAgent } from './components/AgentRoster/AgentRoster';
export { AgentHandoff } from './components/AgentHandoff/AgentHandoff';
export type { AgentHandoffProps } from './components/AgentHandoff/AgentHandoff';
export { AccessList } from './components/AccessList/AccessList';
export type { AccessListProps } from './components/AccessList/AccessList';
export { ScopeBadge } from './components/ScopeBadge/ScopeBadge';
export type { ScopeBadgeProps, Scope } from './components/ScopeBadge/ScopeBadge';
export { Changes } from './components/Changes/Changes';
export type { ChangesProps, ChangeItem } from './components/Changes/Changes';
export { Meter } from './components/Meter/Meter';
export type { MeterProps } from './components/Meter/Meter';
export { CostMeter } from './components/CostMeter/CostMeter';
export type { CostMeterProps, CostBreakdown } from './components/CostMeter/CostMeter';
export { MemoryMeter } from './components/MemoryMeter/MemoryMeter';
export type { MemoryMeterProps, MemorySegment } from './components/MemoryMeter/MemoryMeter';
export { ScheduleRow } from './components/ScheduleRow/ScheduleRow';
export type { ScheduleRowProps } from './components/ScheduleRow/ScheduleRow';
export { Schedule } from './components/Schedule/Schedule';
export type { ScheduleProps, ScheduleLastRun } from './components/Schedule/Schedule';
export { SchedulePicker } from './components/SchedulePicker/SchedulePicker';
export type { SchedulePickerProps } from './components/SchedulePicker/SchedulePicker';
export { PlaybookRow } from './components/PlaybookRow/PlaybookRow';
export type { PlaybookRowProps, PlaybookStep } from './components/PlaybookRow/PlaybookRow';
export { AppAccess } from './components/AppAccess/AppAccess';
export type { AppAccessProps, AccessApp, AccessGrant } from './components/AppAccess/AppAccess';
export { ConnectorCard } from './components/ConnectorCard/ConnectorCard';
export type { ConnectorCardProps } from './components/ConnectorCard/ConnectorCard';
export { CheckIn } from './components/CheckIn/CheckIn';
export type { CheckInProps, CheckInOption } from './components/CheckIn/CheckIn';
export { RUN_LABEL, SCOPE_MODE, describeSchedule, nextScheduledRun } from './internal/harness';
export type { ScheduleValue } from './internal/harness';

/* ---- Evidence ------------------------------------------------------------ */
export { SourceSet } from './components/SourceSet/SourceSet';
export type { SourceSetProps, SourceItem } from './components/SourceSet/SourceSet';
export { Evidence } from './components/Evidence/Evidence';
export type { EvidenceProps } from './components/Evidence/Evidence';
export { Criteria } from './components/Criteria/Criteria';
export type { CriteriaProps, CriteriaItem } from './components/Criteria/Criteria';
export { MatchBreakdown } from './components/MatchBreakdown/MatchBreakdown';
export type { MatchBreakdownProps, MatchItem } from './components/MatchBreakdown/MatchBreakdown';
export { ReviewGrid } from './components/ReviewGrid/ReviewGrid';
export type {
  ReviewGridProps,
  ReviewColumn,
  ReviewRow,
  ReviewCellValue,
} from './components/ReviewGrid/ReviewGrid';
export { Finding } from './components/Finding/Finding';
export type { FindingProps } from './components/Finding/Finding';
export { Redline } from './components/Redline/Redline';
export type { RedlineProps, RedlinePart } from './components/Redline/Redline';
export { Playbook } from './components/Playbook/Playbook';
export type { PlaybookProps, PlaybookRunStep } from './components/Playbook/Playbook';
export { Shortlist } from './components/Shortlist/Shortlist';
export type { ShortlistProps, ShortlistItem } from './components/Shortlist/Shortlist';
export { DecisionNotice } from './components/DecisionNotice/DecisionNotice';
export type { DecisionNoticeProps } from './components/DecisionNotice/DecisionNotice';
export { MET_LABEL, WEIGHT_LABEL, SEV_LABEL, SRC_STATE } from './internal/evidence';

/* ---- Marketing ----------------------------------------------------------- */
export { Hero } from './components/Hero/Hero';
export type { HeroProps, HeroFilmSpec } from './components/Hero/Hero';
export { LogoRow } from './components/LogoRow/LogoRow';
export type { LogoRowProps, LogoRowLogo } from './components/LogoRow/LogoRow';
export { FeatureRow } from './components/FeatureRow/FeatureRow';
export type { FeatureRowProps } from './components/FeatureRow/FeatureRow';
export { Figure } from './components/Figure/Figure';
export type { FigureProps } from './components/Figure/Figure';
export { CustomerStory } from './components/CustomerStory/CustomerStory';
export type { CustomerStoryProps } from './components/CustomerStory/CustomerStory';
export { StoryHeader } from './components/StoryHeader/StoryHeader';
export type { StoryHeaderProps, StoryFact } from './components/StoryHeader/StoryHeader';
export { PriceTable } from './components/PriceTable/PriceTable';
export type { PriceTableProps, PricePlan, PriceRow } from './components/PriceTable/PriceTable';
export { NewsSection } from './components/NewsSection/NewsSection';
export type { NewsSectionProps, NewsItem } from './components/NewsSection/NewsSection';
export { Milestones } from './components/Milestones/Milestones';
export type { MilestonesProps, Milestone } from './components/Milestones/Milestones';
export { PeopleList } from './components/PeopleList/PeopleList';
export type { PeopleListProps, Person } from './components/PeopleList/PeopleList';
export { pubPicture } from './internal/pubPicture';
export type { PubImage, PubPictureOptions } from './internal/pubPicture';

/* ---- Frames -------------------------------------------------------------- */
export { AppShell } from './components/AppShell/AppShell';
export type { AppShellProps, AppShellNavItem } from './components/AppShell/AppShell';
export { PageShell } from './components/PageShell/PageShell';
export type { PageShellProps } from './components/PageShell/PageShell';
export { SiteHeader } from './components/SiteHeader/SiteHeader';
export type { SiteHeaderProps, SiteHeaderSection, SiteHeaderItem } from './components/SiteHeader/SiteHeader';
export { SiteFooter } from './components/SiteFooter/SiteFooter';
export type { SiteFooterProps, SiteFooterColumn, SiteFooterLink } from './components/SiteFooter/SiteFooter';
export { Band } from './components/Band/Band';
export type { BandProps, BandProduct } from './components/Band/Band';
export { LangSwitch } from './components/LangSwitch/LangSwitch';
export type { LangSwitchProps, LangOption } from './components/LangSwitch/LangSwitch';
export { ThemeSwitch } from './components/ThemeSwitch/ThemeSwitch';
export type { ThemeSwitchProps } from './components/ThemeSwitch/ThemeSwitch';
export { ConsentBar } from './components/ConsentBar/ConsentBar';
export type { ConsentBarProps, ConsentCategory } from './components/ConsentBar/ConsentBar';
export { applyTheme, themeTarget } from './internal/theme';
export type { ThemeMode } from './internal/theme';

/* ---- Publishing ---------------------------------------------------------- */
export { IndexHeader } from './components/IndexHeader/IndexHeader';
export type { IndexHeaderProps, IndexTopic } from './components/IndexHeader/IndexHeader';
export { PostList } from './components/PostList/PostList';
export type { PostListProps } from './components/PostList/PostList';
export { ArticleLayout } from './components/ArticleLayout/ArticleLayout';
export type {
  ArticleLayoutProps,
  ArticleTocEntry,
  ArticleTag,
} from './components/ArticleLayout/ArticleLayout';
export { LegalDoc } from './components/LegalDoc/LegalDoc';
export type { LegalDocProps, LegalSection, LegalRevision } from './components/LegalDoc/LegalDoc';
export { PubItem, pubAuthors, pubYear } from './internal/publishing';
export type { PubStory, PubAuthor, PubFinding, PubPaper, PubItemProps } from './internal/publishing';
