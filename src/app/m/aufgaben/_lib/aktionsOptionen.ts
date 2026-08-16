import type { AufgabeRow } from "../_db/schema";
import { uebergang, type Aktion } from "./lebenszyklus";
import { darfNachweisHochladen, type Akteur } from "./zugang";

/*
 * WELCHE AKTIONEN DIESE PERSON MIT DIESER AUFGABE JETZT AUSFUEHREN DARF (Aufgabe 16, Brief) — fuer
 * die Aktionszone von `/a/<id>` (`_ui/AktionsZone.tsx`). Das entscheidet AUSSCHLIESSLICH
 * `uebergang()` JE AKTION (`_lib/lebenszyklus.ts`), NICHT eine nachgebaute Fassung der
 * Uebergangstabelle: diese Datei ruft `uebergang()` einmal pro Aktion und liest nur das
 * `erlaubt`-Feld — die Tabelle selbst steht an genau einer Stelle (Spec §5.2, Aufgabe 8).
 *
 * `zurueckziehen` STEHT MIT IN DER LISTE, OBWOHL ES KEINEN ZIELZUSTAND HAT (`wirkung: "loeschen"`,
 * `_lib/lebenszyklus.ts`) — `uebergang()` beantwortet `erlaubt` fuer JEDE `Aktion` einheitlich,
 * unabhaengig von der Form des Erfolgsfalls; diese Datei braucht nur das Boolesche Ergebnis, nicht
 * `nach`/`wirkung`.
 *
 * KEIN "use client" NOETIG, ABER AUCH KEIN IMPORT IN EINE CLIENT-INSEL: `_lib/lebenszyklus.ts`
 * importiert `_lib/zugang.ts`, und die importiert `@/core/auth` (next-auth) — ein Import DIESER
 * Datei in `_ui/AktionsZone.tsx` ("use client") zoege denselben serverseitigen Code ins
 * Client-Bundle wie ein direkter `zugang.ts`-Import (`_ui/PersonenTabelle.tsx`s Kopfkommentar
 * nennt das Muster zuerst). `aktionsOptionen()` laeuft deshalb IN `a/[id]/page.tsx` (Server
 * Component), das Ergebnis kommt als reines, serialisierbares Objekt zu `AktionsZone`.
 */

export interface AktionsOptionen {
  starten: boolean;
  zuruecksetzen: boolean;
  fertig: boolean;
  freigeben: boolean;
  zurueckweisen: boolean;
  wiederaufnehmen: boolean;
  zurueckziehen: boolean;
  /**
   * ANDERS ZUWEISEN (Oberflaechen-Spec 2026-08-16 §7 Nr. 3, Schritt 6) — der bis dahin fehlende
   * Aufrufer von `umverteilenAction`. Ueber DIESELBE `uebergang()`-Schleife wie die sieben Felder
   * darueber, also ohne eine einzige nachgebaute Bedingung: `_lib/lebenszyklus.ts` fuehrt
   * `{ von: "verteilt", aktion: "umverteilen", nach: "verteilt", wer: darfVerteilen,
   * planLoeschen: true }` — erlaubt damit GENAU aus `verteilt` und GENAU fuer `darfVerteilen`.
   *
   * WARUM DAS FELD UND NICHT EIN HANDGESCHRIEBENES `status === "verteilt" && istKoordination` AN
   * DEN DREI ANZEIGESTELLEN (Fuehrungskarte Rang 1 und 5a, Zone „Überfällig", `AktionsZone`):
   * §11.3 sagt zu, dass kein Zugriffspraedikat einen zweiten Aufrufer mit ANDERER Quelle bekommt.
   * Drei Nachbauten waeren drei Orte, an denen die Bedingung von der Tabelle wegdriften kann — und
   * die Drift waere nicht sichtbar kaputt, sondern nur falsch: ein Knopf, den der Server danach
   * ablehnt (§10 Prueffrage 2: „ein Knopf, den die Action ablehnen wuerde, kann gar nicht
   * entstehen").
   */
  umverteilen: boolean;
  /**
   * NACHWEIS HOCHLADEN (Aufgabe 19) — KEIN Uebergang der Tabelle, deshalb NICHT ueber `uebergang()`
   * ermittelt wie die sieben Felder oben, sondern direkt unten. Erlaubt bei genau der Bedingung, die
   * `_lib/lebenszyklus.ts`s `in_arbeit`×`fertig`-Zeile fuer "wer" traegt (`darfNachweisHochladen`,
   * dieselbe Formel wie das dortige private `istZugewiesenerBuFDi`), PLUS `nachweisPflicht` — ohne
   * Pflicht gibt es nichts, das ein Nachweis erfuellen muesste.
   */
  nachweisHochladen: boolean;
}

const GEPRUEFTE_AKTIONEN: readonly (keyof AktionsOptionen)[] = [
  "starten",
  "zuruecksetzen",
  "fertig",
  "freigeben",
  "zurueckweisen",
  "wiederaufnehmen",
  "zurueckziehen",
  "umverteilen",
];

export function aktionsOptionen(a: AufgabeRow, akteur: Akteur, heute: string): AktionsOptionen {
  const ergebnis = {} as AktionsOptionen;
  for (const aktion of GEPRUEFTE_AKTIONEN) {
    ergebnis[aktion] = uebergang(a, aktion as Aktion, akteur, heute).erlaubt;
  }
  // `a.status === "in_arbeit"` steht HIER und nicht in `darfNachweisHochladen` (`_lib/zugang.ts`) —
  // dieselbe Zustandsvoraussetzung wie die `in_arbeit`×`fertig`-Zeile in `_lib/lebenszyklus.ts`s
  // `TABELLE`, aber der Upload selbst ist kein Uebergang jener Tabelle und hat dort keine eigene
  // Zeile. `zugang.ts` bleibt damit bei reinen Personen-/Rollenfragen (Kopfkommentar dort).
  ergebnis.nachweisHochladen =
    a.status === "in_arbeit" && a.nachweisPflicht && darfNachweisHochladen(akteur, a, heute);
  return ergebnis;
}
