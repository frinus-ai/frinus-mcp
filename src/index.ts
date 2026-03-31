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
import { InteractionCapture } from "./capture/interaction-capture.js";
import { TOOLS } from "./tools/definitions.js";
import { dispatchTool } from "./tools/handlers.js";

const MEMORY_SERVICE_URL = process.env.MEMORY_SERVICE_URL || "http://localhost:8001";
const CP_URL = process.env.FRINUS_CP_URL || "http://localhost:8000";
const AGENT_SERVICE_URL = process.env.AGENT_SERVICE_URL || "http://localhost:8002";

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

  // Validate API key and resolve tenant identity at startup
  try {
    const me = await memoryClient.getAuthMe();
    setResolvedUserEmail(me.email || me.user?.email || null);
    setResolvedUserId(me.id || me.user?.id || me.user_id || null);

    // Resolve tenant org ID from /auth/me response (env var takes precedence)
    const meOrgId = me.organization_id || me.org_id || me.user?.organization_id || null;
    if (!getResolvedTenantOrgId() && meOrgId) {
      setResolvedTenantOrgId(meOrgId);
    }

    console.error(`[Auth] API key validated. User: ${getResolvedUserEmail()}, Tenant: ${getResolvedTenantOrgId() || 'none'}`);
  } catch (err: any) {
    const status = err?.response?.status;
    if (status === 401 || status === 403) {
      console.error(`[FATAL] API key rejected (HTTP ${status}). Check FRINUS_API_KEY.`);
    } else {
      console.error(`[FATAL] Failed to validate API key: ${err?.message || err}`);
    }
    process.exit(1);
  }

  const server = new Server(
    {
      name: "frinus",
      version: "3.1.0",
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

  // Start server
  const transport = new StdioServerTransport();
  await server.connect(transport);
  console.error("MCP Memory Server running on stdio");
}

main().catch(console.error);
