/**
 * Tests for the MCP platform-notifications channel.
 *
 *   - fetchNotificationsBlock: success, 404, timeout, dedupe, throttle, disabled
 *   - notifications_list / notification_ack tools (via dispatchTool)
 *
 * Run with: npm test  (node --import tsx --test)
 */
import { test, beforeEach, afterEach } from "node:test";
import assert from "node:assert/strict";

import {
  fetchNotificationsBlock,
  __resetNotificationsState,
} from "../src/notifications.js";
import { dispatchTool } from "../src/tools/handlers.js";
import type {
  CpClientInterface,
  NotificationInbox,
  ToolHandlerDeps,
  ToolResult,
} from "../src/types/index.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function item(id: string, over: Partial<any> = {}) {
  return {
    id,
    slug: `slug-${id}`,
    title: `Title ${id}`,
    body: `Body for ${id}`,
    kind: "feature",
    severity: "info",
    cta_label: "Open",
    cta_url: "https://frinus.rdxsec.com.br/skills",
    starts_at: null,
    expires_at: null,
    ...over,
  };
}

/** A CpClient stub whose inbox returns `inbox` (or throws `throws`). */
function cpStub(opts: {
  inbox?: NotificationInbox;
  throws?: unknown;
  onInbox?: (o: any) => void;
  onAck?: (id: string) => void | Promise<void>;
}): CpClientInterface {
  return {
    async getNotificationInbox(o?: any): Promise<NotificationInbox> {
      opts.onInbox?.(o);
      if (opts.throws) throw opts.throws;
      return opts.inbox ?? { items: [], count: 0 };
    },
    async ackNotification(id: string): Promise<void> {
      await opts.onAck?.(id);
    },
  } as unknown as CpClientInterface;
}

function depsWithCp(cpClient: CpClientInterface): ToolHandlerDeps {
  return {
    cpClient,
    memoryClient: {},
    agentClient: {},
    capture: {},
    resolvedUserId: null,
    resolvedUserEmail: null,
    cpUrl: "http://cp",
  } as unknown as ToolHandlerDeps;
}

function textOf(result: ToolResult): string {
  return result.content.map((c) => c.text).join("\n");
}

beforeEach(() => {
  __resetNotificationsState();
  delete process.env.FRINUS_NOTIFICATIONS;
  delete process.env.FRINUS_NOTIFICATIONS_INTERVAL_MIN;
});

afterEach(() => {
  __resetNotificationsState();
  delete process.env.FRINUS_NOTIFICATIONS;
  delete process.env.FRINUS_NOTIFICATIONS_INTERVAL_MIN;
});

// ---------------------------------------------------------------------------
// fetchNotificationsBlock
// ---------------------------------------------------------------------------
test("success: renders title, severity, body, CTA, id and the agent instruction", async () => {
  const cp = cpStub({ inbox: { items: [item("a1")], count: 1 } });
  const block = await fetchNotificationsBlock(cp, { force: true });

  assert.match(block, /## 📣 Novidades do Frinus/);
  assert.match(block, /Title a1/);
  assert.match(block, /_\(info\)_/);
  assert.match(block, /Body for a1/);
  assert.match(block, /\[Open\]\(https:\/\/frinus\.rdxsec\.com\.br\/skills\)/);
  assert.match(block, /_id: a1_/);
  assert.match(block, /chame notification_ack\(id\)/);
});

test("success: marks the inbox as delivered (mark_delivered=true)", async () => {
  let seen: any = null;
  const cp = cpStub({ inbox: { items: [item("a1")], count: 1 }, onInbox: (o) => (seen = o) });
  await fetchNotificationsBlock(cp, { force: true });
  assert.equal(seen.markDelivered, true);
  assert.equal(seen.channel, "mcp");
});

test("body is truncated to ~600 chars with an ellipsis", async () => {
  const longBody = "x".repeat(2000);
  const cp = cpStub({ inbox: { items: [item("a1", { body: longBody })], count: 1 } });
  const block = await fetchNotificationsBlock(cp, { force: true });
  assert.match(block, /…/);
  // The rendered body line must be far shorter than the 2000-char source.
  const bodyLine = block.split("\n").find((l) => l.startsWith("x")) ?? "";
  assert.ok(bodyLine.length <= 610, `body line too long: ${bodyLine.length}`);
});

test("404: returns '' and does not throw (CP not deployed yet)", async () => {
  const cp = cpStub({ throws: { response: { status: 404 }, message: "Not Found" } });
  const block = await fetchNotificationsBlock(cp, { force: true });
  assert.equal(block, "");
});

test("timeout: returns '' and does not throw", async () => {
  const cp = cpStub({ throws: { code: "ECONNABORTED", message: "timeout of 4000ms exceeded" } });
  const block = await fetchNotificationsBlock(cp, { force: true });
  assert.equal(block, "");
});

test("dedupe: an item already shown in this session is not shown again", async () => {
  const cp = cpStub({ inbox: { items: [item("a1")], count: 1 } });
  const first = await fetchNotificationsBlock(cp, { force: true });
  assert.notEqual(first, "");
  // Force again bypasses the throttle, so '' here proves dedupe (not throttle).
  const second = await fetchNotificationsBlock(cp, { force: true });
  assert.equal(second, "");
});

test("throttle: a non-forced check within the window is skipped", async () => {
  let calls = 0;
  // Each call returns a DIFFERENT id, so a non-empty second result could only
  // come from an actual fetch — '' proves the throttle short-circuited it.
  const cp = {
    async getNotificationInbox(): Promise<NotificationInbox> {
      calls += 1;
      return { items: [item(`n${calls}`)], count: 1 };
    },
    async ackNotification(): Promise<void> {},
  } as unknown as CpClientInterface;

  const first = await fetchNotificationsBlock(cp, { force: false });
  assert.notEqual(first, "");
  assert.equal(calls, 1);

  const second = await fetchNotificationsBlock(cp, { force: false });
  assert.equal(second, "");
  assert.equal(calls, 1, "throttle must prevent a second inbox call within the window");
});

test("throttle: a 0-minute interval disables throttling", async () => {
  process.env.FRINUS_NOTIFICATIONS_INTERVAL_MIN = "0";
  let calls = 0;
  const cp = {
    async getNotificationInbox(): Promise<NotificationInbox> {
      calls += 1;
      return { items: [item(`n${calls}`)], count: 1 };
    },
    async ackNotification(): Promise<void> {},
  } as unknown as CpClientInterface;

  await fetchNotificationsBlock(cp, { force: false });
  await fetchNotificationsBlock(cp, { force: false });
  assert.equal(calls, 2);
});

test("disabled: FRINUS_NOTIFICATIONS=off returns '' without fetching", async () => {
  process.env.FRINUS_NOTIFICATIONS = "off";
  let called = false;
  const cp = cpStub({ inbox: { items: [item("a1")], count: 1 }, onInbox: () => (called = true) });
  const block = await fetchNotificationsBlock(cp, { force: true });
  assert.equal(block, "");
  assert.equal(called, false);
});

// ---------------------------------------------------------------------------
// notifications_list tool
// ---------------------------------------------------------------------------
test("notifications_list: lists pending items without marking delivered", async () => {
  let seen: any = null;
  const cp = cpStub({
    inbox: { items: [item("a1"), item("a2", { severity: "warning" })], count: 2 },
    onInbox: (o) => (seen = o),
  });
  const res = await dispatchTool("notifications_list", {}, depsWithCp(cp));
  const text = textOf(res);

  assert.equal(seen.markDelivered, false, "list must not consume a delivery");
  assert.match(text, /2 pending Frinus notifications/);
  assert.match(text, /Title a1 \(id: a1\)/);
  assert.match(text, /\[warning\] Title a2/);
  assert.match(text, /notification_ack\(id\)/);
});

test("notifications_list: empty inbox", async () => {
  const cp = cpStub({ inbox: { items: [], count: 0 } });
  const res = await dispatchTool("notifications_list", {}, depsWithCp(cp));
  assert.match(textOf(res), /No pending Frinus notifications/);
});

test("notifications_list: 404 is treated as empty, not an error", async () => {
  const cp = cpStub({ throws: { response: { status: 404 }, message: "Not Found" } });
  const res = await dispatchTool("notifications_list", {}, depsWithCp(cp));
  assert.notEqual(res.isError, true);
  assert.match(textOf(res), /No pending Frinus notifications/);
});

// ---------------------------------------------------------------------------
// notification_ack tool
// ---------------------------------------------------------------------------
test("notification_ack: acknowledges a valid id", async () => {
  let acked: string | null = null;
  const cp = cpStub({ onAck: (id) => { acked = id; } });
  const res = await dispatchTool("notification_ack", { id: "a1" }, depsWithCp(cp));
  assert.equal(acked, "a1");
  assert.match(textOf(res), /acknowledged/);
  assert.notEqual(res.isError, true);
});

test("notification_ack: missing id is a clear error", async () => {
  const cp = cpStub({});
  const res = await dispatchTool("notification_ack", {}, depsWithCp(cp));
  assert.equal(res.isError, true);
  assert.match(textOf(res), /requires an 'id'/);
});

test("notification_ack: 404 is reported gracefully (not an error)", async () => {
  const cp = cpStub({ onAck: () => { throw { response: { status: 404 }, message: "Not Found" }; } });
  const res = await dispatchTool("notification_ack", { id: "gone" }, depsWithCp(cp));
  assert.notEqual(res.isError, true);
  assert.match(textOf(res), /not found/);
});
