# Muse Desktop 0.6.0-beta.1

This beta fixes the issues documented in the [0.5.0-beta.1 application and UX audit](https://github.com/artfckt/muse-code-desktop/blob/de16f580fcffc40805349cc73059877d427cf4cb/docs/audits/2026-09-30/AUDIT.md) and makes long conversations easier to use.

## Conversation reliability

- Draft text and attachments belong to their conversation and survive a restart. Switching chats or receiving a send acknowledgement no longer clears another draft.
- Loading a chat uses an independent request generation and event buffer, so a slower previous selection cannot replace the current conversation.
- Mixed file uploads retain successful files and explain individual failures. Skill commands include attachment context. Text excerpts have a visible per-file and aggregate limit; Muse still receives the full local file path.
- Long histories initially render the latest 200 entries, with earlier entries available on demand. Scroll positions are remembered and a jump-to-latest control remains available.
- Conversations can be renamed, exported as Markdown or archived locally. Recent projects can be hidden without deleting project files or Muse history.

## Muse integration

- Subscription usage discards stale account data after account changes and login. Refresh queries the connected Muse hosts and displays the snapshot's timestamp.
- Missing CLI binaries, disconnected accounts and unavailable project folders have visible recovery actions and loading states finish correctly.
- The terminal uses the selected conversation's authoritative working directory, including sessions created without a project folder. Its CLI conversation is separate from the GUI conversation; changing its context requires an explicit restart.
- Idle native hosts are reclaimed while active turns, approvals and open agent windows stay protected.

## Interface and accessibility

- More readable compact project, chat and activity layouts, with stronger text contrast and usable action targets.
- All six themes pass the automated WCAG A/AA checks used by this release. Muse Dark and Graphite remain available alongside custom colors and installed system fonts.
- Dialogs manage focus, keyboard navigation and Escape consistently. Inspector controls remain usable at narrow widths and with large fonts.
- Agent windows show loading, status, version and history navigation, and follow shared appearance preferences.
- Attachment storage shows its size and can clean unused copies while keeping saved drafts and history references.

## Desktop boundaries

- Electron is pinned to 44.5.1 and electron-builder to 26.15.3. The locked dependency audit reports zero known vulnerabilities at release validation.
- IPC accepts registered application documents and authorized top-frame requests. Agent windows receive their own session events and use isolated browser storage.
- Local media uses signed, session-scoped file grants with canonical path and file identity checks. Native session output paths and attachments are authorized before preview or reveal.
- Production pages have a Content Security Policy. Settings and attachment manifests use atomic writes and recovery copies; damaged manifests are preserved for recovery.

## Validation

- 30 protocol, authentication, native-host, terminal and desktop boundary tests passed against an isolated Muse CLI where required.
- 49 UI tests passed, including nine theme/accessibility and responsive layout checks.
- [Windows validation passed](https://github.com/artfckt/muse-code-desktop/actions/runs/36780873572): typecheck, protocol tests, all 49 UI tests, installer build and packaged renderer/preload/media/native PTY smoke checks. Windows N-API PTY prebuilds used by the VPS installer loaded successfully.
- The VPS installer was extracted and inspected: x64 application, 154 renderer/native source files matched the tested build byte for byte, three Windows PTY prebuilds matched the pinned package, and the Linux PTY build was absent. Its uploaded SHA-256 matches the local installer.
- The Electron smoke test passed on the VPS: sandboxed preload, native PTY, media, IPC boundaries and isolated agent storage.
- A production-renderer benchmark with illustrative histories opened 100 / 500 / 2,000 messages in 221 / 271 / 268 ms on the test VPS. The 2,000-message case rendered 200 entries, handled typing in 30 ms and a batch of 30 stream deltas in 32 ms, without page errors. These are synthetic measurements, not guarantees for every machine.
- Updated screenshots use the real production renderer with clearly illustrative test data.

## Beta limitations

Muse Code CLI must be installed separately. Muse Desktop uses that runtime and its local authenticated session; it is an independent desktop client. This release does not claim complete feature parity with every CLI feature.

Account-specific login and subscription quota behavior still need verification with your eligible account on Windows. Automated tests use isolated fixtures and do not access a real user's account. Usage refresh reads Muse's exposed `usage/read` snapshot; it cannot force the remote billing service to recalculate usage.

The Windows installer is unsigned. Windows may display SmartScreen or publisher warnings. Review the repository and verify the published SHA-256 checksum before installing.
