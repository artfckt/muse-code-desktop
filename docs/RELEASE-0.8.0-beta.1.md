# Muse Desktop 0.8.0-beta.1

Windows x64 beta. This release makes conversations easier to follow and reduces the work needed to render busy sessions and font settings.

## Changes

- Removed the Agents tab. Running agents now appear inside the conversation with their objectives; expand the group for details, results and native controls.
- Agent counts use native subagent records. Repeated `reminderChild` notifications no longer appear as separate agents, and terminal control states do not expose running-agent links.
- Activity stays collapsed while Muse works. A human-readable current action and summaries supplied by Muse explain progress. Raw details load 50 rows at a time.
- Conversation pagination counts messages instead of all events. Hundreds of tools can no longer push the user's message and Muse's comments out of the initial view.
- Disk previews keep messages separately from recent activity and agent records, within the existing cache budget.
- Replaced font settings with a searchable picker, one candidate preview, explicit **Apply font**, Cancel and a default-font reset. Installed fonts load on demand, share a cached request and use a bounded list of visible names.
- Rebuilt the workspace inspector with a compact project header, permission controls, MCP configuration with refresh progress, and a searchable list covering all project skills.
- Rebuilt the collapsed project rail. The logo expands it, project initials identify folders, and the account, usage, CLI and settings footer stays accessible with long project lists and small windows.
- Updated the public English README and nine screenshots from the production renderer. Screenshot content is illustrative test data.

## Validation on the VPS

- TypeScript check and production renderer build passed.
- 40 unit/integration tests passed, including isolated native Muse Code echo-provider and PTY tests. No real account or paid model requests were used.
- 65 Playwright UI tests passed. Coverage includes six themes, large typography, 500 activity steps, 150 reminder deliveries, a 2,000-font catalog, all 116 project skills, cache restoration and an 80-project rail at 760 and 1100 px widths.
- Electron renderer, sandboxed native preload and native terminal smoke check passed.

Synthetic production-renderer timings on this VPS:

| History        | Initially rendered messages | First open | Cached return | Typing |
| -------------- | --------------------------: | ---------: | ------------: | -----: |
| 100 messages   |                         100 |     230 ms |        116 ms |  27 ms |
| 500 messages   |                         200 |     307 ms |        176 ms |  25 ms |
| 2,000 messages |                         200 |     262 ms |        162 ms |  35 ms |

A conversation with two messages and 500 activities opened in 101 ms with no expanded tool rows. Opening its details took 66 ms and rendered 50 rows. These are synthetic browser measurements on the VPS, not Windows hardware guarantees.

## Beta scope

The installer is unsigned and requires an installed Muse Code CLI. Authentication and subscription usage stay with the native runtime. Visible commentary uses actual Muse messages and supplied reasoning summaries; models that omit commentary still show action and agent status. Live account-specific quotas, paid model behavior and OS notification delivery were not exercised with a real account. Update installation remains manual.

## Windows release verification

[Windows CI run 36851038319](https://github.com/artfckt/muse-code-desktop/actions/runs/36851038319) passed for source commit `5c1cf3b4d1e8582acde5c03ae315d1eb7fdb12d8`: typecheck, 36 tests with four native echo tests skipped because the isolated Muse executable was unavailable, all 65 UI tests, Windows packaging and the packaged Electron/preload/media/PTY smoke check. System font discovery includes Segoe UI, and the Windows N-API PTY prebuilds used by the VPS installer load in Electron.

The installer was built on the VPS, extracted and checked as Windows x64. All 156 packaged source and renderer files match the tested files; all three native PTY bindings match the pinned Windows package. The uploaded installer was downloaded again from GitHub and compared byte for byte. Windows CI independently exercises the same app source and PTY prebuilds; the exact VPS NSIS installer was not installed interactively on a Windows machine.

- File: `Muse-Desktop-0.8.0-beta.1-Windows-x64.exe`
- Size: 151,943,411 bytes
- SHA-256: `3ddfeec6e50657ec99feea0b14163f4c5252b93387c2472d9af7cc1d19f55243`

## Post-release Windows verification (2026-10-01)

The published installer was downloaded from the tagged GitHub release on Windows 10.0.26200 x64. Its size and SHA-256 matched the values above, and Windows reported the expected unsigned signature status. A silent per-user installation to an isolated directory completed with exit code 0. The installed executable then passed the packaged Electron smoke test, including the production renderer, sandboxed preload, local media protocol, system font discovery, agent-window isolation, Muse Code 1.4.1 echo-provider chat/resume flows and all three Windows x64 PTY bindings. The native Windows notification API reported support and accepted a silent test notification. A forced update check reached GitHub, selected `0.8.0-beta.1` and correctly reported no newer release.

The existing Muse CLI session was detected through a read-only account check without starting a new login. No real-account chat, paid model, quota consumption or manual notification-click behavior was exercised. The installer flow was automated and silent rather than a manual click-through.
