"use client";

/**
 * DIE TABELLE DER SUITE — ein dünner Mantel über antds `Table`, der die
 * Vorgaben hält, die bisher in 44 Tabellen einzeln abgeschrieben wurden.
 *
 * WARUM SIE NACH `core` DURFTE: nicht als Vorrat für künftigen Bedarf, sondern
 * gegen eine bereits eingetretene Verdopplung. `pagination={false}` stand in 44
 * Dateien, `scroll={{ x: "max-content" }}` in 41, und der Spaltenkopf-Kicker aus
 * `docs/design/README.md` in über 200 Spalten als handgeschriebenes
 * `<span style={…}>`. Jede dieser Stellen konnte ihn vergessen, und keine merkte
 * es — genau der Maßstab, den `CLAUDE.md` für `core` setzt.
 *
 * WAS SIE NICHT TUT: sie erfindet keine eigene Tabelle und versteckt antd nicht.
 * Alle antd-Eigenschaften gehen unverändert durch; die Komponente setzt nur
 * Vorgaben, die jeder Aufrufer überschreiben kann.
 *
 * ⚠️ SIE IST EINE CLIENT-KOMPONENTE, und das ist keine Bequemlichkeit: antds
 * `Table` ist selbst eine, und ein `columns[].render`, das in einer Server
 * Component entstünde, ließe sich gar nicht über die RSC-Grenze reichen
 * (Falle 9). Wer sie benutzt, definiert seine Spalten im Client.
 */

import { useEffect, useMemo } from "react";
import { Table, type TableProps } from "antd";
import { SCHRIFT } from "../theme/schrift";
import { scrollMasse, type MassSpalte, type Scrollmass } from "./masse";

export type DatentabelleProps<T> = Omit<TableProps<T>, "pagination" | "virtual" | "scroll"> & {
  /**
   * Höhe des Scrollbereichs in Pixeln. Gesetzt heißt: virtuell scrollen.
   *
   * ⚠️ JEDE Spalte braucht dann eine numerische `width`. Fehlt eine, bleibt die
   * Tabelle gewöhnlich und sagt es in der Entwicklungskonsole — statt still auf
   * ein Pixel Breite zusammenzufallen. Warum: siehe `masse.ts`.
   */
  virtuell?: number | false;
  /**
   * Ab wie vielen Zeilen tatsächlich virtualisiert wird. Vorgabe
   * `VIRTUELL_AB_ZEILEN`. Darunter kostet Virtualisierung mehr, als sie spart —
   * und sie macht die Tabelle in jsdom zeilenlos, also für jeden DOM-Test
   * blind. Begründung im Kopf von `masse.ts`.
   */
  virtuellAbZeilen?: number;
  /**
   * Nur für den Ausnahmefall einer Tabelle, die tatsächlich blättern soll.
   * Vorgabe ist `false`: die Suite scrollt durchgängig, statt zu blättern — und
   * ein Blätterwerk ändert stillschweigend, was ein Export bedeutet („alles, was
   * ich sehe" wird zu „die erste Seite").
   */
  blaettern?: TableProps<T>["pagination"];
  /**
   * Eigene Scrollmaße. Ohne Angabe `{ x: "max-content" }`, bei `virtuell`
   * gerechnet.
   *
   * ⚠️ `false` SCHALTET DIE VORGABE AB — für die Tabelle, die unter 768px
   * ohnehin ausgeblendet wird und deren Spalten `ellipsis` tragen (Vorbild
   * `feedback/_ui/Verlauf.tsx`). Dort schadet `max-content` messbar: die
   * Tabelle bekommt einen eigenen Scrollcontainer, und die Spalte, deren
   * Aufgabe das Abschneiden ist, wächst stattdessen mit ihrem längsten Wert.
   */
  scroll?: Scrollmass | false;
};

/**
 * Spaltenköpfe tragen die Kicker-Rolle über `columns[].title`, nie über CSS
 * gegen `.ant-table-thead` (`docs/design/README.md`: das kostete eine
 * Spezifitätserhöhung UND eine Kopplung an einen antd-internen Klassennamen,
 * die ein Major still bricht).
 *
 * ⚠️ NUR ZEICHENKETTEN WERDEN EINGEWICKELT. Ein `title`, der schon ein ReactNode
 * ist, kommt unverändert durch — sonst läge der Kicker doppelt und die Laufweite
 * verdoppelte sich. Für den Aufrufer heißt das: `title: "Artikel"` genügt, und
 * die Regel gilt mechanisch statt aus Disziplin.
 */
function mitKicker<T>(spalten: TableProps<T>["columns"]): TableProps<T>["columns"] {
  if (!spalten) return spalten;
  return spalten.map((spalte) => {
    if (typeof spalte.title !== "string") return spalte;
    return {
      ...spalte,
      // `data-rolle` ist der GRIFF FUER PLAYWRIGHT. Ohne ihn muss ein Test die
      // Kicker-Rolle ueber `columnheader → span` suchen, und das ist mehrdeutig,
      // sobald die Spalte einen Sortierer oder Filter traegt: antd legt dann
      // `.ant-table-column-title` und die Pfeil-Spans daneben, und der Test
      // reisst mit „strict mode violation" an einer Stelle, die mit dem
      // geprueften Stil nichts zu tun hat (gemessen in CI-Lauf 34896110367,
      // `e2e/suite-audit.spec.ts`).
      title: (
        <span data-rolle="spaltenkopf" style={SCHRIFT.kicker}>{spalte.title}</span>
      ),
    };
  });
}

export function Datentabelle<T extends object>({
  virtuell = false,
  virtuellAbZeilen,
  blaettern = false,
  columns,
  scroll,
  ...rest
}: DatentabelleProps<T>) {
  const spalten = useMemo(() => mitKicker(columns), [columns]);

  /**
   * ⚠️ DIE AUSWAHLSPALTE STEHT NICHT IN `columns`. antd fügt sie aus
   * `rowSelection` selbst hinzu; ohne ihre Breite wäre die gerechnete
   * Gesamtbreite um genau diese Spalte zu schmal und die letzte echte Spalte
   * geriete unter den waagerechten Rand. 32px ist antds eigene Vorgabe
   * (`ant-table-selection-column`), überschreibbar über
   * `rowSelection.columnWidth`.
   */
  const auswahlBreite = useMemo(() => {
    const auswahl = rest.rowSelection;
    if (!auswahl) return 0;
    return typeof auswahl.columnWidth === "number" ? auswahl.columnWidth : 32;
  }, [rest.rowSelection]);

  const zeilenAnzahl = rest.dataSource?.length ?? 0;

  const masse = useMemo(
    () => scrollMasse(
      columns as readonly MassSpalte[] | undefined,
      virtuell,
      scroll,
      auswahlBreite,
      { anzahl: zeilenAnzahl, ab: virtuellAbZeilen },
    ),
    [columns, virtuell, scroll, auswahlBreite, zeilenAnzahl, virtuellAbZeilen],
  );

  // Kein Wurf: eine Tabelle, die gewöhnlich scrollt, ist langsam — eine, die auf
  // ein Pixel zusammenfällt, ist kaputt. Laut ist besser als still, aber nicht
  // um den Preis einer weißen Seite.
  useEffect(() => {
    if (masse.hinweis && process.env.NODE_ENV !== "production") {
      console.warn(`[Datentabelle] ${masse.hinweis}`);
    }
  }, [masse.hinweis]);

  return (
    <Table<T>
      {...rest}
      columns={spalten}
      pagination={blaettern}
      scroll={masse.scroll}
      virtual={masse.virtuellAktiv}
    />
  );
}
