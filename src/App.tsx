import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  useMemo,
} from "react";
import {
  ArrowDown,
  FileText,
  Paperclip,
  ArrowUp,
  ArrowUpRight,
  Check,
  ChevronDown,
  MoreHorizontal,
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
  Users,
} from "lucide-react";
import {
  cacheConversation,
  cachedConversation,
  cachedIndex,
  cacheIndex,
  clearConversationCache,
} from "./session-cache";
import { WorkspaceSidebar } from "./WorkspaceSidebar";
import { SettingsPanel } from "./SettingsPanel";
import { useDrafts } from "./useDrafts";
import { Modal } from "./Modal";
import { Select } from "./Select";
import { WorkspaceInspector } from "./WorkspaceInspector";
import { NewConversation } from "./NewConversation";
import { version as appVersion } from "../package.json";
import { DesktopSettings } from "./DesktopSettings";
import {
  readPreferences,
  savePreferences,
  applyPreferences,
  resetAppearance,
} from "./desktop-preferences";
import { SafeMedia } from "./RichContent";
import { prepareAttachment, attachmentContext, type Attachment } from "./media";
import {
  ResizeHandle,
  ConversationTimeline,
  SessionDetails,
  InlineAgents,
  ActivityPanel,
} from "./SessionPanels";
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
import { AgentWindow } from "./AgentWindow";

const EMPTY_MEDIA: Record<string, any[]> = {};
const modifier = /Mac/i.test(navigator.platform) ? "⌘" : "Ctrl";
const efforts = [
  "default",
  "none",
  "minimal",
  "low",
  "medium",
  "high",
  "xhigh",
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
  const params = new URLSearchParams(location.search);
  return params.get("agent") ? (
    <AgentWindow
      id={params.get("agent")!}
      parent={params.get("parent") || ""}
    />
  ) : (
    <DesktopApp />
  );
}
function DesktopApp() {
  const [preferences, setPreferences] = useState(readPreferences);
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const [themePreference, setThemePreference] = useState(readThemePreference);
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia("(prefers-color-scheme: dark)").matches,
  );
  const theme = resolveTheme(themePreference, systemDark);
  useEffect(() => {
    const warn = () =>
      setError(
        "Draft persistence is unavailable. Keep this window open and retry saving before closing the app.",
      );
    window.addEventListener("muse-draft-storage-error", warn);
    return () => window.removeEventListener("muse-draft-storage-error", warn);
  }, []);
  useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    const update = () => setSystemDark(media.matches);
    media.addEventListener("change", update);
    update();
    return () => media.removeEventListener("change", update);
  }, []);
  useLayoutEffect(() => {
    applyTheme(theme);
    applyPreferences(preferences);
    savePreferences(preferences);
    saveThemePreference(themePreference);
    void window.muse
      ?.syncAppearance?.({ themePreference, preferences })
      .catch(() => {});
    void window.muse
      ?.setWindowTheme?.({
        background: /^#[a-f0-9]{6}$/i.test(preferences.colors.bg || "")
          ? preferences.colors.bg
          : theme.colors.bg,
        foreground: /^#[a-f0-9]{6}$/i.test(preferences.colors.text || "")
          ? preferences.colors.text
          : theme.colors.text,
      })
      .catch(() => {});
  }, [theme, themePreference, preferences]);
  const [diagnostic, setDiagnostic] = useState<any>(null);
  const [workspace, setWorkspace] = useState("");
  const [sessions, setSessions] = useState<any[]>([]);
  const [session, setSession] = useState("");
  const [items, setItems] = useState<MuseItem[]>([]);
  const [models, setModels] = useState<any[]>([]);
  const [modelId, setModelId] = useState("");
  const [reasoning, setReasoning] = useState(preferences.defaultReasoning);
  const [approvalMode, setApprovalMode] = useState("");
  const [permissionProfile, setPermissionProfile] = useState(
    preferences.defaultPermissions,
  );
  const [workspaces, setWorkspaces] = useState<string[]>([]);
  const workspaceListRef = useRef(workspaces);
  workspaceListRef.current = workspaces;
  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});
  const [hiddenHistory, setHiddenHistory] = useState<{
    chats: string[];
    roots: string[];
  }>(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("muse-hidden-history") || "{}",
      );
      return {
        chats: Array.isArray(saved.chats) ? saved.chats : [],
        roots: Array.isArray(saved.roots) ? saved.roots : [],
      };
    } catch {
      return { chats: [], roots: [] };
    }
  });
  const [showArchived, setShowArchived] = useState(false);
  const [conversationMenu, setConversationMenu] = useState<any>(null);
  const [renameTarget, setRenameTarget] = useState("");
  useEffect(() => {
    try {
      localStorage.setItem(
        "muse-hidden-history",
        JSON.stringify(hiddenHistory),
      );
    } catch {}
  }, [hiddenHistory]);
  const [completed, setCompleted] = useState<Record<string, string>>({});
  const [sessionStats, setSessionStats] = useState<Record<string, any>>({});
  const [media, setMedia] = useState<Record<string, Record<string, any[]>>>({});
  const [commands, setCommands] = useState<any[]>([]);
  const [mcp, setMcp] = useState<any>(null);
  const [slashIndex, setSlashIndex] = useState(0);
  const [terminalCommand, setTerminalCommand] = useState("");
  const [usage, setUsage] = useState<any>(null);
  const [usageLoading, setUsageLoading] = useState(false);
  const [usageChecked, setUsageChecked] = useState<number | null>(null);
  const accountIdentity = useRef<string | null>(null);
  const usageEpoch = useRef(0);
  const [usageError, setUsageError] = useState("");
  const [sessionsLoading, setSessionsLoading] = useState(true);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [sessionRefreshing, setSessionRefreshing] = useState(false);
  const [updates, setUpdates] = useState<any>(null);
  const [checkingUpdates, setCheckingUpdates] = useState(false);
  const [settingsCategory, setSettingsCategory] = useState("appearance");
  const [uploading, setUploading] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [newConversation, setNewConversation] = useState<{
    initial: string;
  } | null>(null);
  const [pending, setPending] = useState<{
    approvals: any[];
    userInputs: any[];
  }>({ approvals: [], userInputs: [] });
  const [skills, setSkills] = useState<any[]>([]);
  const drafts = useDrafts();
  const { prompt, setPrompt, images, setImages } = drafts;
  const [bootAttempt, setBootAttempt] = useState(0);
  const [historyError, setHistoryError] = useState("");
  const [turns, setTurns] = useState<Record<string, string | null>>({});
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("Connecting to Muse Code…");
  const [error, setError] = useState("");
  const [modal, setModal] = useState<
    "settings" | "account" | "help" | "rename" | null
  >(null);
  const [login, setLogin] = useState<any>(null);
  const [loginBusy, setLoginBusy] = useState(false);
  const [inspector, setInspector] = useState(() => innerWidth > 950);
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
  const [storage, setStorage] = useState<any>(null);
  const [logs, setLogs] = useState<string[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const activeRef = useRef("");
  const workspaceRef = useRef("");
  const stores = useRef(new Map<string, Transcript>());
  const sessionsRequest = useRef<Promise<void> | null>(null);
  const sessionsRefreshAgain = useRef(false);
  const sessionSnapshots = useRef(new Map<string, any>());
  const sessionExtras = useRef(
    new Map<string, { models: any[]; skills: any[]; at: number }>(),
  );
  const itemFrame = useRef<number | null>(null);
  const cacheTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const sidebarLoaded = useRef(false);
  const buffering = useRef(new Map<string, MuseEvent[]>());
  const loadGeneration = useRef(0);
  const usageGeneration = useRef(0);
  const scrollPositions = useRef(
    new Map<string, { top: number; follow: boolean }>(),
  );
  const restoreScroll = useRef<{ top: number; follow: boolean } | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const followRef = useRef(true);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const working = !!turns[session];
  const active = sessions.find((row) => row.sessionId === session);
  const slashOptions = /^\/[^\s]*$/.test(prompt)
    ? [
        ...commands,
        ...skills.map((skill) => ({
          name: skill.selector,
          description: skill.description || skill.displayName,
          route: "skill",
          source: skill.source,
        })),
      ]
        .filter(
          (command, index, list) =>
            list.findIndex((c) => c.name === command.name) === index,
        )
        .filter((command) =>
          command.name.toLowerCase().includes(prompt.slice(1).toLowerCase()),
        )
    : [];
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
  const tasks = useMemo(
    () =>
      items.filter(
        (item) => !["userMessage", "agentMessage"].includes(item.kind),
      ),
    [items],
  );
  const showItems = tab === "activity" ? tasks : items;

  const refreshAccount = useCallback(async () => {
    const result = await window.muse.diagnose();
    setDiagnostic(result);
    accountIdentity.current = JSON.stringify([
      result.account?.state,
      result.account?.label,
    ]);
    if (result.error) setStatus("Muse needs attention");
    else
      setStatus(
        result.account?.state === "accountLogin"
          ? "Muse Code connected"
          : "Ready",
      );
    return result;
  }, []);
  const refreshSessions = useCallback(async (): Promise<void> => {
    if (sessionsRequest.current) {
      sessionsRefreshAgain.current = true;
      return sessionsRequest.current;
    }
    setSessionsLoading(true);
    sidebarLoaded.current = true;
    const request = window.muse
      .listSessions()
      .then((raw) =>
        setSessions((prev) => {
          const rows = raw.sessions || [];
          void cacheIndex(rows, workspaceListRef.current);
          const selected = prev.find(
            (row) => row.sessionId === activeRef.current,
          );
          return selected &&
            !rows.some((row: any) => row.sessionId === selected.sessionId)
            ? [selected, ...rows]
            : rows;
        }),
      )
      .finally(() => {
        sessionsRequest.current = null;
        setSessionsLoading(false);
        if (sessionsRefreshAgain.current) {
          sessionsRefreshAgain.current = false;
          void refreshSessions().catch(() => {});
        }
      });
    sessionsRequest.current = request;
    return request;
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
  const refreshUsage = useCallback(async () => {
    const generation = ++usageGeneration.current;
    setUsageLoading(true);
    setUsageError("");
    try {
      const raw = await window.muse.usage();
      if (generation !== usageGeneration.current) return;
      const next = subscriptionUsage(raw);
      setUsage((previous: any) =>
        next && next.observedAtMs <= usageEpoch.current
          ? null
          : !next || !previous || next.observedAtMs >= previous.observedAtMs
            ? next
            : previous,
      );
      setUsageChecked(raw.checkedAtMs || Date.now());
    } catch (error: any) {
      if (generation === usageGeneration.current)
        setUsageError(error.message || "Cannot read Muse usage.");
    } finally {
      if (generation === usageGeneration.current) setUsageLoading(false);
    }
  }, []);
  const checkUpdates = useCallback(async (force = false) => {
    if (!window.muse?.checkUpdates) return;
    setCheckingUpdates(true);
    try {
      setUpdates(
        await window.muse.checkUpdates({
          force,
          notify: preferencesRef.current.updateNotifications,
        }),
      );
    } catch (error: any) {
      setUpdates((prev: any) => ({ ...prev, error: error.message }));
    } finally {
      setCheckingUpdates(false);
    }
  }, []);
  useEffect(() => {
    void cachedIndex().then((cached) => {
      if (cached && !sidebarLoaded.current) {
        setSessions(cached.sessions);
        setWorkspaces(cached.workspaces);
      }
    });
  }, []);
  useEffect(() => {
    if (!preferences.checkUpdates) return;
    const start = setTimeout(() => void checkUpdates(), 5000);
    const timer = setInterval(() => void checkUpdates(), 6 * 3600000);
    return () => {
      clearTimeout(start);
      clearInterval(timer);
    };
  }, [preferences.checkUpdates, checkUpdates]);
  function chooseTheme(id: string) {
    setPreferences((prev) => resetAppearance(prev));
    setThemePreference(id);
  }
  function settingsAt(category = "appearance") {
    setSettingsCategory(category);
    setModal("settings");
  }
  function persistTranscript(id: string) {
    const held = stores.current.get(id),
      snapshot = sessionSnapshots.current.get(id);
    const row =
      snapshot?.session ||
      sessions.find((row) => row.sessionId === id) ||
      (id === activeRef.current
        ? { sessionId: id, workspaceRoot: workspaceRef.current, modelId }
        : null);
    if (held && row)
      void cacheConversation({
        id,
        items: held.list(),
        session: row,
        cachedAt: Date.now(),
      });
  }
  function publishItems(id: string) {
    if (itemFrame.current != null) return;
    itemFrame.current = requestAnimationFrame(() => {
      itemFrame.current = null;
      const active = activeRef.current;
      if (active && !buffering.current.has(active))
        setItems(storeFor(active).list());
    });
    if (cacheTimer.current) clearTimeout(cacheTimer.current);
    cacheTimer.current = setTimeout(
      () => persistTranscript(activeRef.current),
      750,
    );
  }
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
  function selectSession(id: string, moveDraft = false) {
    if (scrollRef.current && activeRef.current)
      scrollPositions.current.set(activeRef.current, {
        top: scrollRef.current.scrollTop,
        follow: followRef.current,
      });
    drafts.select(id || `new:${workspaceRef.current}`, moveDraft);
    activeRef.current = id;
    const saved = scrollPositions.current.get(id) || { top: 0, follow: true };
    restoreScroll.current = saved;
    followRef.current = saved.follow;
    setShowLatest(!saved.follow);
    setSession(id);
    setReadOnly(false);
    setNextCursor(null);
  }
  function storeFor(id: string) {
    if (!stores.current.has(id)) {
      stores.current.set(id, new Transcript());
      if (stores.current.size > 12) {
        const oldest = [...stores.current.keys()].find(
          (key) => key !== id && key !== activeRef.current && !turns[key],
        );
        if (oldest) {
          stores.current.delete(oldest);
          sessionSnapshots.current.delete(oldest);
          sessionExtras.current.delete(oldest);
        }
      }
    }
    return stores.current.get(id)!;
  }
  async function hydrateWorkspace(cwd: string) {
    workspaceRef.current = cwd;
    setWorkspace(cwd);
    setWorkspaces((prev) => [...new Set([...prev, cwd])]);
    selectSession("");
    setItems([]);
    setPending({ approvals: [], userInputs: [] });
    setSkills([]);
    setPermissionProfile(preferencesRef.current.defaultPermissions);
    setApprovalMode("");
    setReasoning(preferencesRef.current.defaultReasoning);
    void refreshSessions().catch((err) => setError(err.message));
    const results = await Promise.allSettled([
      window.muse.listModels(),
      refreshUsage(),
      refreshAccount(),
    ]);
    if (results[0].status === "fulfilled") {
      const list = results[0].value.models || [];
      setModels(list);
      setModelId(
        (list.find((row: any) => row.isDefault) || list[0])?.modelId || "",
      );
    }
    setStatus("Project connected");
  }
  async function chooseWorkspace() {
    await run(async () => {
      const result = await window.muse.chooseWorkspace();
      if (result) await hydrateWorkspace(result.workspace);
    });
  }
  async function createSession(
    options: { fresh?: boolean; workspaceRoot?: string } = {},
  ) {
    const root =
      options.workspaceRoot !== undefined
        ? options.workspaceRoot
        : workspaceRef.current;
    const profile = options.fresh
      ? preferencesRef.current.defaultPermissions
      : permissionProfile;
    const result = await window.muse.startSession({
      modelId: modelId || undefined,
      approvalMode: options.fresh ? undefined : approvalMode || undefined,
      permissionProfile: profile,
      workspaceRoot: root || undefined,
      noFolder: !root,
    });
    workspaceRef.current = root;
    setWorkspace(root);
    if (root) setWorkspaces((prev) => [...new Set([...prev, root])]);
    setPermissionProfile(profile);
    if (options.fresh) {
      setReasoning(preferencesRef.current.defaultReasoning);
      setApprovalMode("");
    }
    const id = result.sessionId;
    if (result.raw?.session)
      setSessions((prev) => [
        { ...result.raw.session, permissionProfile: profile },
        ...prev.filter((row) => row.sessionId !== id),
      ]);
    selectSession(id, !options.fresh);
    storeFor(id).seed([]);
    setItems([]);
    setPending({ approvals: [], userInputs: [] });
    setTab("conversation");
    void refreshSessions().catch((err) => setError(err.message));
    await window.muse
      .listSkills(id)
      .then((raw) => setSkills(raw.skills || []))
      .catch((err) => setError(err.message));
    return id;
  }
  async function loadSession(id: string) {
    if (
      id === activeRef.current &&
      !sessionRefreshing &&
      stores.current.has(id) &&
      sessionSnapshots.current.has(id)
    )
      return;
    const generation = ++loadGeneration.current;
    const row = sessions.find((entry) => entry.sessionId === id);
    workspaceRef.current = row?.workspaceRoot || "";
    selectSession(id);
    setWorkspace(workspaceRef.current);
    const warm = stores.current.get(id);
    const held = sessionSnapshots.current.get(id);
    setMessagesLoading(!warm);
    setSessionRefreshing(true);
    setError("");
    setTab("conversation");
    setItems(warm?.list() || []);
    if (held) {
      setModelId(held.session?.modelId || "");
      setPermissionProfile(held.permissionProfile || "standard");
    }
    void cachedConversation(id).then((cached) => {
      if (!warm && cached && current() && buffering.current.has(id)) {
        const store = storeFor(id);
        store.seed(cached.items);
        setItems(store.list());
        setMessagesLoading(false);
      }
    });
    setSkills([]);
    setPending({ approvals: [], userInputs: [] });
    buffering.current.set(id, []);
    const current = () =>
      generation === loadGeneration.current && activeRef.current === id;
    try {
      let result,
        readonly = false;
      try {
        result = await window.muse.resumeSession(id);
      } catch (error: any) {
        if (!/sessionInUse|in use|lease/i.test(error.message)) throw error;
        result = await window.muse.readSession(id);
        readonly = true;
      }
      if (!current()) return;
      const store = storeFor(id);
      const history = historyItems(result);
      if (history) store.seed(history);
      else {
        const page = await window.muse.viewPage(id);
        if (!current()) return;
        store.seed([]);
        page.events?.forEach((event: MuseEvent) => store.apply(event));
        setNextCursor(page.nextCursor);
      }
      for (const event of buffering.current.get(id) || []) store.apply(event);
      buffering.current.delete(id);
      setItems(store.list());
      sessionSnapshots.current.set(id, result);
      persistTranscript(id);
      window.dispatchEvent(new CustomEvent("muse-media-ready", { detail: id }));
      setReadOnly(readonly);
      if (readonly)
        setStatus(
          "This session is open in another Muse window. Close it there to continue here.",
        );
      const root = result.session?.workspaceRoot || row?.workspaceRoot || "";
      workspaceRef.current = root;
      setWorkspace(root);
      setPermissionProfile(
        result.permissionProfile || row?.permissionProfile || "standard",
      );
      setModelId(result.session?.modelId || "");
      const snapshot = result.history?.snapshot?.state;
      if (snapshot)
        setSessionStats((previous) => ({
          ...previous,
          [id]: {
            ...previous[id],
            contextUsage: snapshot.contextUsage,
            tokenUsage: snapshot.tokenUsage
              ? { cumulative: snapshot.tokenUsage }
              : previous[id]?.tokenUsage,
            goal: snapshot.goal,
            todoList: snapshot.todoList,
          },
        }));
      setApprovalMode(
        result.session?.approvalMode?.mode ||
          snapshot?.approvalMode?.mode ||
          "",
      );
      setReasoning(snapshot?.reasoningEffort?.reasoningEffort || "default");
      setTurns((previous) => ({
        ...previous,
        [id]:
          result.session?.activeTurnId || snapshot?.activeTurn?.turnId || null,
      }));
      const extras = sessionExtras.current.get(id);
      if (extras) {
        setModels(extras.models);
        setSkills(extras.skills);
      }
      void Promise.allSettled([
        refreshPending(),
        window.muse
          .sessionMedia(id)
          .then((saved) =>
            setMedia((previous) => ({ ...previous, [id]: saved })),
          ),
        ...(!extras || Date.now() - extras.at > 60000
          ? [
              Promise.all([
                window.muse.listModels(id),
                window.muse.listSkills(id),
              ]).then(([models, skills]) => {
                const next = {
                  models: models.models || [],
                  skills: skills.skills || [],
                  at: Date.now(),
                };
                sessionExtras.current.set(id, next);
                if (current()) {
                  setModels(next.models);
                  setSkills(next.skills);
                }
              }),
            ]
          : []),
      ]);
    } catch (error: any) {
      if (current()) {
        setError(error.message);
        setStatus(
          "Conversation could not be loaded. Select it again to retry.",
        );
      }
    } finally {
      if (current()) {
        buffering.current.delete(id);
        setMessagesLoading(false);
        setSessionRefreshing(false);
      }
    }
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
  async function changePermissions(profile: string, mode = approvalMode) {
    await run(async () => {
      const nextMode =
        profile === "yolo"
          ? "allowAll"
          : mode === "allowAll"
            ? "onRequest"
            : mode;
      if (session) await window.muse.setPermissions(session, profile, nextMode);
      setPermissionProfile(profile);
      setApprovalMode(nextMode);
      if (session)
        setSessions((prev) =>
          prev.map((row) =>
            row.sessionId === session
              ? { ...row, permissionProfile: profile }
              : row,
          ),
        );
    });
  }
  async function switchWorkspace(root: string) {
    if (!root) return;
    await run(async () => {
      const result = await window.muse.connectWorkspace(root);
      await hydrateWorkspace(result.workspace);
    });
  }
  function chooseCommand(command: any) {
    setPrompt(`/${command.name} `);
    setSlashIndex(0);
    textareaRef.current?.focus();
  }
  function nativeCommand(value: string) {
    setTerminalCommand(value);
    openTerminal();
    setStatus("Command prepared in Muse CLI. Review it and press Enter there.");
  }
  async function sendPrompt() {
    if (
      (!prompt.trim() && !images.length) ||
      busy ||
      uploading ||
      readOnly ||
      sessionRefreshing ||
      messagesLoading ||
      !diagnostic?.connected ||
      !signedIn
    )
      return;
    const sent = drafts.capture();
    const sentImages = sent.images;
    await run(async () => {
      const text = sent.text.trim();
      const slash = text.match(/^\/([^\s]+)(?:\s+([\s\S]*))?$/);
      if (slash) {
        const name = slash[1],
          args = slash[2] || "";
        if (["new", "clear"].includes(name)) {
          await createSession({ fresh: true });
          drafts.clear(sent);
          return;
        }
        if (name === "login") {
          await openLogin();
          drafts.clear(sent);
          return;
        }
        if (["status", "usage", "models", "skills", "help"].includes(name)) {
          setModal(name === "help" ? "help" : "settings");
          await refreshAccount();
          drafts.clear(sent);
          return;
        }
        if (name === "resume") {
          setSearch(args);
          drafts.clear(sent);
          setStatus("Choose a session from the sidebar.");
          return;
        }
        if (name === "terminal") {
          openTerminal();
          drafts.clear(sent);
          return;
        }
        if (name === "stop") {
          if (session) await window.muse.interrupt(session, turns[session]);
          drafts.clear(sent);
          return;
        }
        if (name === "compact") {
          if (session) await window.muse.compact(session);
          drafts.clear(sent);
          return;
        }
        if (
          [
            "settings",
            "theme",
            "permissions",
            "notifications",
            "effort",
          ].includes(name)
        ) {
          setModal("settings");
          drafts.clear(sent);
          return;
        }
        if (["subagents", "tasks", "workflows"].includes(name)) {
          setTab(name === "subagents" ? "conversation" : "activity");
          drafts.clear(sent);
          return;
        }
        if (name === "mcp") {
          nativeCommand(text);
          drafts.clear(sent);
          return;
        }
        if (name === "name") {
          setRenameTarget(session);
          setRename(args || (active ? sessionTitle(active) : ""));
          setModal("rename");
          drafts.clear(sent);
          return;
        }
        if (name === "export") {
          if (!session) throw new Error("Open a conversation to export it.");
          await window.muse.exportSession(session);
          drafts.clear(sent);
          return;
        }
        if (name === "copy") {
          const answer = [...items]
            .reverse()
            .find((item) => item.kind === "agentMessage");
          if (answer) await navigator.clipboard.writeText(answer.text || "");
          drafts.clear(sent);
          return;
        }
        if (name === "fork") {
          if (!session) throw new Error("Open a conversation to fork it.");
          const fork = await window.muse.forkSession(session);
          void refreshSessions().catch((err) => setError(err.message));
          await loadSession(fork.session?.sessionId || fork.sessionId);
          drafts.clear(sent);
          return;
        }
        const builtIn = commands.find((command) => command.name === name);
        if (builtIn?.route === "native") {
          nativeCommand(text);
          drafts.clear(sent);
          return;
        }
      }
      let id = activeRef.current;
      if (!id) id = await createSession();
      if (slash && slash[1] !== "agents") {
        const catalog = await window.muse.listSkills(id);
        setSkills(catalog.skills || []);
        if (
          !(catalog.skills || []).some(
            (skill: any) => skill.selector === slash[1],
          )
        ) {
          nativeCommand(text);
          drafts.clear(sent);
          return;
        }
      }
      if (text.startsWith("!")) {
        await window.muse.userShell(id, text.slice(1).trim());
        setStatus("Shell command submitted");
      } else {
        const skill =
          slash && slash[1] !== "agents"
            ? { selector: slash[1], arguments: slash[2] || "" }
            : undefined;
        const ack = await window.muse.sendTurn({
          sessionId: id,
          text:
            (skill
              ? ""
              : slash?.[1] === "agents"
                ? `Use native Muse subagents to delegate independent parts of this task. ${slash[2] || "Ask me which task I want the agents to work on."}`
                : text) + attachmentContext(sentImages),
          skill,
          images: sentImages.flatMap((image) => image.frames),
          attachmentIds: sentImages.map((image) => image.id),
          reasoningEffort: reasoning === "default" ? undefined : reasoning,
          ifBusy: preferences.followUp,
        });
        setStatus(
          ack.disposition === "queued"
            ? "Follow-up queued"
            : "Muse is working…",
        );
      }
      drafts.clear(sent);

      followRef.current = true;
    });
  }
  async function addImages(files: FileList | File[]) {
    if (uploading || readOnly || messagesLoading) return;
    const target = drafts.capture();
    if (target.images.length + files.length > 8) {
      setError("Attach up to eight files per message.");
      return;
    }
    setUploading(true);
    setError("");
    setStatus("Preparing attachments…");
    const added: Attachment[] = [],
      failed: string[] = [];
    try {
      for (const file of Array.from(files)) {
        try {
          added.push(await prepareAttachment(file));
        } catch (error: any) {
          failed.push(`${file.name}: ${error.message}`);
        }
      }
      if (added.length) drafts.append(target, added);
      if (failed.length) setError(failed.join("\n"));
      setStatus(
        added.length
          ? `${added.length} attachment${added.length === 1 ? "" : "s"} ready`
          : "No files attached",
      );
    } finally {
      setUploading(false);
    }
  }

  useEffect(() => {
    if (!window.muse) {
      setError(
        "Open Muse Desktop from the installed application. This page needs the desktop bridge.",
      );
      setStatus("Desktop bridge unavailable");
      setSessionsLoading(false);
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
        const identity = JSON.stringify([p.state, p.label]);
        if (
          accountIdentity.current !== null &&
          accountIdentity.current !== identity
        ) {
          usageEpoch.current = Date.now();
          ++usageGeneration.current;
          setUsage(null);
          setUsageChecked(null);
          setUsageLoading(false);
        }
        if (
          accountIdentity.current !== null &&
          accountIdentity.current !== identity
        ) {
          stores.current.clear();
          sessionSnapshots.current.clear();
          sessionExtras.current.clear();
          void clearConversationCache().catch(() => {});
        }
        accountIdentity.current = identity;
        setDiagnostic((prev: any) => ({ ...prev, account: p }));
        if (p.state === "accountLogin") {
          setLogin(null);
          setStatus("Muse account connected");
        }
      }
      if (method === "account/loginCompleted") {
        if (p.outcome === "granted") {
          usageEpoch.current = Date.now();
          ++usageGeneration.current;
          setUsage(null);
          setUsageChecked(null);
          setUsageLoading(false);
        }
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
      if (method === "usage/changed" && p.observedAtMs > usageEpoch.current)
        setUsage((previous: any) =>
          !previous || p.observedAtMs >= previous.observedAtMs ? p : previous,
        );
      if (method === "session/listChanged" || method === "session/nameChanged")
        ignore(refreshSessions());
      if (!id) return;
      if (method === "desktop/media")
        setMedia((prev) => ({
          ...prev,
          [id]: { ...prev[id], [p.commandId]: p.media },
        }));
      if (
        [
          "session/tokenUsage",
          "session/contextUsage",
          "session/todoListChanged",
          "session/goalChanged",
          "turn/started",
          "turn/completed",
        ].includes(method)
      ) {
        setSessionStats((prev) => {
          const held = prev[id] || {};
          const now = Date.now();
          return {
            ...prev,
            [id]: {
              ...held,
              ...(method === "session/tokenUsage" ? { tokenUsage: p } : {}),
              ...(method === "session/contextUsage"
                ? { contextUsage: p.contextUsage || p }
                : {}),
              ...(method === "session/todoListChanged"
                ? { todoList: p.todoList || p }
                : {}),
              ...(method === "session/goalChanged"
                ? { goal: p.goal || p }
                : {}),
              ...(method === "turn/started"
                ? { startedAt: now, terminal: "running" }
                : {}),
              ...(method === "turn/completed"
                ? {
                    terminal: p.terminal,
                    durationMs: held.startedAt
                      ? now - held.startedAt
                      : undefined,
                  }
                : {}),
            },
          };
        });
      }
      if (method === "turn/started") {
        setTurns((prev) => ({ ...prev, [id]: p.turnId }));
        setCompleted((prev) => {
          const next = { ...prev };
          delete next[id];
          return next;
        });
      }
      if (method === "turn/completed") {
        setTurns((prev) => ({
          ...prev,
          [id]: prev[id] === p.turnId ? null : prev[id],
        }));
        persistTranscript(id);
        ignore(refreshSessions());
        setCompleted((prev) => ({ ...prev, [id]: p.terminal }));
        const settings = preferencesRef.current;
        if (
          settings.notifications &&
          (document.hidden ||
            id !== activeRef.current ||
            settings.notificationForeground)
        )
          ignore(
            window.muse.notify({
              title:
                p.terminal === "completed"
                  ? "Muse finished"
                  : `Muse ${p.terminal}`,
              body: p.error?.message || "Your conversation has a new response.",
              sessionId: id,
              silent: !settings.notificationSound,
            }),
          );
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
          if (buffering.current.has(id)) buffering.current.get(id)!.push(event);
          else publishItems(id);
        }
      }
      if (
        method === "approval/requested" &&
        preferencesRef.current.notifications &&
        (document.hidden ||
          id !== activeRef.current ||
          preferencesRef.current.notificationForeground)
      )
        ignore(
          window.muse.notify({
            title: "Muse needs permission",
            body: p.toolName || "Open the conversation to review this action.",
            sessionId: id,
            silent: !preferencesRef.current.notificationSound,
          }),
        );
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
    const offExit = window.muse.onHostExit((exit) => {
      if (exit.sessionId) {
        setTurns((prev) => ({ ...prev, [exit.sessionId]: null }));
        if (exit.sessionId === activeRef.current)
          setStatus(
            "Session engine stopped. Reopen this conversation to reconnect.",
          );
      } else {
        setStatus("Muse control host stopped. Refresh to reconnect.");
        setDiagnostic((prev: any) => ({ ...prev, connected: false }));
      }
    });
    const offError = window.muse.onProtocolError((text) =>
      setError(`Muse protocol: ${text}`),
    );
    const offLogs = window.muse.onStderr((text) =>
      setLogs((prev) => [...prev, text].slice(-30)),
    );
    ignore(
      window.muse
        .bootstrap()
        .then(async (result) => {
          if (!alive) return;
          setDiagnostic(result.diagnostic);
          accountIdentity.current = JSON.stringify([
            result.diagnostic.account?.state,
            result.diagnostic.account?.label,
          ]);
          setStorage(result.storage);
          ignore(window.muse.storageStats().then(setStorage));
          if (result.storage?.warning) setError(result.storage.warning);
          setWorkspaces(result.workspaces || []);
          ignore(window.muse.commands().then(setCommands));
          ignore(window.muse.mcpInventory().then(setMcp));
          setStatus(
            result.diagnostic.error ||
              (result.diagnostic.account?.state === "accountLogin"
                ? "Muse account connected"
                : "Ready"),
          );
          if (result.lastWorkspace && result.diagnostic.connected) {
            try {
              const connected = await window.muse.connectWorkspace(
                result.lastWorkspace,
              );
              if (alive) await hydrateWorkspace(connected.workspace);
            } catch (error: any) {
              if (alive) {
                setError(`Last project unavailable: ${error.message}`);
                ignore(refreshSessions());
                ignore(refreshUsage());
              }
            }
          } else if (result.diagnostic.connected) {
            ignore(refreshSessions());
            ignore(refreshUsage());
          } else setSessionsLoading(false);
          if (alive && result.requestedSession && result.diagnostic.connected)
            await loadSession(result.requestedSession);
        })
        .catch((error) => {
          if (alive) {
            setHistoryError(error.message);
            setError(error.message);
          }
        })
        .finally(() => {
          if (alive && !sessionsRequest.current) setSessionsLoading(false);
        }),
    );
    const focus = () => ignore(refreshAccount());
    window.addEventListener("focus", focus);
    return () => {
      alive = false;
      if (itemFrame.current != null) cancelAnimationFrame(itemFrame.current);
      itemFrame.current = null;
      if (cacheTimer.current) clearTimeout(cacheTimer.current);
      offEvent();
      offExit();
      offError();
      offLogs();
      window.removeEventListener("focus", focus);
    };
  }, [
    refreshAccount,
    refreshPending,
    refreshSessions,
    refreshUsage,
    bootAttempt,
  ]);
  useEffect(
    () => window.muse?.onNavigateSession((id) => void loadSession(id)),
    [sessions],
  );
  useEffect(() => {
    setSlashIndex(0);
  }, [prompt]);
  useEffect(() => {
    if (prompt.startsWith("/") && workspace && !session && !busy)
      void run(createSession);
  }, [prompt.startsWith("/"), workspace, session]);
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
  useLayoutEffect(() => {
    if (messagesLoading || !restoreScroll.current || !scrollRef.current) return;
    const saved = restoreScroll.current;
    restoreScroll.current = null;
    scrollRef.current.scrollTop = saved.follow
      ? scrollRef.current.scrollHeight
      : saved.top;
  }, [session, items, messagesLoading]);
  useEffect(() => {
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
      textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 180)}px`;
    }
  }, [prompt]);
  useEffect(() => {
    const resize = () => {
      if (innerWidth <= 950) setInspector(false);
    };
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, []);
  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key === ",") {
        event.preventDefault();
        setModal("settings");
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  const sidebarWorkspaces = useMemo(
    () => [...new Set([...workspaces, workspace])],
    [workspaces, workspace],
  );
  const sidebarActions = useRef<any>({});
  sidebarActions.current = {
    onCollapse: () =>
      setPreferences((prev) => ({
        ...prev,
        sidebarCollapsed: !prev.sidebarCollapsed,
      })),
    onArchived: setShowArchived,
    onSearch: setSearch,
    onUsage: () => void refreshUsage(),
    onAccount: () => setModal("account"),
    onSettings: () => settingsAt(),
    onUpdates: () => settingsAt("updates"),
    onTerminal: openTerminal,
    onNew: (root: string) => setNewConversation({ initial: root }),
    onSelect: (id: string) => void loadSession(id),
    onProject: (root: string) => void switchWorkspace(root),
    onActions: setConversationMenu,
    onRefresh: () => void refreshSessions(),
    onRetry: () => {
      setHistoryError("");
      setBootAttempt((v) => v + 1);
    },
    onHide: (root: string) => {
      setHiddenHistory((prev) => ({
        ...prev,
        roots: [...new Set([...prev.roots, root])],
      }));
      void window.muse
        .forgetWorkspace(root)
        .then((result) => setWorkspaces(result.workspaces || []))
        .catch((error) => setError(error.message));
    },
  };
  const sidebarCallbacks = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(sidebarActions.current).map((name) => [
          name,
          (...args: any[]) => sidebarActions.current[name](...args),
        ]),
      ),
    [],
  );
  const inspectorActions = useRef<any>({});
  inspectorActions.current = {
    onHide: () => setInspector(false),
    onPermissions: (value: string) =>
      void changePermissions(permissionProfile, value),
    onRefresh: () => run(async () => setMcp(await window.muse.mcpInventory())),
    onOpenCli: () => nativeCommand("/mcp"),
    onSkill: (selector: string) => {
      setPrompt(`/${selector} `);
      textareaRef.current?.focus();
    },
  };
  const inspectorCallbacks = useMemo(
    () =>
      Object.fromEntries(
        Object.keys(inspectorActions.current).map((name) => [
          name,
          (...args: any[]) => inspectorActions.current[name](...args),
        ]),
      ),
    [],
  );
  return (
    <div
      className={`app-shell ${preferences.sidebarCollapsed ? "sidebar-is-collapsed" : ""}`}
      style={
        {
          "--left-width": `${preferences.sidebarCollapsed ? 56 : preferences.leftWidth}px`,
          "--right-width": `${preferences.rightWidth}px`,
        } as React.CSSProperties
      }
    >
      <div className="window-bar">
        <MuseMark />
        <span>Muse Desktop</span>
        <span className="beta-badge">BETA</span>
        <span className="app-version">v{appVersion}</span>
        <span className="window-caption">A little space for big ideas.</span>
      </div>
      <WorkspaceSidebar
        {...(sidebarCallbacks as any)}
        sessions={sessions}
        workspaces={sidebarWorkspaces}
        workspace={workspace}
        session={session}
        collapsed={preferences.sidebarCollapsed}
        busy={busy}
        loading={sessionsLoading}
        historyError={historyError}
        turns={turns}
        completed={completed}
        hiddenHistory={hiddenHistory}
        showArchived={showArchived}
        search={search}
        accountName={accountName}
        signedIn={signedIn}
        usage={usage}
        usageLoading={usageLoading}
        usageChecked={usageChecked}
        usageError={usageError}
        updateAvailable={!!updates?.available}
      />
      {preferences.sidebarCollapsed ? (
        <div className="resize-handle collapsed-handle" />
      ) : (
        <ResizeHandle
          label="Resize conversations sidebar"
          value={preferences.leftWidth}
          onChange={(leftWidth) =>
            setPreferences((prev) => ({ ...prev, leftWidth }))
          }
        />
      )}
      <main className="main-panel">
        <header className="topbar">
          <div className="breadcrumb">
            <Folder size={14} />
            <span>{workspace ? basename(workspace) : "No folder"}</span>
            <span>/</span>
            <b>{active ? sessionTitle(active) : "New conversation"}</b>
          </div>
          <div className="top-actions">
            {!inspector ? (
              <button
                className="icon-button"
                title="Muse account"
                onClick={() => setModal("account")}
              >
                <LogIn size={15} />
              </button>
            ) : null}
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
              sessionId={session}
              visible={tab === "terminal"}
              theme={{
                ...theme,
                colors: {
                  ...theme.colors,
                  ...Object.fromEntries(
                    Object.entries(preferences.colors).filter(([, color]) =>
                      /^#[a-f0-9]{6}$/i.test(color || ""),
                    ),
                  ),
                },
              }}
              fontSize={preferences.codeSize}
              command={terminalCommand}
              onCommandUsed={() => setTerminalCommand("")}
            />
          </Suspense>
        ) : null}
        {tab === "activity" ? (
          <SessionDetails
            session={active || { sessionId: session, modelId }}
            stats={sessionStats[session] || {}}
            items={items}
            policy={permissionProfile}
          />
        ) : null}
        <div
          className="chat-scroll"
          aria-busy={messagesLoading}
          style={{ display: tab === "terminal" ? "none" : undefined }}
          ref={scrollRef}
          onScroll={(event) => {
            const target = event.currentTarget;
            followRef.current =
              target.scrollHeight - target.scrollTop - target.clientHeight < 80;
            if (activeRef.current)
              scrollPositions.current.set(activeRef.current, {
                top: target.scrollTop,
                follow: followRef.current,
              });
            setShowLatest(!followRef.current);
          }}
        >
          {diagnostic?.connected && !signedIn ? (
            <section className="connection-onboarding">
              <b>Connect your Muse account</b>
              <p>
                Sign in once with Muse Code. The desktop reuses the CLI session
                on this computer.
              </p>
              <button
                className="secondary-button"
                onClick={() => void openLogin()}
              >
                Connect Muse Code
              </button>
              <button
                className="text-button"
                onClick={() => void refreshAccount()}
              >
                Check CLI sign-in
              </button>
            </section>
          ) : null}
          {!diagnostic?.connected && diagnostic ? (
            <section className="connection-onboarding">
              <b>
                {diagnostic.cliInstalled
                  ? "Reconnect Muse Code"
                  : "Install or locate Muse Code"}
              </b>
              <p>
                {diagnostic.error ||
                  "The desktop app uses your installed Muse CLI and its active account session."}
              </p>
              <button
                className="secondary-button"
                onClick={() =>
                  void run(async () => {
                    const result = await window.muse.chooseBinary();
                    if (result) {
                      setDiagnostic(result);
                      setBootAttempt((value) => value + 1);
                    }
                  })
                }
              >
                Locate Muse CLI
              </button>
              <button
                className="text-button"
                onClick={() => setBootAttempt((value) => value + 1)}
              >
                Retry
              </button>
            </section>
          ) : null}
          {sessionRefreshing && !messagesLoading ? (
            <div className="cache-sync" role="status">
              <Loader2 size={11} className="spin" /> Updating from Muse…
            </div>
          ) : null}
          {messagesLoading ? (
            <div
              className="messages-loading"
              role="status"
              aria-label="Loading messages"
            >
              <Loader2 size={22} className="spin" />
              <b>Loading conversation…</b>
              <small>Restoring messages and activity</small>
            </div>
          ) : null}
          {items.length === 0 && !messagesLoading && tab === "conversation" ? (
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
            {tab === "conversation" ? (
              <ConversationTimeline
                items={items}
                sessionId={session}
                workspace={workspace}
                autoCollapse={preferences.autoCollapse}
                media={media[session] || EMPTY_MEDIA}
              />
            ) : tab === "activity" ? (
              <ActivityPanel
                items={tasks}
                sessionId={session}
                workspace={workspace}
              />
            ) : null}
            {tab === "conversation" && (
              <InlineAgents
                items={items}
                sessionId={session}
                onError={setError}
                onRefresh={() => void refreshSessions()}
              />
            )}
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
                <span>
                  {workspace
                    ? "Muse is working in your project"
                    : "Muse is working in this conversation"}
                </span>
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
        {showLatest && tab === "conversation" ? (
          <button
            className="jump-latest"
            onClick={() => {
              followRef.current = true;
              setShowLatest(false);
              scrollRef.current?.scrollTo({
                top: scrollRef.current.scrollHeight,
                behavior: "smooth",
              });
            }}
          >
            <ArrowDown size={14} /> Jump to latest
          </button>
        ) : null}
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
                    {image.mediaType.startsWith("video/") ? (
                      <SafeMedia
                        kind="video"
                        src={image.path}
                        preload="metadata"
                      />
                    ) : image.mediaType.startsWith("image/") ? (
                      <SafeMedia src={image.path} alt={image.name} />
                    ) : (
                      <FileText size={22} className="file-thumbnail" />
                    )}
                    <span
                      title={
                        image.textTruncated
                          ? "Excerpt limited to 100,000 characters. Muse can read the full local file."
                          : image.name
                      }
                    >
                      {image.name}
                      {image.textTruncated ? " · excerpt" : ""}
                    </span>
                    <button
                      title={`Remove ${image.name}`}
                      onClick={() => {
                        setImages((current) =>
                          current.filter((_, i) => i !== index),
                        );
                        void window.muse
                          .discardAttachment(image.id)
                          .catch(() => {});
                      }}
                    >
                      <X size={12} />
                    </button>
                  </div>
                ))}
              </div>
            ) : null}
            {slashOptions.length ? (
              <div
                className="slash-menu"
                id="slash-menu"
                role="listbox"
                aria-label="Muse slash commands"
              >
                {slashOptions.map((command, index) => (
                  <button
                    id={`slash-${index}`}
                    key={command.name}
                    role="option"
                    aria-selected={index === slashIndex}
                    className={index === slashIndex ? "selected" : ""}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => chooseCommand(command)}
                  >
                    <b>/{command.name}</b>
                    <span>{command.description}</span>
                    <small>
                      {command.route === "native"
                        ? "CLI"
                        : command.route === "skill"
                          ? "Skill"
                          : "Desktop"}
                    </small>
                  </button>
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
              disabled={readOnly || messagesLoading || !diagnostic?.connected}
              onChange={(event) => setPrompt(event.target.value)}
              onPaste={(event) => {
                if (event.clipboardData.files.length) {
                  event.preventDefault();
                  void addImages(event.clipboardData.files);
                }
              }}
              aria-controls={slashOptions.length ? "slash-menu" : undefined}
              aria-activedescendant={
                slashOptions.length ? `slash-${slashIndex}` : undefined
              }
              onKeyDown={(event) => {
                if (
                  slashOptions.length &&
                  ["ArrowUp", "ArrowDown", "Tab", "Enter", "Escape"].includes(
                    event.key,
                  )
                ) {
                  event.preventDefault();
                  if (event.key === "ArrowUp" || event.key === "ArrowDown")
                    setSlashIndex(
                      (index) =>
                        (index +
                          (event.key === "ArrowDown" ? 1 : -1) +
                          slashOptions.length) %
                        slashOptions.length,
                    );
                  else if (event.key === "Escape") setPrompt(prompt + " ");
                  else
                    chooseCommand(slashOptions[slashIndex] || slashOptions[0]);
                  return;
                }
                if (
                  event.key === "Enter" &&
                  !event.shiftKey &&
                  (preferences.sendKey === "enter" ||
                    event.ctrlKey ||
                    event.metaKey) &&
                  !event.nativeEvent.isComposing
                ) {
                  event.preventDefault();
                  void sendPrompt();
                }
              }}
              rows={1}
            />
            <div className="composer-controls">
              <div className="composer-left">
                <button
                  className="icon-button"
                  title="Attach files, images or videos"
                  disabled={uploading || busy}
                  onClick={() => fileRef.current?.click()}
                >
                  {uploading ? (
                    <Loader2 size={17} className="spin" />
                  ) : (
                    <Paperclip size={17} />
                  )}
                </button>
                <input
                  ref={fileRef}
                  type="file"
                  multiple
                  accept="image/png,image/jpeg,image/webp,image/gif,video/mp4,video/webm,video/quicktime,.pdf,.txt,.md,.json,.csv,.ts,.tsx,.js,.jsx,.py,.c,.cpp,.h,.cs,.go,.rs,.java,.css,.html,.yaml,.yml,.xml,.log,.sql,.sh,.docx,.xlsx,.zip"
                  hidden
                  onChange={(event) => {
                    if (event.target.files) void addImages(event.target.files);
                    event.target.value = "";
                  }}
                />
                <span className="control-divider" />
                <Select
                  compact
                  label="Model"
                  value={modelId}
                  disabled={busy || readOnly || sessionRefreshing}
                  options={[
                    { value: "", label: "Muse default" },
                    ...models.map((model) => ({
                      value: model.modelId,
                      label: model.displayLabel || model.modelId,
                      description: model.providerId,
                    })),
                  ]}
                  onChange={(selected) => {
                    if (session && selected)
                      void run(async () => {
                        await window.muse.setModel(
                          session,
                          models.find((row) => row.modelId === selected),
                        );
                        setModelId(selected);
                      });
                    else setModelId(selected);
                  }}
                />
                <button
                  className={`thinking-button ${reasoning !== "none" ? "active" : ""}`}
                  aria-pressed={reasoning !== "none"}
                  title="Thinking mode uses native Muse reasoning on your next message"
                  aria-label="Thinking mode"
                  onClick={() =>
                    setReasoning(reasoning === "none" ? "high" : "none")
                  }
                >
                  <Sparkles size={13} />
                  <span>Think</span>
                </button>
                <Select
                  compact
                  label="Reasoning effort"
                  value={reasoning}
                  options={efforts.map((effort) => ({
                    value: effort,
                    label:
                      effort === "default"
                        ? "Auto"
                        : effort === "none"
                          ? "Off"
                          : effort,
                  }))}
                  onChange={setReasoning}
                />
                <Select
                  compact
                  label="Permissions"
                  value={permissionProfile}
                  disabled={busy || working || readOnly}
                  options={[
                    {
                      value: "standard",
                      label: "Sandbox",
                      description: "Muse sandbox and approval rules",
                    },
                    {
                      value: "readonly",
                      label: "Read only",
                      description: "Writes and shell disabled",
                    },
                    {
                      value: "yolo",
                      label: "YOLO",
                      description:
                        "Allow all · sandbox disabled · trusted workspace",
                    },
                  ]}
                  onChange={(value) => void changePermissions(value)}
                />
                {working ? (
                  <Select
                    compact
                    label="Follow-up behavior"
                    value={preferences.followUp}
                    options={[
                      { value: "queue", label: "Queue" },
                      { value: "steer", label: "Steer" },
                    ]}
                    onChange={(followUp) =>
                      setPreferences((prev) => ({
                        ...prev,
                        followUp: followUp as "queue" | "steer",
                      }))
                    }
                  />
                ) : null}
                <button
                  className="icon-button"
                  title="Slash commands"
                  onClick={() => {
                    setPrompt("/");
                    textareaRef.current?.focus();
                  }}
                >
                  <Command size={15} />
                </button>
                <button
                  className="icon-button"
                  title="Delegate to agents"
                  onClick={() => {
                    setPrompt("/agents ");
                    textareaRef.current?.focus();
                  }}
                >
                  <Users size={15} />
                </button>
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
                    busy ||
                    uploading ||
                    readOnly ||
                    messagesLoading ||
                    sessionRefreshing ||
                    !diagnostic?.connected ||
                    !signedIn ||
                    (!prompt.trim() && !images.length)
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
              <kbd>{preferences.sendKey === "enter" ? "↵" : "Ctrl ↵"}</kbd> Send{" "}
              <span className="footer-separator">·</span> <kbd>⇧ ↵</kbd> New
              line
            </span>
          </div>
        </div>
      </main>
      {inspector ? (
        <>
          <ResizeHandle
            label="Resize details sidebar"
            value={preferences.rightWidth}
            reverse
            onChange={(rightWidth) =>
              setPreferences((prev) => ({ ...prev, rightWidth }))
            }
          />
          <WorkspaceInspector
            {...(inspectorCallbacks as any)}
            workspace={workspace}
            branch={active?.branch}
            permissionProfile={permissionProfile}
            approvalMode={approvalMode}
            modes={modes}
            disabled={busy || working || readOnly}
            inventory={mcp}
            skills={skills}
          />
        </>
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
      {newConversation ? (
        <NewConversation
          roots={workspaces}
          initial={newConversation.initial}
          busy={busy}
          onClose={() => setNewConversation(null)}
          onCreate={async (root) => {
            const id = await run(() =>
              createSession({ fresh: true, workspaceRoot: root }),
            );
            if (id) {
              setNewConversation(null);
              setPrompt("");
              setImages([]);
              textareaRef.current?.focus();
            }
          }}
        />
      ) : null}
      {conversationMenu ? (
        <Modal
          label="Conversation actions"
          onClose={() => setConversationMenu(null)}
        >
          <h2>{sessionTitle(conversationMenu)}</h2>
          <p>
            Archive hides a conversation from this desktop. Its native Muse
            history and files stay available.
          </p>
          <div className="conversation-actions">
            <button
              className="secondary-button"
              onClick={() => {
                setRenameTarget(conversationMenu.sessionId);
                setRename(sessionTitle(conversationMenu));
                setConversationMenu(null);
                setModal("rename");
              }}
            >
              Rename
            </button>
            <button
              className="secondary-button"
              onClick={() =>
                void run(async () => {
                  await window.muse.exportSession(conversationMenu.sessionId);
                  setConversationMenu(null);
                })
              }
            >
              Export Markdown
            </button>
            <button
              className="secondary-button"
              disabled={!!turns[conversationMenu.sessionId]}
              onClick={() => {
                const id = conversationMenu.sessionId;
                setHiddenHistory((previous) => ({
                  ...previous,
                  chats: previous.chats.includes(id)
                    ? previous.chats.filter((value) => value !== id)
                    : [...previous.chats, id],
                }));
                setConversationMenu(null);
              }}
            >
              {hiddenHistory.chats.includes(conversationMenu.sessionId)
                ? "Restore conversation"
                : "Archive conversation"}
            </button>
          </div>
        </Modal>
      ) : null}
      {modal ? (
        <Modal
          label={
            modal === "account"
              ? "Muse account"
              : modal === "settings"
                ? "Settings"
                : modal === "rename"
                  ? "Rename conversation"
                  : "Quick guide"
          }
          onClose={() => setModal(null)}
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
                <span className={`tiny-status ${signedIn ? "" : "working"}`} />
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
            <SettingsPanel
              value={preferences}
              onChange={setPreferences}
              themePreference={themePreference}
              onTheme={chooseTheme}
              category={settingsCategory}
              onCategory={setSettingsCategory}
              diagnostic={diagnostic}
              accountName={accountName}
              workspace={workspace}
              busy={busy || working}
              onAccount={() => setModal("account")}
              onProject={chooseWorkspace}
              onLocate={() =>
                void run(async () => {
                  const result = await window.muse.chooseBinary();
                  if (result) {
                    setDiagnostic(result);
                    setBootAttempt((v) => v + 1);
                  }
                })
              }
              onCli={() => void run(() => window.muse.openCli())}
              logs={logs}
              storage={storage}
              onPurge={() =>
                void run(async () => {
                  const result = await window.muse.purgeAttachments(
                    await drafts.retainedIds(),
                  );
                  setStorage(await window.muse.storageStats());
                  if (!result.cancelled)
                    setStatus(
                      `${result.removed || 0} unused attachment copies deleted`,
                    );
                })
              }
              onClearCache={() =>
                void run(async () => {
                  await clearConversationCache();
                  for (const id of stores.current.keys())
                    if (id !== activeRef.current) {
                      stores.current.delete(id);
                      sessionSnapshots.current.delete(id);
                      sessionExtras.current.delete(id);
                    }
                  setStatus(
                    "Conversation previews cleared. Native history and drafts are kept.",
                  );
                })
              }
              updates={updates}
              checkingUpdates={checkingUpdates}
              onCheckUpdates={() => void checkUpdates(true)}
            />
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
                    await window.muse.rename(
                      renameTarget || session,
                      rename.trim(),
                    );
                    await refreshSessions();
                    setModal(null);
                  })
                }
              >
                Save name
              </button>
            </>
          ) : null}
        </Modal>
      ) : null}
    </div>
  );
}
