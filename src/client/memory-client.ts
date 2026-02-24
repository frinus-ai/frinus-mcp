/**
 * HTTP client for the Frinus Memory Service.
 */
import axios, { AxiosInstance } from "axios";
import type { MemoryClientInterface } from "../types/index.js";

/**
 * Mutable tenant / user state resolved at startup.
 * Shared with the rest of the server via the exported getters/setters below.
 */
let resolvedTenantOrgId: string | null = process.env.FRINUS_TENANT_ORG_ID || null;
let resolvedUserEmail: string | null = null;
let resolvedUserId: string | null = null;

export function getResolvedTenantOrgId(): string | null { return resolvedTenantOrgId; }
export function setResolvedTenantOrgId(v: string | null): void { resolvedTenantOrgId = v; }

export function getResolvedUserEmail(): string | null { return resolvedUserEmail; }
export function setResolvedUserEmail(v: string | null): void { resolvedUserEmail = v; }

export function getResolvedUserId(): string | null { return resolvedUserId; }
export function setResolvedUserId(v: string | null): void { resolvedUserId = v; }

// Memory service client
export class MemoryClient implements MemoryClientInterface {
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
      scope: data.scope || "organization",
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
    agent_id?: string;
    user_id?: string;
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
