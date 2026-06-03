#!/usr/bin/env bash
#
# pack-mcpb.sh — Build the one-click Claude Desktop extension (frinus.mcpb)
#
# Output: mcp/frinus.mcpb  — a self-contained bundle (compiled server + prod
# deps + manifest). Users install it by double-clicking; Claude Desktop ships
# its own Node runtime, so they need nothing installed.
#
# Usage:
#   ./scripts/pack-mcpb.sh
#
# Then publish (one-time per release):
#   gh release upload v3.1.0 frinus.mcpb --repo frinus-ai/frinus-mcp --clobber
# The frontend points at:
#   https://github.com/frinus-ai/frinus-mcp/releases/latest/download/frinus.mcpb
#
set -euo pipefail

MCP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BUILD_DIR="${MCP_DIR}/.mcpb-build"
OUT="${MCP_DIR}/frinus.mcpb"

cd "${MCP_DIR}"

echo "==> Compiling TypeScript (npm run build)"
npm run build

echo "==> Staging clean bundle in ${BUILD_DIR}"
rm -rf "${BUILD_DIR}"
mkdir -p "${BUILD_DIR}"
cp -r dist "${BUILD_DIR}/dist"
cp manifest.json package.json "${BUILD_DIR}/"
[ -f icon.png ] && cp icon.png "${BUILD_DIR}/" || echo "    (no icon.png — skipping, optional)"

echo "==> Installing production dependencies only"
( cd "${BUILD_DIR}" && npm install --omit=dev --no-audit --no-fund --silent )

echo "==> Packing -> ${OUT}"
rm -f "${OUT}"
if npx --yes @anthropic-ai/mcpb pack "${BUILD_DIR}" "${OUT}" 2>/dev/null; then
  echo "    packed with @anthropic-ai/mcpb (validated + signed manifest)"
else
  echo "    mcpb CLI unavailable — falling back to plain zip (still installable)"
  ( cd "${BUILD_DIR}" && zip -r -q "${OUT}" . )
fi

rm -rf "${BUILD_DIR}"
echo "==> Done: ${OUT}"
ls -lh "${OUT}"
