import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { EditorContent, useEditor, type Editor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Link from "@tiptap/extension-link";
import Mention from "@tiptap/extension-mention";
import Placeholder from "@tiptap/extension-placeholder";
import { PluginKey } from "@tiptap/pm/state";
import { useI18n } from "@redrob/ui";
import {
  BoldIcon,
  BulletListIcon,
  CodeBlockIcon,
  CodeIcon,
  ItalicIcon,
  LinkIcon,
  OrderedListIcon,
  QuoteIcon,
  SendIcon,
  StrikethroughIcon,
} from "./icons";
import { Spinner } from "./Spinner";
import { docToMarkdown, isDocEmpty, type RichNode } from "./rich-text";
import { looksLikeALink } from "./auto-link";

/**
 * The one message box, shared by every chat surface.
 *
 * What you type is what you get: bold text is bold on screen rather than
 * `**bold**`, the way Slack's composer works. The document is serialised to
 * markdown on the way out, because everything downstream — storage, the bus,
 * the renderer — speaks text.
 *
 * Docked, not floating. The composer is part of the pane it belongs to, so it
 * sits flush against the bottom edge with a rule above it instead of hovering
 * over the conversation on a drop shadow.
 */

interface ToolbarItem {
  name: string;
  Icon: (props: { className?: string }) => JSX.Element;
  labelKey: string;
  /** Starts a new group, drawn with a divider before it. */
  group?: boolean;
  run: (editor: Editor) => void;
  isActive: (editor: Editor) => boolean;
}

const TOOLBAR: ToolbarItem[] = [
  {
    name: "bold",
    Icon: BoldIcon,
    labelKey: "composer.bold",
    run: (e) => e.chain().focus().toggleBold().run(),
    isActive: (e) => e.isActive("bold"),
  },
  {
    name: "italic",
    Icon: ItalicIcon,
    labelKey: "composer.italic",
    run: (e) => e.chain().focus().toggleItalic().run(),
    isActive: (e) => e.isActive("italic"),
  },
  {
    name: "strike",
    Icon: StrikethroughIcon,
    labelKey: "composer.strike",
    run: (e) => e.chain().focus().toggleStrike().run(),
    isActive: (e) => e.isActive("strike"),
  },
  {
    name: "link",
    Icon: LinkIcon,
    labelKey: "composer.link",
    group: true,
    run: (e) => {
      const existing = String(e.getAttributes("link")["href"] ?? "");
      const href = window.prompt("https://", existing || "https://");
      if (href === null) return;
      if (!href.trim()) {
        e.chain().focus().extendMarkRange("link").unsetLink().run();
        return;
      }
      e.chain()
        .focus()
        .extendMarkRange("link")
        .setLink({ href: href.trim() })
        .run();
    },
    isActive: (e) => e.isActive("link"),
  },
  {
    name: "orderedList",
    Icon: OrderedListIcon,
    labelKey: "composer.orderedList",
    group: true,
    run: (e) => e.chain().focus().toggleOrderedList().run(),
    isActive: (e) => e.isActive("orderedList"),
  },
  {
    name: "bulletList",
    Icon: BulletListIcon,
    labelKey: "composer.bulletList",
    run: (e) => e.chain().focus().toggleBulletList().run(),
    isActive: (e) => e.isActive("bulletList"),
  },
  {
    name: "quote",
    Icon: QuoteIcon,
    labelKey: "composer.quote",
    run: (e) => e.chain().focus().toggleBlockquote().run(),
    isActive: (e) => e.isActive("blockquote"),
  },
  {
    name: "code",
    Icon: CodeIcon,
    labelKey: "composer.code",
    group: true,
    run: (e) => e.chain().focus().toggleCode().run(),
    isActive: (e) => e.isActive("code"),
  },
  {
    name: "codeBlock",
    Icon: CodeBlockIcon,
    labelKey: "composer.codeBlock",
    run: (e) => e.chain().focus().toggleCodeBlock().run(),
    isActive: (e) => e.isActive("codeBlock"),
  },
];

/** Someone who can be named with `@`. The id is what the office routes on. */
export interface MentionItem {
  id: string;
  label: string;
  /** One line under the name: what they do, or what they are doing. */
  hint?: string;
}

interface SuggestionState {
  items: MentionItem[];
  index: number;
  /** Insert the chosen one and close the query. Owned by the plugin. */
  command: (item: { id: string; label: string }) => void;
  /** Where the `@` is, in viewport coordinates. */
  rect: DOMRect | null;
}

/**
 * The files on a drop or a paste, if there are any.
 *
 * A clipboard carries several representations of the same thing at once: copying
 * a picture out of a browser puts an image file *and* the HTML that held it on
 * there. The file is the one worth having, and reading `files` rather than
 * walking `items` keeps ordinary text pastes out of this entirely.
 */
function filesFrom(source: DataTransfer | null): File[] {
  if (!source) return [];
  return [...(source.files ?? [])].filter((file) => file.size > 0);
}

/**
 * Whether a drag in progress is carrying files.
 *
 * `files` is deliberately empty until the drop, so a browser cannot be made to
 * read the disk by hovering. Asking it mid-drag says no every time, which is
 * what stops the drop from being allowed at all: the announced types are the
 * only thing there is to go on.
 */
function draggingFiles(source: DataTransfer | null): boolean {
  return [...(source?.types ?? [])].includes("Files");
}

function matches(items: MentionItem[], query: string): MentionItem[] {
  const needle = query.trim().toLowerCase();
  if (!needle) return items;
  return items.filter(
    (item) =>
      item.id.toLowerCase().includes(needle) ||
      item.label.toLowerCase().includes(needle),
  );
}

export interface ComposerHandle {
  focus: () => void;
  clear: () => void;
  /** Puts plain text in, replacing whatever was there. */
  setText: (text: string) => void;
  getMarkdown: () => string;
}

export interface ComposerProps {
  placeholder: string;
  /** Receives the message as markdown. Clearing is the caller's decision. */
  onSubmit: (markdown: string) => void;
  /** Blocks typing. Voice capture uses this. */
  readOnly?: boolean;
  /** Greys the send button and the toolbar without blocking the field. */
  busy?: boolean;
  /** Overrides the emptiness check, for surfaces that can send without text. */
  canSend?: boolean;
  sendLabel: string;
  /** Buttons before the formatting toggle: attach, web, and so on. */
  leading?: ReactNode;
  /** Controls between the actions and send, such as the model picker. */
  trailing?: ReactNode;
  /** Attachment chips, a waveform: anything that belongs above the field. */
  above?: ReactNode;
  /** One line under the box. */
  hint?: ReactNode;
  /** Highlights the frame, for voice capture. */
  active?: boolean;
  onEmptyChange?: (empty: boolean) => void;
  /** Who `@` can name. Left out, `@` is ordinary text. */
  mentions?: MentionItem[];
  /**
   * Flows `/` can invoke, as a slash palette (OpenWork-style). Picking one drops
   * a chip that serialises to a run request the model turns into workflow.execute.
   * Left out, `/` is ordinary text.
   */
  slashItems?: MentionItem[];
  /**
   * Files dropped on the box or pasted into it. Left out, both are refused the
   * way they were before: a drop did nothing and a pasted screenshot vanished.
   */
  onFiles?: (files: File[]) => void;
}

export const Composer = forwardRef<ComposerHandle, ComposerProps>(
  function Composer(
    {
      placeholder,
      onSubmit,
      readOnly = false,
      busy = false,
      canSend,
      sendLabel,
      leading,
      trailing,
      above,
      hint,
      active = false,
      onEmptyChange,
      mentions,
      slashItems,
      onFiles,
    },
    ref,
  ) {
    const { t } = useI18n();
    const [empty, setEmpty] = useState(true);
    /** Bumped on every selection change so the toolbar can show what is active. */
    const [, setTick] = useState(0);
    const [suggestion, setSuggestion] = useState<SuggestionState | null>(null);
    const [dropping, setDropping] = useState(false);

    const editorRef = useRef<Editor | null>(null);
    const submitRef = useRef<() => void>(() => undefined);
    const frameRef = useRef<HTMLDivElement | null>(null);
    // Extensions are built once, so the list has to be reachable by reference or
    // `@` would keep offering whichever roster was on the floor at first render.
    const mentionsRef = useRef<MentionItem[]>(mentions ?? []);
    mentionsRef.current = mentions ?? [];
    const slashRef = useRef<MentionItem[]>(slashItems ?? []);
    slashRef.current = slashItems ?? [];
    // Read by the key handler below, which is also installed once.
    const suggestionRef = useRef<SuggestionState | null>(null);
    // Same reason: the paste handler is part of the editor's props, built once.
    const onFilesRef = useRef<ComposerProps["onFiles"]>(onFiles);
    onFilesRef.current = onFiles;
    /**
     * Dragging fires for every child the pointer crosses, so the highlight is
     * counted in and out rather than toggled, or moving over the toolbar in the
     * middle of a drag turns it off while the file is still overhead.
     */
    const dragDepth = useRef(0);
    const showSuggestion = (next: SuggestionState | null): void => {
      suggestionRef.current = next;
      setSuggestion(next);
    };

    const editor = useEditor({
      extensions: [
        StarterKit.configure({
          // Headings and rules are document furniture, not message formatting.
          heading: false,
          horizontalRule: false,
        }),
        Link.configure({
          openOnClick: false,
          autolink: true,
          shouldAutoLink: looksLikeALink,
        }),
        Mention.configure({
          HTMLAttributes: { class: "composer-mention" },
          renderText: ({ node }) => `@${String(node.attrs["id"] ?? "")}`,
          suggestion: {
            char: "@",
            items: ({ query }) => matches(mentionsRef.current, query),
            render: () => ({
              onStart: (props) =>
                showSuggestion({
                  items: props.items as MentionItem[],
                  index: 0,
                  command: props.command,
                  rect: props.clientRect?.() ?? null,
                }),
              onUpdate: (props) =>
                showSuggestion({
                  items: props.items as MentionItem[],
                  index: 0,
                  command: props.command,
                  rect: props.clientRect?.() ?? null,
                }),
              onExit: () => showSuggestion(null),
            }),
          },
        }),
        // The `/` slash palette for saved flows — a second, distinctly-keyed
        // mention so a chosen flow reads as a chip and leaves as a run request.
        Mention.extend({ name: "slashFlow" }).configure({
          HTMLAttributes: { class: "composer-slash" },
          renderText: ({ node }) => `/${String(node.attrs["label"] ?? "")}`,
          suggestion: {
            char: "/",
            pluginKey: new PluginKey("slashFlow"),
            items: ({ query }) => matches(slashRef.current, query),
            render: () => ({
              onStart: (props) =>
                showSuggestion({
                  items: props.items as MentionItem[],
                  index: 0,
                  command: props.command,
                  rect: props.clientRect?.() ?? null,
                }),
              onUpdate: (props) =>
                showSuggestion({
                  items: props.items as MentionItem[],
                  index: 0,
                  command: props.command,
                  rect: props.clientRect?.() ?? null,
                }),
              onExit: () => showSuggestion(null),
            }),
          },
        }),
        Placeholder.configure({ placeholder }),
      ],
      editable: !readOnly,
      editorProps: {
        attributes: {
          class: "composer-editor",
        },
        /**
         * A pasted picture is a file on the clipboard, not text, so the editor
         * has to be told to leave it alone: ProseMirror's default is to drop it,
         * which is why pasting a screenshot appeared to do nothing at all.
         *
         * Text pastes are not touched. `files` is empty for those, and the rich
         * paste the editor already does well is the one people rely on.
         */
        handlePaste: (_view, event) => {
          const dropped = filesFrom(event.clipboardData);
          if (dropped.length === 0 || !onFilesRef.current) return false;
          event.preventDefault();
          onFilesRef.current(dropped);
          return true;
        },
        // Same for a drop landing inside the text area: without this the editor
        // inserts the file's name as if it had been typed. Taking the files is
        // the frame's job below, which sees this drop too.
        handleDrop: (_view, event) => {
          const dropped = filesFrom((event as DragEvent).dataTransfer ?? null);
          if (dropped.length === 0 || !onFilesRef.current) return false;
          event.preventDefault();
          return true;
        },
        handleKeyDown: (_view, event) => {
          // The name list is driven from here rather than from the suggestion
          // plugin's own key handler, because ProseMirror offers a key to the
          // view's props before any plugin sees it: Enter would send the message
          // instead of picking the highlighted name.
          const open = suggestionRef.current;
          if (open && open.items.length > 0 && !event.isComposing) {
            const step =
              event.key === "ArrowDown" ? 1 : event.key === "ArrowUp" ? -1 : 0;
            if (step !== 0) {
              event.preventDefault();
              const count = open.items.length;
              showSuggestion({
                ...open,
                index: (open.index + step + count) % count,
              });
              return true;
            }
            if (event.key === "Enter" || event.key === "Tab") {
              const picked = open.items[open.index];
              if (picked) {
                event.preventDefault();
                open.command({ id: picked.id, label: picked.label });
                return true;
              }
            }
            if (event.key === "Escape") {
              event.preventDefault();
              showSuggestion(null);
              return true;
            }
          }
          if (event.key !== "Enter" || event.isComposing) return false;
          const instance = editorRef.current;
          if (event.shiftKey) {
            // Shift+Enter means "keep writing". In a list that reads as the next
            // bullet, not a line break stranded inside the current one.
            if (!instance?.isActive("listItem")) return false;
            event.preventDefault();
            instance.chain().focus().splitListItem("listItem").run();
            return true;
          }
          // A code block is the one place a newline is what plain Enter must mean.
          if (instance?.isActive("codeBlock")) return false;
          event.preventDefault();
          submitRef.current();
          return true;
        },
      },
      onUpdate: ({ editor: instance }) => {
        const next = isDocEmpty(instance.getJSON() as RichNode);
        setEmpty(next);
        onEmptyChange?.(next);
      },
      onSelectionUpdate: () => setTick((count) => count + 1),
      onTransaction: () => setTick((count) => count + 1),
    });

    // `handleKeyDown` is installed once, so it reaches both of these by ref
    // rather than closing over a value from the render that created it.
    editorRef.current = editor;

    const submit = useCallback(() => {
      const instance = editorRef.current;
      if (!instance) return;
      const markdown = docToMarkdown(instance.getJSON() as RichNode);
      if (!markdown && !canSend) return;
      onSubmit(markdown);
    }, [canSend, onSubmit]);
    submitRef.current = submit;

    useEffect(() => {
      editor?.setEditable(!readOnly);
    }, [editor, readOnly]);

    // Extension options are frozen when the editor is built, so a placeholder
    // that names something changeable has to be pushed into the live extension.
    // Without this the composer keeps offering whichever channel happened to be
    // open on first render, long after the reader has walked to another one.
    useEffect(() => {
      if (!editor) return;
      const extension = editor.extensionManager.extensions.find(
        (candidate) => candidate.name === "placeholder",
      ) as { options: { placeholder: string } } | undefined;
      if (!extension || extension.options.placeholder === placeholder) return;
      extension.options.placeholder = placeholder;
      // The text is drawn by a decoration, recomputed only on a transaction.
      editor.view.dispatch(editor.state.tr);
    }, [editor, placeholder]);

    useImperativeHandle(
      ref,
      () => ({
        focus: () => editorRef.current?.chain().focus().run(),
        clear: () => {
          editorRef.current?.commands.clearContent(true);
          setEmpty(true);
          onEmptyChange?.(true);
        },
        setText: (text: string) => {
          editorRef.current?.commands.setContent(
            text
              ? {
                  type: "doc",
                  content: [
                    { type: "paragraph", content: [{ type: "text", text }] },
                  ],
                }
              : "",
            true,
          );
          const next = !text.trim();
          setEmpty(next);
          onEmptyChange?.(next);
        },
        getMarkdown: () =>
          editorRef.current
            ? docToMarkdown(editorRef.current.getJSON() as RichNode)
            : "",
      }),
      [onEmptyChange],
    );

    const sendDisabled = canSend === undefined ? empty : !canSend;

    return (
      /*
        The composer is the bottom pane, not a card sitting in one. No max
        width, no centring, no margin holding it off the edges: it spans the
        pane it is docked into and its own rows carry the insets.

        No `overflow-hidden` either — the model picker's menu opens upward out
        of here, and clipping it is what made that control unusable.
      */
      <div
        ref={frameRef}
        className={`relative shrink-0 border-t bg-card transition-colors dark:border-gray-800 ${
          dropping || active
            ? "border-brand-500"
            : "border-gray-200 dark:border-gray-800"
        }`}
        // Dropping anywhere on the composer counts, not only on the text: aiming
        // for the line you are writing on is not how anyone drops a file.
        onDragEnter={(event) => {
          if (!onFiles || !draggingFiles(event.dataTransfer)) return;
          dragDepth.current += 1;
          setDropping(true);
        }}
        onDragOver={(event) => {
          if (!onFiles || !draggingFiles(event.dataTransfer)) return;
          // Without this the browser refuses the drop and Electron navigates the
          // window to the file instead, which looks like the app crashing.
          event.preventDefault();
          event.dataTransfer.dropEffect = "copy";
        }}
        onDragLeave={() => {
          if (!onFiles) return;
          dragDepth.current = Math.max(0, dragDepth.current - 1);
          if (dragDepth.current === 0) setDropping(false);
        }}
        onDrop={(event) => {
          if (!onFiles) return;
          const dropped = filesFrom(event.dataTransfer);
          event.preventDefault();
          dragDepth.current = 0;
          setDropping(false);
          if (dropped.length > 0) onFiles(dropped);
        }}
      >
        {dropping ? (
          <div className="pointer-events-none absolute inset-0 z-40 flex items-center justify-center rounded-t bg-brand-500/5 ring-2 ring-inset ring-brand-500">
            <span className="rounded bg-white px-3 py-1 text-xs font-medium text-brand-600 shadow-sm">
              {t("composer.dropHere")}
            </span>
          </div>
        ) : null}
        {suggestion && suggestion.items.length > 0 ? (
          <MentionList
            state={suggestion}
            frame={frameRef.current}
            onPick={(item) =>
              suggestion.command({ id: item.id, label: item.label })
            }
            onHighlight={(index) => showSuggestion({ ...suggestion, index })}
          />
        ) : null}
        {above ? <div className="px-4 pt-2">{above}</div> : null}
        <div
          className="flex flex-wrap items-center gap-0.5 border-b border-gray-100 px-3 py-1 dark:border-gray-800"
          role="toolbar"
          aria-label={t("composer.formatting")}
        >
          {TOOLBAR.map((item) => {
            const isActive = editor ? item.isActive(editor) : false;
            return (
              <span key={item.name} className="flex items-center">
                {item.group ? (
                  <span className="mx-1 h-4 w-px bg-gray-300 dark:bg-gray-700" />
                ) : null}
                <button
                  type="button"
                  className={`flex h-7 w-7 items-center justify-center rounded transition-colors disabled:opacity-40 ${
                    isActive
                      ? "bg-gray-900 text-white dark:bg-brand-500"
                      : "text-gray-600 hover:bg-gray-200 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-white"
                  }`}
                  disabled={busy || readOnly || !editor}
                  aria-pressed={isActive}
                  aria-label={t(item.labelKey)}
                  title={t(item.labelKey)}
                  // The editor must not lose the selection before the
                  // click lands, or the command has nothing to act on.
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => editor && item.run(editor)}
                >
                  <item.Icon className="h-4 w-4" />
                </button>
              </span>
            );
          })}
        </div>

        {/*
          Clicking the box puts the caret in it, wherever in the box the click
          lands, and re-asserts that the editor is writable. Coming back from a
          side panel could leave the selection nowhere and the box looking
          frozen; a click on it is unambiguously "I want to write here".
        */}
        <EditorContent
          editor={editor}
          className="composer-shell"
          onMouseDown={() => {
            const instance = editorRef.current;
            if (!instance || readOnly) return;
            if (!instance.isEditable) instance.setEditable(true);
          }}
          onClick={() => {
            const instance = editorRef.current;
            if (!instance || readOnly || instance.isFocused) return;
            instance.commands.focus();
          }}
        />

        <div className="flex items-center gap-1 px-3 pb-2">
          {leading}
          <span className="ml-auto flex items-center gap-1">
            {trailing}
            <button
              type="button"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded bg-gray-900 text-white transition-opacity disabled:opacity-30 dark:bg-brand-500"
              disabled={sendDisabled}
              aria-label={sendLabel}
              title={sendLabel}
              onClick={submit}
            >
              {busy ? (
                <Spinner className="h-3.5 w-3.5 text-white/70" />
              ) : (
                <SendIcon className="h-4 w-4" />
              )}
            </button>
          </span>
        </div>
        {hint ? (
          <div className="px-4 pb-2 text-[0.6875rem] text-gray-500 dark:text-gray-400">
            {hint}
          </div>
        ) : null}
      </div>
    );
  },
);

/**
 * The names `@` is offering, above the box and over the conversation.
 *
 * Left-aligned to the `@` that opened it and opening upward, because the box is
 * at the bottom of the pane and a list below it would be off-screen.
 */
function MentionList({
  state,
  frame,
  onPick,
  onHighlight,
}: {
  state: SuggestionState;
  frame: HTMLDivElement | null;
  onPick: (item: MentionItem) => void;
  onHighlight: (index: number) => void;
}): JSX.Element {
  const { t } = useI18n();
  const box = frame?.getBoundingClientRect();
  const left = state.rect && box ? Math.max(8, state.rect.left - box.left) : 12;
  return (
    <div
      className="absolute bottom-full z-30 mb-1 max-h-64 w-64 overflow-y-auto rounded border border-gray-200 bg-white py-1 shadow-lg dark:border-gray-700 dark:bg-gray-900"
      style={{ left }}
      role="listbox"
      aria-label={t("composer.mentionLabel")}
    >
      {state.items.map((item, index) => (
        <button
          key={item.id}
          type="button"
          role="option"
          aria-selected={index === state.index}
          className={`flex w-full flex-col items-start px-3 py-1.5 text-left ${
            index === state.index
              ? "bg-gray-100 dark:bg-gray-800"
              : "hover:bg-gray-50 dark:hover:bg-gray-800/60"
          }`}
          // The selection has to survive the click, or there is no `@` left to
          // replace by the time the command runs.
          onMouseDown={(event) => event.preventDefault()}
          onMouseEnter={() => onHighlight(index)}
          onClick={() => onPick(item)}
        >
          <span className="text-sm text-gray-900 dark:text-gray-100">
            {item.label}
          </span>
          {item.hint ? (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              {item.hint}
            </span>
          ) : null}
        </button>
      ))}
    </div>
  );
}

/** A square action button sized to sit in the composer's bottom row. */
export function ComposerAction({
  label,
  active = false,
  tone = "default",
  disabled = false,
  pressed,
  onClick,
  children,
}: {
  label: string;
  active?: boolean;
  tone?: "default" | "sky" | "amber" | "brand";
  disabled?: boolean;
  pressed?: boolean;
  onClick: () => void;
  children: ReactNode;
}): JSX.Element {
  const activeTone =
    tone === "sky"
      ? "bg-primary-soft text-primary-ink ring-1 ring-primary-muted"
      : tone === "amber"
        ? "bg-warning-soft text-warning-ink ring-1 ring-warning-muted"
        : tone === "brand"
          ? "bg-brand-500 text-white"
          : "bg-gray-200 text-gray-900 dark:bg-gray-700 dark:text-gray-100";
  return (
    <button
      type="button"
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded transition-colors ${
        active
          ? activeTone
          : "text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100"
      } disabled:opacity-40`}
      disabled={disabled}
      {...(pressed === undefined ? {} : { "aria-pressed": pressed })}
      aria-label={label}
      title={label}
      onClick={onClick}
    >
      {children}
    </button>
  );
}
