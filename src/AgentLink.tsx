import { useEffect, useState } from "react";
import { ExternalLink } from "lucide-react";

export function AgentLink({
  id,
  parent,
  label,
  onError,
}: {
  id: string;
  parent: string;
  label: string;
  onError: (error: string) => void;
}) {
  const [available, setAvailable] = useState(false);
  useEffect(() => {
    let alive = true;
    setAvailable(false);
    void window.muse
      .agentAvailable(id)
      .then((value) => {
        if (alive) setAvailable(value);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [id]);
  return available ? (
    <button
      className="icon-button"
      aria-label={label}
      title={label}
      onClick={() =>
        void window.muse
          .openAgent({ sessionId: id, parentSessionId: parent })
          .catch((error) => {
            setAvailable(false);
            onError(error.message);
          })
      }
    >
      <ExternalLink size={14} />
    </button>
  ) : null;
}
