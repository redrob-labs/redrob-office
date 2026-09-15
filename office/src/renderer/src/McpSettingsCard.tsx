import { useEffect, useState } from "react";
import {
  Button,
  Card,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tabs,
  TabsList,
  TabsTrigger,
  useI18n,
} from "@redrob/ui";
import type { McpServerView, McpTransportType } from "../../shared/office-api";
import {
  MCP_HUB_CATALOG,
  mcpInstallTarget,
  type McpHubCatalogItem,
} from "../../shared/mcp";
import { McpLogo } from "./McpLogo";

export function McpSettingsCard(): JSX.Element {
  const { t } = useI18n();
  const [servers, setServers] = useState<McpServerView[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"installed" | "hub">("installed");

  // Form state for adding/editing server
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formName, setFormName] = useState("");
  const [formTransport, setFormTransport] = useState<McpTransportType>("stdio");
  const [formCommand, setFormCommand] = useState("");
  const [formArgs, setFormArgs] = useState("");
  const [formEnv, setFormEnv] = useState("");
  const [formUrl, setFormUrl] = useState("");
  const [formDescription, setFormDescription] = useState("");

  const refreshServers = (): void => {
    void window.office
      .listMcpServers()
      .then(setServers)
      .catch((err) => {
        console.error("Failed to list MCP servers:", err);
      });
  };

  useEffect(() => {
    refreshServers();
  }, []);

  // A handshake finishes in the main process without telling this window, so
  // while one is in flight the list asks again until every server has settled.
  const handshaking = servers.some((s) => s.status === "connecting");
  useEffect(() => {
    if (!handshaking) return;
    const timer = setInterval(refreshServers, 1200);
    return () => clearInterval(timer);
  }, [handshaking]);

  const resetForm = (): void => {
    setIsAdding(false);
    setEditingId(null);
    setFormName("");
    setFormTransport("stdio");
    setFormCommand("");
    setFormArgs("");
    setFormEnv("");
    setFormUrl("");
    setFormDescription("");
    setError(null);
  };

  const installFromHub = (item: McpHubCatalogItem): void => {
    setIsAdding(true);
    setEditingId(mcpInstallTarget(servers, item.name));
    setFormName(item.name);
    setFormTransport(item.transport);
    setFormCommand(item.command ?? "");
    setFormArgs(item.args ? item.args.join(" ") : "");
    setFormEnv(item.envTemplate ? Object.entries(item.envTemplate).map(([k, v]) => `${k}=${v}`).join("\n") : "");
    setFormUrl(item.url ?? "");
    setFormDescription(item.description);
    setActiveTab("installed");
    setError(null);
  };

  const handleSave = async (): Promise<void> => {
    if (!formName.trim()) {
      setError(t("settings.mcpNameRequired"));
      return;
    }

    if (formTransport === "stdio" && !formCommand.trim()) {
      setError(t("settings.mcpCommandRequired"));
      return;
    }

    if (formTransport === "sse" && !formUrl.trim()) {
      setError(t("settings.mcpUrlRequired"));
      return;
    }

    setBusy(true);
    setError(null);

    let parsedArgs: string[] = [];
    if (formArgs.trim()) {
      try {
        // Try parsing JSON array first, otherwise split by whitespace
        if (formArgs.trim().startsWith("[")) {
          parsedArgs = JSON.parse(formArgs.trim()) as string[];
        } else {
          parsedArgs = formArgs.trim().split(/\s+/);
        }
      } catch {
        parsedArgs = formArgs.trim().split(/\s+/);
      }
    }

    let parsedEnv: Record<string, string> = {};
    if (formEnv.trim()) {
      try {
        if (formEnv.trim().startsWith("{")) {
          parsedEnv = JSON.parse(formEnv.trim()) as Record<string, string>;
        } else {
          const lines = formEnv.trim().split("\n");
          for (const line of lines) {
            const idx = line.indexOf("=");
            if (idx > 0) {
              const k = line.slice(0, idx).trim();
              const v = line.slice(idx + 1).trim();
              if (k) parsedEnv[k] = v;
            }
          }
        }
      } catch {
        setError(t("settings.mcpEnvInvalid"));
        setBusy(false);
        return;
      }
    }

    try {
      if (editingId) {
        await window.office.updateMcpServer(editingId, {
          name: formName.trim(),
          transport: formTransport,
          command: formTransport === "stdio" ? formCommand.trim() : undefined,
          args: formTransport === "stdio" ? parsedArgs : undefined,
          env: formTransport === "stdio" ? parsedEnv : undefined,
          url: formTransport === "sse" ? formUrl.trim() : undefined,
          description: formDescription.trim() || undefined,
        });
      } else {
        await window.office.addMcpServer({
          name: formName.trim(),
          transport: formTransport,
          command: formTransport === "stdio" ? formCommand.trim() : undefined,
          args: formTransport === "stdio" ? parsedArgs : undefined,
          env: formTransport === "stdio" ? parsedEnv : undefined,
          url: formTransport === "sse" ? formUrl.trim() : undefined,
          description: formDescription.trim() || undefined,
          enabled: true,
        });
      }
      resetForm();
      refreshServers();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const startEdit = (server: McpServerView): void => {
    setEditingId(server.id);
    setIsAdding(true);
    setFormName(server.name);
    setFormTransport(server.transport);
    setFormCommand(server.command ?? "");
    setFormArgs(server.args ? server.args.join(" ") : "");
    setFormEnv(server.env ? JSON.stringify(server.env, null, 2) : "");
    setFormUrl(server.url ?? "");
    setFormDescription(server.description ?? "");
    setError(null);
  };

  const handleToggle = async (server: McpServerView): Promise<void> => {
    setBusy(true);
    try {
      if (server.enabled) {
        await window.office.updateMcpServer(server.id, { enabled: false });
        await window.office.disconnectMcpServer(server.id);
      } else {
        await window.office.updateMcpServer(server.id, { enabled: true });
        await window.office.connectMcpServer(server.id);
      }
      refreshServers();
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (id: string): Promise<void> => {
    if (!confirm(t("settings.mcpDeleteConfirm"))) return;
    setBusy(true);
    try {
      await window.office.removeMcpServer(id);
      refreshServers();
    } finally {
      setBusy(false);
    }
  };

  const handleReconnect = async (id: string): Promise<void> => {
    setBusy(true);
    try {
      await window.office.connectMcpServer(id);
      refreshServers();
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* One tab dock, the same shape the chat panes use. */}
      <div className="flex items-center justify-between border-b border-gray-200 pb-3 dark:border-gray-800">
        <Tabs
          value={activeTab}
          onValueChange={(value) =>
            setActiveTab(value as "installed" | "hub")
          }
        >
          <TabsList aria-label={t("settings.mcp")}>
            <TabsTrigger value="installed">
              {t("settings.mcpInstalledTab")} ({servers.length})
            </TabsTrigger>
            <TabsTrigger value="hub">{t("settings.mcpHubTab")}</TabsTrigger>
          </TabsList>
        </Tabs>

        {activeTab === "installed" && !isAdding && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => {
              resetForm();
              setIsAdding(true);
            }}
          >
            {t("settings.mcpAddServer")}
          </Button>
        )}
      </div>

      {activeTab === "hub" ? (
        <div className="space-y-4">
          <div>
            <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
              {t("settings.mcpHubTitle")}
            </h4>
            <p className="mt-0.5 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
              {t("settings.mcpHubBody")}
            </p>
          </div>

          <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
            {MCP_HUB_CATALOG.map((item) => {
              const installed = servers.some((s) => s.name.toLowerCase() === item.name.toLowerCase());
              return (
                <Card
                  key={item.id}
                  className="flex flex-col justify-between p-4 transition-colors hover:border-gray-300 dark:hover:border-gray-700"
                >
                  <div>
                    <div className="flex items-center gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                        <McpLogo idOrName={item.id} />
                      </span>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                            {item.name}
                          </span>
                          <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.625rem] font-semibold uppercase tracking-wide text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                            {item.category}
                          </span>
                        </div>
                        <span className="text-[0.6875rem] text-gray-500 dark:text-gray-400">
                          {t("settings.mcpAuthor", { author: item.author })}
                        </span>
                      </div>
                    </div>
                    <p className="mt-2.5 text-xs leading-relaxed text-gray-600 dark:text-gray-300">
                      {item.description}
                    </p>
                  </div>

                  <div className="mt-4 flex items-center justify-between gap-2 border-t border-gray-200 pt-3 dark:border-gray-800">
                    <div className="min-w-0">
                      <p className="truncate text-[0.6875rem] text-gray-500 dark:text-gray-400">
                        {item.transport === "stdio"
                          ? t("settings.mcpRunsHere")
                          : t("settings.mcpRunsRemote")}
                      </p>
                      {item.docsUrl && (
                        <a
                          href={item.docsUrl}
                          target="_blank"
                          rel="noreferrer"
                          className="text-[0.6875rem] font-medium text-brand-600 hover:underline dark:text-blue-400"
                        >
                          {t("settings.mcpSetupGuide")}
                        </a>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant={installed ? "outline" : "default"}
                      size="xs"
                      onClick={() => installFromHub(item)}
                    >
                      {installed
                        ? t("settings.mcpReconfigure")
                        : t("settings.mcpConnect")}
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>
      ) : (
        <>
          <div className="flex items-center justify-between">
            <div>
              <h4 className="text-sm font-semibold text-gray-900 dark:text-white">
                {t("settings.mcpServersTitle")}
              </h4>
              <p className="mt-0.5 text-xs text-gray-500 leading-relaxed dark:text-gray-400">
                {t("settings.mcpServersBody")}
              </p>
            </div>
          </div>

      {isAdding && (
        <Card className="space-y-3 bg-gray-50/50 p-4 dark:bg-gray-900/50">
          <div className="flex items-center justify-between border-b border-gray-200 pb-2 dark:border-gray-800">
            <span className="text-xs font-semibold text-gray-800 dark:text-gray-100">
              {editingId ? t("settings.mcpEditServer") : t("settings.mcpNewServer")}
            </span>
            <Button
              type="button"
              variant="ghost"
              size="xs"
              onClick={resetForm}
            >
              {t("settings.mcpCancel")}
            </Button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {t("settings.mcpNameLabel")}
              </span>
              <input
                type="text"
                className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder-gray-500"
                placeholder={t("settings.mcpNamePlaceholder")}
                value={formName}
                onChange={(e) => setFormName(e.target.value)}
              />
            </label>

            <div className="block space-y-1">
              <span
                id="mcp-transport-label"
                className="text-xs font-medium text-gray-700 dark:text-gray-300"
              >
                {t("settings.mcpTransportLabel")}
              </span>
              <Select
                value={formTransport}
                onValueChange={(value) =>
                  setFormTransport(value as McpTransportType)
                }
              >
                <SelectTrigger
                  aria-labelledby="mcp-transport-label"
                  className="h-8 text-xs"
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="stdio">
                    {t("settings.mcpTransportLocal")}
                  </SelectItem>
                  <SelectItem value="sse">
                    {t("settings.mcpTransportRemote")}
                  </SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {formTransport === "stdio" ? (
            <>
              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t("settings.mcpCommandLabel")}
                </span>
                <input
                  type="text"
                  className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder-gray-500 font-mono"
                  placeholder="e.g. npx, node, docker"
                  value={formCommand}
                  onChange={(e) => setFormCommand(e.target.value)}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t("settings.mcpArgsLabel")}
                </span>
                <input
                  type="text"
                  className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder-gray-500 font-mono"
                  placeholder="e.g. -y figma-developer-mcp --stdio"
                  value={formArgs}
                  onChange={(e) => setFormArgs(e.target.value)}
                />
              </label>

              <label className="block space-y-1">
                <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                  {t("settings.mcpEnvLabel")}
                </span>
                <textarea
                  className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder-gray-500 font-mono min-h-16"
                  placeholder="FIGMA_API_KEY=your_token_here&#10;KEY=VALUE"
                  value={formEnv}
                  onChange={(e) => setFormEnv(e.target.value)}
                />
              </label>
            </>
          ) : (
            <label className="block space-y-1">
              <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                {t("settings.mcpUrlLabel")}
              </span>
              <input
                type="url"
                className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder-gray-500 font-mono"
                placeholder="https://example.com/sse"
                value={formUrl}
                onChange={(e) => setFormUrl(e.target.value)}
              />
            </label>
          )}

          <label className="block space-y-1">
            <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
              {t("settings.mcpDescriptionLabel")}
            </span>
            <input
              type="text"
              className="w-full rounded border border-gray-300 bg-white px-2.5 py-1.5 text-xs text-gray-900 placeholder-gray-400 dark:border-gray-700 dark:bg-gray-950 dark:text-gray-100 dark:placeholder-gray-500"
              placeholder={t("settings.mcpDescriptionPlaceholder")}
              value={formDescription}
              onChange={(e) => setFormDescription(e.target.value)}
            />
          </label>

          {error && <p className="text-xs text-destructive-ink">{error}</p>}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={resetForm}
              disabled={busy}
            >
              {t("settings.mcpCancel")}
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={() => void handleSave()}
              disabled={busy}
            >
              {busy ? t("settings.mcpSaving") : t("settings.mcpSave")}
            </Button>
          </div>
        </Card>
      )}

      {servers.length === 0 ? (
        <div className="rounded border border-dashed border-gray-300 p-6 text-center dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {t("settings.mcpEmpty")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {servers.map((server) => {
            const statusColor =
              server.status === "connected"
                ? "bg-success"
                : server.status === "connecting"
                  ? "bg-warning animate-pulse"
                  : server.status === "error"
                    ? "bg-destructive"
                    : "bg-gray-400";

            return (
              <Card
                key={server.id}
                className="space-y-3 p-4"
              >
                {/*
                  The row wraps rather than squeezing: at a narrow panel width a
                  non-wrapping row starved the description down to one word per
                  line, so the actions drop below instead.
                */}
                <div className="flex flex-wrap items-start justify-between gap-x-3 gap-y-2">
                  <div className="flex min-w-[12rem] flex-1 items-start gap-3">
                    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded border border-gray-200 bg-gray-50 dark:border-gray-700 dark:bg-gray-800">
                      <McpLogo idOrName={server.name} />
                    </span>
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                        <span className={`h-2 w-2 shrink-0 rounded-full ${statusColor}`} />
                        <span className="text-sm font-semibold text-gray-900 dark:text-white">
                          {server.name}
                        </span>
                        <span className="rounded bg-gray-100 px-1.5 py-0.5 text-[0.625rem] font-semibold text-gray-600 dark:bg-gray-800 dark:text-gray-400">
                          {server.transport === "stdio"
                            ? t("settings.mcpRunsHere")
                            : t("settings.mcpRunsRemote")}
                        </span>
                        <span className="text-xs capitalize text-gray-500 dark:text-gray-400">
                          {server.status}
                        </span>
                      </div>
                      {server.description && (
                        <p className="mt-1 text-xs leading-relaxed text-gray-500 dark:text-gray-400">
                          {server.description}
                        </p>
                      )}
                    </div>
                  </div>

                  <div className="flex shrink-0 items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => void handleToggle(server)}
                      disabled={busy}
                    >
                      {server.enabled ? t("settings.mcpDisable") : t("settings.mcpEnable")}
                    </Button>
                    {server.enabled && server.status !== "connected" && (
                      <Button
                        type="button"
                        size="xs"
                        onClick={() => void handleReconnect(server.id)}
                        disabled={busy}
                      >
                        {t("settings.mcpReconnect")}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="outline"
                      size="xs"
                      onClick={() => startEdit(server)}
                      disabled={busy}
                    >
                      {t("settings.mcpEdit")}
                    </Button>
                    <Button
                      type="button"
                      variant="destructive-outline"
                      size="xs"
                      onClick={() => void handleDelete(server.id)}
                      disabled={busy}
                    >
                      {t("settings.mcpDelete")}
                    </Button>
                  </div>
                </div>

                {server.error && (
                  <p className="rounded bg-destructive-soft px-2 py-1 text-xs text-destructive-ink">
                    {server.error}
                  </p>
                )}

                {server.tools && server.tools.length > 0 && (
                  <div className="border-t border-gray-200 pt-2 dark:border-gray-800">
                    <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-gray-500 dark:text-gray-400">
                      {t("settings.mcpDiscoveredTools", { count: server.tools.length })}:
                    </span>
                    <div className="mt-1 flex flex-wrap gap-1.5">
                      {server.tools.map((tool) => (
                        <span
                          key={tool.fullName}
                          className="rounded border border-gray-200 bg-gray-50 px-2 py-0.5 font-mono text-xs text-gray-700 dark:border-gray-700 dark:bg-gray-800 dark:text-gray-200"
                          title={tool.description}
                        >
                          {tool.name}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </Card>
            );
          })}
        </div>
      )}
      </>
      )}
    </div>
  );
}
