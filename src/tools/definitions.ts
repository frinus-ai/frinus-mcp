/**
 * Tool schema definitions for the Frinus MCP Server.
 *
 * Each entry defines a tool name, description, and inputSchema
 * following the MCP Tool specification.
 */
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOLS: Tool[] = [
  // ==========================================================================
  // Core Memory (5)
  // ==========================================================================
  {
    name: "memory_store",
    description: `Store a memory in the memory service.

Use this to record important information, learnings, decisions, or procedures
that should be remembered for future reference.

Memory types:
- episodic: Specific experiences and events (what happened)
- semantic: General knowledge and facts (what I know)
- procedural: How to do things (step-by-step procedures)

Scopes:
- user: Private to the user
- agent: Private to the agent
- universe: Shared within the universe (department)
- organization: Available to all agents in the organization`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: {
          type: "string",
          description: "UUID of the agent storing the memory",
        },
        content: {
          type: "string",
          description: "The memory content to store",
        },
        memory_type: {
          type: "string",
          enum: ["episodic", "semantic", "procedural"],
          description: "Type of memory (default: episodic)",
        },
        scope: {
          type: "string",
          enum: ["user", "agent", "universe", "organization"],
          description: "Visibility scope: user (private), agent (agent-only), universe (department), organization (org-wide). Default: organization",
        },
        importance: {
          type: "number",
          description: "Importance score 0-1 (default: 0.5)",
        },
        user_id: {
          type: "string",
          description: "Optional user identifier (email) who owns this memory",
        },
        created_by_user_id: {
          type: "string",
          description: "Optional user identifier (email) who triggered this memory creation. Auto-injected from logged-in user if not provided.",
        },
        metadata: {
          type: "object",
          description: "Metadata adicional (tags, universe, idioma, etc.)",
        },
      },
      required: ["agent_id", "content"],
    },
  },
  {
    name: "memory_search",
    description: `Search memories by semantic similarity.

Use this to find relevant memories based on a query.
Returns memories ranked by similarity to the query.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        query_text: {
          type: "string",
          description: "The search query text",
        },
        agent_id: {
          type: "string",
          description: "Filter by agent UUID",
        },
        memory_types: {
          type: "array",
          items: { type: "string" },
          description: "Filter by memory types",
        },
        limit: {
          type: "integer",
          description: "Maximum results (default: 10)",
        },
      },
      required: ["query_text"],
    },
  },
  {
    name: "memory_get",
    description: `Get a specific memory by its ID.

Use this to retrieve the full details of a memory including content,
metadata, importance score, and hierarchy level.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to retrieve" },
      },
      required: ["memory_id"],
    },
  },
  {
    name: "memory_list",
    description: `List memories for an agent.

Use this to see all memories stored by an agent,
optionally filtered by type.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: {
          type: "string",
          description: "UUID of the agent",
        },
        memory_type: {
          type: "string",
          enum: ["episodic", "semantic", "procedural"],
          description: "Filter by memory type",
        },
        limit: {
          type: "integer",
          description: "Maximum results (default: 50)",
        },
      },
      required: ["agent_id"],
    },
  },
  {
    name: "memory_delete",
    description: `Delete a memory by its ID.

Use with caution - this permanently removes the memory.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to delete" },
      },
      required: ["memory_id"],
    },
  },
  // ==========================================================================
  // Dynamic Relevance (2)
  // ==========================================================================
  {
    name: "memory_reinforce",
    description: `Reinforce a memory after successful use (Dynamic Relevance).

Use this when a memory was helpful to increase its importance.
The memory's relevance score will be boosted.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to reinforce" },
        boost: { type: "number", description: "Boost amount 0-1 (default: 0.1)" },
      },
      required: ["memory_id"],
    },
  },
  {
    name: "memory_weaken",
    description: `Weaken a memory that was not useful (Dynamic Relevance).

Use this when a memory was retrieved but not helpful.
The memory's relevance score will be reduced.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to weaken" },
        penalty: { type: "number", description: "Penalty amount 0-1 (default: 0.05)" },
      },
      required: ["memory_id"],
    },
  },
  // ==========================================================================
  // Working Memory (3)
  // ==========================================================================
  {
    name: "working_memory_get",
    description: `Get working memory for a context (agent, universe, or organization).

CRITICAL: Always call this at the START of any task to load current state.
Working memory contains the agent's current role, responsibilities, and task state.

Context ID formats:
- agent:{uuid} - Agent's working memory
- universe:{uuid} - Universe's working memory
- organization:{uuid} - Organization's working memory`,
    inputSchema: {
      type: "object" as const,
      properties: {
        context_id: {
          type: "string",
          description: "Context ID (e.g., 'agent:aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa')",
        },
      },
      required: ["context_id"],
    },
  },
  {
    name: "working_memory_add",
    description: `Add or update working memory for a context.

Use this to save current state during and after tasks.
Limited to 7 items per context (Miller's Law). Oldest items auto-evict.
Default TTL: 30 minutes.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        context_id: {
          type: "string",
          description: "Context ID (e.g., 'agent:uuid', 'project:uuid')",
        },
        content: {
          type: "string",
          description: "Current state/task description to remember",
        },
        agent_id: {
          type: "string",
          description: "Optional agent UUID",
        },
        ttl_seconds: {
          type: "integer",
          description: "TTL in seconds (default: 1800 = 30min, max: 7200 = 2h)",
        },
      },
      required: ["context_id", "content"],
    },
  },
  {
    name: "working_memory_clear",
    description: "Clear all working memory for a context. Use with caution.",
    inputSchema: {
      type: "object" as const,
      properties: {
        context_id: {
          type: "string",
          description: "Context ID to clear",
        },
      },
      required: ["context_id"],
    },
  },
  // ==========================================================================
  // Session (5)
  // ==========================================================================
  {
    name: "session_start",
    description: `Start a memory session.

Loads agent rules and memories, creates session tracking.
Streams from this point are linked to the session.
Memories generated from streams are NOT linked to the session.

For subagent inheritance, pass the parent's session_id as parent_session_id.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: {
          type: "string",
          description: "Agent UUID for this session",
        },
        parent_session_id: {
          type: "string",
          description: "Parent session ID for subagent inheritance. "
            + "When a subagent is invoked, pass the parent's session_id here.",
        },
      },
      required: [],
    },
  },
  {
    name: "session_end",
    description: `End an active memory session.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: "Session ID to end",
        },
      },
      required: ["session_id"],
    },
  },
  {
    name: "session_context",
    description: `Get combined working + long-term memory context for a session.

Retrieves:
1. Recent items from working memory (session-specific)
2. Relevant long-term memories using RAG (enhanced with session context)
3. Extracted topics from the session

The query is enhanced with session topics to improve retrieval relevance.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session identifier" },
        query: { type: "string", description: "Current query to contextualize" },
        agent_id: { type: "string", description: "Optional agent UUID" },
        max_working_memory: { type: "integer", description: "Max working memory items (default: 5)" },
        max_long_term: { type: "integer", description: "Max long-term memories (default: 10)" },
        include_topics: { type: "boolean", description: "Include extracted topics (default: true)" },
      },
      required: ["session_id", "query"],
    },
  },
  {
    name: "session_summary",
    description: `Get a summary of the current session.

Returns main topics, item count, and recent items for the session.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session identifier" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "session_clear",
    description: `Clear all working memory for a session.

Removes all temporary items from the session's working memory.
Long-term memories are not affected.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session identifier" },
      },
      required: ["session_id"],
    },
  },
  // ==========================================================================
  // Stream (4)
  // ==========================================================================
  {
    name: "stream_capture",
    description: `Capture interaction to memory stream for learning.

Use this to record important inputs, outputs, decisions, or learnings.
The memory stream is processed periodically and important items
are promoted to long-term memory.

Directions:
- input: User/external input
- output: Agent response/action
- internal: Internal thought/decision`,
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: {
          type: "string",
          description: "Session identifier for grouping related captures",
        },
        content: {
          type: "string",
          description: "Content to capture",
        },
        direction: {
          type: "string",
          enum: ["input", "output", "internal"],
          description: "Direction of the content",
        },
        agent_id: {
          type: "string",
          description: "Optional agent UUID",
        },
        importance: {
          type: "number",
          description: "Importance score 0-1 (default: 0.5)",
        },
      },
      required: ["session_id", "content", "direction"],
    },
  },
  {
    name: "stream_get_session",
    description: `Get all stream items from a specific session.

Returns the captured inputs, outputs, and internal thoughts
for the specified session.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session ID to retrieve (required)" },
        limit: { type: "integer", description: "Maximum items to return (default: 100, max: 500)" },
      },
      required: ["session_id"],
    },
  },
  {
    name: "stream_get_recent",
    description: `Get recent stream items.

Returns the most recent items captured to the memory stream,
optionally filtered by agent.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Filter by agent UUID" },
        limit: { type: "integer", description: "Maximum items to return (default: 50, max: 500)" },
        include_forgotten: { type: "boolean", description: "Include forgotten items (default: false)" },
      },
      required: [],
    },
  },
  {
    name: "stream_process",
    description: `Process unprocessed stream items.

- Calculates true importance based on content analysis
- Promotes items with importance >= 0.6 to permanent memories
- Marks all processed items as processed

Call this periodically or during sleep cycles to convert
stream items into permanent memories.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        batch_size: { type: "integer", description: "Number of items to process (default: 100, max: 1000)" },
      },
      required: [],
    },
  },
  // ==========================================================================
  // Context (2)
  // ==========================================================================
  {
    name: "memory_get_context",
    description: `Get relevant context for a task.

Use this at the start of a task to retrieve relevant memories
that can help with the task. Returns a formatted context prompt.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: {
          type: "string",
          description: "UUID of the agent",
        },
        task_description: {
          type: "string",
          description: "Description of the task",
        },
        max_tokens: {
          type: "integer",
          description: "Maximum tokens in context (default: 2000)",
        },
      },
      required: ["agent_id", "task_description"],
    },
  },
  {
    name: "search_with_attention",
    description: `Search memories with task-specific attention (Selective Attention).

Weights memory types based on task type for better results.
E.g., debug tasks prioritize episodic memories.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        query_text: { type: "string", description: "Search query text" },
        agent_id: { type: "string", description: "Optional agent UUID filter" },
        user_id: { type: "string", description: "Optional user identifier filter (auto-injected from logged-in user if not provided)" },
        task_type: { type: "string", description: "Task type (deploy, debug, documentation, implementation, review)" },
        limit: { type: "integer", description: "Maximum results (default: 10)" },
      },
      required: ["query_text"],
    },
  },
  // ==========================================================================
  // User (2)
  // ==========================================================================
  {
    name: "user_register",
    description: `Register a new user and create an organization.

Creates a Keycloak user, provisions a tenant database, and returns auth tokens.
After successful registration, the user is automatically logged in.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        email: { type: "string", description: "User email address" },
        password: { type: "string", description: "User password (min 8 chars)" },
        first_name: { type: "string", description: "First name" },
        last_name: { type: "string", description: "Last name" },
        org_name: { type: "string", description: "Organization name" },
        org_slug: { type: "string", description: "Organization slug (lowercase, alphanumeric, hyphens)" },
      },
      required: ["email", "password", "first_name", "last_name", "org_name", "org_slug"],
    },
  },
  {
    name: "user_get_context",
    description: `Get combined user context for current logged-in user.

Use this to retrieve context that combines:
- User's personal memories and preferences
- Relevant task context

Returns formatted context ready for use.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        task_description: {
          type: "string",
          description: "Optional task description for context filtering",
        },
        user_email: {
          type: "string",
          description: "User email (from previous login)",
        },
      },
      required: [],
    },
  },
  // ==========================================================================
  // Maintenance (2)
  // ==========================================================================
  {
    name: "heartbeat_tick",
    description: `Tick the heartbeat and trigger scheduled maintenance routines.

Call this on every user interaction or periodically. It will automatically
trigger maintenance routines based on configured intervals:
- Every 5 ticks: Working memory check
- Every 10 ticks: Stream capture
- Every 20 ticks: Mini-sleep (light maintenance)
- Every 50 ticks: Normal sleep (full maintenance)
- Daily: Deep sleep (all phases)
- Weekly: Full meta-cognition

Returns the current interaction count and any actions that were triggered.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Optional agent UUID" },
        context_id: { type: "string", description: "Optional context ID for working memory (e.g., 'agent:uuid')" },
        session_id: { type: "string", description: "Optional session ID for stream capture" },
      },
      required: [],
    },
  },
  {
    name: "sleep_run",
    description: `Run a sleep cycle (Sleep Meta-Evaluation).

Executes memory maintenance phases:
1. evaluation - Assess memory quality
2. forgetting - Detect and resolve conflicts
3. consolidation - Create hierarchical summaries
4. relevance - Adjust dynamic relevance`,
    inputSchema: {
      type: "object" as const,
      properties: {
        phases: {
          type: "array",
          items: { type: "string" },
          description: "Phases to run (default: all)",
        },
      },
      required: [],
    },
  },
  // ==========================================================================
  // Consolidation (3)
  // ==========================================================================
  {
    name: "consolidation_detect_conflicts",
    description: `Detect conflicting memories (Active Forgetting).

Finds memories that may contain contradictory information.
Useful for maintaining consistency in the knowledge base.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        similarity_threshold: { type: "number", description: "Similarity threshold 0-1 (default: 0.9)" },
        limit: { type: "integer", description: "Maximum results (default: 50)" },
      },
      required: [],
    },
  },
  {
    name: "consolidation_resolve_conflict",
    description: `Resolve a conflict between two memories (Active Forgetting).

When two memories contain contradictory information, use this to:
- Keep one memory as the authoritative source
- Mark the other as superseded
- Document the resolution reason

The superseded memory will be marked as obsolete.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        keep_id: { type: "string", description: "UUID of the memory to keep as current" },
        supersede_id: { type: "string", description: "UUID of the memory to mark as superseded" },
        resolution_note: { type: "string", description: "Explanation of why this resolution was chosen (required)" },
      },
      required: ["keep_id", "supersede_id", "resolution_note"],
    },
  },
  {
    name: "consolidation_detect_redundant",
    description: `Detect redundant memories (Active Forgetting).

Finds near-duplicate memories that could be consolidated.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        similarity_threshold: { type: "number", description: "Similarity threshold 0-1 (default: 0.95)" },
        limit: { type: "integer", description: "Maximum results (default: 50)" },
      },
      required: [],
    },
  },
  // ==========================================================================
  // Hierarchy (2)
  // ==========================================================================
  {
    name: "hierarchy_consolidate",
    description: `Consolidate multiple memories into a summary (Hierarchical Memory).

Takes a list of related memories (minimum 2) and creates a higher-level summary.
Useful for creating abstract knowledge from detailed experiences.
If summary_content is not provided, it will be auto-generated.

Levels: raw -> chunk -> summary -> abstract`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_ids: {
          type: "array",
          items: { type: "string" },
          description: "UUIDs of memories to consolidate (minimum 2)",
        },
        summary_content: { type: "string", description: "Custom summary content (optional, auto-generated if not provided)" },
        agent_id: { type: "string", description: "Agent UUID for the new memory (inherits from first memory if not specified)" },
      },
      required: ["memory_ids"],
    },
  },
  {
    name: "hierarchy_get_tree",
    description: `Get the hierarchy tree for a memory (Hierarchical Memory).

Returns the memory and all its related memories in the hierarchy:
- Parent memories (if this is derived from others)
- Child memories (if this was used to create others)`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory" },
      },
      required: ["memory_id"],
    },
  },
];
