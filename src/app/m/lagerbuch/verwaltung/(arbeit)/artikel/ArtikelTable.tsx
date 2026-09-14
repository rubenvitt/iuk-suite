"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Checkbox, Flex, Select, Table } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { setzeAusgeblendeteKategorien } from "../../../_actions/kategorien";
import {
  artikelFiltern,
  artikelTrifft,
  LEERER_FILTER,
  type ArtikelFilterZeile,
  type ArtikelFilterZustand,
} from "../../../_lib/artikelFilter";
import {
  bestandExportZeilen, bestandExportDateiname, type BestandExportZeile,
} from "../../../_lib/bestandExport";
import {
  EXCEL_SPALTEN, EXCEL_BLATTNAME, EXCEL_FEHLERTEXT,
} from "../../../_lib/bestandExportSpalten";
import type { Ampel } from "../../../_lib/domain/verfall";
import { ampelTon } from "../../../_lib/format";
import { kategorieOptionen } from "../../../_lib/kategorie";
import type { SammelZeile } from "../../../_lib/sammelAenderung";
import { SCHRIFT } from "../../../_lib/schrift";
import { ArtikelDrawer } from "../../../_ui/ArtikelDrawer";
import { Chip } from "../../../_ui/Chip";
import { Ikone } from "../../../_ui/ikonen";
import { Plakette } from "../../../_ui/Plakette";
import { SammelDrawer } from "../../../_ui/SammelDrawer";
import { Suchfeld } from "../../../_ui/Suchfeld";
import { Trefferanzeige } from "../../../_ui/Trefferanzeige";
import s from "../../../_ui/verwaltung.module.css";
import { NeuArtikel } from "./NeuArtikel";

export type ArtikelAnzeigeZeile = ArtikelFilterZeile & {
  id: string;
  einheit: string;
  mindestbestand: number;
  bestand: number;
  naechsteAmpel: Ampel | null;
  naechsteAblaufText: string | null;
};

type FahrzeugOption = {
  id: string;
  name: string;
  kennung: string | null;
};

export const SORTIERUNGEN = [
  { wert: "name-asc", label: "Name A–Z" },
  { wert: "name-desc", label: "Name Z–A" },
  { wert: "fach", label: "Fach" },
  { wert: "bestand-asc", label: "Bestand aufsteigend" },
  { wert: "bestand-desc", label: "Bestand absteigend" },
  { wert: "verfall", label: "Nächster Verfall" },
] as const;

export type ArtikelSortierung = (typeof SORTIERUNGEN)[number]["wert"];

/** Fester Satz statt `e.message` — derselbe Grund wie `EXCEL_FEHLERTEXT`. */
const KATEGORIEN_SPEICHERFEHLER =
  "Die Auswahl konnte nicht gespeichert werden – bitte erneut versuchen.";

function nameVergleichen(a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile): number {
  return a.name.localeCompare(b.name, "de") || a.id.localeCompare(b.id);
}

function artikelVergleichen(sortierung: ArtikelSortierung) {
  switch (sortierung) {
    case "name-desc":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        b.name.localeCompare(a.name, "de") || a.id.localeCompare(b.id)
      );
    case "fach":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        a.fach.localeCompare(b.fach, "de") || nameVergleichen(a, b)
      );
    case "bestand-asc":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        a.bestand - b.bestand || nameVergleichen(a, b)
      );
    case "bestand-desc":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => (
        b.bestand - a.bestand || nameVergleichen(a, b)
      );
    case "verfall":
      return (a: ArtikelAnzeigeZeile, b: ArtikelAnzeigeZeile) => {
        const av = a.naechsteCharge?.verfall;
        const bv = b.naechsteCharge?.verfall;
        if (av === undefined && bv === undefined) return nameVergleichen(a, b);
        if (av === undefined) return 1;
        if (bv === undefined) return -1;
        return av.localeCompare(bv) || nameVergleichen(a, b);
      };
    default:
      return nameVergleichen;
  }
}

/**
 * Eine totale, nicht mutierende Ordnung. Teil 6 bindet seinen Export an genau
 * das Ergebnis, das die Tabelle bereits verwendet.
 */
export function artikelSortieren(
  zeilen: ArtikelAnzeigeZeile[],
  sortierung: ArtikelSortierung,
): ArtikelAnzeigeZeile[] {
  return [...zeilen].sort(artikelVergleichen(sortierung));
}

export function ArtikelTable({
  zeilen,
  fahrzeuge,
  ausgeblendeteKategorien = [],
}: {
  zeilen: ArtikelAnzeigeZeile[];
  fahrzeuge: FahrzeugOption[];
  /** DRK-294 — gefaltete Schluessel, gelesen fuer das Konto aus der Sitzung. */
  ausgeblendeteKategorien?: string[];
}) {
  const [filter, setFilter] = useState<ArtikelFilterZustand>(LEERER_FILTER);
  const [sortierung, setSortierung] = useState<ArtikelSortierung>("name-asc");
  const [offenerArtikel, setOffenerArtikel] = useState<string | null>(null);
  const [exportLaeuft, startExport] = useTransition();
  const [exportFehler, setExportFehler] = useState<string | null>(null);
  /**
   * DIE AUSGEBLENDETEN KATEGORIEN SIND EIN EIGENER ZUSTAND, nicht Teil von
   * `filter` (DRK-294). Sie sind je Konto gespeichert, die Chips gelten nur fuer
   * den Moment — und `zuruecksetzen()` setzt `LEERER_FILTER`. Laegen sie darin,
   * loeschte „Zuruecksetzen" still eine gespeicherte Einstellung.
   *
   * Der Zustand haelt die Wahrheit fuer diese Sitzung; die Prop ist nur der
   * Startwert. Die Server Action ersetzt die gespeicherte Liste als Ganzes, und
   * Next reiht Server Actions eines Clients hintereinander ein — zwei schnelle
   * Aenderungen enden also beim zuletzt gezeigten Stand.
   */
  const [ausgeblendet, setAusgeblendet] = useState<string[]>(ausgeblendeteKategorien);
  const [kategorieFehler, setKategorieFehler] = useState<string | null>(null);
  /**
   * DRK-293 — die angekreuzten Artikel, als Kennungen und NICHT als Zeilen.
   *
   * ⚠️ `preserveSelectedRowKeys` HAELT DIE AUSWAHL UEBER EINEN FILTERWECHSEL
   * HINWEG, und das ist die Absicht: „drei Mullbinden suchen und ankreuzen, dann
   * zwei Pflaster" ist der Vorgang, um den es geht. Der Preis waere eine
   * unsichtbare Auswahl — deshalb zaehlt die Leiste sie, und die Schublade
   * NENNT JEDEN Artikel beim Namen, bevor gespeichert wird.
   */
  const [auswahl, setAuswahl] = useState<string[]>([]);
  const [sammelOffen, setSammelOffen] = useState(false);
  const [sammelHinweis, setSammelHinweis] = useState<string | null>(null);
  const router = useRouter();

  const kategorien = useMemo(
    () => kategorieOptionen(zeilen.map((zeile) => zeile.kategorie)),
    [zeilen],
  );
  const ausgeblendetMenge = useMemo(() => new Set(ausgeblendet), [ausgeblendet]);

  // Genau diese eine abgeleitete Liste ist Tabellenquelle und Übergabepunkt
  // für den in Teil 6 freigeschalteten Export — die Kategorien laufen durch
  // DASSELBE Praedikat, nie als zweites `.filter()` daneben (§9.4).
  const gefiltert = useMemo(
    () => artikelSortieren(artikelFiltern(zeilen, filter, ausgeblendetMenge), sortierung),
    [zeilen, filter, ausgeblendetMenge, sortierung],
  );

  /** Wie viele Artikel allein die Kategorien wegnehmen — ohne Suche und Chips. */
  const durchKategorienAusgeblendet = useMemo(
    () => zeilen.filter((zeile) => !artikelTrifft(zeile, LEERER_FILTER, ausgeblendetMenge)).length,
    [zeilen, ausgeblendetMenge],
  );

  /**
   * Die ausgewaehlten Artikel als Zeilen — gegen `zeilen` aufgeloest, nie gegen
   * `gefiltert`: eine Auswahl ueberlebt den Filter, und eine Kennung, die es
   * nicht mehr gibt (die Liste ist neu geladen worden), faellt hier still weg
   * statt in der Vorschau als Geisterzeile zu stehen.
   */
  const ausgewaehlt = useMemo<SammelZeile[]>(() => {
    const menge = new Set(auswahl);
    return artikelSortieren(zeilen.filter((zeile) => menge.has(zeile.id)), "name-asc")
      .map((zeile) => ({
        id: zeile.id,
        name: zeile.name,
        kategorie: zeile.kategorie,
        fach: zeile.fach,
        aktiv: zeile.aktiv,
      }));
  }, [zeilen, auswahl]);

  /**
   * Eine gespeicherte Kategorie, zu der kein Artikel mehr passt, erscheint
   * nicht als Marke ohne Beschriftung. Sie blendet nichts aus und faellt beim
   * naechsten Speichern aus der Liste.
   */
  const sichtbareAuswahl = ausgeblendet.filter((schluessel) => (
    kategorien.some((option) => option.schluessel === schluessel)
  ));

  function kategorienAendern(neu: string[]): void {
    setAusgeblendet(neu);
    setKategorieFehler(null);
    void (async () => {
      try {
        const ergebnis = await setzeAusgeblendeteKategorien({ kategorien: neu });
        if (!ergebnis.ok) setKategorieFehler(ergebnis.fehler);
      } catch {
        setKategorieFehler(KATEGORIEN_SPEICHERFEHLER);
      }
    })();
  }

  /**
   * EXCEL-LISTE DES BESTANDS (Spec §9.4, Entscheidung 9-E).
   *
   * Exportiert GENAU das, was gerade in der Tabelle steht — `gefiltert`, also
   * dieselbe abgeleitete Liste, die auch in `dataSource` geht. Das ist keine
   * Bequemlichkeit: der Knopftitel sagt es zu, und sobald die Liste serverseitig
   * paginiert wird, aenderte sich STILL, was „Excel-Liste" bedeutet — aus
   * „alles, was ich gerade sehe" wuerde „die erste Seite" (9-H). Pagination der
   * Artikeltabelle ist damit eine Aenderung an einem Ausgabeformat, kein
   * Oberflaechendetail.
   *
   * Die Bibliothek wird ERST BEIM KLICK nachgeladen, damit sie nicht im
   * Seiten-Bundle landet. Ein rein serverseitiger Export waere ein anderes
   * Produkt: er koennte den Dateinamen aus Serverzeit bilden und kennte den
   * Filterzustand nicht.
   *
   * DER DATEINAME ENTSTEHT AUS BROWSERZEIT (`new Date()`), also aus der Zone des
   * Arbeitsplatzes. Das ist heutiges Verhalten und bleibt es; die TZ-Frage
   * beruehrt dieses Format nicht (§9.4).
   */
  const exportieren = () => {
    setExportFehler(null);
    startExport(async () => {
      try {
        const { default: writeXlsxFile } = await import("write-excel-file/browser");
        const zeilenExport = bestandExportZeilen(gefiltert);
        await writeXlsxFile(zeilenExport, {
          columns: EXCEL_SPALTEN.map((sp) => ({
            header: { value: sp.header, fontWeight: "bold" as const },
            width: sp.width,
            // Zahlen bleiben Zahlen, alles andere ist ausdruecklich Text — die
            // Bibliothek legt es dann als Textzelle an, nie als Formel (9-G).
            cell: (z: BestandExportZeile) =>
              sp.zahl
                ? { value: Number(sp.wert(z)), type: Number }
                : { value: String(sp.wert(z)), type: String },
          })),
          sheet: EXCEL_BLATTNAME,
          stickyRowsCount: 1,
        }).toFile(bestandExportDateiname(new Date()));
      } catch {
        // Der deutsche Satz als ZUSTAND, nie `e.message`: der waere in
        // Produktion der englische Satz ueber eine „server-side exception"
        // (Falle 66, §11.2 d).
        setExportFehler(EXCEL_FEHLERTEXT);
      }
    });
  };

  const hatFilter = filter.suche.trim() !== ""
    || filter.nurUnterMindest
    || filter.nurChargeKritisch
    || filter.ohneInaktive
    || filter.ohneBestandNull;

  function zuruecksetzen(): void {
    setFilter(LEERER_FILTER);
  }

  return (
    <>
      <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
        <Suchfeld
          wert={filter.suche}
          onWert={(suche) => setFilter((vorher) => ({ ...vorher, suche }))}
          platzhalter="Artikel, Fach oder Charge suchen…"
        />
        <Checkbox
          checked={filter.nurUnterMindest}
          onChange={(ereignis) => setFilter((vorher) => ({
            ...vorher,
            nurUnterMindest: ereignis.target.checked,
          }))}
        >
          unter Mindestbestand
        </Checkbox>
        <Checkbox
          checked={filter.nurChargeKritisch}
          onChange={(ereignis) => setFilter((vorher) => ({
            ...vorher,
            nurChargeKritisch: ereignis.target.checked,
          }))}
        >
          Charge kritisch
        </Checkbox>
        <Checkbox
          checked={filter.ohneInaktive}
          onChange={(ereignis) => setFilter((vorher) => ({
            ...vorher,
            ohneInaktive: ereignis.target.checked,
          }))}
        >
          inaktive ausblenden
        </Checkbox>
        <Checkbox
          checked={filter.ohneBestandNull}
          onChange={(ereignis) => setFilter((vorher) => ({
            ...vorher,
            ohneBestandNull: ereignis.target.checked,
          }))}
          // Die Spalte daneben heisst schlicht „Bestand", und gemeint ist auf
          // dieser ganzen Seite der HANDLAGER (§5.2.1) — die Beschriftung sagt
          // deshalb dasselbe Wort. Was der Titel traegt, ist die Folge, die man
          // der Zeile nicht ansieht: ein Artikel, der komplett auf einem
          // Fahrzeug liegt, hat hier 0 und verschwindet mit.
          title={
            "Blendet Artikel aus, deren Bestand im Handlager 0 ist — "
            + "auch wenn sie auf einem Fahrzeug liegen"
          }
        >
          Bestand 0 ausblenden
        </Checkbox>
        {/* DRK-294. Nur, wenn es etwas zu waehlen gibt — ohne vergebene
            Kategorie waere das Feld eine leere Liste. */}
        {kategorien.length > 0 ? (
          <Select<string[]>
            mode="multiple"
            value={sichtbareAuswahl}
            onChange={kategorienAendern}
            options={kategorien.map((option) => ({
              value: option.schluessel,
              label: option.label,
            }))}
            placeholder="Kategorien ausblenden"
            aria-label="Kategorien ausblenden"
            virtual={false}
            style={{ minWidth: 240 }}
          />
        ) : null}
        <Select<ArtikelSortierung>
          value={sortierung}
          onChange={setSortierung}
          options={SORTIERUNGEN.map((option) => ({
            value: option.wert,
            label: option.label,
          }))}
          aria-label="Sortierung"
          virtual={false}
          style={{ minWidth: 200 }}
        />
        {hatFilter ? (
          <Button
            icon={<Ikone name="zuruecksetzen" groesse={16} />}
            onClick={zuruecksetzen}
          >
            Zurücksetzen
          </Button>
        ) : null}
        <Trefferanzeige gezeigt={gefiltert.length} gesamt={zeilen.length} />
        <Button
          data-testid="lb-excel"
          icon={<Ikone name="tabelle" groesse={16} />}
          // ABSICHTLICH `zeilen.length`, NICHT `gefiltert.length` (Brief-Prosa
          // §9.4 Schritt 4: "rows.length === 0" — die Vollmenge dieses Moduls
          // heisst `zeilen`). Ein Suchfilter ohne Treffer deaktiviert den Knopf
          // also NICHT: der Klick erzeugt dann eine Datei mit nur der
          // Kopfzeile, was zum Titel "mit der aktuell angezeigten Liste" passt
          // — die Liste ist eben leer, und genau das wird exportiert. Erst
          // wenn im MODUL ueberhaupt kein Artikel existiert, gibt es nichts,
          // was ein Export je zeigen koennte.
          disabled={exportLaeuft || zeilen.length === 0}
          onClick={exportieren}
          title="Erzeugt eine Excel-Datei (.xlsx) mit der aktuell angezeigten Liste"
          data-export-zeilen={gefiltert.map((zeile) => zeile.id).join(",")}
        >
          {exportLaeuft ? "Erzeuge…" : "Excel-Liste"}
        </Button>
        <NeuArtikel kategorien={kategorien.map((option) => option.label)} />
      </Flex>
      {ausgewaehlt.length > 0 ? (
        <Flex
          gap={SPACE.md}
          align="center"
          wrap
          data-testid="sammel-leiste"
          style={{ marginBlockEnd: SPACE.md }}
        >
          <span style={SCHRIFT.feldname}>
            {ausgewaehlt.length} ausgewählt
          </span>
          <Button type="primary" onClick={() => setSammelOffen(true)}>
            Auswahl bearbeiten
          </Button>
          <Button type="link" style={{ padding: 0 }} onClick={() => setAuswahl([])}>
            Auswahl aufheben
          </Button>
        </Flex>
      ) : null}
      {sammelHinweis ? (
        <Alert
          type="success"
          showIcon={false}
          title={sammelHinweis}
          closable
          onClose={() => setSammelHinweis(null)}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}
      {durchKategorienAusgeblendet > 0 ? (
        // Ein fehlender Artikel soll nicht wie ein geloeschter aussehen: die
        // gespeicherte Auswahl wirkt schon beim Aufschlagen, ohne dass in
        // dieser Sitzung jemand etwas gewaehlt haette.
        <Flex
          gap={SPACE.sm}
          align="center"
          wrap
          data-testid="kategorien-hinweis"
          style={{ marginBlockEnd: SPACE.md }}
        >
          <span style={SCHRIFT.neben}>
            {durchKategorienAusgeblendet} Artikel in ausgeblendeten Kategorien
          </span>
          <Button type="link" style={{ padding: 0 }} onClick={() => kategorienAendern([])}>
            alle zeigen
          </Button>
        </Flex>
      ) : null}
      {exportFehler ? (
        // Gleiches Muster wie NeuArtikel.tsx:134 und die vier Stellen in
        // ArtikelDrawer.tsx — kein Fließtext in Nebentext-Groesze fuer einen
        // Fehler, und `type="warning"` statt `type="error"`: Rot ist in diesem
        // Modul fachlich belegt (CLAUDE.md, Falle 3).
        <Alert
          type="warning"
          showIcon={false}
          title={exportFehler}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}
      {kategorieFehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={kategorieFehler}
          style={{ marginBlockEnd: SPACE.md }}
        />
      ) : null}

      <Table<ArtikelAnzeigeZeile>
        rowKey="id"
        pagination={false}
        scroll={{ x: "max-content" }}
        aria-label="Artikel und Bestand"
        dataSource={gefiltert}
        locale={{
          emptyText: hatFilter || durchKategorienAusgeblendet > 0
            ? "Kein Artikel passt zu Suche und Filter."
            : "Noch keine Artikel. Lege oben den ersten an.",
        }}
        rowSelection={{
          selectedRowKeys: auswahl,
          onChange: (schluessel) => {
            setAuswahl(schluessel.map(String));
            // „5 Artikel geaendert." neben einer frisch begonnenen Auswahl liest
            // sich wie eine Meldung ueber DIESE Auswahl.
            setSammelHinweis(null);
          },
          preserveSelectedRowKeys: true,
        }}
        onRow={(zeile) => ({
          onClick: (ereignis) => {
            // ⚠️ DER KLICK AUF DAS KREUZCHEN DARF DIE SCHUBLADE NICHT OEFFNEN.
            // antds Auswahlspalte liegt in DERSELBEN `<tr>`, ihr Klick blubbert
            // also hierher; ohne diese Zeile beantwortet jedes Ankreuzen sich
            // selbst mit den Artikeldetails. Geprueft wird auf `<label>` und
            // nicht auf `.ant-table-selection-column`: antds `Checkbox` rendert
            // sein Wurzelelement als `<label>` (`antd/es/checkbox/Checkbox.js`),
            // und keine andere Zelle dieser Tabelle traegt eines — eine
            // Klassenname-Probe haengt dagegen an einem Detail, das ein
            // antd-Sprung still aendern kann.
            if ((ereignis.target as HTMLElement).closest("label")) return;
            setOffenerArtikel(zeile.id);
          },
        })}
        // Spaltenkoepfe tragen die Kicker-Rolle ueber `title`, nie ueber CSS
        // gegen `.ant-table-thead` (docs/design/README.md).
        columns={[
          {
            title: <span style={SCHRIFT.feldname}>Artikel</span>,
            dataIndex: "name",
            render: (wert: string, zeile) => (
              <Button
                type="link"
                style={{ padding: 0, fontWeight: 600 }}
                onClick={() => setOffenerArtikel(zeile.id)}
              >
                {wert}
              </Button>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Fach</span>,
            dataIndex: "fach",
            render: (wert: string) => <span className={s.fach}>{wert}</span>,
          },
          {
            title: <span style={SCHRIFT.feldname}>Kategorie</span>,
            dataIndex: "kategorie",
            render: (wert: string | null) => (
              wert ?? <span style={SCHRIFT.neben}>–</span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Bestand</span>,
            dataIndex: "bestand",
            align: "right",
            render: (wert: number, zeile) => (
              <span style={{ fontVariantNumeric: "tabular-nums" }}>
                {wert} <span style={SCHRIFT.neben}>{zeile.einheit}</span>
              </span>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Min.</span>,
            dataIndex: "mindestbestand",
            align: "right",
            render: (wert: number) => <span style={SCHRIFT.mono}>{wert}</span>,
          },
          {
            title: <span style={SCHRIFT.feldname}>Nächster Verfall</span>,
            dataIndex: "naechsteCharge",
            render: (_wert: unknown, zeile) => (
              zeile.naechsteCharge && zeile.naechsteAmpel && zeile.naechsteAblaufText
                ? (
                  // 7 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) und
                  // hat keine Geschwisterzeile in diesem Zuschnitt; bleibt
                  // Literal, siehe Bericht.
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 7 }}>
                    <Plakette
                      verfall={zeile.naechsteCharge.verfall}
                      ampel={zeile.naechsteAmpel}
                      statusText={zeile.naechsteAblaufText}
                    />
                    <span style={SCHRIFT.mono}>{zeile.naechsteCharge.chargenNr}</span>
                  </span>
                )
                : <Chip ton="grau">leer</Chip>
            ),
          },
          {
            title: <span style={SCHRIFT.feldname}>Status</span>,
            dataIndex: "aktiv",
            render: (_wert: boolean, zeile) => (
              // 6 liegt nicht auf der SPACE-Skala; bleibt Literal (wie an den
              // uebrigen Chip-Zeilen dieses Zuschnitts).
              <Flex gap={6} wrap>
                {!zeile.aktiv ? <Chip ton="grau">inaktiv</Chip> : null}
                {zeile.aktiv && !zeile.unterMindest && !zeile.naechsteAblaufText
                  ? <Chip ton="ok">ok</Chip>
                  : null}
                {zeile.unterMindest
                  ? <Chip ton="rot" zeichen="warnung">unter Mindestbestand</Chip>
                  : null}
                {zeile.naechsteAblaufText && zeile.naechsteAmpel
                  ? (
                    <Chip ton={ampelTon(zeile.naechsteAmpel)}>
                      Charge {zeile.naechsteAblaufText}
                    </Chip>
                  )
                  : null}
              </Flex>
            ),
          },
        ]}
      />

      {sammelOffen ? (
        <SammelDrawer
          zeilen={ausgewaehlt}
          kategorien={kategorien.map((option) => option.label)}
          onSchliessen={() => setSammelOffen(false)}
          onFertig={(betroffen) => {
            setSammelOffen(false);
            setAuswahl([]);
            setSammelHinweis(
              betroffen === 1 ? "1 Artikel geändert." : `${betroffen} Artikel geändert.`,
            );
            // Wie `NeuArtikel`: die Action revalidiert den Pfad, und `refresh()`
            // holt den neuen Serverstand in diese schon stehende Insel. Ohne das
            // zeigte die Tabelle die alten Werte — und die naechste Vorschau
            // rechnete gegen sie.
            router.refresh();
          }}
        />
      ) : null}

      {offenerArtikel ? (
        <ArtikelDrawer
          key={offenerArtikel}
          id={offenerArtikel}
          fahrzeuge={fahrzeuge}
          kategorien={kategorien.map((option) => option.label)}
          onSchliessen={() => setOffenerArtikel(null)}
        />
      ) : null}
    </>
  );
}
