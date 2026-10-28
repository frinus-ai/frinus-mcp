# Changelog

All notable changes to the Frinus MCP server. This project follows
[Semantic Versioning](https://semver.org/).

## [3.10.0] - 2026-10-28

### Added
- **Delegated-sleep Phase 2 — all four remaining kinds are served:**
  `consolidation_summary`, `conflict_resolution`, `node_description` and
  `structure_suggestion` (previously `501 not supported yet`). `sleep_work_next`
  renders these self-describing items with a dedicated compact Phase-2 renderer
  (`subject` + `context[]` + optional `options[]` + a `decision` cue telling the
  client to answer with `choice` or `text`), under the same untrusted-delimiter
  framing, per-field caps and hard output budget as classification.
- **`sleep_work_submit` accepts a free-text `text` field** (≤4000 chars) alongside
  `choice`, passed through to the server for the text-producing kinds; `choice`
  defaults to `none`. `work_id` is now the only required result field.

### Changed
- `sleep_work_next`/`sleep_work_submit` tool descriptions document the five kinds,
  each decision shape, and the server's hard locks (a contradiction is never
  auto-superseded, a structure suggestion is only enqueued, a curated description
  is never overwritten, a changed consolidation group is refused). The server owns
  all policy and revalidates every decision; the kill-switch (server LLM on for a
  tenant/phase) makes a kind return nothing to the client.

## [3.9.2] - 2026-10-28

### Changed
- **Delegated-sleep items are legible again.** 3.9.1 kept the lease under 20k
  chars, but at 380 chars of memory and 20 per candidate description, because
  the server's per-field `<untrusted id=…>` wrappers ate about half of the
  output. `sleep_work_next` now uses **one untrusted delimiter per item** (plus
  one for the batch legend) with a fresh MCP-generated nonce, and defangs any
  untrusted-like tag inside the data. Each candidate node's description is shown
  **once** in a batch legend (nodes repeat across items in real leases); two
  different nodes with the same path get `[2]`, `[3]`. The memory is shown up to
  ~1000 chars and descriptions up to ~150. Caps degrade step by step to fit the
  budget before any item is omitted. A realistic 8-item lease = ~17.4k chars,
  with nothing omitted.
- **Reference kNN vote.** When the kNN abstains (shadow mode or below the
  calibrated cut), the server now sends its top node with `below_cut: true`. The
  render shows it as "abaixo do corte, só referência", and it never counts for
  auto-apply.

## [3.9.1] - 2026-10-28

### Fixed
- **Delegated-sleep output no longer blows past Claude Code's limit.** A real
  MUZA lease of 20 items rendered to 74,582 chars and overflowed the client.
  `sleep_work_next` now:
  - **Smaller leases** — `limit` default is **8** (was 10) and is **clamped to
    1–10** both in the schema and the handler.
  - **Compact rendering** — one header line per item (work_id · reason ·
    universe), the memory, each candidate on a single `cN  path — descrição`
    line, votes on one line. The anti-injection warning is printed **once** at
    the top (not per item); no raw JSON, no dead/null lines (e.g. the old empty
    "Âncora atual:").
  - **Defensive truncation in the MCP** — memory ≤ 1500, description ≤ 300,
    path ≤ 300, then a compact display cap on the content shown per item. The
    `<untrusted_… nonce="…">` delimiters are always kept intact: truncation cuts
    *inside* the content (never the closing tag), and the budget is capped on the
    **inner** content, so a long server nonce can never defeat the cut.
  - **Hard output guard** — items render until a budget is reached, then the
    render stops and says how many were omitted (pointing at a smaller `limit`),
    so the output is bounded below the client limit for any input. A full 10×8
    lease renders whole at ~18k chars.

### Added
- **`reason` filter on `sleep_work_next`** — optional `"l5_queue"` /
  `"l2_unverified"`, forwarded to `POST /sleep-work/next`.
- **Empty candidate lists** — when the server returns no candidate in the
  memory's own universe, the item shows `sem candidatos no universo — responda
  "none"`. The explicit escape hatch `none = fica só no universo (nenhum nó
  serve)` is now always offered, and both tool descriptions document it.
- **`by_reason` pending split** — the bootstrap/heartbeat nudge shows the
  `l5_queue` / `l2_unverified` breakdown from `GET /sleep-work/pending` when
  present (additive, tolerant of absence).

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
