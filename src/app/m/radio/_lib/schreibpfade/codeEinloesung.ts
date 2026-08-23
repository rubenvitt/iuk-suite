// src/app/m/radio/_lib/schreibpfade/codeEinloesung.ts
import { eq } from "drizzle-orm";
import type { DB } from "../../_db/client";
import { zugangscodes } from "../../_db/schema";
import { createAusleihSitzung } from "../ausleihSitzung";

/**
 * DER SCHREIBPFAD DER EINLOESUNG (Spec 1 §3.3.2, Zeilen 2309-2336). Sie ist in A9
 * (`_actions/gate.ts`) und in A10 (`t/[code]/route.ts`) jeweils SCHRITT 4 der Reihenfolge
 * aus §3.3.1. Vorbild: `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts:65`.
 *
 * SIE LIEGT UNTER `_lib/schreibpfade/`, WEIL SIE SCHREIBT: `zugangscodes.lastUsedAt`
 * (`src/app/m/radio/_db/schema.ts:192`), und NUR beim Treffer (Spec:2322-2324).
 *
 * ⛔ KEIN "use client" in dieser Datei. Ihre Aufrufer sind eine Server Action (A9) und ein
 * Route Handler (A10); ein WERT aus einem Client-Modul kaeme in einer Server Component
 * nicht an, sondern als Client-Referenz — HTTP 500, fuer `pnpm build` unsichtbar und fuer
 * Vitest strukturell unsichtbar (Falle 6). Durchgesetzt von
 * `src/app/m/radio/riegel.test.ts:786-805`.
 *
 * ⛔ DER CODE BLEIBT NACH DER EINLOESUNG EINLOESBAR (Spec:2328-2330). Es gibt kein
 * `eingeloestAm` und kein Verbrennen — der Grund ist physisch: der Code steht auf einem
 * GEDRUCKTEN AUFSTELLER im Funkraum, den nacheinander viele Menschen scannen. Eine
 * Fassung, die den Code bei der Einloesung entwertete, saehe wie eine Haertung aus („ein
 * Code wird nur einmal benutzt") und machte jeden Aufsteller nach dem ersten Scan
 * wertlos. Der einzige Widerruf, den es gibt, ist `aktiv = false`
 * (`src/app/m/radio/_db/schema.ts:181`); `lastUsedAt` ist reines Anzeigefeld ohne Einfluss
 * auf die Gueltigkeit (`src/app/m/radio/_db/schema.ts:190-192`).
 */

/**
 * ⛔ DER NICHT-TREFFER IST EINE EINZIGE FORM (Spec:2334-2336). „unbekannt" und „gesperrt"
 * sind von aussen NICHT unterscheidbar. Ein Rueckgabewert, der sie traennte — etwa um ein
 * `grund`-Feld erweitert —, waere ein ORAKEL darueber, welche Codes je vergeben waren:
 * jemand mit einer Kandidatenliste erfuehre das, ohne einen gueltigen Code zu besitzen.
 * Das Gate zeigt fuer beide denselben Satz.
 */
export type Einloesung = { ok: true; cookieValue: string; codeId: string } | { ok: false };

/**
 * @param code Der BEREITS NORMALISIERTE Code. Diese Funktion normalisiert NICHT — das tut
 *             `_lib/code.ts#normalisiereCode` (`src/app/m/radio/_lib/code.ts:140-148`)
 *             beim Aufrufer, und dort als EIGENE Anweisung. Ein
 *             `loeseCodeEin(normalisiereCode(x), db)` erschiene dem Reihenfolge-Scan aus
 *             A9 TEXTLICH als „Einloesung vor Normalisieren" (Spec:2264-2268; dieselbe
 *             Arbeitsteilung im Bestand,
 *             `src/app/m/lagerbuch/_lib/schreibpfade/tokenEinloesung.ts:50-55`).
 *             Zwei Normalisierungen an zwei Orten sind ausserdem der Ort, an dem sie
 *             auseinanderlaufen.
 * @param db   PFLICHT, kein Vorgabewert. `_db/client.ts#getDb()` ist der einzige Opener
 *             des Moduls; ein Vorgabewert `db = getDb()` machte diese Funktion im Test
 *             nicht gegen eine eigene Datei haengbar, und `getModuleDb()` wird in Tests
 *             NICHT benutzt — sein Cache ist per MODULSCHLUESSEL gekeyt, nicht per
 *             `DATA_DIR` (`src/core/db/index.ts:31-35`).
 *
 * ⛔ SIE WIRFT NICHT bei Muell. Der Wert kommt aus einer URL (`/t/<code>`) oder aus einem
 * Formularfeld; ein Wurf waere HTTP 500 im Route Handler statt der Gate-Meldung.
 */
export async function loeseCodeEin(code: string, db: DB): Promise<Einloesung> {
  const zeile = db.select().from(zugangscodes).where(eq(zugangscodes.code, code)).get();

  // ⛔ EIN EINZIGER AUSDRUCK, nicht zwei Zweige mit zwei Rueckgaben: zwei Zweige liefen
  // irgendwann auseinander, und genau dann entstuende das Orakel oben.
  if (!zeile || !zeile.aktiv) return { ok: false };

  // NACH dem Doppeltest, also NUR beim Treffer (Spec:2322-2324). Ein gesperrter Code
  // trueg sonst nach jedem Scanversuch eine frische Spur, und die Verwaltungsliste zeigte
  // Aktivitaet, die es nicht gibt — ausgerechnet an der einen Information, an der die
  // Leitung erkennt, ob ein verschwundenes Kaertchen noch im Umlauf ist.
  db.update(zugangscodes).set({ lastUsedAt: new Date() }).where(eq(zugangscodes.id, zeile.id)).run();

  // ⛔ DIE NUTZLAST TRAEGT NUR DIE `codeId`, nie den Klartext-Code und nie die Bezeichnung
  // (`src/app/m/radio/_lib/ausleihSitzung.ts:47`, Spec:2503-2506): beide kommen bei jedem
  // Aufruf frisch aus dieser Zeile, sonst waeren Umbenennung und Sperre auf der Flaeche
  // unsichtbar, bis das Cookie ablaeuft.
  return { ok: true, cookieValue: await createAusleihSitzung({ codeId: zeile.id }), codeId: zeile.id };
}
