import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  ExternalLink,
  Users,
  RefreshCw,
  ChevronDown,
  Check,
  Loader2,
} from "lucide-react";
import { AgentLink } from "./AgentLink";
import { TranscriptItem } from "./components";
import { itemText, type MuseItem } from "./protocol";

export function ResizeHandle({
  label,
  value,
  onChange,
  reverse = false,
}: {
  label: string;
  value: number;
  onChange: (value: number) => void;
  reverse?: boolean;
}) {
  return (
    <div
      className="resize-handle"
      role="separator"
      aria-label={label}
      aria-orientation="vertical"
      aria-valuemin={180}
      aria-valuemax={420}
      aria-valuenow={value}
      tabIndex={0}
      onKeyDown={(e) => {
        if (["ArrowLeft", "ArrowRight"].includes(e.key)) {
          e.preventDefault();
          onChange(
            Math.max(
              180,
              Math.min(
                420,
                value +
                  (e.key === "ArrowRight" ? 10 : -10) * (reverse ? -1 : 1),
              ),
            ),
          );
        }
      }}
      onPointerDown={(e) => {
        e.currentTarget.setPointerCapture(e.pointerId);
        e.currentTarget.dataset.start = `${e.clientX}:${value}`;
      }}
      onPointerMove={(e) => {
        if (!e.currentTarget.hasPointerCapture(e.pointerId)) return;
        const [start, width] = e.currentTarget.dataset
          .start!.split(":")
          .map(Number);
        onChange(
          Math.max(
            180,
            Math.min(420, width + (e.clientX - start) * (reverse ? -1 : 1)),
          ),
        );
      }}
    />
  );
}
const Message = memo(function Message({
  item,
  sessionId,
  workspace,
  media,
}: {
  item: MuseItem;
  sessionId: string;
  workspace: string;
  media?: any[];
}) {
  const enriched = useMemo(
    () => ({
      ...item,
      sessionId,
      workspace,
      desktopMedia: media || item.desktopMedia,
    }),
    [item, sessionId, workspace, media],
  );
  return <TranscriptItem item={enriched} />;
});
export const ConversationTimeline = memo(function ConversationTimeline({
  items,
  sessionId,
  workspace,
  working,
  autoCollapse,
  media,
}: {
  items: MuseItem[];
  sessionId: string;
  workspace: string;
  working: boolean;
  autoCollapse: boolean;
  media: Record<string, any[]>;
}) {
  const [limit, setLimit] = useState(200);
  const anchor = useRef<HTMLDivElement>(null);
  const previousHeight = useRef<number | null>(null);
  useEffect(() => setLimit(200), [sessionId]);
  useLayoutEffect(() => {
    const scroll = anchor.current?.closest(".chat-scroll");
    if (scroll && previousHeight.current != null) {
      scroll.scrollTop += scroll.scrollHeight - previousHeight.current;
      previousHeight.current = null;
    }
  }, [limit]);
  const visible = items.length > limit ? items.slice(-limit) : items;
  const groups: { message?: MuseItem; activity?: MuseItem[]; key: string }[] =
    [];
  for (const item of visible.filter((i) => !i.retracted)) {
    if (["userMessage", "agentMessage"].includes(item.kind))
      groups.push({ message: item, key: item.itemId });
    else if (groups.at(-1)?.activity) groups.at(-1)!.activity!.push(item);
    else groups.push({ activity: [item], key: item.itemId });
  }
  return (
    <>
      <div ref={anchor} />
      {items.length > limit ? (
        <button
          className="text-button load-earlier"
          onClick={() => {
            previousHeight.current =
              anchor.current?.closest(".chat-scroll")?.scrollHeight || null;
            setLimit((current) => current + 200);
          }}
        >
          Show earlier messages ({items.length - limit} remaining)
        </button>
      ) : null}
      {groups.map((group, index) =>
        group.message ? (
          <Message
            key={group.key}
            item={group.message}
            sessionId={sessionId}
            workspace={workspace}
            media={media[group.message.commandId]}
          />
        ) : (
          <ActivityGroup
            key={group.key}
            items={group.activity!}
            sessionId={sessionId}
            workspace={workspace}
            expanded={
              !autoCollapse ||
              (working &&
                !groups
                  .slice(index + 1)
                  .some((g) => g.message?.kind === "userMessage"))
            }
          />
        ),
      )}
    </>
  );
});
function ActivityGroup({
  items,
  sessionId,
  workspace,
  expanded,
}: {
  items: MuseItem[];
  sessionId: string;
  workspace: string;
  expanded: boolean;
}) {
  const [open, setOpen] = useState(expanded);
  useEffect(() => setOpen(expanded), [expanded]);
  const running = items.some((i) => i.status === "inProgress");
  return (
    <section className="activity-group">
      <button
        className="activity-toggle"
        aria-expanded={open}
        onClick={() => setOpen(!open)}
      >
        {running ? <Loader2 className="spin" size={13} /> : <Check size={13} />}
        <span>
          {items.length} activity {items.length === 1 ? "step" : "steps"}
        </span>
        <span className="activity-preview">
          {[
            ...new Set(
              items.map(
                (item) =>
                  item.tool ||
                  (item.kind === "userShell"
                    ? "Shell"
                    : item.kind === "reasoning"
                      ? "Reasoning"
                      : item.kind === "subagent"
                        ? item.role || "Agent"
                        : item.kind),
              ),
            ),
          ]
            .slice(0, 3)
            .join(" · ")}
        </span>
        <small>{running ? "Running" : open ? "Collapse" : "Details"}</small>
        <ChevronDown size={13} className={open ? "rotate" : ""} />
      </button>
      {open ? (
        <div>
          {items.map((item) => (
            <TranscriptItem
              key={item.itemId}
              item={{ ...item, sessionId, workspace }}
            />
          ))}
        </div>
      ) : null}
    </section>
  );
}
export function SessionDetails({
  session,
  stats,
  items,
  policy,
}: {
  session: any;
  stats: any;
  items: MuseItem[];
  policy: string;
}) {
  const tokens =
    stats.tokenUsage?.cumulative ||
    stats.tokenUsage?.usage ||
    stats.tokenUsage ||
    {};
  const context = stats.contextUsage || {};
  const rows = [
    ["Session", session?.sessionId],
    ["Model", session?.modelId],
    ["Provider", session?.providerId],
    ["Branch", session?.branch],
    ["Permissions", policy],
    ["Turns", session?.turnCount],
    [
      "Activity steps",
      items.filter((i) => !["userMessage", "agentMessage"].includes(i.kind))
        .length,
    ],
    ["Prompt tokens", tokens.promptTokens],
    ["Output tokens", tokens.outputTokens],
    ["Total tokens", tokens.totalTokens],
    [
      "Context",
      context.usedTokens != null
        ? `${context.usedTokens.toLocaleString()} / ${context.windowTokens?.toLocaleString() || "?"} (${context.pressure || "normal"})`
        : undefined,
    ],
    ["Last turn", stats.terminal],
    [
      "Turn duration",
      stats.durationMs != null
        ? `${(stats.durationMs / 1000).toFixed(1)}s`
        : undefined,
    ],
    [
      "Last activity",
      session?.lastActivityAt || session?.updatedAt
        ? new Date(session.lastActivityAt || session.updatedAt).toLocaleString()
        : undefined,
    ],
  ].filter(([, value]) => value != null && value !== "");
  return (
    <section className="session-details">
      <h3>Session details</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd title={String(value)}>
              {String(value)}
              {label === "Session" ? (
                <button
                  className="text-button"
                  aria-label="Copy session ID"
                  onClick={() =>
                    void navigator.clipboard.writeText(String(value))
                  }
                >
                  Copy
                </button>
              ) : null}
            </dd>
          </div>
        ))}
      </dl>
      {stats.goal ? (
        <div className="session-goal">
          <b>Goal</b>
          <pre>
            {typeof stats.goal === "string"
              ? stats.goal
              : JSON.stringify(stats.goal, null, 2)}
          </pre>
        </div>
      ) : null}
      {stats.todoList ? (
        <details>
          <summary>Tasks</summary>
          <pre>{JSON.stringify(stats.todoList, null, 2)}</pre>
        </details>
      ) : null}
    </section>
  );
}
export const ActivityPanel = memo(function ActivityPanel({
  items,
  sessionId,
  workspace,
}: {
  items: MuseItem[];
  sessionId: string;
  workspace: string;
}) {
  const [filter, setFilter] = useState("all");
  const [limit, setLimit] = useState(100);
  useEffect(() => {
    setFilter("all");
    setLimit(100);
  }, [sessionId]);
  const selected = items.filter(
    (item) =>
      !item.retracted &&
      (filter === "all" ||
        (filter === "running"
          ? item.status === "inProgress"
          : item.status === "failed")),
  );
  return (
    <section className="activity-panel">
      <header className="activity-filterbar">
        <span>{items.length} events</span>
        <div>
          {[
            ["all", "All"],
            ["running", "Running"],
            ["failed", "Failed"],
          ].map(([id, label]) => (
            <button
              key={id}
              className={filter === id ? "selected" : ""}
              aria-pressed={filter === id}
              onClick={() => {
                setFilter(id);
                setLimit(100);
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </header>
      {selected.length > limit && (
        <button
          className="text-button load-earlier"
          onClick={() => setLimit((v) => v + 100)}
        >
          Show earlier activity ({selected.length - limit} remaining)
        </button>
      )}
      <div className="activity-feed">
        {selected.slice(-limit).map((item, index) => (
          <div
            className={`activity-entry ${item.status === "failed" ? "failed" : ""}`}
            key={item.itemId}
          >
            <span
              className={`activity-node ${item.status === "inProgress" ? "running" : ""}`}
              aria-hidden="true"
            >
              {String(
                Math.max(0, selected.length - limit) + index + 1,
              ).padStart(2, "0")}
            </span>
            <Message item={item} sessionId={sessionId} workspace={workspace} />
          </div>
        ))}
      </div>
      {!selected.length && (
        <p className="activity-filter-empty">
          {filter === "all"
            ? "Tools, reasoning and shell events appear here as Muse works."
            : `No ${filter} events.`}
        </p>
      )}
    </section>
  );
});
export function AgentsPanel({
  items,
  sessionId,
  onError,
  onRefresh,
}: {
  items: MuseItem[];
  sessionId: string;
  onError: (text: string) => void;
  onRefresh: () => void;
}) {
  const [message, setMessage] = useState<Record<string, string>>({});
  const [pending, setPending] = useState("");
  const [managing, setManaging] = useState<string | null>(null);
  useEffect(() => {
    setManaging(null);
    setMessage({});
  }, [sessionId]);
  const agents = items.filter(
    (item) =>
      ["subagent", "reminderChild"].includes(item.kind) &&
      (item.childSessionId || item.subagentId),
  );
  async function action(item: MuseItem, name: string) {
    setPending(item.itemId);
    try {
      await window.muse.agentControl(name, {
        sessionId,
        subagentId: item.subagentId,
        ...(["sendMessage", "followupTask"].includes(name)
          ? { body: message[item.itemId] }
          : {}),
      });
      setMessage((prev) => ({ ...prev, [item.itemId]: "" }));
      onRefresh();
    } catch (err: any) {
      onError(err.message);
    } finally {
      setPending("");
    }
  }
  return (
    <section className="agents-panel compact-agents">
      <header className="agents-summary">
        <div>
          <Users size={16} />
          <h3>Agent team</h3>
          <span>{agents.length}</span>
        </div>
        <small>
          {agents.filter((item) => item.status === "inProgress").length} running
          · {agents.filter((item) => item.status === "completed").length}{" "}
          completed
        </small>
      </header>
      {!agents.length && (
        <div className="agents-empty">
          <Users size={24} />
          <p>Delegate a task to Muse.</p>
          <small>
            Each native agent's objective, progress and controls appear here.
          </small>
        </div>
      )}
      <div className="agent-grid">
        {agents.map((item) => (
          <article className="agent-card" key={item.itemId}>
            <header>
              <span className="agent-avatar">
                <Users size={15} />
              </span>
              <b>{item.role || item.agentPath || "Agent"}</b>
              <span
                className={`agent-status ${item.status === "inProgress" ? "running" : ""}`}
              >
                {item.controlStatus || item.status}
              </span>
              {item.childSessionId && item.status === "inProgress" && (
                <AgentLink
                  id={item.childSessionId}
                  parent={sessionId}
                  label={`Open ${item.role || "agent"} separately`}
                  onError={onError}
                />
              )}
            </header>
            <p
              className="agent-objective"
              title={item.objective || itemText(item)}
            >
              {item.objective || itemText(item)}
            </p>
            <div className="agent-chips">
              {(item.modelId || item.model?.modelId) && (
                <span>{item.modelId || item.model?.modelId}</span>
              )}
              {item.durationMs != null && (
                <span>{(item.durationMs / 1000).toFixed(1)}s</span>
              )}
            </div>
            <div className="agent-card-footer">
              <details className="agent-info">
                <summary>Details</summary>
                <dl className="agent-metadata">
                  {[
                    ["Agent", item.subagentId],
                    ["Session", item.childSessionId],
                    ["Path", item.agentPath],
                    ["Model", item.modelId || item.model?.modelId],
                    ["Provider", item.providerId || item.model?.providerId],
                    ["Started", item.startedAt || item.createdAt],
                    ["State", item.controlStatus || item.status],
                  ]
                    .filter(([, value]) => value != null && value !== "")
                    .map(([name, value]) => (
                      <div key={name}>
                        <dt>{name}</dt>
                        <dd title={String(value)}>{String(value)}</dd>
                      </div>
                    ))}
                </dl>
              </details>
              {item.subagentId && (
                <button
                  className="text-button"
                  aria-expanded={managing === item.itemId}
                  aria-label={`Manage ${item.role || "agent"}`}
                  onClick={() =>
                    setManaging(managing === item.itemId ? null : item.itemId)
                  }
                >
                  Controls <ChevronDown size={11} />
                </button>
              )}
            </div>
            {item.result && (
              <details className="agent-result">
                <summary>Agent result</summary>
                <pre>
                  {item.result.summary ||
                    item.result.text ||
                    JSON.stringify(item.result, null, 2)}
                </pre>
              </details>
            )}
            {item.subagentId && managing === item.itemId && (
              <div className="agent-compose">
                <textarea
                  aria-label={`Message ${item.role || "agent"}`}
                  placeholder="Message or follow-up task…"
                  value={message[item.itemId] || ""}
                  onChange={(e) =>
                    setMessage((prev) => ({
                      ...prev,
                      [item.itemId]: e.target.value,
                    }))
                  }
                />
                <div className="agent-actions">
                  <button
                    disabled={!!pending || !message[item.itemId]?.trim()}
                    onClick={() => void action(item, "sendMessage")}
                  >
                    Message
                  </button>
                  <button
                    disabled={!!pending || !message[item.itemId]?.trim()}
                    onClick={() => void action(item, "followupTask")}
                  >
                    Follow-up
                  </button>
                  {item.status === "inProgress" ? (
                    <button
                      disabled={!!pending}
                      onClick={() => void action(item, "interrupt")}
                    >
                      Interrupt
                    </button>
                  ) : (
                    <button
                      disabled={!!pending}
                      onClick={() => void action(item, "resume")}
                    >
                      <RefreshCw size={11} /> Resume
                    </button>
                  )}
                </div>
              </div>
            )}
          </article>
        ))}
      </div>
    </section>
  );
}
export function McpPanel({
  inventory,
  onRefresh,
  onOpenCli,
}: {
  inventory: any;
  onRefresh: () => void;
  onOpenCli: () => void;
}) {
  return (
    <section className="mcp-panel">
      <h3>
        MCP servers{" "}
        <button
          className="icon-button"
          title="Refresh MCP configuration"
          onClick={onRefresh}
        >
          <RefreshCw size={12} />
        </button>
      </h3>
      {inventory?.servers?.length ? (
        inventory.servers.map((server: any) => (
          <div className="mcp-server" key={server.name}>
            <b>{server.name}</b>
            <small>
              {server.transport} · {server.status}
            </small>
          </div>
        ))
      ) : (
        <p>No MCP servers in Muse settings.</p>
      )}
      <button className="text-button" onClick={onOpenCli}>
        Open native /mcp manager
      </button>
    </section>
  );
}
