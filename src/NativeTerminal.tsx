import { useEffect, useRef, useState } from "react";
import {
  Terminal as TerminalIcon,
  RefreshCw,
  ExternalLink,
  Loader2,
} from "lucide-react";
import type { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { terminalTheme, type Theme } from "./themes";

export default function NativeTerminal({
  workspace,
  sessionId,
  visible,
  theme,
  fontSize = 13,
  command = "",
  onCommandUsed,
}: {
  workspace: string;
  sessionId: string;
  visible: boolean;
  theme: Theme;
  fontSize?: number;
  command?: string;
  onCommandUsed?: () => void;
}) {
  const element = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const latestTheme = useRef(theme);
  latestTheme.current = theme;
  const latestFont = useRef(fontSize);
  latestFont.current = fontSize;
  useEffect(() => {
    if (terminalRef.current) {
      terminalRef.current.options.theme = terminalTheme(theme);
      terminalRef.current.options.fontSize = fontSize;
      fitRef.current?.();
    }
  }, [theme, fontSize]);
  const context = useRef({ sessionId, workspaceRoot: workspace });
  context.current = { sessionId, workspaceRoot: workspace };
  const [terminalSession, setTerminalSession] = useState(sessionId);
  const [cwd, setCwd] = useState(workspace);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [exited, setExited] = useState(false);
  async function start() {
    setStarting(true);
    setError("");
    setExited(false);
    try {
      const requested = { ...context.current };
      const terminal = terminalRef.current;
      const result = await window.muse.terminalStart({
        ...requested,
        cols: terminal?.cols || 100,
        rows: terminal?.rows || 30,
      });
      setCwd(result.cwd);
      setTerminalSession(result.sessionId ?? requested.sessionId);
      if (result.buffer) terminal?.write(result.buffer);
      terminal?.focus();
    } catch (err: any) {
      setError(err.message);
    } finally {
      setStarting(false);
    }
  }
  useEffect(() => {
    let cancelled = false;
    let cleanup = () => {};
    void Promise.all([import("@xterm/xterm"), import("@xterm/addon-fit")])
      .then(([{ Terminal }, { FitAddon }]) => {
        if (cancelled || !element.current) return;
        const terminal = new Terminal({
          cursorBlink: true,
          fontSize: latestFont.current,
          fontFamily: 'Consolas, "SFMono-Regular", monospace',
          scrollback: 10000,
          allowProposedApi: false,
          theme: terminalTheme(latestTheme.current),
        });
        const fit = new FitAddon();
        terminal.loadAddon(fit);
        terminal.open(element.current);
        fit.fit();
        terminalRef.current = terminal;
        fitRef.current = () => {
          fit.fit();
          void window.muse.terminalResize(terminal.cols, terminal.rows);
        };
        const offData = window.muse.onTerminalData((data) =>
          terminal.write(data),
        );
        const offExit = window.muse.onTerminalExit((exit) => {
          setExited(true);
          terminal.write(
            `\r\n\x1b[90mMuse exited (${exit.exitCode ?? "signal"}). Use Restart to open it again.\x1b[0m\r\n`,
          );
        });
        const input = terminal.onData((data) => {
          void window.muse.terminalWrite(data);
        });
        const observer = new ResizeObserver(() => {
          if (element.current?.offsetWidth) fitRef.current?.();
        });
        observer.observe(element.current);
        cleanup = () => {
          offData();
          offExit();
          input.dispose();
          observer.disconnect();
          terminal.dispose();
          terminalRef.current = null;
          fitRef.current = null;
        };
        void start();
      })
      .catch((err) => {
        setError(err.message);
        setStarting(false);
      });
    return () => {
      cancelled = true;
      cleanup();
    };
  }, []);
  useEffect(() => {
    if (visible)
      requestAnimationFrame(() => {
        fitRef.current?.();
        terminalRef.current?.focus();
      });
  }, [visible]);
  return (
    <section
      className="native-terminal"
      aria-label="Native Muse CLI"
      style={{ display: visible ? "flex" : "none" }}
    >
      <div className="terminal-toolbar">
        <TerminalIcon size={14} />
        <span>Muse Code · native terminal</span>
        <small title={cwd}>{cwd}</small>
        <button
          className="text-button"
          disabled={starting}
          onClick={() => {
            void window.muse
              .terminalRestart()
              .then((result) => {
                if (!result.cancelled) {
                  terminalRef.current?.reset();
                  void start();
                }
              })
              .catch((err) => setError(err.message));
          }}
        >
          <RefreshCw size={12} /> Restart
        </button>
        <button
          className="icon-button"
          title="Open external CLI window"
          onClick={() => {
            void window.muse
              .openCli(context.current)
              .catch((err) => setError(err.message));
          }}
        >
          <ExternalLink size={13} />
        </button>
      </div>
      {command ? (
        <div className="terminal-notice command-transfer">
          <code>{command}</code>
          <span>
            Focus the CLI prompt, insert the command, then press Enter.
          </span>
          <button
            className="secondary-button"
            disabled={
              starting ||
              exited ||
              terminalSession !== sessionId ||
              (!!workspace && cwd !== workspace)
            }
            onClick={() =>
              void window.muse
                .terminalWrite(command)
                .then(() => {
                  onCommandUsed?.();
                  terminalRef.current?.focus();
                })
                .catch((err) => setError(err.message))
            }
          >
            Insert command
          </button>
        </div>
      ) : null}
      {starting ? (
        <div className="terminal-notice">
          <Loader2 size={14} className="spin" /> Starting your installed Muse
          Code…
        </div>
      ) : null}
      {error ? (
        <div className="terminal-notice terminal-error">{error}</div>
      ) : null}
      {!error &&
      (terminalSession !== sessionId || (workspace && cwd !== workspace)) ? (
        <div className="terminal-notice">
          This terminal is still attached to its original conversation folder.
          Restart to use the selected conversation.
        </div>
      ) : null}
      {exited ? (
        <div className="terminal-notice">
          Muse has exited. Restart to continue.
        </div>
      ) : null}
      <div ref={element} className="terminal-canvas" />
      <div className="terminal-footer">
        Muse Code runs a separate CLI conversation in the selected folder.
        Commands inserted here do not change the GUI conversation.
      </div>
    </section>
  );
}
