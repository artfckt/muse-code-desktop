import {
  Bell,
  Check,
  Download,
  HardDrive,
  Monitor,
  Palette,
  RefreshCw,
  Settings2,
  Terminal,
} from "lucide-react";
import { version } from "../package.json";
import { DesktopSettings } from "./DesktopSettings";
import type { DesktopPreferences } from "./desktop-preferences";
import { themes } from "./themes";
const categories = [
  ["appearance", "Appearance", Palette],
  ["conversation", "Conversation", Settings2],
  ["layout", "Layout", Monitor],
  ["notifications", "Notifications", Bell],
  ["runtime", "Account & runtime", Terminal],
  ["storage", "Storage & cache", HardDrive],
  ["updates", "Updates", Download],
] as const;
export function SettingsPanel(props: {
  value: DesktopPreferences;
  onChange: (v: DesktopPreferences) => void;
  themePreference: string;
  onTheme: (v: string) => void;
  category: string;
  onCategory: (v: string) => void;
  diagnostic: any;
  accountName: string;
  workspace: string;
  busy: boolean;
  onAccount: () => void;
  onProject: () => void;
  onLocate: () => void;
  onCli: () => void;
  logs: string[];
  storage: any;
  onPurge: () => void;
  onClearCache: () => void;
  updates: any;
  checkingUpdates: boolean;
  onCheckUpdates: () => void;
}) {
  const title =
    categories.find((row) => row[0] === props.category)?.[1] || "Appearance";
  return (
    <section className="settings-panel">
      <header className="settings-header">
        <span className="eyebrow">MAKE IT YOURS</span>
        <h2>Workspace settings</h2>
        <span className="settings-version">
          Muse Desktop <b>BETA</b> v{version}
        </span>
      </header>
      <div className="settings-layout">
        <nav
          className="settings-categories"
          aria-label="Settings categories"
          role="tablist"
          aria-orientation="vertical"
        >
          {categories.map(([id, label, Icon]) => (
            <button
              key={id}
              role="tab"
              id={`settings-tab-${id}`}
              aria-controls="settings-content"
              aria-selected={props.category === id}
              onClick={() => props.onCategory(id)}
            >
              <Icon size={15} />
              <span>{label}</span>
              {id === "updates" && props.updates?.available && (
                <i className="attention-dot" />
              )}
            </button>
          ))}
        </nav>
        <div
          id="settings-content"
          className="settings-content"
          role="tabpanel"
          aria-labelledby={`settings-tab-${props.category}`}
        >
          <h3 className="settings-category-title">{title}</h3>
          {props.category === "appearance" && (
            <>
              <fieldset className="appearance-settings">
                <legend>Theme</legend>
                <div className="theme-grid">
                  {themes.map((option) => (
                    <label className="theme-choice" key={option.id}>
                      <input
                        type="radio"
                        name="theme"
                        value={option.id}
                        checked={props.themePreference === option.id}
                        onChange={() => props.onTheme(option.id)}
                      />
                      <span
                        className="theme-swatch"
                        aria-hidden="true"
                        style={{
                          background: option.colors.bg,
                          borderColor: option.colors.elevated,
                        }}
                      >
                        <i style={{ background: option.colors.panel }} />
                        <i style={{ background: option.colors.accent }} />
                        <i style={{ background: option.colors.mint }} />
                      </span>
                      <span>
                        <b>{option.name}</b>
                        <small>{option.description}</small>
                      </span>
                      <Check
                        className="theme-check"
                        size={13}
                        aria-hidden="true"
                      />
                    </label>
                  ))}
                </div>
                <label className="system-theme-choice">
                  <input
                    type="radio"
                    name="theme"
                    value="system"
                    checked={props.themePreference === "system"}
                    onChange={() => props.onTheme("system")}
                  />
                  <span>
                    <b>Follow system</b>
                    <small>
                      Muse Dark or Porcelain with Windows appearance.
                    </small>
                  </span>
                </label>
              </fieldset>
            </>
          )}
          {["appearance", "conversation", "notifications", "layout"].includes(
            props.category,
          ) && (
            <DesktopSettings
              category={props.category}
              value={props.value}
              onChange={props.onChange}
            />
          )}
          {props.category === "runtime" && (
            <>
              <div className="setting-row">
                <div>
                  <b>Account</b>
                  <small>{props.accountName}</small>
                  <small>Uses the local Muse CLI sign-in.</small>
                </div>
                <button className="secondary-button" onClick={props.onAccount}>
                  Manage
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <b>Muse Code runtime</b>
                  <small>{props.diagnostic?.version || "Not detected"}</small>
                  <code>
                    {props.diagnostic?.binary ||
                      props.diagnostic?.error ||
                      "Choose your installed Muse executable."}
                  </code>
                </div>
                <button
                  className="secondary-button"
                  disabled={props.busy}
                  onClick={props.onLocate}
                >
                  Locate CLI
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <b>Project</b>
                  <small>{props.workspace || "No folder selected"}</small>
                </div>
                <button
                  className="secondary-button"
                  disabled={props.busy}
                  onClick={props.onProject}
                >
                  Change
                </button>
              </div>
              <div className="setting-row">
                <div>
                  <b>Terminal features</b>
                  <small>The complete native CLI command palette.</small>
                </div>
                <button className="secondary-button" onClick={props.onCli}>
                  Open CLI
                </button>
              </div>
              {props.diagnostic?.fingerprintWarning && (
                <p className="compatibility-note">
                  Your CLI schema is newer than the SDK. Protocol errors are
                  reported explicitly.
                </p>
              )}
              {props.logs.length > 0 && (
                <details className="runtime-logs">
                  <summary>Runtime diagnostics</summary>
                  <pre>{props.logs.join("\n")}</pre>
                </details>
              )}
            </>
          )}
          {props.category === "storage" && (
            <>
              <div className="setting-row">
                <div>
                  <b>Conversation cache</b>
                  <small>
                    Instant local previews of your 12 most recent chats, up to
                    16 MB. Muse refreshes the full history in the background.
                  </small>
                </div>
                <button
                  className="secondary-button"
                  disabled={props.busy}
                  onClick={props.onClearCache}
                >
                  Clear cache
                </button>
              </div>
              <p className="settings-hint">
                Clearing previews keeps native history, project files and saved
                drafts. Idle native hosts are reclaimed separately.
              </p>
              <section className="attachment-storage">
                <h3>Local attachments</h3>
                <p>
                  {props.storage
                    ? `${props.storage.files} files · ${(props.storage.bytes / 1024 / 1024).toFixed(1)} MB`
                    : "Files stay on this computer."}
                </p>
                <button
                  className="secondary-button"
                  disabled={props.busy}
                  onClick={props.onPurge}
                >
                  Clean unused copies
                </button>
                <p className="settings-hint">
                  Sent files and attachments in saved drafts are kept.
                </p>
              </section>
            </>
          )}
          {props.category === "updates" && (
            <>
              <div className="update-card">
                <Download size={24} />
                <div>
                  <b>
                    {props.updates?.available
                      ? `Version ${props.updates.version} is available`
                      : "Muse Desktop"}
                    <span className="beta-badge">BETA</span>
                  </b>
                  <p>
                    Installed v{version}
                    {props.updates?.version &&
                      ` · Latest v${props.updates.version}`}
                  </p>
                </div>
              </div>
              <div className="update-actions">
                <button
                  className="secondary-button"
                  disabled={props.checkingUpdates}
                  onClick={props.onCheckUpdates}
                >
                  <RefreshCw
                    size={13}
                    className={props.checkingUpdates ? "spin" : ""}
                  />
                  {props.checkingUpdates ? "Checking…" : "Check for updates"}
                </button>
                {props.updates?.available && (
                  <button
                    className="primary-button"
                    onClick={() =>
                      void window.muse.openExternal(props.updates.downloadUrl)
                    }
                  >
                    <Download size={13} />
                    Download update
                  </button>
                )}
              </div>
              <p className="settings-hint">
                Checks public GitHub Releases. This beta follows beta and stable
                releases. The installer opens in your browser; installation
                stays under your control.
              </p>
              {props.updates?.checkedAt && (
                <small className="settings-hint">
                  Last checked{" "}
                  {new Date(props.updates.checkedAt).toLocaleString()}
                  {props.updates.cached ? " · cached" : ""}
                </small>
              )}
              {props.updates?.error && (
                <p role="alert" className="update-error">
                  {props.updates.error}
                  {props.updates.stale && " Showing the last known release."}
                </p>
              )}
              {props.updates &&
                !props.updates.available &&
                !props.updates.error &&
                !props.checkingUpdates && (
                  <p className="update-current">
                    <Check size={13} /> You're up to date.
                  </p>
                )}
              <label className="toggle-setting">
                <span>Check for updates automatically</span>
                <input
                  type="checkbox"
                  checked={props.value.checkUpdates}
                  onChange={(e) =>
                    props.onChange({
                      ...props.value,
                      checkUpdates: e.target.checked,
                    })
                  }
                />
                <i aria-hidden="true" />
              </label>
              <label className="toggle-setting">
                <span>Notify about new versions</span>
                <input
                  type="checkbox"
                  checked={props.value.updateNotifications}
                  onChange={(e) =>
                    props.onChange({
                      ...props.value,
                      updateNotifications: e.target.checked,
                    })
                  }
                />
                <i aria-hidden="true" />
              </label>
            </>
          )}
        </div>
      </div>
    </section>
  );
}
