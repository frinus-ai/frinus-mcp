/**
 * Boot-contract state for the MCP process (one instance per stdio session).
 *
 * WHY THIS EXISTS
 * ---------------
 * The thin-client boot protocol used to depend entirely on the model
 * remembering to call `agent_reorient` "every N answers". Models forget. This
 * module makes the reorient cadence DETERMINISTIC and server-side (here, inside
 * the MCP process) instead of a hope:
 *
 *   - `agent_bootstrap` calls `markBooted()` with the agent's reorient config
 *     (read from the authoritative Control Plane row via the bootstrap payload).
 *   - Every subsequent tool call increments a counter (`noteToolCall`).
 *   - Once the counter reaches `reorientEveryN`, `reorientBanner()` returns a
 *     "REORIENT DUE" notice that `index.ts` appends to EVERY tool result until
 *     `agent_reorient` is actually called, which resets the counter.
 *
 * The context-percentage trigger (`reorientOnContextPct`) cannot be enforced
 * here — the MCP has no visibility into the model's token window — so it stays a
 * model-side heuristic documented in the Boot Contract and the server
 * `instructions`. The N-count is the half we CAN guarantee, and we guarantee it.
 *
 * State is per-process (= per session). Nothing here is persisted.
 */

/** Reorientation cadence knobs, mirrored from `org_agents` via the bootstrap. */
export interface ReorientConfig {
  reorientEveryN: number;
  reorientOnContextPct: number;
}

const DEFAULT_CONFIG: ReorientConfig = {
  reorientEveryN: 10,
  reorientOnContextPct: 70,
};

let config: ReorientConfig = { ...DEFAULT_CONFIG };
let booted = false;
let bootAgentId: string | null = null;
let sessionId: string | null = null;
let toolCallsSinceReorient = 0;

/**
 * Tools that must never count toward the cadence: `agent_bootstrap` seeds it and
 * `agent_reorient` IS the reorientation (and resets the counter).
 */
const EXEMPT_TOOLS = new Set(["agent_bootstrap", "agent_reorient"]);

/** Mark the process as booted and (re)seed the reorient cadence + session id. */
export function markBooted(opts: {
  agentId: string;
  sessionId?: string | null;
  config?: Partial<ReorientConfig>;
}): void {
  booted = true;
  bootAgentId = opts.agentId;
  if (opts.sessionId) sessionId = opts.sessionId;

  if (opts.config) {
    const n = opts.config.reorientEveryN;
    if (typeof n === "number" && Number.isFinite(n) && n >= 1) {
      config.reorientEveryN = Math.floor(n);
    }
    const pct = opts.config.reorientOnContextPct;
    if (typeof pct === "number" && Number.isFinite(pct) && pct >= 1 && pct <= 100) {
      config.reorientOnContextPct = Math.floor(pct);
    }
  }
  toolCallsSinceReorient = 0;
}

/** Reset the cadence counter (called when the agent actually reorients). */
export function resetReorientCounter(): void {
  toolCallsSinceReorient = 0;
}

/**
 * Record a tool call. Exempt tools do not increment; `agent_reorient` resets.
 * No-op until the process has booted, so pre-boot probing never arms the banner.
 */
export function noteToolCall(name: string): void {
  if (!booted) return;
  if (EXEMPT_TOOLS.has(name)) {
    if (name === "agent_reorient") resetReorientCounter();
    return;
  }
  toolCallsSinceReorient += 1;
}

/** True once at least `reorientEveryN` counted tool calls have elapsed. */
export function reorientDue(): boolean {
  return booted && toolCallsSinceReorient >= config.reorientEveryN;
}

/**
 * The "REORIENT DUE" banner, or null when not due. Deliberately imperative and
 * self-explaining so it survives even if the model ignored the Boot Contract.
 */
export function reorientBanner(): string | null {
  if (!reorientDue()) return null;
  const id = bootAgentId ?? "<agent_id>";
  return (
    `\n\n---\n` +
    `⚠️ REORIENT DEVIDO: ${toolCallsSinceReorient} tool calls desde o último ` +
    `boot/reorient (limite ${config.reorientEveryN}). Chame ` +
    `\`agent_reorient(agent_id="${id}")\` agora para se re-fundamentar antes de ` +
    `continuar. Este aviso repete a cada tool call até você reorientar.`
  );
}

export function getBootAgentId(): string | null {
  return bootAgentId;
}

export function getSessionId(): string | null {
  return sessionId;
}

export function setSessionId(id: string | null): void {
  sessionId = id;
}

export function isBooted(): boolean {
  return booted;
}

export function getReorientConfig(): ReorientConfig {
  return { ...config };
}

/** Test-only: reset all module state. Not part of the runtime surface. */
export function __resetBootState(): void {
  config = { ...DEFAULT_CONFIG };
  booted = false;
  bootAgentId = null;
  sessionId = null;
  toolCallsSinceReorient = 0;
}
