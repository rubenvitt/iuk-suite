/**
 * Einstieg der Oberfläche. Farbvariablen und Hell/Dunkel werden vor dem ersten Rendern gesetzt,
 * damit nichts in den falschen Farben aufblitzt. Ein Inline-Skript in `index.html` ginge dafür
 * nicht: Die CSP erlaubt nur Skripte aus der App selbst (`src-tauri/tauri.conf.json`, `csp`).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import { App } from "./App";
import "./stil/app.css";
import { wendeGespeichertesThemaAn } from "./stil/thema";
import { schreibeFarbVariablen } from "./stil/variablen";

schreibeFarbVariablen(document.documentElement);
wendeGespeichertesThemaAn();

const wurzel = document.getElementById("wurzel");
if (!wurzel) throw new Error("Element #wurzel fehlt in index.html");

createRoot(wurzel).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
