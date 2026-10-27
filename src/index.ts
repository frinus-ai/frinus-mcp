#!/usr/bin/env node
/**
 * MCP Server for Agents Memory Service
 *
 * This server exposes the memory service as MCP tools for Claude agents.
 *
 * Module structure:
 *   client/memory-client.ts       - HTTP client (MemoryClient + Axios interceptors)
 *   capture/interaction-capture.ts - Automatic tool-call stream tracking
 *   tools/definitions.ts          - Tool schemas (inputSchema for all tools)
 *   tools/handlers.ts             - Tool handlers (dispatch map)
 *   types/index.ts                - Shared interfaces and types
 */

import net from "node:net";
import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";

import {
  MemoryClient,
  getResolvedUserEmail,
  getResolvedUserId,
  setResolvedTenantOrgId,
  setResolvedUserEmail,
  setResolvedUserId,
  getResolvedTenantOrgId,
} from "./client/memory-client.js";
import { AgentClient } from "./client/agent-client.js";
import { CpClient } from "./client/cp-client.js";
import { getResolvedClient, setResolvedClient } from "./client/client-info.js";
import { InteractionCapture } from "./capture/interaction-capture.js";
import { TOOLS } from "./tools/definitions.js";
import { dispatchTool } from "./tools/handlers.js";

// Defaults point at the Frinus SaaS so `npx -y frinus-mcp` works with only an
// API key. Local development overrides these via env (MEMORY_SERVICE_URL, etc.).
const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || "https://frinus-memory.rdxsec.com.br";
const CP_URL = process.env.FRINUS_CP_URL || "https://frinus-api.rdxsec.com.br";
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || "https://frinus-agents.rdxsec.com.br";

// Give Happy Eyeballs (RFC 8305) a realistic deadline before giving up on an
// address family. Node's default auto-select-family attempt timeout is 250ms,
// which on a slow network (2026-10-27 incident) made the API-key validation
// fail with "Failed to validate API key: AggregateError" before the TCP
// handshake could complete. 5s per attempt matches how long a cold mobile/VPN
// link realistically needs. Guarded with typeof for older Node runtimes.
if (typeof (net as any).setDefaultAutoSelectFamilyAttemptTimeout === "function") {
  (net as any).setDefaultAutoSelectFamilyAttemptTimeout(5000);
}

// Main server
async function main() {
  // Require API key (FRINUS_API_KEY preferred, FRINUS_MEMORY_API_KEY for backward compat)
  const apiKey = process.env.FRINUS_API_KEY || process.env.FRINUS_MEMORY_API_KEY;
  if (!apiKey) {
    console.error("[FATAL] FRINUS_API_KEY environment variable is required but not set.");
    console.error("Generate an API key in the Frinus dashboard or via the Control Plane API.");
    process.exit(1);
  }

  const memoryClient = new MemoryClient(MEMORY_SERVICE_URL, apiKey);
  const agentClient = new AgentClient(AGENT_SERVICE_URL, apiKey);
  const cpClient = new CpClient(CP_URL, apiKey);
  const capture = new InteractionCapture(memoryClient);

  console.error(`[InteractionCapture] Session: ${capture.getSessionId()}`);

  // Validate API key and resolve tenant identity at startup.
  //
  // Retry ONLY transient network failures (no HTTP response: DNS, connection
  // refused/reset, timeout, AggregateError from Happy Eyeballs). A 401/403 is a
  // real rejection and must fail fast — retrying a bad key is pointless. Backoff
  // 1s then 3s between the 3 attempts. This, together with the auto-select-family
  // timeout above, is the fix for the 2026-10-27 "Failed to validate API key:
  // AggregateError" crashes on slow links.
  const MAX_AUTH_ATTEMPTS = 3;
  const AUTH_BACKOFFS_MS = [1000, 3000];
  let me: any;
  for (let attempt = 1; ; attempt++) {
    try {
      me = await memoryClient.getAuthMe();
      break;
    } catch (err: any) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        console.error(`[FATAL] API key rejected (HTTP ${status}). Check FRINUS_API_KEY.`);
        process.exit(1);
      }
      // No HTTP response == network/transport error -> retryable.
      const isNetworkError = status === undefined;
      if (isNetworkError && attempt < MAX_AUTH_ATTEMPTS) {
        const waitMs = AUTH_BACKOFFS_MS[attempt - 1];
        console.error(
          `[Auth] Network error validating API key (attempt ${attempt}/${MAX_AUTH_ATTEMPTS}): ` +
          `${err?.message || err}. Retrying in ${waitMs}ms...`,
        );
        await new Promise((resolve) => setTimeout(resolve, waitMs));
        continue;
      }
      console.error(`[FATAL] Failed to validate API key: ${err?.message || err}`);
      process.exit(1);
    }
  }

  setResolvedUserEmail(me.email || me.user?.email || null);
  setResolvedUserId(me.id || me.user?.id || me.user_id || null);

  // Resolve tenant org ID from /auth/me response (env var takes precedence)
  const meOrgId = me.organization_id || me.org_id || me.user?.organization_id || null;
  if (!getResolvedTenantOrgId() && meOrgId) {
    setResolvedTenantOrgId(meOrgId);
  }

  console.error(`[Auth] API key validated. User: ${getResolvedUserEmail()}, Tenant: ${getResolvedTenantOrgId() || 'none'}`);

  const server = new Server(
    {
      name: "frinus",
      version: "3.7.0",
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

    // Execute the tool via the dispatch map
    const toolResult = await dispatchTool(name, args as Record<string, unknown>, {
      memoryClient,
      agentClient,
      cpClient,
      capture,
      resolvedUserEmail: getResolvedUserEmail(),
      resolvedUserId: getResolvedUserId(),
      cpUrl: CP_URL,
    });

    // Fire-and-forget: capture the tool call interaction to the memory stream
    try {
      capture.captureToolCall(name, args as Record<string, unknown>, toolResult);
    } catch (err: any) {
      console.error('[MCP] Capture failed:', err.message);
    }

    return toolResult;
  });

  // Resolve the connecting MCP client's identity for the X-Client header.
  // `getClientVersion()` is only populated after the `initialize` handshake,
  // so we read it from the `oninitialized` callback (fired on the client's
  // `notifications/initialized`), not right after `connect()`.
  server.oninitialized = () => {
    const rawName = server.getClientVersion()?.name;
    setResolvedClient(rawName);
    // Logged once for calibration against real clients (stderr, not stdout —
    // stdout is the MCP transport).
    console.error(
      `[Client] clientInfo.name=${JSON.stringify(rawName ?? null)} normalized=${getResolvedClient()}`
    );
  };

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Memory Server running on stdio");
}

main().catch(console.error);
