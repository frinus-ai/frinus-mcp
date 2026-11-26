/**
 * Tests for the agent_reorient renderer surfacing the `delegation` field added
 * by PR #132 (frinus-backend) to POST /agents/{id}/reorient.
 *
 * Why it matters: the orchestrator's delegation rulebook previously lived ONLY
 * in the agent_bootstrap tool result, which Claude Code discards on a context
 * compaction — after which the orchestrator reverted to `general-purpose`. The
 * reorient TEXT survives compaction, so the block must render there, right after
 * Identity. Specialists receive `delegation: null` and the block is omitted.
 *
 * Driven through `dispatchTool` with a fake memoryClient — no network.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

process.env.FRINUS_NOTIFICATIONS = "off";

import { dispatchTool } from "../src/tools/handlers.js";
import { __resetBootState } from "../src/tools/boot-state.js";
import type { ToolHandlerDeps } from "../src/types/index.js";

const AGENT_ID = "11111111-1111-1111-1111-111111111111";

function makeReorientPayload(overrides: Record<string, unknown> = {}) {
  return {
    identity: {
      id: AGENT_ID,
      name: "FRINUS Orchestrator",
      role: "orquestração e roteamento",
    },
    persona_version: "abc123",
    working_memory: [{ content: "Último: revisão do PR de delegação." }],
    relevant_memories: [],
    recent_high_importance: [],
    ...overrides,
  };
}

function makeDeps(payload: Record<string, unknown>): ToolHandlerDeps {
  return {
    memoryClient: {
      reorientAgent: async (_id: string, _focus?: string) => payload,
    },
  } as unknown as ToolHandlerDeps;
}

beforeEach(() => __resetBootState());

test("delegation block renders right after Identity when the server sends it", async () => {
  const rulebook =
    "## Delegação (regra dura)\n" +
    "- Para QUALQUER trabalho técnico, delegue ao subagente `frinus-specialist`.\n" +
    "- NUNCA use `general-purpose` quando há especialista de domínio.";
  const deps = makeDeps(makeReorientPayload({ delegation: rulebook }));

  const res = await dispatchTool("agent_reorient", { agent_id: AGENT_ID }, deps);
  assert.ok(!res.isError, "reorient must not error");
  const text = res.content[0].text;

  assert.match(text, /## Delegation/, "delegation heading present");
  assert.match(text, /frinus-specialist/, "delegation body present");
  assert.match(text, /NUNCA use `general-purpose`/, "full markdown body carried");

  // Positioned right after Identity and before Working Memory.
  const identityIdx = text.indexOf("## Identity");
  const delegationIdx = text.indexOf("## Delegation");
  const workingIdx = text.indexOf("## Working Memory");
  assert.ok(identityIdx >= 0, "identity section present");
  assert.ok(delegationIdx > identityIdx, "delegation comes AFTER identity");
  assert.ok(
    workingIdx === -1 || delegationIdx < workingIdx,
    "delegation comes BEFORE working memory",
  );
});

test("delegation block is omitted for specialists (delegation: null)", async () => {
  const deps = makeDeps(makeReorientPayload({ delegation: null }));

  const res = await dispatchTool("agent_reorient", { agent_id: AGENT_ID }, deps);
  assert.ok(!res.isError, "reorient must not error");
  const text = res.content[0].text;

  assert.doesNotMatch(text, /## Delegation/, "no delegation heading for specialist");
  // Identity still rendered.
  assert.match(text, /## Identity/, "identity still present");
  assert.match(text, /FRINUS Orchestrator/, "identity name still present");
});

test("delegation block is omitted when the field is absent or blank", async () => {
  for (const value of [undefined, "", "   "]) {
    const payload = makeReorientPayload();
    if (value !== undefined) (payload as Record<string, unknown>).delegation = value;
    const deps = makeDeps(payload);

    const res = await dispatchTool("agent_reorient", { agent_id: AGENT_ID }, deps);
    assert.ok(!res.isError, "reorient must not error");
    assert.doesNotMatch(
      res.content[0].text,
      /## Delegation/,
      `delegation omitted for value=${JSON.stringify(value)}`,
    );
  }
});
