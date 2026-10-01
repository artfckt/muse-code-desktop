import { memo, useDeferredValue, useMemo, useState } from "react";
import {
  ArrowUpRight,
  Command,
  Copy,
  Folder,
  GitBranch,
  RefreshCw,
  Search,
  ShieldCheck,
  X,
} from "lucide-react";
import { Select } from "./Select";
export const WorkspaceInspector = memo(function WorkspaceInspector({
  workspace,
  branch,
  permissionProfile,
  approvalMode,
  modes,
  disabled,
  inventory,
  skills,
  onHide,
  onPermissions,
  onRefresh,
  onOpenCli,
  onSkill,
}: {
  workspace: string;
  branch?: string;
  permissionProfile: string;
  approvalMode: string;
  modes: { id: string; label: string }[];
  disabled: boolean;
  inventory: any;
  skills: any[];
  onHide: () => void;
  onPermissions: (value: string) => void;
  onRefresh: () => Promise<void>;
  onOpenCli: () => void;
  onSkill: (selector: string) => void;
}) {
  const [query, setQuery] = useState("");
  const filter = useDeferredValue(query);
  const [showAll, setShowAll] = useState(false);
  const selected = useMemo(
    () =>
      skills.filter((skill) =>
        `${skill.selector} ${skill.description || ""}`
          .toLowerCase()
          .includes(filter.toLowerCase()),
      ),
    [skills, filter],
  );
  const [refreshing, setRefreshing] = useState(false);
  async function refresh() {
    if (refreshing) return;
    setRefreshing(true);
    try {
      await onRefresh();
    } finally {
      setRefreshing(false);
    }
  }
  const servers = inventory?.servers || [];
  return (
    <aside
      className="inspector workspace-inspector"
      aria-label="Workspace details"
    >
      <header className="inspector-heading">
        <span>Workspace</span>
        <button className="icon-button" title="Hide details" onClick={onHide}>
          <X size={14} />
        </button>
      </header>
      <section className="inspector-project">
        <span className="inspector-folder">
          <Folder size={18} />
        </span>
        <div>
          <b>
            {workspace
              ? workspace.split(/[\\/]/).filter(Boolean).at(-1)
              : "No project folder"}
          </b>
          <small title={workspace}>
            {workspace || "This chat has no folder attached"}
          </small>
        </div>
        {workspace && (
          <button
            className="icon-button"
            title="Copy project path"
            onClick={() => void navigator.clipboard.writeText(workspace)}
          >
            <Copy size={12} />
          </button>
        )}
      </section>
      {branch && (
        <div className="inspector-branch">
          <GitBranch size={12} />
          <span title={branch}>{branch}</span>
        </div>
      )}
      <section className="inspector-section permissions-section">
        <h3>
          <ShieldCheck size={14} /> Permissions
          <span className="inspector-badge">{permissionProfile}</span>
        </h3>
        <Select
          label="Approval mode"
          disabled={disabled || permissionProfile === "yolo"}
          value={permissionProfile === "yolo" ? "allowAll" : approvalMode}
          options={[
            ...modes.map((mode) => ({ value: mode.id, label: mode.label })),
            { value: "allowAll", label: "YOLO · Allow all", disabled: true },
          ]}
          onChange={onPermissions}
        />
        <p>
          {permissionProfile === "yolo"
            ? "All approvals allowed · sandbox disabled."
            : disabled
              ? "Editable when this chat and its agents are idle."
              : "Native Muse approval rules for this chat."}
        </p>
      </section>
      <section className="inspector-section inspector-mcp">
        <h3>
          <Command size={14} /> MCP servers
          <span className="inspector-badge">{servers.length}</span>
          <button
            className="icon-button"
            title="Refresh MCP configuration"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw size={12} className={refreshing ? "spin" : ""} />
          </button>
        </h3>
        <div className="inspector-mcp-list">
          {servers.length ? (
            servers.map((server: any) => (
              <div className="mcp-server" key={server.name}>
                <b title={server.name}>{server.name}</b>
                <small>
                  {server.transport} · {server.status}
                </small>
              </div>
            ))
          ) : (
            <p>No MCP servers in Muse settings.</p>
          )}
        </div>
        <button className="text-button" onClick={onOpenCli}>
          Open native /mcp manager <ArrowUpRight size={11} />
        </button>
      </section>
      <section className="inspector-section inspector-skills">
        <h3>
          <Command size={14} /> Project skills
          <span className="inspector-badge">{skills.length}</span>
        </h3>
        {skills.length > 0 ? (
          <>
            <label className="inspector-skill-search">
              <Search size={12} />
              <input
                aria-label="Search project skills"
                placeholder="Find a skill…"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>
            <div className="inspector-skill-list">
              {(showAll || filter ? selected : selected.slice(0, 6)).map(
                (skill) => (
                  <button
                    className="skill-row"
                    key={skill.selector}
                    title={skill.description}
                    onClick={() => onSkill(skill.selector)}
                  >
                    <span>/{skill.selector}</span>
                    <ArrowUpRight size={11} />
                  </button>
                ),
              )}
              {!selected.length && <p>No matching skills.</p>}
            </div>
            {!filter && selected.length > 6 && (
              <button
                className="text-button"
                onClick={() => setShowAll(!showAll)}
              >
                {showAll
                  ? "Show fewer skills"
                  : `Browse all ${skills.length} skills`}
              </button>
            )}
          </>
        ) : (
          <p>Muse loads skills from your project and CLI configuration.</p>
        )}
      </section>
      <footer className="inspector-native-note">
        <ShieldCheck size={12} /> Managed by your local Muse Code
      </footer>
    </aside>
  );
});
