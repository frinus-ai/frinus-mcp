/**
 * Single source of truth for the MCP server version.
 *
 * Imported by `index.ts` (server `name`/`version` handshake) and by the
 * `agent_bootstrap` Boot Contract block so the version the user sees always
 * matches the running build. Keep in sync with `package.json` and
 * `manifest.json` at release time.
 */
export const MCP_VERSION = "3.9.2";
