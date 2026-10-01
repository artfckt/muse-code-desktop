import {
  useDeferredValue,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Check, ChevronDown, Loader2, Search } from "lucide-react";
import { fonts } from "./desktop-preferences";
let installedRequest: Promise<string[]> | undefined;
const ROW = 34;
export function FontPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (font: string) => void;
}) {
  const id = useId();
  const trigger = useRef<HTMLButtonElement>(null);
  const popup = useRef<HTMLDivElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [installed, setInstalled] = useState<string[]>([]);
  const [status, setStatus] = useState("Loading installed fonts…");
  const [loading, setLoading] = useState(false);
  const [query, setQuery] = useState("");
  const filter = useDeferredValue(query);
  const [candidate, setCandidate] = useState(value);
  const [scroll, setScroll] = useState(0);
  const [position, setPosition] = useState({
    left: 0,
    top: 0,
    width: 340,
    maxHeight: 440,
  });
  const options = useMemo(
    () =>
      [...new Set([...fonts, value, ...installed])].filter((font) =>
        font.toLowerCase().includes(filter.trim().toLowerCase()),
      ),
    [installed, filter, value],
  );
  const start = Math.max(0, Math.floor(scroll / ROW) - 2);
  const visible = options.slice(start, start + 12);
  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  useLayoutEffect(() => {
    if (!open) return;
    const place = () => {
      const bounds = trigger.current!.getBoundingClientRect();
      const width = Math.min(360, innerWidth - 24);
      const height = Math.min(440, innerHeight - 24);
      setPosition({
        left: Math.max(12, Math.min(bounds.left, innerWidth - width - 12)),
        top: Math.max(
          12,
          Math.min(bounds.bottom + 5, innerHeight - height - 12),
        ),
        width,
        maxHeight: height,
      });
    };
    place();
    window.addEventListener("resize", place);
    return () => window.removeEventListener("resize", place);
  }, [open]);
  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    let alive = true;
    setLoading(true);
    installedRequest ||= window.muse.systemFonts().catch((error) => {
      installedRequest = undefined;
      throw error;
    });
    void installedRequest
      .then((names) => {
        if (alive) {
          setInstalled(names);
          setStatus(`${names.length} installed fonts`);
        }
      })
      .catch(() => {
        if (alive)
          setStatus(
            "Installed fonts unavailable. You can still use the defaults.",
          );
      })
      .finally(() => {
        if (alive) setLoading(false);
      });
    const dismiss = (event: PointerEvent) => {
      if (
        !popup.current?.contains(event.target as Node) &&
        !trigger.current?.contains(event.target as Node)
      )
        setOpen(false);
    };
    document.addEventListener("pointerdown", dismiss);
    return () => {
      alive = false;
      document.removeEventListener("pointerdown", dismiss);
    };
  }, [open]);
  useEffect(() => {
    setScroll(0);
    if (list.current) list.current.scrollTop = 0;
  }, [filter]);
  function move(key: string) {
    const index = options.indexOf(candidate);
    const next =
      key === "Home"
        ? 0
        : key === "End"
          ? options.length - 1
          : Math.max(
              0,
              Math.min(
                options.length - 1,
                index + (key === "ArrowDown" ? 1 : -1),
              ),
            );
    if (!options[next]) return;
    setCandidate(options[next]);
    if (list.current) {
      const top = next * ROW;
      if (top < list.current.scrollTop) list.current.scrollTop = top;
      else if (top + ROW > list.current.scrollTop + list.current.clientHeight)
        list.current.scrollTop = top + ROW - list.current.clientHeight;
    }
  }
  return (
    <div className="font-picker">
      <button
        type="button"
        ref={trigger}
        className="custom-select"
        role="combobox"
        aria-label="Interface font"
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-controls={open ? `${id}-list` : undefined}
        onClick={() => {
          setCandidate(value);
          setQuery("");
          setScroll(0);
          setOpen(!open);
        }}
        onKeyDown={(event) => {
          if (["ArrowDown", "ArrowUp"].includes(event.key)) {
            event.preventDefault();
            setCandidate(value);
            setOpen(true);
          } else if (event.key === "Escape" && open) {
            event.stopPropagation();
            close();
          }
        }}
      >
        <span>{value}</span>
        <ChevronDown size={13} />
      </button>
      <small className="settings-hint">
        Choose a font, preview it, then apply. Used in the interface and chat;
        code stays monospace.
      </small>
      <div
        className="font-specimen"
        style={{ fontFamily: `"${value}", sans-serif` }}
      >
        The quick brown fox · Aa Bb 012345
      </div>
      {value !== fonts[0] && (
        <button className="text-button" onClick={() => onChange(fonts[0])}>
          Use default font
        </button>
      )}
      {open &&
        createPortal(
          <div
            ref={popup}
            className="font-popup"
            style={position}
            onKeyDown={(event) => {
              if (event.key === "Escape") {
                event.preventDefault();
                event.stopPropagation();
                close();
              } else if (
                ["ArrowDown", "ArrowUp"].includes(event.key) ||
                (event.ctrlKey && ["Home", "End"].includes(event.key))
              ) {
                event.preventDefault();
                move(event.key);
              }
            }}
          >
            <label className="font-popup-search">
              <Search size={14} />
              <input
                ref={search}
                aria-label="Search installed fonts"
                placeholder="Search fonts on this computer…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <small className="font-catalog-status" role="status">
              {loading && <Loader2 size={12} className="spin" />}
              {loading ? "Loading installed fonts…" : status}
            </small>
            <div
              ref={list}
              className="font-virtual-list"
              role="listbox"
              id={`${id}-list`}
              aria-label="Interface font"
              onScroll={(event) => setScroll(event.currentTarget.scrollTop)}
            >
              <div
                style={{ height: options.length * ROW, position: "relative" }}
              >
                {visible.map((font, index) => (
                  <div
                    role="option"
                    aria-selected={candidate === font}
                    aria-label={font}
                    aria-posinset={start + index + 1}
                    aria-setsize={options.length}
                    key={font}
                    className={`font-name-option ${candidate === font ? "selected" : ""}`}
                    style={{
                      position: "absolute",
                      top: (start + index) * ROW,
                      height: ROW,
                      width: "100%",
                    }}
                    onMouseDown={(event) => event.preventDefault()}
                    onClick={() => setCandidate(font)}
                  >
                    <span>{font}</span>
                    {candidate === font && <Check size={12} />}
                  </div>
                ))}
              </div>
              {!options.length && (
                <p className="settings-hint">No matching fonts.</p>
              )}
            </div>
            <div className="font-live-preview" aria-live="polite">
              <small>PREVIEW · {candidate}</small>
              <p style={{ fontFamily: `"${candidate}", sans-serif` }}>
                Make room for your next idea.
                <br />
                Aa Bb Cc · 0123456789
              </p>
            </div>
            <div className="font-popup-actions">
              <button className="text-button" onClick={close}>
                Cancel
              </button>
              <button
                className="primary-button"
                onClick={() => {
                  onChange(candidate);
                  close();
                }}
              >
                Apply font
              </button>
            </div>
          </div>,
          trigger.current?.closest("dialog") || document.body,
        )}
    </div>
  );
}
