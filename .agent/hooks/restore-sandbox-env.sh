#!/usr/bin/env bash
# restore-sandbox-env.sh
# Sandbox 再構築後の環境復旧（AGENTS.md §4.1.1）。sandbox-rebuild-recovery.md から呼出。
#
# やること:
#   1. Node.js バージョンの確認（.nvmrc があれば警告）
#   2. npm で依存を再構築（.nvmrc や package-lock を優先）
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

echo "[restore-sandbox-env] npm: $(npm --version)"
echo "[restore-sandbox-env] node: $(node --version)"

# ============================================================================
# 2. 依存インストール
# ============================================================================
if [ -f package.json ]; then
  if [ -f package-lock.json ]; then
    echo "[restore-sandbox-env] installing dependencies (npm ci) ..."
    npm ci
  elif [ -f bun.lockb ] || [ -f bun.lock ]; then
    # 旧 cod-web 由来の bun.lock が残っていた場合の互換。
    # 本プロジェクトは npm なので警告して npm install にフォールバックする。
    echo "[restore-sandbox-env] WARN: bun lock file found but this project uses npm. Falling back to npm install."
    npm install
  else
    echo "[restore-sandbox-env] installing dependencies (npm install) ..."
    npm install
  fi
  echo "[restore-sandbox-env] done. verify with: npm run typecheck && npm run build"
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
