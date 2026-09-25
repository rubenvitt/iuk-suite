/**
 * Migriert `einsatzbuch.db` und stellt das ECHTE Schlüsselpaar der Suite wieder her — gerufen
 * EINMAL aus `webServer.command` in `playwright.config.ts`, VOR `next dev` (dieselbe Bauform wie
 * `e2e/seed-lagerbuch.ts`, Kopfkommentar dort: `next dev` wertet den Modul-Singleton in
 * `_db/client.ts` mehrfach aus, und spätere Verbindungen sähen ein Schema nicht, das erst eine
 * INSTRUMENTATION-Verbindung migriert hätte).
 *
 * `e2e/einsatzbuch-anbindung.spec.ts` (Task 4, Fall „echt bei vorhandenem echtem Rechner") und
 * Task 5 richten über die API einen echten Rechner ein — `POST /api/einrichten` mit `art: "echt"`
 * antwortet ohne ein vorhandenes echtes Paar mit `503 kein_echtes_paar`. Der KEK dafür ist der
 * Entwicklungs-KEK aus `_lib/schluessel/kek.ts` (`ENTWICKLUNGS_KEK`), den `playwright.config.ts`
 * additiv als `EINSATZBUCH_SCHLUESSEL_KEK` an den Next-Server reicht — als Literal dort, mit
 * Kommentaranker hierher, nicht als Import (die Konfiguration soll nicht von
 * App-Interna abhängen).
 */
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { openModuleDatabase, moduleDbPath } from "@/core/db";
import { getDb } from "@/app/m/einsatzbuch/_db/client";
import { ausBase64 } from "@/app/m/einsatzbuch/_lib/kern/bytes";
import { ENTWICKLUNGS_KEK } from "@/app/m/einsatzbuch/_lib/schluessel/kek";
import { echtesPaar, legePaarAn } from "@/app/m/einsatzbuch/_lib/schluessel/paar";

function migriere(): void {
  const sqlite = openModuleDatabase(moduleDbPath("einsatzbuch"));
  migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/einsatzbuch/_db/migrations" });
  sqlite.close();
}

/**
 * Idempotent: ein vorhandenes echtes Paar bleibt unangetastet (Entscheidung 12 — der Schlüssel
 * ist gepinnt, eine zweite `schluesselId` wäre ein anderer Fall). Nur bei einem `rm -rf
 * ./.data/e2e` (Vorgabe von `playwright.config.ts`) entsteht überhaupt ein neues.
 */
async function stelleEchtesPaarWiederHer(): Promise<void> {
  const db = getDb();
  if (echtesPaar(db)) return;
  await legePaarAn(db, { art: "echt", rechnerId: null, kek: ausBase64(ENTWICKLUNGS_KEK), jetzt: new Date() });
}

// Kein Top-Level-`await`: `tsx` übersetzt dieses Skript nach CJS, das kennt es nicht.
migriere();
stelleEchtesPaarWiederHer()
  .then(() => console.log(`[e2e] einsatzbuch migriert + echtes Paar sichergestellt: ${moduleDbPath("einsatzbuch")}`))
  .catch((e) => { console.error(e); process.exit(1); });
