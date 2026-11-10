"use client";

import { useState, useTransition, type CSSProperties, type ReactNode } from "react";
import { Button, Popconfirm, type TableProps } from "antd";
import { Kartentabelle, type Filterwert, Zellentext } from "@/core/tabelle";
import { kontrolleStornieren } from "../../../../_actions/bz";
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
  /**
   * IDA-379 — „storniert 07.08. 10:00 · Name", sonst `null`. Die Zeile bleibt
   * sichtbar und wird durchgestrichen; sie zaehlt nirgends mehr.
   */
  storniertText: string | null;
};

const STORNO_FEHLER = "Kontrolle konnte nicht storniert werden.";

/** Durchgestrichen statt ausgeblendet: der Nachweis bleibt lesbar. */
const DURCH: CSSProperties = { textDecoration: "line-through" };

function durch(zeile: BzLogbuchAnzeigeZeile, inhalt: ReactNode): ReactNode {
  return zeile.storniertText === null ? inhalt : <span style={DURCH}>{inhalt}</span>;
}

/**
 * IDA-379 — DER STORNO EINER ZEILE. Kein `danger` (Falle 3: Rot ist in diesem
 * Modul fachlich belegt); die Rueckfrage nennt die Folge. Die Tabelle laedt
 * ueber die Revalidierung der Action neu.
 */
function StornoKnopf({ id, zeitpunkt }: { id: string; zeitpunkt: string }) {
  const [laeuft, startTransition] = useTransition();
  const [fehler, setFehler] = useState<string | null>(null);

  function stornieren(): Promise<void> {
    setFehler(null);
    return new Promise<void>((fertig) => {
      startTransition(async () => {
        try {
          const ergebnis = await kontrolleStornieren({ kontrolleId: id });
          if (!ergebnis.ok) setFehler(ergebnis.fehler);
        } catch {
          setFehler(STORNO_FEHLER);
        }
        fertig();
      });
    });
  }

  return (
    <span style={{ display: "inline-grid", gap: 4 }}>
      <Popconfirm
        title="Kontrolle stornieren?"
        description="Sie zählt danach nicht mehr für die Fälligkeit."
        okText="Stornieren"
        cancelText="Abbrechen"
        onConfirm={stornieren}
      >
        <Button loading={laeuft} aria-label={`Kontrolle vom ${zeitpunkt} stornieren`}>
          Stornieren
        </Button>
      </Popconfirm>
      {fehler ? <span role="alert" style={SCHRIFT.neben}>{fehler}</span> : null}
    </span>
  );
}

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
    render: (text: string, zeile) => durch(zeile, <span className={s.jts}>{text}</span>),
  },
  {
    title: "Ergebnis",
    dataIndex: "ergebnisText",
    key: "ergebnis",
    filters: [
      { text: "bestanden", value: "bestanden" },
      { text: "nicht bestanden", value: "nicht bestanden" },
      { text: "storniert", value: "storniert" },
    ],
    // IDA-379: eine stornierte Zeile ist weder bestanden noch nicht bestanden.
    onFilter: (wert: Filterwert, zeile: BzLogbuchAnzeigeZeile) => (
      wert === "storniert"
        ? zeile.storniertText !== null
        : zeile.storniertText === null && zeile.ergebnisText === wert
    ),
    render: (text: string, zeile) => (
      zeile.storniertText === null
        ? <Chip ton={zeile.ergebnisTon}>{text}</Chip>
        : (
          <span style={{ whiteSpace: "nowrap" }}>
            <Chip ton="grau">storniert</Chip>
            {/* 6: derselbe enge Abstand wie neben den Level-Chips. */}
            <span style={{ ...SCHRIFT.neben, ...DURCH, marginInlineStart: 6 }}>{text}</span>
          </span>
        )
    ),
  },
  {
    title: "Aktion",
    dataIndex: "id",
    key: "aktion",
    render: (id: string, zeile) => (
      zeile.storniertText === null
        ? <StornoKnopf id={id} zeitpunkt={zeile.zeitpunktText} />
        : <span style={SCHRIFT.neben}>—</span>
    ),
  },
  {
    title: "Level 1",
    dataIndex: "level1Wert",
    key: "level1",
    render: (_wert: number | null, zeile) => durch(zeile, levelZelle({
      bezeichnung: "L1",
      wert: zeile.level1Wert,
      ton: zeile.level1Ton,
      min: zeile.level1MinDamals,
      max: zeile.level1MaxDamals,
    })),
  },
  {
    title: "Level 2",
    dataIndex: "level2Wert",
    key: "level2",
    render: (_wert: number | null, zeile) => durch(zeile, levelZelle({
      bezeichnung: "L2",
      wert: zeile.level2Wert,
      ton: zeile.level2Ton,
      min: zeile.level2MinDamals,
      max: zeile.level2MaxDamals,
    })),
  },
  {
    title: "Verbrauch",
    dataIndex: "verbrauchText",
    key: "verbrauch",
    render: (text: string, zeile) => durch(zeile, <span style={SCHRIFT.neben}>{text}</span>),
  },
  {
    title: "Akku",
    dataIndex: "akkuText",
    key: "akku",
    render: (text: BzLogbuchAnzeigeZeile["akkuText"], zeile) => durch(zeile, (
      zeile.akkuTon
        ? <Chip ton={zeile.akkuTon} zeichen="akku">{text}</Chip>
        : <span style={SCHRIFT.neben}>{text}</span>
    )),
  },
  {
    title: "Wer",
    dataIndex: "werText",
    key: "wer",
    render: (text: string, zeile) => (
      zeile.storniertText === null
        ? <Chip ton="grau">{text}</Chip>
        : (
          // IDA-379: wer storniert hat, steht neben dem, der erfasst hat.
          <span style={{ display: "inline-grid", gap: 4, justifyItems: "start" }}>
            <Chip ton="grau">{text}</Chip>
            <span style={SCHRIFT.neben}>{zeile.storniertText}</span>
          </span>
        )
    ),
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
    render: (text: string | null, zeile) => (
      text === null
        ? <span style={SCHRIFT.neben}>—</span>
        : durch(zeile, <Zellentext text={text} />)
    ),
  },
] satisfies TableProps<BzLogbuchAnzeigeZeile>["columns"];

export function BzLogbuchTabelle({ zeilen }: { zeilen: BzLogbuchAnzeigeZeile[] }) {
  return (
    <Kartentabelle<BzLogbuchAnzeigeZeile>
      rowKey="id"
      aria-label="Logbuch der Kontrollen"
      leer={{
        nichts: "Für dieses Gerät wurde noch keine Kontrolle erfasst.",
        gefiltert: "Keine Kontrolle passt zum Filter.",
      }}
      dataSource={zeilen}
      columns={LOGBUCH_SPALTEN}
    />
  );
}
