import { RotateCcw } from "lucide-react";
import { Select } from "./Select";
import {
  defaultPreferences,
  fonts,
  type DesktopPreferences,
} from "./desktop-preferences";

export function DesktopSettings({
  value,
  onChange,
}: {
  value: DesktopPreferences;
  onChange: (value: DesktopPreferences) => void;
}) {
  const update = (patch: Partial<DesktopPreferences>) =>
    onChange({ ...value, ...patch });
  return (
    <div className="desktop-settings">
      <h3>Typography & custom colors</h3>
      <div className="settings-grid">
        <label>
          <span>Interface font</span>
          <Select
            label="Interface font"
            value={value.font}
            options={fonts.map((font) => ({ value: font, label: font }))}
            onChange={(font) => update({ font })}
          />
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
              {label}{" "}
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
              onChange={(event) =>
                update({ [key]: Number(event.target.value) })
              }
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
              <i
                style={{ background: value.colors[name] || `var(--${name})` }}
              />
              <input
                aria-label={`${name} color`}
                placeholder="Theme default"
                value={value.colors[name] || ""}
                maxLength={7}
                onChange={(event) => {
                  const color = event.target.value;
                  const colors = { ...value.colors };
                  if (!color) delete colors[name];
                  else colors[name] = color;
                  update({ colors });
                }}
              />
            </div>
          </label>
        ))}
      </div>
      <small className="settings-hint">
        Custom colors use #RRGGBB. Clear a field to follow the selected theme.
      </small>
      <h3>Conversation & permissions</h3>
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
          <span>New chat reasoning</span>
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
              "max",
              "ultra",
            ].map((level) => ({
              value: level,
              label: level === "default" ? "Muse default" : level,
            }))}
            onChange={(defaultReasoning) => update({ defaultReasoning })}
          />
        </label>
      </div>
      <h3>Layout & behavior</h3>
      {(
        [
          ["compact", "Compact workspace and activity rows"],
          ["autoCollapse", "Hide completed activity in the conversation"],
          ["selectText", "Allow selecting interface and response text"],
          ["animations", "Animate running and completed chats"],
          ["notifications", "Desktop notifications"],
          ["notificationSound", "Notification sounds"],
          ["notificationForeground", "Notify while the app is focused"],
        ] as const
      ).map(([key, label]) => (
        <label className="toggle-setting" key={key}>
          <span>{label}</span>
          <input
            type="checkbox"
            checked={value[key]}
            onChange={(event) => update({ [key]: event.target.checked })}
          />
          <i aria-hidden="true" />
        </label>
      ))}
      <div className="settings-actions">
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
        <button
          className="text-button"
          onClick={() => onChange({ ...defaultPreferences, colors: {} })}
        >
          <RotateCcw size={12} /> Reset customization
        </button>
      </div>
    </div>
  );
}
