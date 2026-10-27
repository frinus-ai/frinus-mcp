/**
 * Tests for the agent_bootstrap renderer: the Boot Contract at the top, the
 * session being started by the MCP, the reorient cadence being armed, and the
 * previously-dropped fields (recent-memory type/id/importance, skill
 * version/permission) now surfacing.
 *
 * Driven through `dispatchTool` with fake clients — no network, no Agent
 * Service. FRINUS_NOTIFICATIONS=off keeps the notifications channel inert.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.FRINUS_NOTIFICATIONS = "off";

import { dispatchTool } from "../src/tools/handlers.js";
import { __resetBootState, getReorientConfig, getSessionId } from "../src/tools/boot-state.js";
import type { ToolHandlerDeps } from "../src/types/index.js";

function makeBootstrapPayload(overrides: Record<string, unknown> = {}) {
  return {
    agent_id: "11111111-1111-1111-1111-111111111111",
    identity: {
      id: "11111111-1111-1111-1111-111111111111",
      name: "Backend Node.js Specialist",
      specialization: "NestJS / TypeScript",
      org_id: "22222222-2222-2222-2222-222222222222",
      org_name: "RDX Security",
      universe_id: "33333333-3333-3333-3333-333333333333",
      team_id: "44444444-4444-4444-4444-444444444444",
    },
    system_prompt: "## RULE ZERO — MCP IS MANDATORY\nYou are the backend specialist.",
    persona_version: "abc123def456",
    config: {
      reorient_every_n: 7,
      reorient_on_context_pct: 65,
      max_memories: 50,
    },
    runtime: {
      working_memory: [],
      recent_memories: [
        {
          id: "mem-1",
          content: "Decisão: usar KafkaJS 2.x no producer de pedidos.",
          type: "semantic",
          importance: 0.82,
          universe_id: "33333333-3333-3333-3333-333333333333",
        },
      ],
      skills: [
        {
          name: "deploy-prod",
          slug: "deploy-prod",
          description: "Runbook de deploy em produção",
          version: "3",
          permission: "read",
        },
      ],
      delegate_digest: { count: 0, summary: "" },
    },
    ...overrides,
  };
}

function makeDeps(opts: {
  payload?: Record<string, unknown>;
  startSession?: () => Promise<any>;
  capture?: { sessionId: string };
}): { deps: ToolHandlerDeps; startCalls: any[] } {
  const startCalls: any[] = [];
  const capture = opts.capture ?? { sessionId: "auto-gen" };
  const deps = {
    agentClient: {
      bootstrapAgent: async (_id: string) => opts.payload ?? makeBootstrapPayload(),
    },
    memoryClient: {
      startSession:
        opts.startSession ??
        (async (data: any) => {
          startCalls.push(data);
          return { session_id: "formal-session-123" };
        }),
    },
    cpClient: {
      // notifications disabled via env; never actually called, but present.
      getNotificationInbox: async () => ({ items: [], count: 0 }),
    },
    capture,
    resolvedUserEmail: "renato.diniz@rdxsec.com.br",
    resolvedUserId: "user-uuid-9",
    cpUrl: "http://cp.test",
  } as unknown as ToolHandlerDeps;
  return { deps, startCalls };
}

beforeEach(() => __resetBootState());

test("Boot Contract is rendered at the top, before the system prompt", async () => {
  const { deps } = makeDeps({});
  const res = await dispatchTool("agent_bootstrap", { agent_id: "11111111-1111-1111-1111-111111111111" }, deps);
  assert.ok(!res.isError, "bootstrap must not error");
  const text = res.content[0].text;

  const contractIdx = text.indexOf("Contrato de Boot");
  const promptIdx = text.indexOf("## System Prompt");
  assert.ok(contractIdx >= 0, "contract block present");
  assert.ok(promptIdx >= 0, "system prompt present");
  assert.ok(contractIdx < promptIdx, "contract must come BEFORE the long system prompt");
});

test("Boot Contract carries identity, org, user, session, reorient cadence", async () => {
  const { deps } = makeDeps({});
  const res = await dispatchTool("agent_bootstrap", { agent_id: "11111111-1111-1111-1111-111111111111" }, deps);
  const text = res.content[0].text;

  assert.match(text, /11111111-1111-1111-1111-111111111111/, "agent id present");
  assert.match(text, /RDX Security/, "org name present");
  assert.match(text, /22222222-2222-2222-2222-222222222222/, "org id present");
  assert.match(text, /grave memórias SOMENTE nesta org/i, "org write-scope warning present");
  assert.match(text, /renato\.diniz@rdxsec\.com\.br/, "user email present");
  assert.match(text, /formal-session-123/, "session id present");
  assert.match(text, /a cada 7 tool calls/, "reorient cadence N present");
  assert.match(text, /~65% de contexto/, "reorient cadence pct present");
  assert.match(text, /Persona: abc123def456/, "persona version present");
  assert.match(text, /Universe: `33333333-3333-3333-3333-333333333333`/, "universe present");
  assert.match(text, /Team: `44444444-4444-4444-4444-444444444444`/, "team present");
  // Reserved insertion point for the notifications frente.
  assert.match(text, /<!-- ALERTS_SLOT -->/, "alerts insertion point present");
});

test("the MCP starts the session and arms the reorient cadence", async () => {
  const capture = { sessionId: "auto-gen" };
  const { deps, startCalls } = makeDeps({ capture });
  await dispatchTool("agent_bootstrap", { agent_id: "11111111-1111-1111-1111-111111111111" }, deps);

  assert.equal(startCalls.length, 1, "session_start called exactly once");
  assert.equal(startCalls[0].agent_id, "11111111-1111-1111-1111-111111111111");
  assert.equal(capture.sessionId, "formal-session-123", "capture session id aligned");
  assert.equal(getSessionId(), "formal-session-123", "boot state holds session id");
  const cfg = getReorientConfig();
  assert.equal(cfg.reorientEveryN, 7, "cadence armed from server config");
  assert.equal(cfg.reorientOnContextPct, 65);
});

test("recent memories render real type, id and importance (not a constant [memory])", async () => {
  const { deps } = makeDeps({});
  const res = await dispatchTool("agent_bootstrap", { agent_id: "11111111-1111-1111-1111-111111111111" }, deps);
  const text = res.content[0].text;

  assert.match(text, /\[semantic\]/, "real memory type label");
  assert.doesNotMatch(text, /\[memory\]/, "the old constant [memory] label must be gone");
  assert.match(text, /id: mem-1/, "memory id surfaced");
  assert.match(text, /importance: 0\.82/, "importance surfaced");
});

test("skills render version and permission", async () => {
  const { deps } = makeDeps({});
  const res = await dispatchTool("agent_bootstrap", { agent_id: "11111111-1111-1111-1111-111111111111" }, deps);
  const text = res.content[0].text;

  assert.match(text, /deploy-prod/);
  assert.match(text, /v3/, "skill version surfaced");
  assert.match(text, /\[read\]/, "skill permission surfaced");
});

test("bootstrap still succeeds when session_start fails", async () => {
  const { deps } = makeDeps({
    startSession: async () => {
      throw new Error("memory engine down");
    },
  });
  const res = await dispatchTool("agent_bootstrap", { agent_id: "11111111-1111-1111-1111-111111111111" }, deps);
  assert.ok(!res.isError, "a session_start failure must not fail bootstrap");
  const text = res.content[0].text;
  assert.match(text, /Contrato de Boot/, "contract still rendered");
  // Cadence still armed even without a session.
  assert.equal(getReorientConfig().reorientEveryN, 7);
});
