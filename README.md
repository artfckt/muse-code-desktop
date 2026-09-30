# Muse Desktop 0.4

A modern desktop workspace powered by your installed **Muse Code**, using the official Muse SDK. Windows is the primary packaged target.

![Muse Desktop welcome](docs/desktop-preview.png)

## Your Muse account, already connected

If you are signed in to the Muse CLI, open the desktop app and it reuses that login through the CLI’s own credential backend. Credentials are never copied into the renderer or stored in desktop settings.

If you are not signed in, choose **Sign in with Muse Code**. The app requests a native device code and opens the verification page in your browser. Older CLI versions fall back to a visible native sign-in terminal. You can also sign in from the integrated **Muse CLI** tab, then refresh the account.

This desktop targets Muse account authentication. It removes an ambient `META_API_KEY` when starting Muse and blocks GUI turns if the CLI reports stored API-key authentication. A signed-in account does not itself guarantee subscription entitlement; Muse’s service controls access and billing.

## Your conversations and native engine

- **Workspaces:** all retained chats grouped beneath their workspace, compact collapsible groups, running/done indicators, and resizable left and right sidebars. You can switch projects while other chats continue running.
- **Conversation:** streamed Markdown with GFM tables/task lists, syntax highlighting, math and Mermaid diagrams, clickable Windows paths, images and playable video. Completed activity collapses by default so the answer remains visible. Expanded activity and the Activity tab retain the details.
- **Composer:** custom themed model, reasoning, permission and queue/steer menus; image/video attachments; slash-command autocomplete combining native built-ins and the current project's skills.
- **Activity:** compact native tool, shell, reasoning, workflow and agent output, with session/model/provider, branch, context occupancy, token usage and turn duration when reported by Muse.
- **Agents:** native child conversations, objectives, state and results; message/follow-up/interrupt/resume controls; each child's live transcript opens in its own desktop window. `/agents your task` asks Muse to delegate through native subagents.
- **Account:** your account and observed subscription usage together in the right sidebar. Completion/failure and approval notifications can bring you back to the relevant conversation.
- **Muse CLI:** the original interactive CLI embedded in the desktop window through a real PTY. Use its complete native command set, trust prompts, configuration and features that do not have a dedicated GUI control. The terminal stays alive when switching tabs.

The GUI and terminal are separate native sessions. They share the CLI’s account, configuration and retained history. An active session owned by another Muse process is displayed read-only until that process releases it.

Project rules, skills, hooks and MCP configuration are loaded by Muse. The MCP panel shows configured server names, transports and enabled state without exposing environment variables, headers or credentials. Its native `/mcp` manager provides live status and tools.

Each root GUI conversation has its own native host. **Sandbox** uses native approval rules. **Read only** starts Muse with native write and shell tools disabled. Explicitly selecting **YOLO** starts that conversation with `--disable-sandbox --trust-workspace` and approval mode `allowAll`, as documented in [Muse permissions](https://dev.meta.ai/docs/muse-code/permissions). Changing a sandbox profile requires an idle conversation and idle agents; it does not restart other chats. Child agents inherit their parent's host profile.

The slash palette includes the [documented Muse commands](https://dev.meta.ai/docs/muse-code/interactive) and native `skill/list` entries. Commands with a desktop API use it; native-only commands are prepared in the integrated CLI for you to insert and execute. The terminal is its own conversation and may retain a different workspace until restarted.

Muse's current turn-input API accepts text, images and skills. Video is played in the desktop and four sampled frames are sent to the model with the video file path; this is frame-based analysis rather than native video ingestion. PNG/JPG/WebP/GIF attachments are limited to 10 MB, and MP4/WebM/MOV videos to 50 MB. Attached media is stored locally and associated with its native command so it survives reopening. Images from native durable intake logs are also recovered when available; missing logs or logs above the 256 MB recovery bound cannot supply old image bytes.

![Muse Desktop conversation](docs/conversation-preview.png)

## Install on Windows

1. Download the Windows x64 installer from [the latest release](https://github.com/artfckt/muse-code-desktop/releases/latest). Development builds are also available in the **Muse Desktop Windows** [GitHub Actions artifacts](https://github.com/artfckt/muse-code-desktop/actions/workflows/windows-build.yml).
2. Install Muse Code from the [official documentation](https://dev.meta.ai/docs/muse-code) if it is not installed.
3. Open Muse Desktop, connect your account if necessary and select your project folder.

The app searches the official installation locations as well as `PATH`. If your CLI is installed elsewhere, use **Settings → Locate CLI**. The CLI is an external prerequisite and is not bundled in the installer. Account-dependent features require an eligible Muse account.

## Make it your own

Open **Settings → Appearance** to choose **Muse Dark**, **Paper**, **Midnight**, **Forest**, **Rose**, or **Graphite**. Each palette updates the whole workspace, Windows title bar, and native terminal immediately. Your selection is saved locally and restored on the next launch. **Follow system** switches between Muse Dark and Paper with your Windows appearance setting. Changing palettes preserves the active terminal session and its output.

Settings also include font family, interface/chat/code sizes, line spacing, custom accent/background/panel/text/secondary colors, compact density, automatic activity collapse, send shortcut, follow-up behavior, new-chat permission/reasoning defaults, animations and notification preferences. Text selection is disabled by default outside editable fields and the terminal; copy buttons remain available, and selection can be enabled in settings. Markdown file links reveal the file in Explorer, avoiding accidental execution through its file association.

![Muse Desktop appearance settings in the Paper theme](docs/appearance-preview.png)

## Development

Use Node.js 22+ and an installed Muse CLI.

```bash
npm ci
npm run dev
```

## Verification and packaging

```bash
npm run typecheck
npm test
npx playwright install chromium
npm run test:ui
npm run build:win
```

Windows packaging rebuilds the native PTY for Electron and writes the NSIS installer to `release/`. The workflow also launches the packaged application and checks its sandboxed preload and native PTY binding before uploading the installer.

To run the optional real-CLI smoke tests, set `MUSE_TEST_BINARY` to the official Muse executable before `npm test`. These use an isolated home and the deterministic echo provider. See [validation details](docs/VALIDATION.md) for what is verified and what still requires a live account.

The screenshots above use test fixtures; they illustrate the implemented interface, not a paid model invocation. This is an independent desktop client, not an official Meta application.
