"use server";
// src/app/m/radio/_actions/codes.ts
//
// ⛔ DIE DIREKTIVE STEHT IN ZEILE 1, DER PFADKOMMENTAR DARUNTER — und das ist eine
// Auflage, kein Stil: `_actions/guards.test.ts` liest
// `readFileSync(...).trimStart().split("\n")[0]` und vergleicht gegen
// `/^["']use server["'];?$/`. Fuer TESTdateien lautet die Hausform genau umgekehrt
// (`src/app/m/radio/riegel.test.ts:1` ist ein Pfadkommentar) — daher die
// Verwechslungsgefahr. Gemessen am 2026-08-23: alle 18 Nicht-Test-Dateien unter
// `src/app/m/lagerbuch/_actions/` tragen `"use server";` in Zeile 1, ausnahmslos.
//
// DIE CODEVERWALTUNG (Spec 1 §3.2.3 Zeilen 2170-2191 und §3.2.4 Zeilen 2193-2227).
// Zwei Actions, beide nur fuer `radio`-Admins (gesetzte Entscheidung 7, Spec:2189-2190).
// Konsument ist `/admin/zugaenge` aus PLANTEIL 4 (Nahtstelle NS-A6) — in Planteil 3 ruft
// sie niemand. Der Guard-Scan bewacht sie trotzdem ab heute.
import { eq } from "drizzle-orm";
import { getDb } from "../_db/client";
import { zugangscodes } from "../_db/schema";
import { erzeugeCode } from "../_lib/code";
import { requireRadioAdmin } from "../_lib/zugang";

/**
 * ⛔ ES GIBT KEINE LOESCHFUNKTION — nicht in dieser Datei, nicht in der Oberflaeche, nicht
 * als „Aufraeumen" im Betrieb (Spec:2204-2221). Die drei Gruende stehen hier und nicht nur
 * im Plan, weil sie sonst beim ersten Aufraeum-Ticket verlorengehen:
 *
 *   1. Ein geloeschter Code GIBT SEINEN `code`-WERT FREI. Der `UNIQUE`-Index verhindert
 *      nur die GLEICHZEITIGE Doppelvergabe; danach kann derselbe Wert erneut gezogen oder
 *      bei einer Wiederherstellung von Hand erneut eingetragen werden (Spec:2209-2212).
 *   2. Der Code ist der ANZEIGESCHLUESSEL DER LEIHHISTORIE. Ueber `loans.zugangscode_id`
 *      loest die Anzeige `bezeichnung` auf; faellt die Zeile weg und kommt der Wert an
 *      einem spaeter ausgestellten Kaertchen zurueck, erscheinen HISTORISCHE Journalzeilen
 *      unter dem neuen Label — eine falsche Auskunft ueber einen abgeschlossenen Vorgang,
 *      keine Anzeige-Kosmetik (Spec:2213-2217).
 *   3. DIE ZWEI HAELFTEN TRAGEN NUR ZUSAMMEN. „Nie loeschen" ohne den Verweis in `loans`
 *      waere eine Regel ohne Schaden; der Verweis in `loans` ohne „nie loeschen" waere der
 *      Fremdschluessel aus Eintrag 3 in Kapitel 5 der Analyse. Beides oder nichts
 *      (Spec:2218-2221).
 *
 * ⚠️ `lagerbuch` IST HIER AUSDRUECKLICH KEINE PRAEZEDENZ, SONDERN DER GEGENFALL
 * (Spec:2222-2227): dort ist `lastUsedAt` nach Entscheidung 8-F ausdruecklich OHNE
 * Einfluss auf die Loeschbarkeit (`src/app/m/lagerbuch/_db/schema.ts:412-413`). Wer
 * `lagerbuch` als Beleg fuer „nicht loeschbar" zitiert, zitiert falsch.
 *
 * ⛔ DURCHGESETZT WIRD DAS ZWEITEILIG: durch die ABWESENHEIT jedes Loeschwegs und durch
 * den Quelltext-Scan in `src/app/m/radio/_db/append.test.ts` (§2.4), der ab heute auch
 * ueber diese Datei laeuft — sein Wurzelverzeichnis ist das ganze Modul
 * (`_db/append.test.ts:6`).
 *
 * ⚠️ WAS DIE SPERRE STATTDESSEN LEISTET: sie wirkt binnen des naechsten Aufrufs, lesend
 * wie schreibend, ueber den DB-Recheck aus §3.5.1 (Spec:2229-2232). Ein verlorener Code
 * kostet einen Klick und beruehrt keinen zweiten Aufsteller (Spec:2234-2238).
 */

/**
 * Ein neuer Zugangscode. Erste Anweisung: der werfende Admin-Riegel (Spec:2178).
 *
 * Der erzeugte Code wird EINMAL zurueckgegeben und danach in der Verwaltungsliste im
 * Klartext angezeigt und gedruckt — er ist kein Einmalgeheimnis, sondern ein Dauerausweis
 * (Spec:2180-2182).
 *
 * ⛔ DIE KOLLISIONSBEHANDLUNG IST AUSGESCHRIEBEN, WEIL SIE SONST ALS „KANN NICHT
 * PASSIEREN" WEGFAELLT (Spec:2183-2191): der `UNIQUE`-Index auf `code` ist der Riegel; bei
 * einem Konflikt wird EINMAL neu erzeugt und erneut eingefuegt, beim ZWEITEN Konflikt
 * bricht die Action mit einem benannten Fehler ab.
 *
 * ⚠️ BEI 140 BIT IST SCHON DER ERSTE KONFLIKT ASTRONOMISCH UNWAHRSCHEINLICH
 * (`_lib/code.ts:53` fuehrt das Alphabet, 28 Zeichen Crockford-Base32, Spec:2082-2087).
 * Die Behandlung existiert nicht fuer den Betriebsfall, sondern damit ein
 * PROGRAMMIERFEHLER in `erzeugeCode` — etwa ein fest verdrahteter Wert — LAUT wird statt
 * still. ⛔ Genau deshalb darf der zweite Konflikt nicht in einer Schleife verschwinden.
 *
 * DER KONFLIKT WIRD UEBER `onConflictDoNothing({ target: code })` GEMESSEN, NICHT UEBER
 * DIE FEHLERMELDUNG DES TREIBERS: `changes === 0` ist der Befund, und ein Konflikt auf dem
 * Primaerschluessel `id` bleibt damit ein eigener, lauter Fehler statt still verschluckt zu
 * werden.
 */
export async function erstelleCode(bezeichnung: string): Promise<{ code: string }> {
  const viewer = await requireRadioAdmin();
  const db = getDb();

  for (let versuch = 0; versuch < 2; versuch++) {
    const code = erzeugeCode();
    const ergebnis = db
      .insert(zugangscodes)
      .values({
        code,
        bezeichnung,
        aktiv: true,
        createdAt: new Date(),
        createdBy: viewer.sub,
      })
      .onConflictDoNothing({ target: zugangscodes.code })
      .run();
    if (ergebnis.changes > 0) return { code };
  }

  throw new Error(
    "[radio] Zugangscode konnte nicht ausgestellt werden: zwei UNIQUE-Konflikte auf " +
      "zugangscodes.code in Folge. Bei 140 bit ist das kein Betriebsfall, sondern ein " +
      "Hinweis darauf, dass erzeugeCode() nicht zufaellig ist (Spec:2183-2191).",
  );
}

/**
 * Sperren und Entsperren. Erste Anweisung: derselbe werfende Admin-Riegel (Spec:2200).
 *
 * ⛔ BEIM SPERREN WERDEN `gesperrt_am` UND `gesperrt_von` MITGESCHRIEBEN, BEIM ENTSPERREN
 * BEIDE AUF `NULL` ZURUECKGESETZT (Spec:2200-2204, nachgetragen ueber B6). Sie existieren,
 * WEIL die Zeile dauerhaft in der Liste steht und erklaeren muss, warum sie tot ist;
 * `aktiv = false` allein verlangte vom Betreiber, sich das zu merken
 * (`src/app/m/radio/_db/schema.ts:182-186`). Ein `UPDATE`, das nur `aktiv` setzt, liesse
 * Zusage 5 aus Kapitel 2 §2.11 ins Leere laufen — und der lokale Seed legt bereits eine
 * gesperrte Zeile MIT beiden Feldern an (`src/app/m/radio/_lib/seedLokal.ts:183-185`).
 *
 * ⛔ EINE VERWAISTE `codeId` IST HIER KEIN FEHLERFALL. Das `UPDATE` trifft dann null
 * Zeilen; ein Wurf machte aus einem veralteten Verwaltungs-Tab einen 500. Die Action ist
 * die Sperre, nicht die Bestandsauskunft — die Liste zeigt den Stand ohnehin beim
 * naechsten Laden.
 */
export async function setzeCodeAktiv(codeId: string, aktiv: boolean): Promise<void> {
  const viewer = await requireRadioAdmin();
  const db = getDb();

  db.update(zugangscodes)
    .set(
      aktiv
        ? { aktiv: true, gesperrtAm: null, gesperrtVon: null }
        : { aktiv: false, gesperrtAm: new Date(), gesperrtVon: viewer.sub },
    )
    .where(eq(zugangscodes.id, codeId))
    .run();
}
