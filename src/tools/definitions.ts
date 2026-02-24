/**
 * Tool schema definitions for the Frinus MCP Server.
 *
 * Each entry defines a tool name, description, and inputSchema
 * following the MCP Tool specification.
 */
import { Tool } from "@modelcontextprotocol/sdk/types.js";

export const TOOLS: Tool[] = [
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
        project_id: {
          type: "string",
          description: "Optional project UUID for project-scoped memories",
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
        project_id: {
          type: "string",
          description: "Filter by project UUID",
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
        project_id: {
          type: "string",
          description: "Optional project UUID",
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
    name: "graph_register_agent",
    description: "Register an agent in the knowledge graph.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "UUID of the agent" },
        name: { type: "string", description: "Name of the agent" },
        agent_type: { type: "string", description: "Type of agent" },
      },
      required: ["agent_id", "name", "agent_type"],
    },
  },
  {
    name: "graph_register_project",
    description: "Register a project in the knowledge graph.",
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
        name: { type: "string", description: "Name of the project" },
      },
      required: ["project_id", "name"],
    },
  },
  {
    name: "graph_assign_agent_project",
    description: "Assign an agent to a project with a role.",
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "UUID of the agent" },
        project_id: { type: "string", description: "UUID of the project" },
        role: { type: "string", description: "Role (e.g., 'gestor', 'executor')" },
      },
      required: ["agent_id", "project_id", "role"],
    },
  },
  // Working Memory Tools
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
        project_id: {
          type: "string",
          description: "Optional project UUID",
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
  // Stream Tools
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
    name: "stream_stats",
    description: "Get memory stream statistics (total items, processed, consolidated).",
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  // User Tools
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
    name: "session_start",
    description: `Start a memory session.

Loads agent/project rules and memories, creates session tracking.
Streams from this point are linked to the session.
Memories generated from streams are NOT linked to the session.

IMPORTANT: project_id is REQUIRED. All memory operations during this session
will be associated with the specified project.

For subagent inheritance, pass the parent's session_id as parent_session_id.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Project UUID context. REQUIRED.",
        },
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
      required: ["project_id"],
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
    name: "user_get_context",
    description: `Get combined user + project context for current logged-in user.

Use this to retrieve context that combines:
- User's personal memories and preferences
- Project-specific memories
- Relevant task context

Returns formatted context ready for use.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: {
          type: "string",
          description: "Project UUID",
        },
        task_description: {
          type: "string",
          description: "Optional task description for context filtering",
        },
        user_email: {
          type: "string",
          description: "User email (from previous login)",
        },
      },
      required: ["project_id"],
    },
  },
  // Cycle 12 - Dynamic Relevance
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
  {
    name: "memory_trending",
    description: `Get trending memories (most reinforced recently).

Returns memories that have been frequently used and reinforced.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
        limit: { type: "integer", description: "Maximum results (default: 10)" },
      },
      required: ["project_id"],
    },
  },
  // Cycle 12 - Active Forgetting
  {
    name: "consolidation_detect_conflicts",
    description: `Detect conflicting memories (Active Forgetting).

Finds memories that may contain contradictory information.
Useful for maintaining consistency in the knowledge base.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
        similarity_threshold: { type: "number", description: "Similarity threshold 0-1 (default: 0.9)" },
        limit: { type: "integer", description: "Maximum results (default: 50)" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "consolidation_detect_redundant",
    description: `Detect redundant memories (Active Forgetting).

Finds near-duplicate memories that could be consolidated.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
        similarity_threshold: { type: "number", description: "Similarity threshold 0-1 (default: 0.95)" },
        limit: { type: "integer", description: "Maximum results (default: 50)" },
      },
      required: ["project_id"],
    },
  },
  // Cycle 12 - Hierarchical Memory
  {
    name: "hierarchy_stats",
    description: `Get hierarchy statistics (Hierarchical Memory).

Returns counts of memories at each level (raw, chunk, summary, abstract).`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Optional project UUID filter" },
      },
      required: [],
    },
  },
  {
    name: "hierarchy_auto_consolidate",
    description: `Auto-consolidate memories into summaries (Hierarchical Memory).

Groups related raw memories and creates summary memories.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
        source_level: { type: "string", description: "Source level (default: raw)" },
        limit: { type: "integer", description: "Max memories to process (default: 100)" },
      },
      required: ["project_id"],
    },
  },
  // Cycle 12 - Selective Attention
  {
    name: "attention_profiles",
    description: `Get available attention profiles (Selective Attention).

Returns all task-type profiles with their memory type weights.
Profiles: deploy, debug, documentation, implementation, review.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
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
        project_id: { type: "string", description: "Project UUID" },
        agent_id: { type: "string", description: "Optional agent UUID filter" },
        user_id: { type: "string", description: "Optional user identifier filter (auto-injected from logged-in user if not provided)" },
        task_type: { type: "string", description: "Task type (deploy, debug, documentation, implementation, review)" },
        limit: { type: "integer", description: "Maximum results (default: 10)" },
      },
      required: ["query_text", "project_id"],
    },
  },
  // Cycle 12 - Meta-Cognition
  {
    name: "metacognition_evaluate",
    description: `Evaluate memory quality (Meta-Cognition).

Assesses precision, freshness, and consistency of memories.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Optional agent UUID filter" },
        project_id: { type: "string", description: "Optional project UUID filter" },
        limit: { type: "integer", description: "Max memories to evaluate (default: 100)" },
      },
      required: [],
    },
  },
  {
    name: "metacognition_report",
    description: `Get meta-cognition report for an agent (Meta-Cognition).

Returns quality metrics: precision, freshness, consistency, overall score.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Agent UUID" },
      },
      required: ["agent_id"],
    },
  },
  // Cycle 12 - Sleep Meta-Evaluation
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
        project_id: { type: "string", description: "Project UUID" },
        phases: {
          type: "array",
          items: { type: "string" },
          description: "Phases to run (default: all)",
        },
      },
      required: ["project_id"],
    },
  },
  {
    name: "sleep_report",
    description: `Get sleep cycle status report.

Shows last run, memory statistics, and health status.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "sleep_config",
    description: `Get sleep cycle configuration.

Shows thresholds, intervals, and feature toggles.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  // Cycle 12 - Transfer Learning
  {
    name: "transfer_find_candidates",
    description: `Find memories transferable between projects (Transfer Learning).

Identifies memories from source project relevant to target project.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        source_project_id: { type: "string", description: "Source project UUID" },
        target_project_id: { type: "string", description: "Target project UUID" },
        limit: { type: "integer", description: "Maximum results (default: 20)" },
      },
      required: ["source_project_id", "target_project_id"],
    },
  },
  {
    name: "transfer_memory",
    description: `Transfer a memory to another project (Transfer Learning).

Copies memory with adapted relevance for target context.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        source_memory_id: { type: "string", description: "Memory UUID to transfer" },
        target_project_id: { type: "string", description: "Target project UUID" },
        context_query: { type: "string", description: "Context for relevance adaptation" },
      },
      required: ["source_memory_id", "target_project_id"],
    },
  },
  // === NEW TOOLS - Cycle 12 Completion ===
  // Memory Individual Operations
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
    name: "memory_delete",
    description: `Delete a memory by its ID.

Use with caution - this permanently removes the memory.
Consider using mark_obsolete for soft deletion instead.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to delete" },
      },
      required: ["memory_id"],
    },
  },
  // Active Forgetting - Additional
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
    name: "consolidation_mark_obsolete",
    description: `Mark a memory as obsolete (Active Forgetting).

Use this when a memory is no longer valid or has been superseded.
The memory is soft-deleted and won't appear in searches.

Common reasons: 'information_updated', 'merged_duplicate', 'no_longer_relevant'`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to mark obsolete" },
        reason: { type: "string", description: "Reason for marking as obsolete (required)" },
        superseded_by: { type: "string", description: "Optional: UUID of the newer memory that replaces this one" },
      },
      required: ["memory_id", "reason"],
    },
  },
  // Hierarchical Memory - Additional
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
        project_id: { type: "string", description: "Project UUID for the new memory (inherits from first memory if not specified)" },
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
  {
    name: "hierarchy_promote",
    description: `Promote a memory to a higher level (Hierarchical Memory).

Moves a memory from its current level to a higher abstraction level.
E.g., from 'raw' to 'chunk', or 'chunk' to 'summary'.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory to promote" },
        target_level: {
          type: "string",
          enum: ["raw", "chunk", "summary", "abstract"],
          description: "Target level to promote to (required)",
        },
      },
      required: ["memory_id", "target_level"],
    },
  },
  // Meta-Cognition - Additional
  {
    name: "metacognition_flagged",
    description: `Get memories flagged for review (Meta-Cognition).

Returns memories that have quality issues:
- Low precision (not useful when retrieved)
- Low freshness (outdated)
- Low consistency (conflicts with other memories)

Use this to identify memories that need attention.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Filter by project UUID" },
        agent_id: { type: "string", description: "Filter by agent UUID" },
        min_issues: { type: "integer", description: "Minimum number of issues (default: 1)" },
        limit: { type: "integer", description: "Maximum results (default: 50)" },
      },
      required: [],
    },
  },
  // Transfer Learning - Additional
  {
    name: "transfer_bulk",
    description: `Transfer multiple memories at once (Transfer Learning).

Bulk transfer of memories to another project.
All memories will be adapted for the target context.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_ids: {
          type: "array",
          items: { type: "string" },
          description: "UUIDs of memories to transfer",
        },
        target_project_id: { type: "string", description: "Target project UUID" },
        context_similarity: { type: "number", description: "Context similarity score 0-1 (optional)" },
        transfer_note: { type: "string", description: "Note explaining the transfer (optional)" },
      },
      required: ["memory_ids", "target_project_id"],
    },
  },
  {
    name: "transfer_adapt",
    description: `Calculate adapted relevance for transfer (Transfer Learning).

Dry-run to see how a memory would be adapted for a target context.
Does NOT actually transfer - use transfer_memory for that.

Useful for previewing transfer results before committing.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        source_memory_id: { type: "string", description: "Memory UUID to analyze" },
        target_project_id: { type: "string", description: "Target project UUID" },
        context_query: { type: "string", description: "Context for relevance calculation" },
      },
      required: ["source_memory_id", "target_project_id"],
    },
  },
  {
    name: "transfer_history",
    description: `Get transfer history for a memory (Transfer Learning).

Shows all transfers involving this memory:
- Where it was transferred to
- When transfers occurred
- Adapted relevance scores`,
    inputSchema: {
      type: "object" as const,
      properties: {
        memory_id: { type: "string", description: "UUID of the memory" },
      },
      required: ["memory_id"],
    },
  },
  // === PROJECT MANAGEMENT TOOLS ===
  {
    name: "project_list",
    description: `List all available projects in the memory service.

Returns all registered projects with their names, descriptions, and memory counts.
Use this to discover what projects exist before working with memories.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "project_get",
    description: `Get project details by ID.

Retrieves a specific project's information including name, description,
and number of memories stored in the project.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "project_search",
    description: `Search projects by name.

Performs a case-insensitive search for projects containing the given name.
Useful for finding projects when you don't know the exact ID.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Project name to search for" },
      },
      required: ["name"],
    },
  },
  {
    name: "project_create",
    description: `Create a new project.

Use this when starting work on a new project that doesn't exist yet.
A unique UUID will be generated for the project.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        name: { type: "string", description: "Project name (required)" },
        description: { type: "string", description: "Project description (optional)" },
      },
      required: ["name"],
    },
  },
  // === PROJECT HIERARCHY TOOLS ===
  {
    name: "project_link_subproject",
    description: `Link a project as a subproject of another.

Creates a SUBPROJECT_OF relationship where the child project becomes
a subproject of the parent. This enables hierarchical memory retrieval
where agents can access context from parent projects.

Use cases:
- Organizing microservices under a main project
- Creating team/department hierarchies
- Linking feature projects to main product`,
    inputSchema: {
      type: "object" as const,
      properties: {
        parent_id: { type: "string", description: "UUID of the parent project" },
        child_id: { type: "string", description: "UUID of the child (sub)project" },
      },
      required: ["parent_id", "child_id"],
    },
  },
  {
    name: "project_unlink_subproject",
    description: `Remove subproject relationship between projects.

Removes the SUBPROJECT_OF relationship. The child project remains
but is no longer linked to the parent.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        parent_id: { type: "string", description: "UUID of the parent project" },
        child_id: { type: "string", description: "UUID of the child project" },
      },
      required: ["parent_id", "child_id"],
    },
  },
  {
    name: "project_list_subprojects",
    description: `List all subprojects of a project.

Returns all projects that are subprojects (direct or nested) of the
given project, with their depth in the hierarchy.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "UUID of the parent project" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "project_get_hierarchy",
    description: `Get full project hierarchy (parents and children).

Returns both ancestor projects (parents, grandparents, etc) and
descendant projects (children, grandchildren, etc) for a given project.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "UUID of the project" },
      },
      required: ["project_id"],
    },
  },
  // === HEARTBEAT SYSTEM TOOLS ===
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
        project_id: { type: "string", description: "Project UUID (required)" },
        agent_id: { type: "string", description: "Optional agent UUID" },
        context_id: { type: "string", description: "Optional context ID for working memory (e.g., 'agent:uuid')" },
        session_id: { type: "string", description: "Optional session ID for stream capture" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "heartbeat_status",
    description: `Get current heartbeat system status.

Returns detailed information about the heartbeat system:
- Current interaction count
- When it started
- Last tick time
- Current configuration and intervals
- System uptime
- History of executed actions`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  {
    name: "heartbeat_configure",
    description: `Configure heartbeat intervals and settings.

Update the frequency of automatic maintenance routines.
All fields are optional - only provide the ones you want to change.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        working_memory_interval: { type: "integer", description: "Check working memory every N interactions (default: 5)" },
        stream_capture_interval: { type: "integer", description: "Capture to stream every N interactions (default: 10)" },
        mini_sleep_interval: { type: "integer", description: "Run mini-sleep every N interactions (default: 20)" },
        normal_sleep_interval: { type: "integer", description: "Run normal sleep every N interactions (default: 50)" },
        daily_sleep_enabled: { type: "boolean", description: "Enable/disable daily deep sleep" },
        weekly_metacognition_enabled: { type: "boolean", description: "Enable/disable weekly meta-cognition" },
      },
      required: [],
    },
  },
  {
    name: "heartbeat_reset",
    description: `Reset the heartbeat state.

Resets the interaction counter and clears action history.
Configuration is preserved.

Use this when:
- Starting a new session
- After a major system change
- For testing purposes

WARNING: This will reset the interaction counter, potentially
changing when routines trigger next.`,
    inputSchema: {
      type: "object" as const,
      properties: {},
      required: [],
    },
  },
  // === STREAM SYSTEM TOOLS (Additional) ===
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
  {
    name: "stream_forget",
    description: `Forget (mark as forgotten) irrelevant stream items.

Items are forgotten if:
- They are older than threshold_days
- Their importance is below min_importance
- They haven't been consolidated

This should be called during sleep cycles to clean up
low-value stream items and prevent unbounded growth.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        threshold_days: { type: "integer", description: "Forget items older than this (default: 7)" },
        min_importance: { type: "number", description: "Forget items with importance below this (default: 0.3)" },
      },
      required: [],
    },
  },
  {
    name: "stream_consolidate",
    description: `Consolidate all stream items from a session.

- Creates a summary memory of the session
- Marks all items as consolidated

This helps reduce noise while preserving important context.
Call this when a session ends or during sleep cycles.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        session_id: { type: "string", description: "Session ID to consolidate (required)" },
      },
      required: ["session_id"],
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
  // === CONTEXT HIERARCHY TOOLS (Cycle 13) ===
  {
    name: "context_create",
    description: `Create a hierarchical context (Cycle 13).

Context hierarchy organizes memories in a tree structure:
- project (depth 0) - Top-level container
- epic (depth 1) - Large feature or initiative
- demand (depth 2) - Specific requirement
- task (depth 3+) - Atomic work item

Context paths use forward-slash notation:
- "proj-123" (project)
- "proj-123/epic-456" (epic)
- "proj-123/epic-456/demand-789" (demand)`,
    inputSchema: {
      type: "object" as const,
      properties: {
        context_path: { type: "string", description: "Context path (e.g., 'proj-123/epic-456')" },
        context_type: { type: "string", enum: ["project", "epic", "demand", "task"], description: "Context type matching depth" },
        name: { type: "string", description: "Human-readable name" },
        project_id: { type: "string", description: "Project UUID" },
        description: { type: "string", description: "Optional description" },
        parent_path: { type: "string", description: "Optional parent path (derived from context_path if not provided)" },
        metadata: { type: "object", description: "Optional metadata" },
      },
      required: ["context_path", "context_type", "name", "project_id"],
    },
  },
  {
    name: "context_tree",
    description: `Get the full context tree for a project (Cycle 13).

Returns the complete hierarchy of contexts organized as a tree
with nested children, total contexts, and memory counts.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "context_memories",
    description: `Get memories belonging to a specific context (Cycle 13).

Returns memories associated with the context path.
Can optionally include memories from child contexts.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        context_path: { type: "string", description: "Context path to query" },
        include_children: { type: "boolean", description: "Include memories from child contexts (default: false)" },
        memory_types: { type: "array", items: { type: "string" }, description: "Filter by memory types" },
        limit: { type: "integer", description: "Max memories to return (default: 50)" },
        offset: { type: "integer", description: "Offset for pagination (default: 0)" },
      },
      required: ["context_path"],
    },
  },
  {
    name: "context_stats",
    description: `Get context statistics for a project (Cycle 13).

Returns counts of contexts by type, total memories,
deepest path, and maximum depth.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID" },
      },
      required: ["project_id"],
    },
  },
  {
    name: "context_info",
    description: `Get detailed information about a specific context (Cycle 13).

Returns full context details including ancestors, children,
memory counts (direct and recursive), and metadata.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        context_path: { type: "string", description: "Context path" },
      },
      required: ["context_path"],
    },
  },
  {
    name: "context_update",
    description: `Update a context's name or description (Cycle 13).

Note: context_path and context_type cannot be changed after creation.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        context_path: { type: "string", description: "Context path to update" },
        name: { type: "string", description: "New name (optional)" },
        description: { type: "string", description: "New description (optional)" },
      },
      required: ["context_path"],
    },
  },
  {
    name: "context_delete",
    description: `Delete a context from the hierarchy (Cycle 13).

By default, fails if context has children. Use force=true to delete anyway.
Note: This does not delete associated memories, only the context node.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        context_path: { type: "string", description: "Context path to delete" },
        force: { type: "boolean", description: "Force delete even if has children (default: false)" },
      },
      required: ["context_path"],
    },
  },
  // === SESSION MANAGEMENT TOOLS ===
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
        project_id: { type: "string", description: "Optional project UUID" },
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
  // === GRAPH ESSENTIAL TOOLS ===
  {
    name: "graph_register_skill",
    description: `Register a skill in the knowledge graph.

Skills represent capabilities that agents can have.
They can be composed (parent-child relationships) and
linked to agents with proficiency levels.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        skill_id: { type: "string", description: "Skill UUID" },
        name: { type: "string", description: "Skill name" },
        skill_type: { type: "string", description: "Type of skill (e.g., 'technical', 'domain')" },
      },
      required: ["skill_id", "name", "skill_type"],
    },
  },
  {
    name: "graph_find_agents",
    description: `Find agents best suited for a task based on required skills.

Returns agents ranked by skill match and proficiency.
Can filter by project assignment and experience preference.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        required_skill_ids: { type: "array", items: { type: "string" }, description: "Required skill UUIDs" },
        project_id: { type: "string", description: "Optional project UUID to filter by" },
        prefer_experienced: { type: "boolean", description: "Prefer agents with more experience (default: true)" },
        limit: { type: "integer", description: "Max agents to return (default: 10)" },
      },
      required: ["required_skill_ids"],
    },
  },
  {
    name: "graph_sync_memories",
    description: `Sync all project memories to the relationship graph.

Ensures memory relationships (BELONGS_TO, IN_SESSION, etc.) are consistent
with the memories table. Use to backfill memories created before graph sync.

The operation is idempotent - running multiple times won't create duplicates.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        project_id: { type: "string", description: "Project UUID to sync" },
      },
      required: ["project_id"],
    },
  },
  // === TEAM RELATIONSHIP TOOLS ===
  {
    name: "graph_create_manages",
    description: `Create a MANAGES relationship between two agents (manager -> subordinate).

Use this to establish hierarchical team structures. The manager will have
direct oversight of the subordinate. Optionally specify a team name and start date.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        manager_id: { type: "string", description: "Manager agent UUID" },
        subordinate_id: { type: "string", description: "Subordinate agent UUID" },
        team_name: { type: "string", description: "Optional team name" },
        since: { type: "string", description: "Optional ISO date when management started" },
      },
      required: ["manager_id", "subordinate_id"],
    },
  },
  {
    name: "graph_remove_manages",
    description: `Remove a MANAGES relationship between two agents.

Use this when a subordinate is no longer managed by a specific manager.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        manager_id: { type: "string", description: "Manager agent UUID" },
        subordinate_id: { type: "string", description: "Subordinate agent UUID" },
      },
      required: ["manager_id", "subordinate_id"],
    },
  },
  {
    name: "graph_create_collaboration",
    description: `Create a bidirectional COLLABORATES_WITH relationship between two agents.

Use this to establish peer-to-peer collaboration. Types: general, project, expertise, cross_team.
Strength indicates intensity of collaboration (0-1, default 0.5).`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent1_id: { type: "string", description: "First agent UUID" },
        agent2_id: { type: "string", description: "Second agent UUID" },
        collaboration_type: { type: "string", enum: ["general", "project", "expertise", "cross_team"], description: "Type of collaboration" },
        project_id: { type: "string", description: "Optional project UUID for project-based collaboration" },
        strength: { type: "number", description: "Collaboration strength 0-1 (default 0.5)" },
      },
      required: ["agent1_id", "agent2_id"],
    },
  },
  {
    name: "graph_remove_collaboration",
    description: `Remove COLLABORATES_WITH relationship between two agents.

Removes the bidirectional collaboration link.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent1_id: { type: "string", description: "First agent UUID" },
        agent2_id: { type: "string", description: "Second agent UUID" },
      },
      required: ["agent1_id", "agent2_id"],
    },
  },
  {
    name: "graph_get_team_structure",
    description: `Get the team structure for a manager.

Returns all direct reports. Use include_indirect=true to also get indirect reports
(reports of reports) forming the complete team tree.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        manager_id: { type: "string", description: "Manager agent UUID" },
        include_indirect: { type: "boolean", description: "Include indirect reports in team tree" },
      },
      required: ["manager_id"],
    },
  },
  {
    name: "graph_get_agent_manager",
    description: `Get the manager of an agent.

Returns the direct manager if one exists.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Agent UUID" },
      },
      required: ["agent_id"],
    },
  },
  {
    name: "graph_get_collaborators",
    description: `Get collaborators of an agent.

Returns all agents that collaborate with the specified agent.
Can filter by collaboration type and minimum strength.`,
    inputSchema: {
      type: "object" as const,
      properties: {
        agent_id: { type: "string", description: "Agent UUID" },
        collaboration_type: { type: "string", description: "Filter by collaboration type (general, project, expertise, cross_team)" },
        min_strength: { type: "number", description: "Minimum collaboration strength filter (0-1)" },
      },
      required: ["agent_id"],
    },
  },
];
