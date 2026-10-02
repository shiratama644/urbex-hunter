#!/usr/bin/env bash
# restore-sandbox-env.sh
# Sandbox 再構築後の環境復旧（AGENTS.md §4.1.1）。sandbox-rebuild-recovery.md から呼出。
#
# やること:
#   1. Node.js バージョンの確認（.nvmrc があれば警告）
#   2. pnpm で依存を再構築（pnpm-lock.yaml を優先）
#   3. 任意: Prisma/Drizzle の生成があれば実行（本プロジェクトでは不要だが将来の拡張に備えフックだけ残す）
set -euo pipefail

# ============================================================================
# 1. Node.js バージョン確認
# ============================================================================
if [ -f .nvmrc ]; then
  NVMRC="$(tr -d '[:space:]' < .nvmrc)"
  echo "[restore-sandbox-env] .nvmrc: ${NVMRC}"
  CURRENT_MAJOR="$(node --version | sed 's/^v//' | cut -d. -f1)"
  REQUIRED_MAJOR="$(echo "${NVMRC}" | grep -oE '^[0-9]+' || echo '')"
  if [ -n "${REQUIRED_MAJOR}" ] && [ "${CURRENT_MAJOR}" != "${REQUIRED_MAJOR}" ]; then
    echo "[restore-sandbox-env] WARN: node is v${CURRENT_MAJOR} but .nvmrc wants v${REQUIRED_MAJOR}.x"
    echo "[restore-sandbox-env]       Sandbox の node は置換不可のため、このまま続行します。差異が問題になる場合は .nvmrc を更新してください。"
  else
    echo "[restore-sandbox-env] node: $(node --version) matches .nvmrc major ${REQUIRED_MAJOR:-unknown}"
  fi
else
  echo "[restore-sandbox-env] no .nvmrc; using current node: $(node --version)"
fi

echo "[restore-sandbox-env] pnpm: $(pnpm --version 2>/dev/null || echo "not found (will try corepack)")"
echo "[restore-sandbox-env] node: $(node --version)"
if ! command -v pnpm >/dev/null 2>&1; then
  echo "[restore-sandbox-env] enabling corepack for pnpm..."
  corepack enable || true
  corepack prepare pnpm@12.5.1 --activate || true
fi

# ============================================================================
# 2. 依存インストール
# ============================================================================
if [ -f package.json ]; then
  if [ -f pnpm-lock.yaml ]; then
    echo "[restore-sandbox-env] installing dependencies (pnpm install --frozen-lockfile) ..."
    pnpm install --frozen-lockfile
  elif [ -f package-lock.json ]; then
    echo "[restore-sandbox-env] WARN: package-lock.json found but this project uses pnpm. Migrating..."
    pnpm import || pnpm install
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then
    echo "[restore-sandbox-env] WARN: bun lock file found but this project uses pnpm. Falling back to pnpm install."
    pnpm install
  else
    echo "[restore-sandbox-env] installing dependencies (pnpm install) ..."
    pnpm install
  fi
  echo "[restore-sandbox-env] done. verify with: pnpm run typecheck && pnpm run build"
else
  echo "[restore-sandbox-env] no package.json yet. skipping dependency install."
fi

# ============================================================================
# 3. 任意のコード生成（Drizzle / Prisma 等）
# ============================================================================
# 本プロジェクトは Drizzle だが生成ステップは不要（drizzle-kit push で DB 反映）。
# 将来 `drizzle-kit generate` や `prisma generate` が必要になったらここで実行する。
if grep -q '"drizzle-kit"' package.json 2>/dev/null; then
  echo "[restore-sandbox-env] drizzle-kit detected: no generate step required (schema is TS source)."
fi

echo "[restore-sandbox-env] restore complete."
