// src/app/m/radio/_db/client.ts
// KEIN "use client" (Falle 6): diese Datei wird ausschliesslich serverseitig gelesen.
//
// KEIN EIGENER OPENER, anders als src/app/m/lagerbuch/_db/client.ts:1-45. Jener braucht
// einen, weil er die SQLite-Funktion `lb_falte` registrieren muss — lagerbuch faltet die
// Suche in SQL. Die Suche des Kiosk faltet in JAVASCRIPT
// (radio-inventar/apps/frontend/src/lib/device-filter.ts:24-31: NFD + Diakritika-Entfernung
// + ss), und der Geraetebestand ist klein genug, dass sie das weiter tun kann.
//
// ⚠️ WIRD DIE SUCHE IN SQL GEZOGEN (LIKE gegen eine gefaltete Spalte oder gegen eine
// SQLite-Funktion), kippt diese Entscheidung und `radio` braucht einen eigenen Opener nach
// lagerbuch-Muster — dann faellt ausserdem der Ausschluss aus `seedAllModules()` (§2.9)
// mit einer ZWEITEN Begruendung zusammen: `getModuleDb` kennte die Funktion nicht.
//
// Die vier Pragmas (journal_mode = WAL, foreign_keys = ON, busy_timeout = 5000,
// synchronous = NORMAL) setzt `openModuleDatabase` (src/core/db/index.ts:12-22).
// `foreign_keys = ON` ist SCHARF — der eine FK auf eine ausmusterbare Tabelle
// (device_events.device_id) wird durchgesetzt.
import { getModuleDb } from "@/core/db";
import * as schema from "./schema";

export function getDb() {
  return getModuleDb("radio", schema);
}

export type DB = ReturnType<typeof getDb>;
