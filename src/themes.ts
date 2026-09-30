import type { ITheme } from "@xterm/xterm";

export type Theme = {
  id: string;
  name: string;
  description: string;
  scheme: "dark" | "light";
  colors: {
    bg: string;
    panel: string;
    elevated: string;
    text: string;
    muted: string;
    faint: string;
    accent: string;
    "on-accent": string;
    mint: string;
    danger: string;
    warning: string;
  };
};

export const themes: Theme[] = [
  {
    id: "muse",
    name: "Muse Dark",
    description: "Warm charcoal & champagne",
    scheme: "dark",
    colors: {
      bg: "#111315",
      panel: "#16181a",
      elevated: "#252a28",
      text: "#e6e5e1",
      muted: "#a1aba5",
      faint: "#85948a",
      accent: "#eebd9a",
      "on-accent": "#34271e",
      mint: "#a7c5b1",
      danger: "#e5a08b",
      warning: "#dec196",
    },
  },
  {
    id: "paper",
    name: "Paper",
    description: "Ivory, ink & terracotta",
    scheme: "light",
    colors: {
      bg: "#f7f3eb",
      panel: "#eee8dd",
      elevated: "#fffcf7",
      text: "#302b26",
      muted: "#625950",
      faint: "#72675b",
      accent: "#934728",
      "on-accent": "#ffffff",
      mint: "#3d6855",
      danger: "#a33231",
      warning: "#7e5c19",
    },
  },
  {
    id: "midnight",
    name: "Midnight",
    description: "Deep navy & glacial blue",
    scheme: "dark",
    colors: {
      bg: "#0e1624",
      panel: "#131e30",
      elevated: "#20314a",
      text: "#e4ecf7",
      muted: "#a8bad2",
      faint: "#8da3c2",
      accent: "#9bc5ff",
      "on-accent": "#152b48",
      mint: "#91cfc9",
      danger: "#efa8ac",
      warning: "#e3c79d",
    },
  },
  {
    id: "forest",
    name: "Forest",
    description: "Pine green & soft sage",
    scheme: "dark",
    colors: {
      bg: "#101b17",
      panel: "#15231d",
      elevated: "#263a2e",
      text: "#e6ecdf",
      muted: "#b0beaa",
      faint: "#91a68e",
      accent: "#c5d9a3",
      "on-accent": "#23301e",
      mint: "#94cbb7",
      danger: "#e4aa94",
      warning: "#dfc398",
    },
  },
  {
    id: "rose",
    name: "Rose",
    description: "Soft blush & mulberry ink",
    scheme: "light",
    colors: {
      bg: "#fbf2f2",
      panel: "#f1e4e7",
      elevated: "#fff9fa",
      text: "#3f2d36",
      muted: "#6e5763",
      faint: "#806673",
      accent: "#923c61",
      "on-accent": "#ffffff",
      mint: "#46695d",
      danger: "#a52c40",
      warning: "#805a22",
    },
  },
  {
    id: "graphite",
    name: "Graphite",
    description: "Neutral carbon & silver",
    scheme: "dark",
    colors: {
      bg: "#171717",
      panel: "#1e1e1e",
      elevated: "#303030",
      text: "#ededed",
      muted: "#b3b3b3",
      faint: "#989898",
      accent: "#dedede",
      "on-accent": "#242424",
      mint: "#a9c9bb",
      danger: "#e6a4a4",
      warning: "#d5c49f",
    },
  },
];

const storageKey = "muse-desktop-theme";
export function readThemePreference(): string {
  try {
    const saved = localStorage.getItem(storageKey);
    if (saved === "system" || themes.some((theme) => theme.id === saved))
      return saved!;
  } catch {
    /* A restricted storage backend should not prevent startup. */
  }
  return "muse";
}
export function saveThemePreference(preference: string) {
  try {
    localStorage.setItem(storageKey, preference);
  } catch {
    /* Still allow a live preview. */
  }
}
export function resolveTheme(
  preference: string,
  dark = window.matchMedia("(prefers-color-scheme: dark)").matches,
): Theme {
  return (
    themes.find(
      (theme) =>
        theme.id ===
        (preference === "system" ? (dark ? "muse" : "paper") : preference),
    ) || themes[0]
  );
}
export function applyTheme(theme: Theme) {
  const root = document.documentElement;
  root.dataset.theme = theme.id;
  root.style.colorScheme = theme.scheme;
  for (const [name, color] of Object.entries(theme.colors))
    root.style.setProperty(`--${name}`, color);
}
export function terminalTheme(theme: Theme): ITheme {
  const c = theme.colors;
  return {
    background: c.bg,
    foreground: c.text,
    cursor: c.accent,
    cursorAccent: c.bg,
    selectionBackground: `${c.accent}40`,
    black: c.panel,
    red: c.danger,
    green: c.mint,
    yellow: c.warning,
    blue: theme.scheme === "dark" ? "#9bc5ff" : "#345faa",
    magenta: theme.scheme === "dark" ? "#d7aad5" : "#89458c",
    cyan: c.mint,
    white: c.text,
    brightBlack: c.faint,
    brightRed: c.danger,
    brightGreen: c.mint,
    brightYellow: c.warning,
    brightBlue: theme.scheme === "dark" ? "#bdd9ff" : "#345faa",
    brightMagenta: theme.scheme === "dark" ? "#e4c0e2" : "#89458c",
    brightCyan: c.mint,
    brightWhite: c.text,
  };
}
