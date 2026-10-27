/**
 * Tests for the deterministic reorient cadence (tools/boot-state.ts).
 *
 * The whole point is that the MCP — not the model's memory — decides when a
 * reorient is due. These lock in: the counter only arms after boot, exempt
 * tools never count, the banner shows at the configured N and keeps showing
 * until agent_reorient resets it, and config is clamped sanely.
 */
import { test, beforeEach } from "node:test";
import assert from "node:assert/strict";

import {
  __resetBootState,
  getReorientConfig,
  getSessionId,
  isBooted,
  markBooted,
  noteToolCall,
  reorientBanner,
  reorientDue,
  resetReorientCounter,
} from "../src/tools/boot-state.js";

beforeEach(() => __resetBootState());

test("counter does not arm before boot", () => {
  assert.equal(isBooted(), false);
  for (let i = 0; i < 20; i++) noteToolCall("memory_search");
  assert.equal(reorientDue(), false);
  assert.equal(reorientBanner(), null);
});

test("banner fires exactly at the configured N and repeats until reorient", () => {
  markBooted({ agentId: "agent-1", sessionId: "sess-1", config: { reorientEveryN: 3 } });

  noteToolCall("memory_search"); // 1
  noteToolCall("memory_store"); // 2
  assert.equal(reorientDue(), false, "not due before N");
  assert.equal(reorientBanner(), null);

  noteToolCall("memory_search"); // 3 -> due
  assert.equal(reorientDue(), true);
  const banner = reorientBanner();
  assert.ok(banner, "banner must appear at N");
  assert.match(banner!, /REORIENT DEVIDO/);
  assert.match(banner!, /agent_reorient\(agent_id="agent-1"\)/);

  // Still due on the next call (repeats until reorient).
  noteToolCall("memory_search"); // 4
  assert.ok(reorientBanner(), "banner repeats until reorient");
});

test("agent_reorient resets the counter and clears the banner", () => {
  markBooted({ agentId: "agent-1", config: { reorientEveryN: 2 } });
  noteToolCall("memory_search");
  noteToolCall("memory_search");
  assert.ok(reorientBanner(), "due before reorient");

  // Going through noteToolCall with the exempt name must reset.
  noteToolCall("agent_reorient");
  assert.equal(reorientDue(), false);
  assert.equal(reorientBanner(), null);
});

test("exempt tools never increment the counter", () => {
  markBooted({ agentId: "agent-1", config: { reorientEveryN: 2 } });
  noteToolCall("agent_bootstrap");
  noteToolCall("agent_bootstrap");
  noteToolCall("agent_reorient");
  assert.equal(reorientDue(), false, "exempt calls must not count toward cadence");
});

test("explicit resetReorientCounter clears the banner", () => {
  markBooted({ agentId: "agent-1", config: { reorientEveryN: 1 } });
  noteToolCall("memory_search");
  assert.ok(reorientBanner());
  resetReorientCounter();
  assert.equal(reorientBanner(), null);
});

test("markBooted records session id and clamps config", () => {
  markBooted({
    agentId: "agent-1",
    sessionId: "sess-9",
    config: { reorientEveryN: 0, reorientOnContextPct: 999 },
  });
  assert.equal(getSessionId(), "sess-9");
  const cfg = getReorientConfig();
  // Invalid values (n<1, pct>100) are rejected -> defaults kept.
  assert.equal(cfg.reorientEveryN, 10);
  assert.equal(cfg.reorientOnContextPct, 70);
});

test("markBooted accepts valid config", () => {
  markBooted({ agentId: "a", config: { reorientEveryN: 15, reorientOnContextPct: 80 } });
  const cfg = getReorientConfig();
  assert.equal(cfg.reorientEveryN, 15);
  assert.equal(cfg.reorientOnContextPct, 80);
});
