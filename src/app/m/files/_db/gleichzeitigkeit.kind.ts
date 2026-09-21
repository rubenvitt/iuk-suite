/*
 * Der Kindprozess zu `gleichzeitigkeit.test.ts` — dort steht, warum es ihn gibt.
 *
 * ⚠️ EINE ECHTE DATEI MIT STATISCHEN IMPORTEN, und das ist die Behebung (DRK-359).
 * Vorher lief das Kind als `node --import tsx -e "…"` (Modulmodus) und lud
 * seine Module per `await import(process.env.…)`. Unter Node 22.22.2 landen die
 * benannten Exporte einer `.ts`-Datei auf diesem Weg allein unter `.default` —
 * `openModuleDatabase is not a function`, im Kind geworfen. Ab 22.23 ist es weg,
 * und die CI (`node-version: 22`) zieht die neueste 22er; sie war also grün,
 * während jede Maschine mit älterem 22er-Patch rot sah. Gemessen: dasselbe
 * `await import()` aus einer echten Datei ist auch unter 22.22.2 korrekt — der
 * Auslöser ist der `-e`-Einstieg, nicht die dynamische Form. Also kein `-e`,
 * und kein `m.default ?? m` als Pflaster darauf.
 *
 * Die Parameter kommen über die UMGEBUNG (`KIND_*`), der Ablauf ist die Barriere
 * aus zwei Takten: `R` melden, sobald Verbindung UND Funktion stehen, dann auf
 * der Startdatei drehen. Kein Top-Level-`await` — tsx darf die Datei als CJS
 * übersetzen, und dort gibt es keins.
 */
import { existsSync } from "node:fs";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { openModuleDatabase } from "@/core/db";
import * as schema from "./schema";
import { verbucheAbgabe, zaehleDownload } from "./zaehler";

const env = (name: string): string => {
  const wert = process.env[name];
  if (wert === undefined) throw new Error(`${name} fehlt`);
  return wert;
};

const sqlite = openModuleDatabase(env("KIND_DB"));
const db = drizzle(sqlite, { schema });
const start = env("KIND_START");
const id = env("KIND_ID");
process.stdout.write("R");
while (!existsSync(start)) {}
const darf =
  env("KIND_ART") === "download"
    ? zaehleDownload(db, id)
    : verbucheAbgabe(db, id, Number(env("KIND_BYTES")));
sqlite.close();
process.stdout.write(darf ? "=1" : "=0");
