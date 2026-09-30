# Desktop 0.3 validation

## Windows 0.3 release — 2026-09-30

The Windows x64 NSIS installer was built locally on Windows 11 with Node.js 24.14.0 and Electron 38.8.6. TypeScript validation, nine host/protocol tests, and twelve desktop UI tests passed. Two optional real-CLI echo tests were skipped in this run.

The packaged Windows application passed the production renderer, sandboxed preload, native window color update, and interactive PTY checks. The installed Muse Code 1.3.0 (1.3.0-R3401.1) was detected successfully. The PTY check keeps an interactive shell open until its output arrives, avoiding a Windows ConPTY race with short-lived processes.

Theme coverage includes every palette, preference persistence across reloads, invalid stored preferences, live system appearance changes, explicit preferences overriding system changes, and terminal ANSI recoloring without restarting the native session. Screenshots use the browser fixtures described below.

## Earlier engine validation

Validated against the official Muse Code **1.4.1 (1.4.1-R4503.1)** binary and its exported experimental MSP schema.

The real CLI smoke test uses an isolated home and its deterministic echo provider. It covers initialization, `account/read`, workspace session creation, text deltas, authoritative completion, retained history, session listing, model/skill catalogs, pending requests, shutdown and resume in a new host. It does not access a real user's credentials, call a paid model or prove subscription entitlement.

Browser tests use a test-only preload substitute. They cover the existing-login state, device-code sign-in UI and `granted` completion, offered approval IDs and requirement guards, structured questions, chronological resume, session isolation, unknown usage layouts at 1440×940 and 900×620, and native terminal keyboard forwarding and persistence across tab changes. Screenshots in this folder use these fixtures.

Authentication and billing policy tests ensure the host preserves the CLI credential backend and removes only an ambient `META_API_KEY`; stored API-key authentication is rejected before a turn is submitted. No credential files are read or copied into the renderer.

The Linux Electron 38.8.6 directory package was launched under a virtual display. Its production renderer, sandboxed preload, account diagnostics against Muse Code 1.4.1 and packaged native PTY binding passed. The installed Muse CLI also rendered its real trust prompt inside the embedded terminal; keyboard input and switching back to the conversation passed through the production IPC bridge. This confirms the real desktop bridge and packaging, beyond browser fixtures.

## Historical Windows CI attempts

The Windows workflow for commit `48457b6` was attempted twice on 2026-09-29. Both attempts failed before a runner was assigned (`runner_id: 0`, no steps and no job logs). No Windows installer was produced or validated by those runs. The GitHub connector could not retrieve the check annotation, so the account-level cause is unconfirmed. The workflow is ready to build and validate the installer when a runner can start; inspect the run annotation in GitHub Actions to resolve that prerequisite.

## Remaining live verification

- Complete Meta sign-in on the user's Windows installation.
- Run a real subscribed model turn and confirm its subscription usage.
- Test OS keychain access, Windows sandbox/UAC and browser opening on that installation.

The desktop drives the native Muse engine. The **Muse CLI** tab embeds the installed CLI itself in a real PTY, preserving native controls and commands without GUI equivalents. This is a separate native session, not a mirror of the active GUI conversation. A native smoke test verifies the actual CLI trust prompt and keyboard interaction; the packaged Electron check verifies that its native PTY binding loads successfully.
