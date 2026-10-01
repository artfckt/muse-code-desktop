import {
  memo,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Users, RefreshCw, ChevronDown, Check, Loader2 } from "lucide-react";
import { AgentLink } from "./AgentLink";
import { TranscriptItem } from "./components";
import { itemText, type MuseItem } from "./protocol";
import {
  conversationWindow,
  nativeAgents,
  agentWorking,
  activityLabel,
  nativeCommentary,
} from "./conversation";

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
  autoCollapse,
  media,
}: {
  items: MuseItem[];
  sessionId: string;
  workspace: string;
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
  const { visible, remaining } = conversationWindow(items, limit);
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
      {remaining > 0 ? (
        <button
          className="text-button load-earlier"
          onClick={() => {
            previousHeight.current =
              anchor.current?.closest(".chat-scroll")?.scrollHeight || null;
            setLimit((current) => current + 200);
          }}
        >
          Show earlier messages ({remaining} remaining)
        </button>
      ) : null}
      {groups.map((group) =>
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
            expanded={!autoCollapse}
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
  const [limit, setLimit] = useState(50);
  const running = items.some((i) => i.status === "inProgress");
  const current =
    [...items].reverse().find((item) => item.status === "inProgress") ||
    items.at(-1)!;
  const commentary = nativeCommentary(items);
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
        <span className="activity-preview">{activityLabel(current)}</span>
        <small>{running ? "Running" : open ? "Collapse" : "Details"}</small>
        <ChevronDown size={13} className={open ? "rotate" : ""} />
      </button>
      {commentary && (
        <div className="muse-commentary">
          <small>Muse update</small>
          <p>{commentary}</p>
        </div>
      )}
      {open ? (
        <div className="activity-step-list">
          {items.length > limit && (
            <button
              className="text-button load-earlier"
              onClick={() => setLimit((v) => v + 50)}
            >
              Show earlier steps ({items.length - limit} remaining)
            </button>
          )}
          {items.slice(-limit).map((item) => (
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
export function InlineAgents({
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
  const [expanded, setExpanded] = useState(false);
  const [showAll, setShowAll] = useState(false);
  useEffect(() => {
    setExpanded(false);
    setShowAll(false);
  }, [sessionId]);
  const agents = useMemo(() => nativeAgents(items), [items]);
  const running = agents.filter(agentWorking);
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
  if (!agents.length) return null;
  return (
    <section className="agents-panel inline-agents">
      <button
        className="inline-agent-toggle"
        aria-label={`Show agents (${running.length} working, ${agents.length} total)`}
        aria-expanded={expanded}
        onClick={() => setExpanded(!expanded)}
      >
        {running.length ? (
          <Loader2 size={13} className="spin" />
        ) : (
          <Users size={13} />
        )}
        <b>Agents</b>
        <span>
          {running.length
            ? `${running.length} working`
            : `${agents.length} ${agents.length === 1 ? "agent" : "agents"}`}
        </span>
        <ChevronDown size={13} className={expanded ? "rotate" : ""} />
      </button>
      {!expanded &&
        running.slice(0, 3).map((item) => (
          <p className="inline-agent-progress" key={item.itemId}>
            <b>{item.role || "Agent"}</b>
            <span>
              {item.objective ||
                item.fallbackText ||
                item.controlStatus ||
                item.status}
            </span>
          </p>
        ))}
      {expanded && (
        <div className="agent-grid">
          {(showAll ? agents : agents.slice(0, 6)).map((item) => (
            <article className="agent-card" key={item.itemId}>
              <header>
                <span className="agent-avatar">
                  <Users size={15} />
                </span>
                <b>{item.role || item.agentPath || "Agent"}</b>
                <span
                  className={`agent-status ${agentWorking(item) ? "running" : ""}`}
                >
                  {item.controlStatus || item.status}
                </span>
                {item.childSessionId && agentWorking(item) && (
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
                    {agentWorking(item) ? (
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
          {!showAll && agents.length > 6 && (
            <button className="text-button" onClick={() => setShowAll(true)}>
              Show all {agents.length} agents
            </button>
          )}
        </div>
      )}
    </section>
  );
}
