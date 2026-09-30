import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from "react";
import {
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  ChevronsUpDown,
  CircleStop,
  Code2,
  Command,
  ExternalLink,
  Folder,
  FolderOpen,
  GitBranch,
  ImagePlus,
  Layers3,
  Loader2,
  LogIn,
  MessageSquare,
  PanelRight,
  Plus,
  RefreshCw,
  Search,
  Settings2,
  ShieldCheck,
  Sparkles,
  Terminal,
  X,
  Zap,
} from "lucide-react";
import {
  ApprovalCard,
  MuseMark,
  QuestionCard,
  TranscriptItem,
} from "./components";
import {
  historyItems,
  sessionTitle,
  subscriptionUsage,
  Transcript,
  type MuseEvent,
  type MuseItem,
} from "./protocol";
import {
  applyTheme,
  readThemePreference,
  resolveTheme,
  saveThemePreference,
  themes,
} from "./themes";
const NativeTerminal = lazy(() => import("./NativeTerminal"));

const efforts = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
  "max",
  "ultra",
];
const modes = [
  { id: "", label: "CLI default" },
  { id: "onRequest", label: "Ask when needed" },
  { id: "promptUnmatched", label: "Review unmatched" },
  { id: "denyUnmatched", label: "Deny unmatched" },
];
const suggestions = [
  {
    icon: Code2,
    title: "Build something new",
    text: "Turn an idea into working code",
    prompt:
      "Help me build a new feature in this project. First inspect the code and ask me what I want to create.",
  },
  {
    icon: Search,
    title: "Find the missing piece",
    text: "Understand, debug, and improve",
    prompt:
      "Analyze this project, identify the most important bugs, and propose fixes before making changes.",
  },
  {
    icon: Layers3,
    title: "Refine the experience",
    text: "Make every interaction feel right",
    prompt:
      "Inspect the UI and user flows of this project. Plan improvements to usability and visual consistency.",
  },
];
type ImageAttachment = {
  name: string;
  mediaType: string;
  base64Data: string;
  preview: string;
};
function basename(value: string) {
  return value.split(/[\\/]/).filter(Boolean).pop() || "Workspace";
}
function timeAgo(value: string) {
  const mins = Math.floor((Date.now() - new Date(value).getTime()) / 60000);
  return mins < 1
    ? "Just now"
    : mins < 60
      ? `${mins}m ago`
      : mins < 1440
        ? `${Math.floor(mins / 60)}h ago`
        : new Date(value).toLocaleDateString(undefined, {
            month: "short",
            day: "numeric",
          });
}

export default function App() {
  const [themePreference, setThemePreference] = useState(readThemePreference);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const theme = resolveTheme(themePreference, systemDark);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    applyTheme(theme);
    saveThemePreference(themePreference);
    void window.muse
      .setWindowTheme?.({
        background: theme.colors.bg,
        foreground: theme.colors.text,
      })
      .catch(() => {});
  }, [theme, themePreference]);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [workspace, setWorkspace] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [session, setSession] = useState("");
  const [items, setItems] = useState<MuseItem[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState("");
  const [reasoning, setReasoning] = useState("default");
  const [approvalMode, setApprovalMode] = useState("");
  const [usage, setUsage] = useState<any>(null);
  const [pending, setPending] = useState<{
    approvals: any[];
    userInputs: any[];
  }>({ approvals: [], userInputs: [] });
  const [skills, setSkills] = useState<any[]>([]);
  const [prompt, setPrompt] = useState("");
  const [images, setImages] = useState<ImageAttachment[]>([]);
  const [turns, setTurns] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connecting to Muse Code…");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<
    "settings" | "account" | "help" | "rename" | null
  >(null);
  const [login, setLogin] = useState<any>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [inspector, setInspector] = useState(true);
  const [tab, setTab] = useState<"conversation" | "activity" | "terminal">(
    "conversation",
  );
  const [terminalOpened, setTerminalOpened] = useState(false);
  function openTerminal() {
    setTerminalOpened(true);
    setTab("terminal");
  }
  const [search, setSearch] = useState("");
  const [rename, setRename] = useState("");
  const [logs, setLogs] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const activeRef = useRef("");
  const workspaceRef = useRef("");
  const stores = useRef(new Map<string, Transcript>());
  const buffering = useRef<MuseEvent[] | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const working = !!turns[session];
  const active = sessions.find((row) => row.sessionId === session);
  const account = diagnostic?.account;
  const signedIn = account?.state === "accountLogin";
  const accountName = signedIn
    ? account.label || "Muse account"
    : account?.state === "apiKey" || account?.state === "envKey"
      ? "API key detected"
      : diagnostic?.cliInstalled
        ? "Connect your Muse account"
        : diagnostic
          ? "Muse CLI unavailable"
          : "Checking your account…";
  const tasks = items.filter((item) =>
    ["toolCall", "userShell", "subagent", "workflow"].includes(item.kind),
  );
  const showItems = tab === "activity" ? tasks : items;

  const refreshAccount = useCallback(async () => {
    const result = await window.muse.diagnose();
    setDiagnostic(result);
    if (result.error) setStatus("Muse needs attention");
    else
      setStatus(
        result.account?.state === "accountLogin"
          ? "Muse Code connected"
          : "Ready",
      );
    return result;
  }, []);
  const refreshSessions = useCallback(async () => {
    if (workspaceRef.current)
      setSessions((await window.muse.listSessions()).sessions || []);
  }, []);
  const refreshPending = useCallback(async () => {
    const id = activeRef.current;
    if (!id) return;
    const result = await window.muse.pending(id);
    if (activeRef.current === id)
      setPending({
        approvals: result.approvals || [],
        userInputs: result.userInputs || [],
      });
  }, []);
  const refreshUsage = useCallback(
    async () => setUsage(subscriptionUsage(await window.muse.usage())),
    [],
  );
  async function run(action: () => Promise<any>) {
    setBusy(true);
    setError("");
    try {
      return await action();
    } catch (err: any) {
      setError(err.message || String(err));
      return null;
    } finally {
      setBusy(false);
    }
  }
  function selectSession(id: string) {
    activeRef.current = id;
    setSession(id);
    setReadOnly(false);
    setNextCursor(null);
  }
  function storeFor(id: string) {
    if (!stores.current.has(id)) stores.current.set(id, new Transcript());
    return stores.current.get(id)!;
  }
  async function hydrateWorkspace(cwd: string) {
    workspaceRef.current = cwd;
    setWorkspace(cwd);
    selectSession("");
    setItems([]);
    setPending({ approvals: [], userInputs: [] });
    setSkills([]);
    setPrompt("");
    setImages([]);
    const results = await Promise.allSettled([
      window.muse.listSessions(),
      window.muse.listModels(),
      window.muse.usage(),
      refreshAccount(),
    ]);
    if (results[0].status === "fulfilled")
      setSessions(results[0].value.sessions || []);
    if (results[1].status === "fulfilled") {
      const list = results[1].value.models || [];
      setModels(list);
      setModelId(
        (list.find((row: any) => row.isDefault) || list[0])?.modelId || "",
      );
    }
    if (results[2].status === "fulfilled")
      setUsage(subscriptionUsage(results[2].value));
    setStatus("Project connected");
  }
  async function chooseWorkspace() {
    await run(async () => {
      const result = await window.muse.chooseWorkspace();
      if (result) await hydrateWorkspace(result.workspace);
    });
  }
  async function createSession() {
    const result = await window.muse.startSession({
      modelId: modelId || undefined,
      approvalMode: approvalMode || undefined,
    });
    const id = result.sessionId;
    selectSession(id);
    storeFor(id).seed([]);
    setItems([]);
    setPending({ approvals: [], userInputs: [] });
    setTab("conversation");
    await Promise.allSettled([
      refreshSessions(),
      window.muse.listSkills(id).then((raw) => setSkills(raw.skills || [])),
    ]);
    return id;
  }
  async function loadSession(id: string) {
    await run(async () => {
      const previousId = activeRef.current;
      selectSession(id);
      buffering.current = [];
      setItems([]);
      setPending({ approvals: [], userInputs: [] });
      setSkills([]);
      try {
        let result;
        try {
          result = await window.muse.resumeSession(id);
        } catch (err: any) {
          if (/sessionInUse|in use|lease/i.test(err.message)) {
            result = await window.muse.readSession(id);
            setReadOnly(true);
            setStatus(
              "This session is open in another Muse window. Close it there to continue here.",
            );
          } else throw err;
        }
        const history = historyItems(result);
        const store = storeFor(id);
        if (history) store.seed(history);
        else {
          const page = await window.muse.viewPage(id);
          store.seed([]);
          page.events?.forEach((event: MuseEvent) => store.apply(event));
          setNextCursor(page.nextCursor);
        }
        for (const event of buffering.current || []) store.apply(event);
        buffering.current = null;
        setItems(store.list());
        setModelId(result.session?.modelId || "");
        const snapshot = result.history?.snapshot?.state;
        setApprovalMode(
          result.session?.approvalMode?.mode ||
            snapshot?.approvalMode?.mode ||
            "",
        );
        setReasoning(snapshot?.reasoningEffort?.reasoningEffort || "default");
        setTurns((prev) => ({
          ...prev,
          [id]:
            result.session?.activeTurnId ||
            snapshot?.activeTurn?.turnId ||
            null,
        }));
        await Promise.allSettled([
          refreshPending(),
          window.muse.listModels(id).then((raw) => setModels(raw.models || [])),
          window.muse.listSkills(id).then((raw) => setSkills(raw.skills || [])),
          refreshUsage(),
        ]);
      } catch (err) {
        buffering.current = null;
        selectSession(previousId);
        setItems(stores.current.get(previousId)?.list() || []);
        throw err;
      }
    });
  }
  async function openLogin() {
    setModal("account");
    setLoginBusy(true);
    setError("");
    try {
      const result = await window.muse.login();
      setLogin(result);
      if (result.verificationUrl) {
        try {
          await window.muse.openExternal(result.verificationUrl);
        } catch {
          setStatus("Open the sign-in link below to continue.");
        }
      } else setStatus(result.message);
    } catch (err: any) {
      setError(err.message);
    } finally {
      setLoginBusy(false);
    }
  }
  async function stopTurn() {
    await run(async () => {
      await window.muse.interrupt(session, turns[session]);
      setStatus("Stopping…");
    });
  }
  async function sendPrompt() {
    if ((!prompt.trim() && !images.length) || busy || readOnly) return;
    await run(async () => {
      if (!workspace) {
        const result = await window.muse.chooseWorkspace();
        if (!result) return;
        await hydrateWorkspace(result.workspace);
      }
      const text = prompt.trim();
      const slash = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
      if (slash) {
        const name = slash[1],
          args = slash[2] || "";
        if (["new", "clear"].includes(name)) {
          await createSession();
          setPrompt("");
          return;
        }
        if (name === "login") {
          await openLogin();
          setPrompt("");
          return;
        }
        if (["status", "usage", "models", "skills", "help"].includes(name)) {
          setModal(name === "help" ? "help" : "settings");
          await refreshAccount();
          setPrompt("");
          return;
        }
        if (name === "resume") {
          setSearch(args);
          setPrompt("");
          setStatus("Choose a session from the sidebar.");
          return;
        }
        if (name === "terminal") {
          openTerminal();
          setPrompt("");
          return;
        }
        if (name === "stop") {
          if (session) await window.muse.interrupt(session, turns[session]);
          setPrompt("");
          return;
        }
        if (name === "compact") {
          if (session) await window.muse.compact(session);
          setPrompt("");
          return;
        }
      }
      let id = activeRef.current;
      if (!id) id = await createSession();
      if (slash) {
        const catalog = await window.muse.listSkills(id);
        setSkills(catalog.skills || []);
        if (
          !(catalog.skills || []).some(
            (skill: any) => skill.selector === slash[1],
          )
        )
          throw new Error(
            `/${slash[1]} is not available in this conversation. Use the Muse CLI tab for native commands.`,
          );
      }
      if (text.startsWith("!")) {
        await window.muse.userShell(id, text.slice(1).trim());
        setStatus("Shell command submitted");
      } else {
        const skill = slash
          ? { selector: slash[1], arguments: slash[2] || "" }
          : undefined;
        const ack = await window.muse.sendTurn({
          sessionId: id,
          text: skill ? "" : text,
          skill,
          images: images.map(({ mediaType, base64Data }) => ({
            mediaType,
            base64Data,
          })),
          reasoningEffort: reasoning === "default" ? undefined : reasoning,
          ifBusy: "queue",
        });
        setStatus(
          ack.disposition === "queued"
            ? "Follow-up queued"
            : "Muse is working…",
        );
      }
      setPrompt("");
      setImages([]);
      followRef.current = true;
    });
  }
  async function addImages(files: FileList | File[]) {
    try {
      const added = await Promise.all(
        Array.from(files).map(async (file) => {
          if (
            !["image/png", "image/jpeg", "image/webp", "image/gif"].includes(
              file.type,
            ) ||
            file.size > 10 * 1024 * 1024
          )
            throw new Error(
              "Attach PNG, JPG, WebP or GIF images smaller than 10 MB.",
            );
          const preview = await new Promise<string>((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(String(reader.result));
            reader.onerror = reject;
            reader.readAsDataURL(file);
          });
          return {
            name: file.name,
            mediaType: file.type,
            base64Data: preview.split(",")[1],
            preview,
          };
        }),
      );
      setImages((current) => [...current, ...added]);
    } catch (err: any) {
      setError(err.message);
    }
  }

  useEffect(() => {
    if (!window.muse) {
      setError(
        "Open Muse Desktop from the installed application. This page needs the desktop bridge.",
      );
      setStatus("Desktop bridge unavailable");
      return;
    }
    let alive = true;
    const ignore = (promise: Promise<any>) => {
      void promise.catch((err) => {
        if (alive) setError(err.message);
      });
    };
    const offEvent = window.muse.onEvent((event: MuseEvent) => {
      const p = event.params || {},
        method = event.method,
        id = p.sessionId;
      if (method === "account/changed") {
        setDiagnostic((prev: any) => ({ ...prev, account: p }));
        if (p.state === "accountLogin") {
          setLogin(null);
          setStatus("Muse account connected");
        }
      }
      if (method === "account/loginCompleted") {
        setLogin(null);
        setLoginBusy(false);
        if (p.outcome !== "granted" && p.outcome !== "cancelled")
          setError(p.message || `Sign-in ${p.outcome}`);
        else {
          setStatus(
            p.outcome === "granted"
              ? "Muse account connected"
              : "Sign-in cancelled",
          );
          ignore(refreshAccount());
        }
      }
      if (method === "usage/changed") setUsage(p.observedAtMs ? p : null);
      if (method === "session/listChanged" || method === "session/nameChanged")
        ignore(refreshSessions());
      if (!id) return;
      if (method === "turn/started")
        setTurns((prev) => ({ ...prev, [id]: p.turnId }));
      if (method === "turn/completed") {
        setTurns((prev) => ({
          ...prev,
          [id]: prev[id] === p.turnId ? null : prev[id],
        }));
        ignore(refreshSessions());
        if (id === activeRef.current) {
          setStatus(
            p.terminal === "completed"
              ? "Ready for your next idea"
              : `Turn ${p.terminal}`,
          );
          if (p.error)
            setError(p.error.message || p.reason || "Muse turn failed");
          ignore(refreshUsage());
        }
      }
      if (method.startsWith("item/")) {
        const store = storeFor(id);
        store.apply(event);
        if (id === activeRef.current) {
          if (buffering.current) buffering.current.push(event);
          else setItems(store.list());
        }
      }
      if (id !== activeRef.current) return;
      if (method.startsWith("approval/") || method.startsWith("userInput/"))
        ignore(refreshPending());
      if (method === "session/modelChanged") setModelId(p.modelId || "");
      if (method === "session/reasoningEffortChanged")
        setReasoning(p.reasoningEffort);
      if (method === "session/approvalModeChanged")
        setApprovalMode(p.mode || "");
      if (method === "view/gap") {
        setStatus("Restoring missed events…");
        ignore(
          window.muse.readSession(id).then((raw) => {
            if (id !== activeRef.current) return;
            const history = historyItems(raw);
            if (history) {
              storeFor(id).seed(history);
              setItems(storeFor(id).list());
            }
          }),
        );
      }
    });
    const offExit = window.muse.onHostExit(() => {
      setTurns({});
      setStatus("Muse host stopped. Refresh to reconnect.");
      setDiagnostic((prev: any) => ({ ...prev, connected: false }));
    });
    const offError = window.muse.onProtocolError((text) =>
      setError(`Muse protocol: ${text}`),
    );
    const offLogs = window.muse.onStderr((text) =>
      setLogs((prev) => [...prev, text].slice(-30)),
    );
    ignore(
      window.muse.bootstrap().then(async (result) => {
        if (!alive) return;
        setDiagnostic(result.diagnostic);
        setStatus(
          result.diagnostic.error ||
            (result.diagnostic.account?.state === "accountLogin"
              ? "Muse account connected"
              : "Ready"),
        );
        if (result.lastWorkspace && result.diagnostic.connected) {
          const connected = await window.muse.connectWorkspace(
            result.lastWorkspace,
          );
          if (alive) await hydrateWorkspace(connected.workspace);
        }
      }),
    );
    const focus = () => ignore(refreshAccount());
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      offEvent();
      offExit();
      offError();
      offLogs();
      window.removeEventListener("focus", focus);
    };
  }, [refreshAccount, refreshPending, refreshSessions, refreshUsage]);
  useEffect(() => {
    if (!login) return;
    const timer = setInterval(() => {
      void refreshAccount()
        .then((result) => {
          if (result.account?.state === "accountLogin") setLogin(null);
        })
        .catch((err) => setError(err.message));
    }, 3000);
    return () => clearInterval(timer);
  }, [login, refreshAccount]);
  useEffect(() => {
    if (
      (items.length || pending.approvals.length || pending.userInputs.length) &&
      followRef.current &&
      scrollRef.current
    )
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [items, pending]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [prompt]);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        setModal("settings");
      }
      if (event.key === "Escape") setModal(null);
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  return (
    <div className="app-shell">
      <div className="window-bar">
        <MuseMark />
        <span>Muse Desktop</span>
        <span className="window-caption">A little space for big ideas.</span>
      </div>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-icon">
            <MuseMark />
          </div>
          <div>
            <b>
              muse<span>desktop</span>
            </b>
            <small>YOUR CREATIVE WORKSPACE</small>
          </div>
        </div>
        <button
          className="project-switcher"
          onClick={chooseWorkspace}
          disabled={busy || working}
        >
          <Folder size={18} />
          <span>
            <b>{workspace ? basename(workspace) : "Open a project"}</b>
            <small>
              {workspace ? "Local workspace" : "Choose your workspace"}
            </small>
          </span>
          <ChevronsUpDown size={14} />
        </button>
        <button
          className="new-chat-button"
          disabled={busy || working}
          onClick={() => {
            if (!workspace) void chooseWorkspace();
            else
              void run(async () => {
                await createSession();
                setPrompt("");
                setImages([]);
              });
          }}
        >
          <Plus size={17} /> New conversation <kbd>＋</kbd>
        </button>
        <div className="sidebar-heading">
          <span>CONVERSATIONS</span>
          <button
            className="icon-button"
            title="Refresh conversations"
            disabled={busy}
            onClick={() => void run(refreshSessions)}
          >
            <RefreshCw size={13} />
          </button>
        </div>
        <label className="search-field">
          <Search size={14} />
          <input
            aria-label="Search conversations"
            placeholder="Search conversations…"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>
        <nav className="session-list" aria-label="Conversations">
          {sessions
            .filter((row) =>
              sessionTitle(row).toLowerCase().includes(search.toLowerCase()),
            )
            .map((row) => (
              <button
                key={row.sessionId}
                disabled={busy}
                className={`session-row ${row.sessionId === session ? "active" : ""}`}
                onClick={() => void loadSession(row.sessionId)}
              >
                <MessageSquare size={14} />
                <span>
                  <b>{sessionTitle(row)}</b>
                  <small>
                    {turns[row.sessionId]
                      ? "Working…"
                      : timeAgo(row.lastActivityAt || row.updatedAt)}
                  </small>
                </span>
                {turns[row.sessionId] ? <span className="live-dot" /> : null}
              </button>
            ))}
          {sessions.length === 0 ? (
            <div className="sidebar-empty">
              <MessageSquare size={20} />
              <p>Your ideas start here.</p>
              <small>
                {workspace
                  ? "Create your first conversation."
                  : "Open a project to see its history."}
              </small>
            </div>
          ) : null}
        </nav>
        <div className="sidebar-bottom">
          <button className="sidebar-link" onClick={openTerminal}>
            <Terminal size={15} /> Muse CLI <ArrowUpRight size={13} />
          </button>
          <button className="sidebar-link" onClick={() => setModal("settings")}>
            <Settings2 size={15} /> Settings <kbd>⌘ ,</kbd>
          </button>
          <button
            className="account-button"
            onClick={() => setModal("account")}
          >
            <span className={`account-avatar ${signedIn ? "connected" : ""}`}>
              {signedIn ? <Check size={17} /> : <LogIn size={17} />}
            </span>
            <span>
              <b>{accountName}</b>
              <small>
                {signedIn ? "Using your CLI sign-in" : "Muse Code subscription"}
              </small>
            </span>
            <ChevronDown size={13} />
          </button>
        </div>
      </aside>
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <Folder size={14} />
            <span>{workspace ? basename(workspace) : "Workspace"}</span>
            <span>/</span>
            <b>{active ? sessionTitle(active) : "New conversation"}</b>
          </div>
          <div className="top-actions">
            <span
              className={`connection-pill ${diagnostic?.connected ? "connected" : ""}`}
            >
              <i />
              {diagnostic?.connected ? "Local engine" : "Connecting"}
            </span>
            <button
              className="icon-button"
              title="Toggle workspace details"
              onClick={() => setInspector((value) => !value)}
            >
              <PanelRight size={17} />
            </button>
          </div>
        </header>
        <div className="conversation-tabs">
          <button
            className={tab === "conversation" ? "active" : ""}
            onClick={() => setTab("conversation")}
          >
            <MessageSquare size={14} /> Conversation
          </button>
          <button
            className={tab === "activity" ? "active" : ""}
            onClick={() => setTab("activity")}
          >
            <Terminal size={14} /> Activity{" "}
            {tasks.length ? <span>{tasks.length}</span> : null}
          </button>
          <button
            className={tab === "terminal" ? "active" : ""}
            onClick={openTerminal}
          >
            <Command size={14} /> Muse CLI <span>Native</span>
          </button>
          {session ? (
            <button
              className="rename-button"
              onClick={() => {
                setRename(active ? sessionTitle(active) : "");
                setModal("rename");
              }}
            >
              Rename
            </button>
          ) : null}
        </div>
        {terminalOpened ? (
          <Suspense
            fallback={<div className="terminal-notice">Loading terminal…</div>}
          >
            <NativeTerminal
              workspace={workspace}
              visible={tab === "terminal"}
              theme={theme}
            />
          </Suspense>
        ) : null}
        <div
          className="chat-scroll"
          style={{ display: tab === "terminal" ? "none" : undefined }}
          ref={scrollRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            followRef.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 80;
          }}
        >
          {items.length === 0 && tab === "conversation" ? (
            <div className="welcome">
              <div className="hero-art">
                <div className="orbit orbit-one" />
                <div className="orbit orbit-two" />
                <div className="hero-symbol">
                  <MuseMark large />
                </div>
                <span className="art-spark spark-one">✦</span>
                <span className="art-spark spark-two">✧</span>
              </div>
              <div className="hero-eyebrow">
                <span /> YOUR IDEAS. YOUR MUSE.
              </div>
              <h1>
                Make room for
                <br />
                <em>your next idea.</em>
              </h1>
              <p>
                A thoughtful space to build, explore, and make things
                <br className="wide-only" /> happen. Powered by the Muse Code
                you already know.
              </p>
              {!workspace ? (
                <button
                  className="accent-button hero-action"
                  onClick={chooseWorkspace}
                  disabled={busy}
                >
                  <FolderOpen size={16} /> Open a project{" "}
                  <ArrowUpRight size={15} />
                </button>
              ) : null}
              <div className="suggestion-grid">
                {suggestions.map((card) => (
                  <button
                    key={card.title}
                    onClick={() => {
                      setPrompt(card.prompt);
                      textareaRef.current?.focus();
                    }}
                  >
                    <card.icon size={20} />
                    <b>{card.title}</b>
                    <small>{card.text}</small>
                    <ArrowUpRight size={13} />
                  </button>
                ))}
              </div>
              <div className="welcome-footnote">
                <ShieldCheck size={12} /> Same local engine. Same Muse account.
              </div>
            </div>
          ) : null}
          <div className="transcript">
            {nextCursor ? (
              <button
                className="text-button load-earlier"
                disabled={busy}
                onClick={() =>
                  void run(async () => {
                    const page = await window.muse.viewPage(
                      session,
                      nextCursor,
                    );
                    const earlier = new Transcript();
                    page.events?.forEach((event: MuseEvent) =>
                      earlier.apply(event),
                    );
                    storeFor(session).seed([
                      ...earlier.list(),
                      ...storeFor(session).list(),
                    ]);
                    setItems(storeFor(session).list());
                    setNextCursor(page.nextCursor);
                  })
                }
              >
                Load earlier messages
              </button>
            ) : null}
            {showItems.map((item) => (
              <TranscriptItem
                key={item.itemId}
                item={{ ...item, sessionId: session }}
              />
            ))}
            {tab === "activity" && tasks.length === 0 ? (
              <div className="activity-empty">
                <Terminal size={24} />
                <h3>Everything happening, in view.</h3>
                <p>
                  Tool calls, shell output, workflows, and subagents appear here
                  as Muse works.
                </p>
              </div>
            ) : null}
            {working ? (
              <div className="working-row">
                <span className="thinking-dots">
                  <i />
                  <i />
                  <i />
                </span>
                <span>Muse is working in your project</span>
              </div>
            ) : null}
            {pending.approvals.map((approval) => (
              <ApprovalCard
                key={approval.approvalId}
                approval={approval}
                disabled={busy}
                onDecide={(choice) =>
                  void run(async () => {
                    await window.muse.decideApproval({
                      sessionId: session,
                      approvalId: approval.approvalId,
                      requirementId: approval.currentRequirementId,
                      choiceId: choice.choiceId,
                    });
                    await refreshPending();
                  })
                }
              />
            ))}
            {pending.userInputs.map((request) => (
              <QuestionCard
                key={request.userInputId}
                request={request}
                disabled={busy}
                onCancel={() =>
                  void run(async () => {
                    await window.muse.cancelInput({
                      sessionId: session,
                      userInputId: request.userInputId,
                    });
                    await refreshPending();
                  })
                }
                onAnswer={(answers) =>
                  void run(async () => {
                    await window.muse.answerInput({
                      sessionId: session,
                      userInputId: request.userInputId,
                      answers,
                    });
                    await refreshPending();
                  })
                }
              />
            ))}
          </div>
        </div>
        <div
          className="composer-wrap"
          style={{ display: tab === "terminal" ? "none" : undefined }}
        >
          {readOnly ? (
            <div className="readonly-note">
              This conversation is open in another CLI session. Close it there,
              then reopen it here.
            </div>
          ) : null}
          <div
            className="composer"
            onDragOver={(event) => event.preventDefault()}
            onDrop={(event) => {
              event.preventDefault();
              void addImages(event.dataTransfer.files);
            }}
          >
            {images.length ? (
              <div className="image-attachments">
                {images.map((image, index) => (
                  <div key={`${image.name}-${index}`}>
                    <img src={image.preview} alt={image.name} />
                    <span>{image.name}</span>
                    <button
                      title={`Remove ${image.name}`}
                      onClick={() =>
                        setImages((current) =>
                          current.filter((_, i) => i !== index),
                        )
                      }
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            <textarea
              ref={textareaRef}
              aria-label="Message Muse"
              placeholder={
                working
                  ? "Add a follow-up to the queue…"
                  : "What would you like to create?"
              }
              value={prompt}
              disabled={readOnly}
              onChange={(event) => setPrompt(event.target.value)}
              onPaste={(event) => {
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  void addImages(event.clipboardData.files);
                }
              }}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void sendPrompt();
                }
              }}
              rows={2}
            />
            <div className="composer-controls">
              <div className="composer-left">
                <button
                  className="icon-button"
                  title="Attach images"
                  onClick={() => fileRef.current?.click()}
                >
                  <ImagePlus size={17} />
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif"
                  hidden
                  onChange={(event) => {
                    if (event.target.files) void addImages(event.target.files);
                    event.target.value = "";
                  }}
                />
                <span className="control-divider" />
                <label className="model-select">
                  <Sparkles size={14} />
                  <select
                    aria-label="Model"
                    value={modelId}
                    disabled={busy}
                    onChange={(event) => {
                      const selected = event.target.value;
                      if (session)
                        void run(async () => {
                          await window.muse.setModel(
                            session,
                            models.find((row) => row.modelId === selected),
                          );
                          setModelId(selected);
                        });
                      else setModelId(selected);
                    }}
                  >
                    <option value="">Muse default</option>
                    {models.map((model) => (
                      <option
                        key={`${model.providerId}:${model.modelId}`}
                        value={model.modelId}
                      >
                        {model.displayLabel || model.modelId}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} />
                </label>
                <label className="effort-select">
                  <Zap size={13} />
                  <select
                    aria-label="Reasoning effort"
                    value={reasoning}
                    onChange={(event) => setReasoning(event.target.value)}
                  >
                    {efforts.map((effort) => (
                      <option key={effort} value={effort}>
                        {effort === "default"
                          ? "CLI reasoning"
                          : `${effort} effort`}
                      </option>
                    ))}
                  </select>
                  <ChevronDown size={11} />
                </label>
              </div>
              <div className="composer-right">
                {working ? (
                  <button
                    className="stop-button"
                    title="Stop active turn"
                    disabled={busy}
                    onClick={() => void stopTurn()}
                  >
                    <CircleStop size={17} />
                  </button>
                ) : null}
                <button
                  className="send-button"
                  title={working ? "Queue follow-up" : "Send message"}
                  aria-label={working ? "Queue follow-up" : "Send message"}
                  disabled={
                    busy || readOnly || (!prompt.trim() && !images.length)
                  }
                  onClick={() => void sendPrompt()}
                >
                  {busy ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <ArrowUp size={19} />
                  )}
                </button>
              </div>
            </div>
          </div>
          <div className="composer-footer">
            <span>
              <span className={`tiny-status ${working ? "working" : ""}`} />
              {busy ? "Working…" : status}
            </span>
            <span>
              <kbd>↵</kbd> Send <span className="footer-separator">·</span>{" "}
              <kbd>⇧ ↵</kbd> New line
            </span>
          </div>
        </div>
      </main>
      {inspector ? (
        <aside className="inspector">
          <div className="inspector-heading">
            WORKSPACE DETAILS{" "}
            <button
              className="icon-button"
              title="Hide details"
              onClick={() => setInspector(false)}
            >
              <X size={13} />
            </button>
          </div>
          <div className="workspace-preview">
            <div className="folder-art">
              <Folder size={35} />
            </div>
            <b>{workspace ? basename(workspace) : "Your next project"}</b>
            <small title={workspace}>
              {workspace || "Open a folder to get started"}
            </small>
            {active?.branch ? (
              <span className="branch-chip">
                <GitBranch size={12} /> {active.branch}
              </span>
            ) : null}
          </div>
          <div className="inspector-section">
            <h3>
              <ShieldCheck size={14} /> Permissions
            </h3>
            <label className="permission-select">
              <select
                aria-label="Approval mode"
                disabled={busy}
                value={approvalMode}
                onChange={(event) => {
                  const value = event.target.value;
                  if (session && value)
                    void run(async () => {
                      await window.muse.setApprovalMode(session, value);
                      setApprovalMode(value);
                    });
                  else setApprovalMode(value);
                }}
              >
                {modes.map((mode) => (
                  <option value={mode.id} key={mode.id}>
                    {mode.label}
                  </option>
                ))}
              </select>
              <ChevronDown size={12} />
            </label>
            <p>
              Muse handles the sandbox and reviews actions using your CLI
              configuration.
            </p>
          </div>
          <div className="inspector-section usage-section">
            <h3>
              <Zap size={14} /> Subscription usage{" "}
              <button
                className="icon-button"
                title="Refresh subscription usage"
                onClick={() => void run(refreshUsage)}
              >
                <RefreshCw size={11} />
              </button>
            </h3>
            {usage ? (
              <>
                {[
                  ["Current window", usage.window],
                  ["Weekly", usage.weekly],
                ].map(([label, block]: any) => (
                  <div className="usage-meter" key={label}>
                    <div>
                      <span>{label}</span>
                      <b>{block.usedPercent}%</b>
                    </div>
                    <div className="meter-track">
                      <i
                        style={{
                          width: `${Math.min(100, block.usedPercent)}%`,
                        }}
                      />
                    </div>
                    <small>
                      Resets{" "}
                      {new Date(block.resetsAtMs).toLocaleString(undefined, {
                        month: "short",
                        day: "numeric",
                        hour: "2-digit",
                        minute: "2-digit",
                      })}
                    </small>
                  </div>
                ))}
                <small className="usage-asof">
                  Observed {new Date(usage.observedAtMs).toLocaleTimeString()}
                </small>
              </>
            ) : (
              <div className="usage-unavailable">
                <span>Waiting for Muse usage</span>
                <small>
                  Appears when the CLI receives your subscription limits.
                </small>
              </div>
            )}
          </div>
          <div className="inspector-section">
            <h3>
              <Command size={14} /> Project skills <span>{skills.length}</span>
            </h3>
            {skills.length ? (
              skills.slice(0, 5).map((skill) => (
                <button
                  className="skill-row"
                  key={skill.selector}
                  title={skill.description}
                  onClick={() => {
                    setPrompt(`/${skill.selector} `);
                    textareaRef.current?.focus();
                  }}
                >
                  /{skill.selector}
                  <ArrowUpRight size={11} />
                </button>
              ))
            ) : (
              <p>
                Skills, rules, hooks, and MCP configuration are loaded by Muse
                for each project session.
              </p>
            )}
          </div>
          <div className="engine-card">
            <div>
              <MuseMark />
              <b>One engine. All yours.</b>
            </div>
            <p>
              Your local Muse Code does the work. Your sign-in stays with the
              CLI.
            </p>
            <span>
              <i />{" "}
              {signedIn ? "CLI account connected" : "Official Muse runtime"}
            </span>
          </div>
        </aside>
      ) : null}
      {error ? (
        <div className="error-toast" role="alert">
          <div>
            <b>Something needs attention</b>
            <p>{error}</p>
          </div>
          <button
            className="icon-button"
            title="Dismiss error"
            onClick={() => setError("")}
          >
            <X size={15} />
          </button>
        </div>
      ) : null}
      {modal ? (
        <div
          className="modal-backdrop"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setModal(null);
          }}
        >
          <section
            className="modal"
            role="dialog"
            aria-modal="true"
            aria-label={
              modal === "account"
                ? "Muse account"
                : modal === "settings"
                  ? "Settings"
                  : modal === "rename"
                    ? "Rename conversation"
                    : "Quick guide"
            }
          >
            <button
              className="modal-close icon-button"
              title="Close dialog"
              onClick={() => setModal(null)}
            >
              <X size={18} />
            </button>
            {modal === "account" ? (
              <>
                <div className="modal-symbol">
                  <MuseMark large />
                </div>
                <span className="eyebrow">YOUR MUSE ACCOUNT</span>
                <h2>
                  {signedIn
                    ? "Right where you left off."
                    : "Bring your Muse along."}
                </h2>
                <p>
                  Your desktop app shares the official Muse Code sign-in on this
                  computer.
                </p>
                <div className="account-state">
                  <span
                    className={`tiny-status ${signedIn ? "" : "working"}`}
                  />
                  <div>
                    <b>{accountName}</b>
                    <small>
                      {signedIn
                        ? "Your CLI browser session is active."
                        : account?.message ||
                          "Sign in to use your Muse Code subscription."}
                    </small>
                  </div>
                </div>
                {login?.userCode ? (
                  <div className="device-login">
                    <small>CONFIRM THIS CODE IN YOUR BROWSER</small>
                    <strong>{login.userCode}</strong>
                    <button
                      className="accent-button"
                      onClick={() =>
                        void run(() =>
                          window.muse.openExternal(login.verificationUrl),
                        )
                      }
                    >
                      Continue in browser <ExternalLink size={14} />
                    </button>
                    <span>
                      <Loader2 className="spin" size={12} /> Waiting for
                      confirmation…
                    </span>
                    <button
                      className="text-button"
                      onClick={() =>
                        void run(async () => {
                          await window.muse.cancelLogin();
                          setLogin(null);
                        })
                      }
                    >
                      Cancel sign-in
                    </button>
                  </div>
                ) : (
                  <div className="modal-actions">
                    <button
                      className="accent-button"
                      disabled={loginBusy}
                      onClick={() => void openLogin()}
                    >
                      {loginBusy ? (
                        <Loader2 className="spin" size={15} />
                      ) : (
                        <LogIn size={15} />
                      )}
                      {signedIn
                        ? "Switch Muse account"
                        : "Sign in with Muse Code"}
                    </button>
                    <button
                      className="secondary-button"
                      disabled={busy}
                      onClick={() => void run(refreshAccount)}
                    >
                      <RefreshCw size={14} /> Refresh
                    </button>
                  </div>
                )}
                <small className="modal-note">
                  Credentials remain in Muse Code’s existing credential store.
                </small>
              </>
            ) : null}
            {modal === "settings" ? (
              <>
                <span className="eyebrow">MAKE YOURSELF AT HOME</span>
                <h2>Workspace settings</h2>
                <p>
                  Connected to the same Muse Code installation as your terminal.
                </p>
                <fieldset className="appearance-settings">
                  <legend>Appearance</legend>
                  <p>
                    Choose a palette. Your preference is saved on this computer.
                  </p>
                  <div className="theme-grid">
                    {themes.map((option) => (
                      <label className="theme-choice" key={option.id}>
                        <input
                          type="radio"
                          name="theme"
                          value={option.id}
                          checked={themePreference === option.id}
                          onChange={() => setThemePreference(option.id)}
                        />
                        <span
                          className="theme-swatch"
                          aria-hidden="true"
                          style={{
                            background: option.colors.bg,
                            borderColor: option.colors.elevated,
                          }}
                        >
                          <i style={{ background: option.colors.panel }} />
                          <i style={{ background: option.colors.accent }} />
                          <i style={{ background: option.colors.mint }} />
                        </span>
                        <span>
                          <b>{option.name}</b>
                          <small>{option.description}</small>
                        </span>
                        <Check
                          className="theme-check"
                          size={13}
                          aria-hidden="true"
                        />
                      </label>
                    ))}
                  </div>
                  <label className="system-theme-choice">
                    <input
                      type="radio"
                      name="theme"
                      value="system"
                      checked={themePreference === "system"}
                      onChange={() => setThemePreference("system")}
                    />
                    <span>
                      <b>Follow system</b>
                      <small>
                        Use Muse Dark or Paper with your Windows appearance.
                      </small>
                    </span>
                  </label>
                </fieldset>
                <div className="setting-row">
                  <div>
                    <b>Muse Code runtime</b>
                    <small>{diagnostic?.version || "Not detected"}</small>
                    <code>
                      {diagnostic?.binary ||
                        diagnostic?.error ||
                        "Select the Muse executable below."}
                    </code>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={busy}
                    onClick={() =>
                      void run(async () => {
                        const result = await window.muse.chooseBinary();
                        if (result) setDiagnostic(result);
                      })
                    }
                  >
                    Locate CLI
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <b>Account</b>
                    <small>{accountName}</small>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => setModal("account")}
                  >
                    Manage
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <b>Project</b>
                    <small>{workspace || "No folder selected"}</small>
                  </div>
                  <button
                    className="secondary-button"
                    disabled={working || busy}
                    onClick={chooseWorkspace}
                  >
                    Change
                  </button>
                </div>
                <div className="setting-row">
                  <div>
                    <b>Terminal features</b>
                    <small>
                      Open the native CLI for its complete command palette.
                    </small>
                  </div>
                  <button
                    className="secondary-button"
                    onClick={() => void run(() => window.muse.openCli())}
                  >
                    <Terminal size={14} /> Open CLI
                  </button>
                </div>
                {diagnostic?.fingerprintWarning ? (
                  <p className="compatibility-note">
                    Your CLI schema is newer than the SDK. Core methods are
                    supported; protocol errors appear explicitly.
                  </p>
                ) : null}
                {logs.length ? (
                  <details className="runtime-logs">
                    <summary>Runtime diagnostics</summary>
                    <pre>{logs.join("\n")}</pre>
                  </details>
                ) : null}
                <button
                  className="text-button"
                  onClick={() => setModal("help")}
                >
                  Keyboard shortcuts and command guide{" "}
                  <ArrowUpRight size={12} />
                </button>
              </>
            ) : null}
            {modal === "help" ? (
              <>
                <span className="eyebrow">A FEW HELPFUL SHORTCUTS</span>
                <h2>Work at your own pace.</h2>
                <div className="guide-grid">
                  {[
                    ["Enter", "Send or queue a follow-up"],
                    ["Shift + Enter", "New line"],
                    ["Ctrl / ⌘ + ,", "Open settings"],
                    ["!command", "Run a workspace shell command"],
                    ["/new · /clear", "Start a new conversation"],
                    ["/compact", "Compact session context"],
                    ["/login", "Sign in with Muse Code"],
                    ["/resume", "Find an existing conversation"],
                    ["/skill-name", "Invoke a project skill"],
                    ["/terminal", "Open the complete Muse CLI"],
                  ].map(([key, label]) => (
                    <div key={key}>
                      <code>{key}</code>
                      <span>{label}</span>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
            {modal === "rename" ? (
              <>
                <span className="eyebrow">GIVE THIS IDEA A NAME</span>
                <h2>Rename conversation</h2>
                <input
                  className="rename-input"
                  aria-label="Conversation name"
                  value={rename}
                  maxLength={120}
                  onChange={(event) => setRename(event.target.value)}
                />
                <button
                  className="accent-button"
                  disabled={busy || !rename.trim()}
                  onClick={() =>
                    void run(async () => {
                      await window.muse.rename(session, rename.trim());
                      await refreshSessions();
                      setModal(null);
                    })
                  }
                >
                  Save name
                </button>
              </>
            ) : null}
          </section>
        </div>
      ) : null}
    </div>
  );
}
