export type DesktopPreferences = {
  font: string;
  chatSize: number;
  uiSize: number;
  codeSize: number;
  lineHeight: number;
  compact: boolean;
  animations: boolean;
  notifications: boolean;
  notificationSound: boolean;
  notificationForeground: boolean;
  selectText: boolean;
  autoCollapse: boolean;
  sendKey: "enter" | "ctrl-enter";
  followUp: "queue" | "steer";
  defaultPermissions: string;
  defaultReasoning: string;
  leftWidth: number;
  rightWidth: number;
  colors: Record<string, string>;
};
export const defaultPreferences: DesktopPreferences = {
  font: "DM Sans",
  chatSize: 14,
  uiSize: 11,
  codeSize: 12,
  lineHeight: 1.6,
  compact: true,
  animations: true,
  notifications: true,
  notificationSound: false,
  notificationForeground: false,
  selectText: false,
  autoCollapse: true,
  sendKey: "enter",
  followUp: "queue",
  defaultPermissions: "standard",
  defaultReasoning: "default",
  leftWidth: 232,
  rightWidth: 248,
  colors: {},
};
export const fonts = [
  "DM Sans",
  "Segoe UI",
  "Georgia",
  "Consolas",
  "Arial",
  "Trebuchet MS",
];
const key = "muse-desktop-preferences";
export function readPreferences(): DesktopPreferences {
  try {
    const raw = JSON.parse(localStorage.getItem(key) || "{}");
    return normalizePreferences(raw);
  } catch {
    return { ...defaultPreferences };
  }
}
export function normalizePreferences(
  raw: Partial<DesktopPreferences>,
): DesktopPreferences {
  const result = { ...defaultPreferences };
  for (const name of [
    "compact",
    "animations",
    "notifications",
    "notificationSound",
    "notificationForeground",
    "selectText",
    "autoCollapse",
  ] as const)
    if (typeof raw[name] === "boolean") result[name] = raw[name]!;
  const ranges = {
    chatSize: [11, 24],
    uiSize: [10, 16],
    codeSize: [10, 20],
    lineHeight: [1.3, 2.2],
    leftWidth: [180, 420],
    rightWidth: [190, 420],
  } as const;
  for (const [name, [min, max]] of Object.entries(ranges)) {
    const value = raw[name as keyof typeof ranges];
    if (typeof value === "number" && Number.isFinite(value))
      (result as any)[name] = Math.min(max, Math.max(min, value));
  }
  if (
    typeof raw.font === "string" &&
    /^[\p{L}\p{N} ._()\-]{1,120}$/u.test(raw.font)
  )
    result.font = raw.font!;
  if (raw.sendKey === "ctrl-enter") result.sendKey = raw.sendKey;
  if (raw.followUp === "steer") result.followUp = raw.followUp;
  if (["standard", "readonly", "yolo"].includes(raw.defaultPermissions || ""))
    result.defaultPermissions = raw.defaultPermissions!;
  if (
    [
      "default",
      "none",
      "minimal",
      "low",
      "medium",
      "high",
      "xhigh",
      "max",
      "ultra",
    ].includes(raw.defaultReasoning || "")
  )
    result.defaultReasoning = raw.defaultReasoning!;
  result.colors = Object.fromEntries(
    Object.entries(raw.colors || {}).filter(
      ([name, value]) =>
        ["accent", "bg", "panel", "text", "mint"].includes(name) &&
        /^#[\da-f]{6}$/i.test(value),
    ),
  );
  return result;
}
export function savePreferences(value: DesktopPreferences) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {}
}

export function applyPreferences(value: DesktopPreferences) {
  const root = document.documentElement;
  root.dataset.density = value.compact ? "compact" : "comfortable";
  root.dataset.motion = value.animations ? "on" : "off";
  root.dataset.selection = value.selectText ? "on" : "off";
  root.style.setProperty("--ui-font", `"${value.font}", sans-serif`);
  root.style.setProperty("--chat-size", `${value.chatSize}px`);
  root.style.setProperty("--ui-size", `${value.uiSize}px`);
  root.style.setProperty("--code-size", `${value.codeSize}px`);
  root.style.setProperty("--chat-line-height", String(value.lineHeight));
  const customAccent = value.colors.accent;
  if (/^#[\da-f]{6}$/i.test(customAccent || "")) {
    const rgb = [1, 3, 5]
      .map((i) => parseInt(customAccent.slice(i, i + 2), 16) / 255)
      .map((c) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4));
    const luminance = rgb[0] * 0.2126 + rgb[1] * 0.7152 + rgb[2] * 0.0722;
    root.style.setProperty(
      "--on-accent",
      luminance > 0.179 ? "#171717" : "#ffffff",
    );
  }
  for (const [name, color] of Object.entries(value.colors))
    if (/^#[\da-f]{6}$/i.test(color))
      root.style.setProperty(`--${name}`, color);
}
