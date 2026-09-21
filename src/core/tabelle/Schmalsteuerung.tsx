"use client";

/**
 * FILTERN UND SORTIEREN OHNE SPALTENKÖPFE (DRK-451).
 *
 * ⚠️ WARUM ES DIESE LEISTE GEBEN MUSS, UND ZWAR ALS TEIL DES BAUTEILS. Eine
 * Kartenliste hat keine Spaltenköpfe — und in dieser Suite sitzen Filter und
 * Sortierung seit DRK-333 ausschließlich dort. Wer eine Tabelle auf Karten
 * umstellt und diese Leiste vergisst, NIMMT dem Telefon also etwas weg, statt
 * ihm etwas zu geben: vorher kam man über die waagerecht gescrollte Zeile noch
 * an den Trichter, danach gar nicht mehr. Genau das ist bei DRK-421 zweimal
 * passiert und wurde zweimal einzeln nachgebessert (Inventur, uav). Beim
 * dritten Mal gehört es ins Bauteil.
 *
 * ⚠️ SIE SCHREIBT IN DENSELBEN ZUSTAND WIE DIE SPALTENKÖPFE, nie in einen
 * zweiten daneben. Das ist der ganze Punkt: Trefferanzeige, Leertext und alles,
 * was ein Aufrufer aus der angezeigten Menge ableitet, hängen an genau einer
 * Filterquelle. Zwei Quellen hießen, dass ein Wechsel der Fenstergröße still
 * etwas anderes zeigt als das, was vorher dastand.
 *
 * ⚠️ NUR SPALTEN MIT `filters` BEKOMMEN EIN FELD. Eine Spalte mit eigenem
 * `filterDropdown` bringt ihre Bedienung selbst mit; sie hier nachzubauen hieße
 * zu raten, was sie tut. Sie behält ihren ungesteuerten Stand — dasselbe
 * Verhalten wie vor diesem Ticket, also kein Verlust, sondern eine
 * ausgelassene Verbesserung.
 */

import { useMemo, type Key, type ReactNode } from "react";
import { Button, Flex, Select } from "antd";
import { SPACE } from "../theme/tokens";
import { SCHRIFT } from "../theme/schrift";
import { NurSchmal } from "./Schmalkarten";
import { spaltenSchluessel, type FilterZustand, type SortZustand } from "./angezeigt";
import type { KartenSpalte } from "./kartenaufbau";

/** Was antd als Eintrag in `columns[].filters` führt. */
type Filtereintrag = { text?: ReactNode; value?: Key | boolean; children?: readonly Filtereintrag[] };

export type SchmalsteuerungProps<T> = {
  /** Die BLÄTTER der Spaltenliste — Gruppenköpfe filtern und sortieren nicht. */
  spalten: readonly KartenSpalte<T>[];
  filter: FilterZustand;
  onFilter: (filter: FilterZustand) => void;
  sortierung: SortZustand;
  onSortierung: (sortierung: SortZustand) => void;
  /** Wie viele Zeilen gerade stehen und wie viele es insgesamt gibt. */
  angezeigt: number;
  gesamt: number;
  /** Ab wie vielen Zeilen die Leiste überhaupt erscheint. */
  abZeilen?: number;
};

/**
 * Ab wie vielen Zeilen eine Filter- und Sortierleiste mehr nützt als kostet.
 *
 * ⚠️ DIE ZAHL IST EINE UX-ENTSCHEIDUNG, KEINE TECHNISCHE. Eine Liste, die man
 * mit einem Blick überschaut, braucht keinen Filter — auf 390px kostet jedes
 * Auswahlfeld dagegen eine volle Zeile über der Liste, also genau den Platz,
 * den die Liste hätte. Gemessen an dieser Suite trifft das eine ganze Klasse
 * von Tabellen: die Chargen eines Artikels, die Einheiten einer Vorlage, die
 * Positionen eines Checks — alles Listen mit einer Handvoll Zeilen, über denen
 * eine Sortierwahl nur Lärm wäre.
 *
 * ⚠️ SIE GILT NICHT, WENN BEREITS GEFILTERT WIRD. Sonst verschwände die Leiste
 * mitsamt dem gesetzten Filter, sobald er die Liste unter die Schwelle zieht —
 * und dann stünde eine kurze Liste da, die sich nicht mehr zurücksetzen lässt.
 * Das ist die Sackgasse, die diese Schwelle sonst einbaute.
 */
export const STEUERUNG_AB_ZEILEN = 8;

/**
 * Die Trennung zwischen Spalte und Sortierrichtung in EINEM Auswahlwert.
 *
 * ⚠️ ZWEI FELDER WÄREN DIE NAHELIEGENDE UND DIE SCHLECHTERE LÖSUNG: „Spalte"
 * und „Richtung" nebeneinander ergeben einen Zwischenzustand, in dem eine
 * Spalte gewählt ist und noch keine Richtung — die Liste steht dann unsortiert
 * da, obwohl das Feld etwas anderes behauptet. Ein Feld mit ausgeschriebenen
 * Wahlmöglichkeiten („Name A–Z") hat diesen Zustand nicht.
 *
 * ⚠️ DAS TRENNZEICHEN IST EIN NUL-ESCAPE UND KEIN DOPPELPUNKT. Ein
 * Spaltenschlüssel darf jedes Zeichen tragen; hieße eine Spalte `a:b`, wäre der
 * zusammengesetzte Wert mehrdeutig, und die Liste sortierte still nach etwas
 * anderem. Geschrieben als Escape, nicht als echtes Nullbyte — ein solches
 * macht die Datei für git binär (Begründung bei `OHNE_WERT` in
 * `spaltenfilter.ts`).
 */
const TRENNER = "\u0000";

/** Ob eine Spalte hier überhaupt sortieren kann — `sorter: true` sortiert serverseitig. */
function sortierbar<T>(spalte: KartenSpalte<T>): boolean {
  const roh = spalte.sorter;
  if (typeof roh === "function") return true;
  return typeof roh === "object" && roh !== null
    && typeof (roh as { compare?: unknown }).compare === "function";
}

/** Die Filtereinträge einer Spalte, Gruppen aufgelöst. */
function eintraege(roh: unknown): Filtereintrag[] {
  if (!Array.isArray(roh)) return [];
  const flach: Filtereintrag[] = [];
  for (const eintrag of roh as Filtereintrag[]) {
    if (eintrag.children && eintrag.children.length > 0) {
      flach.push(...eintrag.children);
      continue;
    }
    flach.push(eintrag);
  }
  return flach;
}

export function Schmalsteuerung<T>({
  spalten,
  filter,
  onFilter,
  sortierung,
  onSortierung,
  angezeigt,
  gesamt,
  abZeilen = STEUERUNG_AB_ZEILEN,
}: SchmalsteuerungProps<T>) {
  const filterbar = useMemo(() => spalten
    .map((spalte) => ({ spalte, schluessel: spaltenSchluessel(spalte) }))
    .filter((eintrag): eintrag is { spalte: KartenSpalte<T>; schluessel: string } =>
      eintrag.schluessel !== null
      && Array.isArray(eintrag.spalte.filters)
      && eintrag.spalte.filters.length > 0), [spalten]);

  const sortierwahl = useMemo(() => {
    const wahl: { value: string; label: string }[] = [];
    for (const spalte of spalten) {
      const schluessel = spaltenSchluessel(spalte);
      if (!schluessel || !sortierbar(spalte)) continue;
      const name = typeof spalte.title === "string" ? spalte.title : schluessel;
      wahl.push({ value: `${schluessel}${TRENNER}ascend`, label: `${name} ↑` });
      wahl.push({ value: `${schluessel}${TRENNER}descend`, label: `${name} ↓` });
    }
    return wahl;
  }, [spalten]);

  const gefiltert = angezeigt !== gesamt;
  // Nichts zu bedienen — oder eine Liste, die man mit einem Blick überschaut.
  // Der zweite Teil der Bedingung ist der wichtige: ein GESETZTER Filter hält
  // die Leiste da, auch wenn er die Liste kurz gemacht hat (s. `STEUERUNG_AB_ZEILEN`).
  if (filterbar.length === 0 && sortierwahl.length === 0) return null;
  if (gesamt < abZeilen && !gefiltert) return null;

  const sortierwert = sortierung.spalte && sortierung.richtung
    ? `${String(sortierung.spalte)}${TRENNER}${sortierung.richtung}`
    : undefined;

  return (
    <NurSchmal data-rolle="schmalsteuerung">
      <Flex vertical gap={SPACE.sm} style={{ marginBlockEnd: SPACE.md }}>
        <Flex gap={SPACE.sm} wrap>
          {filterbar.map(({ spalte, schluessel }) => {
            const name = typeof spalte.title === "string" ? spalte.title : schluessel;
            return (
              <Select<string[]>
                key={schluessel}
                mode="multiple"
                aria-label={`${name} filtern`}
                placeholder={name}
                style={{ minWidth: 160, flex: "1 1 160px" }}
                value={(filter[schluessel] ?? []).map(String)}
                // ⚠️ LEER HEISST `null`, NICHT `[]`. `angezeigteAnzahl` liest
                // `filteredValue` wörtlich — ein leeres Feld wäre ein gesetzter
                // Filter ohne Werte, und die Trefferanzeige spräche von einer
                // Auswahl, die niemand getroffen hat.
                onChange={(werte) => onFilter({
                  ...filter,
                  [schluessel]: werte.length > 0 ? werte : null,
                })}
                options={eintraege(spalte.filters).map((eintrag) => ({
                  value: String(eintrag.value),
                  label: eintrag.text,
                }))}
                // Eine virtuelle Auswahlliste rendert in jsdom keinen Eintrag —
                // dieselbe Klasse wie Falle 14, und hier ohne jeden Gewinn: die
                // Listen sind kurz.
                virtual={false}
              />
            );
          })}
          {sortierwahl.length > 0 ? (
            <Select<string>
              aria-label="Sortierung"
              placeholder="Sortieren"
              style={{ minWidth: 160, flex: "1 1 160px" }}
              value={sortierwert}
              allowClear
              onChange={(wert) => {
                if (!wert) {
                  onSortierung({ spalte: undefined, richtung: null });
                  return;
                }
                const [spalte, richtung] = wert.split(TRENNER);
                onSortierung({ spalte, richtung: richtung as "ascend" | "descend" });
              }}
              options={sortierwahl}
              virtual={false}
            />
          ) : null}
        </Flex>
        {gefiltert ? (
          <Flex gap={SPACE.sm} align="center" wrap>
            {/*
              ⚠️ DIE ZAHL STEHT HIER, WEIL DER FILTER NICHT MEHR ZU SEHEN IST.
              Am Schreibtisch trägt der Spaltenkopf einen gefüllten Trichter,
              und daran erkennt man, warum die Liste kurz ist. Auf der Karte
              fehlt dieses Zeichen — ohne die Zahl sieht eine gefilterte Liste
              aus wie eine leere Datenbank.
            */}
            <span style={{ ...SCHRIFT.neben, color: "var(--iuk-gedaempft)" }}>
              {`${angezeigt} von ${gesamt}`}
            </span>
            {/*
              ⚠️ KEIN `size` — auch nicht `small`. Die Bediendichte hängt in
              dieser Suite an der Shell und wird am Bauteil NIE gesetzt
              (`docs/design/README.md`, Falle 4): `FullShell` rendert auch auf
              dem Telefon, dort gelten 44px, und das ist zugleich die
              WCAG-2.5.5-Untergrenze. Ein `size="small"` ergäbe 24px — genau
              hier, wo der Daumen bedient.

              Nur die FILTER, nicht die Sortierung: eine Sortierung versteckt
              nichts, sie ordnet nur — sie mit zurückzusetzen nähme jemandem
              etwas weg, worüber er sich nicht beschwert hat.
            */}
            <Button onClick={() => onFilter({})}>Filter zurücksetzen</Button>
          </Flex>
        ) : null}
      </Flex>
    </NurSchmal>
  );
}
