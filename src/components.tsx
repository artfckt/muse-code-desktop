import { useState } from "react";
import {
  Check,
  Copy,
  ChevronDown,
  ExternalLink,
  FileCode2,
  Loader2,
  ShieldCheck,
  Terminal,
  X,
  MessageCircleQuestion,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import type { MuseItem } from "./protocol";
import { itemText } from "./protocol";

export function MuseMark({ large = false }: { large?: boolean }) {
  return (
    <svg
      className={large ? "muse-mark large" : "muse-mark"}
      viewBox="0 0 40 40"
      fill="none"
      aria-hidden="true"
    >
      <path
        d="M6 29V11l8 11 6-11 6 11 8-11v18"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      <path
        d="M14 29v-7m12 7v-7"
        stroke="currentColor"
        strokeWidth="3.2"
        strokeLinecap="round"
      />
    </svg>
  );
}
export function Markdown({ text }: { text: string }) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        a: ({ href, children }) => (
          <a
            href={href}
            onClick={(event) => {
              event.preventDefault();
              if (href) void window.muse.openExternal(href);
            }}
          >
            {children}
            <ExternalLink size={11} />
          </a>
        ),
        pre: ({ children }) => (
          <div className="code-block">
            <pre>{children}</pre>
          </div>
        ),
      }}
    >
      {text}
    </ReactMarkdown>
  );
}
export function TranscriptItem({ item }: { item: MuseItem }) {
  const [copied, setCopied] = useState(false);
  const [fullOutput, setFullOutput] = useState("");
  const [outputError, setOutputError] = useState("");
  const text = itemText(item);
  if (item.retracted) return null;
  if (item.kind === "userMessage")
    return (
      <article className="user-message">
        <div>{text}</div>
        {item.attachments?.length ? (
          <span className="attachment-note">
            {item.attachments.length} attached image
            {item.attachments.length > 1 ? "s" : ""}
          </span>
        ) : null}
      </article>
    );
  if (item.kind === "agentMessage")
    return (
      <article className="assistant-message">
        <div className="message-heading">
          <MuseMark />
          <span>Muse</span>
          <small>
            {item.status === "inProgress" ? "Writing" : "Assistant"}
          </small>
          <button
            className="icon-button"
            title="Copy response"
            onClick={() => {
              void navigator.clipboard.writeText(text).then(() => {
                setCopied(true);
                setTimeout(() => setCopied(false), 1800);
              });
            }}
          >
            {copied ? <Check size={14} /> : <Copy size={14} />}
          </button>
        </div>
        <div className="markdown">
          <Markdown text={text || "…"} />
        </div>
        {item.truncated ? (
          <small>
            Response truncated by Muse. Open CLI to inspect the full transcript.
          </small>
        ) : null}
      </article>
    );
  const tool = item.kind === "toolCall" || item.kind === "userShell";
  const title = tool
    ? item.tool || item.commandText || "Shell command"
    : item.kind === "reasoning"
      ? "Reasoning"
      : item.kind === "workflow"
        ? "Workflow"
        : item.kind === "subagent"
          ? item.role || "Subagent"
          : item.kind;
  return (
    <details
      className={`tool-card ${item.status === "failed" ? "failed" : ""}`}
    >
      <summary>
        {item.status === "inProgress" ? (
          <Loader2 size={14} className="spin" />
        ) : tool ? (
          <Terminal size={14} />
        ) : (
          <FileCode2 size={14} />
        )}
        <span>{title}</span>
        {item.patchSummary ? (
          <span className="diff-count">
            +{item.patchSummary.added ?? 0} −{item.patchSummary.removed ?? 0}
          </span>
        ) : null}
        <small>{item.status}</small>
        <ChevronDown size={13} />
      </summary>
      <div className="tool-detail">
        {item.args ? <pre>{item.args}</pre> : null}
        {text ? <pre>{text}</pre> : <span>No output yet.</span>}
        {item.children?.map((child: any) => (
          <div
            className="workflow-child"
            key={`${child.childId}-${child.attempt}`}
          >
            <b>{child.name || child.childId}</b>
            <span>{child.status}</span>
            <p>{child.message || child.objective}</p>
          </div>
        ))}
        {item.outputRef ? (
          <button
            className="text-button"
            onClick={() => {
              void window.muse
                .readOutput(item.sessionId, item.itemId, item.outputRef.id)
                .then((result) =>
                  setFullOutput(result.content || JSON.stringify(result)),
                )
                .catch((error) => setOutputError(error.message));
            }}
          >
            Read full tool output
          </button>
        ) : null}
        {fullOutput ? <pre>{fullOutput}</pre> : null}
        {outputError ? <p className="inline-error">{outputError}</p> : null}
      </div>
    </details>
  );
}
export function ApprovalCard({
  approval,
  disabled,
  onDecide,
}: {
  approval: any;
  disabled: boolean;
  onDecide: (choice: any) => void;
}) {
  return (
    <div className="approval-card">
      <div className="request-heading">
        <ShieldCheck size={18} />
        <div>
          <b>Permission requested</b>
          <small>
            {approval.toolName} · {approval.subject?.kind || "Protected action"}
          </small>
        </div>
      </div>
      <pre>
        {approval.subject?.command ||
          approval.subject?.description ||
          approval.rawArgs}
      </pre>
      <div className="request-actions">
        {approval.availableChoices.map((choice: any) => (
          <button
            key={choice.choiceId}
            className={
              /allow|approve/i.test(choice.decision)
                ? "accent-button"
                : "secondary-button"
            }
            disabled={disabled}
            title={choice.rulePreview || choice.scope}
            onClick={() => onDecide(choice)}
          >
            {choice.label}
          </button>
        ))}
      </div>
    </div>
  );
}
export function QuestionCard({
  request,
  disabled,
  onAnswer,
  onCancel,
}: {
  request: any;
  disabled: boolean;
  onAnswer: (answers: any[]) => void;
  onCancel: () => void;
}) {
  const [answers, setAnswers] = useState<Record<string, string[]>>({});
  const [free, setFree] = useState<Record<string, string>>({});
  const ready = request.questions.every(
    (q: any) =>
      free[q.id]?.trim() ||
      ((answers[q.id]?.length || 0) >= (q.selection?.minSelections ?? 1) &&
        (answers[q.id]?.length || 0) <= (q.selection?.maxSelections ?? 99)),
  );
  return (
    <div className="question-card">
      <div className="request-heading">
        <MessageCircleQuestion size={18} />
        <b>Muse has a question</b>
      </div>
      {request.questions.map((q: any) => (
        <fieldset key={q.id}>
          <legend>{q.question}</legend>
          <div className="question-options">
            {q.options.map((option: any) => (
              <button
                key={option.label}
                disabled={disabled}
                className={
                  answers[q.id]?.includes(option.label) && !free[q.id]
                    ? "selected"
                    : ""
                }
                onClick={() => {
                  setFree((prev) => ({ ...prev, [q.id]: "" }));
                  setAnswers((prev) => ({
                    ...prev,
                    [q.id]:
                      q.selection?.mode === "multiple"
                        ? prev[q.id]?.includes(option.label)
                          ? prev[q.id].filter((label) => label !== option.label)
                          : [...(prev[q.id] || []), option.label]
                        : [option.label],
                  }));
                }}
              >
                <b>{option.label}</b>
                <small>{option.description}</small>
              </button>
            ))}
          </div>
          <input
            aria-label={`Custom answer: ${q.header}`}
            maxLength={500}
            placeholder="Or write your own answer…"
            value={free[q.id] || ""}
            onChange={(event) =>
              setFree((prev) => ({ ...prev, [q.id]: event.target.value }))
            }
          />
        </fieldset>
      ))}
      <div className="request-actions">
        <button
          className="secondary-button"
          disabled={disabled}
          onClick={onCancel}
        >
          <X size={13} /> Skip
        </button>
        <button
          className="accent-button"
          disabled={!ready || disabled}
          onClick={() =>
            onAnswer(
              request.questions.map((q: any) =>
                free[q.id]?.trim()
                  ? { questionId: q.id, freeText: free[q.id].trim() }
                  : q.selection?.mode === "multiple"
                    ? { questionId: q.id, selectedLabels: answers[q.id] }
                    : { questionId: q.id, selectedLabel: answers[q.id][0] },
              ),
            )
          }
        >
          Send answer
        </button>
      </div>
    </div>
  );
}
