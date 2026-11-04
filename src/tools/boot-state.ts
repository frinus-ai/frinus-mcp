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
 * One MCP process is shared by the main session and all its subagents, so the
 * cadence is tracked PER AGENT (keyed by the agent_id each one bootstrapped
 * with); the formal session belongs to the first boot. Nothing is persisted.
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

/**
 * Per-agent cadence state. ONE MCP process is shared by the main Claude Code
 * session AND every subagent it spawns (e.g. `frinus-specialist`), so each one
 * that calls `agent_bootstrap` gets its own entry. A single process-wide
 * agent id/counter made the last specialist to boot "own" the banner, telling
 * the main session (and the other specialists) to reorient with the wrong id.
 */
interface AgentState {
  config: ReorientConfig;
  toolCallsSinceReorient: number;
}

let booted = false;
/** First agent to boot in this process = the main session. Never overwritten. */
let primaryAgentId: string | null = null;
const agents = new Map<string, AgentState>();
/** Formal session of the process (first bootstrap wins; closed on exit). */
let sessionId: string | null = null;

/**
 * Tools that must never count toward the cadence: `agent_bootstrap` seeds it and
 * `agent_reorient` IS the reorientation (and resets the counter).
 */
const EXEMPT_TOOLS = new Set(["agent_bootstrap", "agent_reorient"]);

function explicitAgentId(args?: Record<string, unknown>): string | null {
  const id = args?.agent_id;
  return typeof id === "string" && agents.has(id) ? id : null;
}

/**
 * Which booted agent a tool call belongs to: the `agent_id` the call itself
 * carries (when it is a booted agent), else the primary agent. Most tools carry
 * no agent_id, so unattributed calls count toward the main session — the one
 * that cannot be told apart from the rest, and the one that lives longest.
 */
function resolveCaller(args?: Record<string, unknown>): string | null {
  return explicitAgentId(args) ?? primaryAgentId;
}

/** Mark the process as booted and (re)seed this agent's reorient cadence. */
export function markBooted(opts: {
  agentId: string;
  sessionId?: string | null;
  config?: Partial<ReorientConfig>;
}): void {
  booted = true;
  if (!primaryAgentId) primaryAgentId = opts.agentId;
  // The process session belongs to the first boot; a specialist booting later
  // must not hijack it.
  if (opts.sessionId && !sessionId) sessionId = opts.sessionId;

  const config: ReorientConfig = { ...(agents.get(opts.agentId)?.config ?? DEFAULT_CONFIG) };
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
  agents.set(opts.agentId, { config, toolCallsSinceReorient: 0 });
}

/** Reset an agent's cadence counter (default: the primary agent). */
export function resetReorientCounter(agentId?: string | null): void {
  const id = agentId && agents.has(agentId) ? agentId : primaryAgentId;
  const st = id ? agents.get(id) : undefined;
  if (st) st.toolCallsSinceReorient = 0;
}

/**
 * Record a tool call for the agent it belongs to (see `resolveCaller`).
 * Exempt tools do not increment; `agent_reorient` resets the caller's counter.
 * No-op until the process has booted, so pre-boot probing never arms the banner.
 */
export function noteToolCall(name: string, args?: Record<string, unknown>): void {
  if (!booted) return;
  if (EXEMPT_TOOLS.has(name)) {
    if (name === "agent_reorient") resetReorientCounter(explicitAgentId(args));
    return;
  }
  const id = resolveCaller(args);
  const st = id ? agents.get(id) : undefined;
  if (st) st.toolCallsSinceReorient += 1;
}

/** True once the caller's counter reached its `reorientEveryN`. */
export function reorientDue(args?: Record<string, unknown>): boolean {
  if (!booted) return false;
  const id = resolveCaller(args);
  const st = id ? agents.get(id) : undefined;
  return !!st && st.toolCallsSinceReorient >= st.config.reorientEveryN;
}

/**
 * The "REORIENT DUE" banner, or null when not due. Deliberately imperative and
 * self-explaining so it survives even if the model ignored the Boot Contract.
 *
 * It only names a concrete agent_id when it is certain whose call this is: the
 * call carried a booted agent_id, or a single agent booted in this process.
 * With several agents sharing the process and no agent_id on the call, the
 * banner asks for "your own agent_id" instead of guessing someone else's.
 */
export function reorientBanner(args?: Record<string, unknown>): string | null {
  if (!reorientDue(args)) return null;
  const id = resolveCaller(args)!;
  const st = agents.get(id)!;
  const certain = explicitAgentId(args) !== null || agents.size === 1;
  const call = certain
    ? `\`agent_reorient(agent_id="${id}")\``
    : `\`agent_reorient\` com o SEU agent_id (o mesmo do seu \`agent_bootstrap\`)`;
  return (
    `\n\n---\n` +
    `⚠️ REORIENT DEVIDO: ${st.toolCallsSinceReorient} tool calls desde o último ` +
    `boot/reorient (limite ${st.config.reorientEveryN}). Chame ` +
    `${call} agora para se re-fundamentar antes de ` +
    `continuar. Este aviso repete a cada tool call até você reorientar.`
  );
}

/** The primary (first-booted) agent of this process. */
export function getBootAgentId(): string | null {
  return primaryAgentId;
}

/** All agents that booted in this process (primary first). */
export function getBootedAgentIds(): string[] {
  return [...agents.keys()];
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

/** Cadence config of an agent (default: the primary agent). */
export function getReorientConfig(agentId?: string | null): ReorientConfig {
  const id = agentId && agents.has(agentId) ? agentId : primaryAgentId;
  const st = id ? agents.get(id) : undefined;
  return { ...(st?.config ?? DEFAULT_CONFIG) };
}

/** Test-only: reset all module state. Not part of the runtime surface. */
export function __resetBootState(): void {
  booted = false;
  primaryAgentId = null;
  agents.clear();
  sessionId = null;
}
