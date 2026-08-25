"use client";

// src/app/m/radio/admin/(arbeit)/geraete/SpaltenWahl.tsx
import { useState } from "react";
import { Button, Checkbox, Dropdown } from "antd";
import s from "../../../_ui/verwaltung.module.css";

/**
 * DIE SPALTENAUSWAHL — Nachfolgerin von `ColumnPicker.tsx` UND `CheckboxDropdown.tsx`
 * (`Spec:4834-4836`: „aus 14 Dateien unter `features/devices/` werden sieben unter
 * `admin/geraete/`, weil ColumnPicker, CheckboxDropdown, SearchFieldPicker und FilterDrawer
 * in einer Insel keine eigene Schichtung mehr brauchen").
 *
 * ⛔ KIND VON INSEL 1, KEINE EIGENE INSEL (E-V6): die sichtbaren Spalten sind Zustand, den
 * sie mit `GeraeteTabelle.tsx` teilt.
 *
 * ⛔ DIE OPTIONEN KOMMEN ALS PROP UND NICHT AUS EINEM IMPORT VON `GeraeteTabelle.tsx`: der
 * umgekehrte Weg waere ein Zyklus (die Tabelle rendert diese Datei). Derselbe Grund, aus dem
 * E-V6 die Props-Grenze GENAU EINMAL zieht.
 *
 * ⛔ SIE WIRD ZWEIMAL BENUTZT — fuer die Spalten (`ColumnPicker.tsx`) UND fuer die Suchfelder
 * (`SearchFieldPicker.tsx`). Beide waren im Bestand dieselbe `CheckboxDropdown`; eine zweite
 * Kopie unter anderem Namen waere die handgepflegte Doppelung, gegen die Ruling R-V11-1
 * steht (`.superpowers/sdd/planteil4/progress.md`).
 *
 * ⚠️ KEIN ZEICHEN AUF DEN ZWEI KNOEPFEN — benannte Abweichung von `ColumnPicker.tsx:19`
 * (`FiColumns`) und `SearchFieldPicker.tsx:36` (`FiSliders`, nur `aria-label`). Die eine
 * Zeichenquelle des Moduls ist `_ui/ikonen.tsx` (Entscheidung E-V7, NS-A8b), und ihr Bestand
 * ist auf ZWOELF festgenagelt (`_ui/ikonen.test.tsx:108`); die Dateiliste dieser Aufgabe
 * fuehrt sie nicht. Dieselbe Entscheidung hat V12 fuer die Kennzahlkarten getroffen
 * (`admin/(arbeit)/page.tsx:54-61`). Die Beschriftung traegt die Aussage — und beim
 * Suchfeld-Aufklapper traegt sie MEHR als vorher: der Bestand hatte dort nur ein
 * `aria-label`.
 *
 * ⛔ DER AUFKLAPPER BLEIBT BEIM UMSCHALTEN OFFEN — 1:1 aus `CheckboxDropdown.tsx:17-21`:
 * „the popup stays open while toggling — only an outside click or Esc closes it, because the
 * content is rendered via `popupRender` rather than as menu items".
 */

export type SpaltenOption = { schluessel: string; etikett: string };

export type SpaltenWahlProps = {
  optionen: SpaltenOption[];
  wert: string[];
  aufAenderung: (naechste: string[]) => void;
  /** Die Beschriftung des Aufklappers — ⛔ ein WORT, kein Zeichen (siehe Kopf). */
  knopfEtikett: string;
  knopfRolle: string;
  listenRolle: string;
};

export function SpaltenWahl({
  optionen,
  wert,
  aufAenderung,
  knopfEtikett,
  knopfRolle,
  listenRolle,
}: SpaltenWahlProps) {
  const [offen, setOffen] = useState(false);
  const gewaehlt = new Set(wert);

  /*
   * ⛔ DIE ERKLAERTE REIHENFOLGE DER OPTIONEN BLEIBT ERHALTEN — 1:1 aus
   * `CheckboxDropdown.tsx:29-30` („Preserve the options' declared order in the emitted
   * value"). Ein `push` auf die bestehende Auswahl haengte eine wieder eingeschaltete Spalte
   * hinten an, und `buildColumns` sortierte sie zwar zurueck, der GESPEICHERTE Wert waere
   * aber ein anderer als der Bestand ihn schreibt.
   */
  const umschalten = (schluessel: string, an: boolean) => {
    const naechste = new Set(gewaehlt);
    if (an) naechste.add(schluessel);
    else naechste.delete(schluessel);
    aufAenderung(optionen.filter((o) => naechste.has(o.schluessel)).map((o) => o.schluessel));
  };

  return (
    <Dropdown
      open={offen}
      onOpenChange={setOffen}
      trigger={["click"]}
      popupRender={() => (
        <div className={s.wahlListe} data-rolle={listenRolle}>
          {optionen.map((option) => (
            <div key={option.schluessel} className={s.wahlZeile} data-schluessel={option.schluessel}>
              <Checkbox
                checked={gewaehlt.has(option.schluessel)}
                onChange={(e) => umschalten(option.schluessel, e.target.checked)}
              >
                {option.etikett}
              </Checkbox>
            </div>
          ))}
        </div>
      )}
    >
      <Button data-rolle={knopfRolle}>{knopfEtikett}</Button>
    </Dropdown>
  );
}
