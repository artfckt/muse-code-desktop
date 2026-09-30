import { useEffect, useRef, useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { MuseMark, TranscriptItem } from "./components";
import {
  historyItems,
  Transcript,
  type MuseEvent,
  type MuseItem,
} from "./protocol";
import { applyTheme, readThemePreference, resolveTheme } from "./themes";
import { applyPreferences, readPreferences } from "./desktop-preferences";

export function AgentWindow({ id, parent }: { id: string; parent: string }) {
  const [items, setItems] = useState<MuseItem[]>([]);
  const [session, setSession] = useState<any>(null);
  const [error, setError] = useState("");
  const [media, setMedia] = useState<Record<string, any[]>>({});
  const [live, setLive] = useState(false);
  const storeRef = useRef(new Transcript());
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  async function seed(result: any) {
    const history = historyItems(result);
    if (history) storeRef.current.seed(history);
    else {
      const page = await window.muse.viewPage(id);
      storeRef.current.seed([]);
      page.events?.forEach((event: MuseEvent) => storeRef.current.apply(event));
      setNextCursor(page.nextCursor);
    }
    setItems(storeRef.current.list());
  }
  useEffect(() => {
    const updateTheme = () => {
      const theme = resolveTheme(
        readThemePreference(),
        matchMedia("(prefers-color-scheme: dark)").matches,
      );
      const preferences = readPreferences();
      applyTheme(theme);
      applyPreferences(preferences);
      void window.muse.setWindowTheme({
        background: preferences.colors.bg || theme.colors.bg,
        foreground: preferences.colors.text || theme.colors.text,
      });
    };
    updateTheme();
    window.addEventListener("storage", updateTheme);
    return () => window.removeEventListener("storage", updateTheme);
  }, []);
  async function refresh() {
    try {
      const result = await window.muse.readSession(id);
      setSession(result.session);
      await seed(result);
      setMedia(await window.muse.sessionMedia(id));
      setError("");
    } catch (err: any) {
      setError(err.message);
    }
  }
  useEffect(() => {
    let alive = true;
    const store = storeRef.current;
    const buffered: MuseEvent[] = [];
    let ready = false;
    const off = window.muse.onEvent((event: MuseEvent) => {
      if (event.params?.sessionId !== id) return;
      if (!ready) buffered.push(event);
      else if (event.method.startsWith("item/")) {
        store.apply(event);
        setItems(store.list());
      }
      if (event.method === "turn/completed") void refresh();
    });
    // Subscribe before reading so events racing with the snapshot are retained.
    void window.muse
      .subscribeSession(id)
      .then(() => {
        if (alive) setLive(true);
      })
      .catch((err) => {
        if (alive) setError(err.message);
      })
      .finally(async () => {
        try {
          const result = await window.muse.readSession(id);
          if (!alive) return;
          setSession(result.session);
          await seed(result);
          buffered.forEach((event) => store.apply(event));
          ready = true;
          setItems(store.list());
          setMedia(await window.muse.sessionMedia(id));
        } catch (err: any) {
          if (alive) setError(err.message);
        }
      });
    return () => {
      alive = false;
      off();
    };
  }, [id]);
  return (
    <div className="agent-window">
      <div className="window-bar">
        <MuseMark />
        <span>Muse Agent</span>
      </div>
      <header>
        <h2>{session?.name || session?.title || `Agent ${id.slice(0, 8)}`}</h2>
        <span>{live ? "Live conversation" : "Conversation"}</span>
        <button
          className="icon-button"
          title="Refresh agent conversation"
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
                .catch((err) => setError(err.message))
            }
          >
            Parent <ExternalLink size={12} />
          </button>
        ) : null}
      </header>
      <div className="agent-window-info">
        {session?.workspaceRoot} · {session?.modelId}
        <small>
          Agent controls and follow-up messages are available in the parent
          conversation’s Agents tab.
        </small>
      </div>
      {error ? <p className="inline-error">{error}</p> : null}
      <div className="chat-scroll">
        <div className="transcript">
          {nextCursor ? (
            <button
              className="text-button"
              onClick={() =>
                void window.muse
                  .viewPage(id, nextCursor)
                  .then((page) => {
                    const earlier = new Transcript();
                    page.events?.forEach((event: MuseEvent) =>
                      earlier.apply(event),
                    );
                    storeRef.current.seed([
                      ...earlier.list(),
                      ...storeRef.current.list(),
                    ]);
                    setItems(storeRef.current.list());
                    setNextCursor(page.nextCursor);
                  })
                  .catch((err) => setError(err.message))
              }
            >
              Load earlier agent messages
            </button>
          ) : null}
          {items.map((item) => (
            <TranscriptItem
              key={item.itemId}
              item={{
                ...item,
                sessionId: id,
                workspace: session?.workspaceRoot,
                desktopMedia: media[item.commandId],
              }}
            />
          ))}
          {!items.length ? (
            <p>Waiting for this agent’s first message…</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
