"use client";

import type { TableProps } from "antd";
import { Datentabelle, type Filterwert, Zellentext } from "@/core/tabelle";
import type { AmpelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import s from "../../../../_ui/verwaltung.module.css";

/** Vollständig serialisierbarer Vertrag zwischen BZ-Serverseite und Client-Tabelle. */
export type BzLogbuchAnzeigeZeile = {
  id: string;
  zeitpunktText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  zeitpunktIso: string;
  ergebnisText: string;
  ergebnisTon: "ok" | "rot";
  level1Wert: number | null;
  level1Ton: AmpelTon | null;
  level1MinDamals: number | "?";
  level1MaxDamals: number | "?";
  level2Wert: number | null;
  level2Ton: AmpelTon | null;
  level2MinDamals: number | "?";
  level2MaxDamals: number | "?";
  verbrauchText: string;
  akkuText: "gewechselt" | "—";
  akkuTon: "gelb" | null;
  werText: string;
  kommentarText: string | null;
};

function levelZelle({
  bezeichnung,
  wert,
  ton,
  min,
  max,
}: {
  bezeichnung: "L1" | "L2";
  wert: number | null;
  ton: AmpelTon | null;
  min: number | "?";
  max: number | "?";
}) {
  if (wert === null) return <span style={SCHRIFT.neben}>—</span>;
  return (
    <span style={{ whiteSpace: "nowrap" }}>
      <Chip ton={ton ?? "gelb"}>{bezeichnung} {wert}</Chip>
      {/* 6 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) -- enger Abstand
          zwischen Chip und Klammerzusatz in derselben Zelle, kein
          Skalenwert ohne sichtbaren Sprung. */}
      <span style={{ ...SCHRIFT.neben, marginInlineStart: 6 }}>
        (damals {min}–{max})
      </span>
    </span>
  );
}

/**
 * ⛔ KEIN SORTIERER IN DIESER TABELLE — SIE HAELT EINEN AUSSCHNITT.
 *
 * Der Lesepfad deckelt auf `BZ_LOGBUCH_GRENZE` (`lesepfade/bz.ts`) und liefert
 * die juengsten Eintraege zuerst (`orderBy(desc(ts), desc(id))`). Ein
 * Vergleicher im Spaltenkopf verspricht dagegen ein EXTREM — „Level 1
 * aufsteigend" heisst „der niedrigste gemessene Wert steht oben" —, und das
 * kann eine gedeckelte Liste genau dann nicht halten, wenn der Deckel greift:
 * der wirklich niedrigste Wert liegt dann ausserhalb. Bei einem Messwert ist
 * das keine Kleinigkeit, man sucht solche Ausreisser ja gerade.
 *
 * Volle Begruendung: `core/tabelle/sortierer.ts` (DRK-331, fuenfte
 * Reviewrunde). Die Ordnung ist damit fest die der Abfrage.
 */
const LOGBUCH_SPALTEN = [
  {
    title: "Zeitpunkt",
    dataIndex: "zeitpunktText",
    key: "zeitpunkt",
    defaultSortOrder: "descend" as const,
    render: (text: string) => <span className={s.jts}>{text}</span>,
  },
  {
    title: "Ergebnis",
    dataIndex: "ergebnisText",
    key: "ergebnis",
    filters: [
      { text: "bestanden", value: "bestanden" },
      { text: "nicht bestanden", value: "nicht bestanden" },
    ],
    onFilter: (wert: Filterwert, zeile: BzLogbuchAnzeigeZeile) =>
      zeile.ergebnisText === wert,
    render: (text: string, zeile) => <Chip ton={zeile.ergebnisTon}>{text}</Chip>,
  },
  {
    title: "Level 1",
    dataIndex: "level1Wert",
    key: "level1",
    render: (_wert: number | null, zeile) => levelZelle({
      bezeichnung: "L1",
      wert: zeile.level1Wert,
      ton: zeile.level1Ton,
      min: zeile.level1MinDamals,
      max: zeile.level1MaxDamals,
    }),
  },
  {
    title: "Level 2",
    dataIndex: "level2Wert",
    key: "level2",
    render: (_wert: number | null, zeile) => levelZelle({
      bezeichnung: "L2",
      wert: zeile.level2Wert,
      ton: zeile.level2Ton,
      min: zeile.level2MinDamals,
      max: zeile.level2MaxDamals,
    }),
  },
  {
    title: "Verbrauch",
    dataIndex: "verbrauchText",
    key: "verbrauch",
    render: (text: string) => <span style={SCHRIFT.neben}>{text}</span>,
  },
  {
    title: "Akku",
    dataIndex: "akkuText",
    key: "akku",
    render: (text: BzLogbuchAnzeigeZeile["akkuText"], zeile) => (
      zeile.akkuTon
        ? <Chip ton={zeile.akkuTon} zeichen="akku">{text}</Chip>
        : <span style={SCHRIFT.neben}>{text}</span>
    ),
  },
  {
    title: "Wer",
    dataIndex: "werText",
    key: "wer",
    render: (text: string) => <Chip ton="grau">{text}</Chip>,
  },
  {
    /*
     * ⚠️ DER KOMMENTAR BRAUCHT EINE BREITE (DRK-372). Er ist ein Nachweisfeld
     * ohne Laengengrenze (`bz_kontrollen.kommentar`, kein `max` auf dem
     * Schreibpfad), die Tabelle faehrt `scroll.x: "max-content"` — EIN langer
     * Satz aus dem Altbestand macht sie beliebig breit. Das Symptom fuehrt in
     * die Irre: die Zeile sieht richtig aus, sie steht nur sehr weit rechts.
     *
     * ⚠️ OHNE `zeilen`, ANDERS ALS IN DER GERAETELISTE. Dieses Logbuch IST die
     * Stelle, an der der volle Text ungekuerzt lesbar sein muss — die Liste
     * unter `/verwaltung/bz` kuerzt ihre Bemerkung ausdruecklich auf DIESE
     * Flaeche hin. Eine Hoehendeckelung hier naehme der Suite den einzigen Ort,
     * an dem der Nachweis vollstaendig zu LESEN ist (`title` braucht einen
     * Zeiger und hilft auf dem Telefon nicht).
     */
    title: "Kommentar",
    dataIndex: "kommentarText",
    key: "kommentar",
    render: (text: string | null) => (
      text === null
        ? <span style={SCHRIFT.neben}>—</span>
        : <Zellentext text={text} />
    ),
  },
] satisfies TableProps<BzLogbuchAnzeigeZeile>["columns"];

export function BzLogbuchTabelle({ zeilen }: { zeilen: BzLogbuchAnzeigeZeile[] }) {
  return (
    <Datentabelle<BzLogbuchAnzeigeZeile>
      rowKey="id"
      aria-label="Logbuch der Kontrollen"
      locale={{ emptyText: "Für dieses Gerät wurde noch keine Kontrolle erfasst." }}
      dataSource={zeilen}
      columns={LOGBUCH_SPALTEN}
    />
  );
}
