import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

// Port 1471 mit `strictPort`: `tauri dev` erwartet die Oberfläche genau dort
// (`src-tauri/tauri.conf.json`, `build.devUrl`). Ist der Port belegt, bricht Vite ab, statt
// still auf einen anderen auszuweichen, den die Hülle nicht kennt.
export default defineConfig({
  plugins: [react()],
  clearScreen: false,
  server: { port: 1471, strictPort: true },
});
