/**
 * Guards the memory_store tool description (Onda 1, item 4).
 *
 * The old copy claimed "nothing is moved automatically", which is false: with
 * the tenant's auto_classify enabled and confidence >= threshold the backend
 * anchors the memory on its own (memory/src/api/routers/memories.py). This test
 * locks in the corrected wording so the stale claim cannot creep back.
 */
import { test } from "node:test";
import assert from "node:assert/strict";

import { TOOLS } from "../src/tools/definitions.js";

test("memory_store description no longer claims nothing is moved automatically", () => {
  const memoryStore = TOOLS.find((t) => t.name === "memory_store");
  assert.ok(memoryStore, "memory_store tool must exist");
  const desc = memoryStore!.description ?? "";

  assert.doesNotMatch(
    desc,
    /nothing is moved automatically/i,
    "the false 'nothing is moved automatically' claim must be gone",
  );
  // Must describe the real auto-anchoring behaviour and the manual override.
  assert.match(desc, /auto-?classification|auto-classification enabled|ANCHORS/i);
  assert.match(desc, /threshold/i);
  assert.match(desc, /manual/i);
});

test("detect_conflicts documents that similarity_threshold is ignored by the backend", () => {
  const tool = TOOLS.find((t) => t.name === "consolidation_detect_conflicts");
  assert.ok(tool, "consolidation_detect_conflicts tool must exist");
  const props = (tool!.inputSchema as any).properties;
  assert.match(
    props.similarity_threshold.description,
    /ignored/i,
    "similarity_threshold must be documented as ignored for conflict detection",
  );
});
