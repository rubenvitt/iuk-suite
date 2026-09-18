"use client";

/**
 * KATEGORIE UND FACH FILTERN — AUF DEM TELEFON (DRK-421).
 *
 * ⚠️ WARUM ES DIESE LEISTE WIEDER GIBT, OBWOHL DRK-333 SIE ABGESCHAFFT HAT.
 * Damals wanderten die beiden Filter aus einer Leiste ueber der Tabelle in die
 * Spaltenkoepfe — richtig, denn ein Praedikat ueber einer Zeile gehoert in den
 * Kopf der Spalte, die es betrifft. Die schmale Darstellung hat aber keine
 * Spaltenkoepfe, und damit hatte sie seit DRK-333 gar keinen Filter mehr: eine
 * Zaehlung mit sechshundert Artikeln laesst sich auf 390px nicht durchscrollen.
 * Die Leiste ist deshalb KEINE Rueckkehr — sie steht nur dort, wo es die
 * Spaltenkoepfe nicht gibt (`schmalkarten.module.css` blendet sie ab 768px aus).
 *
 * ⚠️ UND SIE SCHREIBT IN DENSELBEN ZUSTAND WIE DIE SPALTENKOEPFE, nicht in
 * einen zweiten daneben. Das ist der ganze Punkt: der Ausgeblendet-Hinweis, die
 * Trefferanzeige und der UMFANG DER BUCHUNG im append-only Verlauf haengen an
 * genau einer Filterquelle. Zwei Quellen hiessen, dass der Verlauf einen Umfang
 * traegt, der so nie auf dem Schirm stand — und dass ein Wechsel der
 * Fenstergroesse still etwas anderes bucht.
 *
 * ⚠️ DESHALB SIND DIE SPALTEN SEIT DIESEM TICKET GESTEUERT (`filteredValue`).
 * Ungesteuert fuehrt antd den Stand allein; von aussen hineinzuschreiben ginge
 * gar nicht, und die beiden Darstellungen zeigten verschiedene Mengen. Der
 * Nebengewinn: `angezeigteAnzahl` kann die gezeigte Zeilenzahl jetzt ausrechnen
 * und muss nicht mehr `-1` melden (Falle 14, `aria-rowcount`).
 */

import { Flex, Select } from "antd";
import { SPACE } from "@/core/theme/tokens";
import type { FilterZustand } from "@/core/tabelle";
import { NurSchmal } from "@/core/tabelle";
import type { KategorieOption } from "../../../_lib/kategorie";

export function Schmalfilter({ kategorien, faecher, zustand, onZustand }: {
  kategorien: readonly KategorieOption[];
  /** Die vorhandenen Fachbezeichnungen, wie sie auch im Spaltenkopf stehen. */
  faecher: readonly string[];
  zustand: FilterZustand;
  onZustand: (zustand: FilterZustand) => void;
}) {
  function setze(spalte: "kategorie" | "fach", werte: string[]): void {
    // ⚠️ LEER HEISST `null`, NICHT `[]`. antd behandelt beides gleich, aber
    // `angezeigteAnzahl` liest `filteredValue` woertlich — ein leeres Feld
    // waere ein gesetzter Filter ohne Werte, und die Trefferanzeige spraeche
    // von einer Auswahl, die niemand getroffen hat.
    onZustand({ ...zustand, [spalte]: werte.length > 0 ? werte : null });
  }

  return (
    // ⚠️ DER MANTEL TRAEGT DIE SICHTBARKEIT, NICHT DIE `Flex` SELBST. Die Klasse
    // direkt an das antd-Bauteil zu haengen war der erste Anlauf, und die
    // Leiste stand bei 1280px trotzdem da: `.ant-flex { display: flex }` ist
    // genauso einklassig und kommt zur Laufzeit danach (Falle 5, Begruendung
    // bei `NurSchmal`). Die Leiste teilt die Sichtbarkeitsregel der Karten —
    // sie verschwindet mit ihnen, sobald es Spaltenkoepfe gibt.
    <NurSchmal data-rolle="schmalfilter">
      <Flex gap={SPACE.sm} wrap style={{ marginBlockEnd: SPACE.md }}>
        {kategorien.length > 0 ? (
          <Select<string[]>
            mode="multiple"
            aria-label="Kategorie filtern"
            placeholder="Kategorie"
            style={{ minWidth: 160, flex: "1 1 160px" }}
            value={(zustand.kategorie ?? []).map(String)}
            onChange={(werte) => setze("kategorie", werte)}
            options={kategorien.map((o) => ({ value: o.schluessel, label: o.label }))}
            virtual={false}
          />
        ) : null}
        <Select<string[]>
          mode="multiple"
          aria-label="Fach filtern"
          placeholder="Fach"
          style={{ minWidth: 160, flex: "1 1 160px" }}
          value={(zustand.fach ?? []).map(String)}
          onChange={(werte) => setze("fach", werte)}
          options={faecher.map((f) => ({ value: f, label: f }))}
          virtual={false}
        />
      </Flex>
    </NurSchmal>
  );
}
