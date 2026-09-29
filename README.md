# Muse Desktop — subscription mode

A Windows-first desktop client for **Muse Code**. It does **not** use a Meta API key.

## Billing and authentication

This app starts the local `muse` CLI and talks to `muse serve` through the official `@muse-code/sdk`.

- Sign in once with `muse login`.
- Usage is charged to the Muse Code subscription attached to that login.
- The desktop app does not ask for, store, or proxy a `META_API_KEY`.
- Muse credentials stay where the official CLI stores them.
- Approvals remain visible and are never silently bypassed.

## Requirements

- Windows 10/11 x64
- Node.js 22+ for development/building
- Muse Code CLI installed and available as `muse`
- An active Muse Code subscription
- Sign in to Muse Code once before using the app

Official Windows CLI install:

```powershell
irm https://dev.meta.ai/install.ps1 | iex
muse
```

## Development

```bash
npm install
npm run dev
```

## Windows build

```bash
npm install
npm run build:win
```

The installer is written to `release/`.

## Included in v0.1

- Native project-folder picker
- Detect Muse CLI and login configuration
- Open a visible Muse sign-in terminal from the app; on first run choose browser sign-in, or use `/login` in Muse
- Start/resume Muse sessions
- Stream Muse MSP notifications into the UI
- Send prompts without API keys
- Model picker
- Reasoning-effort picker
- Subscription usage meter
- Pending approval queue with Allow / Reject actions
- Interrupt a running turn
- Session history per selected workspace

This implementation is intentionally subscription-first. There is no API-key field.
