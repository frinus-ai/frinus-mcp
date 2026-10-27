/**
 * Onda 3 (vii) — hierarchical anchoring at the MCP layer.
 *
 * Covers:
 *   - hierarchy_find renders candidate paths BY NAME (POST /graph/classify-preview)
 *   - memory_store forwards context_path to the backend
 *   - memory_store surfaces a non-fatal context_path_warning in the output
 *   - the tool descriptions state the placement precedence
 *
 * Run with: npm test  (node --import tsx --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { dispatchTool } from "../src/tools/handlers.js";
import { TOOLS } from "../src/tools/definitions.js";
import type { ToolHandlerDeps, ToolResult } from "../src/types/index.js";

function textOf(result: ToolResult): string {
  return result.content.map((c) => c.text).join("\n");
}

/** Deps whose memoryClient records the last payload and returns `payload`. */
function recordingDeps(method: string, payload: unknown) {
  const calls: unknown[] = [];
  const memoryClient: Record<string, unknown> = {
    [method]: async (arg: unknown) => {
      calls.push(arg);
      return payload;
    },
  };
  const deps = {
    memoryClient,
    resolvedUserId: null,
    resolvedUserEmail: null,
  } as unknown as ToolHandlerDeps;
  return { deps, calls };
}

// ---------------------------------------------------------------------------
// hierarchy_find
// ---------------------------------------------------------------------------
test("hierarchy_find renders candidate paths by name with confidence", async () => {
  // Real ClassifyPreviewResponse shape (memory/src/api/schemas.py).
  const payload = {
    candidates: [
      {
        context_id: "11111111-1111-1111-1111-111111111111",
        context_path: "Plataforma Frinus › Memory Engine",
        level: "concept",
        confidence: 0.83,
      },
      {
        context_id: "22222222-2222-2222-2222-222222222222",
        context_path: "Plataforma Frinus › Agent Service e MCP",
        level: "concept",
        confidence: 0.41,
      },
    ],
  };
  const { deps, calls } = recordingDeps("findHierarchy", payload);
  const result = await dispatchTool(
    "hierarchy_find",
    { query_text: "onde salvar algo sobre o reranker", limit: 5 },
    deps,
  );
  const text = textOf(result);

  assert.match(text, /Plataforma Frinus › Memory Engine/);
  assert.match(text, /0\.83/);
  assert.match(text, /context_path/i, "must tell the agent to copy the path");
  assert.doesNotMatch(text, /undefined/);
  assert.deepEqual(calls[0], {
    query_text: "onde salvar algo sobre o reranker",
    universe_id: undefined,
    limit: 5,
  });
});

test("hierarchy_find with no candidates degrades gracefully", async () => {
  const { deps } = recordingDeps("findHierarchy", { candidates: [] });
  const result = await dispatchTool("hierarchy_find", { query_text: "x" }, deps);
  assert.match(textOf(result), /Nenhum nó candidato/i);
});

// ---------------------------------------------------------------------------
// memory_store + context_path
// ---------------------------------------------------------------------------
test("memory_store forwards context_path to the backend", async () => {
  const payload = {
    id: "33333333-3333-3333-3333-333333333333",
    memory_type: "semantic",
    scope: "organization",
    hierarchy: [
      { id: "u", level: "universe", name: "Plataforma Frinus" },
      { id: "c", level: "concept", name: "Memory Engine" },
    ],
    classification_status: "approved",
  };
  const { deps, calls } = recordingDeps("storeMemory", payload);
  const result = await dispatchTool(
    "memory_store",
    {
      agent_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      content: "Fato: o reranker continua desligado em prod.",
      context_path: "Plataforma Frinus > Memory Engine",
    },
    deps,
  );

  assert.equal((calls[0] as any).context_path, "Plataforma Frinus > Memory Engine");
  assert.match(textOf(result), /Plataforma Frinus › Memory Engine/);
});

test("memory_store surfaces a non-fatal context_path_warning", async () => {
  const payload = {
    id: "44444444-4444-4444-4444-444444444444",
    memory_type: "semantic",
    scope: "organization",
    hierarchy: [{ id: "u", level: "universe", name: "Plataforma Frinus" }],
    classification_status: "universe_only",
    context_path_warning:
      "segmento 'Reranker' não encontrado; ancorado em 'Plataforma Frinus'.",
  };
  const { deps } = recordingDeps("storeMemory", payload);
  const result = await dispatchTool(
    "memory_store",
    {
      agent_id: "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa",
      content: "algo",
      context_path: "Plataforma Frinus > Reranker",
    },
    deps,
  );
  const text = textOf(result);
  assert.match(text, /context_path:/);
  assert.match(text, /Reranker/);
});

// ---------------------------------------------------------------------------
// Descriptions / schema
// ---------------------------------------------------------------------------
test("hierarchy_find tool is registered with a query_text parameter", () => {
  const tool = TOOLS.find((t) => t.name === "hierarchy_find");
  assert.ok(tool, "hierarchy_find must exist");
  const props = (tool!.inputSchema as any).properties;
  assert.ok(props.query_text, "query_text is required input");
  assert.match(tool!.description ?? "", /Read-only/i);
});

test("memory_store documents the placement precedence and context_path", () => {
  const tool = TOOLS.find((t) => t.name === "memory_store");
  assert.ok(tool);
  const props = (tool!.inputSchema as any).properties;
  assert.ok(props.context_path, "context_path param must exist");
  assert.match(tool!.description ?? "", /PRECEDENCE/i);
  assert.match(tool!.description ?? "", /context_id.*context_path.*universe_id/is);
  assert.match(tool!.description ?? "", /hierarchy_find/);
});
