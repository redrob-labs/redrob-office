import type { ButtonHTMLAttributes, ReactNode } from "react";
import { useState } from "react";

type IconProps = { className?: string };

const iconStroke = {
  fill: "none" as const,
  stroke: "currentColor",
  strokeWidth: 2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
};

export function WorkIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M3.5 6.5l2 2 3.5-3.5" />
      <path d="M3.5 13l2 2 3.5-3.5" />
      <path d="M3.5 19.5h3" />
      <path d="M12.5 6.5H21M12.5 13H21M12.5 19.5H21" />
    </svg>
  );
}

export function ChatIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H7l-4 3V11.5A8.5 8.5 0 1 1 21 11.5z" />
    </svg>
  );
}

export function FlowsIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <circle cx="6" cy="6" r="2.5" />
      <circle cx="18" cy="6" r="2.5" />
      <circle cx="12" cy="18" r="2.5" />
      <path d="M8.2 7.5L10.5 15M15.8 7.5L13.5 15" />
    </svg>
  );
}

export function ExternalLinkIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M14 3h7v7" />
      <path d="M10 14L21 3" />
      <path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5" />
    </svg>
  );
}

export function WorkflowGalleryIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <path d="M17.5 14v7M14 17.5h7" />
    </svg>
  );
}

export function ArtifactsIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V9l-6-6z" />
      <path d="M14 3v6h6" />
    </svg>
  );
}

export function ReviewIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M9 11l3 3L22 4" />
      <path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
    </svg>
  );
}

export function DocumentsIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M8 3h6l4 4v12a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" />
      <path d="M14 3v4h4" />
      <path d="M9.5 12.5h5M9.5 16h3" />
    </svg>
  );
}

export function OfficeIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M3 21h18" />
      <path d="M5 21V5a2 2 0 0 1 2-2h6a2 2 0 0 1 2 2v16" />
      <path d="M15 21V10h3a2 2 0 0 1 2 2v9" />
      <path d="M8.5 7h3M8.5 11h3M8.5 15h3" />
    </svg>
  );
}

export function ChevronDownIcon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      {...iconStroke}
      strokeWidth={2.25}
      aria-hidden="true"
    >
      <path d="m6 9 6 6 6-6" />
    </svg>
  );
}

export function CheckIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M5 12.5l4.5 4.5L19 7.5" />
    </svg>
  );
}

export function DeviceIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <rect x="2" y="3" width="20" height="14" rx="2" />
      <path d="M8 21h8" />
      <path d="M12 17v4" />
    </svg>
  );
}

/** @deprecated Prefer DeviceIcon */
export const StatusIcon = DeviceIcon;

export function SettingsIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

export function KeyboardIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <rect x="2" y="6" width="20" height="12" rx="2" />
      <path d="M6 10h.01M10 10h.01M14 10h.01M18 10h.01M6 14h.01M10 14h4M18 14h.01" />
    </svg>
  );
}

export function PanelLeftCloseIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="M14 9l-3 3 3 3" />
    </svg>
  );
}

export function PanelLeftOpenIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="M9 4v16" />
      <path d="M12 9l3 3-3 3" />
    </svg>
  );
}

/** The composer's send affordance. Shared so both chat boxes draw one button. */
/** Formatting toolbar. Letterforms, so they read at 14px without labels. */
export function BoldIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M7 5h6.5a3.5 3.5 0 0 1 0 7H7z" />
      <path d="M7 12h7.5a3.5 3.5 0 0 1 0 7H7z" />
    </svg>
  );
}

export function ItalicIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M15 5h-5M14 19H9M14 5 10 19" />
    </svg>
  );
}

export function StrikethroughIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M4 12h16" />
      <path d="M17 7a4 4 0 0 0-4-2h-2a3.5 3.5 0 0 0-1 6.8" />
      <path d="M7 17a4 4 0 0 0 4 2h2a3.5 3.5 0 0 0 1.2-6.8" />
    </svg>
  );
}

export function LinkIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M10.5 13.5a4 4 0 0 0 5.7 0l2.8-2.8a4 4 0 0 0-5.7-5.7l-1.5 1.5" />
      <path d="M13.5 10.5a4 4 0 0 0-5.7 0L5 13.3a4 4 0 0 0 5.7 5.7l1.5-1.5" />
    </svg>
  );
}

export function CodeIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="m9 8-4 4 4 4M15 8l4 4-4 4" />
    </svg>
  );
}

export function CodeBlockIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <rect x="3" y="4" width="18" height="16" rx="2" />
      <path d="m9.5 10-2 2 2 2M14.5 10l2 2-2 2" />
    </svg>
  );
}

export function QuoteIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M4 5v14" />
      <path d="M9 8h11M9 12h11M9 16h7" />
    </svg>
  );
}

export function BulletListIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M9 6h11M9 12h11M9 18h11" />
      <path d="M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
    </svg>
  );
}

export function OrderedListIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M10 6h10M10 12h10M10 18h10" />
      <path d="M4 5.5h1V9M4 9h2" />
      <path d="M4 15h2v1.5H4.5V18H6" />
    </svg>
  );
}

/** Toggles the formatting toolbar, exactly as Slack's `Aa` does. */
export function PaperclipIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M20 11.5 12.4 19a4.6 4.6 0 0 1-6.5-6.5l7.6-7.6a3 3 0 0 1 4.3 4.3l-7.6 7.6a1.5 1.5 0 0 1-2.1-2.1l6.9-6.9" />
    </svg>
  );
}

export function GlobeIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M3 12h18" />
      <path d="M12 3a15 15 0 0 1 0 18a15 15 0 0 1 0-18" />
    </svg>
  );
}

export function MicIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M5 11a7 7 0 0 0 14 0" />
      <path d="M12 18v3" />
    </svg>
  );
}

export function SendIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M5 12h14" />
      <path d="M12 5l7 7-7 7" />
    </svg>
  );
}

export function PlusIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function SearchIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <circle cx="11" cy="11" r="7" />
      <path d="M20 20l-3.5-3.5" />
    </svg>
  );
}

export function HashIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M9.5 3.5L7.5 20.5M16.5 3.5l-2 17M4 9h15.5M3.5 15h15.5" />
    </svg>
  );
}

export function UsersIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <circle cx="9" cy="8" r="3.5" />
      <path d="M2.5 20a6.5 6.5 0 0 1 13 0" />
      <path d="M16 5.2a3.5 3.5 0 0 1 0 6.6" />
      <path d="M18 14.4a6.5 6.5 0 0 1 3.5 5.6" />
    </svg>
  );
}

export function MeetingIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M15.5 3.5H5A2.5 2.5 0 0 0 2.5 6v5.5A2.5 2.5 0 0 0 5 14v3l3.5-3H15.5A2.5 2.5 0 0 0 18 11.5V6a2.5 2.5 0 0 0-2.5-2.5z" />
      <path d="M18.5 8H19a2.5 2.5 0 0 1 2.5 2.5V16a2.5 2.5 0 0 1-2.5 2.5v3L15.5 18.5H12" />
    </svg>
  );
}

export function BellIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M18 8.5a6 6 0 1 0-12 0c0 4.5-2 5.5-2 7.5h16c0-2-2-3-2-7.5z" />
      <path d="M9.5 19.5a2.5 2.5 0 0 0 5 0" />
    </svg>
  );
}

export function ChartIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M3.5 20.5h17" />
      <path d="M7 20.5v-7M12 20.5V6M17 20.5v-10" />
    </svg>
  );
}

export function MoreVerticalIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <circle cx="12" cy="5" r="1.9" />
      <circle cx="12" cy="12" r="1.9" />
      <circle cx="12" cy="19" r="1.9" />
    </svg>
  );
}

export function PinIcon({
  className,
  filled = false,
}: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      {...iconStroke}
      fill={filled ? "currentColor" : "none"}
      aria-hidden="true"
    >
      <path d="M15 3l6 6-3 1-4.5 4.5L13 19l-8-8 4.5-.5L14 6z" />
      <path d="M9 15l-4 6" />
    </svg>
  );
}

export function StarIcon({
  className,
  filled = false,
}: IconProps & { filled?: boolean }): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      {...iconStroke}
      fill={filled ? "currentColor" : "none"}
      aria-hidden="true"
    >
      <path d="M12 3l2.9 5.9 6.5.9-4.7 4.6 1.1 6.5L12 18.8 6.2 21.9l1.1-6.5L2.6 9.8l6.5-.9z" />
    </svg>
  );
}

export function PencilIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M4 20h4l10-10-4-4L4 16z" />
      <path d="M13.5 6.5l4 4" />
    </svg>
  );
}

export function RefreshIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M21 12a9 9 0 0 0-15.5-6.4" />
      <path d="M3 4v5h5" />
      <path d="M3 12a9 9 0 0 0 15.5 6.4" />
      <path d="M21 20v-5h-5" />
    </svg>
  );
}

export function XIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

export function TrashIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M4 7h16" />
      <path d="M10 4h4" />
      <path d="M6 7l1 13h10l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

/** Filled, because stopping is one press and not a shape to be read. */
export function StopIcon({ className }: IconProps): JSX.Element {
  return (
    <svg
      className={className}
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <rect x="6" y="6" width="12" height="12" rx="2" />
    </svg>
  );
}

type HeaderIconButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
  /**
   * Tooltip placement relative to the button. Use `bottom-end` for buttons at
   * the right edge of a pane: a centred tooltip there is wider than the button
   * and pushes the pane into a horizontal scrollbar.
   */
  side?: "bottom" | "bottom-end" | "right";
  children: ReactNode;
};

export function HeaderIconButton({
  label,
  active = false,
  side = "bottom",
  children,
  className = "",
  onClick,
  onPointerDown,
  onBlur,
  ...props
}: HeaderIconButtonProps): JSX.Element {
  const [tipVisible, setTipVisible] = useState(false);
  const tooltipClass =
    side === "right"
      ? "left-[calc(100%+8px)] top-1/2 -translate-y-1/2"
      : side === "bottom-end"
        ? "right-0 top-[calc(100%+6px)]"
        : "left-1/2 top-[calc(100%+6px)] -translate-x-1/2";

  return (
    <span
      className="relative"
      onMouseEnter={() => setTipVisible(true)}
      onMouseLeave={() => setTipVisible(false)}
    >
      <button
        type="button"
        aria-label={label}
        className={`flex items-center justify-center rounded p-2.5 transition-colors ${
          active
            ? "bg-gray-900 text-white"
            : "text-gray-700 hover:bg-gray-100 hover:text-gray-900"
        } ${className}`}
        onPointerDown={(event) => {
          setTipVisible(false);
          onPointerDown?.(event);
        }}
        onClick={(event) => {
          setTipVisible(false);
          onClick?.(event);
        }}
        onBlur={(event) => {
          setTipVisible(false);
          onBlur?.(event);
        }}
        {...props}
      >
        {children}
      </button>
      <span
        role="tooltip"
        className={`pointer-events-none absolute z-50 whitespace-nowrap rounded bg-gray-900 px-2 py-1 text-xs font-medium text-white shadow-sm transition-opacity delay-75 ${
          tipVisible ? "opacity-100" : "opacity-0"
        } ${tooltipClass}`}
      >
        {label}
      </span>
    </span>
  );
}

export function SunIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </svg>
  );
}

export function MoonIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
    </svg>
  );
}

export function SparklesIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" {...iconStroke} aria-hidden="true">
      <path d="M12 2L14.5 8.5L21 11L14.5 13.5L12 20L9.5 13.5L3 11L9.5 8.5L12 2Z" />
      <path d="M19 16L20 19L23 20L20 21L19 24L18 21L15 20L18 19L19 16Z" />
    </svg>
  );
}

export function PostgresLogoIcon({ className }: IconProps): JSX.Element {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <path d="M23.5594 14.7228a.5269.5269 0 0 0-.0563-.1191c-.139-.2632-.4768-.3418-1.0074-.2321-1.6533.3411-2.2935.1312-2.5256-.0191 1.342-2.0482 2.445-4.522 3.0411-6.8297.2714-1.0507.7982-3.5237.1222-4.7316a1.5641 1.5641 0 0 0-.1509-.235C21.6931.9086 19.8007.0248 17.5099.0005c-1.4947-.0158-2.7705.3461-3.1161.4794a9.449 9.449 0 0 0-.5159-.0816 8.044 8.044 0 0 0-1.3114-.1278c-1.1822-.0184-2.2038.2642-3.0498.8406-.8573-.3211-4.7888-1.645-7.2219.0788C.9359 2.1526.3086 3.8733.4302 6.3043c.0409.818.5069 3.334 1.2423 5.7436.4598 1.5065.9387 2.7019 1.4334 3.582.553.9942 1.1259 1.5933 1.7143 1.7895.4474.1491 1.1327.1441 1.8581-.7279.8012-.9635 1.5903-1.8258 1.9446-2.2069.4351.2355.9064.3625 1.39.3772a.0569.0569 0 0 0 .0004.0041 11.0312 11.0312 0 0 0-.2472.3054c-.3389.4302-.4094.5197-1.5002.7443-.3102.064-1.1344.2339-1.1464.8115-.0025.1224.0329.2309.0919.3268.2269.4231.9216.6097 1.015.6331 1.3345.3335 2.5044.092 3.3714-.6787-.017 2.231.0775 4.4174.3454 5.0874.2212.5529.7618 1.9045 2.4692 1.9043.2505 0 .5263-.0291.8296-.0941 1.7819-.3821 2.5557-1.1696 2.855-2.9059.1503-.8707.4016-2.8753.5388-4.1012.0169-.0703.0357-.1207.057-.1362.0007-.0005.0697-.0471.4272.0307a.3673.3673 0 0 0 .0443.0068l.2539.0223.0149.001c.8468.0384 1.9114-.1426 2.5312-.4308.6438-.2988 1.8057-1.0323 1.5951-1.6698zM2.371 11.8765c-.7435-2.4358-1.1779-4.8851-1.2123-5.5719-.1086-2.1714.4171-3.6829 1.5623-4.4927 1.8367-1.2986 4.8398-.5408 6.108-.13-.0032.0032-.0066.0061-.0098.0094-2.0238 2.044-1.9758 5.536-1.9708 5.7495-.0002.0823.0066.1989.0162.3593.0348.5873.0996 1.6804-.0735 2.9184-.1609 1.1504.1937 2.2764.9728 3.0892.0806.0841.1648.1631.2518.2374-.3468.3714-1.1004 1.1926-1.9025 2.1576-.5677.6825-.9597.5517-1.0886.5087-.3919-.1307-.813-.5871-1.2381-1.3223-.4796-.839-.9635-2.0317-1.4155-3.5126zm6.0072 5.0871c-.1711-.0428-.3271-.1132-.4322-.1772.0889-.0394.2374-.0902.4833-.1409 1.2833-.2641 1.4815-.4506 1.9143-1.0002.0992-.126.2116-.2687.3673-.4426a.3549.3549 0 0 0 .0737-.1298c.1708-.1513.2724-.1099.4369-.0417.156.0646.3078.26.3695.4752.0291.1016.0619.2945-.0452.4444-.9043 1.2658-2.2216 1.2494-3.1676 1.0128zm2.094-3.988-.0525.141c-.133.3566-.2567.6881-.3334 1.003-.6674-.0021-1.3168-.2872-1.8105-.8024-.6279-.6551-.9131-1.5664-.7825-2.5004.1828-1.3079.1153-2.4468.079-3.0586-.005-.0857-.0095-.1607-.0122-.2199.2957-.2621 1.6659-.9962 2.6429-.7724.4459.1022.7176.4057.8305.928.5846 2.7038.0774 3.8307-.3302 4.7363-.084.1866-.1633.3629-.2311.5454zm7.3637 4.5725c-.0169.1768-.0358.376-.0618.5959l-.146.4383a.3547.3547 0 0 0-.0182.1077c-.0059.4747-.054.6489-.115.8693-.0634.2292-.1353.4891-.1794 1.0575-.11 1.4143-.8782 2.2267-2.4172 2.5565-1.5155.3251-1.7843-.4968-2.0212-1.2217a6.5824 6.5824 0 0 0-.0769-.2266c-.2154-.5858-.1911-1.4119-.1574-2.5551.0165-.5612-.0249-1.9013-.3302-2.6462.0044-.2932.0106-.5909.019-.8918a.3529.3529 0 0 0-.0153-.1126 1.4927 1.4927 0 0 0-.0439-.208c-.1226-.4283-.4213-.7866-.7797-.9351-.1424-.059-.4038-.1672-.7178-.0869.067-.276.1831-.5875.309-.9249l.0529-.142c.0595-.16.134-.3257.213-.5012.4265-.9476 1.0106-2.2453.3766-5.1772-.2374-1.0981-1.0304-1.6343-2.2324-1.5098-.7207.0746-1.3799.3654-1.7088.5321a5.6716 5.6716 0 0 0-.1958.1041c.0918-1.1064.4386-3.1741 1.7357-4.4823a4.0306 4.0306 0 0 1 .3033-.276.3532.3532 0 0 0 .1447-.0644c.7524-.5706 1.6945-.8506 2.802-.8325.4091.0067.8017.0339 1.1742.081 1.939.3544 3.2439 1.4468 4.0359 2.3827.8143.9623 1.2552 1.9315 1.4312 2.4543-1.3232-.1346-2.2234.1268-2.6797.779-.9926 1.4189.543 4.1729 1.2811 5.4964.1353.2426.2522.4522.2889.5413.2403.5825.5515.9713.7787 1.2552.0696.087.1372.1714.1885.245-.4008.1155-1.1208.3825-1.0552 1.717-.0123.1563-.0423.4469-.0834.8148-.0461.2077-.0702.4603-.0994.7662zm.8905-1.6211c-.0405-.8316.2691-.9185.5967-1.0105a2.8566 2.8566 0 0 0 .135-.0406 1.202 1.202 0 0 0 .1342.103c.5703.3765 1.5823.4213 3.0068.1344-.2016.1769-.5189.3994-.9533.6011-.4098.1903-1.0957.333-1.7473.3636-.7197.0336-1.0859-.0807-1.1721-.151zm.5695-9.2712c-.0059.3508-.0542.6692-.1054 1.0017-.055.3576-.112.7274-.1264 1.1762-.0142.4368.0404.8909.0932 1.3301.1066.887.216 1.8003-.2075 2.7014a3.5272 3.5272 0 0 1-.1876-.3856c-.0527-.1276-.1669-.3326-.3251-.6162-.6156-1.1041-2.0574-3.6896-1.3193-4.7446.3795-.5427 1.3408-.5661 2.1781-.463zm.2284 7.0137a12.3762 12.3762 0 0 0-.0853-.1074l-.0355-.0444c.7262-1.1995.5842-2.3862.4578-3.4385-.0519-.4318-.1009-.8396-.0885-1.2226.0129-.4061.0666-.7543.1185-1.0911.0639-.415.1288-.8443.1109-1.3505.0134-.0531.0188-.1158.0118-.1902-.0457-.4855-.5999-1.938-1.7294-3.253-.6076-.7073-1.4896-1.4972-2.6889-2.0395.5251-.1066 1.2328-.2035 2.0244-.1859 2.0515.0456 3.6746.8135 4.8242 2.2824a.908.908 0 0 1 .0667.1002c.7231 1.3556-.2762 6.2751-2.9867 10.5405zm-8.8166-6.1162c-.025.1794-.3089.4225-.6211.4225a.5821.5821 0 0 1-.0809-.0056c-.1873-.026-.3765-.144-.5059-.3156-.0458-.0605-.1203-.178-.1055-.2844.0055-.0401.0261-.0985.0925-.1488.1182-.0894.3518-.1226.6096-.0867.3163.0441.6426.1938.6113.4186zm7.9305-.4114c.0111.0792-.049.201-.1531.3102-.0683.0717-.212.1961-.4079.2232a.5456.5456 0 0 1-.075.0052c-.2935 0-.5414-.2344-.5607-.3717-.024-.1765.2641-.3106.5611-.352.297-.0414.6111.0088.6356.1851z" />
    </svg>
  );
}


