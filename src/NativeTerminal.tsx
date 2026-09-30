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
  visible,
  theme,
}: {
  workspace: string;
  visible: boolean;
  theme: Theme;
}) {
  const element = useRef<HTMLDivElement>(null);
  const terminalRef = useRef<Terminal | null>(null);
  const fitRef = useRef<(() => void) | null>(null);
  const latestTheme = useRef(theme);
  latestTheme.current = theme;
  useEffect(() => {
    if (terminalRef.current)
      terminalRef.current.options.theme = terminalTheme(theme);
  }, [theme]);
  const [cwd, setCwd] = useState(workspace);
  const [error, setError] = useState("");
  const [starting, setStarting] = useState(true);
  const [exited, setExited] = useState(false);
  async function start() {
    setStarting(true);
    setError("");
    setExited(false);
    try {
      const terminal = terminalRef.current;
      const result = await window.muse.terminalStart({
        cols: terminal?.cols || 100,
        rows: terminal?.rows || 30,
      });
      setCwd(result.cwd);
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
          fontSize: 13,
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
            void window.muse.openCli().catch((err) => setError(err.message));
          }}
        >
          <ExternalLink size={13} />
        </button>
      </div>
      {starting ? (
        <div className="terminal-notice">
          <Loader2 size={14} className="spin" /> Starting your installed Muse
          Code…
        </div>
      ) : null}
      {error ? (
        <div className="terminal-notice terminal-error">{error}</div>
      ) : null}
      {!error && cwd !== workspace && workspace ? (
        <div className="terminal-notice">
          This terminal remains in its original project. Restart to use the
          selected workspace.
        </div>
      ) : null}
      {exited ? (
        <div className="terminal-notice">
          Muse has exited. Restart to continue.
        </div>
      ) : null}
      <div ref={element} className="terminal-canvas" />
      <div className="terminal-footer">
        The original Muse Code interface, running locally. Slash commands, trust
        prompts, approvals, and settings are handled by Muse.
      </div>
    </section>
  );
}
