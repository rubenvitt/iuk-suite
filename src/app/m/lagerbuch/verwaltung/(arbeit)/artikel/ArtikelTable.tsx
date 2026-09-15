"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Flex, Select, type TableProps } from "antd";
import { SPACE } from "@/core/theme/tokens";
import {
  angezeigteZeilen,
  Datentabelle,
  filterAktiv,
  nachDatum,
  nachText,
  nachZahl,
  TabellenVollhoehe,
  trifftWert,
  useEntprellt,
  werteAlsFilter,
  zustandsFilter,
  type FilterZustand,
  type SortZustand,
} from "@/core/tabelle";
import { setzeAusgeblendeteKategorien } from "../../../_actions/kategorien";
import {
  artikelFiltern,
  artikelTrifft,
  ARTIKEL_BESTAND_ZUSTAENDE,
  ARTIKEL_CHARGEN_ZUSTAENDE,
  ARTIKEL_MINDEST_ZUSTAENDE,
  ARTIKEL_STATUS_ZUSTAENDE,
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

/** Fester Satz statt `e.message` — derselbe Grund wie `EXCEL_FEHLERTEXT`. */
const KATEGORIEN_SPEICHERFEHLER =
  "Die Auswahl konnte nicht gespeichert werden – bitte erneut versuchen.";

/**
 * ⚠️ JEDE SPALTE TRAEGT EINE ZAHL, UND ZWAR WEIL DIE TABELLE VIRTUELL SCROLLT.
 * `@rc-component/table` prueft `scroll.x` einer virtuellen Tabelle auf
 * `typeof === "number"` und setzt sie sonst STILL auf 1 — die Tabelle fiele auf
 * ein Pixel Breite zusammen. `core/tabelle/masse.ts` rechnet die Summe aus
 * diesen Zahlen und schaltet die Virtualisierung lieber ab, als das zu liefern;
 * `core/tabelle/masse.test.ts` haelt die Regel fest.
 *
 * ⚠️ DIE SUMME IST EINE ENTSCHEIDUNG UEBER DAS DESKTOP-BILD, nicht nur eine
 * Voraussetzung der Virtualisierung. Sobald `scroll.y` gesetzt ist, schaltet
 * rc-table auf `table-layout: fixed` (`docs/design/README.md`) — die Spalten
 * stehen dann GENAU so breit, wie es hier steht, und nicht mehr so breit wie
 * ihr Inhalt. Die Zahlen sind deshalb am Inhalt entlang gewaehlt und die Summe
 * bewusst klein gehalten: 1110 + 32 fuer die Auswahlspalte = 1142.
 *
 * ⚠️ SIE GELTEN ERST AB `VIRTUELL_AB_ZEILEN` (150). Darunter bleibt die Tabelle
 * gewoehnlich und misst wie bisher nach Inhalt — eine kleine Installation sieht
 * von dieser Aenderung also gar nichts.
 */
const BREITE = {
  artikel: 230,
  fach: 90,
  kategorie: 150,
  bestand: 110,
  mindest: 80,
  verfall: 210,
  status: 240,
} as const;

/** Die fachliche Ordnung der Ampel — rot zuerst, nicht alphabetisch. */
const AMPEL_RANG = ["rot", "gelb", "gruen"] as const;

/** Nur fuer die Vorschau der Sammelaenderung, die alphabetisch bleibt. */
const NACH_NAMEN = nachText<ArtikelAnzeigeZeile>((zeile) => zeile.name);

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
  const [offenerArtikel, setOffenerArtikel] = useState<string | null>(null);
  const [exportLaeuft, startExport] = useTransition();
  const [exportFehler, setExportFehler] = useState<string | null>(null);
  /**
   * DIE AUSGEBLENDETEN KATEGORIEN SIND EIN EIGENER ZUSTAND, nicht Teil von
   * `filter` (DRK-294). Sie sind je Konto GESPEICHERT, ein Spaltenfilter gilt
   * nur fuer den Moment — das sind zwei verschiedene Dinge, und deshalb bleiben
   * es zwei Bedienelemente. Die Kategorie-Spalte hat daneben ihren eigenen,
   * momentanen Filter; die Beschriftung „dauerhaft ausblenden" sagt, welches
   * von beiden bleibt.
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

  /**
   * ⚠️ DIE SUCHE WIRD ENTPRELLT, DAS FELD NICHT. Ohne das filterte, sortierte
   * und rendere die Tabelle bei JEDEM Tastendruck neu — bei rund acht
   * antd-Komponenten je Zeile wurde das Tippen umso langsamer, je mehr Artikel
   * es gab. Entprellt wird deshalb die ABLEITUNG; der Wert im `<input>` bleibt
   * sofort, sonst verschluckt das Feld Zeichen.
   */
  const gesuchteWorte = useEntprellt(filter.suche);
  const wirksamerFilter = useMemo<ArtikelFilterZustand>(
    () => ({ suche: gesuchteWorte }),
    [gesuchteWorte],
  );

  const kategorien = useMemo(
    () => kategorieOptionen(zeilen.map((zeile) => zeile.kategorie)),
    [zeilen],
  );
  const ausgeblendetMenge = useMemo(() => new Set(ausgeblendet), [ausgeblendet]);

  /**
   * Die Vorfilterung: Freitextsuche und die gespeicherten Kategorien. Alles
   * Weitere (Fach, Kategorie, Status) macht antd in den Spaltenkoepfen.
   */
  const gefiltert = useMemo(
    () => artikelFiltern(zeilen, wirksamerFilter, ausgeblendetMenge),
    [zeilen, wirksamerFilter, ausgeblendetMenge],
  );

  /**
   * ⚠️ DER ZUSTAND DER SPALTENKOEPFE IST HIER GEMERKT, DIE LISTE NICHT.
   *
   * Der naheliegende Weg waere `onChange(…, extra.currentDataSource)` — antd
   * reicht die angezeigte Liste dort fertig heraus. Der Weg ist falsch, und
   * zwar still: `onChange` feuert nur bei Bedienung DER TABELLE. Tippt jemand
   * daneben in die Suche, filtert antd zwar neu, meldet es aber nicht — die
   * gemerkte Liste ist dann veraltet, und der Export exportierte eine Menge,
   * die so nie auf dem Schirm stand. Gemessen: Statusfilter setzen, dann
   * suchen → die Trefferanzeige blieb bei der Zahl von vor der Suche.
   *
   * Deshalb wird nur der ZUSTAND gemerkt und die Liste daraus ABGELEITET.
   * Begruendung und Rechnung stehen in `core/tabelle/angezeigt.ts`.
   */
  const [spaltenFilter, setSpaltenFilter] = useState<FilterZustand>({});
  const [sortierung, setSortierung] = useState<SortZustand>({
    spalte: "name",
    richtung: "ascend",
  });

  /** Wie viele Artikel allein die Kategorien wegnehmen — ohne Suche. */
  const durchKategorienAusgeblendet = useMemo(
    () => zeilen.filter((zeile) => !artikelTrifft(zeile, LEERER_FILTER, ausgeblendetMenge)).length,
    [zeilen, ausgeblendetMenge],
  );

  /**
   * Die ausgewaehlten Artikel als Zeilen — gegen `zeilen` aufgeloest, nie gegen
   * die angezeigte Menge: eine Auswahl ueberlebt den Filter, und eine Kennung,
   * die es nicht mehr gibt (die Liste ist neu geladen worden), faellt hier still
   * weg statt in der Vorschau als Geisterzeile zu stehen.
   */
  const ausgewaehlt = useMemo<SammelZeile[]>(() => {
    const menge = new Set(auswahl);
    return [...zeilen.filter((zeile) => menge.has(zeile.id))]
      .sort(NACH_NAMEN)
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
   * Exportiert GENAU das, was gerade in der Tabelle steht — siehe `angezeigt`.
   *
   * DER DATEINAME ENTSTEHT AUS BROWSERZEIT (`new Date()`), also aus der Zone des
   * Arbeitsplatzes. Das ist heutiges Verhalten und bleibt es.
   *
   * Die Bibliothek wird ERST BEIM KLICK nachgeladen, damit sie nicht im
   * Seiten-Bundle landet.
   */
  const exportieren = () => {
    setExportFehler(null);
    startExport(async () => {
      try {
        const { default: writeXlsxFile } = await import("write-excel-file/browser");
        const zeilenExport = bestandExportZeilen(angezeigt);
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
        // Produktion der englische Satz ueber eine „server-side exception".
        setExportFehler(EXCEL_FEHLERTEXT);
      }
    });
  };

  /**
   * ⚠️ DIE SPALTENFILTER ZAEHLEN MIT, und daran haengt mehr als ein Knopf: der
   * LEERTEXT. „Noch keine Artikel. Lege oben den ersten an." ist falsch, sobald
   * bloss zwei Spaltenfilter ohne Schnittmenge gesetzt sind — es gibt Artikel,
   * sie passen nur nicht. Der Satz forderte dann zum Anlegen eines Datensatzes
   * auf, den es laengst gibt.
   */
  const hatFilter = filter.suche.trim() !== "" || filterAktiv(spaltenFilter);

  /** Raeumt BEIDE Wege ab — sonst bliebe der Knopf sichtbar und wirkungslos. */
  function zuruecksetzen(): void {
    setFilter(LEERER_FILTER);
    setSpaltenFilter({});
  }

  // ⚠️ NICHT-OPTIONALER TYP, und das ist kein Stil: mit dem optionalen
  // `TableProps[...]["columns"]` brauchte die Ableitung unten ein `?? []`, und
  // ein frisch erzeugtes Feld IM Memo-Rumpf macht die Memoisierung wertlos —
  // der React-Compiler lehnt sie dann ganz ab („Existing memoization could not
  // be preserved"). Diese Liste ist immer ein Feld.
  const spalten = useMemo<NonNullable<TableProps<ArtikelAnzeigeZeile>["columns"]>>(() => [
    {
      title: "Artikel",
      dataIndex: "name",
      width: BREITE.artikel,
      sorter: nachText<ArtikelAnzeigeZeile>((zeile) => zeile.name),
      sortOrder: sortierung.spalte === "name" ? sortierung.richtung : null,
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
      title: "Fach",
      dataIndex: "fach",
      width: BREITE.fach,
      // `nachText` sortiert Ziffernfolgen numerisch — „Fach 2" vor „Fach 10".
      sorter: nachText<ArtikelAnzeigeZeile>((zeile) => zeile.fach),
      sortOrder: sortierung.spalte === "fach" ? sortierung.richtung : null,
      filteredValue: spaltenFilter.fach ?? null,
      filters: werteAlsFilter(zeilen, (zeile) => zeile.fach),
      filterSearch: true,
      onFilter: trifftWert<ArtikelAnzeigeZeile>((zeile) => zeile.fach),
      render: (wert: string) => <span className={s.fach}>{wert}</span>,
    },
    {
      title: "Kategorie",
      dataIndex: "kategorie",
      width: BREITE.kategorie,
      sorter: nachText<ArtikelAnzeigeZeile>((zeile) => zeile.kategorie),
      sortOrder: sortierung.spalte === "kategorie" ? sortierung.richtung : null,
      filteredValue: spaltenFilter.kategorie ?? null,
      filters: werteAlsFilter(zeilen, (zeile) => zeile.kategorie, {
        ohneWertLabel: "ohne Kategorie",
      }),
      filterSearch: true,
      onFilter: trifftWert<ArtikelAnzeigeZeile>((zeile) => zeile.kategorie),
      render: (wert: string | null) => (
        wert ?? <span style={SCHRIFT.neben}>–</span>
      ),
    },
    {
      title: "Bestand",
      dataIndex: "bestand",
      width: BREITE.bestand,
      align: "right",
      sorter: nachZahl<ArtikelAnzeigeZeile>((zeile) => zeile.bestand),
      sortOrder: sortierung.spalte === "bestand" ? sortierung.richtung : null,
      ...zustandsFilter<ArtikelAnzeigeZeile>(ARTIKEL_BESTAND_ZUSTAENDE),
      filteredValue: spaltenFilter.bestand ?? null,
      render: (wert: number, zeile) => (
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {wert} <span style={SCHRIFT.neben}>{zeile.einheit}</span>
        </span>
      ),
    },
    {
      title: "Min.",
      dataIndex: "mindestbestand",
      width: BREITE.mindest,
      align: "right",
      sorter: nachZahl<ArtikelAnzeigeZeile>((zeile) => zeile.mindestbestand),
      sortOrder: sortierung.spalte === "mindestbestand" ? sortierung.richtung : null,
      ...zustandsFilter<ArtikelAnzeigeZeile>(ARTIKEL_MINDEST_ZUSTAENDE),
      filteredValue: spaltenFilter.mindestbestand ?? null,
      render: (wert: number) => <span style={SCHRIFT.mono}>{wert}</span>,
    },
    {
      title: "Nächster Verfall",
      dataIndex: "naechsteCharge",
      width: BREITE.verfall,
      /**
       * ⚠️ SORTIERT WIRD UEBER DAS ISO-DATUM DER CHARGE, nie ueber
       * `naechsteAblaufText` („in 12 Tagen") — der sortierte als Zeichenkette
       * „in 3 Tagen" hinter „in 12 Tagen".
       */
      sorter: nachDatum<ArtikelAnzeigeZeile>((zeile) => zeile.naechsteCharge?.verfall),
      sortOrder: sortierung.spalte === "naechsteCharge" ? sortierung.richtung : null,
      ...zustandsFilter<ArtikelAnzeigeZeile>(ARTIKEL_CHARGEN_ZUSTAENDE),
      filteredValue: spaltenFilter.naechsteCharge ?? null,
      render: (_wert: unknown, zeile) => (
        zeile.naechsteCharge && zeile.naechsteAmpel && zeile.naechsteAblaufText
          ? (
            // 7 liegt nicht auf der SPACE-Skala (4/8/12/16/24/32) und hat keine
            // Geschwisterzeile in diesem Zuschnitt; bleibt Literal.
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
      title: "Status",
      dataIndex: "aktiv",
      width: BREITE.status,
      /**
       * ⚠️ HIER STEHT NUR NOCH DER LEBENSZUSTAND — aktiv oder inaktiv. Die
       * uebrigen Praedikate der alten Knopfleiste liegen auf DEN SPALTEN, um
       * die es jeweils geht (Bestand, Min., Verfall), und das ist kein
       * Ordnungssinn: antd verodert mehrere Werte EINER Spalte und verundet
       * ZWISCHEN Spalten. Laegen alle sechs hier, waere „aktiv UND unter
       * Mindestbestand" nicht mehr moeglich — mit den alten, unabhaengigen
       * Haken war genau das der Normalfall. Begruendung vollstaendig in
       * `_lib/artikelFilter.ts`.
       */
      ...zustandsFilter<ArtikelAnzeigeZeile>(ARTIKEL_STATUS_ZUSTAENDE),
      filteredValue: spaltenFilter.aktiv ?? null,
      sortOrder: sortierung.spalte === "aktiv" ? sortierung.richtung : null,
      // Rot zuerst: der Fall, der Aufmerksamkeit verlangt, gehoert nach oben.
      sorter: (a, b) => {
        const rang = (zeile: ArtikelAnzeigeZeile) => {
          if (zeile.unterMindest) return 0;
          if (zeile.naechsteAmpel) return 1 + AMPEL_RANG.indexOf(zeile.naechsteAmpel);
          return AMPEL_RANG.length + 1;
        };
        return rang(a) - rang(b);
      },
      render: (_wert: boolean, zeile) => (
        // 6 liegt nicht auf der SPACE-Skala; bleibt Literal.
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
  ], [zeilen, spaltenFilter, sortierung]);

  /**
   * Die Liste, die WIRKLICH auf dem Schirm steht — abgeleitet, nicht gemerkt.
   * Sie speist den Export und die Trefferanzeige. antd wendet dieselben
   * Praedikate danach noch einmal an; beide Schritte sind idempotent, und
   * `filteredValue`/`sortOrder` halten die Spaltenkoepfe im selben Zustand.
   */
  // ⚠️ OHNE `useMemo`, und zwar absichtlich. Der React-Compiler memoisiert diese
  // Ableitung von sich aus; ein handgeschriebenes `useMemo` daneben konnte er
  // nicht erhalten und stellte daraufhin die Optimierung der GANZEN Komponente
  // ein („Compilation Skipped: Existing memoization could not be preserved").
  // Eine Handmemoisierung, die den Compiler abschaltet, kostet mehr, als sie
  // spart.
  const angezeigt = angezeigteZeilen(gefiltert, spalten, spaltenFilter, sortierung);

  return (
    <>
      <TabellenVollhoehe
        mindestens={360}
        kopf={(
          <>
            <Flex gap={SPACE.md} wrap align="center" style={{ marginBlockEnd: SPACE.md }}>
              <Suchfeld
                wert={filter.suche}
                onWert={(suche) => setFilter((vorher) => ({ ...vorher, suche }))}
                platzhalter="Artikel, Fach oder Charge suchen…"
              />
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
                  placeholder="Kategorien dauerhaft ausblenden"
                  aria-label="Kategorien dauerhaft ausblenden"
                  // Der Unterschied zum Spaltenfilter derselben Spalte, in einem Satz:
                  // dieser hier bleibt, jener gilt nur fuer den Moment.
                  title={
                    "Für dein Konto gespeichert — diese Kategorien bleiben auch beim "
                    + "nächsten Aufschlagen ausgeblendet"
                  }
                  virtual={false}
                  style={{ minWidth: 240 }}
                />
              ) : null}
              {hatFilter ? (
                <Button
                  icon={<Ikone name="zuruecksetzen" groesse={16} />}
                  onClick={zuruecksetzen}
                >
                  Zurücksetzen
                </Button>
              ) : null}
              <Trefferanzeige gezeigt={angezeigt.length} gesamt={zeilen.length} />
              <Button
                data-testid="lb-excel"
                icon={<Ikone name="tabelle" groesse={16} />}
                // ABSICHTLICH `zeilen.length`, NICHT die angezeigte Menge: ein
                // Suchfilter ohne Treffer deaktiviert den Knopf also NICHT, der Klick
                // erzeugt dann eine Datei mit nur der Kopfzeile. Erst wenn im MODUL
                // ueberhaupt kein Artikel existiert, gibt es nichts zu exportieren.
                disabled={exportLaeuft || zeilen.length === 0}
                onClick={exportieren}
                title="Erzeugt eine Excel-Datei (.xlsx) mit der aktuell angezeigten Liste"
                // ⚠️ E2E-VERTRAG (`e2e/lagerbuch-bestand-export.spec.ts`): die exakte
                // Exportmenge, auch der leere Fall. Ohne ihn lief dort eine
                // Zusicherung ins Leere. Er ist billig geblieben, weil `angezeigt`
                // sich nur aendert, wenn sich die Anzeige aendert — die entprellte
                // Suche schlaegt hier also nicht je Tastendruck durch.
                data-export-zeilen={angezeigt.map((zeile) => zeile.id).join(",")}
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
              // Kein Fliesztext in Nebentext-Groesze fuer einen Fehler, und
              // `type="warning"` statt `type="error"`: Rot ist in diesem Modul
              // fachlich belegt (CLAUDE.md, Falle 3).
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
          </>
        )}
      >
        {(koerperHoehe) => (
          <Datentabelle<ArtikelAnzeigeZeile>
            rowKey="id"
            virtuell={koerperHoehe}
            aria-label="Artikel und Bestand"
            dataSource={gefiltert}
            columns={spalten}
            // NUR der Zustand wird gemerkt, nie die Liste — Begruendung oben
            // bei `spaltenFilter`.
            onChange={(_blaettern, neueFilter, neueSortierung) => {
              setSpaltenFilter(neueFilter as FilterZustand);
              const eine = Array.isArray(neueSortierung) ? neueSortierung[0] : neueSortierung;
              setSortierung({
                spalte: eine?.columnKey ?? (eine?.field as string | undefined),
                richtung: eine?.order ?? null,
              });
            }}
            locale={{
              emptyText: hatFilter || durchKategorienAusgeblendet > 0
                ? "Kein Artikel passt zu Suche und Filter."
                : "Noch keine Artikel. Lege oben den ersten an.",
            }}
            rowSelection={{
              selectedRowKeys: auswahl,
              columnWidth: 32,
              onChange: (schluessel) => {
                setAuswahl(schluessel.map(String));
                // „5 Artikel geaendert." neben einer frisch begonnenen Auswahl
                // liest sich wie eine Meldung ueber DIESE Auswahl.
                setSammelHinweis(null);
              },
              preserveSelectedRowKeys: true,
            }}
            onRow={(zeile) => ({
              onClick: (ereignis) => {
                // ⚠️ DER KLICK AUF DAS KREUZCHEN DARF DIE SCHUBLADE NICHT OEFFNEN.
                // antds Auswahlspalte liegt in DERSELBEN `<tr>`, ihr Klick
                // blubbert also hierher; ohne diese Zeile beantwortet jedes
                // Ankreuzen sich selbst mit den Artikeldetails. Geprueft wird auf
                // `<label>` und nicht auf `.ant-table-selection-column`: antds
                // `Checkbox` rendert sein Wurzelelement als `<label>`
                // (`antd/es/checkbox/Checkbox.js`), und keine andere Zelle dieser
                // Tabelle traegt eines — eine Klassenname-Probe haengt dagegen an
                // einem Detail, das ein antd-Sprung still aendern kann.
                if ((ereignis.target as HTMLElement).closest("label")) return;
                setOffenerArtikel(zeile.id);
              },
            })}
          />
        )}
      </TabellenVollhoehe>

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
