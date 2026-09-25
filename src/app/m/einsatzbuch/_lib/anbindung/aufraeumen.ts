/**
 * Räumt abgelaufene Anmeldereste der Anbindung auf (Plan Stufe 6, Task 7, Entscheidung 10):
 * Einmalcodes mit `ablauf < jetzt` (eingelöst oder nicht) und Sitzungen mit `ablauf < jetzt`.
 * Beide Tabellen sind laut `core/audit/catalog.ts` `excluded` — das Löschen erzeugt keine
 * Audit-Zeile.
 *
 * Aufgerufen beim Zugriff (`erzeugeCode` in `./einmalcode.ts`, `api/anmelden/tausch/route.ts`)
 * und periodisch alle zehn Minuten über `startBackgroundWork` (`core/bootstrap.ts`) — Vorbild
 * `starteRadioHintergrund` (`app/m/radio/_lib/boot.ts`): ein Modul-Timer mit Wache und `unref`,
 * damit ein Skript, das die Suite nur lädt, nicht am Timer hängt.
 *
 * `starteEinsatzbuchHintergrund` liegt bewusst NICHT in einer `_lib/boot.ts` — dieses Modul
 * hat noch keine, und der Timer ist die einzige Hintergrundarbeit von `einsatzbuch`. Dasselbe
 * Muster wie `starteAufgabenScanArbeiter` (`app/m/aufgaben/_lib/scan.ts`), das `bootstrap.test.ts`
 * ausdrücklich als benannte Ausnahme von seiner `_lib/boot.ts`-Ableitung führt.
 */
import { lt } from "drizzle-orm";
import { getDb } from "../../_db/client";
import { einmalcode, sitzung } from "../../_db/schema";
import type { Db } from "../stammdaten/daten";

export interface Aufraeumzahlen {
  einmalcodes: number;
  sitzungen: number;
}

/**
 * Reine Löschfunktion, ohne eigene Transaktion: beide Löschungen sind unabhängig voneinander —
 * scheitert die eine, soll die andere trotzdem greifen.
 */
export function raeumeAnbindungAuf(db: Db, jetzt: Date): Aufraeumzahlen {
  const einmalcodes = db.delete(einmalcode).where(lt(einmalcode.ablauf, jetzt)).run().changes;
  const sitzungen = db.delete(sitzung).where(lt(sitzung.ablauf, jetzt)).run().changes;
  return { einmalcodes, sitzungen };
}

const TAKT_MS = 10 * 60_000;

let taktUhr: ReturnType<typeof setInterval> | undefined;

function lauf(): void {
  try {
    raeumeAnbindungAuf(getDb(), new Date());
  } catch (fehler) {
    console.error("[einsatzbuch][aufraeumen] Durchlauf gescheitert:", fehler);
  }
}

/**
 * Startet den Aufräum-Takt (alle zehn Minuten). Idempotent, weil `register()` unter HMR mehr
 * als einmal läuft: zwei Timer wären zwei Läufe je Takt. `unref`, damit ein Skript, das die
 * Suite nur lädt (`scripts/import/*.ts`), nicht am Timer hängt.
 */
export function starteEinsatzbuchHintergrund(): void {
  if (taktUhr !== undefined) return;
  taktUhr = setInterval(lauf, TAKT_MS);
  taktUhr.unref?.();
}

/** Hält den Takt an. Exportiert, weil ein Modulzustand sonst den Test überlebt. */
export function stoppeEinsatzbuchHintergrund(): void {
  if (taktUhr !== undefined) clearInterval(taktUhr);
  taktUhr = undefined;
}
