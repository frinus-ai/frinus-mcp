# Frinus MCP Server

> **φρήν + νοῦς** — The cognitive memory bridge between Claude agents and the [Frinus](https://github.com/frinus-ai) platform.

MCP (Model Context Protocol) server that exposes **70 tools** spanning cognitive memory, working memory, sessions, agents, the L0–L3 knowledge hierarchy, orchestration tasks, and training pipelines. The server speaks stdio and is consumed by Claude Desktop, Claude Code, and any MCP-aware client.

- **Version:** 3.1.0
- **Tools:** 70 (see [Tools Reference](#tools-reference))
- **Backends:** Memory Engine (`:8001`) + Control Plane (`:8000`) + Agent Service (`:8002`)
- **Public mirror:** https://github.com/frinus-ai/frinus-mcp

## Rule Zero — MCP is mandatory

The Frinus MCP **is** the agent's long-term memory, identity, and intelligence. Without it the model is stateless across sessions. Every Claude agent that integrates with Frinus must:

1. Verify the MCP tools are reachable at conversation start (e.g. `session_start`, `memory_search`, `search_with_attention`).
2. If unreachable, surface the warning to the user: *"MCP Frinus is not connected. Long-term memory capabilities are unavailable."*
3. Execute the **BOOT protocol (P1)** before answering anything that is not a trivial greeting.
4. Persist learnings via `memory_store` before ending productive sessions.

The complete protocol set lives in the global `CLAUDE.md` (Frinus organisation), summarised below in [The 7 Protocols](#the-7-protocols).

## Requirements

- Node.js 18+
- Frinus stack reachable (Memory Engine, Control Plane, Agent Service)
- Personal API key (`sk-frinus-...`) tied to your tenant

## Installation

```bash
npm install
npm run build
```

The build emits `dist/index.js`, ready to be wired into Claude Desktop / Claude Code.

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `FRINUS_API_KEY` | **required** | Personal API key (`sk-frinus-...`). Resolves tenant + user identity at boot. |
| `MEMORY_SERVICE_URL` | `http://localhost:8001` | Memory Engine base URL |
| `FRINUS_CP_URL` | `http://localhost:8000` | Control Plane base URL (universes, orgs, billing) |
| `AGENT_SERVICE_URL` | `http://localhost:8002` | Agent Service base URL (agents, invocation, skills) |
| `FRINUS_MEMORY_API_KEY` | — | Legacy fallback for `FRINUS_API_KEY` |

Production endpoints (Frinus SaaS):

```bash
MEMORY_SERVICE_URL=https://frinus-memory.rdxsec.com.br
FRINUS_CP_URL=https://frinus-api.rdxsec.com.br
AGENT_SERVICE_URL=https://frinus-agents.rdxsec.com.br
FRINUS_API_KEY=sk-frinus-...
```

## Claude Desktop / Claude Code Configuration

Add the server to your MCP client configuration:

```json
{
  "mcpServers": {
    "frinus": {
      "command": "node",
      "args": ["/absolute/path/to/mcp/dist/index.js"],
      "env": {
        "FRINUS_API_KEY": "sk-frinus-...",
        "MEMORY_SERVICE_URL": "https://frinus-memory.rdxsec.com.br",
        "FRINUS_CP_URL": "https://frinus-api.rdxsec.com.br",
        "AGENT_SERVICE_URL": "https://frinus-agents.rdxsec.com.br"
      }
    }
  }
}
```

Claude Desktop config path: `~/.config/claude/claude_desktop_config.json` (Linux) / `~/Library/Application Support/Claude/claude_desktop_config.json` (macOS).
Claude Code config path: `~/.claude.json` under `mcpServers`.

On startup the server validates the API key via `/auth/me` and resolves the tenant org ID + logged-in user. Failures abort the process with `[FATAL]` so the client surfaces the error.

## The 7 Protocols

| Protocol | When | Tools | Purpose |
|----------|------|-------|---------|
| **P1 — BOOT** | Start of every session | `session_start`, `working_memory_get`, `search_with_attention` | Load identity + recent state + relevant context |
| **P2 — CONSULT** | Before any action | `search_with_attention`, `session_context`, `memory_reinforce`, `memory_weaken` | Retrieve, rate, and reinforce relevant memories |
| **P3 — PLAN** | Planning a task | `memory_store(procedural)`, `working_memory_add`, `stream_capture` | Persist plans, working state, and architectural decisions |
| **P4 — CAPTURE** | Every 2–3 interactions | `heartbeat_tick`, `working_memory_add`, `memory_store(episodic)`, `stream_capture` | Continuous recording of progress, bugs, patterns |
| **P5 — LEARN** | New knowledge | `training_teach`, `training_qa`, `training_upload`, `training_stats`, `stream_process`, `sleep_run` | Teach facts/procedures and run consolidation cycles |
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
| `training_upload` | Upload a document (`file_path`, `filename`) for chunked ingestion. |
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
