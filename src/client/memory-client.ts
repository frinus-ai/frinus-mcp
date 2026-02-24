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
}
