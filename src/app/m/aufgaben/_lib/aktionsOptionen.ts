import type { AufgabeRow, PersonRow } from "../_db/schema";
import { uebergang, type Aktion } from "./lebenszyklus";
import { darfNachweisHochladen } from "./zugang";

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
];

export function aktionsOptionen(a: AufgabeRow, p: PersonRow, heute: string): AktionsOptionen {
  const ergebnis = {} as AktionsOptionen;
  for (const aktion of GEPRUEFTE_AKTIONEN) {
    ergebnis[aktion] = uebergang(a, aktion as Aktion, p, heute).erlaubt;
  }
  // `a.status === "in_arbeit"` steht HIER und nicht in `darfNachweisHochladen` (`_lib/zugang.ts`) —
  // dieselbe Zustandsvoraussetzung wie die `in_arbeit`×`fertig`-Zeile in `_lib/lebenszyklus.ts`s
  // `TABELLE`, aber der Upload selbst ist kein Uebergang jener Tabelle und hat dort keine eigene
  // Zeile. `zugang.ts` bleibt damit bei reinen Personen-/Rollenfragen (Kopfkommentar dort).
  ergebnis.nachweisHochladen = a.status === "in_arbeit" && a.nachweisPflicht && darfNachweisHochladen(p, a, heute);
  return ergebnis;
}
