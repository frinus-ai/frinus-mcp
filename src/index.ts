#!/usr/bin/env node
/**
 * MCP Server for Agents Memory Service
 *
 * This server exposes the memory service as MCP tools for Claude agents.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
  Tool,
} from "@modelcontextprotocol/sdk/types.js";
import axios, { AxiosInstance } from "axios";

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || "http://localhost:8001";
const CP_URL = process.env.AGENCIA_CP_URL || "http://localhost:8000";

/**
 * Tenant org ID for multi-tenant mode.
 *
 * Resolved in priority order:
 * 1. /auth/me response `organization_id` (extracted at startup via API key)
 * 2. AGENCIA_TENANT_ORG_ID environment variable
 * 3. null (single-tenant / no tenant header)
 */
let resolvedTenantOrgId: string | null = process.env.AGENCIA_TENANT_ORG_ID || null;

/**
 * User info resolved at startup from /auth/me (API key auth).
 */
let resolvedUserEmail: string | null = null;
let resolvedUserId: string | null = null;

// Memory service client
class MemoryClient {
  private client: AxiosInstance;

  constructor(baseURL: string, apiKey: string) {
    this.client = axios.create({
      baseURL,
      timeout: 30000,
    });

    // Intercept every request to inject X-API-Key and X-Tenant-ID
    this.client.interceptors.request.use((config) => {
      config.headers = config.headers || {};
      config.headers['X-API-Key'] = apiKey;
      if (resolvedTenantOrgId) {
        config.headers['X-Tenant-ID'] = resolvedTenantOrgId;
      }
      return config;
    });
  }

  /** Return the current tenant org ID (if resolved). */
  getTenantOrgId(): string | null {
    return resolvedTenantOrgId;
  }

  async getAuthMe(): Promise<any> {
    const response = await this.client.get("/auth/me");
    return response.data;
  }

  // Session management methods (v2.1 auth sessions)
  async startSession(data: {
    project_id: string;
    agent_id?: string;
    parent_session_id?: string;
  }): Promise<any> {
    const response = await this.client.post("/session/start", data);
    return response.data;
  }

  async endSession(sessionId: string): Promise<any> {
    const response = await this.client.post(`/session/${sessionId}/end`);
    return response.data;
  }

  async getActiveSessions(): Promise<any> {
    const response = await this.client.get("/session/active");
    return response.data;
  }

  async storeMemory(data: {
    agent_id: string;
    content: string;
    memory_type?: string;
    scope?: string;
    importance?: number;
    project_id?: string;
    user_id?: string;
    created_by_user_id?: string;
    metadata?: Record<string, unknown>;
  }) {
    const payload: Record<string, unknown> = {
      agent_id: data.agent_id,
      content: data.content,
      memory_type: data.memory_type || "episodic",
      scope: data.scope || "project",
      importance: data.importance || 0.5,
      project_id: data.project_id,
      metadata: data.metadata,
    };
    if (data.user_id) payload.user_id = data.user_id;
    if (data.created_by_user_id) payload.created_by_user_id = data.created_by_user_id;
    const response = await this.client.post("/memories", payload);
    return response.data;
  }

  async searchMemories(data: {
    query_text: string;
    agent_id?: string;
    project_id?: string;
    memory_types?: string[];
    limit?: number;
  }) {
    const response = await this.client.post("/memories/search", {
      query_text: data.query_text,
      agent_id: data.agent_id,
      project_id: data.project_id,
      memory_types: data.memory_types,
      limit: data.limit || 10,
    });
    return response.data;
  }

  async buildContext(data: {
    agent_id: string;
    task_description: string;
    project_id?: string;
    max_tokens?: number;
  }) {
    const response = await this.client.post("/memories/context", {
      agent_id: data.agent_id,
      task_description: data.task_description,
      project_id: data.project_id,
      max_tokens: data.max_tokens || 2000,
    });
    return response.data;
  }

  async getAgentMemories(
    agentId: string,
    memoryType?: string,
    limit = 50
  ) {
    const params = new URLSearchParams({ limit: limit.toString() });
    if (memoryType) params.append("memory_type", memoryType);
    const response = await this.client.get(`/memories/agent/${agentId}?${params}`);
    return response.data;
  }

  async registerAgent(data: {
    agent_id: string;
    name: string;
    agent_type: string;
  }) {
    const response = await this.client.post("/graph/agents", data);
    return response.data;
  }

  async registerProject(data: { project_id: string; name: string }) {
    const response = await this.client.post("/graph/projects", data);
    return response.data;
  }

  async assignAgentToProject(data: {
    agent_id: string;
    project_id: string;
    role: string;
  }) {
    const response = await this.client.post("/graph/assignments/agent-project", data);
    return response.data;
  }

  // Working Memory methods
  async getWorkingMemory(contextId: string) {
    const response = await this.client.get(`/working-memory/${contextId}`);
    return response.data;
  }

  async addWorkingMemory(data: {
    context_id: string;
    content: string;
    agent_id?: string;
    project_id?: string;
    task_id?: string;
    ttl_seconds?: number;
  }) {
    const response = await this.client.post("/working-memory", data);
    return response.data;
  }

  async clearWorkingMemory(contextId: string) {
    const response = await this.client.delete(`/working-memory/${contextId}`);
    return response.data;
  }

  // Stream methods
  async captureStream(data: {
    session_id: string;
    content: string;
    direction: string;
    agent_id?: string;
    importance?: number;
    metadata?: Record<string, unknown>;
  }) {
    const response = await this.client.post("/stream/capture", data);
    return response.data;
  }

  async getStreamStats() {
    const response = await this.client.get("/stream/stats");
    return response.data;
  }

  // User methods
  async registerUser(data: {
    user_id: string;
    email: string;
    username?: string;
    home_directory?: string;
    preferences?: Record<string, unknown>;
  }) {
    const response = await this.client.post("/graph/users", data);
    return response.data;
  }

  async getUser(userId: string) {
    const response = await this.client.get(`/graph/users/${encodeURIComponent(userId)}`);
    return response.data;
  }

  async getUserMemories(email: string, limit = 20) {
    const params = new URLSearchParams({ limit: limit.toString() });
    const response = await this.client.get(`/memories/user/${encodeURIComponent(email)}?${params}`);
    return response.data;
  }

  async getProjectContext(projectId: string, taskDescription: string, userEmail?: string) {
    const response = await this.client.post("/memories/context", {
      project_id: projectId,
      task_description: taskDescription,
      user_email: userEmail,
    });
    return response.data;
  }

  // Cycle 12 - Dynamic Relevance
  async reinforceMemory(memoryId: string, boost?: number) {
    const response = await this.client.post(`/memories/${memoryId}/reinforce`, { boost });
    return response.data;
  }

  async weakenMemory(memoryId: string, penalty?: number) {
    const response = await this.client.post(`/memories/${memoryId}/weaken`, { penalty });
    return response.data;
  }

  async getTrendingMemories(projectId: string, limit?: number) {
    const response = await this.client.post("/memories/trending", {
      project_id: projectId,
      limit: limit || 10,
    });
    return response.data;
  }

  // Cycle 12 - Active Forgetting
  async detectConflicts(projectId: string, similarityThreshold?: number, limit?: number) {
    const response = await this.client.post("/consolidation/detect-conflicts", {
      project_id: projectId,
      similarity_threshold: similarityThreshold || 0.9,
      limit: limit || 50,
    });
    return response.data;
  }

  async detectRedundant(projectId: string, similarityThreshold?: number, limit?: number) {
    const response = await this.client.post("/consolidation/detect-redundant", {
      project_id: projectId,
      similarity_threshold: similarityThreshold || 0.95,
      limit: limit || 50,
    });
    return response.data;
  }

  // Cycle 12 - Hierarchical Memory
  async getHierarchyStats(projectId?: string) {
    const params = projectId ? `?project_id=${projectId}` : "";
    const response = await this.client.get(`/hierarchy/stats${params}`);
    return response.data;
  }

  async autoConsolidate(projectId: string, sourceLevel?: string, limit?: number) {
    const response = await this.client.post("/hierarchy/auto-consolidate", {
      project_id: projectId,
      source_level: sourceLevel || "raw",
      limit: limit || 100,
    });
    return response.data;
  }

  // Cycle 12 - Selective Attention
  async getAttentionProfiles() {
    const response = await this.client.get("/attention/profiles");
    return response.data;
  }

  async searchWithAttention(data: {
    query_text: string;
    project_id: string;
    task_type?: string;
    limit?: number;
  }) {
    const response = await this.client.post("/memories/search-with-attention", data);
    return response.data;
  }

  // Cycle 12 - Meta-Cognition
  async evaluateMemories(agentId?: string, projectId?: string, limit?: number) {
    const response = await this.client.post("/metacognition/evaluate", {
      agent_id: agentId,
      project_id: projectId,
      limit: limit || 100,
    });
    return response.data;
  }

  async getMetacognitionReport(agentId: string) {
    const response = await this.client.get(`/metacognition/report/${agentId}`);
    return response.data;
  }

  // Cycle 12 - Sleep Meta-Evaluation
  async runSleepCycle(projectId: string, phases?: string[]) {
    const response = await this.client.post("/sleep/run", {
      project_id: projectId,
      phases: phases || ["evaluation", "forgetting", "consolidation", "relevance"],
    });
    return response.data;
  }

  async getSleepReport() {
    const response = await this.client.get("/sleep/report");
    return response.data;
  }

  async getSleepConfig() {
    const response = await this.client.get("/sleep/config");
    return response.data;
  }

  // Cycle 12 - Transfer Learning
  async findTransferable(sourceProjectId: string, targetProjectId: string, limit?: number) {
    const response = await this.client.post("/transfer/find-transferable", {
      source_project_id: sourceProjectId,
      target_project_id: targetProjectId,
      limit: limit || 20,
    });
    return response.data;
  }

  async transferMemory(sourceMemoryId: string, targetProjectId: string, contextQuery?: string) {
    const response = await this.client.post("/transfer/memory", {
      memory_id: sourceMemoryId,
      target_project_id: targetProjectId,
      transfer_note: contextQuery,
    });
    return response.data;
  }

  // === NEW TOOLS - Cycle 12 Completion ===

  // Memory Individual Operations
  async getMemory(memoryId: string) {
    const response = await this.client.get(`/memories/${memoryId}`);
    return response.data;
  }

  async deleteMemory(memoryId: string) {
    const response = await this.client.delete(`/memories/${memoryId}`);
    // API returns 204 No Content on successful delete
    if (response.status === 204) {
      return { deleted: true };
    }
    return response.data;
  }

  // Active Forgetting - Additional
  async resolveConflict(data: {
    keep_id: string;
    supersede_id: string;
    resolution_note: string;
  }) {
    const response = await this.client.post("/consolidation/resolve-conflict", {
      keep_id: data.keep_id,
      supersede_id: data.supersede_id,
      resolution_note: data.resolution_note,
    });
    return response.data;
  }

  async markObsolete(memoryId: string, reason: string, supersededBy?: string) {
    const response = await this.client.post("/consolidation/mark-obsolete", {
      memory_id: memoryId,
      reason: reason,
      superseded_by: supersededBy,
    });
    return response.data;
  }

  // Hierarchical Memory - Additional
  async hierarchyConsolidate(data: {
    memory_ids: string[];
    summary_content?: string;
    project_id?: string;
    agent_id?: string;
  }) {
    const response = await this.client.post("/hierarchy/consolidate", {
      memory_ids: data.memory_ids,
      summary_content: data.summary_content,
      project_id: data.project_id,
      agent_id: data.agent_id,
    });
    return response.data;
  }

  async getHierarchyTree(memoryId: string) {
    const response = await this.client.get(`/hierarchy/${memoryId}/tree`);
    return response.data;
  }

  async promoteMemory(memoryId: string, targetLevel: string) {
    const response = await this.client.post(`/hierarchy/promote/${memoryId}`, {
      target_level: targetLevel,
    });
    return response.data;
  }

  // Meta-Cognition - Additional
  async getFlaggedMemories(data: {
    project_id?: string;
    agent_id?: string;
    min_issues?: number;
    limit?: number;
  }) {
    const response = await this.client.post("/metacognition/flagged", data);
    return response.data;
  }

  // Transfer Learning - Additional
  async transferBulk(data: {
    memory_ids: string[];
    target_project_id: string;
    context_similarity?: number;
    transfer_note?: string;
  }) {
    const response = await this.client.post("/transfer/bulk", {
      memory_ids: data.memory_ids,
      target_project_id: data.target_project_id,
      context_similarity: data.context_similarity,
      transfer_note: data.transfer_note,
    });
    return response.data;
  }

  async transferAdapt(data: {
    memory_id: string;
    target_project_id: string;
    context_query?: string;
  }) {
    const response = await this.client.post("/transfer/adapt", {
      memory_id: data.memory_id,
      target_project_id: data.target_project_id,
      context_query: data.context_query,
    });
    return response.data;
  }

  async getTransferHistory(memoryId: string) {
    const response = await this.client.get(`/transfer/history/${memoryId}`);
    return response.data;
  }

  // Project Management Methods
  async listProjects() {
    const response = await this.client.get("/graph/projects");
    return response.data;
  }

  async getProject(projectId: string) {
    const response = await this.client.get(`/graph/projects/${projectId}`);
    return response.data;
  }

  async searchProjects(name: string) {
    const response = await this.client.get(`/graph/projects/search/${encodeURIComponent(name)}`);
    return response.data;
  }

  async createProject(name: string, description?: string) {
    const response = await this.client.post("/graph/projects/create", { name, description });
    return response.data;
  }

  // Project Hierarchy (Subprojects)
  async linkSubproject(parentId: string, childId: string) {
    const response = await this.client.post(
      `/graph/projects/link-subproject?parent_id=${parentId}&child_id=${childId}`
    );
    return response.data;
  }

  async unlinkSubproject(parentId: string, childId: string) {
    const response = await this.client.delete(
      `/graph/projects/unlink-subproject?parent_id=${parentId}&child_id=${childId}`
    );
    return response.data;
  }

  async listSubprojects(projectId: string) {
    const response = await this.client.get(`/graph/projects/${projectId}/subprojects`);
    return response.data;
  }

  async getProjectHierarchy(projectId: string) {
    const response = await this.client.get(`/graph/projects/${projectId}/hierarchy`);
    return response.data;
  }

  // === HEARTBEAT SYSTEM ===

  async heartbeatTick(data: {
    project_id: string;
    agent_id?: string;
    context_id?: string;
    session_id?: string;
  }) {
    const response = await this.client.post("/heartbeat/tick", data);
    return response.data;
  }

  async getHeartbeatStatus() {
    const response = await this.client.get("/heartbeat/status");
    return response.data;
  }

  async configureHeartbeat(data: {
    working_memory_interval?: number;
    stream_capture_interval?: number;
    mini_sleep_interval?: number;
    normal_sleep_interval?: number;
    daily_sleep_enabled?: boolean;
    weekly_metacognition_enabled?: boolean;
  }) {
    const response = await this.client.post("/heartbeat/configure", data);
    return response.data;
  }

  async resetHeartbeat() {
    const response = await this.client.post("/heartbeat/reset");
    return response.data;
  }

  // === STREAM SYSTEM (Additional methods) ===

  async processStream(batchSize?: number) {
    const params = batchSize ? `?batch_size=${batchSize}` : "";
    const response = await this.client.post(`/stream/process${params}`);
    return response.data;
  }

  async forgetStream(thresholdDays?: number, minImportance?: number) {
    const params = new URLSearchParams();
    if (thresholdDays) params.append("threshold_days", thresholdDays.toString());
    if (minImportance !== undefined) params.append("min_importance", minImportance.toString());
    const query = params.toString() ? `?${params}` : "";
    const response = await this.client.post(`/stream/forget${query}`);
    return response.data;
  }

  async consolidateSession(sessionId: string) {
    const response = await this.client.post(`/stream/consolidate/${encodeURIComponent(sessionId)}`);
    return response.data;
  }

  async getSessionItems(sessionId: string, limit?: number) {
    const params = limit ? `?limit=${limit}` : "";
    const response = await this.client.get(`/stream/session/${encodeURIComponent(sessionId)}${params}`);
    return response.data;
  }

  async getRecentStreamItems(agentId?: string, limit?: number, includeForgotten?: boolean) {
    const params = new URLSearchParams();
    if (agentId) params.append("agent_id", agentId);
    if (limit) params.append("limit", limit.toString());
    if (includeForgotten) params.append("include_forgotten", "true");
    const query = params.toString() ? `?${params}` : "";
    const response = await this.client.get(`/stream/recent${query}`);
    return response.data;
  }

  // === CONTEXT HIERARCHY METHODS (Cycle 13) ===

  async createContext(data: {
    context_path: string;
    context_type: string;
    name: string;
    project_id: string;
    description?: string;
    parent_path?: string;
    metadata?: Record<string, unknown>;
  }) {
    const response = await this.client.post("/context/", data);
    return response.data;
  }

  async getContextTree(projectId: string) {
    const response = await this.client.get(`/context/tree/${projectId}`);
    return response.data;
  }

  async getContextMemories(contextPath: string, includeChildren?: boolean, memoryTypes?: string[], limit?: number, offset?: number) {
    const params = new URLSearchParams();
    if (includeChildren !== undefined) params.append("include_children", includeChildren.toString());
    if (memoryTypes) memoryTypes.forEach(t => params.append("memory_types", t));
    if (limit) params.append("limit", limit.toString());
    if (offset) params.append("offset", offset.toString());
    const query = params.toString() ? `?${params}` : "";
    const response = await this.client.get(`/context/${contextPath}/memories${query}`);
    return response.data;
  }

  async getContextStats(projectId: string) {
    const response = await this.client.get(`/context/stats?project_id=${projectId}`);
    return response.data;
  }

  async getContextInfo(contextPath: string) {
    const response = await this.client.get(`/context/${contextPath}/info`);
    return response.data;
  }

  async updateContext(contextPath: string, name?: string, description?: string) {
    const params = new URLSearchParams();
    if (name) params.append("name", name);
    if (description) params.append("description", description);
    const query = params.toString() ? `?${params}` : "";
    const response = await this.client.put(`/context/${contextPath}${query}`);
    return response.data;
  }

  async deleteContext(contextPath: string, force?: boolean) {
    const params = force ? `?force=${force}` : "";
    const response = await this.client.delete(`/context/${contextPath}${params}`);
    return response.data;
  }

  // === SESSION MANAGEMENT METHODS ===

  async getSessionContext(data: {
    session_id: string;
    query: string;
    agent_id?: string;
    project_id?: string;
    max_working_memory?: number;
    max_long_term?: number;
    include_topics?: boolean;
  }) {
    const response = await this.client.post("/session/context", data);
    return response.data;
  }

  async getSessionSummary(sessionId: string) {
    const response = await this.client.get(`/session/summary/${encodeURIComponent(sessionId)}`);
    return response.data;
  }

  async clearSession(sessionId: string) {
    const response = await this.client.delete(`/session/clear/${encodeURIComponent(sessionId)}`);
    return response.data;
  }

  // === GRAPH ESSENTIAL METHODS ===

  async registerSkill(data: {
    skill_id: string;
    name: string;
    skill_type: string;
  }) {
    const response = await this.client.post("/graph/skills", data);
    return response.data;
  }

  async findAgentsForTask(data: {
    required_skill_ids: string[];
    project_id?: string;
    prefer_experienced?: boolean;
    limit?: number;
  }) {
    const response = await this.client.post("/graph/agents/find", data);
    return response.data;
  }

  async syncProjectMemories(projectId: string) {
    const response = await this.client.post("/graph/sync-project-memories", { project_id: projectId });
    return response.data;
  }

  // === TEAM RELATIONSHIP METHODS ===

  async createManagesRelationship(data: {
    manager_id: string;
    subordinate_id: string;
    team_name?: string;
    since?: string;
  }) {
    const response = await this.client.post("/graph/teams/manages", data);
    return response.data;
  }

  async removeManagesRelationship(managerId: string, subordinateId: string) {
    const response = await this.client.delete("/graph/teams/manages", {
      params: { manager_id: managerId, subordinate_id: subordinateId }
    });
    return response.data;
  }

  async createCollaboration(data: {
    agent1_id: string;
    agent2_id: string;
    collaboration_type?: string;
    project_id?: string;
    strength?: number;
  }) {
    const response = await this.client.post("/graph/teams/collaborates", data);
    return response.data;
  }

  async removeCollaboration(agent1Id: string, agent2Id: string) {
    const response = await this.client.delete("/graph/teams/collaborates", {
      params: { agent1_id: agent1Id, agent2_id: agent2Id }
    });
    return response.data;
  }

  async getTeamStructure(managerId: string, includeIndirect = false) {
    const params = includeIndirect ? { include_indirect: true } : {};
    const response = await this.client.get(`/graph/teams/${managerId}/structure`, { params });
    return response.data;
  }

  async getAgentManager(agentId: string) {
    const response = await this.client.get(`/graph/agents/${agentId}/manager`);
    return response.data;
  }

  async getCollaborators(agentId: string, collaborationType?: string, minStrength?: number) {
    const params: any = {};
    if (collaborationType) params.collaboration_type = collaborationType;
    if (minStrength !== undefined) params.min_strength = minStrength;
    const response = await this.client.get(`/graph/agents/${agentId}/collaborators`, { params });
    return response.data;
  }
}

// =============================================================================
// Interaction Capture - Automatic chat interaction tracking
// =============================================================================

/**
 * Captures MCP tool calls (input and output) to the memory stream.
 *
 * This runs as fire-and-forget so it never blocks tool responses.
 * Tools related to the stream itself are excluded to avoid recursion.
 */
class InteractionCapture {
  private client: MemoryClient;
  /** Session ID - can be replaced by session_start with the formal session ID. */
  sessionId: string;

  /** Maximum characters captured per interaction. */
  private static readonly MAX_CONTENT_LENGTH = 5000;

  /** Tools that should NOT be captured (to avoid recursion / noise). */
  private static readonly EXCLUDED_TOOLS = new Set([
    "stream_capture",
    "stream_stats",
    "stream_process",
    "stream_forget",
    "stream_consolidate",
    "stream_get_session",
    "stream_get_recent",
    "heartbeat_tick",
    "heartbeat_status",
    "heartbeat_configure",
    "heartbeat_reset",
  ]);

  constructor(client: MemoryClient) {
    this.client = client;
    // One session ID per MCP server process lifetime
    this.sessionId = `mcp-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  }

  /** Returns the current session ID. */
  getSessionId(): string {
    return this.sessionId;
  }

  /** Whether this tool call should be captured. */
  private shouldCapture(toolName: string): boolean {
    return !InteractionCapture.EXCLUDED_TOOLS.has(toolName);
  }

  /** Truncate content to the max allowed length. */
  private truncate(text: string): string {
    if (text.length <= InteractionCapture.MAX_CONTENT_LENGTH) return text;
    return text.slice(0, InteractionCapture.MAX_CONTENT_LENGTH) + "... [truncated]";
  }

  /** Extract agent_id from tool arguments when available. */
  private extractAgentId(args: Record<string, unknown>): string | undefined {
    return (args.agent_id as string) || undefined;
  }

  /** Extract project_id from tool arguments when available. */
  private extractProjectId(args: Record<string, unknown>): string | undefined {
    return (args.project_id as string) || undefined;
  }

  /**
   * Capture both the input (tool call) and output (tool result) of an
   * MCP tool invocation. Failures are silently ignored.
   */
  captureToolCall(
    toolName: string,
    args: Record<string, unknown>,
    result: { content: Array<{ type: string; text: string }>; isError?: boolean },
  ): void {
    if (!this.shouldCapture(toolName)) return;

    const agentId = this.extractAgentId(args);
    const projectId = this.extractProjectId(args);
    const metadata: Record<string, unknown> = { tool_name: toolName };
    if (projectId) metadata.project_id = projectId;

    // --- Capture INPUT (the tool call) ---
    const inputContent = this.truncate(
      `[MCP Tool Call] ${toolName}\n${JSON.stringify(args, null, 2)}`
    );

    this.client
      .captureStream({
        session_id: this.sessionId,
        content: inputContent,
        direction: "input",
        agent_id: agentId,
        importance: this.importanceFor(toolName, "input"),
        metadata,
      })
      .catch(() => {
        // Silently ignore capture failures
      });

    // --- Capture OUTPUT (the tool result) ---
    const outputTexts = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    const outputContent = this.truncate(
      `[MCP Tool Result] ${toolName}${result.isError ? " (ERROR)" : ""}\n${outputTexts}`
    );

    this.client
      .captureStream({
        session_id: this.sessionId,
        content: outputContent,
        direction: "output",
        agent_id: agentId,
        importance: this.importanceFor(toolName, "output"),
        metadata: { ...metadata, is_error: result.isError || false },
      })
      .catch(() => {
        // Silently ignore capture failures
      });
  }

  /**
   * Assign importance based on tool name and direction.
   * Higher importance for tools that store/modify data, lower for reads.
   */
  private importanceFor(toolName: string, direction: "input" | "output"): number {
    // Write / mutate operations are more important
    const highImportance = new Set([
      "memory_store",
      "working_memory_add",
      "graph_register_agent",
      "graph_register_project",
      "graph_assign_agent_project",
      "graph_register_skill",
      "context_create",
      "session_start",
      "session_end",
      "sleep_run",
      "consolidation_resolve_conflict",
      "consolidation_mark_obsolete",
    ]);

    if (highImportance.has(toolName)) {
      return direction === "input" ? 0.7 : 0.6;
    }

    // Read / search operations
    return direction === "input" ? 0.4 : 0.3;
  }
}

// Define tools
const TOOLS: Tool[] = [
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
- agent: Private to the agent
- project: Shared within the project
- global: Available to all agents`,
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
          enum: ["agent", "project", "global", "user", "skill"],
          description: "Visibility scope (default: project)",
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
    description: `Get working memory for a context (agent, project, or skill).

CRITICAL: Always call this at the START of any task to load current state.
Working memory contains the agent's current role, responsibilities, and task state.

Context ID formats:
- agent:{uuid} - Agent's working memory
- project:{uuid} - Project's working memory
- skill:{uuid} - Skill's working memory`,
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

// Helper function for handling 401/403 API errors
function handleApiError(error: any): { content: { type: string; text: string }[]; isError: true } | null {
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

// Main server
async function main() {
  // Require API key (AGENCIA_API_KEY preferred, AGENCIA_MEMORY_API_KEY for backward compat)
  const apiKey = process.env.AGENCIA_API_KEY || process.env.AGENCIA_MEMORY_API_KEY;
  if (!apiKey) {
    console.error("[FATAL] AGENCIA_API_KEY environment variable is required but not set.");
    console.error("Generate an API key in the A.G.E.N.C.I.A. dashboard or via the Control Plane API.");
    process.exit(1);
  }

  const memoryClient = new MemoryClient(MEMORY_SERVICE_URL, apiKey);
  const capture = new InteractionCapture(memoryClient);

  console.error(`[InteractionCapture] Session: ${capture.getSessionId()}`);

  // Validate API key and resolve tenant identity at startup
  try {
    const me = await memoryClient.getAuthMe();
    resolvedUserEmail = me.email || me.user?.email || null;
    resolvedUserId = me.id || me.user?.id || me.user_id || null;

    // Resolve tenant org ID from /auth/me response (env var takes precedence)
    const meOrgId = me.organization_id || me.org_id || me.user?.organization_id || null;
    if (!resolvedTenantOrgId && meOrgId) {
      resolvedTenantOrgId = meOrgId;
    }

    console.error(`[Auth] API key validated. User: ${resolvedUserEmail}, Tenant: ${resolvedTenantOrgId || 'none'}`);
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      console.error(`[FATAL] API key rejected (HTTP ${status}). Check AGENCIA_API_KEY.`);
    } else {
      console.error(`[FATAL] Failed to validate API key: ${err?.message || err}`);
    }
    process.exit(1);
  }

  const server = new Server(
    {
      name: "a.g.e.n.c.i.a.",
      version: "0.1.0",
    },
    {
      capabilities: {
        tools: {},
      },
    }
  );

  // List tools handler (all tools always visible; backend enforces auth)
  server.setRequestHandler(ListToolsRequestSchema, async () => ({
    tools: TOOLS,
  }));

  // Call tool handler (with automatic interaction capture)
  server.setRequestHandler(CallToolRequestSchema, async (request) => {
    const { name, arguments: args = {} } = request.params;

    // Execute the tool and capture the result for stream tracking
    const toolResult = await (async () => {
    try {
      switch (name) {
        case "memory_store": {
          // Auto-inject user fields from startup /auth/me if not provided
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
          });
          return {
            content: [
              {
                type: "text",
                text: `Memory stored successfully.\nID: ${result.id}\nType: ${result.memory_type}\nScope: ${result.scope}`,
              },
            ],
          };
        }

        case "memory_search": {
          const results = await memoryClient.searchMemories({
            query_text: args.query_text as string,
            agent_id: args.agent_id as string,
            project_id: args.project_id as string,
            memory_types: args.memory_types as string[],
            limit: args.limit as number,
          });

          if (!results || results.length === 0) {
            return {
              content: [{ type: "text", text: "No memories found matching the query." }],
            };
          }

          let formatted = "Found memories:\n\n";
          results.forEach((mem: any, i: number) => {
            formatted += `${i + 1}. [${mem.memory_type}] (similarity: ${(mem.similarity || 0).toFixed(2)})\n`;
            formatted += `   ${mem.content}\n\n`;
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        case "memory_get_context": {
          const result = await memoryClient.buildContext({
            agent_id: args.agent_id as string,
            task_description: args.task_description as string,
            project_id: args.project_id as string,
            max_tokens: args.max_tokens as number,
          });

          if (!result.context) {
            return {
              content: [{ type: "text", text: "No relevant context found for this task." }],
            };
          }

          return {
            content: [{ type: "text", text: `Context from memory:\n\n${result.context}` }],
          };
        }

        case "memory_list": {
          const results = await memoryClient.getAgentMemories(
            args.agent_id as string,
            args.memory_type as string,
            (args.limit as number) || 50
          );

          if (!results || results.length === 0) {
            return {
              content: [{ type: "text", text: "No memories found for this agent." }],
            };
          }

          let formatted = `Memories for agent ${args.agent_id}:\n\n`;
          results.forEach((mem: any, i: number) => {
            const content = mem.content.length > 200 ? mem.content.slice(0, 200) + "..." : mem.content;
            formatted += `${i + 1}. [${mem.memory_type}] (importance: ${(mem.importance || 0).toFixed(2)})\n`;
            formatted += `   ${content}\n\n`;
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        case "graph_register_agent": {
          const result = await memoryClient.registerAgent({
            agent_id: args.agent_id as string,
            name: args.name as string,
            agent_type: args.agent_type as string,
          });
          return {
            content: [
              {
                type: "text",
                text: `Agent registered.\nStatus: ${result.status}\nID: ${result.agent_id}`,
              },
            ],
          };
        }

        case "graph_register_project": {
          const result = await memoryClient.registerProject({
            project_id: args.project_id as string,
            name: args.name as string,
          });
          return {
            content: [
              {
                type: "text",
                text: `Project registered.\nStatus: ${result.status}\nID: ${result.project_id}`,
              },
            ],
          };
        }

        case "graph_assign_agent_project": {
          const result = await memoryClient.assignAgentToProject({
            agent_id: args.agent_id as string,
            project_id: args.project_id as string,
            role: args.role as string,
          });
          return {
            content: [
              {
                type: "text",
                text: `Agent assigned to project.\nAgent: ${result.agent_id}\nProject: ${result.project_id}`,
              },
            ],
          };
        }

        // Working Memory handlers
        case "working_memory_get": {
          const result = await memoryClient.getWorkingMemory(args.context_id as string);

          if (!result.items || result.items.length === 0) {
            return {
              content: [{ type: "text", text: `No working memory for context: ${args.context_id}` }],
            };
          }

          let formatted = `Working Memory [${args.context_id}] (${result.count}/${result.max_items} items):\n\n`;
          result.items.forEach((item: any, i: number) => {
            formatted += `${i + 1}. ${item.content}\n`;
            if (item.created_at) formatted += `   Created: ${item.created_at}\n`;
            formatted += "\n";
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        case "working_memory_add": {
          const result = await memoryClient.addWorkingMemory({
            context_id: args.context_id as string,
            content: args.content as string,
            agent_id: args.agent_id as string,
            project_id: args.project_id as string,
            ttl_seconds: args.ttl_seconds as number,
          });
          return {
            content: [
              {
                type: "text",
                text: `Working memory updated.\nContext: ${args.context_id}\nID: ${result.id}`,
              },
            ],
          };
        }

        case "working_memory_clear": {
          const result = await memoryClient.clearWorkingMemory(args.context_id as string);
          return {
            content: [
              {
                type: "text",
                text: `Working memory cleared.\nContext: ${args.context_id}\nItems removed: ${result.items_cleared}`,
              },
            ],
          };
        }

        // Stream handlers
        case "stream_capture": {
          const result = await memoryClient.captureStream({
            session_id: args.session_id as string,
            content: args.content as string,
            direction: args.direction as string,
            agent_id: args.agent_id as string,
            importance: args.importance as number,
          });
          return {
            content: [
              {
                type: "text",
                text: `Captured to stream.\nSession: ${args.session_id}\nID: ${result.id}`,
              },
            ],
          };
        }

        case "stream_stats": {
          const result = await memoryClient.getStreamStats();
          return {
            content: [
              {
                type: "text",
                text: `Memory Stream Stats:\n- Total: ${result.total}\n- Unprocessed: ${result.unprocessed}\n- Consolidated: ${result.consolidated}\n- Forgotten: ${result.forgotten}\n- Avg Importance: ${(result.avg_importance || 0).toFixed(2)}`,
              },
            ],
          };
        }

        // User handlers
        case "user_register": {
          const email = args.email as string;
          const password = args.password as string;
          const firstName = args.first_name as string;
          const lastName = args.last_name as string;
          const orgName = args.org_name as string;
          const orgSlug = args.org_slug as string;

          try {
            const registerRes = await axios.post(`${CP_URL}/api/v1/auth/register`, {
              email,
              password,
              first_name: firstName,
              last_name: lastName,
              org_name: orgName,
              org_slug: orgSlug,
            });

            const data = registerRes.data;

            let text = `Registration successful!\n`;
            text += `User: ${data.user?.name} (${data.user?.email})\n`;
            if (data.organization) {
              text += `Organization: ${data.organization.name} (${data.organization.slug})\n`;
              text += `API Key: ${data.organization.api_key}\n`;
              text += `Tenant DB: agencia_tenant_${data.organization.slug.replace(/-/g, '_')}\n`;
            }
            text += `\nUse the returned API key in AGENCIA_API_KEY to authenticate.`;

            return { content: [{ type: "text", text }] };
          } catch (error: any) {
            const detail = error?.response?.data?.detail;
            const message = typeof detail === 'string' ? detail : error.message || 'Registration failed';
            return {
              content: [{ type: "text", text: `Registration failed: ${message}` }],
              isError: true,
            };
          }
        }

        case "user_get_context": {
          const projectId = args.project_id as string;
          const taskDescription = args.task_description as string || "general context";
          const userEmail = args.user_email as string;

          // Get project context
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

          if (userEmail) {
            formatted += `\n\nUser: ${userEmail}`;
          }

          return {
            content: [{ type: "text", text: formatted }],
          };
        }

        // Session management handlers
        case "session_start": {
          // Validate required project_id
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

            // Format context response
            let msg = `Session started: ${result.session_id}\n`;
            msg += `Project: ${projectId}\n`;
            if (result.parent_session_id) {
              msg += `Parent session: ${result.parent_session_id}\n`;
            }
            msg += "\n";

            if (result.agent_context) {
              msg += `## Agent Context\n${result.agent_context}\n\n`;
            }
            if (result.project_context) {
              msg += `## Project Context\n${result.project_context}\n\n`;
            }
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
            // Check for 400 validation error
            if (error?.response?.status === 400) {
              return {
                content: [{ type: "text", text: `Validation error: ${error.response.data?.detail || "invalid request"}` }],
                isError: true,
              };
            }
            throw error;
          }
        }

        case "session_end": {
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
        }

        // Cycle 12 - Dynamic Relevance handlers
        case "memory_reinforce": {
          const result = await memoryClient.reinforceMemory(
            args.memory_id as string,
            args.boost as number
          );
          return {
            content: [{
              type: "text",
              text: `Memory reinforced.\nID: ${args.memory_id}\nNew relevance: ${result.relevance_score?.toFixed(3) || 'updated'}`,
            }],
          };
        }

        case "memory_weaken": {
          const result = await memoryClient.weakenMemory(
            args.memory_id as string,
            args.penalty as number
          );
          return {
            content: [{
              type: "text",
              text: `Memory weakened.\nID: ${args.memory_id}\nNew relevance: ${result.relevance_score?.toFixed(3) || 'updated'}`,
            }],
          };
        }

        case "memory_trending": {
          const result = await memoryClient.getTrendingMemories(
            args.project_id as string,
            args.limit as number
          );

          const trendingItems = result.memories || [];
          if (!trendingItems || trendingItems.length === 0) {
            return { content: [{ type: "text", text: "No trending memories found." }] };
          }

          let formatted = `Trending memories (${result.direction || 'rising'}):\n\n`;
          trendingItems.forEach((item: any, i: number) => {
            // API returns {memory: {...}, relevance_trend: ..., dynamic_importance: ..., usage_count_7d: ...}
            const mem = item.memory || item;
            const trend = item.relevance_trend;
            const dynImportance = item.dynamic_importance;
            const usageCount = item.usage_count_7d;

            formatted += `${i + 1}. [${mem.memory_type}] (importance: ${dynImportance?.toFixed(2) || mem.importance?.toFixed(2) || 'N/A'})\n`;
            formatted += `   Trend: ${trend?.toFixed(2) || 'N/A'} | Usage (7d): ${usageCount || 0}\n`;
            formatted += `   ${mem.content?.slice(0, 150)}...\n\n`;
          });
          return { content: [{ type: "text", text: formatted }] };
        }

        // Cycle 12 - Active Forgetting handlers
        case "consolidation_detect_conflicts": {
          const result = await memoryClient.detectConflicts(
            args.project_id as string,
            args.similarity_threshold as number,
            args.limit as number
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
        }

        case "consolidation_detect_redundant": {
          const result = await memoryClient.detectRedundant(
            args.project_id as string,
            args.similarity_threshold as number,
            args.limit as number
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
        }

        // Cycle 12 - Hierarchical Memory handlers
        case "hierarchy_stats": {
          const result = await memoryClient.getHierarchyStats(args.project_id as string);
          const levels = result.levels || {};
          return {
            content: [{
              type: "text",
              text: `Hierarchy Statistics:\n- Raw: ${levels.raw?.count || 0}\n- Chunk: ${levels.chunk?.count || 0}\n- Summary: ${levels.summary?.count || 0}\n- Abstract: ${levels.abstract?.count || 0}\n- Total: ${result.total || 0}\n- Consolidated: ${result.total_consolidated || 0}`,
            }],
          };
        }

        case "hierarchy_auto_consolidate": {
          const result = await memoryClient.autoConsolidate(
            args.project_id as string,
            args.source_level as string,
            args.limit as number
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
        }

        // Cycle 12 - Selective Attention handlers
        case "attention_profiles": {
          const result = await memoryClient.getAttentionProfiles();

          let formatted = "Attention Profiles:\n\n";

          // API returns {default_profiles: [...], custom_profiles: [...]}
          const defaultProfiles = result.default_profiles || [];
          const customProfiles = result.custom_profiles || [];

          if (defaultProfiles.length > 0) {
            formatted += "Default Profiles:\n";
            defaultProfiles.forEach((profile: any) => {
              formatted += `\n${profile.name} (${profile.task_type}):\n`;
              formatted += `  procedural: ${profile.weights.procedural}, semantic: ${profile.weights.semantic}, episodic: ${profile.weights.episodic}\n`;
              if (profile.description) {
                formatted += `  description: ${profile.description}\n`;
              }
            });
          }

          if (customProfiles.length > 0) {
            formatted += "\nCustom Profiles:\n";
            customProfiles.forEach((profile: any) => {
              formatted += `\n${profile.name} (${profile.task_type}):\n`;
              formatted += `  procedural: ${profile.weights.procedural}, semantic: ${profile.weights.semantic}, episodic: ${profile.weights.episodic}\n`;
              if (profile.description) {
                formatted += `  description: ${profile.description}\n`;
              }
            });
          }

          return { content: [{ type: "text", text: formatted }] };
        }

        case "search_with_attention": {
          const results = await memoryClient.searchWithAttention({
            query_text: args.query_text as string,
            project_id: args.project_id as string,
            task_type: args.task_type as string,
            limit: args.limit as number,
          });

          // API returns {memories: [...], task_type_used: ..., weights_used: ...}
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
        }

        // Cycle 12 - Meta-Cognition handlers
        case "metacognition_evaluate": {
          const result = await memoryClient.evaluateMemories(
            args.agent_id as string,
            args.project_id as string,
            args.limit as number
          );
          return {
            content: [{
              type: "text",
              text: `Evaluation complete.\nMemories evaluated: ${result.evaluated || 0}\nAverage score: ${result.average_score?.toFixed(2) || 'N/A'}\nFlagged for review: ${result.flagged || 0}`,
            }],
          };
        }

        case "metacognition_report": {
          const result = await memoryClient.getMetacognitionReport(args.agent_id as string);
          return {
            content: [{
              type: "text",
              text: `Meta-Cognition Report for ${args.agent_id}:\n- Precision: ${result.precision?.toFixed(2) || 'N/A'}\n- Freshness: ${result.freshness?.toFixed(2) || 'N/A'}\n- Consistency: ${result.consistency?.toFixed(2) || 'N/A'}\n- Overall Score: ${result.overall_score?.toFixed(2) || 'N/A'}\n- Total Memories: ${result.total_memories || 0}`,
            }],
          };
        }

        // Cycle 12 - Sleep handlers
        case "sleep_run": {
          const result = await memoryClient.runSleepCycle(
            args.project_id as string,
            args.phases as string[]
          );

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
        }

        case "sleep_report": {
          const result = await memoryClient.getSleepReport();
          return {
            content: [{
              type: "text",
              text: `Sleep Report:\n- Last Run: ${result.last_run || 'Never'}\n- Status: ${result.status || 'Unknown'}\n- Total Memories: ${result.total_memories || 0}\n- Pending Consolidation: ${result.pending_consolidation || 0}`,
            }],
          };
        }

        case "sleep_config": {
          const result = await memoryClient.getSleepConfig();
          return {
            content: [{
              type: "text",
              text: `Sleep Configuration:\n${JSON.stringify(result, null, 2)}`,
            }],
          };
        }

        // Cycle 12 - Transfer Learning handlers
        case "transfer_find_candidates": {
          const result = await memoryClient.findTransferable(
            args.source_project_id as string,
            args.target_project_id as string,
            args.limit as number
          );

          // API returns array of candidates directly
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
        }

        case "transfer_memory": {
          const result = await memoryClient.transferMemory(
            args.source_memory_id as string,
            args.target_project_id as string,
            args.context_query as string
          );
          return {
            content: [{
              type: "text",
              text: `Memory transferred.\nSource: ${args.source_memory_id}\nNew ID: ${result.new_memory_id || result.id}\nTarget Project: ${args.target_project_id}`,
            }],
          };
        }

        // === NEW HANDLERS - Cycle 12 Completion ===

        // Memory Individual Operations
        case "memory_get": {
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
        }

        case "memory_delete": {
          const result = await memoryClient.deleteMemory(args.memory_id as string);
          return {
            content: [{
              type: "text",
              text: `Memory deleted.\nID: ${args.memory_id}\nStatus: ${result.status || 'deleted'}`,
            }],
          };
        }

        // Active Forgetting - Additional handlers
        case "consolidation_resolve_conflict": {
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
        }

        case "consolidation_mark_obsolete": {
          const result = await memoryClient.markObsolete(
            args.memory_id as string,
            args.reason as string,
            args.superseded_by as string
          );
          return {
            content: [{
              type: "text",
              text: `Memory marked obsolete.\nID: ${args.memory_id}\nReason: ${args.reason}\nSuperseded by: ${args.superseded_by || 'none'}\nSuccess: ${result.success}`,
            }],
          };
        }

        // Hierarchical Memory - Additional handlers
        case "hierarchy_consolidate": {
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
        }

        case "hierarchy_get_tree": {
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
        }

        case "hierarchy_promote": {
          const result = await memoryClient.promoteMemory(
            args.memory_id as string,
            args.target_level as string
          );
          return {
            content: [{
              type: "text",
              text: `Memory promoted.\nID: ${args.memory_id}\nNew Level: ${result.hierarchy_level || args.target_level}\nPrevious Level: ${result.previous_level || 'unknown'}`,
            }],
          };
        }

        // Meta-Cognition - Additional handler
        case "metacognition_flagged": {
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
        }

        // Transfer Learning - Additional handlers
        case "transfer_bulk": {
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
        }

        case "transfer_adapt": {
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

          if (result.content_preview) {
            formatted += `\nContent Preview: ${result.content_preview}`;
          }

          return { content: [{ type: "text", text: formatted }] };
        }

        case "transfer_history": {
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
            if (result.transfer_note) {
              formatted += `  Transfer Note: ${result.transfer_note}\n`;
            }
          }

          return { content: [{ type: "text", text: formatted }] };
        }

        // === PROJECT MANAGEMENT HANDLERS ===

        case "project_list": {
          const projects = await memoryClient.listProjects();

          if (!projects || projects.length === 0) {
            return { content: [{ type: "text", text: "No projects found." }] };
          }

          let formatted = `Available Projects (${projects.length}):\n\n`;
          projects.forEach((p: any, i: number) => {
            formatted += `${i + 1}. ${p.name}\n`;
            formatted += `   ID: ${p.project_id}\n`;
            if (p.description) {
              formatted += `   Description: ${p.description}\n`;
            }
            formatted += `   Memories: ${p.memory_count || 0}\n\n`;
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        case "project_get": {
          const project = await memoryClient.getProject(args.project_id as string);

          let formatted = `Project Details:\n\n`;
          formatted += `Name: ${project.name}\n`;
          formatted += `ID: ${project.project_id}\n`;
          if (project.description) {
            formatted += `Description: ${project.description}\n`;
          }
          formatted += `Memories: ${project.memory_count || 0}\n`;
          if (project.created_at) {
            formatted += `Created: ${project.created_at}\n`;
          }
          if (project.updated_at) {
            formatted += `Updated: ${project.updated_at}\n`;
          }

          return { content: [{ type: "text", text: formatted }] };
        }

        case "project_search": {
          const projects = await memoryClient.searchProjects(args.name as string);

          if (!projects || projects.length === 0) {
            return { content: [{ type: "text", text: `No projects found matching "${args.name}"` }] };
          }

          let formatted = `Projects matching "${args.name}" (${projects.length}):\n\n`;
          projects.forEach((p: any, i: number) => {
            formatted += `${i + 1}. ${p.name}\n`;
            formatted += `   ID: ${p.project_id}\n`;
            if (p.description) {
              formatted += `   Description: ${p.description}\n`;
            }
            formatted += `   Memories: ${p.memory_count || 0}\n\n`;
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        case "project_create": {
          const project = await memoryClient.createProject(
            args.name as string,
            args.description as string | undefined
          );

          let formatted = `Project created successfully!\n\n`;
          formatted += `Name: ${project.name}\n`;
          formatted += `ID: ${project.project_id}\n`;
          if (project.description) {
            formatted += `Description: ${project.description}\n`;
          }
          formatted += `\nYou can now use this project_id to store memories.`;

          return { content: [{ type: "text", text: formatted }] };
        }

        // === PROJECT HIERARCHY HANDLERS ===

        case "project_link_subproject": {
          const result = await memoryClient.linkSubproject(
            args.parent_id as string,
            args.child_id as string
          );

          let formatted = `Subproject linked successfully!\n\n`;
          formatted += `Parent: ${result.parent_name} (${result.parent_id})\n`;
          formatted += `Child: ${result.child_name} (${result.child_id})\n`;
          formatted += `Status: ${result.status}\n`;

          return { content: [{ type: "text", text: formatted }] };
        }

        case "project_unlink_subproject": {
          const result = await memoryClient.unlinkSubproject(
            args.parent_id as string,
            args.child_id as string
          );

          let formatted = result.removed
            ? `Subproject unlinked successfully.\n`
            : `No subproject relationship found to remove.\n`;
          formatted += `Parent ID: ${result.parent_id}\n`;
          formatted += `Child ID: ${result.child_id}\n`;

          return { content: [{ type: "text", text: formatted }] };
        }

        case "project_list_subprojects": {
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
            if (p.description) {
              formatted += `${indent}   Description: ${p.description}\n`;
            }
            formatted += `\n`;
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        case "project_get_hierarchy": {
          const hierarchy = await memoryClient.getProjectHierarchy(args.project_id as string);

          let formatted = `Project Hierarchy\n\n`;
          formatted += `Project: ${hierarchy.name}\n`;
          formatted += `ID: ${hierarchy.project_id}\n`;
          if (hierarchy.description) {
            formatted += `Description: ${hierarchy.description}\n`;
          }

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
        }

        // === HEARTBEAT SYSTEM HANDLERS ===

        case "heartbeat_tick": {
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
              if (action.error) {
                formatted += `     Error: ${action.error}\n`;
              }
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
        }

        case "heartbeat_status": {
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
            if (result.config.last_daily_sleep) {
              formatted += `  Last Daily Sleep: ${result.config.last_daily_sleep}\n`;
            }
            if (result.config.last_weekly_metacognition) {
              formatted += `  Last Weekly Metacognition: ${result.config.last_weekly_metacognition}\n`;
            }
            formatted += `\n`;
          }

          if (result.actions_history && Object.keys(result.actions_history).length > 0) {
            formatted += `Actions History:\n`;
            for (const [action, count] of Object.entries(result.actions_history)) {
              formatted += `  ${action}: ${count} times\n`;
            }
          }

          return { content: [{ type: "text", text: formatted }] };
        }

        case "heartbeat_configure": {
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
        }

        case "heartbeat_reset": {
          const result = await memoryClient.resetHeartbeat();
          return {
            content: [{
              type: "text",
              text: `Heartbeat Reset\n\n${result.message}\nInteraction Count: ${result.interaction_count}`,
            }],
          };
        }

        // === STREAM SYSTEM HANDLERS (Additional) ===

        case "stream_process": {
          const result = await memoryClient.processStream(args.batch_size as number);

          let formatted = `Stream Processing Complete\n`;
          formatted += `==========================\n\n`;
          formatted += `Processed: ${result.processed}\n`;
          formatted += `Promoted to Memories: ${result.promoted}\n`;
          formatted += `Discarded: ${result.discarded}\n`;

          return { content: [{ type: "text", text: formatted }] };
        }

        case "stream_forget": {
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
        }

        case "stream_consolidate": {
          const result = await memoryClient.consolidateSession(args.session_id as string);

          let formatted = `Session Consolidation Complete\n`;
          formatted += `==============================\n\n`;
          formatted += `Session: ${args.session_id}\n`;
          formatted += `Items Consolidated: ${result.consolidated}\n`;
          formatted += `Summary Created: ${result.summary_created ? 'Yes' : 'No'}\n`;

          return { content: [{ type: "text", text: formatted }] };
        }

        case "stream_get_session": {
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
            if (item.timestamp) {
              formatted += `   Time: ${item.timestamp}\n`;
            }
            formatted += `\n`;
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        case "stream_get_recent": {
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
            if (item.timestamp) {
              formatted += `   Time: ${item.timestamp}\n`;
            }
            formatted += `\n`;
          });

          return { content: [{ type: "text", text: formatted }] };
        }

        // === CONTEXT HIERARCHY HANDLERS (Cycle 13) ===

        case "context_create": {
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
          if (result.parent_path) {
            formatted += `Parent: ${result.parent_path}\n`;
          }
          if (result.description) {
            formatted += `Description: ${result.description}\n`;
          }

          return { content: [{ type: "text", text: formatted }] };
        }

        case "context_tree": {
          const result = await memoryClient.getContextTree(args.project_id as string);

          if (!result.root) {
            return { content: [{ type: "text", text: `No context tree found for project ${args.project_id}` }] };
          }

          let formatted = `Context Tree for Project ${args.project_id}\n`;
          formatted += `==============================================\n\n`;
          formatted += `Total Contexts: ${result.total_contexts}\n`;
          formatted += `Total Memories: ${result.total_memories}\n\n`;

          // Recursive tree formatter
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
        }

        case "context_memories": {
          const result = await memoryClient.getContextMemories(
            args.context_path as string,
            args.include_children as boolean,
            args.memory_types as string[],
            args.limit as number,
            args.offset as number
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
        }

        case "context_stats": {
          const result = await memoryClient.getContextStats(args.project_id as string);

          let formatted = `Context Statistics for Project ${args.project_id}\n`;
          formatted += `=================================================\n\n`;
          formatted += `Total Contexts: ${result.total_contexts}\n`;
          formatted += `Total Memories: ${result.total_memories}\n`;
          formatted += `Max Depth: ${result.max_depth}\n`;
          if (result.deepest_path) {
            formatted += `Deepest Path: ${result.deepest_path}\n`;
          }
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
        }

        case "context_info": {
          const result = await memoryClient.getContextInfo(args.context_path as string);

          let formatted = `Context Info: ${result.context_path}\n`;
          formatted += `=====================================\n\n`;
          formatted += `Type: ${result.context_type}\n`;
          formatted += `Name: ${result.name}\n`;
          if (result.description) {
            formatted += `Description: ${result.description}\n`;
          }
          formatted += `Project ID: ${result.project_id}\n`;
          formatted += `Memory Count (direct): ${result.memory_count}\n`;
          formatted += `Memory Count (recursive): ${result.memory_count_recursive}\n`;
          if (result.parent_path) {
            formatted += `Parent: ${result.parent_path}\n`;
          }
          if (result.ancestors && result.ancestors.length > 0) {
            formatted += `Ancestors: ${result.ancestors.join(' > ')}\n`;
          }
          if (result.children && result.children.length > 0) {
            formatted += `Children: ${result.children.join(', ')}\n`;
          }
          formatted += `Created: ${result.created_at}\n`;
          if (result.updated_at) {
            formatted += `Updated: ${result.updated_at}\n`;
          }

          return { content: [{ type: "text", text: formatted }] };
        }

        case "context_update": {
          const result = await memoryClient.updateContext(
            args.context_path as string,
            args.name as string,
            args.description as string
          );

          let formatted = `Context Updated\n`;
          formatted += `===============\n\n`;
          formatted += `Path: ${result.context_path}\n`;
          formatted += `Name: ${result.name}\n`;
          if (result.description) {
            formatted += `Description: ${result.description}\n`;
          }
          formatted += `Updated At: ${result.updated_at}\n`;

          return { content: [{ type: "text", text: formatted }] };
        }

        case "context_delete": {
          await memoryClient.deleteContext(
            args.context_path as string,
            args.force as boolean
          );
          return {
            content: [{
              type: "text",
              text: `Context deleted: ${args.context_path}`,
            }],
          };
        }

        // === SESSION MANAGEMENT HANDLERS ===

        case "session_context": {
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
        }

        case "session_summary": {
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
        }

        case "session_clear": {
          const result = await memoryClient.clearSession(args.session_id as string);
          return {
            content: [{
              type: "text",
              text: `Session cleared: ${args.session_id}\nItems removed: ${result.items_cleared || 0}`,
            }],
          };
        }

        // === GRAPH ESSENTIAL HANDLERS ===

        case "graph_register_skill": {
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
        }

        case "graph_find_agents": {
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
        }

        case "graph_sync_memories": {
          const result = await memoryClient.syncProjectMemories(args.project_id as string);

          let formatted = `Project Memories Synced\n`;
          formatted += `======================\n\n`;
          formatted += `Project: ${result.project_id}\n`;
          formatted += `Memories Synced: ${result.memories_synced}\n`;
          formatted += `Already Linked: ${result.already_linked}\n`;
          formatted += `\n${result.message}`;

          return { content: [{ type: "text", text: formatted }] };
        }

        // === TEAM RELATIONSHIP HANDLERS ===

        case "graph_create_manages": {
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
        }

        case "graph_remove_manages": {
          const result = await memoryClient.removeManagesRelationship(
            args.manager_id as string,
            args.subordinate_id as string
          );

          let formatted = `MANAGES Relationship Removed\n`;
          formatted += `============================\n\n`;
          formatted += `Manager: ${args.manager_id}\n`;
          formatted += `Subordinate: ${args.subordinate_id}\n`;
          formatted += `Deleted: ${result.deleted ? 'Yes' : 'No'}`;

          return { content: [{ type: "text", text: formatted }] };
        }

        case "graph_create_collaboration": {
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
        }

        case "graph_remove_collaboration": {
          const result = await memoryClient.removeCollaboration(
            args.agent1_id as string,
            args.agent2_id as string
          );

          let formatted = `COLLABORATES_WITH Relationship Removed\n`;
          formatted += `======================================\n\n`;
          formatted += `Agent 1: ${args.agent1_id}\n`;
          formatted += `Agent 2: ${args.agent2_id}\n`;
          formatted += `Deleted: ${result.deleted ? 'Yes' : 'No'}`;

          return { content: [{ type: "text", text: formatted }] };
        }

        case "graph_get_team_structure": {
          const result = await memoryClient.getTeamStructure(
            args.manager_id as string,
            args.include_indirect as boolean
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
        }

        case "graph_get_agent_manager": {
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
        }

        case "graph_get_collaborators": {
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
        }

        default:
          return {
            content: [{ type: "text", text: `Unknown tool: ${name}` }],
            isError: true,
          };
      }
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
    })(); // end of inner async IIFE

    // Fire-and-forget: capture the tool call interaction to the memory stream
    capture.captureToolCall(name, args as Record<string, unknown>, toolResult);

    return toolResult;
  });

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Memory Server running on stdio");
}

main().catch(console.error);
