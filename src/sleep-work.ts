/**
 * Delegated-sleep work: the pending-work nudge shown on bootstrap/heartbeat.
 *
 * Some sleep-cycle steps need judgment the server will not spend an LLM on —
 * foremost, classifying the memories sitting in the review queue. Those are
 * handed to the CLIENT's LLM (Claude Code via MCP) through the `sleep_work_*`
 * tools. For the client to know there is anything to do, we poll
 * `GET /sleep-work/pending` (a cheap COUNT) and, when work is waiting, append a
 * single compact line to `agent_bootstrap` (forced) and `heartbeat_tick`
 * (throttled). The actual loop lives in the `classificar-fila` skill.
 *
 * Design rules (mirrors notifications.ts):
 *  - NEVER throws. A 404 (Memory Engine not yet on this version), a timeout, or
 *    any network error yields '' plus a stderr log. The agent's real work must
 *    never be blocked — nor slowed: the poll uses a tight (<=1.5s) deadline.
 *  - No nudge when there is nothing to do (available == 0), when disabled, or
 *    when throttled.
 *  - In-process throttle (per MCP process = per session): the last time we hit
 *    the endpoint. bootstrap forces a check; heartbeat is throttled so it does
 *    not re-poll on every tick.
 *  - Env toggles: FRINUS_SLEEP_WORK=off disables everything;
 *    FRINUS_SLEEP_WORK_INTERVAL_MIN overrides the fetch throttle (default 30).
 */
import type { MemoryClientInterface, SleepWorkPending } from "./types/index.js";

/** Tight deadline (ms) for the pending poll. Best-effort side channel. */
export const SLEEP_WORK_PENDING_TIMEOUT_MS = 1500;

/** Default fetch throttle window for non-forced checks (minutes). */
const DEFAULT_INTERVAL_MIN = 30;

// ---------------------------------------------------------------------------
// In-process session state
// ---------------------------------------------------------------------------
/** Epoch ms of the last pending check (forced or throttled). 0 = never. */
let lastCheckAt = 0;

/** Reset module state. Test-only; not part of the runtime surface. */
export function __resetSleepWorkState(): void {
  lastCheckAt = 0;
}

function isDisabled(): boolean {
  return (process.env.FRINUS_SLEEP_WORK || "").trim().toLowerCase() === "off";
}

function throttleMs(): number {
  const raw = process.env.FRINUS_SLEEP_WORK_INTERVAL_MIN;
  const parsed = raw !== undefined ? Number.parseInt(raw, 10) : NaN;
  const minutes = Number.isFinite(parsed) && parsed >= 0 ? parsed : DEFAULT_INTERVAL_MIN;
  return minutes * 60_000;
}

export interface SleepWorkBlockOptions {
  /** Bypass the throttle window (used by agent_bootstrap). */
  force?: boolean;
}

/**
 * Human label for a work kind. Unknown kinds fall back to the raw key so a
 * Fase-2 kind added server-side still renders something sensible.
 */
function kindLabel(kind: string): string {
  switch (kind) {
    case "classification":
      return "classificação de memórias na fila";
    case "consolidation_summary":
      return "resumos de consolidação";
    case "conflict_resolution":
      return "resolução de conflitos";
    case "node_description":
      return "descrição de nós";
    case "structure_suggestion":
      return "sugestões de estrutura";
    default:
      return kind;
  }
}

/**
 * Poll pending delegated-sleep work and render a one-line nudge, or '' when
 * there is nothing to show (disabled, throttled, empty, or any failure).
 * Guaranteed not to throw.
 */
export async function fetchSleepWorkBlock(
  memoryClient: MemoryClientInterface,
  opts: SleepWorkBlockOptions = {},
): Promise<string> {
  if (isDisabled()) return "";

  const now = Date.now();
  if (!opts.force && now - lastCheckAt < throttleMs()) {
    return "";
  }
  lastCheckAt = now;

  let pending: SleepWorkPending | undefined;
  try {
    pending = await memoryClient.getSleepWorkPending();
  } catch (err: any) {
    // 404 (Memory Engine not on this version yet), timeout, DNS, refused —
    // all benign here. Swallow and keep working; log to stderr for operators.
    console.error(`[SleepWork] pending fetch failed: ${err?.message || err}`);
    return "";
  }

  return renderSleepWorkBlock(pending);
}

/**
 * Render the compact nudge from a pending payload, or '' when nothing is
 * available. Exported so bootstrap can insert it in the Boot Contract and tests
 * can exercise it without a client. Shape (contract v1):
 *   {"kinds": {"classification": {"available": n, "daily_remaining": m}}, "daily_limit": l}
 */
export function renderSleepWorkBlock(pending?: SleepWorkPending): string {
  const kinds = pending?.kinds || {};
  const entries = Object.entries(kinds).filter(
    ([, v]) => v && typeof v.available === "number" && v.available > 0,
  );
  if (entries.length === 0) return "";

  // Summaries per available kind, e.g. "42 em classificação de memórias na fila
  // (restam 500 hoje)".
  const parts = entries.map(([kind, v]) => {
    const remaining =
      typeof v.daily_remaining === "number" ? ` (restam ${v.daily_remaining} hoje)` : "";
    return `${v.available} em ${kindLabel(kind)}${remaining}`;
  });

  // Prefer the single canonical kind for the call example; fall back to the
  // first available kind so a Fase-2-only nudge still names a usable kind.
  const exampleKind = kinds.classification?.available
    ? "classification"
    : entries[0][0];

  return (
    `## 🧠 Sono delegado — trabalho pendente\n` +
    `Há memórias aguardando seu julgamento: ${parts.join("; ")}. ` +
    `Este é trabalho do ciclo de sono que o servidor delega ao seu LLM. ` +
    `Rode a skill \`classificar-fila\` — o laço é ` +
    `\`sleep_work_next(kind="${exampleKind}")\` → julgar cada item → ` +
    `\`sleep_work_submit(...)\`. É opcional e pode ser feito depois da tarefa atual.\n`
  );
}
