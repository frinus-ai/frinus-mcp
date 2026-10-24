/**
 * Contract regression tests for the Onda 1 fixes (Q-MEM-02/03/04).
 *
 * These exercise the real response shapes emitted by the Memory Engine:
 *   - search_with_attention  → memory/src/api/routers/attention.py
 *                              (MemoryWithAttentionScore: attention_score /
 *                               base_similarity / attention_weight)
 *   - detect_conflicts       → memory/src/api/routers/forgetting.py
 *                              (ConflictPair: memory_1 / memory_2 /
 *                               conflict_type / suggested_action)
 *   - detect_redundant       → memory/src/api/routers/forgetting.py
 *                              (RedundantGroup: keep / redundant / total_in_group)
 *
 * The payloads below are copied from those routers/schemas so a future contract
 * drift on either side breaks a test instead of silently printing "undefined".
 *
 * Run with: npm test  (node --import tsx --test)
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { dispatchTool } from "../src/tools/handlers.js";
import type { ToolHandlerDeps, ToolResult } from "../src/types/index.js";

/** Build deps whose memoryClient is a stub returning `payload` for `method`. */
function depsWith(method: string, payload: unknown): ToolHandlerDeps {
  const memoryClient: Record<string, unknown> = {
    [method]: async () => payload,
  };
  return {
    memoryClient,
    resolvedUserId: null,
    resolvedUserEmail: null,
  } as unknown as ToolHandlerDeps;
}

function textOf(result: ToolResult): string {
  return result.content.map((c) => c.text).join("\n");
}

// ---------------------------------------------------------------------------
// Q-MEM-02 — search_with_attention renders the correct score
// ---------------------------------------------------------------------------
test("Q-MEM-02: search_with_attention renders attention_score, not undefined", async () => {
  // Real SearchWithAttentionResponse shape (attention.py:416-422).
  const payload = {
    task_type_used: "debug",
    was_auto_detected: false,
    weights_used: { procedural: 0.2, semantic: 0.3, episodic: 0.5 },
    total_count: 2,
    memories: [
      {
        id: "11111111-1111-1111-1111-111111111111",
        memory_type: "episodic",
        scope: "organization",
        content: "Incidente de DiskPressure derrubou o agent por 5 minutos.",
        importance: 0.8,
        metadata: {},
        created_at: "2026-10-22T10:00:00Z",
        base_similarity: 0.71,
        attention_score: 0.42,
        attention_weight: 0.5,
      },
    ],
  };

  const result = await dispatchTool(
    "search_with_attention",
    { query_text: "disco cheio", task_type: "debug" },
    depsWith("searchWithAttention", payload),
  );
  const text = textOf(result);

  assert.ok(!result.isError, "should not be an error result");
  assert.match(text, /score: 0\.42/, "must render attention_score (0.42)");
  assert.doesNotMatch(text, /undefined/, "must not print 'undefined' for the score");
  assert.match(text, /task: debug/);
});

test("Q-MEM-02: falls back to base_similarity / similarity when attention_score is absent", async () => {
  const payload = {
    task_type_used: "general",
    memories: [
      // Only base_similarity present.
      {
        id: "a",
        memory_type: "semantic",
        content: "só base_similarity",
        base_similarity: 0.6,
      },
      // Only similarity present (plain /memories/search compat).
      {
        id: "b",
        memory_type: "semantic",
        content: "só similarity",
        similarity: 0.55,
      },
    ],
  };

  const text = textOf(
    await dispatchTool(
      "search_with_attention",
      { query_text: "x", task_type: "general" },
      depsWith("searchWithAttention", payload),
    ),
  );
  assert.match(text, /score: 0\.60/);
  assert.match(text, /score: 0\.55/);
  assert.doesNotMatch(text, /undefined/);
});

// ---------------------------------------------------------------------------
// Q-MEM-03 — detect_conflicts reads memory_1 / memory_2 and shows them
// ---------------------------------------------------------------------------
test("Q-MEM-03: detect_conflicts renders memory_1/memory_2 content + type + action", async () => {
  // Real ConflictDetectionResponse shape (forgetting.py:74-100, schemas ConflictPair).
  const payload = {
    conflicts_found: 1,
    conflicts: [
      {
        memory_1: {
          id: "m1",
          content: "Procedimento de deploy usa rolling update de 1 réplica.",
          created_at: "2026-10-01T00:00:00Z",
          importance: 0.8,
          type: "procedural",
        },
        memory_2: {
          id: "m2",
          content: "Procedimento de deploy usa recreate (derruba tudo).",
          created_at: "2026-10-10T00:00:00Z",
          importance: 0.7,
          type: "procedural",
        },
        similarity: 0.83,
        conflict_type: "contradiction",
        suggested_action: "review_and_resolve",
      },
    ],
  };

  const text = textOf(
    await dispatchTool(
      "consolidation_detect_conflicts",
      { limit: 50 },
      depsWith("detectConflicts", payload),
    ),
  );

  assert.match(text, /rolling update/, "memory_1 content must be readable");
  assert.match(text, /recreate/, "memory_2 content must be readable");
  assert.match(text, /contradiction/, "conflict_type must be shown");
  assert.match(text, /review_and_resolve/, "suggested_action must be shown");
  assert.match(text, /Similarity: 0\.83/);
  assert.doesNotMatch(text, /undefined/);
});

// ---------------------------------------------------------------------------
// Q-MEM-04 — detect_redundant reads keep / redundant / total_in_group
// ---------------------------------------------------------------------------
test("Q-MEM-04: detect_redundant renders total_in_group, keep preview and redundant count", async () => {
  // Real RedundantDetectionResponse shape (forgetting.py:136-164, RedundantGroup).
  const payload = {
    groups_found: 1,
    total_redundant: 2,
    groups: [
      {
        keep: {
          id: "k1",
          content: "Fato: PostgreSQL com pgvector na porta 5432.",
          importance: 0.9,
          created_at: "2026-09-01T00:00:00Z",
        },
        redundant: [
          { id: "r1", content: "pg na 5432", importance: 0.4, created_at: null },
          { id: "r2", content: "postgres 5432", importance: 0.3, created_at: null },
        ],
        total_in_group: 3,
      },
    ],
  };

  const text = textOf(
    await dispatchTool(
      "consolidation_detect_redundant",
      { similarity_threshold: 0.95, limit: 50 },
      depsWith("detectRedundant", payload),
    ),
  );

  assert.match(text, /Memories in group: 3/, "must read total_in_group");
  assert.match(text, /redundant 2/, "must count the redundant[] array");
  assert.match(text, /pgvector/, "must preview group.keep.content");
  assert.doesNotMatch(text, /N\/A/, "must not print the old avg_similarity 'N/A'");
  assert.doesNotMatch(text, /undefined/);
});

test("Q-MEM-04: total_in_group falls back to keep+redundant when field absent", async () => {
  const payload = {
    groups: [
      {
        keep: { id: "k", content: "keep", importance: 0.9 },
        redundant: [{ id: "r", content: "dup", importance: 0.2 }],
        // total_in_group deliberately omitted
      },
    ],
  };
  const text = textOf(
    await dispatchTool(
      "consolidation_detect_redundant",
      {},
      depsWith("detectRedundant", payload),
    ),
  );
  assert.match(text, /Memories in group: 2/);
  assert.doesNotMatch(text, /undefined/);
});
