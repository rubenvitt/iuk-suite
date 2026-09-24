/// <reference types="node" />
import path from "node:path";

import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Port 1471 mit `strictPort`: `tauri dev` erwartet die Oberfläche genau dort
// (`src-tauri/tauri.conf.json`, `build.devUrl`). Ist der Port belegt, bricht Vite ab, statt
// still auf einen anderen auszuweichen, den die Hülle nicht kennt.
const WURZEL = path.resolve(__dirname, "../..");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@kern": path.join(WURZEL, "src/app/m/einsatzbuch/_lib/kern"),
      "@/core/theme/tokens": path.join(WURZEL, "src/core/theme/tokens.ts"),
    },
    // Die Kern-Dateien liegen unter `src/` der Suite, außerhalb dieses Workspace-Mitglieds —
    // React muss trotzdem EINE Instanz bleiben (sonst brechen Hooks mit „invalid hook call“).
    dedupe: ["react", "react-dom"],
  },
  server: { port: 1471, strictPort: true, fs: { allow: [WURZEL] } },
  clearScreen: false,
  envPrefix: ["VITE_", "TAURI_ENV_"],
  build: { target: "es2022", outDir: "dist", emptyOutDir: true },
});
