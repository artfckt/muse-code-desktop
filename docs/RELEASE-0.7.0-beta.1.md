# Muse Desktop 0.7.0-beta.1

This beta makes chat navigation faster and gives conversations more space. It adds a collapsible sidebar, distinct Activity and Agents views, categorized settings, native reasoning controls and GitHub release checks.

## Performance

- Recent chats reuse their in-memory transcript and native host. Returning to an owned session reads its existing host instead of issuing another native resume command.
- IndexedDB stores bounded previews of the latest 200 items, up to 12 conversations, with seven-day expiry, a 16 MB total budget and a 2 MB limit per conversation. The native history remains authoritative and complete. Cached messages appear while the native history refreshes; sending waits for synchronization.
- The sidebar keeps a lightweight local index. Model/skill metadata and installed font discovery reuse cached results. Streaming updates are batched per animation frame, and typing does not rebuild the sidebar.
- Formula rendering loads on demand. Common syntax highlighting replaces the full language bundle; uncommon languages fall back to readable plain code. Mermaid remains lazy-loaded.
- The main JavaScript bundle decreased from 1,755 KB to 692 KB, approximately 61%. The gzip size decreased from 548 KB to 216 KB. Lazy diagram/formula chunks are excluded from that main-bundle comparison.

## Interface

- Project headers use folder icons, shading and counts. Nested chat rows are 25 px high. The sidebar collapses to a 56 px icon rail, and remembers project folds and ordering.
- Drag project headers or chats to reorder them. Chat ordering stays within its native project; dragging does not rewrite a conversation's working directory or permissions. Alt + Up/Down provides keyboard reordering.
- Your Muse account and compact subscription meters sit at the bottom of the left sidebar. The right inspector contains project controls without duplicated account/usage panels.
- Activity uses a numbered event feed with All, Running and Failed filters. Session details remain pinned above the scrolling feed. Chat activity summaries use minimal expandable rows.
- Agents use a separate card grid with objective, status, model and duration. Details and controls expand when needed. Separate-window links still require an active, available native session.
- The transcript and input share the same column width. User messages use the same font and size as replies. Composer controls are compact.
- Thinking mode maps to Muse's native reasoning effort; the adjacent dropdown selects an effort. Availability depends on the selected model and runtime.

## Settings and updates

- Settings are organized into Appearance, Conversation, Layout, Notifications, Account & runtime, Storage & cache, and Updates.
- Installed fonts appear in a searchable dropdown with per-font previews and a selected-font sample. Windows uses its installed system font collection.
- Reset custom theme restores the selected palette and default typography. Switching themes also clears custom fonts, sizes and colors while retaining conversation/account preferences.
- Check for updates reads published GitHub Releases from this repository. Beta builds follow beta and stable releases; stable builds follow stable releases. Checks share in-flight requests, reuse ETags, cache for six hours, and handle offline/rate-limit errors.
- Automatic checks and new-version notifications have separate preferences. New releases appear in the sidebar and can trigger one desktop notification per version. Download update opens the official installer asset or release page; installation remains manual.
- Clear cache removes local previews without deleting native Muse history, attachments or saved drafts.

## Validation

- Typecheck and production renderer build passed.
- All 36 protocol, native-host, terminal, update-checker and desktop boundary tests passed, including isolated Muse Code 1.4.2-R4684.1 echo-provider integration. No real account credentials or paid model calls were used.
- All 57 UI tests passed, including six-theme accessibility checks, responsive controls, drag ordering, restart persistence, delayed native synchronization, font previews, theme reset, native thinking payloads and release-download routing.
- The VPS Electron smoke test passed: real sandboxed preload, native PTY, media, IPC boundaries and isolated agent storage.
- Synthetic production-renderer histories of 100 / 500 / 2,000 messages opened in 239 / 244 / 229 ms. Returning from another chat while the native read was deliberately held took 103 / 152 / 125 ms. The 2,000-item case rendered 200 entries, handled input in 28 ms and 30 stream deltas in 30 ms, without page errors. Browser automation overhead is included; these measurements are not machine-independent guarantees.
- Nine screenshots show the real production interface with illustrative test data. The test bridge is excluded from the packaged application.

- [Windows validation passed](https://github.com/artfckt/muse-code-desktop/actions/runs/36832964071): typecheck, 32 protocol/boundary/update tests, all 57 UI tests, installer build and packaged renderer, sandboxed preload, media and native PTY smoke checks. Four tests requiring the isolated Muse CLI are skipped on that runner; all 36 passed on the VPS with that CLI installed.
- Native reasoning commands for both `none` and `high` were accepted by the isolated Muse CLI echo provider.
- The VPS installer was extracted and inspected: Windows x64 application; 156 renderer/native source files matched the tested build byte for byte; all three Windows PTY prebuilds matched the pinned package; and the Linux PTY build was absent. These prebuilds also loaded in the independent Windows smoke check.
- The final uploaded installer was downloaded again and compared byte for byte with the VPS file. SHA-256: `d0099bfdd6a6840a50cac8f5c0f429b4d5460e5c6a44c0a4e99e27310a2cd9ab`.
- The full locked dependency audit reported zero known vulnerabilities at release validation.

## Beta limitations

Muse Code CLI is installed separately, and the desktop reuses its local sign-in. Native reasoning levels and other capabilities depend on the installed runtime and model. This independent client does not claim complete parity with every interactive CLI command; the integrated terminal provides the native experience for remaining features.

Usage refresh reads the newest native observation from connected hosts. It cannot force the remote billing service to recalculate quota. Real-account sign-in, usage and notification delivery still require verification on your Windows account; automated tests use isolated fixtures.

The Windows installer is unsigned. Updates are checked automatically when enabled, but installation is manual.
