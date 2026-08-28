"use client";

// src/app/m/radio/admin/(arbeit)/geraete/SpaltenWahl.tsx
import { useState } from "react";
import { Button, Checkbox, Dropdown } from "antd";
import s from "../../../_ui/verwaltung.module.css";
import { VIkone, type VerwaltungsIkonName } from "../../../_ui/verwaltungIkonen";

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
 * ⚠️ DIE ZWEI KNOEPFE TRAGEN SEIT DEM 2026-08-28 WIEDER IHR ZEICHEN — die frueher hier
 * benannte Abweichung (E-V7, „eine Zeichenquelle, auf ZWOELF Namen festgenagelt") ist von der
 * Betreiberentscheidung zur Verwaltungsdichte ueberholt: der Verwaltungszweig hat mit
 * `_ui/verwaltungIkonen.tsx` seine EIGENE Zeichenquelle (Phosphor), `_ui/ikonen.tsx` bleibt
 * unberuehrt die der Ausleihflaeche. 1:1 zum Bestand: `ColumnPicker.tsx:19` setzt `FiColumns`
 * NEBEN das Wort „Spalten", `SearchFieldPicker.tsx:36` setzt `FiSliders` OHNE Wort.
 *
 * ⛔ UND DESHALB `nurZeichen` STATT EINES LEEREN ETIKETTS: ein Knopf ohne Beschriftung
 * braucht seinen Namen im `aria-label` (`SearchFieldPicker.tsx:36` tut genau das). Das
 * Etikett bleibt in beiden Faellen PFLICHT — es ist entweder sichtbar oder vorgelesen, nie
 * keines von beidem.
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
  /**
   * Die Beschriftung des Aufklappers — ⛔ PFLICHT, auch bei `nurZeichen`: dort wird sie zum
   * `aria-label` und ist der einzige Name, den der Knopf noch hat (siehe Kopf).
   */
  knopfEtikett: string;
  /** Das Zeichen am Knopf (`spalten` bzw. `regler`, 1:1 zum Bestand). */
  zeichen: VerwaltungsIkonName;
  /** Nur das Zeichen, kein Wort — der Suchfeld-Aufklapper (`SearchFieldPicker.tsx:36`). */
  nurZeichen?: boolean;
  knopfRolle: string;
  listenRolle: string;
};

export function SpaltenWahl({
  optionen,
  wert,
  aufAenderung,
  knopfEtikett,
  zeichen,
  nurZeichen = false,
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
      {/* ⛔ OHNE `size` — Falle 4; die Hoehe kommt aus der Bediendichte des Rahmens. */}
      <Button
        data-rolle={knopfRolle}
        icon={<VIkone name={zeichen} />}
        aria-label={nurZeichen ? knopfEtikett : undefined}
      >
        {nurZeichen ? null : knopfEtikett}
      </Button>
    </Dropdown>
  );
}
