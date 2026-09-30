import { createContext, useContext, useEffect, useRef, useState } from "react";
import ReactMarkdown, { defaultUrlTransform } from "react-markdown";
import remarkGfm from "remark-gfm";
import remarkMath from "remark-math";
import rehypeKatex from "rehype-katex";
import hljs from "highlight.js";
import { Copy, Check, ExternalLink } from "lucide-react";
import "katex/dist/katex.min.css";

export function isLocal(value: string) {
  return /^(?:file:|\/?[a-z]:[\\/]|\/[^/]|\.\.?[\\/])/i.test(value);
}
function decodeMediaPath(value: string) {
  if (/^https?:|^file:|^data:/i.test(value)) return value;
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
export const MediaSession = createContext<string | undefined>(undefined);
export function mediaUrl(value: string, workspace = "") {
  if (/^(?:https?:|data:image\/(?:png|jpeg|gif|webp);base64,)/i.test(value))
    return value;
  if (value.startsWith("muse-media:")) {
    try {
      return new URL(value).searchParams.get("path") || "";
    } catch {
      return "";
    }
  }
  if (/^\.\.?[\\/]/.test(value) && workspace) return `${workspace}/${value}`;
  return value;
}
// Local file URLs are granted by main, never constructed from Markdown alone.
export function SafeMedia({ src, kind = "image", ...props }: any) {
  const sessionId = useContext(MediaSession);
  const [resolved, setResolved] = useState<string>();
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    setResolved(undefined);
    setError("");
    if (/^https?:|^data:image\/(png|jpeg|gif|webp);base64,/i.test(src || ""))
      setResolved(src);
    else if (src)
      void window.muse
        .resolveMedia(src, sessionId)
        .then((url) => {
          if (alive) setResolved(url);
        })
        .catch((error) => {
          if (alive) setError(error.message);
        });
    return () => {
      alive = false;
    };
  }, [src, sessionId]);
  if (error)
    return (
      <span className="media-unavailable" title={error}>
        Local media unavailable
      </span>
    );
  if (!resolved)
    return (
      <span className="media-unavailable" role="status">
        Loading media…
      </span>
    );
  if (kind === "video") return <video {...props} src={resolved} />;
  if (kind === "audio") return <audio {...props} src={resolved} />;
  return <img {...props} src={resolved} />;
}
// Muse emits Windows paths containing spaces and nested parentheses. CommonMark
// requires those destinations to be wrapped in angle brackets or URL encoded.
export function normalizeLinks(text: string) {
  return text
    .split(/(```[\s\S]*?```|`[^`]*`)/g)
    .map((part, index) => {
      if (index % 2) return part;
      const pattern = /(!?\[[^\]\n]*\])\(/g;
      let result = "",
        cursor = 0,
        match;
      while ((match = pattern.exec(part))) {
        const start = pattern.lastIndex;
        let depth = 1,
          end = -1;
        for (let i = start; i < part.length && part[i] !== "\n"; i++) {
          if (part[i] === "(") depth++;
          if (part[i] === ")" && --depth === 0) {
            end = i;
            break;
          }
        }
        if (end < 0) continue;
        const destination = part.slice(start, end);
        if (!isLocal(destination)) continue;
        let destinationUrl;
        try {
          destinationUrl = destination.startsWith("file:")
            ? new URL(destination).href
            : encodeURI(destination.replace(/\\/g, "/"));
        } catch {
          continue;
        }
        const encoded = destinationUrl.replace(/[()]/g, (c) =>
          c === "(" ? "%28" : "%29",
        );
        result += part.slice(cursor, match.index) + `${match[1]}(<${encoded}>)`;
        cursor = end + 1;
        pattern.lastIndex = cursor;
      }
      return (result + part.slice(cursor)).replace(
        /\$\$([^\n]+?)\$\$/g,
        (_, formula) => `$$\n${formula}\n$$`,
      );
    })
    .join("");
}

function Diagram({ code }: { code: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    const render = async () => {
      try {
        const { default: mermaid } = await import("mermaid");
        mermaid.initialize({
          startOnLoad: false,
          securityLevel: "strict",
          theme: "base",
          themeVariables: {
            primaryColor: getComputedStyle(document.documentElement)
              .getPropertyValue("--panel")
              .trim(),
            primaryTextColor: getComputedStyle(document.documentElement)
              .getPropertyValue("--text")
              .trim(),
            lineColor: getComputedStyle(document.documentElement)
              .getPropertyValue("--mint")
              .trim(),
            fontFamily: getComputedStyle(document.documentElement).fontFamily,
          },
        });
        const { svg } = await mermaid.render(
          `diagram-${crypto.randomUUID()}`,
          code,
        );
        if (alive && ref.current) {
          ref.current.innerHTML = svg;
          setError("");
        }
      } catch (err: any) {
        if (alive) setError(err.message || "Diagram unavailable");
      }
    };
    void render();
    const observer = new MutationObserver(() => void render());
    observer.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ["data-theme", "style"],
    });
    return () => {
      alive = false;
      observer.disconnect();
    };
  }, [code]);
  return (
    <div className="diagram">
      <div ref={ref} />
      {error ? (
        <details>
          <summary>Diagram source</summary>
          <pre>{code}</pre>
          <small>{error}</small>
        </details>
      ) : null}
    </div>
  );
}
function Code({ children, className }: any) {
  const [copied, setCopied] = useState(false);
  const language = /language-([\w-]+)/.exec(className || "")?.[1];
  const code = String(children).replace(/\n$/, "");
  if (language === "mermaid") return <Diagram code={code} />;
  if (!language && !String(children).includes("\n"))
    return <code>{children}</code>;
  const highlighted =
    language && hljs.getLanguage(language)
      ? hljs.highlight(code, { language }).value
      : null;
  return (
    <div className="code-block">
      <div className="code-toolbar">
        <span>{language || "text"}</span>
        <button
          aria-label="Copy code"
          onClick={() =>
            void navigator.clipboard.writeText(code).then(() => {
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            })
          }
        >
          {copied ? <Check size={13} /> : <Copy size={13} />}
        </button>
      </div>
      <pre>
        {highlighted ? (
          <code
            className={className}
            dangerouslySetInnerHTML={{ __html: highlighted }}
          />
        ) : (
          <code>{code}</code>
        )}
      </pre>
    </div>
  );
}
export function Markdown({
  text,
  workspace = "",
}: {
  text: string;
  workspace?: string;
}) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm, remarkMath]}
      rehypePlugins={[rehypeKatex]}
      urlTransform={(value) =>
        isLocal(value) || value.startsWith("muse-media:")
          ? value
          : defaultUrlTransform(value)
      }
      components={{
        a: ({ href, children }) => {
          const local = !!href && isLocal(href);
          const video = !!href && /\.(?:mp4|webm|mov)(?:[?#]|$)/i.test(href);
          if (video)
            return (
              <SafeMedia
                kind="video"
                controls
                preload="metadata"
                src={mediaUrl(decodeMediaPath(href!), workspace)}
              />
            );
          return (
            <a
              href={href}
              title={local ? "Show file in folder" : undefined}
              onClick={(event) => {
                event.preventDefault();
                if (!href) return;
                const action = local
                  ? window.muse.openLocal(
                      /^\.\.?[\\/]/.test(href)
                        ? `${workspace}/${decodeMediaPath(href)}`
                        : decodeMediaPath(href),
                    )
                  : window.muse.openExternal(href);
                void action.catch(() => {});
              }}
            >
              {children}
              <ExternalLink size={11} />
            </a>
          );
        },
        img: ({ src, alt }) =>
          src ? (
            <figure className="chat-media">
              <SafeMedia
                src={mediaUrl(decodeMediaPath(src), workspace)}
                alt={alt || "Chat image"}
                loading="lazy"
                onClick={() => {
                  if (isLocal(src))
                    void window.muse
                      .openLocal(mediaUrl(decodeMediaPath(src), workspace))
                      .catch(() => {});
                }}
              />
              <figcaption>{alt}</figcaption>
            </figure>
          ) : null,
        pre: ({ children }) => <>{children}</>,
        code: Code,
        table: ({ children }) => (
          <div className="table-scroll">
            <table>{children}</table>
          </div>
        ),
      }}
    >
      {normalizeLinks(text)}
    </ReactMarkdown>
  );
}
export function MediaGallery({
  media,
  workspace = "",
}: {
  media: any[];
  workspace?: string;
}) {
  return (
    <div className="media-gallery">
      {media.map((entry, index) => {
        const source = entry.base64Data
          ? `data:${entry.mediaType};base64,${entry.base64Data}`
          : mediaUrl(entry.path || entry.url || entry.preview || "", workspace);
        const type = entry.mediaType || entry.mime || "";
        return (
          <figure key={entry.id || index} className="chat-media">
            {type.startsWith("video/") ||
            /\.(mp4|webm|mov)$/i.test(entry.path || "") ? (
              <SafeMedia
                kind="video"
                controls
                preload="metadata"
                src={source}
              />
            ) : type.startsWith("audio/") ? (
              <SafeMedia kind="audio" controls src={source} />
            ) : type && !type.startsWith("image/") ? (
              <button
                className="file-attachment"
                onClick={() =>
                  void window.muse.openLocal(entry.path).catch(() => {})
                }
              >
                <span>FILE</span>
                <b>{entry.name || "Attached file"}</b>
                <small>
                  {entry.size
                    ? `${Math.ceil(entry.size / 1024)} KB`
                    : "Open local file"}
                </small>
              </button>
            ) : (
              <SafeMedia
                src={source}
                alt={entry.name || "Attached image"}
                loading="lazy"
              />
            )}
            <figcaption>
              {entry.name || entry.sourceToolName || "Attachment"}
            </figcaption>
          </figure>
        );
      })}
    </div>
  );
}
