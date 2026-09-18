"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { Button, type TableProps } from "antd";
import {
  Datentabelle,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  type Filterwert,
  type FilterZustand,
} from "@/core/tabelle";
import { ampelTon, fmtVerfall } from "../../../_lib/format";
import { inventurTrifft, type InventurFilter } from "../../../_lib/inventurFilter";
import { ZAEHLORT_ALLE, ZAEHLORT_PARAM, type ZaehlOrt } from "../../../_lib/inventurOrt";
import { kategorieOptionen } from "../../../_lib/kategorie";
import type { InventurZeile } from "../../../_lib/lesepfade/inventur";
import { SCHRIFT } from "../../../_lib/schrift";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { useUrlFilter } from "../../../_ui/useUrlFilter";
import s from "../../../_ui/verwaltung.module.css";
import { Abschlussleiste } from "./Abschlussleiste";
import { AbweichungsZelle, ChargenZelle, IstZelle } from "./InventurZellen";
import { Zaehlleiste } from "./Zaehlleiste";
import { erzeugeZaehlspeicher } from "./zaehlspeicher";

/**
 * KATEGORIE UND FACH FILTERN IM SPALTENKOPF, UND ZWAR MIT DERSELBEN FUNKTION, DIE
 * ALLES ANDERE FRAGT (DRK-333).
 *
 * ⚠️ DAS IST DER PUNKT, AN DEM ZWEI PRAEDIKATE AUSEINANDERLAUFEN WUERDEN. antds
 * `onFilter` entscheidet, was in der Tabelle steht; `inventurTrifft` entscheidet,
 * was als „ausgeblendet, wird trotzdem gebucht" gezaehlt wird und was als Umfang
 * in den append-only Verlauf geht. Schriebe man beides einzeln hin, zeigte die
 * Tabelle eines Tages etwas anderes, als der Hinweis daneben behauptet — und der
 * Verlauf traege einen Umfang, der nie auf dem Schirm stand. Deshalb delegieren
 * die zwei `onFilter` hierher.
 *
 * ⚠️ UND DIE VERKNUEPFUNG STIMMT DAMIT AUCH: antd ruft `onFilter` je angekreuztem
 * Wert EINER Spalte einzeln und verodert (`useFilter/index.js`, `realKeys.some`),
 * verschiedene Spalten schneidet es — genau das tut `inventurTrifft` mit seinem
 * `includes` je Merkmal und den zwei Pruefungen nacheinander.
 */
function trifftKategorie(zeile: InventurZeile, wert: Filterwert): boolean {
  return inventurTrifft(zeile, { kategorien: [String(wert)], faecher: [] });
}

export function InventurForm({ zeilen, ortId, orte }: {
  zeilen: InventurZeile[];
  /** `null` = ganzer Handlager. Kommt aus der URL, nicht aus dieser Insel. */
  ortId: string | null;
  orte: ZaehlOrt[];
}) {
  /**
   * DRK-421 — DER ZAEHLSTAND LIEGT NEBEN REACT, NICHT IN DIESEM BAUTEIL. Die
   * Begruendung mitsamt Messung steht im Kopf von `zaehlspeicher.ts`; kurz:
   * dieses Bauteil rendert die Tabelle, und was die Tabelle nichts angeht, darf
   * es nicht wecken. `useState` mit Erzeuger-Funktion ist der Weg zu genau
   * EINEM Speicher je Einstieg der Insel — ein `const` im Modul waere ein
   * Speicher fuer alle Zaehlorte gleichzeitig.
   */
  const [speicher] = useState(erzeugeZaehlspeicher);
  /**
   * ⚠️ GEMERKT WIRD DER ZUSTAND DER SPALTENKOEPFE, NIE DIE LISTE DARAUS (Falle 15).
   * `onChange` feuert nur bei Bedienung DER TABELLE; laedt die Seite daneben einen
   * neuen Serverstand, filtert antd zwar korrekt neu, meldet es aber nicht. Der
   * Hinweis „N Positionen sind ausgeblendet" und der Umfang im Verlauf haengen an
   * dieser Zahl — ein gemerkter Stand waere dort still veraltet.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});
  /**
   * Zwei Sperren, EINE Bedeutung fuer alles Bedienbare. `absendet` meldet die
   * Abschlussleiste herauf (dort liegt die Transition, weil dort der Kommentar
   * liegt), `wechseltOrt` entsteht hier.
   */
  const [absendet, setAbsendet] = useState(false);
  /**
   * DRK-337, P1-Befund von Codex — DER WETTLAUF ZWISCHEN AUSWAHL UND SERVER.
   *
   * `router.replace` STOESST die Navigation nur an. Bis die neue RSC-Antwort da
   * ist, steht hier weiter der ALTE Ort, stehen die alten Erwartungszahlen, und
   * `key` in `page.tsx` hat die Insel noch nicht neu aufgesetzt. Ohne diesen
   * Riegel koennte in genau diesem Fenster jemand einen Kommentar tippen, eine
   * Menge erfassen und abschicken — gebucht wuerde gegen den Schrank, den er
   * gerade verlassen hat. Dieselbe Fehlbuchung, gegen die das ganze Ticket
   * antritt, nur durch eine langsame Leitung statt durch einen Denkfehler.
   *
   * `useTransition` um `router.replace` ist der vorgesehene Weg: `isPending`
   * bleibt wahr, BIS die Navigation uebernommen hat.
   *
   * ⚠️ DAS ZEITFENSTER SELBST SIEHT KEIN VITEST-FALL, und das ist keine Luecke,
   * sondern eine Eigenschaft der Umgebung: der Router ist dort gemockt und
   * kehrt SYNCHRON zurueck, die Transition ist also beendet, bevor eine
   * Zusicherung greifen koennte. Oeffnen laesst sich das Fenster nur durch eine
   * echte, langsame Navigation. Geprueft ist deshalb die VERDRAHTUNG (der
   * Wechsel laeuft ueber diese Transition), nicht die Dauer.
   */
  const [wechseltOrt, startOrtswechsel] = useTransition();
  /** Alles, was den Zaehlstand oder die Buchung anfasst, haengt an DIESEM Wert. */
  const laeuft = absendet || wechseltOrt;
  const setzeUrl = useUrlFilter();

  const kategorien = useMemo(() => kategorieOptionen(zeilen.map((z) => z.kategorie)), [zeilen]);
  // Die Kategorien stehen als GEFALTETE Schluessel im Filter (so vergibt sie
  // `kategorieOptionen`); das Label kommt erst beim Absenden dazu.
  const kategorieLabels = useMemo(
    () => new Map(kategorien.map((o) => [o.schluessel, o.label])),
    [kategorien],
  );

  /**
   * Der fachliche Filter, ABGELEITET aus dem Spaltenzustand — eine Quelle, aus der
   * der Ausgeblendet-Hinweis, die Trefferanzeige und der Umfang der Buchung folgen.
   */
  const filter = useMemo<InventurFilter>(() => ({
    kategorien: (spaltenFilter.kategorie ?? []).map(String),
    faecher: (spaltenFilter.fach ?? []).map(String),
  }), [spaltenFilter]);

  const sichtbar = useMemo(
    () => zeilen.filter((zeile) => inventurTrifft(zeile, filter)),
    [zeilen, filter],
  );

  const ortText = ortId === null ? "im Handlager" : "an diesem Zählort";

  /**
   * ⚠️ `useMemo` IST HIER KEINE MIKRO-OPTIMIERUNG, SONDERN DIE HALBE LOESUNG
   * (DRK-421). `Datentabelle` haengt drei Rechnungen an die Identitaet von
   * `columns` — den Spaltenkopf-Kicker, die Scrollmasse und `angezeigteAnzahl`,
   * das ueber alle Zeilen mal alle Spalten laeuft. Ein Literal im Rumpf ist bei
   * JEDEM Rendern ein neues Objekt; dann rechnet sie alle drei neu und antd
   * rendert jede Zelle nach. Die Abhaengigkeiten unten sind deshalb bewusst
   * KLEIN gehalten: alles, was sich beim Zaehlen aendert, steht in den Zellen
   * (`InventurZellen.tsx`) und nicht hier.
   */
  const spalten = useMemo<TableProps<InventurZeile>["columns"]>(() => [
    {
      title: "Artikel",
      dataIndex: "name",
      sorter: nachText<InventurZeile>((zeile) => zeile.name),
      render: (wert: string) => <span style={{ fontWeight: 600 }}>{wert}</span>,
    },
    {
      title: "Kategorie",
      dataIndex: "kategorie",
      /*
       * DIE SPALTE IST MIT DEM FILTER GEKOMMEN (DRK-333) — ein Filter gehoert in
       * den Kopf der Spalte, die er betrifft, und eine Kategorie, nach der man
       * filtern kann, muss man auch lesen koennen.
       *
       * ⚠️ DIE WERTE SIND GEFALTETE SCHLUESSEL, DIE BESCHRIFTUNG IST DIE
       * HAEUFIGSTE SCHREIBWEISE (`kategorieOptionen`, DRK-294) — nicht
       * `werteAlsFilter`, das die Rohwerte nimmt und „Hygiene" von „hygiene"
       * als zwei Optionen anboete. ⛔ UND KEIN „ohne Kategorie": ein Artikel
       * ohne Kategorie erscheint nur OHNE Kategorienfilter, das ist die
       * Entscheidung aus DRK-299 (`_lib/inventurFilter.ts`) und bleibt.
       */
      filters: kategorien.map((o) => ({ text: o.label, value: o.schluessel })),
      onFilter: (wert: Filterwert, zeile: InventurZeile) => trifftKategorie(zeile, wert),
      render: (wert: string | null) => wert ?? "—",
    },
    {
      title: "Fach",
      dataIndex: "fach",
      sorter: nachText<InventurZeile>((zeile) => zeile.fach),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.fach),
      onFilter: trifftWert<InventurZeile>((zeile) => zeile.fach),
      render: (wert: string) => <span className={s.fach}>{wert}</span>,
    },
    {
      title: "MHD",
      dataIndex: "chargen",
      // `chargen[0]` ist FEFO-naechste Handlager-Charge. `2099-12` („ohne
      // Verfall") zeigt wie die Artikelliste schlicht `fmtVerfall` — dort
      // gibt es keinen Sonderfall, hier auch nicht.
      render: (_wert: unknown, zeile) => {
        const naechste = zeile.chargen[0];
        return naechste
          ? <Chip ton={ampelTon(naechste.ampel)}>{fmtVerfall(naechste.verfall)}</Chip>
          : "—";
      },
    },
    {
      title: "Min.",
      dataIndex: "mindestbestand",
      align: "right",
      render: (wert: number) => <span style={SCHRIFT.mono}>{wert}</span>,
    },
    {
      title: "Bestand",
      dataIndex: "bestand",
      align: "right",
      // Gezeigt wird „3 Stk", sortiert wird ueber die nackte Zahl.
      sorter: nachZahl<InventurZeile>((zeile) => zeile.bestand),
      render: (wert: number, zeile) => (
        <span style={SCHRIFT.mono}>{wert} {zeile.einheit}</span>
      ),
    },
    /*
     * ⚠️ KEINE SORTIERUNG AUF „Abweichung" UND „Ist": beide lesen den
     * Zaehlstand DIESER Sitzung. Eine Spalte, die sich waehrend des Zaehlens
     * selbst umsortiert, verliert die Zeile unter dem Finger. ⛔ AUS DEMSELBEN
     * GRUND HAT DIE KATEGORIE-SPALTE KEINEN SORTIERER, obwohl ihr Wert statisch
     * waere: DRK-333 brachte hier einen FILTER, keine zweite Ordnung.
     */
    {
      title: "Abweichung",
      dataIndex: "id",
      render: (_wert: string, zeile) => <AbweichungsZelle zeile={zeile} speicher={speicher} />,
    },
    {
      title: "Ist",
      dataIndex: "id",
      align: "right",
      render: (_wert: string, zeile) => (
        <IstZelle zeile={zeile} speicher={speicher} gesperrt={laeuft} />
      ),
    },
  ], [kategorien, zeilen, speicher, laeuft]);

  const aufklappbar = useMemo<TableProps<InventurZeile>["expandable"]>(() => ({
    // Spec §B: JEDE Zeile ist aufklappbar — auch ohne Charge, dort bleibt die
    // Ergaenzen-Zeile. Deshalb kein `rowExpandable`.
    expandedRowRender: (zeile: InventurZeile) => (
      <ChargenZelle zeile={zeile} speicher={speicher} gesperrt={laeuft} ortText={ortText} />
    ),
    // antds Standard-Aufklappknopf misst ~17px und unterschreitet die
    // Arbeitsdichte (Falle 4). Ein `Button` OHNE `size` traegt die 44px.
    expandIcon: ({ expanded, onExpand, record }) => (
      <Button
        aria-label={expanded ? `Chargen ${record.name} ausblenden` : `Chargen ${record.name} anzeigen`}
        aria-expanded={expanded}
        onClick={(e) => onExpand(record, e)}
        icon={<Ikone name={expanded ? "zuklappen" : "aufklappen"} groesse={14} />}
      />
    ),
  }), [speicher, laeuft, ortText]);

  const leertext = useMemo(() => ({
    // Punkt 5 der Pruefliste: der Leertext nennt den naechsten Schritt.
    emptyText: zeilen.length === 0
      ? "Keine Artikel vorhanden. Lege sie zuerst unter Artikel & Bestand an."
      : "Kein Artikel passt zum Filter.",
  }), [zeilen.length]);

  const ortWechseln = useCallback((wert: string) => {
    startOrtswechsel(() => {
      setzeUrl({ [ZAEHLORT_PARAM]: wert === ZAEHLORT_ALLE ? "" : wert });
    });
  }, [setzeUrl]);

  return (
    <>
      <Zaehlleiste
        ortId={ortId}
        orte={orte}
        speicher={speicher}
        laeuft={laeuft}
        onOrtWechsel={ortWechseln}
        gezeigt={sichtbar.length}
        gesamt={zeilen.length}
      />
      <Datentabelle<InventurZeile>
        rowKey="id"
        aria-label="Inventur"
        dataSource={zeilen}
        onChange={(_seite, spaltenZustand) => setSpaltenFilter(spaltenZustand)}
        expandable={aufklappbar}
        locale={leertext}
        // Den Spaltenkopf-Kicker setzt `Datentabelle` selbst, sobald `title`
        // eine Zeichenkette ist (docs/design/README.md).
        columns={spalten}
      />
      <Abschlussleiste
        zeilen={zeilen}
        speicher={speicher}
        filter={filter}
        kategorieLabels={kategorieLabels}
        ortId={ortId}
        gesperrt={wechseltOrt}
        onAbsenden={setAbsendet}
      />
    </>
  );
}
