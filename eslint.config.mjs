import { defineConfig, globalIgnores } from "eslint/config";
import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

export default defineConfig([
  // Keep the starter on the flat config export that actually runs under the pinned ESLint/Next toolchain.
  ...nextCoreWebVitals,
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts"]),
  {
    // 既存 UI の mount 時外部状態同期（localStorage / query クリア時のサジェスト初期化）は
    // react-hooks/set-state-in-effect の推奨パターンから外れるが意図的なため除外する。
    // 詳細は AGENTS.md §6.4 と docs/arch/ui.md の「外部状態同期」節を参照。
    files: ["src/components/DisclaimerDialog.tsx", "src/components/GhostMapApp.tsx"],
    rules: {
      "react-hooks/set-state-in-effect": "off",
    },
  },
]);
