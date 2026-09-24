// Platzhalter, bis die Oberfläche steht: Er reicht, damit `vite build` ein `dist/` erzeugt
// und `tauri::generate_context!` in der Hülle kompiliert.
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

const wurzel = document.getElementById("wurzel");
if (!wurzel) throw new Error("Element #wurzel fehlt in index.html");

createRoot(wurzel).render(
  <StrictMode>
    <main>Einsatzbuch</main>
  </StrictMode>,
);
