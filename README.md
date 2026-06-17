# Frinus MCP Server

> **φρήν + νοῦς** — Gives your Claude agent long-term, cognitive memory backed by the [Frinus](https://frinus.rdxsec.com.br) platform.

`frinus-mcp` is an MCP (Model Context Protocol) server. It is the **bridge** between your MCP client — Claude Code, Cursor, or Claude Desktop — and the **Frinus platform hosted at https://frinus.rdxsec.com.br**.

It does **not** run on its own. It stores nothing locally: every tool call is forwarded over HTTPS to your Frinus account. So before it does anything useful you need two things:

1. a **Frinus account** (free, no card), and
2. a **Frinus API key** (`sk-frinus-...`).

With those in place, the server exposes **70 tools** spanning cognitive memory, working memory, sessions, agents, the L0–L3 knowledge hierarchy, orchestration tasks, and training pipelines. It speaks stdio and works with any MCP-aware client.

- **Version:** 3.2.1
- **Tools:** 70 (see [Tools Reference](#tools-reference))
- **Platform:** https://frinus.rdxsec.com.br (hosted SaaS — the backend this server talks to)
- **npm package:** [`frinus-mcp`](https://www.npmjs.com/package/frinus-mcp)

## How it fits together

```
+-------------------+        +--------------+        +----------------------------+
| Your MCP client   | stdio  | frinus-mcp   | HTTPS  | Frinus platform            |
| (Claude Code,     | <----> | (this server,| <----> | frinus.rdxsec.com.br       |
|  Cursor, Desktop) |        |  via npx)    |        | (your memories live here)  |
+-------------------+        +--------------+        +----------------------------+
```

The server validates your API key against the platform at startup, resolves your account + organisation, and routes every tool call there. No API key → it refuses to start.

## Rule Zero — MCP is mandatory

The Frinus MCP **is** the agent's long-term memory, identity, and intelligence. Without it the model is stateless across sessions. Every Claude agent that integrates with Frinus must:

1. Verify the MCP tools are reachable at conversation start (e.g. `session_start`, `memory_search`, `search_with_attention`).
2. If unreachable, surface the warning to the user: *"MCP Frinus is not connected. Long-term memory capabilities are unavailable."*
3. Execute the **BOOT protocol (P1)** before answering anything that is not a trivial greeting.
4. Persist learnings via `memory_store` before ending productive sessions.

The complete protocol set lives in the global `CLAUDE.md` (Frinus organisation), summarised below in [The 7 Protocols](#the-7-protocols).

## Before you start — account + API key

You need a Frinus account and an API key. Both are free to get.

### 1. Create a free account

Sign up at **https://frinus.rdxsec.com.br**. The **Free plan (R$0)** is enough to get started:

- 100 memories
- 20 queries/day
- no credit card required

### 2. Generate an API key

Once logged in, open your account **Settings → API Keys** and create a new key. You'll get a value shaped like:

```
sk-frinus-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Copy it now — for security it's shown **only once**. This value goes into the `FRINUS_API_KEY` environment variable below. Treat it like a password; never commit it to a repo.

## Getting started (zero to first memory)

Five minutes, four steps.

### Step 1 — Create your account

Sign up at https://frinus.rdxsec.com.br (Free plan, no card). See [above](#1-create-a-free-account).

### Step 2 — Generate your API key

Settings → API Keys → create. Copy the `sk-frinus-...` value. See [above](#2-generate-an-api-key).

### Step 3 — Add the server to your client

You don't install anything — `npx` fetches and runs the package on demand. The only value you must provide is your API key; the platform URLs already default to production.

**Claude Code (one-liner):**

```bash
claude mcp add frinus --env FRINUS_API_KEY=sk-frinus-... -- npx -y frinus-mcp@latest
```

**Cursor / Claude Desktop / any client (config JSON):**

```json
{
  "mcpServers": {
    "frinus": {
      "command": "npx",
      "args": ["-y", "frinus-mcp@latest"],
      "env": {
        "FRINUS_API_KEY": "sk-frinus-..."
      }
    }
  }
}
```

Config file locations:

- **Claude Code:** `~/.claude.json`, under `mcpServers`.
- **Claude Desktop:** `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS) / `~/.config/claude/claude_desktop_config.json` (Linux). Or use the one-click `.mcpb` extension and just paste your API key.
- **Cursor:** `~/.cursor/mcp.json`, under `mcpServers`.

Restart the client so it picks up the new server.

> Replace `sk-frinus-...` with the real key from Step 2. You normally set **only** `FRINUS_API_KEY` — every backend URL already defaults to the hosted platform. See [Environment Variables](#environment-variables) for the full list and the self-host override.

### Step 4 — Validate with your first memory

In your client, ask the agent to store and recall something:

```
Store this in Frinus memory: "Our staging DB is reset every night at 02:00 UTC."
```

then in the same or a later session:

```
What time does our staging DB reset?
```

Behind the scenes the agent calls `memory_store` then `memory_search` / `search_with_attention`. If the recall comes back, the bridge is live. You can confirm the same memory appears in the web app at https://frinus.rdxsec.com.br.

## Environment Variables

In normal use you set **only** `FRINUS_API_KEY`. The service URLs already point at the hosted platform — leave them alone unless you self-host (see [Advanced — self-host](#advanced--self-host--local-dev)).

| Variable | Default (hosted platform) | Description |
|----------|---------------------------|-------------|
| `FRINUS_API_KEY` | **required** | Your personal API key (`sk-frinus-...`). Resolves account + organisation at boot. |
| `MEMORY_SERVICE_URL` | `https://frinus-memory.rdxsec.com.br` | Memory Engine base URL |
| `FRINUS_CP_URL` | `https://frinus-api.rdxsec.com.br` | Control Plane base URL (account, orgs, API keys, billing) |
| `AGENT_SERVICE_URL` | `https://frinus-agents.rdxsec.com.br` | Agent Service base URL (agents, invocation, skills) |
| `FRINUS_MEMORY_API_KEY` | — | Legacy fallback for `FRINUS_API_KEY` |

On startup the server validates the API key against the platform and resolves your organisation + logged-in user. If validation fails it aborts with `[FATAL]` so the client surfaces the error — re-check the key from Settings → API Keys.

## The 7 Protocols

| Protocol | When | Tools | Purpose |
|----------|------|-------|---------|
| **P1 — BOOT** | Start of every session | `session_start`, `working_memory_get`, `search_with_attention` | Load identity + recent state + relevant context |
| **P2 — CONSULT** | Before any action | `search_with_attention`, `session_context`, `memory_reinforce`, `memory_weaken` | Retrieve, rate, and reinforce relevant memories |
| **P3 — PLAN** | Planning a task | `memory_store(procedural)`, `working_memory_add`, `stream_capture` | Persist plans, working state, and architectural decisions |
| **P4 — CAPTURE** | Every 2–3 interactions | `heartbeat_tick`, `working_memory_add`, `memory_store(episodic)`, `stream_capture` | Continuous recording of progress, bugs, patterns |
| **P5 — LEARN** | New knowledge | `training_teach`, `training_qa`, `training_stats`, `stream_process`, `sleep_run` | Teach facts/procedures and run consolidation cycles |
| **P6 — AUDIT** | Maintenance | `consolidation_detect_conflicts`, `consolidation_resolve_conflict`, `consolidation_detect_redundant`, `hierarchy_consolidate` | Detect conflicts, redundancy, and consolidate memories |
| **P7 — CLOSE** | End of session | `session_summary`, `stream_process`, `memory_store`, `hierarchy_consolidate`, `session_end` | Summarise, promote stream items, persist learnings |

Detailed protocol scripts live in the agent's `CLAUDE.md`. Treat the table above as the contract every Frinus-integrated agent must respect.

## Tools Reference

70 tools grouped by domain. Every tool returns text content; payloads follow the MCP `Tool` spec. Full JSON schemas live in [`src/tools/definitions.ts`](src/tools/definitions.ts).

### Memory (7)

Cognitive long-term memory: episodic (what happened), semantic (what I know), procedural (how to do things).

| Tool | Description |
|------|-------------|
| `memory_store` | Create a memory. `agent_id`, `content` required. `memory_type` ∈ {episodic, semantic, procedural}. `scope` ∈ {user, agent, universe, organization}. `importance` 0–1. |
| `memory_search` | Semantic similarity search. Filters: `agent_id`, `memory_types`, `limit`. |
| `memory_get` | Fetch a memory by `memory_id` (full content, metadata, relevance). |
| `memory_list` | List memories for an `agent_id` with optional type filter. |
| `memory_delete` | Permanently delete a memory by `memory_id`. |
| `memory_reinforce` | Boost relevance of a useful memory (`memory_id`, `boost` 0–1, default 0.1). |
| `memory_weaken` | Penalise an outdated memory (`memory_id`, `penalty` 0–1, default 0.2). |

### Working Memory (3)

Short-term, context-bound state. Miller's Law: max 7 items per context, oldest auto-evict. Default TTL 30 min (max 2 h).

| Tool | Description |
|------|-------------|
| `working_memory_get` | Load current state for a context. Always call at task start. |
| `working_memory_add` | Persist current state. Context formats: `agent:{uuid}`, `universe:{uuid}`, `organization:{uuid}`. |
| `working_memory_clear` | Remove all items for a context. |

### Sessions (5)

Session = logical container for streams, working memory, and capture.

| Tool | Description |
|------|-------------|
| `session_start` | Begin a session for an agent. Returns `session_id`. Supports `parent_session_id` for subagent inheritance. |
| `session_end` | Terminate a session and finalise its summary. |
| `session_context` | Combined working + long-term retrieval, enhanced with extracted session topics. |
| `session_summary` | Generate a structured recap (decisions, learnings, pending items). |
| `session_clear` | Wipe a session's working state without ending it. |

### Stream (4)

Continuous capture pipeline. Items are batched, scored, and the important ones promoted to permanent memories.

| Tool | Description |
|------|-------------|
| `stream_capture` | Record an input / output / internal note tied to a session. |
| `stream_get_session` | Replay every captured item for a `session_id`. |
| `stream_get_recent` | Recent stream items across sessions (filterable). |
| `stream_process` | Promote pending items to long-term memory (manual trigger; scheduler also runs every 5 min). |

### Context & Attention (2)

| Tool | Description |
|------|-------------|
| `memory_get_context` | Build a token-bounded context window for a task description. |
| `search_with_attention` | RAG with task-type-aware weighting. `task_type` ∈ {implementation, debug, deploy, documentation, review} drives memory_type weights. |

### Users (2)

| Tool | Description |
|------|-------------|
| `user_register` | Register a user with the memory system (idempotent). |
| `user_get_context` | Retrieve combined user memories and tenant context. |

### Maintenance (2)

| Tool | Description |
|------|-------------|
| `heartbeat_tick` | Cheap tick for an agent — drives relevance decay and lightweight consolidation. |
| `sleep_run` | Trigger a sleep cycle. `phases` ⊆ {evaluation, forgetting, consolidation, relevance}. Mirrors the scheduler's normal/deep sleeps. |

### Consolidation (3)

| Tool | Description |
|------|-------------|
| `consolidation_detect_conflicts` | Surface candidate conflicting memories above a similarity threshold. |
| `consolidation_resolve_conflict` | Keep one memory, supersede the other with a written resolution note. |
| `consolidation_detect_redundant` | Find near-duplicates ready for merge or removal. |

### Memory Hierarchy (2)

| Tool | Description |
|------|-------------|
| `hierarchy_consolidate` | Roll several related memories into a higher-level summary memory. |
| `hierarchy_get_tree` | Inspect the consolidation tree for a root memory. |

### Agents (6)

Agent CRUD + orchestrated invocation.

| Tool | Description |
|------|-------------|
| `agent_create` | Create an agent (optionally from a template) scoped to a universe / team. |
| `agent_list` | List agents in the caller's tenant. Auto-scoped via API key. |
| `agent_get` | Fetch an agent by `agent_id`. |
| `agent_update` | Update persona, team, universe, etc. |
| `agent_delete` | Delete an agent. |
| `agent_invoke` | Programmatically invoke an agent with a task. Returns its tool calls and final answer. Used by delegation. |

### Universes (4)

Universe = tenant-scoped knowledge domain. Holds the L0–L3 hierarchy.

| Tool | Description |
|------|-------------|
| `universe_create` | Create a universe in the caller's org. Slug + name + description. |
| `universe_list` | List universes for the resolved org. |
| `universe_update` | Patch a universe (name, description). |
| `universe_hierarchy` | Walk the full L0 → L3 tree for a universe with status icons. |

### Knowledge Hierarchy L0–L3 (16)

```
Universe
  └─ Concept   (L0)  body of knowledge
       └─ Theme  (L1)  thematic split
            └─ Topic   (L2)  unit of work (status: pending / in_progress / completed)
                 └─ Point   (L3)  atomic knowledge unit
```

Each level exposes `create`, `list`, `update`, `delete`:

- **L0 Concepts**: `concept_create`, `concept_list`, `concept_update`, `concept_delete`
- **L1 Themes**: `theme_create`, `theme_list`, `theme_update`, `theme_delete`
- **L2 Topics**: `topic_create`, `topic_list`, `topic_update`, `topic_delete`
- **L3 Points**: `point_create`, `point_list`, `point_update`, `point_delete`

`topic_update` and `point_update` accept a `status` field so agents can mark progress.

### Training Pipeline (6)

Teach the system explicitly — facts, procedures, Q&A pairs, full documents.

| Tool | Description |
|------|-------------|
| `training_teach` | Inject a fact or procedure. `type` ∈ {semantic, procedural}. |
| `training_qa` | Train with `pairs` of `{question, answer}`. |
| `training_stats` | Coverage statistics across the corpus. |
| `training_gaps` | Detected gaps in knowledge / weakly-covered topics. |
| `training_recent` | Most recently ingested memories from training. |

### Orchestration — Tasks (4)

Task table on the Memory Engine drives multi-agent orchestration.

| Tool | Description |
|------|-------------|
| `task_create` | Create a task (title, description, optional `assigned_agent_id`, parent task). |
| `task_get` | Fetch a task with its full state. |
| `task_list` | List tasks with filters (status, agent, parent). |
| `task_update` | Update status, output, or assignment. |

### Skills (4)

Reusable behaviours assigned to agents.

| Tool | Description |
|------|-------------|
| `skill_list` | Enumerate available skills in the tenant. |
| `skill_assign` | Attach a skill to an agent. |
| `skill_remove` | Detach a skill from an agent. |
| `skill_agent_list` | List the skills owned by a given agent. |

### Credential Vault (5) — `credential_exec` broker

Encrypted credentials stored in the Control Plane, referenced from memories via
`credential_ref`.

| Tool | Description |
|------|-------------|
| `credential_store` | Store an encrypted credential under a ref (e.g. `mysql_x`). |
| `credential_get` | Inspect **non-secret metadata only** (host/user/db/port + the env vars `credential_exec` will inject). Never returns the value. |
| `credential_exec` | **Run a command with the credential injected into the child process ENV.** Returns only stdout/stderr/exit_code — the secret never reaches the model, screen, or disk. |
| `credential_list` | List stored credential refs (no secret data). |
| `credential_delete` | Delete a stored credential. |

**Secret-handling principle — server-side broker, never by value.** The model
never receives a secret value: no plaintext, no temp files, no shell snippets that
carry the secret. To *use* a credential you call **`credential_exec`**. The MCP
server (already running locally via `npx -y frinus-mcp@latest`) fetches the
credential from the vault, injects its fields into the **environment** of a child
process — never into argv, never into any text the model sees — runs the command
with `shell:false` (no shell injection), and returns only the output.

```jsonc
// MYSQL_PWD / MYSQL_USER / MYSQL_HOST are pre-injected → standard clients just work
credential_exec(ref="mysql_prod", argv=["mysql", "-e", "SELECT 1"])
credential_exec(ref="pg_prod",    argv=["psql",  "-c", "SELECT 1"])

// For anything else, read the injected vars inside an explicit shell:
credential_exec(ref="jira_x", argv=["sh","-c",
  "curl -sS -H \"Authorization: Bearer $CRED_TOKEN\" \"$CRED_BASE_URL/whoami\""])
```

Injected env vars (when present in the credential): password/secret/token →
`MYSQL_PWD`, `PGPASSWORD`, `CRED_PASSWORD`; `user`/`username` → `CRED_USER`,
`MYSQL_USER`, `PGUSER`; `host` → `CRED_HOST`, `MYSQL_HOST`, `PGHOST`; `port` →
`CRED_PORT`, `MYSQL_TCP_PORT`, `PGPORT`; `database` → `CRED_DATABASE`,
`PGDATABASE`; any other scalar → `CRED_<UPPER_SNAKE>` (e.g. `base_url` →
`CRED_BASE_URL`). `argv` must be an array of strings (no shell command string;
use `["sh","-c","..."]` if you really need a shell). 30s timeout, 256 KiB output
cap. Everything ships in the npm package — **the user installs nothing, edits no
PATH, and runs no extra command**; an up-to-date MCP is all that's required.

## Memory Types

| Type | Use Case | Example |
|------|----------|---------|
| `episodic` | Record what happened | `Bug: payment endpoint returned 500. Cause: missing null check on customer.address. Fix: guard + 422 response. File: services/payment.py` |
| `semantic` | Store facts and knowledge | `MemoryResponse now includes universe_id (UUID | None) so the frontend can group memories per universe in the graph view.` |
| `procedural` | Document how-to procedures | `Procedure: rotate-claude-credentials. Steps: 1) aws ecr login, 2) kubectl set image deployment/agent..., 3) verify pod is Ready. Caveat: deployment is named "agent", not "agent-service".` |

## Scopes

| Scope | Visibility | Use Case |
|-------|------------|----------|
| `user` | Only the storing user | Personal preferences and history |
| `agent` | Only the storing agent | Agent-private notes |
| `universe` | All agents inside the universe (department) | Shared domain knowledge |
| `organization` | All agents in the tenant | Org-wide procedures and facts |

> The legacy `agent / project / global` scopes were retired together with `project_id`. Universes replaced projects as the isolation boundary inside an organisation.

## Best Practices

Required formats for memories — make future retrieval deterministic:

- **Bug:** `Bug: <description>. Cause: <root cause>. Fix: <solution>. File: <path>`
- **Pattern:** `Pattern: <description>. When to use: <context>. File: <path>`
- **Procedure:** `Procedure: <name>. Steps: 1) ... 2) ... 3) .... Caveats: <warnings>`

Operational guidelines:

1. **Always boot first.** Call `session_start` + `working_memory_get` + `search_with_attention` before answering.
2. **Reinforce / weaken on use.** When a recalled memory helps, `memory_reinforce`. When it's wrong, `memory_weaken` (and replace it).
3. **Capture every 2–3 turns.** `working_memory_add` for state, `stream_capture` for decisions, `memory_store` for crystallised learnings.
4. **Pick the right `task_type`.** `search_with_attention` weights memory types per task. `debug` favours episodic, `documentation` favours semantic, `deploy` favours procedural.
5. **Close the loop.** End sessions with `session_summary` + `stream_process` + `session_end`. Run `sleep_run` for deeper consolidation when batches grow.
6. **Audit before clutter accumulates.** Periodic `consolidation_detect_conflicts` + `consolidation_detect_redundant` keep recall sharp.

## Architecture

```
+---------------------+       +------------------+       +----------------------+
| Claude Agent /      | <---> | Frinus MCP       | <---> | Memory Engine        |
| Claude Code         | stdio | (this server)    | HTTPS | (memories, sessions, |
+---------------------+       +------------------+       |  hierarchy, tasks)   |
                                |                        +----------------------+
                                |                                  |
                                |                                  v
                                |                        +----------------------+
                                |                        | PostgreSQL+pgvector  |
                                |                        | + Apache AGE (graph) |
                                |                        +----------------------+
                                |
                                +---HTTPS---> Control Plane (universes, orgs)
                                +---HTTPS---> Agent Service (agents, invocation, skills)
```

- **Memory Engine** owns memories, working memory, sessions, streams, the L0–L3 hierarchy, training, sleep cycles, tasks, skills.
- **Control Plane** owns orgs, universes, members, API keys, billing, credentials, white-label, LLM keys.
- **Agent Service** owns agent runtime, tool dispatch, team routing, persona, invocation.

Tenant isolation is database-per-tenant. The MCP resolves your tenant org ID from the API key at boot — you never pass `org_id` manually.

## Advanced — self-host / local dev

Everything above targets the hosted platform at https://frinus.rdxsec.com.br, which is what almost everyone wants. If you run your own Frinus stack (or develop the MCP against a local backend), build from source and override the three URLs:

```bash
git clone https://github.com/frinus-ai/frinus-mcp && cd frinus-mcp
npm install
npm run build      # emits dist/index.js
```

```json
{
  "mcpServers": {
    "frinus": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": {
        "FRINUS_API_KEY": "sk-frinus-...",
        "MEMORY_SERVICE_URL": "http://localhost:8001",
        "FRINUS_CP_URL": "http://localhost:8000",
        "AGENT_SERVICE_URL": "http://localhost:8002"
      }
    }
  }
}
```

### Publishing (maintainers)

```bash
# 1) npm package — powers `npx -y frinus-mcp` everywhere
npm version <patch|minor|major>
npm publish                      # prepublishOnly runs the build

# 2) .mcpb bundle — powers the Claude Desktop one-click install
npm run pack:mcpb                # -> frinus.mcpb
gh release upload v<version> frinus.mcpb --repo frinus-ai/frinus-mcp --clobber
# Frontend points at: releases/latest/download/frinus.mcpb
```

## Development

```
mcp/
  src/
    index.ts                       Entry: MCP server, dispatch, auth bootstrap
    client/
      memory-client.ts             HTTP client + identity state for Memory Engine
      cp-client.ts                 HTTP client for Control Plane
      agent-client.ts              HTTP client for Agent Service
    tools/
      definitions.ts               Tool schemas (70 tools)
      handlers.ts                  Tool handlers (70 handlers)
    capture/
      interaction-capture.ts       Auto stream capture for every tool call
    types/
      index.ts                     Shared types
  dist/                            Compiled output (npm run build)
  package.json
  tsconfig.json
```

Scripts:

```bash
npm run build     # tsc to dist/
npm run dev       # tsx hot reload (src/index.ts)
npm start         # node dist/index.js
```

Type checking: TypeScript 5.6+, ES modules, axios.

## License

See repository root for license terms.
