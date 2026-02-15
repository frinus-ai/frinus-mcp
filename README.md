# A.G.E.N.C.I.A. MCP Server

MCP (Model Context Protocol) server that exposes the Agents Memory Service to Claude agents. This server provides 14 tools for memory management, knowledge graph operations, working memory, stream capture, and user authentication.

## Overview

The MCP Memory Server acts as a bridge between Claude agents and the Memory Service REST API. It enables agents to:

- Store and retrieve memories (episodic, semantic, procedural)
- Search memories using semantic similarity
- Manage working memory for session context
- Capture interactions to the memory stream for learning
- Register agents and projects in the knowledge graph

## Requirements

- Node.js 18+
- Memory Service running at `http://localhost:8001` (configurable via `MEMORY_SERVICE_URL`)

## Installation

```bash
npm install
npm run build
```

## Usage

### Running the Server

```bash
# Development mode
npm run dev

# Production mode
npm run build
npm start
```

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MEMORY_SERVICE_URL` | `http://localhost:8001` | URL of the Memory Service API |
| `AGENCIA_MEMORY_API_KEY` | **(required)** | Personal API key (sk-mem-...) for authentication |

### Claude Desktop Configuration

Add to your Claude Desktop config (`~/.config/claude/claude_desktop_config.json`):

```json
{
  "mcpServers": {
    "a.g.e.n.c.i.a.": {
      "command": "node",
      "args": ["/path/to/mcp/dist/index.js"],
      "env": {
        "MEMORY_SERVICE_URL": "http://localhost:8001",
        "AGENCIA_MEMORY_API_KEY": "sk-mem-your-key-here"
      }
    }
  }
}
```

## Tools Reference

### Memory Tools

#### 1. `memory_store`

Store a memory in the memory service.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | Yes | UUID of the agent storing the memory |
| `content` | string | Yes | The memory content to store |
| `memory_type` | string | No | Type: `episodic`, `semantic`, `procedural` (default: `episodic`) |
| `scope` | string | No | Visibility: `agent`, `project`, `global` (default: `agent`) |
| `importance` | number | No | Importance score 0-1 (default: 0.5) |
| `project_id` | string | No | Project UUID for project-scoped memories |

**Memory Types:**
- `episodic`: Specific experiences and events (what happened)
- `semantic`: General knowledge and facts (what I know)
- `procedural`: How to do things (step-by-step procedures)

**Example:**
```json
{
  "agent_id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "content": "To deploy the service, run 'kubectl apply -f deployment.yaml' in the k8s directory",
  "memory_type": "procedural",
  "scope": "project",
  "importance": 0.8,
  "project_id": "44444444-4444-4444-4444-444444444444"
}
```

---

#### 2. `memory_search`

Search memories by semantic similarity.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `query` | string | Yes | The search query |
| `agent_id` | string | No | Filter by agent UUID |
| `project_id` | string | No | Filter by project UUID |
| `memory_types` | array | No | Filter by memory types |
| `limit` | integer | No | Maximum results (default: 10) |

**Example:**
```json
{
  "query": "how to deploy kubernetes",
  "project_id": "44444444-4444-4444-4444-444444444444",
  "memory_types": ["procedural"],
  "limit": 5
}
```

---

#### 3. `memory_get_context`

Get relevant context for a task. Use this at the start of a task to retrieve memories that can help.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | Yes | UUID of the agent |
| `task_description` | string | Yes | Description of the task |
| `project_id` | string | No | Optional project UUID |
| `max_tokens` | integer | No | Maximum tokens in context (default: 2000) |

**Example:**
```json
{
  "agent_id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "task_description": "Update the payment API documentation",
  "project_id": "44444444-4444-4444-4444-444444444444",
  "max_tokens": 3000
}
```

---

#### 4. `memory_list`

List memories for an agent, optionally filtered by type.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | Yes | UUID of the agent |
| `memory_type` | string | No | Filter: `episodic`, `semantic`, `procedural` |
| `limit` | integer | No | Maximum results (default: 50) |

**Example:**
```json
{
  "agent_id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "memory_type": "semantic",
  "limit": 20
}
```

---

### Graph Tools

#### 5. `graph_register_agent`

Register an agent in the knowledge graph.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | Yes | UUID of the agent |
| `name` | string | Yes | Name of the agent |
| `agent_type` | string | Yes | Type of agent |

**Example:**
```json
{
  "agent_id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "name": "Documentation Specialist",
  "agent_type": "documentation"
}
```

---

#### 6. `graph_register_project`

Register a project in the knowledge graph.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | UUID of the project |
| `name` | string | Yes | Name of the project |

**Example:**
```json
{
  "project_id": "44444444-4444-4444-4444-444444444444",
  "name": "CenterPag Payment Platform"
}
```

---

#### 7. `graph_assign_agent_project`

Assign an agent to a project with a role.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `agent_id` | string | Yes | UUID of the agent |
| `project_id` | string | Yes | UUID of the project |
| `role` | string | Yes | Role (e.g., `gestor`, `executor`) |

**Example:**
```json
{
  "agent_id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "project_id": "44444444-4444-4444-4444-444444444444",
  "role": "executor"
}
```

---

### Working Memory Tools

Working memory provides short-term context persistence during sessions. It follows Miller's Law (7 items max) and auto-evicts older items.

#### 8. `working_memory_get`

Get working memory for a context. **CRITICAL: Always call this at the START of any task.**

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `context_id` | string | Yes | Context ID (e.g., `agent:uuid`, `project:uuid`, `skill:uuid`) |

**Context ID Formats:**
- `agent:{uuid}` - Agent's working memory
- `project:{uuid}` - Project's working memory
- `skill:{uuid}` - Skill's working memory

**Example:**
```json
{
  "context_id": "agent:ffffffff-ffff-ffff-ffff-ffffffffffff"
}
```

---

#### 9. `working_memory_add`

Add or update working memory for a context.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `context_id` | string | Yes | Context ID |
| `content` | string | Yes | Current state/task description |
| `agent_id` | string | No | Optional agent UUID |
| `project_id` | string | No | Optional project UUID |
| `ttl_seconds` | integer | No | TTL in seconds (default: 1800, max: 7200) |

**Example:**
```json
{
  "context_id": "agent:ffffffff-ffff-ffff-ffff-ffffffffffff",
  "content": "Currently updating MCP server documentation. Completed: README overview, Tools 1-7. Next: Working memory and stream tools.",
  "agent_id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "project_id": "44444444-4444-4444-4444-444444444444",
  "ttl_seconds": 3600
}
```

---

#### 10. `working_memory_clear`

Clear all working memory for a context. Use with caution.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `context_id` | string | Yes | Context ID to clear |

**Example:**
```json
{
  "context_id": "agent:ffffffff-ffff-ffff-ffff-ffffffffffff"
}
```

---

### Stream Tools

The memory stream captures all interactions for continuous learning. Important items are periodically promoted to long-term memory.

#### 11. `stream_capture`

Capture interaction to memory stream for learning.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `session_id` | string | Yes | Session identifier for grouping |
| `content` | string | Yes | Content to capture |
| `direction` | string | Yes | Direction: `input`, `output`, `internal` |
| `agent_id` | string | No | Optional agent UUID |
| `importance` | number | No | Importance score 0-1 (default: 0.5) |

**Directions:**
- `input`: User/external input
- `output`: Agent response/action
- `internal`: Internal thought/decision

**Example:**
```json
{
  "session_id": "doc-session-20260129",
  "content": "Created comprehensive MCP server documentation with all 12 tools",
  "direction": "output",
  "agent_id": "ffffffff-ffff-ffff-ffff-ffffffffffff",
  "importance": 0.8
}
```

---

#### 12. `stream_stats`

Get memory stream statistics.

**Parameters:** None

**Response includes:**
- `total`: Total items in stream
- `unprocessed`: Items pending processing
- `consolidated`: Items promoted to long-term memory
- `forgotten`: Items discarded
- `avg_importance`: Average importance score

**Example:**
```json
{}
```

---

### User Authentication Tools

#### 13. `user_login`

Login/identify user for personalized memories.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `email` | string | Yes | User email address |
| `username` | string | No | Optional username/alias |

**Example:**
```json
{
  "email": "igor.tavares@monetizze.com.br",
  "username": "igor"
}
```

**Response:**
```
Logged in as igor.tavares@monetizze.com.br. Found 3 personal memories.
```

---

#### 14. `user_get_context`

Get combined user + project context.

**Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `project_id` | string | Yes | Project UUID |

**Example:**
```json
{
  "project_id": "44444444-4444-4444-4444-444444444444"
}
```

**Response includes:**
- User memories (scope: user)
- Project memories (scope: project)
- Combined context

---

## Architecture

```
+------------------+       +-------------------+       +------------------+
|   Claude Agent   | <---> |  MCP Memory       | <---> |  Memory Service  |
|   (via MCP)      |       |  Server (stdio)   |       |  (REST API)      |
+------------------+       +-------------------+       +------------------+
                                                              |
                                    +-------------------------+
                                    |                         |
                            +-------v------+          +-------v------+
                            | PostgreSQL   |          |    Neo4j     |
                            | + pgvector   |          | (Knowledge   |
                            | (Memories)   |          |  Graph)      |
                            +--------------+          +--------------+
```

## Development

### Project Structure

```
mcp/
  src/
    index.ts        # Main server with all tool definitions
  dist/             # Compiled JavaScript
  package.json
  tsconfig.json
```

### Building

```bash
npm run build
```

### Type Checking

The project uses TypeScript 5.6+ with ES modules.

## Memory Types Explained

| Type | Use Case | Example |
|------|----------|---------|
| `episodic` | Record what happened | "Fixed bug in payment endpoint by adding null check" |
| `semantic` | Store facts and knowledge | "The project uses PostgreSQL 15 with pgvector extension" |
| `procedural` | Document how-to procedures | "To deploy: 1) Run tests, 2) Build Docker image, 3) Push to registry" |

## Scope Levels

| Scope | Visibility | Use Case |
|-------|------------|----------|
| `agent` | Only the storing agent | Personal learnings, agent-specific procedures |
| `project` | All agents in project | Shared documentation, project knowledge |
| `global` | All agents everywhere | Universal best practices |

## Best Practices

1. **Always read working memory first**: Call `working_memory_get` at the start of every task
2. **Update working memory when done**: Save progress with `working_memory_add`
3. **Capture important interactions**: Use `stream_capture` for learnings
4. **Use appropriate memory types**: Match content to episodic/semantic/procedural
5. **Set importance scores**: Higher scores (0.7+) for critical information

## License

MIT
