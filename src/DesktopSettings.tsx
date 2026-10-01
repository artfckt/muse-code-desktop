import { useEffect, useState } from "react";
import { RotateCcw } from "lucide-react";
import { Select } from "./Select";
import {
  fonts,
  resetAppearance,
  type DesktopPreferences,
} from "./desktop-preferences";
let fontRequest: Promise<string[]> | undefined;
export function DesktopSettings({
  value,
  onChange,
  category = "appearance",
}: {
  value: DesktopPreferences;
  onChange: (value: DesktopPreferences) => void;
  category?: string;
}) {
  const [installedFonts, setInstalledFonts] = useState<string[]>([]);
  const [fontFilter, setFontFilter] = useState("");
  const [fontStatus, setFontStatus] = useState("Loading installed fonts…");
  useEffect(() => {
    if (category !== "appearance") return;
    let alive = true;
    fontRequest ||= window.muse.systemFonts().catch((error) => {
      fontRequest = undefined;
      throw error;
    });
    void fontRequest
      .then((list) => {
        if (alive) {
          setInstalledFonts(list);
          setFontStatus(`${list.length} installed fonts`);
        }
      })
      .catch(() => {
        if (alive)
          setFontStatus("Installed fonts unavailable on this computer");
      });
    return () => {
      alive = false;
    };
  }, [category]);
  const options = [...new Set([value.font, ...fonts, ...installedFonts])]
    .filter(
      (font) =>
        font === value.font ||
        font.toLowerCase().includes(fontFilter.toLowerCase()),
    )
    .slice(0, 120);
  const update = (patch: Partial<DesktopPreferences>) =>
    onChange({ ...value, ...patch });
  const toggles: [keyof DesktopPreferences, string][] =
    category === "notifications"
      ? [
          ["notifications", "Desktop notifications"],
          ["notificationSound", "Notification sounds"],
          ["notificationForeground", "Notify while the app is focused"],
          ["updateNotifications", "Notify about new versions"],
        ]
      : category === "layout"
        ? [
            ["compact", "Compact workspace and activity rows"],
            ["autoCollapse", "Hide completed activity in the conversation"],
            ["animations", "Animate running and completed chats"],
          ]
        : [];
  return (
    <div className="desktop-settings">
      {category === "appearance" && (
        <>
          <div className="settings-section-heading">
            <h3>Typography & custom colors</h3>
            <button
              className="text-button"
              onClick={() => onChange(resetAppearance(value))}
            >
              <RotateCcw size={12} /> Reset custom theme
            </button>
          </div>
          <div className="settings-grid">
            <label className="font-setting">
              <span>Windows / system font</span>
              <Select
                label="Interface font"
                value={value.font}
                options={options.map((font) => ({
                  value: font,
                  label: font,
                  fontFamily: font,
                }))}
                onChange={(font) => update({ font })}
              />
              <input
                className="font-search"
                aria-label="Search installed fonts"
                placeholder="Filter installed fonts…"
                value={fontFilter}
                onChange={(e) => setFontFilter(e.target.value)}
              />
              <small className="settings-hint">
                {fontStatus}
                {options.length === 120 ? " · filter to see more" : ""}
              </small>
              <div
                className="font-specimen"
                style={{ fontFamily: `"${value.font}", sans-serif` }}
              >
                The quick brown fox · Aa Bb 012345
              </div>
            </label>
            {(
              [
                ["chatSize", "Chat size", 11, 24, 1],
                ["uiSize", "Interface size", 10, 16, 1],
                ["codeSize", "Code size", 10, 20, 1],
                ["lineHeight", "Line spacing", 1.3, 2.2, 0.05],
              ] as const
            ).map(([key, label, min, max, step]) => (
              <label key={key}>
                <span>
                  {label}
                  <b>
                    {value[key]}
                    {key !== "lineHeight" ? "px" : ""}
                  </b>
                </span>
                <input
                  aria-label={label}
                  type="range"
                  min={min}
                  max={max}
                  step={step}
                  value={value[key]}
                  onChange={(e) => update({ [key]: Number(e.target.value) })}
                />
              </label>
            ))}
          </div>
          <div className="color-controls">
            {["accent", "bg", "panel", "text", "mint"].map((name) => (
              <label key={name}>
                <span>
                  {
                    (
                      {
                        bg: "Background",
                        panel: "Panels",
                        text: "Text",
                        mint: "Secondary",
                        accent: "Accent",
                      } as any
                    )[name]
                  }
                </span>
                <div className="color-field">
                  <input
                    type="color"
                    aria-label={`Choose ${name} color`}
                    value={
                      /^#[\da-f]{6}$/i.test(value.colors[name] || "")
                        ? value.colors[name]
                        : getComputedStyle(document.documentElement)
                            .getPropertyValue(`--${name}`)
                            .trim() || "#000000"
                    }
                    onChange={(e) =>
                      update({
                        colors: { ...value.colors, [name]: e.target.value },
                      })
                    }
                  />
                  <input
                    aria-label={`${name} color`}
                    placeholder="Theme default"
                    value={value.colors[name] || ""}
                    maxLength={7}
                    onChange={(e) => {
                      const colors = { ...value.colors };
                      if (!e.target.value) delete colors[name];
                      else colors[name] = e.target.value;
                      update({ colors });
                    }}
                  />
                </div>
              </label>
            ))}
          </div>
          <small className="settings-hint">
            Switching themes restores the theme's colors and typography.
            Conversation and notification preferences are kept.
          </small>
        </>
      )}
      {category === "conversation" && (
        <div className="settings-grid">
          <label>
            <span>Send shortcut</span>
            <Select
              label="Send shortcut"
              value={value.sendKey}
              options={[
                { value: "enter", label: "Enter to send" },
                { value: "ctrl-enter", label: "Ctrl + Enter to send" },
              ]}
              onChange={(sendKey) => update({ sendKey: sendKey as any })}
            />
          </label>
          <label>
            <span>While Muse works</span>
            <Select
              label="Follow-up behavior"
              value={value.followUp}
              options={[
                { value: "queue", label: "Queue next turn" },
                { value: "steer", label: "Steer current turn" },
              ]}
              onChange={(followUp) => update({ followUp: followUp as any })}
            />
          </label>
          <label>
            <span>New chat permissions</span>
            <Select
              label="Default permission profile"
              value={value.defaultPermissions}
              options={[
                {
                  value: "standard",
                  label: "Standard",
                  description: "Sandbox and native approvals",
                },
                {
                  value: "readonly",
                  label: "Read only",
                  description: "No writes or shell execution",
                },
                {
                  value: "yolo",
                  label: "YOLO",
                  description: "No approval or sandbox; trusted workspace",
                },
              ]}
              onChange={(defaultPermissions) => update({ defaultPermissions })}
            />
          </label>
          <label>
            <span>New chat thinking</span>
            <Select
              label="Default reasoning"
              value={value.defaultReasoning}
              options={[
                "default",
                "none",
                "minimal",
                "low",
                "medium",
                "high",
                "xhigh",
                "ultra",
              ].map((level) => ({
                value: level,
                label:
                  level === "default"
                    ? "Muse default"
                    : level === "none"
                      ? "Off"
                      : level,
              }))}
              onChange={(defaultReasoning) => update({ defaultReasoning })}
            />
          </label>
          <p className="settings-hint settings-wide">
            Thinking uses Muse's native reasoning effort for the next turn.
            Availability and behavior depend on the selected model.
          </p>
        </div>
      )}
      {toggles.map(([key, label]) => (
        <label className="toggle-setting" key={key}>
          <span>{label}</span>
          <input
            type="checkbox"
            checked={value[key] === true}
            onChange={(e) => update({ [key]: e.target.checked })}
          />
          <i aria-hidden="true" />
        </label>
      ))}
      {category === "notifications" && (
        <button
          className="secondary-button"
          onClick={() =>
            void window.muse.notify({
              title: "Muse Desktop",
              body: "Desktop notifications are ready.",
              silent: !value.notificationSound,
            })
          }
        >
          Test notification
        </button>
      )}
      {category === "layout" && (
        <p className="settings-hint">
          Collapse the left sidebar for more chat space. Reorder projects and
          chats by dragging, or focus a row and use Alt + ↑ / ↓.
        </p>
      )}
    </div>
  );
}
