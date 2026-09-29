# Desktop 0.2 validation

Validated against the official Muse Code **1.4.1 (1.4.1-R4503.1)** binary and its exported experimental MSP schema.

The real CLI smoke test uses an isolated home and its deterministic echo provider. It covers initialization, `account/read`, workspace session creation, text deltas, authoritative completion, retained history, session listing, model/skill catalogs, pending requests, shutdown and resume in a new host. It does not access a real user's credentials, call a paid model or prove subscription entitlement.

Browser tests use a test-only preload substitute. They cover the existing-login state, device-code sign-in UI and `granted` completion, offered approval IDs and requirement guards, structured questions, chronological resume, session isolation, unknown usage layouts at 1440×940 and 900×620, and native terminal keyboard forwarding and persistence across tab changes. Screenshots in this folder use these fixtures.

Authentication and billing policy tests ensure the host preserves the CLI credential backend and removes only an ambient `META_API_KEY`; stored API-key authentication is rejected before a turn is submitted. No credential files are read or copied into the renderer.

## Remaining live verification

- Complete Meta sign-in on the user's Windows installation.
- Run a real subscribed model turn and confirm its subscription usage.
- Test OS keychain access, Windows sandbox/UAC and browser opening on that installation.

The desktop drives the native Muse engine. The **Muse CLI** tab embeds the installed CLI itself in a real PTY, preserving native controls and commands without GUI equivalents. This is a separate native session, not a mirror of the active GUI conversation. A native smoke test verifies the actual CLI trust prompt and keyboard interaction; the packaged Electron check verifies that its native PTY binding loads successfully.
