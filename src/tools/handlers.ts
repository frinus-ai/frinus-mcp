/**
 * Tool handlers for the Frinus MCP Server.
 *
 * Maps tool names to handler functions that execute the tool logic
 * and return formatted MCP tool results.
 */
import axios from "axios";
import type { ToolResult, ToolArgs, ToolHandlerDeps } from "../types/index.js";

// ---------------------------------------------------------------------------
// Helper: 401/403 error handling
// ---------------------------------------------------------------------------
export function handleApiError(error: any): ToolResult | null {
  if (error?.response?.status === 401) {
    return {
      content: [{ type: "text", text: "Authentication error (401). Check API key configuration." }],
      isError: true,
    };
  }
  if (error?.response?.status === 403) {
    return {
      content: [{ type: "text", text: "Permission denied. You don't have access to this scope." }],
      isError: true,
    };
  }
  return null; // Not an auth error, let it propagate
}

// ---------------------------------------------------------------------------
// Handler map: tool name -> async handler function
// ---------------------------------------------------------------------------
type HandlerFn = (args: ToolArgs, deps: ToolHandlerDeps) => Promise<ToolResult>;

const handlers: Record<string, HandlerFn> = {

  // ==========================================================================
  // Memory CRUD
  // ==========================================================================

  async memory_store(args, { memoryClient, resolvedUserId }) {
    const createdByUser = (args.created_by_user_id as string) || resolvedUserId || undefined;
    const userId = (args.user_id as string) || resolvedUserId || undefined;
    const result = await memoryClient.storeMemory({
      agent_id: args.agent_id as string,
      content: args.content as string,
      memory_type: args.memory_type as string,
      scope: args.scope as string,
      importance: args.importance as number,
      project_id: args.project_id as string,
      user_id: userId,
      created_by_user_id: createdByUser,
      metadata: args.metadata as Record<string, unknown> | undefined,
    });
    return {
      content: [{
        type: "text",
        text: `Memory stored successfully.\nID: ${result.id}\nType: ${result.memory_type}\nScope: ${result.scope}`,
      }],
    };
  },

  async memory_search(args, { memoryClient }) {
    const results = await memoryClient.searchMemories({
      query_text: args.query_text as string,
      agent_id: args.agent_id as string,
      project_id: args.project_id as string,
      memory_types: args.memory_types as string[],
      limit: args.limit as number,
    });

    if (!results || results.length === 0) {
      return { content: [{ type: "text", text: "No memories found matching the query." }] };
    }

    let formatted = "Found memories:\n\n";
    results.forEach((mem: any, i: number) => {
      formatted += `${i + 1}. [${mem.memory_type}] (similarity: ${(mem.similarity || 0).toFixed(2)})\n`;
      formatted += `   ${mem.content}\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async memory_get_context(args, { memoryClient }) {
    const result = await memoryClient.buildContext({
      agent_id: args.agent_id as string,
      task_description: args.task_description as string,
      project_id: args.project_id as string,
      max_tokens: args.max_tokens as number,
    });

    if (!result.context) {
      return { content: [{ type: "text", text: "No relevant context found for this task." }] };
    }
    return { content: [{ type: "text", text: `Context from memory:\n\n${result.context}` }] };
  },

  async memory_list(args, { memoryClient }) {
    const results = await memoryClient.getAgentMemories(
      args.agent_id as string,
      args.memory_type as string,
      (args.limit as number) || 50
    );

    if (!results || results.length === 0) {
      return { content: [{ type: "text", text: "No memories found for this agent." }] };
    }

    let formatted = `Memories for agent ${args.agent_id}:\n\n`;
    results.forEach((mem: any, i: number) => {
      const content = mem.content.length > 200 ? mem.content.slice(0, 200) + "..." : mem.content;
      formatted += `${i + 1}. [${mem.memory_type}] (importance: ${(mem.importance || 0).toFixed(2)})\n`;
      formatted += `   ${content}\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async memory_get(args, { memoryClient }) {
    const result = await memoryClient.getMemory(args.memory_id as string);

    let formatted = `Memory Details:\n`;
    formatted += `ID: ${result.id}\n`;
    formatted += `Type: ${result.memory_type}\n`;
    formatted += `Scope: ${result.scope}\n`;
    formatted += `Level: ${result.hierarchy_level || 'raw'}\n`;
    formatted += `Importance: ${result.importance?.toFixed(2) || 'N/A'}\n`;
    formatted += `Relevance: ${result.relevance_score?.toFixed(2) || 'N/A'}\n`;
    formatted += `Created: ${result.created_at}\n`;
    formatted += `\nContent:\n${result.content}`;

    if (result.metadata && Object.keys(result.metadata).length > 0) {
      formatted += `\n\nMetadata: ${JSON.stringify(result.metadata, null, 2)}`;
    }

    return { content: [{ type: "text", text: formatted }] };
  },

  async memory_delete(args, { memoryClient }) {
    const result = await memoryClient.deleteMemory(args.memory_id as string);
    return {
      content: [{
        type: "text",
        text: `Memory deleted.\nID: ${args.memory_id}\nStatus: ${result.status || 'deleted'}`,
      }],
    };
  },

  // ==========================================================================
  // Graph
  // ==========================================================================

  async graph_register_agent(args, { memoryClient }) {
    const result = await memoryClient.registerAgent({
      agent_id: args.agent_id as string,
      name: args.name as string,
      agent_type: args.agent_type as string,
    });
    return {
      content: [{
        type: "text",
        text: `Agent registered.\nStatus: ${result.status}\nID: ${result.agent_id}`,
      }],
    };
  },

  async graph_register_project(args, { memoryClient }) {
    const result = await memoryClient.registerProject({
      project_id: args.project_id as string,
      name: args.name as string,
    });
    return {
      content: [{
        type: "text",
        text: `Project registered.\nStatus: ${result.status}\nID: ${result.project_id}`,
      }],
    };
  },

  async graph_assign_agent_project(args, { memoryClient }) {
    const result = await memoryClient.assignAgentToProject({
      agent_id: args.agent_id as string,
      project_id: args.project_id as string,
      role: args.role as string,
    });
    return {
      content: [{
        type: "text",
        text: `Agent assigned to project.\nAgent: ${result.agent_id}\nProject: ${result.project_id}`,
      }],
    };
  },

  async graph_register_skill(args, { memoryClient }) {
    const result = await memoryClient.registerSkill({
      skill_id: args.skill_id as string,
      name: args.name as string,
      skill_type: args.skill_type as string,
    });
    return {
      content: [{
        type: "text",
        text: `Skill registered.\nStatus: ${result.status}\nID: ${result.skill_id}`,
      }],
    };
  },

  async graph_find_agents(args, { memoryClient }) {
    const results = await memoryClient.findAgentsForTask({
      required_skill_ids: args.required_skill_ids as string[],
      project_id: args.project_id as string,
      prefer_experienced: args.prefer_experienced as boolean,
      limit: args.limit as number,
    });

    if (!results || results.length === 0) {
      return { content: [{ type: "text", text: "No matching agents found." }] };
    }

    let formatted = `Matching Agents (${results.length})\n`;
    formatted += `=========================\n\n`;
    results.forEach((agent: any, i: number) => {
      formatted += `${i + 1}. ${agent.agent_name}\n`;
      formatted += `   ID: ${agent.agent_id}\n`;
      formatted += `   Type: ${agent.agent_type}\n`;
      formatted += `   Matching Skills: ${agent.matching_skills}\n`;
      formatted += `   Avg Proficiency: ${agent.avg_proficiency?.toFixed(2) || 'N/A'}\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async graph_sync_memories(args, { memoryClient }) {
    const result = await memoryClient.syncProjectMemories(args.project_id as string);

    let formatted = `Project Memories Synced\n`;
    formatted += `======================\n\n`;
    formatted += `Project: ${result.project_id}\n`;
    formatted += `Memories Synced: ${result.memories_synced}\n`;
    formatted += `Already Linked: ${result.already_linked}\n`;
    formatted += `\n${result.message}`;
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Working Memory
  // ==========================================================================

  async working_memory_get(args, { memoryClient }) {
    const result = await memoryClient.getWorkingMemory(args.context_id as string);

    if (!result.items || result.items.length === 0) {
      return { content: [{ type: "text", text: `No working memory for context: ${args.context_id}` }] };
    }

    let formatted = `Working Memory [${args.context_id}] (${result.count}/${result.max_items} items):\n\n`;
    result.items.forEach((item: any, i: number) => {
      formatted += `${i + 1}. ${item.content}\n`;
      if (item.created_at) formatted += `   Created: ${item.created_at}\n`;
      formatted += "\n";
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async working_memory_add(args, { memoryClient }) {
    const result = await memoryClient.addWorkingMemory({
      context_id: args.context_id as string,
      content: args.content as string,
      agent_id: args.agent_id as string,
      project_id: args.project_id as string,
      ttl_seconds: args.ttl_seconds as number,
    });
    return {
      content: [{
        type: "text",
        text: `Working memory updated.\nContext: ${args.context_id}\nID: ${result.id}`,
      }],
    };
  },

  async working_memory_clear(args, { memoryClient }) {
    const result = await memoryClient.clearWorkingMemory(args.context_id as string);
    return {
      content: [{
        type: "text",
        text: `Working memory cleared.\nContext: ${args.context_id}\nItems removed: ${result.items_cleared}`,
      }],
    };
  },

  // ==========================================================================
  // Stream
  // ==========================================================================

  async stream_capture(args, { memoryClient }) {
    const result = await memoryClient.captureStream({
      session_id: args.session_id as string,
      content: args.content as string,
      direction: args.direction as string,
      agent_id: args.agent_id as string,
      importance: args.importance as number,
    });
    return {
      content: [{
        type: "text",
        text: `Captured to stream.\nSession: ${args.session_id}\nID: ${result.id}`,
      }],
    };
  },

  async stream_stats(_args, { memoryClient }) {
    const result = await memoryClient.getStreamStats();
    return {
      content: [{
        type: "text",
        text: `Memory Stream Stats:\n- Total: ${result.total}\n- Unprocessed: ${result.unprocessed}\n- Consolidated: ${result.consolidated}\n- Forgotten: ${result.forgotten}\n- Avg Importance: ${(result.avg_importance || 0).toFixed(2)}`,
      }],
    };
  },

  async stream_process(args, { memoryClient }) {
    const result = await memoryClient.processStream(args.batch_size as number);

    let formatted = `Stream Processing Complete\n`;
    formatted += `==========================\n\n`;
    formatted += `Processed: ${result.processed}\n`;
    formatted += `Promoted to Memories: ${result.promoted}\n`;
    formatted += `Discarded: ${result.discarded}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async stream_forget(args, { memoryClient }) {
    const result = await memoryClient.forgetStream(
      args.threshold_days as number,
      args.min_importance as number
    );
    return {
      content: [{
        type: "text",
        text: `Stream Forget Complete\n\nForgotten: ${result.forgotten} items`,
      }],
    };
  },

  async stream_consolidate(args, { memoryClient }) {
    const result = await memoryClient.consolidateSession(args.session_id as string);

    let formatted = `Session Consolidation Complete\n`;
    formatted += `==============================\n\n`;
    formatted += `Session: ${args.session_id}\n`;
    formatted += `Items Consolidated: ${result.consolidated}\n`;
    formatted += `Summary Created: ${result.summary_created ? 'Yes' : 'No'}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async stream_get_session(args, { memoryClient }) {
    const result = await memoryClient.getSessionItems(
      args.session_id as string,
      args.limit as number
    );

    const items = result.items || [];
    if (!items || items.length === 0) {
      return { content: [{ type: "text", text: `No items found for session ${args.session_id}` }] };
    }

    let formatted = `Session Items: ${args.session_id}\n`;
    formatted += `Count: ${result.count}\n\n`;
    items.forEach((item: any, i: number) => {
      formatted += `${i + 1}. [${item.direction}] (importance: ${item.importance?.toFixed(2) || 'N/A'})\n`;
      formatted += `   ${item.content?.slice(0, 150)}${item.content?.length > 150 ? '...' : ''}\n`;
      if (item.timestamp) formatted += `   Time: ${item.timestamp}\n`;
      formatted += `\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async stream_get_recent(args, { memoryClient }) {
    const result = await memoryClient.getRecentStreamItems(
      args.agent_id as string,
      args.limit as number,
      args.include_forgotten as boolean
    );

    const items = result.items || [];
    if (!items || items.length === 0) {
      return { content: [{ type: "text", text: "No recent stream items found." }] };
    }

    let formatted = `Recent Stream Items (${result.count})\n`;
    formatted += `============================\n\n`;
    items.forEach((item: any, i: number) => {
      formatted += `${i + 1}. [${item.direction}] Session: ${item.session_id || 'N/A'}\n`;
      formatted += `   Importance: ${item.importance?.toFixed(2) || 'N/A'}`;
      if (item.processed) formatted += ` | Processed`;
      if (item.consolidated) formatted += ` | Consolidated`;
      if (item.forgotten) formatted += ` | Forgotten`;
      formatted += `\n`;
      formatted += `   ${item.content?.slice(0, 150)}${item.content?.length > 150 ? '...' : ''}\n`;
      if (item.timestamp) formatted += `   Time: ${item.timestamp}\n`;
      formatted += `\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // User / Registration
  // ==========================================================================

  async user_register(args, { cpUrl }) {
    const email = args.email as string;
    const password = args.password as string;
    const firstName = args.first_name as string;
    const lastName = args.last_name as string;
    const orgName = args.org_name as string;
    const orgSlug = args.org_slug as string;

    try {
      const registerRes = await axios.post(`${cpUrl}/api/v1/auth/register`, {
        email, password, first_name: firstName, last_name: lastName,
        org_name: orgName, org_slug: orgSlug,
      });

      const data = registerRes.data;

      // Handle new RegisterPendingResponse (email verification required)
      if (data.pending || data.message) {
        const text = `Registro iniciado com sucesso! Verifique seu email (${email}) para ativar a conta. Apos confirmacao, faca login e obtenha sua API key.`;
        return { content: [{ type: "text", text }] };
      }

      // Fallback: legacy response format (direct registration without email verification)
      let text = `Registration successful!\n`;
      if (data.user) text += `User: ${data.user.name} (${data.user.email})\n`;
      if (data.organization) {
        text += `Organization: ${data.organization.name} (${data.organization.slug})\n`;
        if (data.organization.api_key) text += `API Key: ${data.organization.api_key}\n`;
        text += `Tenant DB: frinus_tenant_${data.organization.slug.replace(/-/g, '_')}\n`;
      }
      text += `\nUse the returned API key in FRINUS_API_KEY to authenticate.`;
      return { content: [{ type: "text", text }] };
    } catch (error: any) {
      const status = error?.response?.status;
      const detail = error?.response?.data?.detail;
      let message: string;
      if (status && status >= 400 && status < 500) {
        message = typeof detail === 'string' ? detail : `Client error (HTTP ${status}): ${JSON.stringify(detail) || 'Bad request'}`;
      } else {
        message = typeof detail === 'string' ? detail : error.message || 'Registration failed';
      }
      return {
        content: [{ type: "text", text: `Registration failed: ${message}` }],
        isError: true,
      };
    }
  },

  async user_get_context(args, { memoryClient }) {
    const projectId = args.project_id as string;
    const taskDescription = args.task_description as string || "general context";
    const userEmail = args.user_email as string;

    const result = await memoryClient.getProjectContext(projectId, taskDescription, userEmail);

    let formatted = `Context for project ${projectId}:\n\n`;
    if (result.context) {
      formatted += result.context;
    } else if (result.memories && result.memories.length > 0) {
      result.memories.forEach((mem: any, i: number) => {
        formatted += `${i + 1}. [${mem.memory_type}] ${mem.content}\n\n`;
      });
    } else {
      formatted += "No relevant context found.";
    }
    if (userEmail) formatted += `\n\nUser: ${userEmail}`;
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Session Management
  // ==========================================================================

  async session_start(args, { memoryClient, capture }) {
    const projectId = args.project_id as string;
    if (!projectId) {
      return {
        content: [{ type: "text", text: "Error: project_id is required for session_start" }],
        isError: true,
      };
    }

    try {
      const result = await memoryClient.startSession({
        project_id: projectId,
        agent_id: args.agent_id as string,
        parent_session_id: args.parent_session_id as string,
      });

      // Replace auto-generated session ID with the formal one
      capture.sessionId = result.session_id;

      let msg = `Session started: ${result.session_id}\n`;
      msg += `Project: ${projectId}\n`;
      if (result.parent_session_id) msg += `Parent session: ${result.parent_session_id}\n`;
      msg += "\n";

      if (result.agent_context) msg += `## Agent Context\n${result.agent_context}\n\n`;
      if (result.project_context) msg += `## Project Context\n${result.project_context}\n\n`;
      if (result.permissions && result.permissions.length > 0) {
        msg += `## Your Permissions\n`;
        for (const p of result.permissions) {
          const resource = p.resource || p.project_name || p.project_id || "unknown";
          const permission = p.actions
            ? (Array.isArray(p.actions) ? p.actions.join(", ") : p.actions)
            : p.permission || "none";
          msg += `- ${resource}: ${permission}\n`;
        }
      }
      return { content: [{ type: "text", text: msg }] };
    } catch (error: any) {
      const authError = handleApiError(error);
      if (authError) return authError;
      if (error?.response?.status === 400) {
        return {
          content: [{ type: "text", text: `Validation error: ${error.response.data?.detail || "invalid request"}` }],
          isError: true,
        };
      }
      throw error;
    }
  },

  async session_end(args, { memoryClient }) {
    try {
      const result = await memoryClient.endSession(args.session_id as string);
      return {
        content: [{
          type: "text",
          text: `Session ended: ${args.session_id}\nStatus: ${result.status || 'ended'}`,
        }],
      };
    } catch (error: any) {
      const authError = handleApiError(error);
      if (authError) return authError;
      throw error;
    }
  },

  async session_context(args, { memoryClient }) {
    const result = await memoryClient.getSessionContext({
      session_id: args.session_id as string,
      query: args.query as string,
      agent_id: args.agent_id as string,
      project_id: args.project_id as string,
      max_working_memory: args.max_working_memory as number,
      max_long_term: args.max_long_term as number,
      include_topics: args.include_topics as boolean,
    });

    let formatted = `Session Context: ${args.session_id}\n`;
    formatted += `=====================================\n\n`;

    if (result.topics && result.topics.length > 0) {
      formatted += `Topics: ${result.topics.join(', ')}\n\n`;
    }
    if (result.working_memory && result.working_memory.length > 0) {
      formatted += `Working Memory (${result.working_memory.length} items):\n`;
      result.working_memory.forEach((item: any, i: number) => {
        formatted += `  ${i + 1}. ${item.content?.slice(0, 100)}...\n`;
      });
      formatted += `\n`;
    }
    if (result.long_term_memories && result.long_term_memories.length > 0) {
      formatted += `Long-Term Memories (${result.long_term_memories.length} items):\n`;
      result.long_term_memories.forEach((mem: any, i: number) => {
        formatted += `  ${i + 1}. [${mem.memory_type}] ${mem.content?.slice(0, 100)}...\n`;
      });
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async session_summary(args, { memoryClient }) {
    const result = await memoryClient.getSessionSummary(args.session_id as string);

    let formatted = `Session Summary: ${args.session_id}\n`;
    formatted += `===================================\n\n`;
    formatted += `Item Count: ${result.item_count || 0}\n`;
    if (result.main_topics && result.main_topics.length > 0) {
      formatted += `Main Topics: ${result.main_topics.join(', ')}\n`;
    }
    if (result.recent_items && result.recent_items.length > 0) {
      formatted += `\nRecent Items:\n`;
      result.recent_items.forEach((item: any, i: number) => {
        formatted += `  ${i + 1}. [${item.direction}] ${item.content?.slice(0, 100)}...\n`;
      });
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async session_clear(args, { memoryClient }) {
    const result = await memoryClient.clearSession(args.session_id as string);
    return {
      content: [{
        type: "text",
        text: `Session cleared: ${args.session_id}\nItems removed: ${result.items_cleared || 0}`,
      }],
    };
  },

  // ==========================================================================
  // Dynamic Relevance (Cycle 12)
  // ==========================================================================

  async memory_reinforce(args, { memoryClient }) {
    const result = await memoryClient.reinforceMemory(args.memory_id as string, args.boost as number);
    return {
      content: [{
        type: "text",
        text: `Memory reinforced.\nID: ${args.memory_id}\nNew relevance: ${result.relevance_score?.toFixed(3) || 'updated'}`,
      }],
    };
  },

  async memory_weaken(args, { memoryClient }) {
    const result = await memoryClient.weakenMemory(args.memory_id as string, args.penalty as number);
    return {
      content: [{
        type: "text",
        text: `Memory weakened.\nID: ${args.memory_id}\nNew relevance: ${result.relevance_score?.toFixed(3) || 'updated'}`,
      }],
    };
  },

  async memory_trending(args, { memoryClient }) {
    const result = await memoryClient.getTrendingMemories(args.project_id as string, args.limit as number);

    const trendingItems = result.memories || [];
    if (!trendingItems || trendingItems.length === 0) {
      return { content: [{ type: "text", text: "No trending memories found." }] };
    }

    let formatted = `Trending memories (${result.direction || 'rising'}):\n\n`;
    trendingItems.forEach((item: any, i: number) => {
      const mem = item.memory || item;
      const trend = item.relevance_trend;
      const dynImportance = item.dynamic_importance;
      const usageCount = item.usage_count_7d;

      formatted += `${i + 1}. [${mem.memory_type}] (importance: ${dynImportance?.toFixed(2) || mem.importance?.toFixed(2) || 'N/A'})\n`;
      formatted += `   Trend: ${trend?.toFixed(2) || 'N/A'} | Usage (7d): ${usageCount || 0}\n`;
      formatted += `   ${mem.content?.slice(0, 150)}...\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Active Forgetting (Cycle 12)
  // ==========================================================================

  async consolidation_detect_conflicts(args, { memoryClient }) {
    const result = await memoryClient.detectConflicts(
      args.project_id as string, args.similarity_threshold as number, args.limit as number
    );

    const conflicts = result.conflicts || [];
    if (!conflicts || conflicts.length === 0) {
      return { content: [{ type: "text", text: "No conflicts detected." }] };
    }

    let formatted = `Detected ${result.conflicts_found || conflicts.length} potential conflicts:\n\n`;
    conflicts.forEach((conflict: any, i: number) => {
      formatted += `${i + 1}. Similarity: ${conflict.similarity?.toFixed(2)}\n`;
      formatted += `   Memory 1: ${conflict.memory1?.content?.slice(0, 100)}...\n`;
      formatted += `   Memory 2: ${conflict.memory2?.content?.slice(0, 100)}...\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async consolidation_detect_redundant(args, { memoryClient }) {
    const result = await memoryClient.detectRedundant(
      args.project_id as string, args.similarity_threshold as number, args.limit as number
    );

    const groups = result.groups || [];
    if (!groups || groups.length === 0) {
      return { content: [{ type: "text", text: "No redundant memories detected." }] };
    }

    let formatted = `Detected ${result.groups_found || groups.length} redundant memory groups (${result.total_redundant || 0} total memories):\n\n`;
    groups.forEach((group: any, i: number) => {
      formatted += `${i + 1}. Group similarity: ${group.avg_similarity?.toFixed(2) || 'N/A'}\n`;
      formatted += `   Memories: ${group.memory_ids?.length || 0}\n`;
      if (group.memories && group.memories.length > 0) {
        formatted += `   Preview: ${group.memories[0]?.content?.slice(0, 100)}...\n`;
      }
      formatted += `\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async consolidation_resolve_conflict(args, { memoryClient }) {
    const result = await memoryClient.resolveConflict({
      keep_id: args.keep_id as string,
      supersede_id: args.supersede_id as string,
      resolution_note: args.resolution_note as string,
    });
    return {
      content: [{
        type: "text",
        text: `Conflict resolved.\nKept: ${result.keep_id || args.keep_id}\nSuperseded: ${result.supersede_id || args.supersede_id}\nNote: ${args.resolution_note}`,
      }],
    };
  },

  async consolidation_mark_obsolete(args, { memoryClient }) {
    const result = await memoryClient.markObsolete(
      args.memory_id as string, args.reason as string, args.superseded_by as string
    );
    return {
      content: [{
        type: "text",
        text: `Memory marked obsolete.\nID: ${args.memory_id}\nReason: ${args.reason}\nSuperseded by: ${args.superseded_by || 'none'}\nSuccess: ${result.success}`,
      }],
    };
  },

  // ==========================================================================
  // Hierarchical Memory (Cycle 12)
  // ==========================================================================

  async hierarchy_stats(args, { memoryClient }) {
    const result = await memoryClient.getHierarchyStats(args.project_id as string);
    const levels = result.levels || {};
    return {
      content: [{
        type: "text",
        text: `Hierarchy Statistics:\n- Raw: ${levels.raw?.count || 0}\n- Chunk: ${levels.chunk?.count || 0}\n- Summary: ${levels.summary?.count || 0}\n- Abstract: ${levels.abstract?.count || 0}\n- Total: ${result.total || 0}\n- Consolidated: ${result.total_consolidated || 0}`,
      }],
    };
  },

  async hierarchy_auto_consolidate(args, { memoryClient }) {
    const result = await memoryClient.autoConsolidate(
      args.project_id as string, args.source_level as string, args.limit as number
    );

    const summaries = result.summaries || [];
    let formatted = `Auto-consolidation complete.\n`;
    formatted += `Source Level: ${result.source_level || 'raw'}\n`;
    formatted += `Summaries Created: ${result.summaries_created || 0}\n`;

    if (summaries.length > 0) {
      formatted += `\nCreated Summaries:\n`;
      summaries.forEach((summary: any, i: number) => {
        formatted += `${i + 1}. ID: ${summary.id} (sources: ${summary.source_count || 0})\n`;
        formatted += `   ${summary.content?.slice(0, 100)}...\n`;
      });
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async hierarchy_consolidate(args, { memoryClient }) {
    const result = await memoryClient.hierarchyConsolidate({
      memory_ids: args.memory_ids as string[],
      summary_content: args.summary_content as string,
      project_id: args.project_id as string,
      agent_id: args.agent_id as string,
    });
    return {
      content: [{
        type: "text",
        text: `Consolidation complete.\nSummary ID: ${result.summary_id}\nLevel: ${result.hierarchy_level}\nSource Memories: ${result.source_count}\nContent Preview: ${result.content_preview || result.summary_content?.slice(0, 100)}...`,
      }],
    };
  },

  async hierarchy_get_tree(args, { memoryClient }) {
    const result = await memoryClient.getHierarchyTree(args.memory_id as string);

    let formatted = `Hierarchy Tree for ${args.memory_id}:\n\n`;

    if (result.memory) {
      formatted += `Current Memory:\n`;
      formatted += `  Level: ${result.memory.hierarchy_level || 'raw'}\n`;
      formatted += `  Content: ${result.memory.content?.slice(0, 100)}...\n\n`;
    }

    if (result.parents && result.parents.length > 0) {
      formatted += `Parents (${result.parents.length}):\n`;
      result.parents.forEach((p: any, i: number) => {
        formatted += `  ${i + 1}. [${p.hierarchy_level}] ${p.content?.slice(0, 80)}...\n`;
      });
      formatted += '\n';
    }

    if (result.children && result.children.length > 0) {
      formatted += `Children (${result.children.length}):\n`;
      result.children.forEach((c: any, i: number) => {
        formatted += `  ${i + 1}. [${c.hierarchy_level}] ${c.content?.slice(0, 80)}...\n`;
      });
    }

    if (!result.parents?.length && !result.children?.length) {
      formatted += 'No hierarchy relationships found.';
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async hierarchy_promote(args, { memoryClient }) {
    const result = await memoryClient.promoteMemory(args.memory_id as string, args.target_level as string);
    return {
      content: [{
        type: "text",
        text: `Memory promoted.\nID: ${args.memory_id}\nNew Level: ${result.hierarchy_level || args.target_level}\nPrevious Level: ${result.previous_level || 'unknown'}`,
      }],
    };
  },

  // ==========================================================================
  // Selective Attention (Cycle 12)
  // ==========================================================================

  async attention_profiles(_args, { memoryClient }) {
    const result = await memoryClient.getAttentionProfiles();

    let formatted = "Attention Profiles:\n\n";
    const defaultProfiles = result.default_profiles || [];
    const customProfiles = result.custom_profiles || [];

    if (defaultProfiles.length > 0) {
      formatted += "Default Profiles:\n";
      defaultProfiles.forEach((profile: any) => {
        formatted += `\n${profile.name} (${profile.task_type}):\n`;
        formatted += `  procedural: ${profile.weights.procedural}, semantic: ${profile.weights.semantic}, episodic: ${profile.weights.episodic}\n`;
        if (profile.description) formatted += `  description: ${profile.description}\n`;
      });
    }

    if (customProfiles.length > 0) {
      formatted += "\nCustom Profiles:\n";
      customProfiles.forEach((profile: any) => {
        formatted += `\n${profile.name} (${profile.task_type}):\n`;
        formatted += `  procedural: ${profile.weights.procedural}, semantic: ${profile.weights.semantic}, episodic: ${profile.weights.episodic}\n`;
        if (profile.description) formatted += `  description: ${profile.description}\n`;
      });
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async search_with_attention(args, { memoryClient, resolvedUserId }) {
    const results = await memoryClient.searchWithAttention({
      query_text: args.query_text as string,
      project_id: args.project_id as string,
      task_type: args.task_type as string,
      limit: args.limit as number,
      agent_id: (args.agent_id as string) || undefined,
      user_id: (args.user_id as string) || resolvedUserId || undefined,
    });

    if (!results || !results.memories || results.memories.length === 0) {
      return { content: [{ type: "text", text: "No memories found." }] };
    }

    let formatted = `Search results (task: ${results.task_type_used || args.task_type || 'general'}):\n`;
    if (results.weights_used) {
      formatted += `Weights: procedural=${results.weights_used.procedural}, semantic=${results.weights_used.semantic}, episodic=${results.weights_used.episodic}\n`;
    }
    formatted += `\n`;
    results.memories.forEach((mem: any, i: number) => {
      formatted += `${i + 1}. [${mem.memory_type}] (score: ${mem.weighted_score?.toFixed(2) || mem.similarity?.toFixed(2)})\n`;
      formatted += `   ${mem.content?.slice(0, 200)}...\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Meta-Cognition (Cycle 12)
  // ==========================================================================

  async metacognition_evaluate(args, { memoryClient }) {
    const result = await memoryClient.evaluateMemories(
      args.agent_id as string, args.project_id as string, args.limit as number
    );
    return {
      content: [{
        type: "text",
        text: `Evaluation complete.\nMemories evaluated: ${result.evaluated || 0}\nAverage score: ${result.average_score?.toFixed(2) || 'N/A'}\nFlagged for review: ${result.flagged || 0}`,
      }],
    };
  },

  async metacognition_report(args, { memoryClient }) {
    const result = await memoryClient.getMetacognitionReport(args.agent_id as string);
    return {
      content: [{
        type: "text",
        text: `Meta-Cognition Report for ${args.agent_id}:\n- Precision: ${result.precision?.toFixed(2) || 'N/A'}\n- Freshness: ${result.freshness?.toFixed(2) || 'N/A'}\n- Consistency: ${result.consistency?.toFixed(2) || 'N/A'}\n- Overall Score: ${result.overall_score?.toFixed(2) || 'N/A'}\n- Total Memories: ${result.total_memories || 0}`,
      }],
    };
  },

  async metacognition_flagged(args, { memoryClient }) {
    const result = await memoryClient.getFlaggedMemories({
      project_id: args.project_id as string,
      agent_id: args.agent_id as string,
      min_issues: args.min_issues as number,
      limit: args.limit as number,
    });

    const flaggedMemories = result.flagged_memories || [];
    if (!flaggedMemories || flaggedMemories.length === 0) {
      return { content: [{ type: "text", text: "No flagged memories found." }] };
    }

    let formatted = `Flagged Memories (${result.total_count || flaggedMemories.length}):\n\n`;
    if (result.by_reason && Object.keys(result.by_reason).length > 0) {
      formatted += `By Reason:\n`;
      for (const [reason, count] of Object.entries(result.by_reason)) {
        formatted += `  ${reason}: ${count}\n`;
      }
      formatted += `\n`;
    }

    flaggedMemories.forEach((mem: any, i: number) => {
      formatted += `${i + 1}. [${mem.memory_type}] ID: ${mem.id}\n`;
      formatted += `   Issues: `;
      const issues: string[] = [];
      if (mem.precision_issue) issues.push('low precision');
      if (mem.freshness_issue) issues.push('outdated');
      if (mem.consistency_issue) issues.push('inconsistent');
      formatted += issues.length > 0 ? issues.join(', ') : 'flagged for review';
      formatted += `\n   Score: ${mem.overall_score?.toFixed(2) || 'N/A'}\n`;
      formatted += `   Content: ${mem.content?.slice(0, 100)}...\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Sleep (Cycle 12)
  // ==========================================================================

  async sleep_run(args, { memoryClient }) {
    const result = await memoryClient.runSleepCycle(args.project_id as string, args.phases as string[]);

    let formatted = `Sleep Cycle ${result.status || 'completed'}:\n`;
    formatted += `Cycle ID: ${result.cycle_id}\n`;
    formatted += `Project: ${result.project_id}\n`;
    formatted += `Duration: ${result.duration_seconds?.toFixed(2)}s\n`;
    formatted += `Total Memories Processed: ${result.total_memories_processed || 0}\n\n`;

    formatted += `Results:\n`;
    formatted += `- Flagged for Review: ${result.memories_flagged_for_review || 0}\n`;
    formatted += `- Conflicts Detected: ${result.conflicts_detected || 0}\n`;
    formatted += `- Conflicts Resolved: ${result.conflicts_resolved || 0}\n`;
    formatted += `- Memories Consolidated: ${result.memories_consolidated || 0}\n`;
    formatted += `- Memories Marked Obsolete: ${result.memories_marked_obsolete || 0}\n`;
    formatted += `- Relevance Adjustments: ${result.relevance_adjustments || 0}\n`;
    formatted += `- Transfer Suggestions: ${result.transfer_suggestions || 0}\n`;
    formatted += `- Synced to Graph: ${result.memories_synced_to_graph || 0}\n`;

    if (result.phases_completed && result.phases_completed.length > 0) {
      formatted += `\nPhases Completed: ${result.phases_completed.join(', ')}\n`;
    }

    if (result.errors && result.errors.length > 0) {
      formatted += `\nErrors: ${result.errors.length}\n`;
      result.errors.forEach((err: any, i: number) => {
        formatted += `  ${i + 1}. ${err}\n`;
      });
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async sleep_report(_args, { memoryClient }) {
    const result = await memoryClient.getSleepReport();
    return {
      content: [{
        type: "text",
        text: `Sleep Report:\n- Last Run: ${result.last_run || 'Never'}\n- Status: ${result.status || 'Unknown'}\n- Total Memories: ${result.total_memories || 0}\n- Pending Consolidation: ${result.pending_consolidation || 0}`,
      }],
    };
  },

  async sleep_config(_args, { memoryClient }) {
    const result = await memoryClient.getSleepConfig();
    return {
      content: [{
        type: "text",
        text: `Sleep Configuration:\n${JSON.stringify(result, null, 2)}`,
      }],
    };
  },

  // ==========================================================================
  // Transfer Learning (Cycle 12)
  // ==========================================================================

  async transfer_find_candidates(args, { memoryClient }) {
    const result = await memoryClient.findTransferable(
      args.source_project_id as string, args.target_project_id as string, args.limit as number
    );

    const candidates = Array.isArray(result) ? result : (result.candidates || result.memories || []);
    if (!candidates || candidates.length === 0) {
      return { content: [{ type: "text", text: "No transferable memories found." }] };
    }

    let formatted = `Found ${candidates.length} transferable memories:\n`;
    formatted += `Source Project: ${args.source_project_id}\n`;
    formatted += `Target Project: ${args.target_project_id}\n\n`;

    candidates.forEach((mem: any, i: number) => {
      formatted += `${i + 1}. [${mem.memory_type}] (transfer score: ${mem.transfer_score?.toFixed(2) || 'N/A'})\n`;
      formatted += `   ${mem.content_preview || mem.content?.slice(0, 150) || 'No content'}...\n`;
      formatted += `   ID: ${mem.memory_id || mem.id}\n`;
      formatted += `   Original Importance: ${mem.original_importance?.toFixed(2) || 'N/A'}\n`;
      formatted += `   Estimated Relevance: ${mem.estimated_relevance?.toFixed(2) || 'N/A'}\n`;
      formatted += `   Recommended: ${mem.recommended ? 'Yes' : 'No'}\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async transfer_memory(args, { memoryClient }) {
    const result = await memoryClient.transferMemory(
      args.source_memory_id as string, args.target_project_id as string, args.context_query as string
    );
    return {
      content: [{
        type: "text",
        text: `Memory transferred.\nSource: ${args.source_memory_id}\nNew ID: ${result.new_memory_id || result.id}\nTarget Project: ${args.target_project_id}`,
      }],
    };
  },

  async transfer_bulk(args, { memoryClient }) {
    const result = await memoryClient.transferBulk({
      memory_ids: args.memory_ids as string[],
      target_project_id: args.target_project_id as string,
      context_similarity: args.context_similarity as number,
      transfer_note: args.transfer_note as string,
    });

    let formatted = `Bulk transfer complete.\n`;
    formatted += `Target Project: ${args.target_project_id}\n`;
    formatted += `Requested: ${(args.memory_ids as string[]).length}\n`;
    formatted += `Transferred: ${result.total_transferred || 0}\n`;
    formatted += `Failed: ${result.total_failed || 0}\n`;

    if (result.transferred && result.transferred.length > 0) {
      formatted += `\nTransferred Memories:\n`;
      result.transferred.forEach((t: any, i: number) => {
        formatted += `  ${i + 1}. ${t.source_id} -> ${t.new_id} (importance: ${t.adapted_importance?.toFixed(2)})\n`;
      });
    }

    if (result.failed && result.failed.length > 0) {
      formatted += `\nFailed IDs: ${result.failed.join(', ')}`;
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async transfer_adapt(args, { memoryClient }) {
    const result = await memoryClient.transferAdapt({
      memory_id: args.source_memory_id as string,
      target_project_id: args.target_project_id as string,
      context_query: args.context_query as string,
    });

    let formatted = `Transfer Adaptation Preview (dry-run):\n\n`;
    formatted += `Source Memory: ${args.source_memory_id}\n`;
    formatted += `Target Project: ${args.target_project_id}\n`;
    formatted += `Context: ${args.context_query || 'None specified'}\n\n`;
    formatted += `Original Importance: ${result.original_importance?.toFixed(3) || 'N/A'}\n`;
    formatted += `Adapted Importance: ${result.adapted_importance?.toFixed(3) || 'N/A'}\n`;
    formatted += `Context Similarity: ${result.context_similarity?.toFixed(3) || 'N/A'}\n`;
    formatted += `Memory Type: ${result.memory_type || 'N/A'}\n`;
    formatted += `Source Scope: ${result.source_scope || 'N/A'}\n`;
    formatted += `Target Scope: ${result.target_scope || 'N/A'}\n`;
    if (result.content_preview) formatted += `\nContent Preview: ${result.content_preview}`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async transfer_history(args, { memoryClient }) {
    const result = await memoryClient.getTransferHistory(args.memory_id as string);

    if (!result) {
      return { content: [{ type: "text", text: `Memory ${args.memory_id} not found` }] };
    }

    let formatted = `Transfer History for ${args.memory_id}:\n\n`;
    formatted += `Is Transferred: ${result.is_transferred ? 'Yes' : 'No'}\n`;
    formatted += `Memory Type: ${result.memory_type || 'N/A'}\n`;
    formatted += `Scope: ${result.scope || 'N/A'}\n`;
    formatted += `Current Importance: ${result.current_importance?.toFixed(3) || 'N/A'}\n\n`;

    if (result.is_transferred) {
      formatted += `Transfer Details:\n`;
      formatted += `  Source Memory ID: ${result.source_memory_id || 'N/A'}\n`;
      formatted += `  Source Project ID: ${result.source_project_id || 'N/A'}\n`;
      formatted += `  Source Agent ID: ${result.source_agent_id || 'N/A'}\n`;
      formatted += `  Original Importance: ${result.original_importance?.toFixed(3) || 'N/A'}\n`;
      formatted += `  Adapted Importance: ${result.adapted_importance?.toFixed(3) || 'N/A'}\n`;
      formatted += `  Context Similarity: ${result.context_similarity?.toFixed(3) || 'N/A'}\n`;
      formatted += `  Transferred At: ${result.transferred_at || 'N/A'}\n`;
      if (result.transfer_note) formatted += `  Transfer Note: ${result.transfer_note}\n`;
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Project Management
  // ==========================================================================

  async project_list(_args, { memoryClient }) {
    const projects = await memoryClient.listProjects();

    if (!projects || projects.length === 0) {
      return { content: [{ type: "text", text: "No projects found." }] };
    }

    let formatted = `Available Projects (${projects.length}):\n\n`;
    projects.forEach((p: any, i: number) => {
      formatted += `${i + 1}. ${p.name}\n`;
      formatted += `   ID: ${p.project_id}\n`;
      if (p.description) formatted += `   Description: ${p.description}\n`;
      formatted += `   Memories: ${p.memory_count || 0}\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async project_get(args, { memoryClient }) {
    const project = await memoryClient.getProject(args.project_id as string);

    let formatted = `Project Details:\n\n`;
    formatted += `Name: ${project.name}\n`;
    formatted += `ID: ${project.project_id}\n`;
    if (project.description) formatted += `Description: ${project.description}\n`;
    formatted += `Memories: ${project.memory_count || 0}\n`;
    if (project.created_at) formatted += `Created: ${project.created_at}\n`;
    if (project.updated_at) formatted += `Updated: ${project.updated_at}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async project_search(args, { memoryClient }) {
    const projects = await memoryClient.searchProjects(args.name as string);

    if (!projects || projects.length === 0) {
      return { content: [{ type: "text", text: `No projects found matching "${args.name}"` }] };
    }

    let formatted = `Projects matching "${args.name}" (${projects.length}):\n\n`;
    projects.forEach((p: any, i: number) => {
      formatted += `${i + 1}. ${p.name}\n`;
      formatted += `   ID: ${p.project_id}\n`;
      if (p.description) formatted += `   Description: ${p.description}\n`;
      formatted += `   Memories: ${p.memory_count || 0}\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async project_create(args, { memoryClient }) {
    const project = await memoryClient.createProject(
      args.name as string, args.description as string | undefined
    );

    let formatted = `Project created successfully!\n\n`;
    formatted += `Name: ${project.name}\n`;
    formatted += `ID: ${project.project_id}\n`;
    if (project.description) formatted += `Description: ${project.description}\n`;
    formatted += `\nYou can now use this project_id to store memories.`;
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Project Hierarchy
  // ==========================================================================

  async project_link_subproject(args, { memoryClient }) {
    const result = await memoryClient.linkSubproject(args.parent_id as string, args.child_id as string);

    let formatted = `Subproject linked successfully!\n\n`;
    formatted += `Parent: ${result.parent_name} (${result.parent_id})\n`;
    formatted += `Child: ${result.child_name} (${result.child_id})\n`;
    formatted += `Status: ${result.status}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async project_unlink_subproject(args, { memoryClient }) {
    const result = await memoryClient.unlinkSubproject(args.parent_id as string, args.child_id as string);

    let formatted = result.removed
      ? `Subproject unlinked successfully.\n`
      : `No subproject relationship found to remove.\n`;
    formatted += `Parent ID: ${result.parent_id}\n`;
    formatted += `Child ID: ${result.child_id}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async project_list_subprojects(args, { memoryClient }) {
    const subprojects = await memoryClient.listSubprojects(args.project_id as string);

    if (!subprojects || subprojects.length === 0) {
      return { content: [{ type: "text", text: `No subprojects found for project ${args.project_id}` }] };
    }

    let formatted = `Subprojects (${subprojects.length}):\n\n`;
    subprojects.forEach((p: any, i: number) => {
      const indent = "  ".repeat(p.depth || 1);
      formatted += `${indent}${i + 1}. ${p.name}\n`;
      formatted += `${indent}   ID: ${p.project_id}\n`;
      formatted += `${indent}   Depth: ${p.depth}\n`;
      if (p.description) formatted += `${indent}   Description: ${p.description}\n`;
      formatted += `\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async project_get_hierarchy(args, { memoryClient }) {
    const hierarchy = await memoryClient.getProjectHierarchy(args.project_id as string);

    let formatted = `Project Hierarchy\n\n`;
    formatted += `Project: ${hierarchy.name}\n`;
    formatted += `ID: ${hierarchy.project_id}\n`;
    if (hierarchy.description) formatted += `Description: ${hierarchy.description}\n`;

    if (hierarchy.parents && hierarchy.parents.length > 0) {
      formatted += `\nParent Projects (${hierarchy.parents.length}):\n`;
      hierarchy.parents.forEach((p: any) => {
        formatted += `  - ${p.name} (depth: ${p.depth})\n`;
      });
    } else {
      formatted += `\nNo parent projects (root level)\n`;
    }

    if (hierarchy.children && hierarchy.children.length > 0) {
      formatted += `\nChild Projects (${hierarchy.children.length}):\n`;
      hierarchy.children.forEach((c: any) => {
        formatted += `  - ${c.name} (depth: ${c.depth})\n`;
      });
    } else {
      formatted += `\nNo child projects\n`;
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Heartbeat System
  // ==========================================================================

  async heartbeat_tick(args, { memoryClient }) {
    const result = await memoryClient.heartbeatTick({
      project_id: args.project_id as string,
      agent_id: args.agent_id as string,
      context_id: args.context_id as string,
      session_id: args.session_id as string,
    });

    let formatted = `Heartbeat Tick\n`;
    formatted += `Interaction Count: ${result.interaction_count}\n\n`;

    if (result.actions_taken && result.actions_taken.length > 0) {
      formatted += `Actions Taken:\n`;
      result.actions_taken.forEach((action: any, i: number) => {
        const status = action.success ? 'OK' : 'FAILED';
        formatted += `  ${i + 1}. ${action.action}: ${status}\n`;
        if (action.details && Object.keys(action.details).length > 0) {
          formatted += `     Details: ${JSON.stringify(action.details)}\n`;
        }
        if (action.error) formatted += `     Error: ${action.error}\n`;
      });
      formatted += `\n`;
    } else {
      formatted += `No actions triggered this tick.\n\n`;
    }

    if (result.next_scheduled_actions && Object.keys(result.next_scheduled_actions).length > 0) {
      formatted += `Next Scheduled Actions:\n`;
      for (const [action, count] of Object.entries(result.next_scheduled_actions)) {
        formatted += `  ${action}: at interaction ${count}\n`;
      }
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async heartbeat_status(_args, { memoryClient }) {
    const result = await memoryClient.getHeartbeatStatus();

    let formatted = `Heartbeat Status\n`;
    formatted += `================\n\n`;
    formatted += `Interaction Count: ${result.interaction_count}\n`;
    formatted += `Started At: ${result.started_at}\n`;
    formatted += `Last Tick: ${result.last_tick_at || 'Never'}\n`;
    formatted += `Uptime: ${result.uptime_seconds?.toFixed(0) || 0} seconds\n\n`;

    if (result.config) {
      formatted += `Configuration:\n`;
      formatted += `  Working Memory Interval: ${result.config.working_memory_interval}\n`;
      formatted += `  Stream Capture Interval: ${result.config.stream_capture_interval}\n`;
      formatted += `  Mini Sleep Interval: ${result.config.mini_sleep_interval}\n`;
      formatted += `  Normal Sleep Interval: ${result.config.normal_sleep_interval}\n`;
      formatted += `  Daily Sleep Enabled: ${result.config.daily_sleep_enabled}\n`;
      formatted += `  Weekly Metacognition Enabled: ${result.config.weekly_metacognition_enabled}\n`;
      if (result.config.last_daily_sleep) formatted += `  Last Daily Sleep: ${result.config.last_daily_sleep}\n`;
      if (result.config.last_weekly_metacognition) formatted += `  Last Weekly Metacognition: ${result.config.last_weekly_metacognition}\n`;
      formatted += `\n`;
    }

    if (result.actions_history && Object.keys(result.actions_history).length > 0) {
      formatted += `Actions History:\n`;
      for (const [action, count] of Object.entries(result.actions_history)) {
        formatted += `  ${action}: ${count} times\n`;
      }
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async heartbeat_configure(args, { memoryClient }) {
    const result = await memoryClient.configureHeartbeat({
      working_memory_interval: args.working_memory_interval as number,
      stream_capture_interval: args.stream_capture_interval as number,
      mini_sleep_interval: args.mini_sleep_interval as number,
      normal_sleep_interval: args.normal_sleep_interval as number,
      daily_sleep_enabled: args.daily_sleep_enabled as boolean,
      weekly_metacognition_enabled: args.weekly_metacognition_enabled as boolean,
    });

    let formatted = `Heartbeat Configuration Updated\n`;
    formatted += `================================\n\n`;
    formatted += `Working Memory Interval: ${result.working_memory_interval}\n`;
    formatted += `Stream Capture Interval: ${result.stream_capture_interval}\n`;
    formatted += `Mini Sleep Interval: ${result.mini_sleep_interval}\n`;
    formatted += `Normal Sleep Interval: ${result.normal_sleep_interval}\n`;
    formatted += `Daily Sleep Enabled: ${result.daily_sleep_enabled}\n`;
    formatted += `Weekly Metacognition Enabled: ${result.weekly_metacognition_enabled}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async heartbeat_reset(_args, { memoryClient }) {
    const result = await memoryClient.resetHeartbeat();
    return {
      content: [{
        type: "text",
        text: `Heartbeat Reset\n\n${result.message}\nInteraction Count: ${result.interaction_count}`,
      }],
    };
  },

  // ==========================================================================
  // Context Hierarchy (Cycle 13)
  // ==========================================================================

  async context_create(args, { memoryClient }) {
    const result = await memoryClient.createContext({
      context_path: args.context_path as string,
      context_type: args.context_type as string,
      name: args.name as string,
      project_id: args.project_id as string,
      description: args.description as string,
      parent_path: args.parent_path as string,
      metadata: args.metadata as Record<string, unknown>,
    });

    let formatted = `Context Created\n`;
    formatted += `===============\n\n`;
    formatted += `Path: ${result.context_path}\n`;
    formatted += `Type: ${result.context_type}\n`;
    formatted += `Name: ${result.name}\n`;
    formatted += `ID: ${result.id}\n`;
    if (result.parent_path) formatted += `Parent: ${result.parent_path}\n`;
    if (result.description) formatted += `Description: ${result.description}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async context_tree(args, { memoryClient }) {
    const result = await memoryClient.getContextTree(args.project_id as string);

    if (!result.root) {
      return { content: [{ type: "text", text: `No context tree found for project ${args.project_id}` }] };
    }

    let formatted = `Context Tree for Project ${args.project_id}\n`;
    formatted += `==============================================\n\n`;
    formatted += `Total Contexts: ${result.total_contexts}\n`;
    formatted += `Total Memories: ${result.total_memories}\n\n`;

    const formatNode = (node: any, indent: string = ""): string => {
      let output = `${indent}[${node.context_type}] ${node.name} (${node.memory_count} memories)\n`;
      output += `${indent}  Path: ${node.context_path}\n`;
      if (node.children && node.children.length > 0) {
        node.children.forEach((child: any) => {
          output += formatNode(child, indent + "  ");
        });
      }
      return output;
    };

    formatted += formatNode(result.root);
    return { content: [{ type: "text", text: formatted }] };
  },

  async context_memories(args, { memoryClient }) {
    const result = await memoryClient.getContextMemories(
      args.context_path as string, args.include_children as boolean,
      args.memory_types as string[], args.limit as number, args.offset as number
    );

    if (!result.memories || result.memories.length === 0) {
      return { content: [{ type: "text", text: `No memories found in context ${args.context_path}` }] };
    }

    let formatted = `Memories in Context: ${result.context_path}\n`;
    formatted += `Type: ${result.context_type}\n`;
    formatted += `Total: ${result.total_count}\n`;
    formatted += `Include Children: ${result.included_children}\n\n`;

    result.memories.forEach((mem: any, i: number) => {
      formatted += `${i + 1}. [${mem.memory_type}] (importance: ${mem.importance?.toFixed(2) || 'N/A'})\n`;
      formatted += `   ${mem.content?.slice(0, 150)}...\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async context_stats(args, { memoryClient }) {
    const result = await memoryClient.getContextStats(args.project_id as string);

    let formatted = `Context Statistics for Project ${args.project_id}\n`;
    formatted += `=================================================\n\n`;
    formatted += `Total Contexts: ${result.total_contexts}\n`;
    formatted += `Total Memories: ${result.total_memories}\n`;
    formatted += `Max Depth: ${result.max_depth}\n`;
    if (result.deepest_path) formatted += `Deepest Path: ${result.deepest_path}\n`;
    formatted += `\nBy Type:\n`;
    for (const [type, count] of Object.entries(result.by_type || {})) {
      formatted += `  ${type}: ${count}\n`;
    }
    if (result.memories_by_type && Object.keys(result.memories_by_type).length > 0) {
      formatted += `\nMemories By Type:\n`;
      for (const [type, count] of Object.entries(result.memories_by_type)) {
        formatted += `  ${type}: ${count}\n`;
      }
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async context_info(args, { memoryClient }) {
    const result = await memoryClient.getContextInfo(args.context_path as string);

    let formatted = `Context Info: ${result.context_path}\n`;
    formatted += `=====================================\n\n`;
    formatted += `Type: ${result.context_type}\n`;
    formatted += `Name: ${result.name}\n`;
    if (result.description) formatted += `Description: ${result.description}\n`;
    formatted += `Project ID: ${result.project_id}\n`;
    formatted += `Memory Count (direct): ${result.memory_count}\n`;
    formatted += `Memory Count (recursive): ${result.memory_count_recursive}\n`;
    if (result.parent_path) formatted += `Parent: ${result.parent_path}\n`;
    if (result.ancestors && result.ancestors.length > 0) formatted += `Ancestors: ${result.ancestors.join(' > ')}\n`;
    if (result.children && result.children.length > 0) formatted += `Children: ${result.children.join(', ')}\n`;
    formatted += `Created: ${result.created_at}\n`;
    if (result.updated_at) formatted += `Updated: ${result.updated_at}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async context_update(args, { memoryClient }) {
    const result = await memoryClient.updateContext(
      args.context_path as string, args.name as string, args.description as string
    );

    let formatted = `Context Updated\n`;
    formatted += `===============\n\n`;
    formatted += `Path: ${result.context_path}\n`;
    formatted += `Name: ${result.name}\n`;
    if (result.description) formatted += `Description: ${result.description}\n`;
    formatted += `Updated At: ${result.updated_at}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async context_delete(args, { memoryClient }) {
    await memoryClient.deleteContext(args.context_path as string, args.force as boolean);
    return {
      content: [{
        type: "text",
        text: `Context deleted: ${args.context_path}`,
      }],
    };
  },

  // ==========================================================================
  // Team Relationships
  // ==========================================================================

  async graph_create_manages(args, { memoryClient }) {
    const result = await memoryClient.createManagesRelationship({
      manager_id: args.manager_id as string,
      subordinate_id: args.subordinate_id as string,
      team_name: args.team_name as string | undefined,
      since: args.since as string | undefined,
    });

    let formatted = `MANAGES Relationship Created\n`;
    formatted += `============================\n\n`;
    formatted += `Manager: ${result.manager_name} (${result.manager_id})\n`;
    formatted += `Subordinate: ${result.subordinate_name} (${result.subordinate_id})\n`;
    if (result.team_name) formatted += `Team: ${result.team_name}\n`;
    if (result.since) formatted += `Since: ${result.since}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async graph_remove_manages(args, { memoryClient }) {
    const result = await memoryClient.removeManagesRelationship(
      args.manager_id as string, args.subordinate_id as string
    );

    let formatted = `MANAGES Relationship Removed\n`;
    formatted += `============================\n\n`;
    formatted += `Manager: ${args.manager_id}\n`;
    formatted += `Subordinate: ${args.subordinate_id}\n`;
    formatted += `Deleted: ${result.deleted ? 'Yes' : 'No'}`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async graph_create_collaboration(args, { memoryClient }) {
    const result = await memoryClient.createCollaboration({
      agent1_id: args.agent1_id as string,
      agent2_id: args.agent2_id as string,
      collaboration_type: args.collaboration_type as string | undefined,
      project_id: args.project_id as string | undefined,
      strength: args.strength as number | undefined,
    });

    let formatted = `COLLABORATES_WITH Relationship Created\n`;
    formatted += `======================================\n\n`;
    formatted += `Agent 1: ${result.agent1_name} (${result.agent1_id})\n`;
    formatted += `Agent 2: ${result.agent2_name} (${result.agent2_id})\n`;
    formatted += `Type: ${result.collaboration_type || 'general'}\n`;
    formatted += `Strength: ${result.strength || 0.5}\n`;
    if (result.project_id) formatted += `Project: ${result.project_id}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async graph_remove_collaboration(args, { memoryClient }) {
    const result = await memoryClient.removeCollaboration(
      args.agent1_id as string, args.agent2_id as string
    );

    let formatted = `COLLABORATES_WITH Relationship Removed\n`;
    formatted += `======================================\n\n`;
    formatted += `Agent 1: ${args.agent1_id}\n`;
    formatted += `Agent 2: ${args.agent2_id}\n`;
    formatted += `Deleted: ${result.deleted ? 'Yes' : 'No'}`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async graph_get_team_structure(args, { memoryClient }) {
    const result = await memoryClient.getTeamStructure(
      args.manager_id as string, args.include_indirect as boolean
    );

    let formatted = `Team Structure\n`;
    formatted += `==============\n\n`;
    formatted += `Manager: ${result.manager?.name || args.manager_id}\n`;
    if (result.team_name) formatted += `Team: ${result.team_name}\n`;
    formatted += `\nDirect Reports (${result.direct_reports?.length || 0}):\n`;

    if (result.direct_reports && result.direct_reports.length > 0) {
      result.direct_reports.forEach((report: any, i: number) => {
        formatted += `  ${i + 1}. ${report.name} (${report.agent_id})\n`;
        formatted += `     Type: ${report.agent_type}\n`;
        if (report.since) formatted += `     Since: ${report.since}\n`;
      });
    } else {
      formatted += `  (no direct reports)\n`;
    }

    if (args.include_indirect && result.indirect_reports && result.indirect_reports.length > 0) {
      formatted += `\nIndirect Reports (${result.indirect_reports.length}):\n`;
      result.indirect_reports.forEach((report: any, i: number) => {
        formatted += `  ${i + 1}. ${report.name} (${report.agent_id})\n`;
        formatted += `     Reports to: ${report.reports_to}\n`;
      });
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async graph_get_agent_manager(args, { memoryClient }) {
    const result = await memoryClient.getAgentManager(args.agent_id as string);

    let formatted = `Agent Manager\n`;
    formatted += `=============\n\n`;
    formatted += `Agent: ${args.agent_id}\n`;

    if (result.manager) {
      formatted += `\nManager:\n`;
      formatted += `  Name: ${result.manager.name}\n`;
      formatted += `  ID: ${result.manager.agent_id}\n`;
      formatted += `  Type: ${result.manager.agent_type}\n`;
      if (result.team_name) formatted += `  Team: ${result.team_name}\n`;
      if (result.since) formatted += `  Since: ${result.since}\n`;
    } else {
      formatted += `\n(no manager - this agent is a top-level manager or unassigned)\n`;
    }
    return { content: [{ type: "text", text: formatted }] };
  },

  async graph_get_collaborators(args, { memoryClient }) {
    const result = await memoryClient.getCollaborators(
      args.agent_id as string,
      args.collaboration_type as string | undefined,
      args.min_strength as number | undefined
    );

    let formatted = `Agent Collaborators\n`;
    formatted += `===================\n\n`;
    formatted += `Agent: ${args.agent_id}\n`;
    if (args.collaboration_type) formatted += `Filter Type: ${args.collaboration_type}\n`;
    if (args.min_strength) formatted += `Min Strength: ${args.min_strength}\n`;
    formatted += `\nCollaborators (${result.collaborators?.length || 0}):\n`;

    if (result.collaborators && result.collaborators.length > 0) {
      result.collaborators.forEach((collab: any, i: number) => {
        formatted += `  ${i + 1}. ${collab.name} (${collab.agent_id})\n`;
        formatted += `     Type: ${collab.collaboration_type || 'general'}\n`;
        formatted += `     Strength: ${collab.strength?.toFixed(2) || '0.50'}\n`;
        if (collab.project_id) formatted += `     Project: ${collab.project_id}\n`;
      });
    } else {
      formatted += `  (no collaborators found)\n`;
    }
    return { content: [{ type: "text", text: formatted }] };
  },
};

// ---------------------------------------------------------------------------
// Dispatcher: looks up the handler and executes it with error handling
// ---------------------------------------------------------------------------

/**
 * Execute a tool by name. Wraps the individual handler with standard error
 * handling (auth errors, validation errors, unknown tools).
 */
export async function dispatchTool(
  name: string,
  args: ToolArgs,
  deps: ToolHandlerDeps,
): Promise<ToolResult> {
  const handler = handlers[name];
  if (!handler) {
    return {
      content: [{ type: "text", text: `Unknown tool: ${name}` }],
      isError: true,
    };
  }

  try {
    return await handler(args, deps);
  } catch (error: any) {
    // Check for 401/403 auth errors first
    const authError = handleApiError(error);
    if (authError) return authError;

    let message: string;
    const detail = error.response?.data?.detail;

    if (Array.isArray(detail)) {
      // Pydantic validation errors come as an array of objects
      message = detail.map((d: any) => {
        const loc = d.loc ? d.loc.join('.') : 'unknown';
        return `${loc}: ${d.msg}`;
      }).join('; ');
    } else if (typeof detail === 'string') {
      message = detail;
    } else if (typeof detail === 'object' && detail !== null) {
      message = JSON.stringify(detail);
    } else {
      message = error.message || "Unknown error";
    }

    return {
      content: [{ type: "text", text: `Error: ${message}` }],
      isError: true,
    };
  }
}
