import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import tseslint from "typescript-eslint";

// Eigene Lint-Konfiguration der App: Die Root-`eslint.config.mjs` ignoriert `apps/**` (eigener
// Kommentar dort) — ihre Next.js-Regeln passen nicht auf eine Vite/Tauri-Oberfläche.
export default tseslint.config(js.configs.recommended, ...tseslint.configs.recommended, reactHooks.configs.flat.recommended, {
  ignores: ["dist", "src-tauri", "node_modules"],
});
