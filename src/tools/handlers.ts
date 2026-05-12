/**
 * Tool handlers for the Frinus MCP Server.
 *
 * Maps tool names to handler functions that execute the tool logic
 * and return formatted MCP tool results.
 */
import axios from "axios";
import type { ToolResult, ToolArgs, ToolHandlerDeps } from "../types/index.js";
import { getResolvedTenantOrgId } from "../client/memory-client.js";

// ---------------------------------------------------------------------------
// Helper: 401/403 error handling
// ---------------------------------------------------------------------------
export function handleApiError(error: any): ToolResult | null {
  const status = error?.response?.status;
  if (status === 401) {
    return {
      content: [{ type: "text", text: "Authentication error (401). Check API key configuration." }],
      isError: true,
    };
  }
  if (status === 403) {
    return {
      content: [{ type: "text", text: "Permission denied. You don't have access to this scope." }],
      isError: true,
    };
  }
  if (status === 504) {
    const detail = error?.response?.data?.detail || "Embedding model timeout";
    return {
      content: [{ type: "text", text: `Search timeout (504): ${detail}. The embedding model may be loading or overloaded.` }],
      isError: true,
    };
  }
  if (status === 502) {
    return {
      content: [{ type: "text", text: "Service unavailable (502). The Memory Engine may be restarting." }],
      isError: true,
    };
  }
  return null; // Not a known error, let it propagate
}

// ---------------------------------------------------------------------------
// Handler map: tool name -> async handler function
// ---------------------------------------------------------------------------
type HandlerFn = (args: ToolArgs, deps: ToolHandlerDeps) => Promise<ToolResult>;

const handlers: Record<string, HandlerFn> = {

  // ==========================================================================
  // Core Memory
  // ==========================================================================

  async memory_store(args, { memoryClient, resolvedUserId }) {
    try {
      const createdByUser = (args.created_by_user_id as string) || resolvedUserId || undefined;
      const userId = (args.user_id as string) || resolvedUserId || undefined;

      // Auto-scope inference: if scope not provided, pick the narrowest
      // scope justified by the available context. Caller can always pass
      // an explicit `scope` to override this heuristic.
      const meta = (args.metadata as Record<string, unknown> | undefined) || {};
      const universeId = (args.universe_id as string) || (meta.universe_id as string) || undefined;
      let resolvedScope = args.scope as string | undefined;
      if (!resolvedScope) {
        if (userId || createdByUser) {
          resolvedScope = "user";
        } else if (universeId) {
          resolvedScope = "universe";
        } else {
          resolvedScope = "organization";
        }
      }

      const result = await memoryClient.storeMemory({
        agent_id: args.agent_id as string,
        content: args.content as string,
        memory_type: args.memory_type as string,
        scope: resolvedScope,
        importance: args.importance as number,
        user_id: userId,
        created_by_user_id: createdByUser,
        metadata: args.metadata as Record<string, unknown> | undefined,
        context_id: args.context_id as string | undefined,
      });
      return {
        content: [{
          type: "text",
          text: `Memory stored successfully.\nID: ${result.id}\nType: ${result.memory_type}\nScope: ${result.scope}`,
        }],
      };
    } catch (error: any) {
      const apiErr = handleApiError(error);
      if (apiErr) return apiErr;
      throw error;
    }
  },

  async memory_search(args, { memoryClient }) {
    let results: any;
    try {
      results = await memoryClient.searchMemories({
        query_text: args.query_text as string,
        agent_id: args.agent_id as string,
        memory_types: args.memory_types as string[],
        limit: args.limit as number,
      });
    } catch (error: any) {
      const apiErr = handleApiError(error);
      if (apiErr) return apiErr;
      throw error;
    }

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

  async memory_get(args, { memoryClient }) {
    try {
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
    } catch (error: any) {
      const apiErr = handleApiError(error);
      if (apiErr) return apiErr;
      throw error;
    }
  },

  async memory_list(args, { memoryClient }) {
    try {
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
    } catch (error: any) {
      const apiErr = handleApiError(error);
      if (apiErr) return apiErr;
      throw error;
    }
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

  async memory_get_context(args, { memoryClient }) {
    const result = await memoryClient.buildContext({
      agent_id: args.agent_id as string,
      task_description: args.task_description as string,
      max_tokens: args.max_tokens as number,
    });

    if (!result.context) {
      return { content: [{ type: "text", text: "No relevant context found for this task." }] };
    }
    return { content: [{ type: "text", text: `Context from memory:\n\n${result.context}` }] };
  },

  // ==========================================================================
  // Dynamic Relevance
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
  // Session Management
  // ==========================================================================

  async session_start(args, { memoryClient, capture }) {
    try {
      const result = await memoryClient.startSession({
        agent_id: args.agent_id as string,
        parent_session_id: args.parent_session_id as string,
      });

      // Replace auto-generated session ID with the formal one
      capture.sessionId = result.session_id;

      // P1 BOOT auto-populate: seed working memory with the session id and
      // agent role so subsequent `working_memory_get(agent:<id>)` calls
      // return something meaningful instead of "No working memory".
      // Fire-and-forget; failures must never break session_start.
      const agentId = args.agent_id as string | undefined;
      if (agentId) {
        const seed =
          `SESSION_ID: ${result.session_id}\n` +
          `AGENT_ID: ${agentId}\n` +
          (result.agent_context ? `ROLE: ${String(result.agent_context).slice(0, 400)}\n` : "") +
          `BOOT: P1 executed at ${new Date().toISOString()}`;
        memoryClient
          .addWorkingMemory({
            context_id: `agent:${agentId}`,
            content: seed,
            agent_id: agentId,
            ttl_seconds: 3600,
          })
          .catch((err: any) => {
            console.error('[MCP] P1 BOOT working_memory seed failed:', err?.message || err);
          });
      }

      let msg = `Session started: ${result.session_id}\n`;
      if (result.parent_session_id) msg += `Parent session: ${result.parent_session_id}\n`;
      msg += "\n";

      if (result.agent_context) msg += `## Agent Context\n${result.agent_context}\n\n`;
      if (result.permissions && result.permissions.length > 0) {
        msg += `## Your Permissions\n`;
        for (const p of result.permissions) {
          const resource = p.resource || "unknown";
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

  async stream_process(args, { memoryClient }) {
    const result = await memoryClient.processStream(args.batch_size as number);

    let formatted = `Stream Processing Complete\n`;
    formatted += `==========================\n\n`;
    formatted += `Processed: ${result.processed}\n`;
    formatted += `Promoted to Memories: ${result.promoted}\n`;
    formatted += `Discarded: ${result.discarded}\n`;
    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Selective Attention
  // ==========================================================================

  async search_with_attention(args, { memoryClient, resolvedUserId }) {
    let results: any;
    try {
      results = await memoryClient.searchWithAttention({
        query_text: args.query_text as string,
        task_type: args.task_type as string,
        limit: args.limit as number,
        agent_id: (args.agent_id as string) || undefined,
        user_id: (args.user_id as string) || resolvedUserId || undefined,
      });
    } catch (error: any) {
      const apiErr = handleApiError(error);
      if (apiErr) return apiErr;
      throw error;
    }

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
    const taskDescription = args.task_description as string || "general context";
    const userEmail = args.user_email as string;

    const result = await memoryClient.getUserContext(taskDescription, userEmail);

    let formatted = `User Context:\n\n`;
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
  // Maintenance
  // ==========================================================================

  async heartbeat_tick(args, { memoryClient }) {
    const result = await memoryClient.heartbeatTick({
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

  async sleep_run(args, { memoryClient }) {
    const result = await memoryClient.runSleepCycle(args.phases as string[]);

    let formatted = `Sleep Cycle ${result.status || 'completed'}:\n`;
    formatted += `Cycle ID: ${result.cycle_id}\n`;
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

  // ==========================================================================
  // Consolidation (Active Forgetting)
  // ==========================================================================

  async consolidation_detect_conflicts(args, { memoryClient }) {
    const result = await memoryClient.detectConflicts(
      args.similarity_threshold as number, args.limit as number
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

  async consolidation_detect_redundant(args, { memoryClient }) {
    const result = await memoryClient.detectRedundant(
      args.similarity_threshold as number, args.limit as number
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

  // ==========================================================================
  // Hierarchical Memory
  // ==========================================================================

  async hierarchy_consolidate(args, { memoryClient }) {
    const result = await memoryClient.hierarchyConsolidate({
      memory_ids: args.memory_ids as string[],
      summary_content: args.summary_content as string,
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

  // ==========================================================================
  // Agent CRUD
  // ==========================================================================

  async agent_create(args, { agentClient }) {
    const result = await agentClient.createAgent({
      name: args.name as string,
      template_id: args.template_id as string,
      universe_id: args.universe_id as string,
      persona: args.persona as Record<string, unknown>,
      team_id: args.team_id as string,
      is_team_lead: args.is_team_lead as boolean,
    });
    return {
      content: [{
        type: "text",
        text: `Agent created.\nID: ${result.id}\nName: ${result.name}\nStatus: ${result.status || 'active'}`,
      }],
    };
  },

  async agent_list(args, { agentClient }) {
    const results = await agentClient.listAgents(args.org_id as string);
    const agents = Array.isArray(results) ? results : (results.agents || results.items || []);
    if (!agents || agents.length === 0) {
      return { content: [{ type: "text", text: "No agents found." }] };
    }
    let formatted = "Agents:\n\n";
    agents.forEach((a: any, i: number) => {
      formatted += `${i + 1}. ${a.name} (ID: ${a.id})\n`;
      formatted += `   Status: ${a.status || 'active'} | Universe: ${a.universe_id || 'none'}\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async agent_get(args, { agentClient }) {
    const result = await agentClient.getAgent(args.agent_id as string);
    let formatted = `Agent Details:\n`;
    formatted += `ID: ${result.id}\n`;
    formatted += `Name: ${result.name}\n`;
    formatted += `Status: ${result.status || 'active'}\n`;
    formatted += `Universe: ${result.universe_id || 'none'}\n`;
    formatted += `Team: ${result.team_id || 'none'}\n`;
    formatted += `Team Lead: ${result.is_team_lead || false}\n`;
    if (result.persona) {
      formatted += `\nPersona:\n`;
      if (result.persona.personality) formatted += `  Personality: ${result.persona.personality}\n`;
      if (result.persona.instructions) formatted += `  Instructions: ${result.persona.instructions}\n`;
      if (result.persona.greeting) formatted += `  Greeting: ${result.persona.greeting}\n`;
      if (result.persona.language) formatted += `  Language: ${result.persona.language}\n`;
      if (result.persona.specialization) formatted += `  Specialization: ${result.persona.specialization}\n`;
      if (result.persona.forbidden_topics && result.persona.forbidden_topics.length > 0) {
        formatted += `  Forbidden Topics: ${result.persona.forbidden_topics.join(', ')}\n`;
      }
    }
    if (result.created_at) formatted += `\nCreated: ${result.created_at}`;
    return { content: [{ type: "text", text: formatted }] };
  },

  async agent_update(args, { agentClient }) {
    const data: Record<string, unknown> = {};
    if (args.name !== undefined) data.name = args.name as string;
    if (args.personality !== undefined) data.personality = args.personality as string;
    if (args.instructions !== undefined) data.instructions = args.instructions as string;
    if (args.greeting !== undefined) data.greeting = args.greeting as string;
    if (args.forbidden_topics !== undefined) data.forbidden_topics = args.forbidden_topics as string[];
    if (args.language !== undefined) data.language = args.language as string;
    if (args.specialization !== undefined) data.specialization = args.specialization as string;

    const result = await agentClient.updateAgentPersona(args.agent_id as string, data as any);
    return {
      content: [{
        type: "text",
        text: `Agent updated.\nID: ${args.agent_id}\nName: ${result.name || 'unchanged'}`,
      }],
    };
  },

  async agent_delete(args, { agentClient }) {
    await agentClient.deleteAgent(args.agent_id as string);
    return {
      content: [{
        type: "text",
        text: `Agent deleted.\nID: ${args.agent_id}`,
      }],
    };
  },

  // ==========================================================================
  // Universe CRUD
  // ==========================================================================

  async universe_create(args, { cpClient }) {
    const orgId = getResolvedTenantOrgId();
    if (!orgId) {
      return {
        content: [{ type: "text", text: "Error: No organization context. API key may not be linked to an org." }],
        isError: true,
      };
    }
    const result = await cpClient.createUniverse(orgId, {
      name: args.name as string,
      slug: args.slug as string,
      description: args.description as string,
    });
    return {
      content: [{
        type: "text",
        text: `Universe created.\nID: ${result.id}\nName: ${result.name}\nSlug: ${result.slug}`,
      }],
    };
  },

  async universe_list(_args, { cpClient }) {
    const orgId = getResolvedTenantOrgId();
    if (!orgId) {
      return {
        content: [{ type: "text", text: "Error: No organization context. API key may not be linked to an org." }],
        isError: true,
      };
    }
    const results = await cpClient.listUniverses(orgId);
    const universes = Array.isArray(results) ? results : (results.universes || results.items || []);
    if (!universes || universes.length === 0) {
      return { content: [{ type: "text", text: "No universes found." }] };
    }
    let formatted = "Universes:\n\n";
    universes.forEach((u: any, i: number) => {
      formatted += `${i + 1}. ${u.name} (ID: ${u.id})\n`;
      formatted += `   Slug: ${u.slug}`;
      if (u.description) formatted += ` | ${u.description}`;
      formatted += `\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async universe_update(args, { cpClient }) {
    const orgId = getResolvedTenantOrgId();
    if (!orgId) {
      return {
        content: [{ type: "text", text: "Error: No organization context. API key may not be linked to an org." }],
        isError: true,
      };
    }
    const data: Record<string, unknown> = {};
    if (args.name !== undefined) data.name = args.name as string;
    if (args.description !== undefined) data.description = args.description as string;

    const result = await cpClient.updateUniverse(orgId, args.universe_id as string, data as any);
    return {
      content: [{
        type: "text",
        text: `Universe updated.\nID: ${args.universe_id}\nName: ${result.name || 'unchanged'}`,
      }],
    };
  },

  // ==========================================================================
  // Knowledge Graph - Concepts
  // ==========================================================================

  async concept_create(args, { memoryClient }) {
    const result = await memoryClient.createConcept({
      name: args.name as string,
      universe_id: args.universe_id as string,
      description: args.description as string,
    });
    return {
      content: [{
        type: "text",
        text: `Concept created.\nID: ${result.concept_id}\nName: ${result.name}\nUniverse: ${result.universe_id}`,
      }],
    };
  },

  async concept_list(args, { memoryClient }) {
    const results = await memoryClient.listUniverseConcepts(args.universe_id as string);
    const concepts = Array.isArray(results) ? results : (results.concepts || results.items || []);
    if (!concepts || concepts.length === 0) {
      return { content: [{ type: "text", text: "No concepts found for this universe." }] };
    }
    let formatted = "Concepts:\n\n";
    concepts.forEach((c: any, i: number) => {
      formatted += `${i + 1}. ${c.name} (ID: ${c.concept_id})\n`;
      if (c.description) formatted += `   ${c.description}\n`;
      formatted += `\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async concept_update(args, { memoryClient }) {
    const data: Record<string, unknown> = {};
    if (args.name !== undefined) data.name = args.name as string;
    if (args.description !== undefined) data.description = args.description as string;

    const result = await memoryClient.updateConcept(args.concept_id as string, data as any);
    return {
      content: [{
        type: "text",
        text: `Concept updated.\nID: ${args.concept_id}\nName: ${result.name || 'unchanged'}`,
      }],
    };
  },

  async concept_delete(args, { memoryClient }) {
    await memoryClient.deleteConcept(args.concept_id as string);
    return {
      content: [{
        type: "text",
        text: `Concept deleted (cascade: themes, topics, points).\nID: ${args.concept_id}`,
      }],
    };
  },

  // ==========================================================================
  // Knowledge Graph - Themes
  // ==========================================================================

  async theme_create(args, { memoryClient }) {
    const result = await memoryClient.createTheme({
      name: args.name as string,
      concept_id: args.concept_id as string,
      description: args.description as string,
    });
    return {
      content: [{
        type: "text",
        text: `Theme created.\nID: ${result.theme_id}\nName: ${result.name}\nConcept: ${result.concept_id}`,
      }],
    };
  },

  async theme_list(args, { memoryClient }) {
    const results = await memoryClient.listConceptThemes(args.concept_id as string);
    const themes = Array.isArray(results) ? results : (results.themes || results.items || []);
    if (!themes || themes.length === 0) {
      return { content: [{ type: "text", text: "No themes found for this concept." }] };
    }
    let formatted = "Themes:\n\n";
    themes.forEach((t: any, i: number) => {
      formatted += `${i + 1}. ${t.name} (ID: ${t.theme_id})\n`;
      if (t.description) formatted += `   ${t.description}\n`;
      formatted += `\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async theme_update(args, { memoryClient }) {
    const data: Record<string, unknown> = {};
    if (args.name !== undefined) data.name = args.name as string;
    if (args.description !== undefined) data.description = args.description as string;

    const result = await memoryClient.updateTheme(args.theme_id as string, data as any);
    return {
      content: [{
        type: "text",
        text: `Theme updated.\nID: ${args.theme_id}\nName: ${result.name || 'unchanged'}`,
      }],
    };
  },

  async theme_delete(args, { memoryClient }) {
    await memoryClient.deleteTheme(args.theme_id as string);
    return {
      content: [{
        type: "text",
        text: `Theme deleted (cascade: topics, points).\nID: ${args.theme_id}`,
      }],
    };
  },

  // ==========================================================================
  // Knowledge Graph - Topics
  // ==========================================================================

  async topic_create(args, { memoryClient }) {
    const result = await memoryClient.createTopic({
      name: args.name as string,
      theme_id: args.theme_id as string,
      description: args.description as string,
      status: args.status as string,
    });
    return {
      content: [{
        type: "text",
        text: `Topic created.\nID: ${result.topic_id}\nName: ${result.name}\nTheme: ${result.theme_id}\nStatus: ${result.status || 'pending'}`,
      }],
    };
  },

  async topic_list(args, { memoryClient }) {
    const results = await memoryClient.listThemeTopics(args.theme_id as string);
    const topics = Array.isArray(results) ? results : (results.topics || results.items || []);
    if (!topics || topics.length === 0) {
      return { content: [{ type: "text", text: "No topics found for this theme." }] };
    }
    let formatted = "Topics:\n\n";
    topics.forEach((t: any, i: number) => {
      formatted += `${i + 1}. ${t.name} (ID: ${t.topic_id})\n`;
      formatted += `   Status: ${t.status || 'pending'}`;
      if (t.description) formatted += ` | ${t.description}`;
      formatted += `\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async topic_update(args, { memoryClient }) {
    const hasMetadata = args.name !== undefined || args.description !== undefined;
    const hasStatus = args.status !== undefined;

    let result: any;

    if (hasMetadata) {
      const data: Record<string, unknown> = {};
      if (args.name !== undefined) data.name = args.name as string;
      if (args.description !== undefined) data.description = args.description as string;
      result = await memoryClient.updateTopic(args.topic_id as string, data as any);
    }

    if (hasStatus) {
      result = await memoryClient.updateTopicStatus(args.topic_id as string, args.status as string);
    }

    return {
      content: [{
        type: "text",
        text: `Topic updated.\nID: ${args.topic_id}\nName: ${result?.name || 'unchanged'}\nStatus: ${result?.status || args.status || 'unchanged'}`,
      }],
    };
  },

  async topic_delete(args, { memoryClient }) {
    await memoryClient.deleteTopic(args.topic_id as string);
    return {
      content: [{
        type: "text",
        text: `Topic deleted (cascade: points).\nID: ${args.topic_id}`,
      }],
    };
  },

  // ==========================================================================
  // Knowledge Graph - Points
  // ==========================================================================

  async point_create(args, { memoryClient }) {
    const result = await memoryClient.createPoint({
      name: args.name as string,
      topic_id: args.topic_id as string,
      description: args.description as string,
      status: args.status as string,
    });
    return {
      content: [{
        type: "text",
        text: `Point created.\nID: ${result.point_id}\nName: ${result.name}\nTopic: ${result.topic_id}\nStatus: ${result.status || 'pending'}`,
      }],
    };
  },

  async point_list(args, { memoryClient }) {
    const results = await memoryClient.listTopicPoints(args.topic_id as string);
    const points = Array.isArray(results) ? results : (results.points || results.items || []);
    if (!points || points.length === 0) {
      return { content: [{ type: "text", text: "No points found for this topic." }] };
    }
    let formatted = "Points:\n\n";
    points.forEach((p: any, i: number) => {
      formatted += `${i + 1}. ${p.name} (ID: ${p.point_id})\n`;
      formatted += `   Status: ${p.status || 'pending'}`;
      if (p.description) formatted += ` | ${p.description}`;
      formatted += `\n\n`;
    });
    return { content: [{ type: "text", text: formatted }] };
  },

  async point_update(args, { memoryClient }) {
    const hasMetadata = args.name !== undefined || args.description !== undefined || args.content !== undefined;
    const hasStatus = args.status !== undefined;

    let result: any;

    if (hasMetadata) {
      const data: Record<string, unknown> = {};
      if (args.name !== undefined) data.name = args.name as string;
      if (args.description !== undefined) data.description = args.description as string;
      if (args.content !== undefined) data.content = args.content as string;
      result = await memoryClient.updatePoint(args.point_id as string, data as any);
    }

    if (hasStatus) {
      result = await memoryClient.updatePointStatus(args.point_id as string, args.status as string);
    }

    return {
      content: [{
        type: "text",
        text: `Point updated.\nID: ${args.point_id}\nName: ${result?.name || 'unchanged'}\nStatus: ${result?.status || args.status || 'unchanged'}`,
      }],
    };
  },

  async point_delete(args, { memoryClient }) {
    await memoryClient.deletePoint(args.point_id as string);
    return {
      content: [{
        type: "text",
        text: `Point deleted.\nID: ${args.point_id}`,
      }],
    };
  },

  // ==========================================================================
  // Knowledge Hierarchy
  // ==========================================================================

  async universe_hierarchy(args, { memoryClient }) {
    const result = await memoryClient.getUniverseHierarchy(args.universe_id as string);

    let formatted = `Knowledge Hierarchy for Universe: ${args.universe_id}\n`;
    formatted += `${"=".repeat(50)}\n\n`;

    const concepts = Array.isArray(result) ? result : (result.concepts || result.hierarchy || []);
    if (!concepts || concepts.length === 0) {
      formatted += "No knowledge hierarchy found for this universe.";
      return { content: [{ type: "text", text: formatted }] };
    }

    concepts.forEach((concept: any, ci: number) => {
      formatted += `[L0] ${ci + 1}. ${concept.name} (ID: ${concept.concept_id || concept.id})\n`;
      if (concept.description) formatted += `     ${concept.description}\n`;

      const themes = concept.themes || [];
      themes.forEach((theme: any, ti: number) => {
        formatted += `  [L1] ${ci + 1}.${ti + 1}. ${theme.name} (ID: ${theme.theme_id || theme.id})\n`;
        if (theme.description) formatted += `       ${theme.description}\n`;

        const topics = theme.topics || [];
        topics.forEach((topic: any, toi: number) => {
          const statusIcon = topic.status === 'completed' ? '[x]' : topic.status === 'in_progress' ? '[~]' : '[ ]';
          formatted += `    [L2] ${statusIcon} ${ci + 1}.${ti + 1}.${toi + 1}. ${topic.name} (ID: ${topic.topic_id || topic.id})\n`;

          const points = topic.points || [];
          points.forEach((point: any, pi: number) => {
            const pIcon = point.status === 'completed' ? '[x]' : '[ ]';
            formatted += `      [L3] ${pIcon} ${ci + 1}.${ti + 1}.${toi + 1}.${pi + 1}. ${point.name} (ID: ${point.point_id || point.id})\n`;
          });
        });
      });
      formatted += `\n`;
    });

    return { content: [{ type: "text", text: formatted }] };
  },

  // ==========================================================================
  // Training
  // ==========================================================================

  async training_teach(args, { memoryClient }) {
    const result = await memoryClient.trainingTeach({
      content: args.content as string,
      type: args.type as string | undefined,
      importance: args.importance as number | undefined,
      universe_id: args.universe_id as string | undefined,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },

  async training_qa(args, { memoryClient }) {
    const result = await memoryClient.trainingQa({
      pairs: args.pairs as Array<{question: string; answer: string}>,
      importance: args.importance as number | undefined,
      universe_id: args.universe_id as string | undefined,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },

  async training_upload(args, { memoryClient }) {
    const result = await memoryClient.trainingUpload({
      file_path: args.file_path as string,
      filename: args.filename as string || "",
      universe_id: args.universe_id as string | undefined,
      importance: args.importance as number | undefined,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },

  async training_stats(_args, { memoryClient }) {
    const result = await memoryClient.trainingStats();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },

  async training_gaps(_args, { memoryClient }) {
    const result = await memoryClient.trainingGaps();
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },

  async training_recent(args, { memoryClient }) {
    const result = await memoryClient.trainingRecent({
      limit: args.limit as number | undefined,
    });
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },

  // -------------------------------------------------------------------------
  // Agent Invocation
  // -------------------------------------------------------------------------

  async agent_invoke(args, { agentClient }) {
    const result = await agentClient.invokeAgent({
      agent_id: args.agent_id as string | undefined,
      agent_name: args.agent_name as string | undefined,
      message: args.message as string,
      context: args.context as Record<string, unknown> | undefined,
      timeout_seconds: args.timeout_seconds as number | undefined,
    });
    const lines = [
      `Agent: ${result.agent_name || result.agent_id}`,
      `Status: ${result.status}`,
      `Duration: ${result.duration_ms}ms`,
      ``,
      `Result:`,
      result.result,
    ];
    if (result.tool_calls?.length > 0) {
      lines.push(``, `Tools used: ${result.tool_calls.map((t: any) => t.name).join(", ")}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },

  // -------------------------------------------------------------------------
  // Task Management
  // -------------------------------------------------------------------------

  async task_create(args, { memoryClient }) {
    const result = await memoryClient.createTask({
      title: args.title as string,
      description: args.description as string | undefined,
      assigned_agent_id: args.assigned_agent_id as string | undefined,
      parent_task_id: args.parent_task_id as string | undefined,
      priority: args.priority as number | undefined,
      input_data: args.input_data as Record<string, unknown> | undefined,
    });
    const t = result;
    const lines = [
      `Task created: ${t.id}`,
      `Title: ${t.title}`,
      `Status: ${t.status}`,
      t.assigned_agent_id ? `Assigned to: ${t.assigned_agent_id}` : null,
      t.parent_task_id ? `Parent task: ${t.parent_task_id}` : null,
      `Priority: ${t.priority}`,
      `Created: ${t.created_at}`,
    ].filter(Boolean);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },

  async task_get(args, { memoryClient }) {
    const result = await memoryClient.getTask(args.task_id as string);
    return {
      content: [{ type: "text", text: JSON.stringify(result, null, 2) }],
    };
  },

  async task_list(args, { memoryClient }) {
    const result = await memoryClient.listTasks({
      status: args.status as string | undefined,
      assigned_agent_id: args.assigned_agent_id as string | undefined,
      parent_task_id: args.parent_task_id as string | undefined,
      limit: args.limit as number | undefined,
    });
    const tasks = result.tasks || [];
    if (tasks.length === 0) {
      return { content: [{ type: "text", text: "No tasks found." }] };
    }
    const lines = tasks.map((t: any) =>
      `[${t.status}] ${t.title} (${t.id}) priority=${t.priority}${t.assigned_agent_id ? ` → agent:${t.assigned_agent_id}` : ""}`
    );
    return {
      content: [{ type: "text", text: `${result.total} tasks:\n${lines.join("\n")}` }],
    };
  },

  async task_update(args, { memoryClient }) {
    const result = await memoryClient.updateTask(args.task_id as string, {
      status: args.status as string | undefined,
      output_data: args.output_data as Record<string, unknown> | undefined,
      error_message: args.error_message as string | undefined,
    });
    const t = result;
    const lines = [
      `Task updated: ${t.id}`,
      `Title: ${t.title}`,
      `Status: ${t.status}`,
      t.completed_at ? `Completed: ${t.completed_at}` : null,
      t.error_message ? `Error: ${t.error_message}` : null,
    ].filter(Boolean);
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },

  // -------------------------------------------------------------------------
  // Skills
  // -------------------------------------------------------------------------

  async skill_list(args, { memoryClient }) {
    const result = await memoryClient.listSkills(args.category as string | undefined);
    const skills = result.skills || result;
    const lines = [`Found ${Array.isArray(skills) ? skills.length : 0} skills:\n`];
    if (Array.isArray(skills)) {
      for (const s of skills) {
        lines.push(`- **${s.name}** (${s.slug}) [${s.category || 'uncategorized'}]`);
        if (s.description) lines.push(`  ${s.description}`);
        lines.push(`  Handler: ${s.handler_type} | Active: ${s.is_active}`);
      }
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },

  async skill_agent_list(args, { memoryClient }) {
    const agentId = args.agent_id as string;
    const skills = await memoryClient.getAgentSkills(agentId);
    const list = Array.isArray(skills) ? skills : [];
    const lines = [`Agent ${agentId} has ${list.length} skills:\n`];
    for (const s of list) {
      lines.push(`- **${s.skill_name}** (${s.skill_slug}) — permission: ${s.permission}`);
    }
    return { content: [{ type: "text", text: lines.join("\n") }] };
  },

  async skill_assign(args, { memoryClient }) {
    const result = await memoryClient.assignSkill(
      args.agent_id as string,
      args.skill_id as string,
      args.permission as string | undefined,
    );
    return {
      content: [{
        type: "text",
        text: `Skill ${result.skill_name} assigned to agent ${result.agent_id} with permission: ${result.permission}`,
      }],
    };
  },

  async skill_remove(args, { memoryClient }) {
    await memoryClient.removeSkill(args.agent_id as string, args.skill_id as string);
    return {
      content: [{ type: "text", text: `Skill ${args.skill_id} removed from agent ${args.agent_id}` }],
    };
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
    try {
      return await handler(args, deps);
    } catch (error: any) {
      // Check for 401/403/502/504 auth/infra errors first
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

      console.error('[MCP] Tool error:', name, message);
      return {
        content: [{ type: "text", text: `Error: ${message}` }],
        isError: true,
      };
    }
  } catch (unexpected) {
    // Outermost safety net: guarantee a valid ToolResult even on truly
    // unexpected errors (e.g. TypeError in the error-handling block above).
    console.error('[MCP] Unhandled tool error:', name, unexpected);
    return {
      content: [{ type: "text", text: `Tool error: ${unexpected instanceof Error ? unexpected.message : String(unexpected)}` }],
      isError: true,
    };
  }
}
