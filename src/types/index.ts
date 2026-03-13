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
  agentClient: AgentClientInterface;
  cpClient: CpClientInterface;
  capture: InteractionCaptureInterface;
  resolvedUserEmail: string | null;
  resolvedUserId: string | null;
  cpUrl: string;
}

// ---------------------------------------------------------------------------
// Minimal interfaces so modules don't import concrete classes across boundaries
// ---------------------------------------------------------------------------

/** Public surface of the AgentClient used by handlers. */
export interface AgentClientInterface {
  createAgent(data: {
    name: string; template_id?: string; universe_id?: string;
    persona?: Record<string, unknown>; team_id?: string; is_team_lead?: boolean;
  }): Promise<any>;
  listAgents(orgId?: string): Promise<any>;
  getAgent(agentId: string): Promise<any>;
  updateAgentPersona(agentId: string, data: {
    name?: string; personality?: string; instructions?: string; greeting?: string;
    forbidden_topics?: string[]; language?: string; specialization?: string;
  }): Promise<any>;
  deleteAgent(agentId: string): Promise<any>;
  invokeAgent(data: {
    agent_id?: string; agent_name?: string; message: string;
    task_id?: string; context?: Record<string, unknown>; timeout_seconds?: number;
  }): Promise<any>;
}

/** Public surface of the CpClient used by handlers. */
export interface CpClientInterface {
  createUniverse(orgId: string, data: { name: string; slug: string; description?: string }): Promise<any>;
  listUniverses(orgId: string): Promise<any>;
  updateUniverse(orgId: string, universeId: string, data: { name?: string; description?: string }): Promise<any>;
}

/** Public surface of the MemoryClient used by handlers. */
export interface MemoryClientInterface {
  getTenantOrgId(): string | null;
  getAuthMe(): Promise<any>;

  // Session
  startSession(data: { agent_id?: string; parent_session_id?: string }): Promise<any>;
  endSession(sessionId: string): Promise<any>;
  getSessionContext(data: {
    session_id: string; query: string; agent_id?: string;
    max_working_memory?: number; max_long_term?: number; include_topics?: boolean;
  }): Promise<any>;
  getSessionSummary(sessionId: string): Promise<any>;
  clearSession(sessionId: string): Promise<any>;

  // Core Memory CRUD
  storeMemory(data: {
    agent_id: string; content: string; memory_type?: string; scope?: string;
    importance?: number; user_id?: string;
    created_by_user_id?: string; metadata?: Record<string, unknown>;
  }): Promise<any>;
  searchMemories(data: {
    query_text: string; agent_id?: string;
    memory_types?: string[]; limit?: number;
  }): Promise<any>;
  getMemory(memoryId: string): Promise<any>;
  getAgentMemories(agentId: string, memoryType?: string, limit?: number): Promise<any>;
  deleteMemory(memoryId: string): Promise<any>;
  buildContext(data: {
    agent_id: string; task_description: string; max_tokens?: number;
  }): Promise<any>;

  // Dynamic Relevance
  reinforceMemory(memoryId: string, boost?: number): Promise<any>;
  weakenMemory(memoryId: string, penalty?: number): Promise<any>;

  // Working Memory
  getWorkingMemory(contextId: string): Promise<any>;
  addWorkingMemory(data: {
    context_id: string; content: string; agent_id?: string;
    task_id?: string; ttl_seconds?: number;
  }): Promise<any>;
  clearWorkingMemory(contextId: string): Promise<any>;

  // Stream
  captureStream(data: {
    session_id: string; content: string; direction: string;
    agent_id?: string; importance?: number; metadata?: Record<string, unknown>;
  }): Promise<any>;
  getSessionItems(sessionId: string, limit?: number): Promise<any>;
  getRecentStreamItems(agentId?: string, limit?: number, includeForgotten?: boolean): Promise<any>;
  processStream(batchSize?: number): Promise<any>;

  // Selective Attention
  searchWithAttention(data: {
    query_text: string; task_type?: string;
    limit?: number; agent_id?: string; user_id?: string;
  }): Promise<any>;

  // User
  getUserContext(taskDescription: string, userEmail?: string): Promise<any>;

  // Maintenance
  heartbeatTick(data: {
    agent_id?: string; context_id?: string; session_id?: string;
  }): Promise<any>;
  runSleepCycle(phases?: string[]): Promise<any>;

  // Consolidation (Active Forgetting)
  detectConflicts(similarityThreshold?: number, limit?: number): Promise<any>;
  resolveConflict(data: { keep_id: string; supersede_id: string; resolution_note: string }): Promise<any>;
  detectRedundant(similarityThreshold?: number, limit?: number): Promise<any>;

  // Hierarchical Memory
  hierarchyConsolidate(data: {
    memory_ids: string[]; summary_content?: string; agent_id?: string;
  }): Promise<any>;
  getHierarchyTree(memoryId: string): Promise<any>;

  // Knowledge Graph - Concepts
  createConcept(data: { name: string; universe_id: string; description?: string }): Promise<any>;
  listUniverseConcepts(universeId: string): Promise<any>;
  updateConcept(conceptId: string, data: { name?: string; description?: string }): Promise<any>;
  deleteConcept(conceptId: string): Promise<any>;

  // Knowledge Graph - Themes
  createTheme(data: { name: string; concept_id: string; description?: string }): Promise<any>;
  listConceptThemes(conceptId: string): Promise<any>;
  updateTheme(themeId: string, data: { name?: string; description?: string }): Promise<any>;
  deleteTheme(themeId: string): Promise<any>;

  // Knowledge Graph - Topics
  createTopic(data: { name: string; theme_id: string; description?: string; status?: string }): Promise<any>;
  listThemeTopics(themeId: string): Promise<any>;
  updateTopic(topicId: string, data: { name?: string; description?: string }): Promise<any>;
  updateTopicStatus(topicId: string, status: string): Promise<any>;
  deleteTopic(topicId: string): Promise<any>;

  // Knowledge Graph - Points
  createPoint(data: { name: string; topic_id: string; description?: string; status?: string }): Promise<any>;
  listTopicPoints(topicId: string): Promise<any>;
  updatePoint(pointId: string, data: { name?: string; description?: string; content?: string }): Promise<any>;
  updatePointStatus(pointId: string, status: string): Promise<any>;
  deletePoint(pointId: string): Promise<any>;

  // Knowledge Graph - Hierarchy
  getUniverseHierarchy(universeId: string): Promise<any>;

  // Training
  trainingTeach(data: { content: string; type?: string; importance?: number; universe_id?: string }): Promise<any>;
  trainingQa(data: { pairs: Array<{question: string; answer: string}>; importance?: number; universe_id?: string }): Promise<any>;
  trainingUpload(data: { file_path: string; filename: string; universe_id?: string; importance?: number }): Promise<any>;
  trainingStats(): Promise<any>;
  trainingGaps(): Promise<any>;
  trainingRecent(data?: { limit?: number }): Promise<any>;

  // Task Management
  createTask(data: {
    title: string; description?: string; assigned_agent_id?: string;
    parent_task_id?: string; priority?: number; input_data?: Record<string, unknown>;
  }): Promise<any>;
  getTask(taskId: string): Promise<any>;
  listTasks(data?: {
    status?: string; assigned_agent_id?: string;
    parent_task_id?: string; limit?: number;
  }): Promise<any>;
  updateTask(taskId: string, data: {
    status?: string; output_data?: Record<string, unknown>;
    error_message?: string;
  }): Promise<any>;

  // Skills
  listSkills(category?: string): Promise<any>;
  getAgentSkills(agentId: string): Promise<any>;
  assignSkill(agentId: string, skillId: string, permission?: string): Promise<any>;
  removeSkill(agentId: string, skillId: string): Promise<any>;
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
