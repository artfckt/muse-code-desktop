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

Windows workflow and installer verification are recorded with the published release.
