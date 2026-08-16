import type { AufgabeRow } from "../_db/schema";
import { FRIST_TEXT, istUeberfaellig } from "../_lib/anzeige";
import { fmtTagKurz, tageZwischen } from "../_lib/datum";
import { Ikone } from "./ikonen";
import s from "./aufgaben.module.css";

/*
 * DIE EINE DARSTELLUNG FUER DRINGLICHKEIT (Oberflaechen-Spec 2026-08-16 §6.2).
 *
 * DER BEFUND, GEGEN DEN DIESE DATEI GESCHRIEBEN IST: „ueberfaellig" hatte im Modul DREI
 * Darstellungsformen — ein nacktes `<span>` mit Warnzeichen in `AufgabenListe`/`FreigabeZone`, ein
 * kleingeschriebenes „ · überfällig" hinter dem Datum in `VerteilenTabelle`, eine farbige
 * KPI-Kachel im Koordinationseinstieg — und im WOCHENPLAN, dem Bildschirm fuer „was tue ich
 * heute", gar keine. Nicht die Bedingung war das Problem (`istUeberfaellig` ist seit jeher EINE
 * Funktion), sondern die Darstellung.
 *
 * SECHS AUFRUFSTELLEN, EINE AUSGABE (§6.2): `AufgabenListe`, `FreigabeZone`, `VerteilenTabelle`,
 * `Wochenplan` (die heutige Luecke), der Metablock von `a/[id]/page.tsx` — und, mit Schritt 4, die
 * Fuehrungskarte.
 *
 * KEIN "use client", GEBAUT WIE `Chip.tsx`: vier der sechs Aufrufer sind Server Components, zwei
 * sind Client-Inseln (`FreigabeZone`, `VerteilenTabelle`). Eine Server Component, die in eine
 * Client-Insel importiert wird, wird dort mitgebuendelt — das geht hier, weil diese Datei nichts
 * Serverseitiges beruehrt (`_lib/anzeige.ts` und `_lib/datum.ts` tragen kein `@/core/auth`).
 * Umgekehrt waere `"use client"` HIER ein Fehler mit Ansage: die vier Server-Aufrufer bekaemen eine
 * Client-Referenz statt der Komponente (Falle 6).
 *
 * ZEICHEN AUSSCHLIESSLICH AUS `./ikonen` (Falle 7) — `@ant-design/icons` ergibt in einer Server
 * Component HTTP 500 beim IMPORT, und `"use client"` behebt das nicht, es macht es still.
 *
 * VIER KANAELE, FARBE ZULETZT (§6.3):
 *
 *  1. WORT — „Überfällig seit N Tagen", ausgeschrieben, IMMER MIT DER ZAHL. Nie ein nacktes
 *     „Überfällig" (das sagt nicht, ob es gestern oder im Mai war), nie ein kleingeschriebenes
 *     Suffix, nie nur ein Datum. Die Zahl ist der einzige Kanal, der auch in einer
 *     Screenreader-Ausgabe die SCHWERE traegt. Der Satz selbst steht in `FRIST_TEXT`
 *     (`_lib/anzeige.ts`), damit der Quelltext-Scan unten genau zwei erlaubte Orte hat.
 *  2. FORM — die 3px-Startkante eines TEXTLAUFS, nie eine Pille und nie eine Flaeche: eine Pille
 *     waere formgleich mit dem Zustands-Chip, der in derselben Zeile steht.
 *  3. POSITION — Ueberfaelliges steht oben; das entscheidet die Rangleiter (`_lib/lage.ts`) und die
 *     Sortierung der Listen, nicht diese Datei. EINE AUSNAHME, benannt: in der Tagesspalte des
 *     Wochenplans ordnet `plan_rang`, also die Person selbst — die Zeile traegt trotzdem die Kante.
 *  4. FARBE — `--auf-achtung-text`, auf Kante und Wort, nie als Flaeche (s. `aufgaben.module.css`).
 *
 * DAS WARNZEICHEN IST DAS FUENFTE, NICHT ZAEHLENDE ELEMENT: `aria-hidden` (ueber `Ikone`), ohne
 * eigene Aussage — es macht die Zeile nur auffindbar.
 *
 * `/archiv` BENUTZT DIESELBE KOMPONENTE UND ZEIGT DORT NIE „ueberfaellig", weil `istUeberfaellig`
 * `abgeschlossen` ausschliesst. Dass derselbe Aufruf dort schweigt, ist der Beleg, dass die
 * Bedingung nur an einer Stelle steht.
 */
/**
 * DIE DREI AUSPRAEGUNGEN ALS REINE FUNKTION — die eine Verzweigung, an EINER Stelle.
 *
 * SIE IST EXPORTIERT, WEIL DIE FUEHRUNGSKARTE DEN WORTLAUT IN EINEM SATZ BRAUCHT, nicht als
 * Markup: die Zeile „ALS NÄCHSTES" lautet „Heute: <Titel> · <Dauer> · Frist heute" (§4.2, §5.1),
 * und ein zweiter, dort nachgebauter Dreizweig waere die vierte Fassung genau der Bedingung, gegen
 * die diese Datei geschrieben ist. Der Quelltext-Scan aus §6.6 faenge sie NICHT — er sucht das
 * WORT, und `FRIST_TEXT.heute` traegt es nicht.
 */
export function fristLage(
  aufgabe: AufgabeRow,
  heute: string,
): { text: string; klasse: string; warnung: boolean } {
  if (istUeberfaellig(aufgabe, heute)) {
    return {
      text: FRIST_TEXT.ueberfaellig(tageZwischen(aufgabe.faelligAm, heute)),
      klasse: s.fristUeberfaellig,
      warnung: true,
    };
  }

  // `status !== "abgeschlossen"` STEHT HIER UND NICHT IN `istUeberfaellig`: eine heute faellige,
  // bereits abgeschlossene Aufgabe hat keine offene Frist mehr — „Frist heute" waere ueber sie eine
  // Aufforderung. Sie faellt auf die neutrale Form, die das Datum nennt.
  if (aufgabe.faelligAm === heute && aufgabe.status !== "abgeschlossen") {
    return { text: FRIST_TEXT.heute, klasse: s.fristHeute, warnung: false };
  }

  return { text: FRIST_TEXT.frist(fmtTagKurz(aufgabe.faelligAm)), klasse: s.frist, warnung: false };
}

export function Frist({ aufgabe, heute }: { aufgabe: AufgabeRow; heute: string }) {
  const { text, klasse, warnung } = fristLage(aufgabe, heute);
  return (
    <span className={klasse}>
      {warnung ? (
        <>
          <Ikone name="warnung" />{" "}
        </>
      ) : null}
      {text}
    </span>
  );
}
