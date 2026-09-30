import { useEffect, useRef, useState } from "react";
import { Folder, FolderPlus, Loader2, MessageSquare, X } from "lucide-react";

export function NewConversation({
  roots,
  initial,
  busy,
  onClose,
  onCreate,
}: {
  roots: string[];
  initial: string;
  busy: boolean;
  onClose: () => void;
  onCreate: (root: string) => Promise<void>;
}) {
  const [selected, setSelected] = useState(initial);
  const [chosen, setChosen] = useState("");
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState("");
  const dialogRef = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    dialogRef.current?.showModal();
  }, []);
  const folders = [...new Set([...roots, initial, chosen])].filter(Boolean);
  async function pick() {
    setPicking(true);
    setError("");
    try {
      const root = await window.muse.pickWorkspace();
      if (root) {
        setChosen(root);
        setSelected(root);
      }
    } catch (error: any) {
      setError(error.message);
    } finally {
      setPicking(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      className="new-conversation-dialog modal"
      aria-label="New conversation"
      onCancel={(event) => {
        if (busy) event.preventDefault();
        else onClose();
      }}
    >
      <button
        className="modal-close icon-button"
        aria-label="Close new conversation"
        disabled={busy}
        onClick={onClose}
      >
        <X size={18} />
      </button>
      <span className="eyebrow">A FRESH START</span>
      <h2>New conversation</h2>
      <p>Choose a project, or start with no folder.</p>
      <div className="project-options">
        <label className={!selected ? "selected" : ""}>
          <input
            type="radio"
            name="conversation-folder"
            checked={!selected}
            onChange={() => setSelected("")}
          />
          <MessageSquare size={17} />
          <span>
            <b>No folder</b>
            <small>A conversation with its own local workspace</small>
          </span>
        </label>
        {folders.map((root) => (
          <label key={root} className={selected === root ? "selected" : ""}>
            <input
              type="radio"
              name="conversation-folder"
              checked={selected === root}
              onChange={() => setSelected(root)}
            />
            <Folder size={17} />
            <span>
              <b>{root.split(/[\\/]/).filter(Boolean).pop()}</b>
              <small title={root}>{root}</small>
            </span>
          </label>
        ))}
      </div>
      <button
        className="secondary-button"
        disabled={busy || picking}
        onClick={() => void pick()}
      >
        {picking ? (
          <Loader2 size={15} className="spin" />
        ) : (
          <FolderPlus size={15} />
        )}{" "}
        Choose another folder
      </button>
      {error ? <p role="alert">{error}</p> : null}
      <div className="modal-actions">
        <button
          className="accent-button"
          disabled={busy || picking}
          onClick={() => void onCreate(selected)}
        >
          {busy ? (
            <Loader2 size={15} className="spin" />
          ) : (
            <MessageSquare size={15} />
          )}{" "}
          Create conversation
        </button>
      </div>
    </dialog>
  );
}
