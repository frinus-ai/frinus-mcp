/**
 * Interaction Capture - Automatic chat interaction tracking.
 *
 * Captures MCP tool calls (input and output) to the memory stream.
 * Runs as fire-and-forget so it never blocks tool responses.
 * Tools related to the stream itself are excluded to avoid recursion.
 */
import type { MemoryClientInterface, InteractionCaptureInterface } from "../types/index.js";

export class InteractionCapture implements InteractionCaptureInterface {
  private client: MemoryClientInterface;
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

  constructor(client: MemoryClientInterface) {
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
