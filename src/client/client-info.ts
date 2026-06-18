/**
 * Resolved MCP client identity.
 *
 * The MCP client sends its `clientInfo: { name, version }` during the
 * `initialize` handshake. We normalize the raw `name` into a small, stable
 * set of buckets and expose it as the `X-Client` header so the Control Plane
 * can attribute the `mcp_connected` PostHog event to the right client
 * ("claude_code", "cursor", "desktop", "codex", "unknown").
 *
 * Module-level singleton (getter/setter), mirroring `resolvedTenantOrgId` in
 * memory-client.ts: it is captured by an Axios request interceptor at
 * construction time and read lazily on each request, so a single mutable
 * module value is the least-surprising shape here.
 */

export type ResolvedClient =
  | "claude_code"
  | "cursor"
  | "desktop"
  | "codex"
  | "unknown";

let resolvedClient: ResolvedClient = "unknown";

/**
 * Normalize a raw `clientInfo.name` into a stable bucket.
 *
 * Order matters: the more specific "claude-code" check must run before the
 * generic "claude" → desktop fallback, so Claude Code is never misclassified
 * as the desktop app.
 */
export function normalizeClient(rawName?: string | null): ResolvedClient {
  if (!rawName) return "unknown";
  const name = rawName.toLowerCase();

  if (name.includes("claude-code") || name.includes("claudecode")) {
    return "claude_code";
  }
  if (name.includes("cursor")) {
    return "cursor";
  }
  if (name.includes("codex")) {
    return "codex";
  }
  // Generic Claude clients (Claude Desktop, claude-ai, etc.) — must come after
  // the claude-code check above.
  if (name.includes("claude") || name.includes("claude-ai") || name.includes("desktop")) {
    return "desktop";
  }
  return "unknown";
}

export function setResolvedClient(rawName?: string | null): void {
  resolvedClient = normalizeClient(rawName);
}

export function getResolvedClient(): ResolvedClient {
  return resolvedClient;
}
