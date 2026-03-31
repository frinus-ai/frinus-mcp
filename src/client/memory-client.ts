/**
 * HTTP client for the Frinus Memory Service.
 */
import axios, { AxiosInstance } from "axios";
import type { MemoryClientInterface } from "../types/index.js";

/**
 * Mutable tenant / user state resolved at startup.
 * Shared with the rest of the server via the exported getters/setters below.
 *
 * NOTE: These are module-level singletons, not instance properties, because
 * they are consumed by multiple client classes (MemoryClient, AgentClient,
 * CpClient) and tool handlers via Axios request interceptors that capture
 * the getter at construction time.  Moving them to a single class instance
 * would require threading that instance through every consumer, which is
 * disproportionate for an MCP server that runs as a single-process stdio
 * bridge.  Use `resetState()` in tests or when reinitializing the server.
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

/** Reset all mutable module state. Useful for tests or server reinitialization. */
export function resetState(): void {
  resolvedTenantOrgId = process.env.FRINUS_TENANT_ORG_ID || null;
  resolvedUserEmail = null;
  resolvedUserId = null;
}

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

  // =========================================================================
  // Session Management
  // =========================================================================

  async startSession(data: {
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

  async getSessionContext(data: {
    session_id: string;
    query: string;
    agent_id?: string;
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

  // =========================================================================
  // Core Memory CRUD
  // =========================================================================

  async storeMemory(data: {
    agent_id: string;
    content: string;
    memory_type?: string;
    scope?: string;
    importance?: number;
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
    memory_types?: string[];
    limit?: number;
  }) {
    const response = await this.client.post("/memories/search", {
      query_text: data.query_text,
      agent_id: data.agent_id,
      memory_types: data.memory_types,
      limit: data.limit || 10,
    });
    return response.data;
  }

  async getMemory(memoryId: string) {
    const response = await this.client.get(`/memories/${memoryId}`);
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

  async deleteMemory(memoryId: string) {
    const response = await this.client.delete(`/memories/${memoryId}`);
    // API returns 204 No Content on successful delete
    if (response.status === 204) {
      return { deleted: true };
    }
    return response.data;
  }

  async buildContext(data: {
    agent_id: string;
    task_description: string;
    max_tokens?: number;
  }) {
    const response = await this.client.post("/memories/context", {
      agent_id: data.agent_id,
      task_description: data.task_description,
      max_tokens: data.max_tokens || 2000,
    });
    return response.data;
  }

  // =========================================================================
  // Dynamic Relevance
  // =========================================================================

  async reinforceMemory(memoryId: string, boost?: number) {
    const response = await this.client.post(`/memories/${memoryId}/reinforce`, { boost });
    return response.data;
  }

  async weakenMemory(memoryId: string, penalty?: number) {
    const response = await this.client.post(`/memories/${memoryId}/weaken`, { penalty });
    return response.data;
  }

  // =========================================================================
  // Working Memory
  // =========================================================================

  async getWorkingMemory(contextId: string) {
    const response = await this.client.get(`/working-memory/${contextId}`);
    return response.data;
  }

  async addWorkingMemory(data: {
    context_id: string;
    content: string;
    agent_id?: string;
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

  // =========================================================================
  // Stream
  // =========================================================================

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

  async processStream(batchSize?: number) {
    const params = batchSize ? `?batch_size=${batchSize}` : "";
    const response = await this.client.post(`/stream/process${params}`);
    return response.data;
  }

  // =========================================================================
  // Selective Attention
  // =========================================================================

  async searchWithAttention(data: {
    query_text: string;
    task_type?: string;
    limit?: number;
    agent_id?: string;
    user_id?: string;
  }) {
    const response = await this.client.post("/memories/search-with-attention", data);
    return response.data;
  }

  // =========================================================================
  // User
  // =========================================================================

  async getUserContext(taskDescription: string, userEmail?: string) {
    const response = await this.client.post("/memories/context", {
      task_description: taskDescription,
      user_email: userEmail,
    });
    return response.data;
  }

  // =========================================================================
  // Maintenance
  // =========================================================================

  async heartbeatTick(data: {
    agent_id?: string;
    context_id?: string;
    session_id?: string;
  }) {
    const response = await this.client.post("/heartbeat/tick", data);
    return response.data;
  }

  async runSleepCycle(phases?: string[]) {
    const response = await this.client.post("/sleep/run", {
      phases: phases || ["evaluation", "forgetting", "consolidation", "relevance"],
    });
    return response.data;
  }

  // =========================================================================
  // Consolidation (Active Forgetting)
  // =========================================================================

  async detectConflicts(similarityThreshold?: number, limit?: number) {
    const response = await this.client.post("/consolidation/detect-conflicts", {
      similarity_threshold: similarityThreshold || 0.9,
      limit: limit || 50,
    });
    return response.data;
  }

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

  async detectRedundant(similarityThreshold?: number, limit?: number) {
    const response = await this.client.post("/consolidation/detect-redundant", {
      similarity_threshold: similarityThreshold || 0.95,
      limit: limit || 50,
    });
    return response.data;
  }

  // =========================================================================
  // Hierarchical Memory
  // =========================================================================

  async hierarchyConsolidate(data: {
    memory_ids: string[];
    summary_content?: string;
    agent_id?: string;
  }) {
    const response = await this.client.post("/hierarchy/consolidate", {
      memory_ids: data.memory_ids,
      summary_content: data.summary_content,
      agent_id: data.agent_id,
    });
    return response.data;
  }

  async getHierarchyTree(memoryId: string) {
    const response = await this.client.get(`/hierarchy/${memoryId}/tree`);
    return response.data;
  }

  // =========================================================================
  // Knowledge Graph - Concepts
  // =========================================================================

  async createConcept(data: { name: string; universe_id: string; description?: string }) {
    const response = await this.client.post("/graph/concepts", data);
    return response.data;
  }

  async listUniverseConcepts(universeId: string) {
    const response = await this.client.get(`/graph/universes/${universeId}/concepts`);
    return response.data;
  }

  async updateConcept(conceptId: string, data: { name?: string; description?: string }) {
    const response = await this.client.put(`/graph/concepts/${conceptId}`, data);
    return response.data;
  }

  async deleteConcept(conceptId: string) {
    const response = await this.client.delete(`/graph/concepts/${conceptId}`);
    if (response.status === 204) {
      return { deleted: true };
    }
    return response.data;
  }

  // =========================================================================
  // Knowledge Graph - Themes
  // =========================================================================

  async createTheme(data: { name: string; concept_id: string; description?: string }) {
    const response = await this.client.post("/graph/themes", data);
    return response.data;
  }

  async listConceptThemes(conceptId: string) {
    const response = await this.client.get(`/graph/concepts/${conceptId}/themes`);
    return response.data;
  }

  async updateTheme(themeId: string, data: { name?: string; description?: string }) {
    const response = await this.client.put(`/graph/themes/${themeId}`, data);
    return response.data;
  }

  async deleteTheme(themeId: string) {
    const response = await this.client.delete(`/graph/themes/${themeId}`);
    if (response.status === 204) {
      return { deleted: true };
    }
    return response.data;
  }

  // =========================================================================
  // Knowledge Graph - Topics
  // =========================================================================

  async createTopic(data: { name: string; theme_id: string; description?: string; status?: string }) {
    const response = await this.client.post("/graph/topics", data);
    return response.data;
  }

  async listThemeTopics(themeId: string) {
    const response = await this.client.get(`/graph/themes/${themeId}/topics`);
    return response.data;
  }

  async updateTopic(topicId: string, data: { name?: string; description?: string }) {
    const response = await this.client.put(`/graph/topics/${topicId}`, data);
    return response.data;
  }

  async updateTopicStatus(topicId: string, status: string) {
    const response = await this.client.patch(`/graph/topics/${topicId}/status`, { status });
    return response.data;
  }

  async deleteTopic(topicId: string) {
    const response = await this.client.delete(`/graph/topics/${topicId}`);
    if (response.status === 204) {
      return { deleted: true };
    }
    return response.data;
  }

  // =========================================================================
  // Knowledge Graph - Points
  // =========================================================================

  async createPoint(data: { name: string; topic_id: string; description?: string; status?: string }) {
    const response = await this.client.post("/graph/points", data);
    return response.data;
  }

  async listTopicPoints(topicId: string) {
    const response = await this.client.get(`/graph/topics/${topicId}/points`);
    return response.data;
  }

  async updatePoint(pointId: string, data: { name?: string; description?: string; content?: string }) {
    const response = await this.client.put(`/graph/points/${pointId}`, data);
    return response.data;
  }

  async updatePointStatus(pointId: string, status: string) {
    const response = await this.client.patch(`/graph/points/${pointId}/status`, { status });
    return response.data;
  }

  async deletePoint(pointId: string) {
    const response = await this.client.delete(`/graph/points/${pointId}`);
    if (response.status === 204) {
      return { deleted: true };
    }
    return response.data;
  }

  // =========================================================================
  // Knowledge Graph - Hierarchy
  // =========================================================================

  async getUniverseHierarchy(universeId: string) {
    const response = await this.client.get(`/graph/universes/${universeId}/hierarchy`);
    return response.data;
  }

  // =========================================================================
  // Training
  // =========================================================================

  async trainingTeach(data: { content: string; type?: string; importance?: number; universe_id?: string }) {
    const response = await this.client.post("/training/teach", {
      content: data.content,
      type: data.type || "semantic",
      importance: data.importance || 0.7,
      universe_id: data.universe_id,
    });
    return response.data;
  }

  async trainingQa(data: { pairs: Array<{question: string; answer: string}>; importance?: number; universe_id?: string }) {
    const response = await this.client.post("/training/qa", {
      pairs: data.pairs,
      universe_id: data.universe_id,
    });
    return response.data;
  }

  async trainingUpload(data: { file_path: string; filename: string; universe_id?: string; importance?: number }) {
    const fs = await import("fs");
    const path = await import("path");

    const filePath = data.file_path;
    const filename = data.filename || path.default.basename(filePath);

    // Use Node.js native FormData (available since Node 18)
    const fileBuffer = fs.readFileSync(filePath);
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append("file", blob, filename);
    if (data.universe_id) {
      formData.append("universe_id", data.universe_id);
    }
    if (data.importance !== undefined) {
      formData.append("importance", data.importance.toString());
    }

    const response = await this.client.post("/training/upload", formData, {
      headers: { "Content-Type": "multipart/form-data" },
    });
    return response.data;
  }

  async trainingStats() {
    const response = await this.client.get("/training/stats");
    return response.data;
  }

  async trainingGaps() {
    const response = await this.client.get("/training/gaps");
    return response.data;
  }

  async trainingRecent(data?: { limit?: number }) {
    const params = data?.limit ? `?limit=${data.limit}` : "";
    const response = await this.client.get(`/training/recent${params}`);
    return response.data;
  }

  // -------------------------------------------------------------------------
  // Task Management
  // -------------------------------------------------------------------------

  async createTask(data: {
    title: string;
    description?: string;
    assigned_agent_id?: string;
    parent_task_id?: string;
    priority?: number;
    input_data?: Record<string, unknown>;
  }) {
    const response = await this.client.post("/tasks", data);
    return response.data;
  }

  async getTask(taskId: string) {
    const response = await this.client.get(`/tasks/${taskId}`);
    return response.data;
  }

  async listTasks(data?: {
    status?: string;
    assigned_agent_id?: string;
    parent_task_id?: string;
    limit?: number;
  }) {
    const params = new URLSearchParams();
    if (data?.status) params.append("status", data.status);
    if (data?.assigned_agent_id) params.append("assigned_agent_id", data.assigned_agent_id);
    if (data?.parent_task_id) params.append("parent_task_id", data.parent_task_id);
    if (data?.limit) params.append("limit", data.limit.toString());
    const qs = params.toString();
    const response = await this.client.get(`/tasks${qs ? `?${qs}` : ""}`);
    return response.data;
  }

  async updateTask(taskId: string, data: {
    status?: string;
    output_data?: Record<string, unknown>;
    error_message?: string;
  }) {
    const response = await this.client.patch(`/tasks/${taskId}`, data);
    return response.data;
  }

  // =========================================================================
  // Skills
  // =========================================================================

  async listSkills(category?: string): Promise<any> {
    const params: Record<string, string> = {};
    if (category) params.category = category;
    const response = await this.client.get('/skills', { params });
    return response.data;
  }

  async getAgentSkills(agentId: string): Promise<any> {
    const response = await this.client.get(`/skills/agent/${agentId}`);
    return response.data;
  }

  async assignSkill(agentId: string, skillId: string, permission?: string): Promise<any> {
    const response = await this.client.post(`/skills/agent/${agentId}/${skillId}`, {
      permission: permission || 'execute',
    });
    return response.data;
  }

  async removeSkill(agentId: string, skillId: string): Promise<any> {
    const response = await this.client.delete(`/skills/agent/${agentId}/${skillId}`);
    return response.data;
  }
}
