"use client";

import { DatePicker } from "antd";
import pickerDeDE from "antd/es/date-picker/locale/de_DE";
import dayjs from "dayjs";
import customParseFormat from "dayjs/plugin/customParseFormat";
import "dayjs/locale/de";

/*
 * DAS DATUMSFELD DER VERWALTUNG — antds `DatePicker` statt eines nackten
 * `<input type="date">`.
 *
 * WAS VORHER FALSCH WAR, IM BROWSER NACHGEMESSEN UND NICHT VERMUTET: das rohe
 * `<input type="date">` stand neben antds `Input` mit anderer Hoehe (32px gegen 44px),
 * anderer Rundung und anderer Schrift, und es zeigte `mm/dd/yyyy` — ein natives
 * Datumsfeld folgt der Sprache des BROWSERS, nicht der der Seite. Ein deutsches
 * Formular, das nach amerikanischem Muster fragt, laesst sich falsch ausfuellen, ohne
 * dass jemand einen Fehler macht.
 *
 * DIE DREI GRUENDE, DIE IN `feedback/_ui/StartFormular.tsx` GEGEN `DatePicker`
 * STEHEN, TRAGEN HIER NICHT — dieselbe Lage wie in `aufgaben/_ui/Felder.tsx`, das die
 * Abwaegung ausfuehrlich fuehrt: beide Aufrufstellen sind ohnehin schon Client-Inseln
 * (`useTransition`), das Locale-Buendel kommt genau einmal herein (naemlich hier), und
 * „ohne Client-JS vorbelegbar" ist an einem Formular, das seine Server Action selbst
 * aufruft, keine Zusage, die je bestand.
 *
 * EINE EIGENE, KLEINE DATEI UND KEIN IMPORT AUS `aufgaben/_ui/Felder.tsx`:
 * Modul-Interna sind kein API (`docs/design/README.md`, „Die Regel fuer `src/core`").
 * Nach `core` gehoert das Feld heute auch nicht — der Massstab dort ist ein zweiter,
 * heute belegbarer Nutzniesser, und `aufgaben` braucht seine Fassung mit verstecktem
 * Feld, Remount-Schluessel und Popover-Container, von der hier nichts gebraucht wird.
 *
 * `dayjs/locale/de` HAT EINEN EIGENEN GRUND NEBEN antds `de_DE`: antds Locale liefert
 * die Beschriftungen, die Wochentagsspalten des Kalenders kommen aus dayjs' eigener
 * Locale-Data. Ohne diesen Import beginnt die Woche am Sonntag.
 *
 * `customParseFormat` AUSDRUECKLICH, obwohl antds Picker denselben Plugin auf
 * Modulebene laedt: darauf zu bauen hiesse, sich auf ein Interna eines transitiven
 * Pakets zu verlassen. `dayjs.extend` ist idempotent, der zweite Aufruf kostet nichts.
 *
 * KEIN `size` (Falle 4) — `ARBEITSDICHTE` gibt die 44px, `core/theme/theme.ts` haelt
 * mit `DatePicker.inputFontSize` die 16px-Zusage fuer Eingabefelder.
 */
dayjs.extend(customParseFormat);

/** Die Form, in der die Server Actions dieses Moduls ein Datum erwarten. */
const ISO_TAG = "YYYY-MM-DD";
/** Die Form, in der ein Datum in diesem Land GELESEN wird — nur Anzeige, nie der Wert. */
const ANZEIGE_TAG = "DD.MM.YYYY";

export function Datumsfeld({
  id,
  wert,
  aufAenderung,
  platzhalter,
}: {
  id: string;
  /** `YYYY-MM-DD` oder `""` fuer „nicht gesetzt". */
  wert: string;
  aufAenderung: (iso: string) => void;
  platzhalter?: string;
}) {
  const tag = wert ? dayjs(wert, ISO_TAG, true) : null;

  return (
    <DatePicker
      id={id}
      locale={pickerDeDE}
      /*
       * ZWEI FORMATE, UND DAS ZWEITE IST ABSICHT: angezeigt wird `DD.MM.YYYY`, gelesen
       * wird zusaetzlich `YYYY-MM-DD`. rc-picker probiert beim Parsen jedes Format der
       * Liste durch und benutzt nur das erste zum Anzeigen — damit nimmt das Feld eine
       * eingefuegte ISO-Zeichenkette weiterhin an. Das ist die Form, in der Daten in
       * diesem Projekt herumgereicht werden (Seed, CSV, jeder Test).
       */
      format={[ANZEIGE_TAG, ISO_TAG]}
      value={tag?.isValid() ? tag : null}
      onChange={(gewaehlt) => aufAenderung(gewaehlt ? gewaehlt.format(ISO_TAG) : "")}
      placeholder={platzhalter}
      style={{ width: "100%" }}
    />
  );
}
