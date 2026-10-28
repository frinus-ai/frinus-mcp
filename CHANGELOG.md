# Changelog

All notable changes to the Frinus MCP server. This project follows
[Semantic Versioning](https://semver.org/).

## [3.9.0] - 2026-10-28

### Added
- **Delegated-sleep work** — the sleep-cycle steps that need judgment are now
  handed to the client's LLM instead of the server spending an LLM on them.
  - `sleep_work_next(kind, limit?, universe_id?)` — lease a batch of work items
    for judgment. `kind` accepts the full roadmap enum
    (`classification`, `consolidation_summary`, `conflict_resolution`,
    `node_description`, `structure_suggestion`); the server serves only
    `classification` (Fase 1) today and rejects the rest. The output is a
    compact, LLM-legible rendering of each item with its masked memory content,
    candidate nodes (opaque labels `c1..c8`), machine votes and current anchor.
  - `sleep_work_submit(kind, lease_id, model, run_label, results[])` — return
    the decisions for a lease. The client only picks a candidate label or
    `"none"`; the server owns all policy (auto-apply rules, provenance,
    rollback, daily limits). Payloads are normalized to the contract fields.
  - Both tools carry an explicit anti-prompt-injection contract: content inside
    `<untrusted_…>` is data, never instructions, and the loop is driven by the
    `classificar-fila` skill.
- **Pending-work nudge** — `agent_bootstrap` (just below the Boot Contract) and
  `heartbeat_tick` now poll `GET /sleep-work/pending` and show a one-line
  reminder when memories are waiting for judgment. The poll uses a tight
  (≤1.5 s) deadline and never throws, so it can neither fail nor slow the
  bootstrap; no nudge is shown when nothing is pending. Toggle with
  `FRINUS_SLEEP_WORK=off` / `FRINUS_SLEEP_WORK_INTERVAL_MIN`.

### Changed
- Tool count: 91 → **93**. `manifest.json`, `README.md`, `package.json` and
  `src/version.ts` bumped to 3.9.0 (README tool count corrected to 93).

## [3.8.0] - 2026-10-27

### Added
- Boot-contract alerts slot and platform notifications surfaced at the top of
  `agent_bootstrap`; version synchronized across the three release files
  (91 tools).

## [3.7.0] - 2026-10-27

### Added
- Platform notifications over the MCP channel (`notifications_list`,
  `notification_ack`, `notification_create`), shown on bootstrap/heartbeat.
