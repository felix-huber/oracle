# Anthropic follow-ups (2025-11-20)

## Goal
Tighten the Claude 4.5/4.1 integration: reusable token stringifier, provider capability flags, clearer UX around unsupported features, better tests/docs, and noted cost-estimate limitations.

## Tasks
- [x] Add provider-agnostic `stringifyRequestForTokenizer` helper so each adapter defines its stringification; use it for OpenAI/Gemini/Claude token estimates.
- [x] Move background capability to client/adapters (capability flag) while keeping model-level defaults; gate background by both (Claude/Gemini disabled).
- [x] Add logical tool/search registry; emit single warning when search is ignored for Claude.
- [x] Mark Claude cost estimates as approximate in run stats + notifier.
- [x] Stream UX: log “search disabled” / “background forced off” once in run header.
- [x] Docs: add front-matter to new docs, note Claude limitations (search/background off, approximate cost) in README/docs.
- [x] Tests: adapter stream smoke test; multi-model background/baseUrl coverage; Claude-only background forced off.
- [x] Cleanup: resolve lint warnings introduced by new code (left legacy browser warnings only).

## Notes
- Keep Sonnet short-run; Opus remains pro-tier with long timeout and prompt-length guard.
- Avoid touching browser-mode files beyond necessary logging/text.
