"use client";

import { useEffect, useRef, useState } from "react";
import { AutoComplete } from "antd";
import { entleiherVorschlaege } from "../_actions/ausleihe";
import s from "./ausleihe.module.css";

/**
 * DAS NAMENSFELD MIT VORSCHLAEGEN (§4.3.4, Spec:3490-3516).
 *
 * ⛔ ANTD `AutoComplete` STATT DER 312 ZEILEN DES BESTANDS
 * (`radio-inventar/apps/frontend/src/components/features/BorrowerInput.tsx`): dort steht
 * ein vollstaendiges ARIA-Combobox-Muster (`:200-226`), Tastaturnavigation ueber
 * `ArrowDown/Up/Enter/Home/End/Tab/Escape` (`:128-185`), `useDeferredValue` als
 * Entprellung (`:63`), eine 200-ms-Blur-Verzoegerung (`:31`, `:188-195`), Lade-, Fehler-
 * und Leerzustand. antd bringt ARIA, Tastatur, Fokusring und den Tap-auf-Vorschlag mit;
 * das Muster existiert in dieser Suite bereits (`src/app/m/feedback/_ui/Zuordnung.tsx:11`).
 *
 * ⛔ DREI DINGE TRAEGT ANTD NICHT UND SIND NACHBAU (Spec:3496-3500):
 *   1. die ZWEI-ZEICHEN-SCHWELLE (`ENTLEIHER_MIN_ZEICHEN` unten),
 *   2. die NEBENZEILE „zuletzt am 14.06.2026, 09:12" je Vorschlag (`options[].label` als
 *      eigenes Markup),
 *   3. das TAP-MASZ 44 je Zeile (`.vorschlag` in `ausleihe.module.css`).
 *
 * ⛔ DIE DATENQUELLE IST DIE SERVER ACTION `entleiherVorschlaege` (A17), KEIN ROUTE
 * HANDLER (Spec:3514-3516): ein zweiter anonymer GET-Endpunkt braeuchte seine eigene
 * Ratenbegrenzung, und der Suchtext stuende in JEDER Zugriffszeile des Proxys. Sie wird
 * ⛔ DIREKT IMPORTIERT, nicht als Prop gereicht (Falle 9, `CLAUDE.md:52-70`).
 *
 * ⛔ `_db/leihen.ts` WIRD HIER NICHT IMPORTIERT — auch nicht fuer den Typ eines Vorschlags.
 * Diese Datei traegt `"use client"`, und ein Wertimport von dort zoege Drizzle und die
 * Moduldatenbank in das Client-Bundle (dieselbe Begruendung wie an `ListenGeraet`,
 * `_ui/GeraeteListe.tsx`). Die Zeilenform wird deshalb aus der Signatur der Action
 * ABGELEITET.
 *
 * ⛔ DAS SICHTBARE FELD TRAEGT KEINEN `name`. Der abgesendete Wert steht in einem
 * versteckten Feld des Aufrufers (`_ui/AusleihVorgang.tsx`) — zeichengleich zu
 * `Zuordnung.tsx:396-398`. Grund: `AutoComplete` ist ein `Select` im Combobox-Modus
 * (`node_modules/antd/es/auto-complete/AutoComplete.js:152`), und was sein inneres
 * Suchfeld an ein `FormData` liefert, ist kein Vertrag, auf den man bauen sollte.
 *
 * ⛔ KEIN `size` (Falle 4, `CLAUDE.md:18-22`): die Flaeche laeuft ohne `FullShell` und erbt
 * `controlHeight: TAP = 56` (`src/core/theme/theme.ts:50-51`); `size="large"` waere 72.
 * ⛔ KEIN `@ant-design/icons` (Entscheidung E5, Falle 7).
 */

/**
 * ⛔ DIE ZWEI ZEICHEN SIND EINE DATENSCHUTZGRENZE, KEINE BEQUEMLICHKEIT (Spec:5117-5121):
 * ohne sie liefert ein Aufruf mit leerem Suchtext einem ANONYMEN Aufrufer die vollstaendige
 * Namensliste des Retentionsfensters.
 *
 * ⚠️ SIE STEHT HIER EIN ZWEITES MAL, UND DAS IST BENANNT STATT STILL. Die Wahrheit des
 * Servers ist `VORSCHLAG_MIN_ZEICHEN` (`_db/leihen.ts:178`), und `sucheEntleiher` setzt sie
 * unabhaengig von dieser Datei durch — „eine Regel, die nur im Client steht, ist keine
 * Regel" (Spec:3583-3585). Importieren laesst sie sich hier nicht, ohne Drizzle in das
 * Client-Bundle zu ziehen (siehe Kopf). ⛔ DAMIT DIE ZWEI NICHT AUSEINANDERLAUFEN, bindet
 * ein Testfall sie aneinander: „die Schwelle der Insel ist die Schwelle des Servers"
 * (`_ui/AusleihVorgang.test.tsx`). Der Alt-Kiosk fuehrt dieselbe Schwelle an derselben
 * Stelle (`BorrowerInput.tsx:30`, `MIN_QUERY_LENGTH = 2`).
 */
export const ENTLEIHER_MIN_ZEICHEN = 2;

/**
 * ⬜ A-L17 — DIE LAENGENGRENZE DES ENTLEIHERNAMENS, ABGELESEN STATT GERATEN.
 *
 * Quelle: `BORROWER_NAME_MAX: 100` in
 * `/Users/rubeen/dev/personal/drk/radio-admin/shared/src/loan.ts:5` (selbst nachgeschlagen;
 * die Nachbarzeile `:6` deckelt die Rueckgabenotiz auf 500 — jene hat in
 * `_lib/meldungen.ts:88` ihre Entsprechung).
 *
 * ⛔ SIE IST EINE FELDGRENZE UND KEINE SERVERZUSAGE, und genau deshalb steht sie HIER und
 * nicht in `_lib/meldungen.ts`. `bucheAusleihe` prueft den Namen ausschliesslich auf
 * NICHTLEERE (`_db/leihen.ts:475`); ein achter `grund` fuer „zu lang" verbietet
 * Entscheidung E13, die die Vollzaehligkeitszahlen auf SIEBEN und SECHS festsetzt
 * (`.superpowers/sdd/planteil3/briefs/KOPF.md:775-778`). Das Ledger weist die Feldhaelfte
 * dieser Aufgabe zu (`.superpowers/sdd/planteil3/progress.md:518-536`); die SERVERHAELFTE
 * BLEIBT OFFEN — ein Aufruf, der das Formular umgeht, schreibt weiterhin einen beliebig
 * langen Namen in `loans.borrower_name`, und dies ist der einzige ANONYME Schreibpfad des
 * Moduls.
 * ⛔ FAELLT DIE BETREIBERENTSCHEIDUNG UEBER DEN SATZ, wandert diese Konstante zu
 * `ZUSTANDSNOTIZ_MAX` in `_lib/meldungen.ts:88` und verschwindet hier — ⛔ NICHT beides,
 * sonst gibt es zwei Zahlen fuer dieselbe Grenze.
 */
export const ENTLEIHER_MAX = 100;

/**
 * Die Entprellung vor dem Abruf.
 *
 * ⚠️ ABWEICHUNG VOM BESTAND, BENANNT: dort entprellt `useDeferredValue` (`:63`), hier ein
 * Zeitgeber — dieselbe Bauform wie im Haus (`feedback/_ui/Zuordnung.tsx:375`).
 * `useDeferredValue` verschiebt nur die Neudarstellung; den ABRUF stiesse trotzdem jeder
 * Tastendruck an, und der geht hier gegen eine Server Action ohne eigene Ratenbegrenzung
 * (`_actions/ausleihe.ts`, „DIE RATENBEGRENZUNG DIESER VIER ACTIONS IST NICHT GEBAUT").
 */
const VERZOEGERUNG_MS = 200;

/** Eine Vorschlagszeile — aus der Signatur der Action abgeleitet, siehe Kopf. */
type Vorschlagszeile = Awaited<ReturnType<typeof entleiherVorschlaege>>[number];

export function EntleiherFeld({
  wert,
  setzeWert,
  gesperrt = false,
}: {
  wert: string;
  setzeWert: (neu: string) => void;
  /** `DeviceSelector`-Verhalten des Bestands: ohne gewaehltes Geraet ist das Feld tot (`BorrowerInput.tsx:24`, `routes/loan.tsx:87`). */
  gesperrt?: boolean;
}) {
  const [optionen, setOptionen] = useState<Vorschlagszeile[]>([]);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** Laufende Nummer gegen Antworten, die in falscher Reihenfolge eintreffen. */
  const lauf = useRef(0);

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  function aendern(roh: string): void {
    setzeWert(roh);
    if (timer.current) clearTimeout(timer.current);

    /*
     * ⛔ DIE SCHWELLE WIRD AUF DEM GETRIMMTEN ROHTEXT GEMESSEN, wie am Server
     * (`_db/leihen.ts:346`, „auf dem NORMALISIERTEN gemessen waere die Schwelle fuer ‚ß'
     * eine andere"). ⛔ UND SIE BRICHT VOR DEM ABRUF AB, nicht danach: ein Abruf, dessen
     * Ergebnis man wegwirft, ist derselbe anonyme Lesezugriff.
     */
    const q = roh.trim();
    if (q.length < ENTLEIHER_MIN_ZEICHEN) {
      setOptionen([]);
      return;
    }

    const meine = (lauf.current += 1);
    timer.current = setTimeout(() => {
      void (async () => {
        try {
          const treffer = await entleiherVorschlaege(q);
          if (meine === lauf.current) setOptionen(treffer);
        } catch {
          /*
           * Die Vorschlaege sind Komfort. Faellt die Action aus, bleibt das Feld ein Feld —
           * ein getippter Name geht weiterhin durch. ⚠️ Der Bestand baut hier einen
           * Fehlerzustand mit „Erneut versuchen" (`BorrowerInput.tsx:249-261`); der wandert
           * NICHT mit, weil er auf einer Flaeche ohne eigenen Fehlerkanal eine Stoerung
           * meldet, die den Vorgang nicht aufhaelt.
           */
          if (meine === lauf.current) setOptionen([]);
        }
      })();
    }, VERZOEGERUNG_MS);
  }

  return (
    <AutoComplete
      id="radio-entleiher"
      className={s.entleiherFeld}
      value={wert}
      disabled={gesperrt}
      onChange={aendern}
      /*
       * ⛔ DIE LAENGENGRENZE AM FELD (⬜ A-L17, siehe `ENTLEIHER_MAX` oben). Sie kommt am
       * DOM-Feld an und nicht nur am Typ — gemessen an der installierten Fassung:
       * `SingleContent.js:95` reicht `maxLength` genau im Combobox-Modus durch
       * (`node_modules/.pnpm/@rc-component+select@1.8.2_.../es/SelectInput/Content/SingleContent.js`),
       * und `AutoComplete` setzt genau diesen Modus
       * (`node_modules/antd/es/auto-complete/AutoComplete.js:152`).
       * ⛔ SIE IST EINE BEQUEMLICHKEIT, KEINE ZUSAGE: sie begrenzt das TIPPEN, nicht einen
       * VORBELEGTEN Wert (§3.5.4, `defaultValue` aus `weg: "suite"`) und keinen Aufruf, der
       * das Formular umgeht. Den sichtbaren Feldfehler dazu setzt `_ui/AusleihVorgang.tsx`.
       */
      maxLength={ENTLEIHER_MAX}
      /*
       * ⛔ KEINE FILTERUNG IM BROWSER, UND SIE IST HIER AUCH NICHT ABZUSCHALTEN. Gemessen
       * an der installierten Fassung
       * (`node_modules/.pnpm/@rc-component+select@1.8.2_.../es/Select.js:117-121`): im
       * Combobox-Modus — und `AutoComplete` setzt genau den
       * (`node_modules/antd/es/auto-complete/AutoComplete.js:152`) — ist `filterOption`
       * `false`, sobald niemand sie setzt. Das ist wichtig, weil der Server UMLAUTFALTEND
       * sucht (`normalisiereSuchtext`, `_lib/filter.ts:108`: „muller" findet „Müller") und
       * eine Zeichenkettenfilterung im Browser genau diese Treffer wieder wegwuerfe.
       * ⚠️ EIN AUSDRUECKLICHES `filterOption={false}` GIBT ES IN ANTD 6 NICHT MEHR als
       * eigenstaendige Eigenschaft — sie ist in `showSearch` gewandert
       * (`node_modules/antd/es/auto-complete/AutoComplete.d.ts:51-54`). Deshalb steht hier
       * die Messung statt der Zeile.
       */
      /*
       * jsdom kennt keine Elementhoehen; mit Virtualisierung rendert die Liste in Tests nie
       * (`feedback/_ui/Zuordnung.tsx:408-410`). Der Verzicht kostet bei hoechstens zehn
       * Eintraegen nichts — den Deckel setzt `sucheEntleiher` (`_db/leihen.ts:342`).
       */
      virtual={false}
      placeholder="Name eingeben"
      aria-label="Name des Entleihers"
      data-rolle="radio-entleiher-feld"
      options={optionen.map((v) => ({
        value: v.name,
        /*
         * ⛔ DIE NEBENZEILE IST DER POSTEN, DER BEIM PORT STILL VERSCHWAENDE (Spec:3498,
         * `_db/leihen.ts:111-120`): `Vorschlag` ist kein `string`, sondern
         * `{ name, zuletztText }`. `zuletztText` ist eine FERTIGE Zeichenkette vom Server —
         * kein Zeitstempel in Millisekunden verlaesst ihn (Spec:5122-5123), und im Browser
         * gerechnet entschieden Server und Client an der Tagesgrenze verschieden.
         */
        label: (
          <span className={s.vorschlag} data-rolle="radio-vorschlag">
            <span className={s.vorschlagName}>{v.name}</span>
            <span className={s.vorschlagZuletzt} data-rolle="radio-vorschlag-zuletzt">
              {v.zuletztText}
            </span>
          </span>
        ),
      }))}
    />
  );
}
