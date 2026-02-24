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
    "stream_process",
    "stream_get_session",
    "stream_get_recent",
    "heartbeat_tick",
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

  /**
   * Read-only tools whose CALL (input) side is not worth capturing.
   * We still capture their results if meaningful.
   */
  private static readonly READ_ONLY_TOOLS = new Set([
    "memory_search",
    "memory_get",
    "memory_list",
    "working_memory_get",
    "search_with_attention",
    "memory_get_context",
    "session_context",
    "session_summary",
    "user_get_context",
    "hierarchy_get_tree",
    "consolidation_detect_conflicts",
    "consolidation_detect_redundant",
  ]);

  /** Trivial result strings that carry no learning value. */
  private static readonly TRIVIAL_RESULTS = new Set([
    "ok",
    "success",
    "done",
    "true",
    "false",
    "null",
    "{}",
    "[]",
  ]);

  /** Whether this tool call should be captured. */
  private shouldCapture(toolName: string): boolean {
    return !InteractionCapture.EXCLUDED_TOOLS.has(toolName);
  }

  /**
   * Whether the INPUT side of a tool call should be captured.
   * Read-only tools only get their results captured, not their inputs.
   */
  private shouldCaptureInput(toolName: string): boolean {
    return !InteractionCapture.READ_ONLY_TOOLS.has(toolName);
  }

  /**
   * Whether a tool result is too trivial to be worth capturing.
   * Filters out very short results and known no-op strings.
   */
  private isNoiseResult(outputTexts: string): boolean {
    const trimmed = outputTexts.trim();
    if (trimmed.length < 20) return true;
    if (InteractionCapture.TRIVIAL_RESULTS.has(trimmed.toLowerCase())) return true;
    return false;
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

  /**
   * Capture both the input (tool call) and output (tool result) of an
   * MCP tool invocation. Failures are silently ignored.
   *
   * Pre-filters applied:
   * - Excluded tools are never captured (recursion guard).
   * - Read-only tool CALLS (inputs) are skipped; only their results matter.
   * - Trivial / very short results are skipped to reduce noise.
   */
  captureToolCall(
    toolName: string,
    args: Record<string, unknown>,
    result: { content: Array<{ type: string; text: string }>; isError?: boolean },
  ): void {
    if (!this.shouldCapture(toolName)) return;

    const agentId = this.extractAgentId(args);
    const metadata: Record<string, unknown> = { tool_name: toolName };

    // --- Capture INPUT (the tool call) ---
    // Skip input capture for read-only tools (only results are interesting)
    if (this.shouldCaptureInput(toolName)) {
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
    }

    // --- Capture OUTPUT (the tool result) ---
    const outputTexts = result.content
      .filter((c) => c.type === "text")
      .map((c) => c.text)
      .join("\n");

    // Skip trivial / noise results
    if (this.isNoiseResult(outputTexts)) return;

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
      "memory_delete",
      "working_memory_add",
      "session_start",
      "session_end",
      "sleep_run",
      "consolidation_resolve_conflict",
      "hierarchy_consolidate",
    ]);

    if (highImportance.has(toolName)) {
      return direction === "input" ? 0.7 : 0.6;
    }

    // Read / search operations
    return direction === "input" ? 0.4 : 0.3;
  }
}
