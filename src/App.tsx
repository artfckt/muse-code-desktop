import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Bot,
  Check,
  ChevronDown,
  CircleStop,
  Code2,
  FolderOpen,
  Gauge,
  GitBranch,
  Loader2,
  LockKeyhole,
  LogIn,
  MessageSquarePlus,
  RefreshCw,
  Send,
  ShieldCheck,
  Sparkles,
  TerminalSquare,
  User,
  X,
  Zap,
} from "lucide-react";

type UiMessage = {
  id: string;
  role: "user" | "assistant" | "system" | "tool";
  text: string;
  meta?: string;
};

type SessionView = {
  id: string;
  title: string;
  updated?: string;
  status?: string;
  raw: any;
};

const efforts = ["minimal", "low", "medium", "high", "xhigh", "max", "ultra"];
const approvalModes = [
  { id: "onRequest", label: "Ask when needed" },
  { id: "promptUnmatched", label: "Prompt unmatched" },
  { id: "denyUnmatched", label: "Deny unmatched" },
];

function asRecord(value: any): Record<string, any> {
  return value && typeof value === "object" ? value : {};
}

function sessionId(row: any): string {
  return String(row?.sessionId || row?.id || row?.session?.sessionId || "");
}

function normalizeSessions(raw: any): SessionView[] {
  const root = Array.isArray(raw) ? raw : raw?.sessions;
  if (!Array.isArray(root)) return [];
  return root
    .map((row: any) => {
      const id = sessionId(row);
      if (!id) return null;
      const title =
        row?.name ||
        row?.title ||
        row?.displayName ||
        row?.lastUserMessage ||
        `Session ${id.slice(0, 8)}`;
      return {
        id,
        title: String(title),
        updated: row?.updatedAt || row?.lastActivityAt || row?.createdAt,
        status: row?.status,
        raw: row,
      };
    })
    .filter(Boolean) as SessionView[];
}

function normalizeModels(raw: any): Array<{ id: string; label: string; raw: any }> {
  const root = Array.isArray(raw) ? raw : raw?.models;
  if (!Array.isArray(root)) return [];
  return root
    .map((row: any) => {
      if (typeof row === "string") return { id: row, label: row, raw: row };
      const id = row?.id || row?.modelId || row?.name;
      if (!id) return null;
      return {
        id: String(id),
        label: String(row?.displayName || row?.label || row?.name || id),
        raw: row,
      };
    })
    .filter(Boolean) as Array<{ id: string; label: string; raw: any }>;
}

function itemText(item: any): string {
  if (!item) return "";
  if (typeof item.text === "string") return item.text;
  if (typeof item.content === "string") return item.content;
  if (typeof item.message === "string") return item.message;
  if (typeof item.output === "string") return item.output;
  if (Array.isArray(item.content)) {
    return item.content
      .map((part: any) => (typeof part === "string" ? part : part?.text || part?.content || ""))
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function eventToMessage(event: any, fallbackIndex = 0): UiMessage | null {
  const method = String(event?.method || "");
  const params = asRecord(event?.params);
  const item = params.item || params;
  const kind = String(item?.kind || item?.type || "");
  const id = String(item?.itemId || item?.id || params?.itemId || `${method}-${fallbackIndex}`);
  const text = itemText(item);

  if ((method === "item/completed" || method === "item/started") && text) {
    const lower = kind.toLowerCase();
    const role: UiMessage["role"] = lower.includes("user")
      ? "user"
      : lower.includes("assistant") || lower.includes("agent") || lower.includes("message")
        ? "assistant"
        : lower.includes("tool") || lower.includes("command")
          ? "tool"
          : "system";

    return {
      id,
      role,
      text,
      meta: kind || method,
    };
  }

  if (method === "turn/failed") {
    return {
      id: `failed-${id}`,
      role: "system",
      text: String(params?.error?.message || params?.message || "Muse turn failed."),
      meta: "error",
    };
  }

  return null;
}

function pageToMessages(raw: any): UiMessage[] {
  const events = Array.isArray(raw?.events) ? [...raw.events].reverse() : [];
  const seen = new Set<string>();
  const messages: UiMessage[] = [];
  events.forEach((event, index) => {
    const message = eventToMessage(event, index);
    if (!message || seen.has(message.id)) return;
    seen.add(message.id);
    messages.push(message);
  });
  return messages;
}

function usageData(raw: any) {
  const usage = raw?.usage || raw || {};
  const short = usage?.window || usage?.rollingWindow || {};
  const weekly = usage?.weekly || usage?.weeklyWindow || {};
  const pct = (value: any) => Math.max(0, Math.min(100, Number(value || 0)));
  return {
    tier: String(usage?.tier || usage?.plan || "Muse Code"),
    short: pct(short?.usedPercent ?? short?.percentUsed),
    weekly: pct(weekly?.usedPercent ?? weekly?.percentUsed),
  };
}

function approvalChoices(approval: any) {
  const choices = approval?.choices || approval?.options || approval?.requirement?.choices || [];
  return Array.isArray(choices) ? choices : [];
}

function findChoice(approval: any, allow: boolean): string {
  const choices = approvalChoices(approval);
  const wanted = allow ? /allow|approve|yes|once|accept/i : /reject|deny|no|cancel/i;
  const hit = choices.find((choice: any) =>
    wanted.test(String(choice?.label || choice?.name || choice?.id || choice))
  );
  if (typeof hit === "string") return hit;
  if (hit?.id) return String(hit.id);
  return allow ? "allowOnce" : "reject";
}

function compactPath(value: string) {
  if (value.length < 48) return value;
  return `…${value.slice(-47)}`;
}

export default function App() {
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [workspace, setWorkspace] = useState("");
  const [sessions, setSessions] = useState<SessionView[]>([]);
  const [activeSession, setActiveSession] = useState("");
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [models, setModels] = useState<Array<{ id: string; label: string; raw: any }>>([]);
  const [modelId, setModelId] = useState("");
  const [reasoning, setReasoning] = useState("medium");
  const [approvalMode, setApprovalMode] = useState("onRequest");
  const [usage, setUsage] = useState(usageData({}));
  const [pending, setPending] = useState<any[]>([]);
  const [prompt, setPrompt] = useState("");
  const [working, setWorking] = useState(false);
  const [activeTurnId, setActiveTurnId] = useState<string | null>(null);
  const [status, setStatus] = useState("Ready");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const endRef = useRef<HTMLDivElement | null>(null);

  const active = useMemo(
    () => sessions.find((session) => session.id === activeSession) || null,
    [sessions, activeSession]
  );

  const refreshDiagnostic = useCallback(async () => {
    try {
      setDiagnostic(await window.muse.diagnose());
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }, []);

  const refreshUsage = useCallback(async () => {
    if (!workspace) return;
    try {
      setUsage(usageData(await window.muse.usage()));
    } catch {
      // usage/read can be empty until Muse sees a subscription window.
    }
  }, [workspace]);

  const refreshSessions = useCallback(async () => {
    if (!workspace) return;
    try {
      setSessions(normalizeSessions(await window.muse.listSessions()));
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }, [workspace]);

  const refreshPending = useCallback(async (id?: string) => {
    const target = id || activeSession;
    if (!target) {
      setPending([]);
      return;
    }
    try {
      const raw = await window.muse.pending(target);
      setPending(Array.isArray(raw?.approvals) ? raw.approvals : []);
    } catch {
      setPending([]);
    }
  }, [activeSession]);

  const refreshModels = useCallback(async (id?: string) => {
    if (!workspace) return;
    try {
      const list = normalizeModels(await window.muse.listModels(id || activeSession || null));
      setModels(list);
      if (!modelId && list[0]) setModelId(list[0].id);
    } catch {
      // Model list is optional while the session host warms up.
    }
  }, [workspace, activeSession, modelId]);

  const loadSession = useCallback(async (id: string) => {
    setBusy(true);
    setError("");
    try {
      await window.muse.resumeSession(id);
      const page = await window.muse.viewPage(id);
      setActiveSession(id);
      setMessages(pageToMessages(page));
      await Promise.all([refreshPending(id), refreshModels(id), refreshUsage()]);
      setStatus("Session resumed");
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }, [refreshPending, refreshModels, refreshUsage]);

  const hydrateWorkspace = useCallback(async (cwd: string) => {
    setWorkspace(cwd);
    setMessages([]);
    setActiveSession("");
    setStatus("Connected to Muse Code");
    await refreshDiagnostic();
    const [sessionRaw, modelRaw, usageRaw] = await Promise.allSettled([
      window.muse.listSessions(),
      window.muse.listModels(null),
      window.muse.usage(),
    ]);
    if (sessionRaw.status === "fulfilled") setSessions(normalizeSessions(sessionRaw.value));
    if (modelRaw.status === "fulfilled") {
      const list = normalizeModels(modelRaw.value);
      setModels(list);
      if (list[0]) setModelId(list[0].id);
    }
    if (usageRaw.status === "fulfilled") setUsage(usageData(usageRaw.value));
  }, [refreshDiagnostic]);

  async function chooseWorkspace() {
    setBusy(true);
    setError("");
    try {
      const result = await window.muse.chooseWorkspace();
      if (!result?.workspace) return;
      await hydrateWorkspace(result.workspace);
    } catch (err: any) {
      setError(String(err?.message || err));
      setStatus("Muse connection failed");
    } finally {
      setBusy(false);
    }
  }

  async function openLogin() {
    setError("");
    setBusy(true);
    setStatus("Opening Muse sign-in…");
    try {
      const result = await window.muse.login();
      setStatus(result?.message || "Muse sign-in terminal opened");

      // Refresh quickly so the UI can reflect credentials after the browser flow completes.
      window.setTimeout(() => void refreshDiagnostic(), 2500);
      window.setTimeout(() => void refreshDiagnostic(), 7000);
    } catch (err: any) {
      const message = String(err?.message || err);
      setError(message);
      setStatus("Could not open Muse sign-in");
    } finally {
      setBusy(false);
    }
  }

  async function createSession() {
    if (!workspace) {
      await chooseWorkspace();
      return "";
    }
    const result = await window.muse.startSession({
      modelId: modelId || undefined,
      approvalMode,
    });
    const id = result.sessionId;
    setActiveSession(id);
    setMessages([]);
    setPending([]);
    setStatus("New Muse session");
    await refreshSessions();
    return id;
  }

  async function sendPrompt() {
    const text = prompt.trim();
    if (!text || busy) return;
    setBusy(true);
    setError("");
    try {
      let id = activeSession;
      if (!id) id = await createSession();
      if (!id) return;

      if (text.startsWith("!")) {
        setMessages((current) => [
          ...current,
          { id: `local-shell-${Date.now()}`, role: "user", text },
        ]);
        await window.muse.userShell(id, text.slice(1).trim());
      } else {
        setMessages((current) => [
          ...current,
          { id: `local-user-${Date.now()}`, role: "user", text },
        ]);
        const ack = await window.muse.sendTurn({
          sessionId: id,
          text,
          reasoningEffort: reasoning,
          ifBusy: working ? "queue" : "queue",
        });
        setActiveTurnId(ack?.turnId || null);
      }

      setPrompt("");
      setWorking(true);
      setStatus("Muse is working…");
    } catch (err: any) {
      setError(String(err?.message || err));
      setWorking(false);
    } finally {
      setBusy(false);
    }
  }

  async function stopTurn() {
    if (!activeSession) return;
    try {
      await window.muse.interrupt(activeSession, activeTurnId);
      setWorking(false);
      setStatus("Turn interrupted");
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  async function decide(approval: any, allow: boolean) {
    if (!activeSession) return;
    setBusy(true);
    try {
      await window.muse.decideApproval({
        sessionId: activeSession,
        approvalId: approval?.approvalId || approval?.id,
        requirementId: approval?.requirementId || approval?.requirement?.id || null,
        choiceId: findChoice(approval, allow),
      });
      await refreshPending();
    } catch (err: any) {
      setError(String(err?.message || err));
    } finally {
      setBusy(false);
    }
  }

  async function changeModel(value: string) {
    setModelId(value);
    if (!activeSession) return;
    const model = models.find((item) => item.id === value);
    try {
      await window.muse.setModel(activeSession, model?.raw || value);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  async function changeApproval(value: string) {
    setApprovalMode(value);
    if (!activeSession) return;
    try {
      await window.muse.setApprovalMode(activeSession, value);
    } catch (err: any) {
      setError(String(err?.message || err));
    }
  }

  useEffect(() => {
    void refreshDiagnostic();

    const offEvent = window.muse.onEvent((event) => {
      const method = String(event?.method || "");
      const params = asRecord(event?.params);

      if (method === "turn/started") {
        setWorking(true);
        setActiveTurnId(String(params?.turnId || "") || null);
        setStatus("Muse is working…");
      }
      if (method === "turn/completed" || method === "turn/failed" || method === "turn/cancelled") {
        setWorking(false);
        setActiveTurnId(null);
        setStatus(method === "turn/completed" ? "Ready" : "Turn stopped");
        void refreshUsage();
        void refreshPending();
        void refreshSessions();
      }
      if (method.includes("approval")) {
        void refreshPending();
      }

      const message = eventToMessage(event, Date.now());
      if (message) {
        setMessages((current) => {
          if (current.some((item) => item.id === message.id)) {
            return current.map((item) => (item.id === message.id ? message : item));
          }
          return [...current, message];
        });
      }
    });

    const offStderr = window.muse.onStderr((text) => {
      if (/error|failed|unauthor|login/i.test(text)) setStatus(text);
    });

    const offExit = window.muse.onHostExit(() => {
      setWorking(false);
      setStatus("Muse host stopped");
    });

    const offProtocol = window.muse.onProtocolError((text) => {
      setError(`Muse protocol error: ${text}`);
    });

    return () => {
      offEvent();
      offStderr();
      offExit();
      offProtocol();
    };
  }, [refreshDiagnostic, refreshPending, refreshSessions, refreshUsage]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, working]);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark"><Sparkles size={18} /></div>
          <div>
            <strong>Muse Desktop</strong>
            <span>subscription client</span>
          </div>
        </div>

        <button className="primary-btn project-btn" onClick={chooseWorkspace} disabled={busy}>
          <FolderOpen size={17} />
          <span>{workspace ? "Change project" : "Open project"}</span>
        </button>

        {workspace && (
          <div className="workspace-card">
            <Code2 size={15} />
            <span title={workspace}>{compactPath(workspace)}</span>
          </div>
        )}

        <div className="sidebar-section">
          <div className="section-heading">
            <span>Sessions</span>
            <div className="section-actions">
              <button title="Refresh sessions" onClick={() => void refreshSessions()}>
                <RefreshCw size={14} />
              </button>
              <button title="New session" onClick={() => void createSession()} disabled={!workspace}>
                <MessageSquarePlus size={15} />
              </button>
            </div>
          </div>

          <div className="session-list">
            {sessions.length === 0 && (
              <div className="empty-small">
                {workspace ? "No sessions in this project yet." : "Open a project to see Muse sessions."}
              </div>
            )}
            {sessions.map((session) => (
              <button
                key={session.id}
                className={`session-row ${activeSession === session.id ? "active" : ""}`}
                onClick={() => void loadSession(session.id)}
              >
                <span className="session-dot" />
                <span className="session-copy">
                  <strong>{session.title}</strong>
                  <small>{session.status || session.id.slice(0, 10)}</small>
                </span>
              </button>
            ))}
          </div>
        </div>

        <div className="account-card">
          <div className="account-line">
            <div className={`status-dot ${diagnostic?.cliInstalled ? "ok" : "bad"}`} />
            <div>
              <strong>
                {diagnostic?.authConfigPresent
                  ? "Muse account detected"
                  : diagnostic?.cliInstalled
                    ? "Muse CLI detected"
                    : "Muse CLI missing"}
              </strong>
              <span>
                {diagnostic?.authConfigPresent
                  ? "Browser sign-in credentials found"
                  : diagnostic?.version || "Install Muse Code first"}
              </span>
            </div>
          </div>
          <div className="subscription-row">
            <LockKeyhole size={14} />
            <span>{usage.tier}</span>
            <em>No API key</em>
          </div>
          <button className="ghost-btn login-btn" onClick={openLogin} disabled={busy}>
            {busy ? <Loader2 className="spin" size={15} /> : <LogIn size={15} />}
            {diagnostic?.authConfigPresent ? "Reopen Muse sign-in" : "Sign in with Muse Code"}
          </button>
        </div>
      </aside>

      <main className="main-panel">
        <header className="topbar">
          <div className="topbar-title">
            <div className="eyebrow">{workspace ? "LOCAL WORKSPACE" : "MUSE CODE DESKTOP"}</div>
            <h1>{active?.title || (workspace ? "New Muse session" : "Choose a project")}</h1>
          </div>

          <div className="toolbar">
            <div className="usage-chip">
              <Gauge size={15} />
              <div>
                <span>5h</span>
                <b>{Math.round(usage.short)}%</b>
              </div>
              <div className="mini-meter"><i style={{ width: `${usage.short}%` }} /></div>
            </div>
            <div className="usage-chip">
              <Activity size={15} />
              <div>
                <span>Week</span>
                <b>{Math.round(usage.weekly)}%</b>
              </div>
              <div className="mini-meter"><i style={{ width: `${usage.weekly}%` }} /></div>
            </div>
            <button className="icon-btn" title="Refresh status" onClick={() => void refreshDiagnostic()}>
              <RefreshCw size={16} />
            </button>
          </div>
        </header>

        <section className="content">
          {!workspace ? (
            <div className="welcome">
              <div className="hero-orb"><Sparkles size={34} /></div>
              <div className="hero-badge"><ShieldCheck size={14} /> Uses your Muse Code subscription</div>
              <h2>Muse Code, without living in the terminal.</h2>
              <p>
                Open a local project, keep the official Muse login and subscription, then work with sessions,
                approvals, models and usage from one desktop interface.
              </p>
              <div className="welcome-actions">
                <button className="primary-btn large" onClick={chooseWorkspace}>
                  <FolderOpen size={18} /> Open a project
                </button>
                <button className="ghost-btn large" onClick={openLogin} disabled={busy}>
                  {busy ? <Loader2 className="spin" size={18} /> : <LogIn size={18} />}
                  Sign in with Muse
                </button>
              </div>
              <div className="feature-grid">
                <div><TerminalSquare /><strong>Official CLI</strong><span>Runs muse serve locally</span></div>
                <div><LockKeyhole /><strong>Your subscription</strong><span>No API key billing</span></div>
                <div><ShieldCheck /><strong>Approvals visible</strong><span>Allow or reject explicitly</span></div>
              </div>
            </div>
          ) : (
            <>
              <div className="chat-scroll">
                {messages.length === 0 && (
                  <div className="session-empty">
                    <div className="empty-icon"><Bot size={25} /></div>
                    <h3>{activeSession ? "Continue this Muse session" : "Start with a task"}</h3>
                    <p>Describe what you want changed in this project. Muse will use the same account and subscription as the CLI.</p>
                    <div className="suggestions">
                      <button onClick={() => setPrompt("Analyze this project and explain its architecture.")}>Analyze project</button>
                      <button onClick={() => setPrompt("Find the most important bugs and fix them.")}>Find & fix bugs</button>
                      <button onClick={() => setPrompt("Run the project, inspect the UI, and improve the user experience.")}>Improve UI/UX</button>
                    </div>
                  </div>
                )}

                {messages.map((message) => (
                  <article key={message.id} className={`message ${message.role}`}>
                    <div className="message-avatar">
                      {message.role === "user" ? <User size={15} /> : message.role === "tool" ? <TerminalSquare size={15} /> : <Sparkles size={15} />}
                    </div>
                    <div className="message-body">
                      <div className="message-label">
                        {message.role === "user" ? "You" : message.role === "tool" ? "Tool" : "Muse"}
                        {message.meta && <span>{message.meta}</span>}
                      </div>
                      <div className="message-text">{message.text}</div>
                    </div>
                  </article>
                ))}

                {working && (
                  <div className="working-row">
                    <Loader2 className="spin" size={16} />
                    <span>Muse is working in the project…</span>
                    <button onClick={stopTurn}><CircleStop size={14} /> Stop</button>
                  </div>
                )}
                <div ref={endRef} />
              </div>

              {pending.length > 0 && (
                <div className="approval-stack">
                  {pending.map((approval, index) => (
                    <div className="approval-card" key={approval?.approvalId || approval?.id || index}>
                      <div className="approval-icon"><ShieldCheck size={18} /></div>
                      <div className="approval-copy">
                        <strong>Muse needs your approval</strong>
                        <span>
                          {approval?.description ||
                            approval?.title ||
                            approval?.requirement?.description ||
                            "A protected action is waiting for your decision."}
                        </span>
                        {approval?.command && <code>{approval.command}</code>}
                      </div>
                      <div className="approval-actions">
                        <button className="reject" onClick={() => void decide(approval, false)}><X size={15} /> Reject</button>
                        <button className="allow" onClick={() => void decide(approval, true)}><Check size={15} /> Allow once</button>
                      </div>
                    </div>
                  ))}
                </div>
              )}

              <div className="composer-wrap">
                <div className="composer">
                  <textarea
                    value={prompt}
                    onChange={(event) => setPrompt(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter" && !event.shiftKey) {
                        event.preventDefault();
                        void sendPrompt();
                      }
                    }}
                    placeholder="Ask Muse to build, debug, edit or inspect this project…"
                    rows={3}
                  />
                  <div className="composer-bottom">
                    <div className="composer-options">
                      <label>
                        <Sparkles size={14} />
                        <select value={modelId} onChange={(event) => void changeModel(event.target.value)}>
                          {models.length === 0 && <option value="">Muse default model</option>}
                          {models.map((model) => <option key={model.id} value={model.id}>{model.label}</option>)}
                        </select>
                        <ChevronDown size={13} />
                      </label>
                      <label>
                        <Zap size={14} />
                        <select value={reasoning} onChange={(event) => setReasoning(event.target.value)}>
                          {efforts.map((effort) => <option value={effort} key={effort}>{effort} reasoning</option>)}
                        </select>
                        <ChevronDown size={13} />
                      </label>
                      <label>
                        <ShieldCheck size={14} />
                        <select value={approvalMode} onChange={(event) => void changeApproval(event.target.value)}>
                          {approvalModes.map((mode) => <option value={mode.id} key={mode.id}>{mode.label}</option>)}
                        </select>
                        <ChevronDown size={13} />
                      </label>
                    </div>

                    {working ? (
                      <button className="stop-btn" onClick={stopTurn}>
                        <CircleStop size={16} /> Stop
                      </button>
                    ) : (
                      <button className="send-btn" onClick={() => void sendPrompt()} disabled={!prompt.trim() || busy}>
                        {busy ? <Loader2 className="spin" size={16} /> : <Send size={16} />}
                        Send
                      </button>
                    )}
                  </div>
                </div>
                <div className="composer-note">
                  <GitBranch size={13} />
                  <span>{status}</span>
                  <span className="dot-sep">•</span>
                  <span>Billing: Muse Code subscription</span>
                  <span className="dot-sep">•</span>
                  <span>No API key stored</span>
                </div>
              </div>
            </>
          )}
        </section>

        {error && (
          <div className="error-toast">
            <X size={16} />
            <div><strong>Something needs attention</strong><span>{error}</span></div>
            <button onClick={() => setError("")}>Dismiss</button>
          </div>
        )}
      </main>
    </div>
  );
}
