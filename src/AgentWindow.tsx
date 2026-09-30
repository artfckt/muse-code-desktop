import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { ArrowDown, ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { MuseMark } from "./components";
import { ConversationTimeline } from "./SessionPanels";
import {
  historyItems,
  Transcript,
  type MuseEvent,
  type MuseItem,
} from "./protocol";
import { applyTheme, readThemePreference, resolveTheme } from "./themes";
import {
  applyPreferences,
  readPreferences,
  normalizePreferences,
} from "./desktop-preferences";
import { version } from "../package.json";

export function AgentWindow({ id, parent }: { id: string; parent: string }) {
  const [appearancePreferences, setAppearancePreferences] =
    useState(readPreferences);
  const [items, setItems] = useState<MuseItem[]>([]);
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState("");
  const [media, setMedia] = useState<Record<string, any[]>>({});
  const [live, setLive] = useState(false);
  const [loading, setLoading] = useState(true);
  const [earlierLoading, setEarlierLoading] = useState(false);
  const [showLatest, setShowLatest] = useState(false);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const store = useRef(new Transcript());
  const generation = useRef(0);
  const buffered = useRef<MuseEvent[] | null>(null);
  const scroll = useRef<HTMLDivElement>(null);
  const follow = useRef(true);
  const alive = useRef(true);
  useEffect(() => {
    let appearance: any = null;
    const system = matchMedia("(prefers-color-scheme: dark)");
    const update = () => {
      const theme = resolveTheme(
        appearance?.themePreference || readThemePreference(),
        system.matches,
      );
      const preferences = normalizePreferences(
        appearance?.preferences || readPreferences(),
      );
      setAppearancePreferences(preferences);
      applyTheme(theme);
      applyPreferences(preferences);
      void window.muse
        .setWindowTheme({
          background: preferences.colors.bg || theme.colors.bg,
          foreground: preferences.colors.text || theme.colors.text,
        })
        .catch(() => {});
    };
    const accept = (value: any) => {
      appearance = value;
      update();
    };
    const offAppearance = window.muse.onAppearance(accept);
    void window.muse
      .agentAppearance()
      .then(accept)
      .catch(() => {});
    update();
    window.addEventListener("storage", update);
    system.addEventListener("change", update);
    return () => {
      offAppearance();
      window.removeEventListener("storage", update);
      system.removeEventListener("change", update);
    };
  }, []);
  async function refresh() {
    const request = ++generation.current;
    buffered.current = [];
    setLoading(true);
    setError("");
    try {
      const result = await window.muse.readSession(id);
      if (!alive.current || request !== generation.current) return;
      const history = historyItems(result);
      if (history) store.current.seed(history);
      else {
        const page = await window.muse.viewPage(id);
        if (!alive.current || request !== generation.current) return;
        store.current.seed([]);
        page.events?.forEach((event: MuseEvent) => store.current.apply(event));
        setNextCursor(page.nextCursor);
      }
      for (const event of buffered.current || []) store.current.apply(event);
      buffered.current = null;
      setSession(result.session);
      setItems(store.current.list());
      const saved = await window.muse.sessionMedia(id);
      if (alive.current && request === generation.current) setMedia(saved);
    } catch (error: any) {
      if (alive.current && request === generation.current)
        setError(error.message);
    } finally {
      if (alive.current && request === generation.current) {
        buffered.current = null;
        setLoading(false);
      }
    }
  }
  useEffect(() => {
    alive.current = true;
    const off = window.muse.onEvent((event: MuseEvent) => {
      if (event.params?.sessionId !== id) return;
      if (event.method.startsWith("item/")) {
        if (buffered.current) buffered.current.push(event);
        else {
          store.current.apply(event);
          setItems(store.current.list());
        }
      }
      if (event.method === "turn/completed" || event.method === "view/gap")
        void refresh();
    });
    void window.muse
      .subscribeSession(id)
      .then(() => {
        if (alive.current) setLive(true);
      })
      .catch((error) => {
        if (alive.current) setError(error.message);
      });
    void refresh();
    return () => {
      alive.current = false;
      ++generation.current;
      off();
    };
  }, [id]);
  useLayoutEffect(() => {
    if (follow.current && scroll.current)
      scroll.current.scrollTop = scroll.current.scrollHeight;
  }, [items, loading]);
  return (
    <div className="agent-window">
      <div className="window-bar">
        <MuseMark />
        <span>Muse Agent</span>
        <span className="beta-badge">BETA</span>
        <span className="app-version">v{version}</span>
      </div>
      <header>
        <h2>{session?.name || session?.title || `Agent ${id.slice(0, 8)}`}</h2>
        <span>{live ? "Live conversation" : "Conversation"}</span>
        <button
          className="icon-button"
          title="Refresh agent conversation"
          disabled={loading}
          onClick={() => void refresh()}
        >
          <RefreshCw size={15} />
        </button>
        {parent ? (
          <button
            className="text-button"
            onClick={() =>
              void window.muse
                .openConversation(parent)
                .catch((error) => setError(error.message))
            }
          >
            Parent <ExternalLink size={12} />
          </button>
        ) : null}
      </header>
      <div className="agent-window-info">
        {session?.workspaceRoot || "No folder"} · {session?.modelId}
        <small>
          Agent controls and follow-up messages are in the parent conversation’s
          Agents tab.
        </small>
      </div>
      {error ? (
        <p className="inline-error" role="alert">
          {error}
        </p>
      ) : null}
      <div
        className="chat-scroll"
        ref={scroll}
        aria-busy={loading}
        onScroll={(event) => {
          const element = event.currentTarget;
          follow.current =
            element.scrollHeight - element.scrollTop - element.clientHeight <
            80;
          setShowLatest(!follow.current);
        }}
      >
        {loading ? (
          <div
            className="messages-loading"
            role="status"
            aria-label="Loading agent messages"
          >
            <Loader2 className="spin" size={20} />
            <b>Loading agent conversation…</b>
          </div>
        ) : null}
        <div className="transcript">
          {nextCursor ? (
            <button
              className="text-button"
              disabled={earlierLoading}
              onClick={async () => {
                setEarlierLoading(true);
                const height = scroll.current?.scrollHeight || 0;
                follow.current = false;
                try {
                  const page = await window.muse.viewPage(id, nextCursor);
                  const earlier = new Transcript();
                  page.events?.forEach((event: MuseEvent) =>
                    earlier.apply(event),
                  );
                  store.current.seed([
                    ...earlier.list(),
                    ...store.current.list(),
                  ]);
                  setItems(store.current.list());
                  setNextCursor(page.nextCursor);
                  requestAnimationFrame(() => {
                    if (scroll.current)
                      scroll.current.scrollTop +=
                        scroll.current.scrollHeight - height;
                  });
                } catch (error: any) {
                  setError(error.message);
                } finally {
                  setEarlierLoading(false);
                }
              }}
            >
              {earlierLoading
                ? "Loading earlier messages…"
                : "Load earlier agent messages"}
            </button>
          ) : null}
          <ConversationTimeline
            items={items}
            sessionId={id}
            workspace={session?.workspaceRoot || ""}
            media={media}
            working={!!session?.activeTurnId}
            autoCollapse={appearancePreferences.autoCollapse}
          />
          {!items.length && !loading && !error ? (
            <p>Waiting for this agent’s first message…</p>
          ) : null}
        </div>
      </div>
      {showLatest ? (
        <button
          className="jump-latest"
          onClick={() => {
            follow.current = true;
            setShowLatest(false);
            scroll.current?.scrollTo({
              top: scroll.current.scrollHeight,
              behavior: "smooth",
            });
          }}
        >
          <ArrowDown size={14} /> Jump to latest
        </button>
      ) : null}
    </div>
  );
}
