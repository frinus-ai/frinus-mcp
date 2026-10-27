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
import { getSessionId, noteToolCall, reorientBanner, setSessionId } from "./tools/boot-state.js";
import { MCP_VERSION } from "./version.js";

// Irreducible boot rules injected into the client's system prompt via the MCP
// `initialize` handshake (Claude Code places server `instructions` there). These
// are the rules that MUST survive even if a single tool response is truncated or
// skimmed — the structural backstop behind the Boot Contract block.
const SERVER_INSTRUCTIONS = [
  "Frinus MCP — regras de boot que nunca podem cair:",
  "1. No início da sessão, chame agent_bootstrap(agent_id=...) e adote o \"Contrato de Boot\" no TOPO da resposta: identidade, ORGANIZAÇÃO (grave memórias só nela), usuário, session_id e a cadência de reorient. O system prompt longo vem depois do contrato.",
  "2. Quando QUALQUER resposta de tool trouxer \"⚠️ REORIENT DEVIDO\", chame agent_reorient(agent_id=...) antes de continuar. O MCP conta as tool calls por você.",
  "3. Confirme a organização do Contrato de Boot ANTES da primeira escrita de memória — nunca grave na org errada.",
  "4. A sessão é gerenciada pelo MCP (iniciada no agent_bootstrap, encerrada no fim do processo). Não precisa fechá-la à mão.",
  "Se o MCP/bootstrap estiver indisponível, avise \"MCP Frinus offline — capacidades reduzidas.\" e opere com cautela.",
].join("\n");

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
      version: MCP_VERSION,
    },
    {
      capabilities: {
        tools: {},
      },
      instructions: SERVER_INSTRUCTIONS,
    }
  );

  // --- Session lifecycle: close on process exit ---------------------------
  // The session is OPENED by agent_bootstrap (the MCP owns it, not the model).
  // Here we guarantee it is CLOSED when the process goes away: Claude Code
  // closing stdin, a SIGTERM/SIGINT, or the event loop draining. We run
  // session_summary then session_end under a short timeout so a slow/unreachable
  // Memory Engine can never hang shutdown. Idempotent via the `closing` guard.
  let closing = false;
  const SHUTDOWN_TIMEOUT_MS = 3000;
  const closeSession = async (reason: string): Promise<void> => {
    if (closing) return;
    closing = true;
    const sid = getSessionId();
    if (!sid) return;
    console.error(`[Session] Closing ${sid} (${reason})`);
    const work = (async () => {
      try {
        await memoryClient.getSessionSummary(sid);
      } catch (err: any) {
        console.error(`[Session] summary failed: ${err?.message || err}`);
      }
      try {
        await memoryClient.endSession(sid);
      } catch (err: any) {
        console.error(`[Session] end failed: ${err?.message || err}`);
      }
    })();
    await Promise.race([
      work,
      new Promise<void>((resolve) => setTimeout(resolve, SHUTDOWN_TIMEOUT_MS)),
    ]);
    setSessionId(null);
  };
  const shutdownAndExit = (reason: string) => {
    void closeSession(reason).finally(() => process.exit(0));
  };
  process.once("SIGTERM", () => shutdownAndExit("SIGTERM"));
  process.once("SIGINT", () => shutdownAndExit("SIGINT"));
  // stdin close = the MCP client (Claude Code) disconnected.
  process.stdin.on("close", () => shutdownAndExit("stdin-close"));
  // Last-resort backstop when the loop drains without a signal. Does not force
  // exit (lets the natural exit proceed after a best-effort close).
  process.once("beforeExit", () => {
    void closeSession("beforeExit");
  });

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

    // Deterministic reorient cadence (see tools/boot-state.ts): count this call,
    // then, if the agent is overdue, append the REORIENT DUE banner to the result
    // so the model cannot miss it. Repeats on every call until agent_reorient
    // resets the counter. Never throws into the response path.
    try {
      noteToolCall(name);
      const banner = reorientBanner();
      if (banner) {
        const last = toolResult.content?.[toolResult.content.length - 1];
        if (last && last.type === "text") {
          last.text += banner;
        } else {
          toolResult.content = [...(toolResult.content || []), { type: "text", text: banner.trimStart() }];
        }
      }
    } catch (err: any) {
      console.error('[MCP] Reorient cadence check failed:', err?.message || err);
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
