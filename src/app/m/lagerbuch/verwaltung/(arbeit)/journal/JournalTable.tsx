"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Alert, Button, Flex, Spin, type TableProps } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { Datentabelle } from "@/core/tabelle";
import { naechsteJournalSeite } from "../../../_actions/journal";
import { journalZeile } from "../../../_lib/journalZeile";
import type { Vorgangsart } from "../../../_lib/vorgang";
import { standortZeile } from "../../../_lib/konstanten";
import type { JournalZeileDTO } from "../../../_lib/journalDTO";
// ⚠️ Aus `journalFilterLogik`, NICHT aus `JournalFilter` — letzteres ist eine
// Client-Komponente, die den Wert nur re-exportiert. Der Umweg ginge hier zwar
// (beide Seiten sind Client), aber `page.tsx` liest denselben Modulpfad als
// Server Component, und zwei Wege zu einem Wert laden zu Falle 6 ein.
import { deckelText } from "./journalFilterLogik";
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
  typ: string;
  quelleName: string;
  /** Der rohe Code/die rohe Kennung, NUR fuer den `title` des Chips (Ruling A15). */
  quelleId: string;
  /** DRK-338 — der Lagerort dieser Zeile. Bei einer Umlagerung steht die QUELLE
   *  in der Zeile mit dem Minus und das ZIEL in der mit dem Plus; anders ist
   *  eine Umlagerung nicht zu lesen.
   *
   *  ⚠️ DRK-309: die VOLLE Zeile „Name · Art", gebaut in `anzeigeZeile`. Das
   *  Journal beantwortet „wo ist das hingegangen?" — bei zwei gleichnamigen
   *  Einheiten beantwortet ein blosser Name sie nicht, und hier steht die
   *  Antwort in einem append-only Buch, das man spaeter liest, ohne die Liste
   *  daneben zu haben. */
  ortName: string;
};

/** Die Cursor-Form, wie sie ueber die Server Action reist. */
export type JournalCursor = { ts: string; id: string };

/** Was die Seite an die Action weiterreicht, damit Nachschlaege denselben Filter fahren. */
export type JournalAbrufFilter = {
  q?: string;
  /** Die VORGANGSART (DRK-344) — vier Buchungstypen plus `aussondern` und
   *  `inventur`, beide aus der `referenz` abgeleitet. In der Adresszeile heisst
   *  derselbe Wert weiter `typ`; uebersetzt wird in `journalParameterAus`. */
  vorgang?: Vorgangsart;
  von?: string;
  bis?: string;
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
  // ⚠️ `referenz` GEHOERT MIT HINEIN (DRK-344): unter `korrektur` liegen
  // Aussonderung, Inventurdifferenz und Handkorrektur, und nur die Referenz
  // sagt welche. Die Pflichtangabe im Typ ist der Riegel dagegen, sie hier zu
  // vergessen — ohne sie stuende weiter „Korrektur", und zwar still.
  const darstellung = journalZeile({
    typ: zeile.typ,
    menge: zeile.menge,
    referenz: zeile.referenz,
  });
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
    ortName: standortZeile(zeile.ortStandort),
  };
}

/**
 * ⚠️ DIESE TABELLE SORTIERT UND FILTERT NICHT IN DEN SPALTENKOEPFEN — als
 * einzige des Moduls, und das ist eine Korrektur, keine Auslassung.
 *
 * Das Journal ist SERVERSEITIG GEBLAETTERT: geladen sind zunaechst die neuesten
 * 100 Zeilen, weitere kommen beim Scrollen ueber die Schluesselposition nach.
 * Ein clientseitiger Vergleicher sieht deshalb nur das GELADENE PRAEFIX. Wer
 * „Zeit aufsteigend" waehlte, bekaeme nicht die aelteste Buchung, sondern die
 * aelteste UNTER DEN NEUESTEN HUNDERT — eine Aussage ueber den ganzen Bestand,
 * die nur ueber einen Ausschnitt gilt. Dasselbe gilt fuer jede andere Spalte.
 *
 * ⚠️ EIN CLIENTSEITIGER FILTER WAERE HIER SOGAR GEFAEHRLICH. Bleiben nach dem
 * Filtern wenige oder keine Zeilen stehen, steht die Wache am Fussende weiter im
 * Bild; der Beobachter laedt die naechste Seite, die ebenfalls herausfaellt,
 * und wieder eine — bis das ganze Journal in 100er-Schritten durch ist. Jede
 * dieser Anfragen belegt den SYNCHRONEN SQLite-Pfad und blockiert damit die
 * ganze Suite. Genau die Grenze, gegen die der Deckel gebaut ist, waere damit
 * aufgehoben.
 *
 * GEFILTERT WIRD DESHALB UEBER DIE ABFRAGE, nicht ueber die geladenen Zeilen:
 * `JournalFilter` ueber der Tabelle schreibt Suche, Vorgang und Zeitraum in die
 * URL, die Seite laedt neu, und jeder Nachschlag faehrt denselben Filter mit.
 * Das trifft die GESAMTE Historie — ein Spaltenfilter koennte das nie.
 *
 * Die Ordnung ist damit fest: neueste zuerst (`ts DESC, id DESC`), dieselbe, in
 * der der Cursor blaettert.
 */
const SPALTEN: TableProps<JournalAnzeigeZeile>["columns"] = [
  {
    title: "Zeit",
    dataIndex: "zeitText",
    key: "zeit",
    render: (zeitText: string) => <span className={s.jts}>{zeitText}</span>,
  },
  {
    title: "Artikel",
    dataIndex: "artikelName",
    key: "artikel",
    render: (artikelName: string) => (
      <span style={{ fontWeight: 600 }}>{artikelName}</span>
    ),
  },
  { title: "Vorgang", dataIndex: "vorgangText", key: "vorgang" },
  /*
   * DRK-338 — DER ORT STEHT NEBEN DEM VORGANG UND NICHT IM VORGANGSTEXT.
   *
   * Eine Umlagerung schreibt zwei Zeilen desselben Typs mit entgegengesetztem
   * Vorzeichen; welche die Quelle ist und welche das Ziel, sagt allein diese
   * Spalte — zusammen mit dem Δ daneben. Sie in den Vorgangstext zu falten
   * („Umlagerung → GF-Schrank") waere die zweite Sorte Etikett, die
   * `_lib/vorgang.ts` ausdruecklich ablehnt: ein Ort gehoert in eine Spalte.
   *
   * Sie steht fuer JEDE Zeile da, nicht nur fuer Umlagerungen — ein Zugang, der
   * in Schrank 1 landet, und einer, der unsortiert an der Wurzel liegt, waren
   * im Journal bisher nicht zu unterscheiden.
   */
  /*
   * ⚠️ DER ORT WIRD BENANNT, NICHT NUR GENANNT (DRK-309, Reviewrunde 15).
   * Das Journal beantwortet „wo ist das hingegangen?"; bei zwei gleichnamigen
   * Einheiten beantwortet ein blosser Name sie nicht — und hier steht die
   * Antwort in einem append-only Buch, das man spaeter liest, ohne die Liste
   * daneben zu haben.
   */
  { title: "Ort", dataIndex: "ortName", key: "ort" },
  {
    title: "Δ",
    dataIndex: "deltaText",
    key: "delta",
    align: "right",
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
  /**
   * `JSON.stringify` STATT `join("|")` — VORSORGLICH, nicht als Fehlerbehebung.
   *
   * ⚠️ DIE EHRLICHE FASSUNG (DRK-331, fuenfte Reviewrunde): ein Review meldete
   * hier eine Trennzeichen-Kollision, weil `q` FREITEXT AUS DER URL ist und
   * jedes Zeichen enthalten darf. Nachgerechnet ist der genannte Fall NICHT
   * erreichbar — die Feldzahl ist fest, also disambiguieren die nachfolgenden
   * leeren Felder:
   *
   *   q="foo|zugang"          → "…|foo|zugang|||"   (drei Trenner am Ende)
   *   q="foo", typ="zugang"   → "…|foo|zugang||"    (zwei)
   *
   * Ein eingeschleuster Trenner ERHOEHT die Zahl der Abschnitte, und die
   * Gegenseite kann das nicht ausgleichen, solange `typ` ein Aufzaehlungswert
   * und `von`/`bis` ISO-Stempel sind.
   *
   * Die Kodierung bleibt trotzdem — sie kostet nichts und haengt nicht mehr an
   * dieser Argumentationskette. Wer hier ein Feld ERGAENZT oder eines auf
   * Freitext umstellt, muesste die Rechnung sonst neu fuehren und wuerde es
   * vergessen; kein Tor faende den Fehler, denn er sieht wie ein ausgebliebenes
   * Ruecksetzen aus.
   */
  const schluessel = JSON.stringify([
    ersteZeilen[0]?.id ?? null,
    ersterCursor?.ts ?? null,
    ersterCursor?.id ?? null,
    abrufFilter.q ?? null,
    abrufFilter.vorgang ?? null,
    abrufFilter.von ?? null,
    abrufFilter.bis ?? null,
  ]);

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
      {/*
        ⚠️ DIE ZAHL GEHOERT HIERHER, NICHT IN DEN SEITENKOPF (DRK-331, vierte
        Reviewrunde). Dort entstand sie serverseitig aus der ERSTEN Seite und
        blieb danach stehen: „100 Treffer geladen — weitere beim Scrollen" bei
        300 sichtbaren Zeilen, und derselbe Satz noch, wenn der Cursor laengst
        leer war. Hier liegt der Stand, also auch die Aussage darueber. Dass
        `mehrVorhanden` am Cursor haengt, ist kein Zufall: genau der entscheidet
        auch, ob die Wache unten noch etwas nachlaedt.
      */}
      <div style={{ ...SCHRIFT.neben, marginBlockEnd: SPACE.sm }} data-testid="journal-treffer">
        {deckelText(zeilen.length, cursor !== null)}
      </div>

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
