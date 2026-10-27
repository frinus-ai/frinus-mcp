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
 *  - In-process session state, per MCP process (= per session): WHEN each item
 *    was last shown, and when we last hit the inbox. Dedupe is a sliding WINDOW,
 *    not "forever": a long-lived process re-presents an un-acked item once the
 *    reprompt window elapses, so an ignored notice resurfaces on a later
 *    heartbeat instead of vanishing for the whole session. The server still caps
 *    total deliveries (counted at most once/day per user), so this cannot spam.
 *  - Env toggles: FRINUS_NOTIFICATIONS=off disables everything;
 *    FRINUS_NOTIFICATIONS_INTERVAL_MIN overrides the FETCH throttle (default 60);
 *    FRINUS_NOTIFICATIONS_REPROMPT_MIN overrides how long an already-shown item
 *    stays suppressed before it may be re-presented (default 1440 = 24h).
 */
import type { CpClientInterface, NotificationItem } from "./types/index.js";

/** Max characters of a notification body rendered inline. */
const BODY_LIMIT = 600;

/** Default FETCH throttle window for non-forced checks (minutes). */
const DEFAULT_INTERVAL_MIN = 60;

/** Default reprompt window: how long a shown item stays suppressed (minutes). */
const DEFAULT_REPROMPT_MIN = 1440; // 24h — aligns with the server's per-day delivery count.

// ---------------------------------------------------------------------------
// In-process session state
// ---------------------------------------------------------------------------
/**
 * Epoch ms each notification id was last SHOWN in this session. Used for a
 * windowed dedupe: an item is re-presentable once `now - shownAt > reprompt`.
 */
const shownAt = new Map<string, number>();
/** Epoch ms of the last inbox check (forced or throttled). 0 = never. */
let lastCheckAt = 0;

/** Reset module state. Test-only; not part of the runtime surface. */
export function __resetNotificationsState(): void {
  shownAt.clear();
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

function repromptMs(): number {
  const raw = process.env.FRINUS_NOTIFICATIONS_REPROMPT_MIN;
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  const minutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_REPROMPT_MIN;
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

  const now2 = Date.now();
  const window = repromptMs();
  const fresh = (inbox?.items || []).filter((it): it is NotificationItem => {
    if (!it || typeof it.id !== "string") return false;
    const last = shownAt.get(it.id);
    // Unseen this session, or last shown long enough ago to re-present.
    return last === undefined || now2 - last >= window;
  });
  if (fresh.length === 0) return "";

  for (const it of fresh) shownAt.set(it.id, now2);
  return renderBlock(fresh);
}

/** Human label for a notification scope, used in the rendered header. */
function scopeLabel(scope?: string): string {
  if (scope === "organization") return "Organização";
  if (scope === "system") return "Sistema";
  return "Sistema"; // default/unknown: treat as a platform notice.
}

/**
 * Render the markdown block the agent relays to the user. Exported so another
 * frente can insert it at the TOP of the boot contract (the preferred place —
 * appended at the end, a ~15k-token bootstrap buries it and the model skips it).
 *
 * The block is self-contained: it tells the agent to relay briefly, to ack on
 * the user's confirmation, and — for `critical` items — to relay IMMEDIATELY.
 */
export function renderBlock(items: NotificationItem[]): string {
  const hasCritical = items.some((it) => it.severity === "critical");
  let out = `## 📣 Novidades do Frinus\n\n`;

  for (const it of items) {
    const label = scopeLabel(it.scope);
    const sev = it.severity ? ` · _${it.severity}_` : "";
    out += `### [${label}] ${it.title}${sev}\n`;

    if (it.severity === "critical") {
      out += `> ⚠️ CRÍTICO — repasse ao usuário IMEDIATAMENTE, antes de seguir com a tarefa.\n`;
    }

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
  if (hasCritical) {
    out +=
      `Há um aviso CRÍTICO acima: repasse-o ao usuário IMEDIATAMENTE, no início ` +
      `da sua próxima resposta. `;
  } else {
    out += `Avise o usuário destas novidades de forma breve (1–3 linhas cada) no ` +
      `início da sua próxima resposta, sem interromper a tarefa. `;
  }
  out +=
    `Avisos marcados [Sistema] vêm do Frinus; [Organização] vêm da própria ` +
    `organização do usuário. Quando ele confirmar ciência ou pedir para não ` +
    `ver mais, chame notification_ack(id).\n`;

  return out;
}
