/**
 * Platform notifications delivered through the MCP channel.
 *
 * Clients rarely come back to the web dashboard after the initial integration,
 * so the MCP session itself becomes the way to reach them. This module fetches
 * the Control Plane inbox and renders a compact markdown block that is appended
 * to `agent_bootstrap` (once, forced) and `heartbeat_tick` (throttled).
 *
 * Design rules:
 *  - NEVER throws. A 404, timeout or any network error yields '' plus a stderr
 *    log. The agent's real work must never be blocked by the news channel.
 *  - In-process state, per MCP process (= per session): which notification ids
 *    were already shown, and when we last hit the inbox. A long-lived process
 *    therefore shows each item at most once and polls at most once per window.
 *  - Env toggles: FRINUS_NOTIFICATIONS=off disables everything;
 *    FRINUS_NOTIFICATIONS_INTERVAL_MIN overrides the throttle window (default 60).
 */
import type { CpClientInterface, NotificationItem } from "./types/index.js";

/** Max characters of a notification body rendered inline. */
const BODY_LIMIT = 600;

/** Default throttle window for non-forced checks (minutes). */
const DEFAULT_INTERVAL_MIN = 60;

// ---------------------------------------------------------------------------
// In-process session state
// ---------------------------------------------------------------------------
/** Notification ids already shown in this session (dedupe across bootstrap + ticks). */
const shownIds = new Set<string>();
/** Epoch ms of the last inbox check (forced or throttled). 0 = never. */
let lastCheckAt = 0;

/** Reset module state. Test-only; not part of the runtime surface. */
export function __resetNotificationsState(): void {
  shownIds.clear();
  lastCheckAt = 0;
}

function isDisabled(): boolean {
  return (process.env.FRINUS_NOTIFICATIONS || "").trim().toLowerCase() === "off";
}

function throttleMs(): number {
  const raw = process.env.FRINUS_NOTIFICATIONS_INTERVAL_MIN;
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  const minutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INTERVAL_MIN;
  return minutes * 60_000;
}

export interface FetchBlockOptions {
  /** Bypass the throttle window (used by agent_bootstrap). */
  force?: boolean;
}

/**
 * Fetch the inbox and render the "Novidades do Frinus" block, or '' when there
 * is nothing new to show (disabled, throttled, empty, already-shown, or any
 * failure). Guaranteed not to throw.
 */
export async function fetchNotificationsBlock(
  cpClient: CpClientInterface,
  opts: FetchBlockOptions = {},
): Promise<string> {
  if (isDisabled()) return "";

  const now = Date.now();
  if (!opts.force && now - lastCheckAt < throttleMs()) {
    return "";
  }
  lastCheckAt = now;

  let inbox;
  try {
    inbox = await cpClient.getNotificationInbox({
      channel: "mcp",
      limit: 3,
      markDelivered: true,
    });
  } catch (err: any) {
    // 404 (CP not yet deployed), timeout, DNS, connection refused — all benign
    // here. Swallow and keep working; log to stderr for operators.
    console.error(`[Notifications] inbox fetch failed: ${err?.message || err}`);
    return "";
  }

  const fresh = (inbox?.items || []).filter(
    (it): it is NotificationItem => !!it && typeof it.id === "string" && !shownIds.has(it.id),
  );
  if (fresh.length === 0) return "";

  for (const it of fresh) shownIds.add(it.id);
  return renderBlock(fresh);
}

/** Render the markdown block the agent relays to the user. */
function renderBlock(items: NotificationItem[]): string {
  let out = `## 📣 Novidades do Frinus\n\n`;

  for (const it of items) {
    const sev = it.severity ? ` _(${it.severity})_` : "";
    out += `### ${it.title}${sev}\n`;

    let body = (it.body || "").trim();
    if (body.length > BODY_LIMIT) {
      body = body.slice(0, BODY_LIMIT).trimEnd() + "…";
    }
    if (body) out += `${body}\n`;

    if (it.cta_label && it.cta_url) {
      out += `\n[${it.cta_label}](${it.cta_url})\n`;
    } else if (it.cta_url) {
      out += `\n${it.cta_url}\n`;
    }

    out += `\n_id: ${it.id}_\n\n`;
  }

  out += `---\n`;
  out +=
    `Avise o usuário destas novidades de forma breve (1–3 linhas cada) no ` +
    `início da sua próxima resposta, sem interromper a tarefa. Quando ele ` +
    `confirmar ciência ou pedir para não ver mais, chame notification_ack(id).\n`;

  return out;
}
