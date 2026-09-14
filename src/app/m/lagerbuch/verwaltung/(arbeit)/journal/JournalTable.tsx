"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Spin, type TableProps } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { Datentabelle, nachDatum, nachText, nachZahl } from "@/core/tabelle";
import { naechsteJournalSeite } from "../../../_actions/journal";
import { journalZeile } from "../../../_lib/journalZeile";
import type { BuchungTyp } from "../../../_lib/lesepfade/journal";
import type { JournalZeileDTO } from "../../../_lib/journalDTO";

import { SCHRIFT } from "../../../_lib/schrift";
import { fmtTs } from "../../../_lib/zeit";
import { Chip } from "../../../_ui/Chip";
import s from "../../../_ui/verwaltung.module.css";

export type JournalAnzeigeZeile = {
  id: string;
  zeitText: string;
  /** ISO-Zeitstempel — allein fuer die Sortierung, nie angezeigt. */
  zeitIso: string;
  artikelName: string;
  vorgangText: string;
  deltaText: string;
  /** Die Menge als Zahl — allein fuer die Sortierung, angezeigt wird `deltaText`. */
  deltaZahl: number;
  deltaTon: "negativ" | "positiv";
  typ: BuchungTyp;
  quelleName: string;
  /** Der rohe Code/die rohe Kennung, NUR fuer den `title` des Chips (Ruling A15). */
  quelleId: string;
};

/** Die Cursor-Form, wie sie ueber die Server Action reist. */
export type JournalCursor = { ts: string; id: string };

/** Was die Seite an die Action weiterreicht, damit Nachschlaege denselben Filter fahren. */
export type JournalAbrufFilter = {
  q?: string;
  typ?: BuchungTyp;
  von?: string;
  bis?: string;
};

const TYP_TEXT: Record<BuchungTyp, string> = {
  zugang: "Zugang",
  entnahme: "Entnahme",
  korrektur: "Korrektur",
  umlagerung: "Umlagerung",
};

/**
 * ⚠️ DIE AUFBEREITUNG LIEGT HIER, NICHT IN DER SEITE — und das ist der Punkt,
 * an dem sonst zwei Wahrheiten entstuenden. Die erste Seite kommt aus einer
 * Server Component, jede weitere aus einer Server Action; gaebe es zwei
 * Abbildungen, unterschieden sich nachgeladene Zeilen von den ersten hundert in
 * einer Kleinigkeit, die niemand sucht. Beide laufen deshalb durch DIESE
 * Funktion.
 */
export function anzeigeZeile(zeile: JournalZeileDTO): JournalAnzeigeZeile {
  const zeitpunkt = new Date(zeile.ts);
  const darstellung = journalZeile({ typ: zeile.typ, menge: zeile.menge });
  return {
    id: zeile.id,
    zeitText: fmtTs(zeitpunkt),
    zeitIso: zeile.ts,
    artikelName: zeile.artikelName,
    vorgangText: darstellung.typText + (zeile.kommentar ? ` · ${zeile.kommentar}` : ""),
    deltaText: darstellung.mengeText,
    deltaZahl: zeile.menge,
    deltaTon: darstellung.zustand === "negativ" ? "negativ" : "positiv",
    typ: zeile.typ,
    quelleName: zeile.quelleName,
    quelleId: zeile.quelleId,
  };
}

const SPALTEN: TableProps<JournalAnzeigeZeile>["columns"] = [
  {
    title: "Zeit",
    dataIndex: "zeitText",
    key: "zeit",
    // ⚠️ UEBER DAS ISO-FELD, nie ueber `zeitText`: „02.10. 08:00" sortierte als
    // Zeichenkette vor „14.09. 08:00".
    sorter: nachDatum<JournalAnzeigeZeile>((zeile) => zeile.zeitIso),
    defaultSortOrder: "descend",
    render: (zeitText: string) => <span className={s.jts}>{zeitText}</span>,
  },
  {
    title: "Artikel",
    dataIndex: "artikelName",
    key: "artikel",
    sorter: nachText<JournalAnzeigeZeile>((zeile) => zeile.artikelName),
    render: (artikelName: string) => (
      <span style={{ fontWeight: 600 }}>{artikelName}</span>
    ),
  },
  {
    title: "Vorgang",
    dataIndex: "vorgangText",
    key: "vorgang",
    /**
     * ⚠️ GEFILTERT WIRD UEBER `typ`, NICHT UEBER DEN TEXT. `vorgangText` traegt
     * den Kommentar mit („Entnahme · Nachgezaehlt") — eine Filterliste daraus
     * haette so viele Eintraege wie es Kommentare gibt.
     *
     * ⚠️ DIE LISTE IST FEST UND NICHT AUS DEN DATEN GEZOGEN. Beim Nachladen
     * waechst die Zeilenmenge; eine abgeleitete Liste bekaeme dann waehrend des
     * Scrollens neue Eintraege, und ein gesetzter Filter zeigte ploetzlich mehr.
     * Die vier Buchungsarten sind ohnehin abschliessend.
     */
    filters: (Object.keys(TYP_TEXT) as BuchungTyp[])
      .map((typ) => ({ text: TYP_TEXT[typ], value: typ })),
    onFilter: (wert, zeile) => zeile.typ === wert,
  },
  {
    title: "Δ",
    dataIndex: "deltaText",
    key: "delta",
    align: "right",
    sorter: nachZahl<JournalAnzeigeZeile>((zeile) => zeile.deltaZahl),
    render: (deltaText: string, zeile) => (
      <span
        className={`${s.jdelta} ${
          zeile.deltaTon === "negativ" ? s.jminus : s.jplus
        }`}
      >
        {deltaText}
      </span>
    ),
  },
  {
    title: "Quelle",
    dataIndex: "quelleName",
    key: "quelle",
    sorter: nachText<JournalAnzeigeZeile>((zeile) => zeile.quelleName),
    render: (quelleName: string, zeile) => (
      <Chip ton="grau" title={zeile.quelleId}>
        {quelleName}
      </Chip>
    ),
  },
];

/** Fester Satz statt `e.message` (§11.2 d). */
const NACHLADE_FEHLER = "Weitere Buchungen konnten nicht geladen werden.";

export function JournalTable({
  ersteZeilen,
  ersterCursor,
  abrufFilter,
  leertext,
}: {
  ersteZeilen: JournalZeileDTO[];
  ersterCursor: JournalCursor | null;
  abrufFilter: JournalAbrufFilter;
  leertext: string;
}) {
  const [laedt, setLaedt] = useState(false);
  const wache = useRef<HTMLDivElement>(null);

  /**
   * ⚠️ EIN FILTERWECHSEL SETZT DIE LISTE ZURUECK, und zwar vollstaendig. Der
   * Filter steht in der URL, die Seite rendert serverseitig neu und liefert eine
   * neue erste Seite — ohne diesen Abgleich blieben die nachgeladenen Zeilen des
   * ALTEN Filters darunter stehen.
   *
   * ⚠️ DER ABGLEICH LAEUFT IN DER RENDERPHASE, NICHT IN EINEM EFFEKT. Ein
   * `useEffect`, der beim Prop-Wechsel `setState` ruft, ist der Weg, den React
   * ausdruecklich nicht mehr empfiehlt („You Might Not Need an Effect") und den
   * der React-Compiler als Fehler meldet: er rendert erst einmal mit dem ALTEN
   * Stand, wirft das Ergebnis weg und rendert erneut — sichtbar als kurzes
   * Aufblitzen der Zeilen des vorigen Filters. Ein `setState` waehrend des
   * Renderns verwirft React dagegen sofort und startet neu, ohne je etwas
   * Falsches zu zeigen.
   *
   * Der Schluessel ist die Kennung der ersten Zeile plus die Schluesselposition
   * — nicht die Liste selbst: die ist bei jedem Rendern ein neues Feld.
   */
  /**
   * ⚠️ DER FILTER GEHOERT IN DEN SCHLUESSEL, nicht nur die erste Zeile. Ein
   * Filterwechsel, der die NEUESTE Seite unveraendert laesst, ergaebe sonst
   * denselben Schluessel — und die zuvor nachgeladenen AELTEREN Zeilen blieben
   * stehen, obwohl sie den neuen Filter verletzen. Beispiel: die neuesten 100
   * Buchungen sind ohnehin alle Zugaenge, und jemand filtert auf „Zugang";
   * erste Zeile und Schluesselposition sind identisch, die alten Entnahmen
   * darunter nicht.
   */
  const schluessel = [
    ersteZeilen[0]?.id ?? "",
    ersterCursor?.ts ?? "",
    ersterCursor?.id ?? "",
    abrufFilter.q ?? "",
    abrufFilter.typ ?? "",
    abrufFilter.von ?? "",
    abrufFilter.bis ?? "",
  ].join("|");

  const [stand, setStand] = useState(() => ({
    schluessel,
    zeilen: ersteZeilen.map(anzeigeZeile),
    cursor: ersterCursor,
    fehler: null as string | null,
  }));

  if (stand.schluessel !== schluessel) {
    setStand({
      schluessel,
      zeilen: ersteZeilen.map(anzeigeZeile),
      cursor: ersterCursor,
      fehler: null,
    });
  }

  const { zeilen, cursor, fehler } = stand;

  const mehrLaden = useCallback(async () => {
    if (!cursor || laedt) return;
    /**
     * ⚠️ DIE ANTWORT WIRD GEGEN DEN SCHLUESSEL GEPRUEFT, UNTER DEM SIE LOSGESCHICKT
     * WURDE. Wechselt jemand den Filter, waehrend ein Nachschlag unterwegs ist,
     * laeuft der Abgleich in der Renderphase zuerst — und die eintreffende
     * Antwort haengte danach die Zeilen des ALTEN Filters an den neuen Stand.
     * Die Liste zeigte dann Buchungen, die der gewaehlte Filter ausschliesst,
     * und blaetterte mit dem alten Cursor weiter durch die alte Treffermenge.
     *
     * Jede Zustandsaenderung prueft deshalb `vorher.schluessel`: gehoert die
     * Antwort zu einer anderen Generation, faellt sie still weg. Ein `ref`
     * waere hier falsch — er kennt den Stand NACH dem Rendern, dieser Vergleich
     * braucht den Stand, auf den geschrieben wird.
     */
    const generation = schluessel;
    setLaedt(true);
    setStand((vorher) => (
      vorher.schluessel === generation ? { ...vorher, fehler: null } : vorher
    ));
    try {
      const antwort = await naechsteJournalSeite({ ...abrufFilter, cursor });
      if (!antwort.ok) {
        setStand((vorher) => (
          vorher.schluessel === generation ? { ...vorher, fehler: antwort.fehler } : vorher
        ));
        return;
      }
      // ⚠️ ANHAENGEN, NICHT ERSETZEN — und doppelte Kennungen abfangen. Der
      // Cursor ist stabil, aber ein doppelter `rowKey` waere in React ein
      // stiller Renderfehler, und er kostet nur einen Set-Aufbau.
      setStand((vorher) => {
        if (vorher.schluessel !== generation) return vorher;
        const bekannt = new Set(vorher.zeilen.map((z) => z.id));
        const neue = antwort.zeilen.filter((z) => !bekannt.has(z.id)).map(anzeigeZeile);
        return {
          ...vorher,
          zeilen: neue.length > 0 ? [...vorher.zeilen, ...neue] : vorher.zeilen,
          cursor: antwort.cursor,
        };
      });
    } catch {
      setStand((vorher) => (
        vorher.schluessel === generation ? { ...vorher, fehler: NACHLADE_FEHLER } : vorher
      ));
    } finally {
      setLaedt(false);
    }
  }, [cursor, laedt, abrufFilter, schluessel]);

  /**
   * Der Beobachter am Fussende. Er ist absichtlich KEIN Scroll-Zuhoerer: ein
   * `scroll`-Ereignis feuert je Pixel und muesste selbst entprellt werden,
   * waehrend `IntersectionObserver` genau einmal meldet, wenn die Wache in Sicht
   * kommt — und das auch dann richtig, wenn der Bildschirm so hoch ist, dass die
   * erste Seite ihn nicht fuellt.
   *
   * ⚠️ NACH EINEM FEHLER LAEDT ER NICHT VON SELBST WEITER. Sonst liefe bei einem
   * abgerissenen Netz eine stille Endlosschleife gegen den Server; stattdessen
   * steht dann ein Knopf da.
   */
  useEffect(() => {
    const knoten = wache.current;
    if (!knoten || !cursor || fehler) return;
    if (typeof IntersectionObserver === "undefined") return;
    const beobachter = new IntersectionObserver((eintraege) => {
      if (eintraege.some((e) => e.isIntersecting)) void mehrLaden();
    }, { rootMargin: "200px" });
    beobachter.observe(knoten);
    return () => beobachter.disconnect();
  }, [cursor, fehler, mehrLaden]);

  return (
    <>
      <Datentabelle<JournalAnzeigeZeile>
        rowKey="id"
        aria-label="Buchungsjournal"
        dataSource={zeilen}
        locale={{ emptyText: leertext }}
        columns={SPALTEN}
      />

      {/*
        Die Wache steht UNTER der Tabelle, nicht in ihr: die Tabelle scrollt
        nicht selbst, die Seite tut es. Ein Beobachter innerhalb eines
        Tabellenkoerpers ohne eigene Hoehe meldete nie.
      */}
      <div ref={wache} data-testid="journal-wache" style={{ minHeight: 1 }} />

      {fehler ? (
        <Flex gap={SPACE.md} align="center" wrap style={{ marginBlockStart: SPACE.md }}>
          {/* `type="warning"` statt `type="error"`: Rot traegt in diesem Modul
              fachliche Bedeutung (CLAUDE.md, Falle 3). */}
          <Alert type="warning" showIcon={false} title={fehler} />
          <Button onClick={() => void mehrLaden()}>Erneut versuchen</Button>
        </Flex>
      ) : null}

      {laedt ? (
        <Flex justify="center" style={{ marginBlockStart: SPACE.md }}>
          <Spin size="small" />
        </Flex>
      ) : null}

      {!cursor && !fehler && zeilen.length > 0 ? (
        <Flex justify="center" style={{ marginBlockStart: SPACE.md }}>
          <span style={SCHRIFT.neben}>Keine weiteren Buchungen.</span>
        </Flex>
      ) : null}
    </>
  );
}
