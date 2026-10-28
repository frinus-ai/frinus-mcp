/**
 * Tests for the delegated-sleep pending nudge.
 *
 *   - fetchSleepWorkBlock: success, empty, disabled, throttle, failure/timeout
 *   - renderSleepWorkBlock: per-kind summary, example-kind selection, empty
 *
 * Run with: npm test  (node --import tsx --test)
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  fetchSleepWorkBlock,
  renderSleepWorkBlock,
  __resetSleepWorkState,
} from "../src/sleep-work.js";
import type { MemoryClientInterface, SleepWorkPending } from "../src/types/index.js";

/** A MemoryClient stub whose pending endpoint returns `pending` (or throws). */
function memStub(opts: {
  pending?: SleepWorkPending;
  throws?: unknown;
  onCall?: () => void;
}): MemoryClientInterface {
  return {
    async getSleepWorkPending(): Promise<SleepWorkPending> {
      opts.onCall?.();
      if (opts.throws) throw opts.throws;
      return opts.pending ?? { kinds: {} };
    },
  } as unknown as MemoryClientInterface;
}

beforeEach(() => {
  __resetSleepWorkState();
  delete process.env.FRINUS_SLEEP_WORK;
  delete process.env.FRINUS_SLEEP_WORK_INTERVAL_MIN;
});

afterEach(() => {
  __resetSleepWorkState();
  delete process.env.FRINUS_SLEEP_WORK;
  delete process.env.FRINUS_SLEEP_WORK_INTERVAL_MIN;
});

// ---------------------------------------------------------------------------
// renderSleepWorkBlock
// ---------------------------------------------------------------------------
test("render: available>0 renders count, daily remaining, skill and loop", () => {
  const block = renderSleepWorkBlock({
    kinds: { classification: { available: 42, daily_remaining: 500 } },
    daily_limit: 500,
  });
  assert.match(block, /Sono delegado/);
  assert.match(block, /42 em classificação de memórias na fila/);
  assert.match(block, /restam 500 hoje/);
  assert.match(block, /classificar-fila/);
  assert.match(block, /sleep_work_next\(kind="classification"\)/);
  assert.match(block, /sleep_work_submit/);
});

test("render: available==0 renders nothing", () => {
  assert.equal(renderSleepWorkBlock({ kinds: { classification: { available: 0, daily_remaining: 500 } } }), "");
});

test("render: no kinds / undefined renders nothing", () => {
  assert.equal(renderSleepWorkBlock({ kinds: {} }), "");
  assert.equal(renderSleepWorkBlock(undefined), "");
});

test("render: a Fase-2 kind still names a usable example kind", () => {
  const block = renderSleepWorkBlock({ kinds: { conflict_resolution: { available: 3 } } });
  assert.match(block, /resolução de conflitos/);
  assert.match(block, /sleep_work_next\(kind="conflict_resolution"\)/);
});

test("render: classification wins the example kind when several are available", () => {
  const block = renderSleepWorkBlock({
    kinds: { conflict_resolution: { available: 3 }, classification: { available: 1 } },
  });
  assert.match(block, /sleep_work_next\(kind="classification"\)/);
});

test("render: by_reason split is shown when present (per-kind), tolerant of absence", () => {
  const withSplit = renderSleepWorkBlock({
    kinds: { classification: { available: 42, daily_remaining: 500, by_reason: { l5_queue: 30, l2_unverified: 12 } } },
  });
  assert.match(withSplit, /42 em classificação de memórias na fila/);
  assert.match(withSplit, /30 L5/);
  assert.match(withSplit, /12 L2/);

  // Top-level by_reason also works for the classification kind.
  const topLevel = renderSleepWorkBlock({
    kinds: { classification: { available: 42, daily_remaining: 500 } },
    by_reason: { l5_queue: 40, l2_unverified: 2 },
  });
  assert.match(topLevel, /40 L5/);
  assert.match(topLevel, /2 L2/);

  // No by_reason: the nudge renders fine without a split.
  const none = renderSleepWorkBlock({ kinds: { classification: { available: 5 } } });
  assert.match(none, /5 em classificação/);
  assert.doesNotMatch(none, /L5|L2/);
});

// ---------------------------------------------------------------------------
// fetchSleepWorkBlock
// ---------------------------------------------------------------------------
test("success: renders the nudge when work is pending", async () => {
  const mem = memStub({ pending: { kinds: { classification: { available: 7, daily_remaining: 100 } } } });
  const block = await fetchSleepWorkBlock(mem, { force: true });
  assert.match(block, /7 em classificação/);
});

test("empty: available 0 returns '' (no nudge)", async () => {
  const mem = memStub({ pending: { kinds: { classification: { available: 0, daily_remaining: 100 } } } });
  assert.equal(await fetchSleepWorkBlock(mem, { force: true }), "");
});

test("failure (404/timeout): returns '' and does not throw", async () => {
  const mem404 = memStub({ throws: { response: { status: 404 }, message: "Not Found" } });
  assert.equal(await fetchSleepWorkBlock(mem404, { force: true }), "");
  __resetSleepWorkState();
  const memTimeout = memStub({ throws: { code: "ECONNABORTED", message: "timeout of 1500ms exceeded" } });
  assert.equal(await fetchSleepWorkBlock(memTimeout, { force: true }), "");
});

test("disabled: FRINUS_SLEEP_WORK=off returns '' without calling the endpoint", async () => {
  process.env.FRINUS_SLEEP_WORK = "off";
  let called = false;
  const mem = memStub({ pending: { kinds: { classification: { available: 9 } } }, onCall: () => (called = true) });
  assert.equal(await fetchSleepWorkBlock(mem, { force: true }), "");
  assert.equal(called, false);
});

test("throttle: a non-forced check within the window is skipped", async () => {
  let calls = 0;
  const mem = memStub({ pending: { kinds: { classification: { available: 5 } } }, onCall: () => (calls += 1) });
  assert.notEqual(await fetchSleepWorkBlock(mem, { force: false }), "");
  assert.equal(calls, 1);
  assert.equal(await fetchSleepWorkBlock(mem, { force: false }), "");
  assert.equal(calls, 1, "throttle must prevent a second poll within the window");
});

test("throttle: force bypasses the window", async () => {
  let calls = 0;
  const mem = memStub({ pending: { kinds: { classification: { available: 5 } } }, onCall: () => (calls += 1) });
  await fetchSleepWorkBlock(mem, { force: false });
  await fetchSleepWorkBlock(mem, { force: true });
  assert.equal(calls, 2);
});

test("throttle: a 0-minute interval disables throttling", async () => {
  process.env.FRINUS_SLEEP_WORK_INTERVAL_MIN = "0";
  let calls = 0;
  const mem = memStub({ pending: { kinds: { classification: { available: 5 } } }, onCall: () => (calls += 1) });
  await fetchSleepWorkBlock(mem, { force: false });
  await fetchSleepWorkBlock(mem, { force: false });
  assert.equal(calls, 2);
});
