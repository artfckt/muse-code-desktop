import { memo, useMemo, useState } from "react";
import {
  Check,
  ChevronDown,
  ChevronsLeft,
  ChevronsRight,
  Folder,
  GripVertical,
  Loader2,
  MessageSquare,
  MoreHorizontal,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  Terminal,
  UserRound,
  X,
  ArrowUpRight,
  Download,
} from "lucide-react";
import { MuseMark } from "./components";
import { sessionTitle } from "./protocol";
type Layout = { projects: string[]; chats: Record<string, string[]> };
function readLayout(): Layout {
  try {
    const raw = JSON.parse(localStorage.getItem("muse-sidebar-order") || "{}");
    return {
      projects: Array.isArray(raw.projects)
        ? raw.projects.filter((v: any) => typeof v === "string")
        : [],
      chats: Object.fromEntries(
        Object.entries(
          raw.chats && typeof raw.chats === "object" ? raw.chats : {},
        )
          .filter(([, ids]) => Array.isArray(ids))
          .map(([root, ids]) => [
            root,
            (ids as any[]).filter((id) => typeof id === "string"),
          ]),
      ),
    };
  } catch {
    return { projects: [], chats: {} };
  }
}
function ordered<T>(rows: T[], ids: string[], key: (row: T) => string): T[] {
  const rank = new Map(ids.map((id, i) => [id, i]));
  return [...rows].sort(
    (a, b) =>
      (rank.get(key(a)) ?? ids.length) - (rank.get(key(b)) ?? ids.length),
  );
}
function move(ids: string[], from: string, before: string) {
  if (from === before) return ids;
  const next = ids.filter((id) => id !== from),
    index = next.indexOf(before);
  next.splice(index < 0 ? next.length : index, 0, from);
  return next;
}
function shortPath(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() || "No folder";
}
function ago(value: string) {
  const minutes = Math.max(
    0,
    Math.floor((Date.now() - new Date(value).getTime()) / 60000),
  );
  return minutes < 1
    ? "now"
    : minutes < 60
      ? `${minutes}m`
      : minutes < 1440
        ? `${Math.floor(minutes / 60)}h`
        : new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
}
export const WorkspaceSidebar = memo(function WorkspaceSidebar(props: {
  sessions: any[];
  workspaces: string[];
  workspace: string;
  session: string;
  collapsed: boolean;
  onCollapse: () => void;
  busy: boolean;
  loading: boolean;
  historyError: string;
  turns: Record<string, string | null>;
  completed: Record<string, string>;
  hiddenHistory: { chats: string[]; roots: string[] };
  showArchived: boolean;
  onArchived: (v: boolean) => void;
  search: string;
  onSearch: (v: string) => void;
  accountName: string;
  signedIn: boolean;
  usage: any;
  usageLoading: boolean;
  usageChecked: number | null;
  usageError: string;
  updateAvailable: boolean;
  onUsage: () => void;
  onAccount: () => void;
  onSettings: () => void;
  onUpdates: () => void;
  onTerminal: () => void;
  onNew: (root: string) => void;
  onSelect: (id: string) => void;
  onProject: (root: string) => void;
  onActions: (row: any) => void;
  onRefresh: () => void;
  onRetry: () => void;
  onHide: (root: string) => void;
}) {
  const [layout, setLayout] = useState(readLayout);
  const [folded, setFolded] = useState<Record<string, boolean>>(() => {
    try {
      return JSON.parse(localStorage.getItem("muse-project-folds") || "{}");
    } catch {
      return {};
    }
  });
  const [drag, setDrag] = useState<{
    kind: "project" | "chat";
    id: string;
    root: string;
  } | null>(null);
  const [target, setTarget] = useState("");
  const [notice, setNotice] = useState("");
  const groups = useMemo(() => {
    const byRoot = new Map<string, any[]>();
    for (const row of props.sessions) {
      const root = row.workspaceRoot || "";
      if (!byRoot.has(root)) byRoot.set(root, []);
      if (
        (props.showArchived ||
          !props.hiddenHistory.chats.includes(row.sessionId)) &&
        sessionTitle(row).toLowerCase().includes(props.search.toLowerCase())
      )
        byRoot.get(root)!.push(row);
    }
    const roots = [...new Set([...props.workspaces, ...byRoot.keys()])].filter(
      (root) =>
        (root || byRoot.has("")) &&
        (props.search ||
          props.showArchived ||
          !props.hiddenHistory.roots.includes(root)) &&
        (!props.search || byRoot.get(root)?.length),
    );
    return ordered(roots, layout.projects, (root) => root).map((root) => ({
      root,
      rows: ordered(
        byRoot.get(root) || [],
        layout.chats[root] || [],
        (row) => row.sessionId,
      ),
    }));
  }, [
    props.sessions,
    props.workspaces,
    props.search,
    props.showArchived,
    props.hiddenHistory,
    layout,
  ]);
  function save(next: Layout) {
    setLayout(next);
    try {
      localStorage.setItem("muse-sidebar-order", JSON.stringify(next));
    } catch {}
  }
  function begin(
    event: React.DragEvent,
    kind: "project" | "chat",
    id: string,
    root: string,
  ) {
    setDrag({ kind, id, root });
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData(
      "application/x-muse-sidebar",
      JSON.stringify({ kind, id, root }),
    );
  }
  function drop(
    event: React.DragEvent,
    kind: "project" | "chat",
    id: string,
    root: string,
  ) {
    event.preventDefault();
    event.stopPropagation();
    setTarget("");
    setDrag(null);
    let held = drag;
    try {
      held ||= JSON.parse(
        event.dataTransfer.getData("application/x-muse-sidebar"),
      );
    } catch {}
    if (!held) return;
    if (held.kind === "project" && kind === "project")
      save({
        ...layout,
        projects: move(
          groups.map((g) => g.root),
          held.id,
          id,
        ),
      });
    else if (held.kind === "chat" && held.root === root) {
      const ids =
        groups.find((g) => g.root === root)?.rows.map((row) => row.sessionId) ||
        [];
      save({
        ...layout,
        chats: {
          ...layout.chats,
          [root]: move(ids, held.id, kind === "chat" ? id : ids[0]),
        },
      });
    } else
      setNotice(
        "Drag chats within their project. Their native working folder stays attached to the conversation.",
      );
  }
  function keyboardOrder(
    event: React.KeyboardEvent,
    kind: "project" | "chat",
    id: string,
    root: string,
  ) {
    if (!event.altKey || !["ArrowUp", "ArrowDown"].includes(event.key)) return;
    event.preventDefault();
    const ids =
      kind === "project"
        ? groups.map((g) => g.root)
        : groups.find((g) => g.root === root)?.rows.map((r) => r.sessionId) ||
          [];
    const index = ids.indexOf(id),
      nextIndex = index + (event.key === "ArrowUp" ? -1 : 1);
    if (index < 0 || nextIndex < 0 || nextIndex >= ids.length) return;
    const next = [...ids];
    [next[index], next[nextIndex]] = [next[nextIndex], next[index]];
    save(
      kind === "project"
        ? { ...layout, projects: next }
        : { ...layout, chats: { ...layout.chats, [root]: next } },
    );
  }
  return (
    <aside
      className={`sidebar workspace-sidebar ${props.collapsed ? "rail" : ""}`}
      aria-label="Projects and chats sidebar"
    >
      <div className="sidebar-brand-row">
        <div className="brand">
          <div className="brand-icon">
            <MuseMark />
          </div>
          {!props.collapsed && (
            <b>
              muse <span>desktop</span>
            </b>
          )}
        </div>
        <button
          className="icon-button sidebar-collapse"
          aria-label={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          title={props.collapsed ? "Expand sidebar" : "Collapse sidebar"}
          onClick={props.onCollapse}
        >
          {props.collapsed ? (
            <ChevronsRight size={15} />
          ) : (
            <ChevronsLeft size={15} />
          )}
        </button>
      </div>
      <button
        className="new-chat-button"
        aria-label="New conversation ＋"
        title="New conversation"
        disabled={props.busy}
        onClick={() => props.onNew(props.workspace)}
      >
        <Plus size={15} />
        {!props.collapsed && (
          <>
            <span>New conversation</span>
            <kbd>＋</kbd>
          </>
        )}
      </button>
      {!props.collapsed && (
        <>
          <div className="sidebar-heading">
            <span>WORKSPACE</span>
            {props.loading && (
              <Loader2
                size={11}
                className="spin"
                aria-label="Loading projects and conversations"
              />
            )}
            <button
              className="icon-button"
              title="Refresh conversations"
              disabled={props.loading}
              onClick={props.onRefresh}
            >
              <RefreshCw size={12} />
            </button>
          </div>
          <label className="search-field">
            <Search size={12} />
            <input
              aria-label="Search conversations"
              placeholder="Search chats…"
              value={props.search}
              onChange={(e) => props.onSearch(e.target.value)}
            />
          </label>
        </>
      )}
      <nav
        className="session-list"
        aria-label="Conversations"
        aria-busy={props.loading}
      >
        {props.loading && !props.sessions.length && !props.collapsed && (
          <div className="list-skeleton" role="status">
            Loading projects and conversations…
            {[0, 1, 2, 3].map((i) => (
              <i key={i} />
            ))}
          </div>
        )}
        {!props.collapsed &&
          (props.hiddenHistory.chats.length > 0 ||
            props.hiddenHistory.roots.length > 0) && (
            <button
              className="archive-toggle text-button"
              onClick={() => props.onArchived(!props.showArchived)}
            >
              {props.showArchived
                ? "Hide archived conversations"
                : `Show archived (${props.hiddenHistory.chats.length}) and hidden projects`}
            </button>
          )}
        {props.historyError && (
          <div className="sidebar-empty" role="alert">
            <p>{props.historyError}</p>
            <button className="secondary-button" onClick={props.onRetry}>
              Retry connection
            </button>
          </div>
        )}
        {groups.map(({ root, rows }) => (
          <section
            className={`workspace-group ${drag?.kind === "project" && target === root ? "drop-target" : ""}`}
            key={root || "ungrouped"}
            onDragOver={(e) => {
              if (drag) {
                e.preventDefault();
                setTarget(root);
              }
            }}
            onDrop={(e) => drop(e, "project", root, root)}
          >
            {props.collapsed ? (
              <button
                className={`rail-project icon-button ${root === props.workspace ? "selected" : ""}`}
                title={`${shortPath(root)} · ${rows.length} chats`}
                aria-label={`Expand project ${shortPath(root)}`}
                onClick={() => {
                  props.onCollapse();
                  setFolded((prev) => ({ ...prev, [root]: false }));
                }}
              >
                <Folder size={17} />
                <span>{rows.length || ""}</span>
              </button>
            ) : (
              <>
                <div
                  className={`workspace-heading ${root === props.workspace ? "selected" : ""}`}
                  draggable
                  onDragStart={(e) => begin(e, "project", root, root)}
                  onDragEnd={() => {
                    setDrag(null);
                    setTarget("");
                  }}
                >
                  <button
                    className="workspace-collapse"
                    aria-label={`Toggle ${shortPath(root)}`}
                    aria-expanded={!folded[root]}
                    onClick={() => {
                      const next = { ...folded, [root]: !folded[root] };
                      setFolded(next);
                      try {
                        localStorage.setItem(
                          "muse-project-folds",
                          JSON.stringify(next),
                        );
                      } catch {}
                    }}
                  >
                    <ChevronDown
                      size={11}
                      className={folded[root] ? "closed" : ""}
                    />
                  </button>
                  <button
                    className="workspace-name"
                    title={root || "Conversations without a project folder"}
                    disabled={props.busy}
                    onKeyDown={(e) => keyboardOrder(e, "project", root, root)}
                    onClick={() =>
                      root
                        ? props.onProject(root)
                        : setFolded((prev) => ({
                            ...prev,
                            [root]: !prev[root],
                          }))
                    }
                  >
                    <Folder size={13} />
                    <b>{shortPath(root)}</b>
                    <small>{rows.length}</small>
                  </button>
                  <div className="project-actions">
                    {root && (
                      <button
                        className="icon-button"
                        title={`Hide ${shortPath(root)} from projects; keep its files and chats`}
                        onClick={() => props.onHide(root)}
                      >
                        <X size={11} />
                      </button>
                    )}
                    <button
                      className="icon-button"
                      title={`New conversation in ${root ? shortPath(root) : "workspace"}`}
                      disabled={props.busy}
                      onClick={() => props.onNew(root)}
                    >
                      <Plus size={12} />
                    </button>
                  </div>
                </div>
                {!folded[root] && (
                  <div className="project-conversations">
                    {rows.map((row) => (
                      <div
                        className={`session-row-wrap ${drag?.kind === "chat" && target === row.sessionId ? "drop-target" : ""}`}
                        key={row.sessionId}
                        draggable
                        onDragStart={(e) => {
                          e.stopPropagation();
                          begin(e, "chat", row.sessionId, root);
                        }}
                        onDragEnd={() => {
                          setDrag(null);
                          setTarget("");
                        }}
                        onDragOver={(e) => {
                          if (drag?.kind === "chat") {
                            e.preventDefault();
                            e.stopPropagation();
                            setTarget(row.sessionId);
                          }
                        }}
                        onDrop={(e) => drop(e, "chat", row.sessionId, root)}
                      >
                        <button
                          className={`session-row ${row.sessionId === props.session ? "active" : ""} ${props.turns[row.sessionId] || row.status === "running" ? "running" : props.completed[row.sessionId] ? "done" : ""}`}
                          disabled={props.busy}
                          onClick={() => props.onSelect(row.sessionId)}
                          onKeyDown={(e) =>
                            keyboardOrder(e, "chat", row.sessionId, root)
                          }
                          title={sessionTitle(row)}
                        >
                          {props.turns[row.sessionId] ||
                          row.status === "running" ? (
                            <Loader2 className="spin" size={11} />
                          ) : props.completed[row.sessionId] ? (
                            <Check size={11} />
                          ) : (
                            <MessageSquare size={10} />
                          )}
                          <span>
                            <b>{sessionTitle(row)}</b>
                            <small>
                              {props.turns[row.sessionId]
                                ? "Working…"
                                : props.completed[row.sessionId] ||
                                  ago(row.lastActivityAt || row.updatedAt)}
                            </small>
                          </span>
                          {row.attention && (
                            <i
                              className="attention-dot"
                              title="Needs attention"
                            />
                          )}
                        </button>
                        <button
                          className="icon-button session-more"
                          aria-label="Conversation actions"
                          title={`Actions for ${sessionTitle(row)}`}
                          onClick={() => props.onActions(row)}
                        >
                          <MoreHorizontal size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </>
            )}
          </section>
        ))}
        {!props.loading && !props.sessions.length && !props.collapsed && (
          <div className="sidebar-empty">
            <MessageSquare size={18} />
            <p>Your ideas start here.</p>
            <small>Start with a project or no folder.</small>
          </div>
        )}
      </nav>
      {!props.collapsed && notice && (
        <div className="sidebar-notice" role="status">
          <span>{notice}</span>
          <button
            className="icon-button"
            aria-label="Dismiss reorder notice"
            onClick={() => setNotice("")}
          >
            <X size={12} />
          </button>
        </div>
      )}
      <div className="sidebar-bottom">
        {props.updateAvailable && (
          <button
            className="sidebar-link update-link"
            title="A new Muse Desktop version is available"
            onClick={props.onUpdates}
          >
            <Download size={14} />
            {!props.collapsed && "Update available"}
          </button>
        )}
        <button
          className="account-button sidebar-account"
          title={props.accountName}
          aria-label={`Muse account: ${props.accountName}`}
          onClick={props.onAccount}
        >
          <span
            className={`account-avatar ${props.signedIn ? "connected" : ""}`}
          >
            <UserRound size={14} />
          </span>
          {!props.collapsed && (
            <span>
              <b>{props.accountName}</b>
              <small>
                {props.signedIn
                  ? "Using your CLI sign-in"
                  : "Connect Muse Code"}
              </small>
            </span>
          )}
        </button>
        <div className="usage-section sidebar-usage">
          {!props.collapsed && (
            <div className="sidebar-usage-heading">
              <span>Subscription usage</span>
              <button
                className="icon-button"
                title="Refresh subscription usage"
                disabled={props.usageLoading}
                onClick={props.onUsage}
              >
                <RefreshCw
                  size={11}
                  className={props.usageLoading ? "spin" : ""}
                />
              </button>
            </div>
          )}
          {[
            ["Current window", props.usage?.window],
            ["Weekly", props.usage?.weekly],
          ]
            .filter(
              ([, block]: any) => block && Number.isFinite(block.usedPercent),
            )
            .map(([label, block]: any) => (
              <div
                className="usage-meter"
                key={label}
                title={`${label}: ${block.usedPercent}%. Resets ${new Date(block.resetsAtMs).toLocaleString()}`}
              >
                {!props.collapsed && (
                  <div>
                    <span>{label}</span>
                    <b>{block.usedPercent}%</b>
                  </div>
                )}
                <div className="meter-track">
                  <i
                    style={{
                      width: `${Math.max(0, Math.min(100, block.usedPercent))}%`,
                    }}
                  />
                </div>
              </div>
            ))}
          {!props.usage && !props.collapsed && (
            <small className="usage-empty">
              {props.usageLoading
                ? "Refreshing usage…"
                : "No usage reported yet"}
            </small>
          )}
          {!props.collapsed && props.usageChecked && (
            <small className="usage-asof">
              Checked{" "}
              {new Date(props.usageChecked).toLocaleTimeString([], {
                hour: "2-digit",
                minute: "2-digit",
              })}
            </small>
          )}
          {props.usageError && !props.collapsed && (
            <small className="usage-error" role="alert">
              {props.usageError}
            </small>
          )}
        </div>
        <div className="sidebar-footer-actions">
          <button
            className="sidebar-link"
            title="Muse CLI"
            onClick={props.onTerminal}
          >
            <Terminal size={14} />
            {!props.collapsed && <span>Muse CLI</span>}
          </button>
          <button
            className="sidebar-link"
            title="Settings"
            onClick={props.onSettings}
          >
            <Settings2 size={14} />
            {!props.collapsed && (
              <>
                <span>Settings</span>
                <kbd>{/Mac/i.test(navigator.platform) ? "⌘" : "Ctrl"} ,</kbd>
              </>
            )}
          </button>
        </div>
      </div>
    </aside>
  );
});
