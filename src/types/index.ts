/**
 * Shared types for the Frinus MCP Server.
 */

/** Standard MCP tool result content item. */
export interface ToolResultContent {
  type: string;
  text: string;
}

/** Standard MCP tool result. Index signature for MCP SDK compatibility. */
export interface ToolResult {
  [x: string]: unknown;
  content: ToolResultContent[];
  isError?: boolean;
}

/** Arguments passed to a tool handler (parsed from MCP request). */
export type ToolArgs = Record<string, unknown>;

/** Signature for individual tool handler functions. */
export type ToolHandler = (
  args: ToolArgs,
  deps: ToolHandlerDeps,
) => Promise<ToolResult>;

/** Dependencies injected into every tool handler. */
export interface ToolHandlerDeps {
  memoryClient: MemoryClientInterface;
  capture: InteractionCaptureInterface;
  resolvedUserEmail: string | null;
  resolvedUserId: string | null;
  cpUrl: string;
}

// ---------------------------------------------------------------------------
// Minimal interfaces so modules don't import concrete classes across boundaries
// ---------------------------------------------------------------------------

/** Public surface of the MemoryClient used by handlers. */
export interface MemoryClientInterface {
  getTenantOrgId(): string | null;
  getAuthMe(): Promise<any>;
  startSession(data: { project_id: string; agent_id?: string; parent_session_id?: string }): Promise<any>;
  endSession(sessionId: string): Promise<any>;
  getActiveSessions(): Promise<any>;
  storeMemory(data: {
    agent_id: string; content: string; memory_type?: string; scope?: string;
    importance?: number; project_id?: string; user_id?: string;
    created_by_user_id?: string; metadata?: Record<string, unknown>;
  }): Promise<any>;
  searchMemories(data: {
    query_text: string; agent_id?: string; project_id?: string;
    memory_types?: string[]; limit?: number;
  }): Promise<any>;
  buildContext(data: {
    agent_id: string; task_description: string; project_id?: string; max_tokens?: number;
  }): Promise<any>;
  getAgentMemories(agentId: string, memoryType?: string, limit?: number): Promise<any>;
  registerAgent(data: { agent_id: string; name: string; agent_type: string }): Promise<any>;
  registerProject(data: { project_id: string; name: string }): Promise<any>;
  assignAgentToProject(data: { agent_id: string; project_id: string; role: string }): Promise<any>;
  getWorkingMemory(contextId: string): Promise<any>;
  addWorkingMemory(data: {
    context_id: string; content: string; agent_id?: string;
    project_id?: string; task_id?: string; ttl_seconds?: number;
  }): Promise<any>;
  clearWorkingMemory(contextId: string): Promise<any>;
  captureStream(data: {
    session_id: string; content: string; direction: string;
    agent_id?: string; importance?: number; metadata?: Record<string, unknown>;
  }): Promise<any>;
  getStreamStats(): Promise<any>;
  registerUser(data: {
    user_id: string; email: string; username?: string;
    home_directory?: string; preferences?: Record<string, unknown>;
  }): Promise<any>;
  getUser(userId: string): Promise<any>;
  getUserMemories(email: string, limit?: number): Promise<any>;
  getProjectContext(projectId: string, taskDescription: string, userEmail?: string): Promise<any>;
  reinforceMemory(memoryId: string, boost?: number): Promise<any>;
  weakenMemory(memoryId: string, penalty?: number): Promise<any>;
  getTrendingMemories(projectId: string, limit?: number): Promise<any>;
  detectConflicts(projectId: string, similarityThreshold?: number, limit?: number): Promise<any>;
  detectRedundant(projectId: string, similarityThreshold?: number, limit?: number): Promise<any>;
  getHierarchyStats(projectId?: string): Promise<any>;
  autoConsolidate(projectId: string, sourceLevel?: string, limit?: number): Promise<any>;
  getAttentionProfiles(): Promise<any>;
  searchWithAttention(data: {
    query_text: string; project_id: string; task_type?: string;
    limit?: number; agent_id?: string; user_id?: string;
  }): Promise<any>;
  evaluateMemories(agentId?: string, projectId?: string, limit?: number): Promise<any>;
  getMetacognitionReport(agentId: string): Promise<any>;
  runSleepCycle(projectId: string, phases?: string[]): Promise<any>;
  getSleepReport(): Promise<any>;
  getSleepConfig(): Promise<any>;
  findTransferable(sourceProjectId: string, targetProjectId: string, limit?: number): Promise<any>;
  transferMemory(sourceMemoryId: string, targetProjectId: string, contextQuery?: string): Promise<any>;
  getMemory(memoryId: string): Promise<any>;
  deleteMemory(memoryId: string): Promise<any>;
  resolveConflict(data: { keep_id: string; supersede_id: string; resolution_note: string }): Promise<any>;
  markObsolete(memoryId: string, reason: string, supersededBy?: string): Promise<any>;
  hierarchyConsolidate(data: {
    memory_ids: string[]; summary_content?: string; project_id?: string; agent_id?: string;
  }): Promise<any>;
  getHierarchyTree(memoryId: string): Promise<any>;
  promoteMemory(memoryId: string, targetLevel: string): Promise<any>;
  getFlaggedMemories(data: {
    project_id?: string; agent_id?: string; min_issues?: number; limit?: number;
  }): Promise<any>;
  transferBulk(data: {
    memory_ids: string[]; target_project_id: string;
    context_similarity?: number; transfer_note?: string;
  }): Promise<any>;
  transferAdapt(data: {
    memory_id: string; target_project_id: string; context_query?: string;
  }): Promise<any>;
  getTransferHistory(memoryId: string): Promise<any>;
  listProjects(): Promise<any>;
  getProject(projectId: string): Promise<any>;
  searchProjects(name: string): Promise<any>;
  createProject(name: string, description?: string): Promise<any>;
  linkSubproject(parentId: string, childId: string): Promise<any>;
  unlinkSubproject(parentId: string, childId: string): Promise<any>;
  listSubprojects(projectId: string): Promise<any>;
  getProjectHierarchy(projectId: string): Promise<any>;
  heartbeatTick(data: {
    project_id: string; agent_id?: string; context_id?: string; session_id?: string;
  }): Promise<any>;
  getHeartbeatStatus(): Promise<any>;
  configureHeartbeat(data: {
    working_memory_interval?: number; stream_capture_interval?: number;
    mini_sleep_interval?: number; normal_sleep_interval?: number;
    daily_sleep_enabled?: boolean; weekly_metacognition_enabled?: boolean;
  }): Promise<any>;
  resetHeartbeat(): Promise<any>;
  processStream(batchSize?: number): Promise<any>;
  forgetStream(thresholdDays?: number, minImportance?: number): Promise<any>;
  consolidateSession(sessionId: string): Promise<any>;
  getSessionItems(sessionId: string, limit?: number): Promise<any>;
  getRecentStreamItems(agentId?: string, limit?: number, includeForgotten?: boolean): Promise<any>;
  createContext(data: {
    context_path: string; context_type: string; name: string;
    project_id: string; description?: string; parent_path?: string;
    metadata?: Record<string, unknown>;
  }): Promise<any>;
  getContextTree(projectId: string): Promise<any>;
  getContextMemories(contextPath: string, includeChildren?: boolean, memoryTypes?: string[], limit?: number, offset?: number): Promise<any>;
  getContextStats(projectId: string): Promise<any>;
  getContextInfo(contextPath: string): Promise<any>;
  updateContext(contextPath: string, name?: string, description?: string): Promise<any>;
  deleteContext(contextPath: string, force?: boolean): Promise<any>;
  getSessionContext(data: {
    session_id: string; query: string; agent_id?: string;
    project_id?: string; max_working_memory?: number;
    max_long_term?: number; include_topics?: boolean;
  }): Promise<any>;
  getSessionSummary(sessionId: string): Promise<any>;
  clearSession(sessionId: string): Promise<any>;
  registerSkill(data: { skill_id: string; name: string; skill_type: string }): Promise<any>;
  findAgentsForTask(data: {
    required_skill_ids: string[]; project_id?: string;
    prefer_experienced?: boolean; limit?: number;
  }): Promise<any>;
  syncProjectMemories(projectId: string): Promise<any>;
  createManagesRelationship(data: {
    manager_id: string; subordinate_id: string;
    team_name?: string; since?: string;
  }): Promise<any>;
  removeManagesRelationship(managerId: string, subordinateId: string): Promise<any>;
  createCollaboration(data: {
    agent1_id: string; agent2_id: string; collaboration_type?: string;
    project_id?: string; strength?: number;
  }): Promise<any>;
  removeCollaboration(agent1Id: string, agent2Id: string): Promise<any>;
  getTeamStructure(managerId: string, includeIndirect?: boolean): Promise<any>;
  getAgentManager(agentId: string): Promise<any>;
  getCollaborators(agentId: string, collaborationType?: string, minStrength?: number): Promise<any>;
}

/** Public surface of InteractionCapture used by the server. */
export interface InteractionCaptureInterface {
  sessionId: string;
  getSessionId(): string;
  captureToolCall(
    toolName: string,
    args: Record<string, unknown>,
    result: { content: Array<{ type: string; text: string }>; isError?: boolean },
  ): void;
}
