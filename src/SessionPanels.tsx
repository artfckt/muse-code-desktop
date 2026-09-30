import { useEffect, useState } from "react";
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
export function ConversationTimeline({
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
  const groups: { message?: MuseItem; activity?: MuseItem[]; key: string }[] =
    [];
  for (const item of items.filter((i) => !i.retracted)) {
    if (["userMessage", "agentMessage"].includes(item.kind))
      groups.push({ message: item, key: item.itemId });
    else if (groups.at(-1)?.activity) groups.at(-1)!.activity!.push(item);
    else groups.push({ activity: [item], key: item.itemId });
  }
  return (
    <>
      {groups.map((group, index) =>
        group.message ? (
          <TranscriptItem
            key={group.key}
            item={{
              ...group.message,
              sessionId,
              workspace,
              desktopMedia:
                media[group.message.commandId] || group.message.desktopMedia,
            }}
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
}
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
    ["Last activity", session?.lastActivityAt || session?.updatedAt],
  ].filter(([, value]) => value != null && value !== "");
  return (
    <section className="session-details">
      <h3>Session details</h3>
      <dl>
        {rows.map(([label, value]) => (
          <div key={String(label)}>
            <dt>{label}</dt>
            <dd title={String(value)}>{String(value)}</dd>
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
    <section className="agents-panel">
      <h3>
        <Users size={16} /> Agents <span>{agents.length}</span>
      </h3>
      {!agents.length ? (
        <p>
          Ask Muse to delegate a task to agents. Native agents and their
          individual conversations appear here as they start.
        </p>
      ) : null}
      {agents.map((item) => (
        <article className="agent-card" key={item.itemId}>
          <header>
            <b>{item.role || item.agentPath || "Agent"}</b>
            <span className={item.status === "inProgress" ? "running" : ""}>
              {item.controlStatus || item.status}
            </span>
            {item.childSessionId && item.status === "inProgress" ? (
              <AgentLink
                id={item.childSessionId}
                parent={sessionId}
                label={`Open ${item.role || "agent"} separately`}
                onError={onError}
              />
            ) : null}
          </header>
          <p>{item.objective || itemText(item)}</p>
          <dl className="agent-metadata">
            {[
              ["Agent", item.subagentId],
              ["Session", item.childSessionId],
              ["Path", item.agentPath],
              ["Model", item.modelId || item.model?.modelId],
              ["Provider", item.providerId || item.model?.providerId],
              ["Started", item.startedAt || item.createdAt],
              [
                "Duration",
                item.durationMs != null
                  ? `${(item.durationMs / 1000).toFixed(1)}s`
                  : null,
              ],
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
          {item.durationMs != null ? (
            <small>
              {(item.durationMs / 1000).toFixed(1)}s ·{" "}
              {item.agentPath || item.subagentId}
            </small>
          ) : null}
          {item.result ? (
            <details>
              <summary>Agent result</summary>
              <pre>
                {item.result.summary ||
                  item.result.text ||
                  JSON.stringify(item.result, null, 2)}
              </pre>
            </details>
          ) : null}
          {item.subagentId ? (
            <>
              <textarea
                aria-label={`Message ${item.role || "agent"}`}
                placeholder="Send a message or follow-up task…"
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
            </>
          ) : null}
        </article>
      ))}
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
