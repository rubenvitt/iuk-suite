"use client";

// src/app/m/radio/admin/(arbeit)/geraete/GeraeteTabelle.tsx
import { useCallback, useState, useSyncExternalStore } from "react";
import { Button, Card, Grid, List, Table, Tag, type TableProps } from "antd";
import { usePathname, useRouter } from "next/navigation";
import type { GeraetZeile, Vorschlagsfeld } from "../../../_lib/lesepfade/geraete";
import type { UpdateStand } from "../../../_lib/updateStand";
import {
  angewandt,
  sortierungLesen,
  sortierungZeichenkette,
  suchparameterZu,
  type GeraetFilterWerte,
  type GeraeteSuchWerte,
} from "../../../_lib/suchparameter";
import s from "../../../_ui/verwaltung.module.css";
import { FilterSchublade } from "./FilterSchublade";
import { GeraeteWerkzeugleiste } from "./GeraeteWerkzeugleiste";
import { NeuGeraetModal } from "./NeuGeraetModal";
import type { SpaltenOption } from "./SpaltenWahl";

/**
 * INSEL 1 — DIE GERAETELISTE (`Spec:4490-4553`, §5.6.1; Aufgabe V13).
 *
 * ⛔ DIE PROPS-GRENZE LIEGT GENAU EINMAL: HIER (Entscheidung E-V6,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:603-632`). `GeraeteWerkzeugleiste`,
 * `SpaltenWahl`, `FilterSchublade` und `NeuGeraetModal` bekommen ihre Daten von DIESER
 * Datei, nicht vom Server — sie teilen mit ihr Zustand (`visibleColumns`, `searchFields`,
 * `filters`, gemessen `DeviceList.tsx:49-63`, `:79-94`). Zustand ueber eine RSC-Grenze zu
 * heben ist nicht moeglich; der Versuch endet in einer zweiten Zustandsquelle, die still
 * auseinanderlaeuft.
 *
 * ⛔ WARUM DIE GANZE FLAECHE CLIENT IST — vier Gruende, jeder allein hinreichend:
 *   1. **Falle 9**: die achtzehn Spalten fuehren fuenfzehn `render`-Funktionen
 *      (`deviceColumns.tsx:16-35`). Aus einer Server Component ueber die Grenze gereicht:
 *      `Error: Functions cannot be passed directly to Client Components`.
 *   2. `Grid.useBreakpoint()` (`DeviceList.tsx:36`) ist ein Client-Hook.
 *   3. `usePersistentState` fuer die Spaltenauswahl (`DeviceList.tsx:49-51`) ebenso.
 *   4. **Falle 1**: `Input.Search` und `Space.Compact` in der Werkzeugleiste sind
 *      Compound-Zugriffe — in einer Server Component HTTP 500.
 *
 * ⛔ `COLUMN_DEFS` GEHOERT IN DIESE INSEL UND NICHT NACH `_lib/` — Falle 6 UND Falle 9
 * zugleich (Bauform-Zulaessigkeitstafel Nr. 2, `Spec:4512-4521`). ⚠️ UND DAS IST GENAU DER
 * FEHLER, DEN KEIN VITEST-FALL SIEHT: in jsdom gibt es keine RSC-Grenze, eine
 * `render`-Funktion ist dort ein gewoehnlicher Wert. Der Waechter dagegen ist der
 * Playwright-Fall aus `Spec:4878` — Eigentuemer Aufgabe V23.
 *
 * ⛔ REGIME B: Blaetterung, Sortierung und die zehn Filter laufen ueber die URL. Die Tabelle
 * traegt deshalb `pagination={false}`; die Blaetterung ist eine eigene, URL-schreibende
 * Komponente. Vorbild `lagerbuch/verwaltung/(arbeit)/journal/{page,JournalFilter,JournalTable}.tsx`.
 *
 * ⛔ ALLE ADRESSEN IN DER AEUSSEREN FORM `/admin/...`, nie `/m/radio/admin/...`. Der Grund
 * steht gemessen in `_lib/nav.test.ts:135-150`: ein innerer Pfad fuehrte auf dem
 * Verwaltungshost auf `/m/radio/m/radio/...` — 404, und typecheck wie lint bleiben gruen.
 * ⚠️ NICHT ZU VERWECHSELN mit `revalidatePath`, das die INNERE Form braucht
 * (`admin/actions.ts:179-182`) — es adressiert den Router-Cache, nicht die Adresszeile.
 */

/** Eine Spaltendefinition: Schluessel, Etikett fuer die Auswahl, antd-Spalte. */
export type SpaltenDef = {
  schluessel: string;
  /** Was in der Spaltenauswahl steht — 1:1 `ColumnDef.label` (`deviceColumns.tsx:9`). */
  etikett: string;
  spalte: NonNullable<TableProps<GeraetZeile>["columns"]>[number];
};

/** Der Gedankenstrich des Bestands fuer den Leerwert (`deviceColumns.tsx:19-34`). */
const LEER = "—";

/** `v || '—'` — mit `||` und nicht `??`: alle Spalten sind Freitext, die LEERE Zeichenkette faellt weiter. */
const text = (v: unknown) => (typeof v === "string" && v ? v : LEER);

/**
 * ⛔ DER UPDATE-STAND WANDERT ALS WORT, NICHT ALS FARBE (Falle 3, `Spec:4555-4561`;
 * Regel 4 der Insel-Tafel, `.superpowers/sdd/planteil4/briefs/KOPF.md:1377-1380`).
 * `colorError === colorPrimary` (`src/core/theme/theme.ts:32-33`) — ein rotes Zeichen auf
 * einer Datenflaeche saehe aus wie eine Primaeraktion. Rot bleibt allein den zerstoerenden
 * Knoepfen. ⛔ KEIN `#cf1322` und kein zweiter Hexsatz (NS-A8b, `_lib/status.ts:125`).
 */
const STAND_TON: Record<UpdateStand, "success" | "warning" | undefined> = {
  aktuell: "success",
  veraltet: "warning",
  unbekannt: undefined,
};

const STAND_WORT: Record<UpdateStand, string> = {
  aktuell: "Aktuell",
  veraltet: "Veraltet",
  unbekannt: "Unbekannt",
};

/**
 * DIE ACHTZEHN SPALTEN — ⛔ 1:1 aus `deviceColumns.tsx:16-35`, in dieser Reihenfolge.
 *
 * ⛔ SORTIERBAR SIND SECHS, und ihre Schluessel MUESSEN die des Lesepfads sein
 * (`SORTIER_SCHLUESSEL`, `_lib/lesepfade/geraete.ts:273`). Die Datei dort schreibt aus, was
 * sonst passiert: schriebe die Flaeche `location` und der Lesepfad `lagerort`, blieben
 * typecheck, lint, build und jeder Test gruen — und die Sortierung taete einfach nichts. Der
 * Fall „die sechs sortierbaren Spalten stehen alle in der Sortierliste des Servers" ist der
 * Waechter.
 *
 * ⚠️ ZWEI BENANNTE ABWEICHUNGEN, BEIDE AUS DERSELBEN ENTSCHEIDUNG (E-V7, `_ui/ikonen.tsx`
 * ist die eine Zeichenquelle des Moduls und auf ZWOELF Namen festgenagelt,
 * `_ui/ikonen.test.tsx:108`; die Dateiliste dieser Aufgabe fuehrt sie nicht):
 *   * die Ueberschrift der Abweichungsspalte ist das WORT „Abweichung" statt
 *     `<FiAlertTriangle>` (`deviceColumns.tsx:25`), und die Zelle traegt ein
 *     `Tag color="warning"` statt eines eingefaerbten Zeichens — `color="#d48806"` waere
 *     ausserdem der zweite Hexsatz, den NS-A8b verbietet;
 *   * „Ausleihbar" und „Alamos" zeigen ein „Ja" statt `<FiCheck>` (`:32-33`). Der leere Fall
 *     bleibt LEER, genau wie im Bestand (`null`), nicht „Nein".
 * ⛔ Das ETIKETT der Abweichungsspalte bleibt dagegen zeichengleich „⚠ Abweichung"
 * (`deviceColumns.tsx:25`) — es ist ein Schriftzeichen in einer Zeichenkette, kein Import
 * aus einem Zeichenpaket, und damit weder Falle 7 noch NS-A8b.
 */
export const COLUMN_DEFS: SpaltenDef[] = [
  {
    schluessel: "rufname",
    etikett: "OPTA / Rufname",
    spalte: {
      title: "OPTA / Rufname",
      key: "rufname",
      sorter: true,
      // ⛔ `opta || rufname || '—'` — 1:1 `deviceColumns.tsx:17`, alle drei Lagen.
      render: (_: unknown, d: GeraetZeile) => d.opta || d.rufname || LEER,
    },
  },
  { schluessel: "issi", etikett: "ISSI", spalte: { title: "ISSI", dataIndex: "issi", key: "issi", sorter: true } },
  { schluessel: "tei", etikett: "TEI", spalte: { title: "TEI", dataIndex: "tei", key: "tei", render: text } },
  { schluessel: "funktion", etikett: "Funktion", spalte: { title: "Funktion", dataIndex: "funktion", key: "funktion", render: text } },
  { schluessel: "geraeteTyp", etikett: "Gerät", spalte: { title: "Gerät", dataIndex: "geraeteTyp", key: "geraeteTyp", render: text } },
  {
    schluessel: "updateStand",
    etikett: "Update-Stand",
    spalte: {
      title: "Update-Stand",
      key: "updateStand",
      sorter: true,
      render: (_: unknown, d: GeraetZeile) => (
        <Tag color={STAND_TON[d.updateStand]}>{STAND_WORT[d.updateStand]}</Tag>
      ),
    },
  },
  { schluessel: "status", etikett: "Status", spalte: { title: "Status", dataIndex: "status", key: "status", sorter: true } },
  { schluessel: "lagerort", etikett: "Lagerort", spalte: { title: "Lagerort", dataIndex: "lagerort", key: "lagerort", sorter: true } },
  {
    schluessel: "hatAbweichung",
    etikett: "⚠ Abweichung",
    spalte: {
      title: "Abweichung",
      key: "hatAbweichung",
      align: "center",
      render: (_: unknown, d: GeraetZeile) =>
        d.hatAbweichung ? <Tag color="warning">Abweichung</Tag> : null,
    },
  },
  { schluessel: "hersteller", etikett: "Hersteller", spalte: { title: "Hersteller", dataIndex: "hersteller", key: "hersteller", render: text } },
  { schluessel: "bedieneinheit", etikett: "Bedieneinheit", spalte: { title: "Bedieneinheit", dataIndex: "bedieneinheit", key: "bedieneinheit", render: text } },
  { schluessel: "geraeteFunktionen", etikett: "Gerätefunktionen", spalte: { title: "Gerätefunktionen", dataIndex: "geraeteFunktionen", key: "geraeteFunktionen", render: text } },
  { schluessel: "zuordnung", etikett: "Zuordnung", spalte: { title: "Zuordnung", dataIndex: "zuordnung", key: "zuordnung", render: text } },
  { schluessel: "opta", etikett: "OPTA", spalte: { title: "OPTA", dataIndex: "opta", key: "opta", render: text } },
  { schluessel: "seriennummer", etikett: "Seriennummer", spalte: { title: "Seriennummer", dataIndex: "seriennummer", key: "seriennummer", render: text } },
  {
    schluessel: "ausleihbar",
    etikett: "Ausleihbar",
    spalte: {
      title: "Ausleihbar",
      key: "ausleihbar",
      align: "center",
      render: (_: unknown, d: GeraetZeile) => (d.ausleihbar ? "Ja" : null),
    },
  },
  {
    schluessel: "alamos",
    etikett: "Alamos",
    spalte: {
      title: "Alamos",
      key: "alamos",
      align: "center",
      render: (_: unknown, d: GeraetZeile) => (d.alamos ? "Ja" : null),
    },
  },
  {
    schluessel: "softwareVersion",
    etikett: "Letztes Update",
    spalte: {
      // ⚠️ DIE VERWECHSLUNG IST ECHT UND WANDERT MIT: die Spalte „Letztes Update" zeigt die
      // SOFTWAREVERSION, nicht ein Datum (`deviceColumns.tsx:34`). Derselbe Befund steht in
      // `_lib/lesepfade/geraete.ts:64-70`.
      title: "Letztes Update",
      dataIndex: "softwareVersion",
      key: "softwareVersion",
      sorter: true,
      render: text,
    },
  },
];

/** ⛔ DIE ACHT VORGABESPALTEN — 1:1 `deviceColumns.tsx:37-39` (`DEFAULT_VISIBLE_COLUMNS`). */
export const VORGABE_SPALTEN = [
  "rufname",
  "issi",
  "funktion",
  "geraeteTyp",
  "updateStand",
  "status",
  "lagerort",
  "hatAbweichung",
];

/**
 * Der Speicherschluessel der Spaltenauswahl.
 *
 * ⛔ EIN SUITE-EIGENER NAME, NICHT `ra-device-columns` (`DeviceList.tsx:50`). Die zwei
 * Anwendungen teilen sich nach dem Schwenk denselben Origin; ein Fremdname im `localStorage`
 * der Suite waere genau die Kollision, die niemand sucht.
 *
 * ⛔ UND NUR FUER DIE SPALTEN. `ra-device-search-fields` (`DeviceList.tsx:52-54`) bekommt
 * KEINE Speicherung: die Suchfelder gehen in die Suchparameter (`Spec:4627-4630`) — sonst
 * zeigte ein geteilter Link dem Empfaenger eine andere Trefferliste als dem Absender.
 */
export const SPALTEN_SPEICHER = "iuk-radio-geraete-spalten";

/**
 * Den gespeicherten Wert lesen — ⛔ jeder unbrauchbare Inhalt faellt auf die Vorgabe zurueck.
 * `localStorage` ist von aussen beschreibbar und ueberlebt jede Umbenennung; ein `JSON.parse`
 * ohne Pruefung liesse `{"a":1}` als Spaltenliste durch und die Tabelle bliebe leer.
 */
export function gespeicherteSpalten(roh: string | null): string[] {
  if (roh === null) return [...VORGABE_SPALTEN];
  try {
    const wert: unknown = JSON.parse(roh);
    if (Array.isArray(wert) && wert.every((e) => typeof e === "string")) return wert as string[];
  } catch {
    // Absichtlich still: ein kaputter Speicherwert ist kein Fehler der Flaeche.
  }
  return [...VORGABE_SPALTEN];
}

/**
 * DER SPALTENSPEICHER ALS EXTERNE QUELLE — `useSyncExternalStore` und NICHT `useEffect`.
 *
 * ⛔ ZWEI GRUENDE, UND BEIDE SIND HART:
 *   1. `useState(() => localStorage.…)` liefe auf dem Server gar nicht und erzeugte im
 *      Browser eine Hydrationsabweichung — React verwuerfe den Baum und rendert neu
 *      (die Klasse, die `qr/_lib/test-dom.tsx:42-45` gemessen beschreibt).
 *   2. Der Umweg ueber einen Effekt, der `setState` ruft, ist in diesem Repo ein
 *      LINT-FEHLER (`react-hooks/set-state-in-effect`, gemessen an genau dieser Stelle) —
 *      und die Regel hat recht: er rendert zweimal und zeigt einen Frame lang die
 *      Vorgabespalten, obwohl eine Auswahl gespeichert ist.
 *
 * ⛔ `schnappschuss` MUSS BEI UNVERAENDERTEM SPEICHER DIESELBE REFERENZ LIEFERN, sonst
 * rendert React endlos. Deshalb der Zwischenspeicher auf dem ROHEN Text.
 */
const ZUHOERER = new Set<() => void>();
let ZWISCHENSPEICHER: { roh: string | null; wert: string[] } = {
  roh: null,
  wert: VORGABE_SPALTEN,
};

function abonniere(melde: () => void): () => void {
  ZUHOERER.add(melde);
  return () => {
    ZUHOERER.delete(melde);
  };
}

function schnappschuss(): string[] {
  let roh: string | null = null;
  try {
    roh = window.localStorage.getItem(SPALTEN_SPEICHER);
  } catch {
    // Ein gesperrter Speicher ist kein Fehler der Flaeche — die Vorgabe traegt weiter.
    return VORGABE_SPALTEN;
  }
  if (roh !== ZWISCHENSPEICHER.roh) {
    ZWISCHENSPEICHER = { roh, wert: gespeicherteSpalten(roh) };
  }
  return ZWISCHENSPEICHER.wert;
}

/** Auf dem Server und waehrend der Hydration gilt die Vorgabe — es gibt dort keinen Speicher. */
function serverSchnappschuss(): string[] {
  return VORGABE_SPALTEN;
}

function merkeSpaltenAuswahl(naechste: string[]): void {
  try {
    window.localStorage.setItem(SPALTEN_SPEICHER, JSON.stringify(naechste));
  } catch {
    // dito — die Auswahl gilt dann nur fuer diese Sitzung.
  }
  for (const melde of ZUHOERER) melde();
}

/**
 * ⛔ 1:1 aus `buildColumns` (`deviceColumns.tsx:41-46`): „preserving COLUMN_DEFS order.
 * Unknown stored keys are ignored." BEIDE Haelften sind tragend — ein `map` ueber die
 * GESPEICHERTE Liste kehrte die Reihenfolge um und liesse einen unbekannten Schluessel als
 * `undefined` in das `columns`-Array.
 */
export function baueSpalten(sichtbar: string[]): NonNullable<TableProps<GeraetZeile>["columns"]> {
  const gewaehlt = new Set(sichtbar);
  return COLUMN_DEFS.filter((d) => gewaehlt.has(d.schluessel)).map((d) => d.spalte);
}

/** Die Optionen der Spaltenauswahl — abgeleitet, nie zweitgeschrieben (`ColumnPicker.tsx:16`). */
const SPALTEN_OPTIONEN: SpaltenOption[] = COLUMN_DEFS.map((d) => ({
  schluessel: d.schluessel,
  etikett: d.etikett,
}));

export type GeraeteTabelleProps = {
  zeilen: GeraetZeile[];
  gesamt: number;
  seite: number;
  seitenGroesse: number;
  sortierung: string | null;
  filter: GeraetFilterWerte;
  /**
   * ⚠️ BENANNTE ABWEICHUNG VON `Spec:4503`: die Spec zaehlt neun Props und fuehrt weder den
   * Suchtext noch die Suchfelder. Beide gehoeren aber in die Suchparameter
   * (`Spec:4627-4630`) — die Insel kann das Suchfeld also nicht mit seinem aktuellen Wert
   * zeichnen und die Haken der Feldauswahl nicht setzen, ohne sie zu bekommen. Die
   * Alternative waere ein zweiter Griff nach `window.location` IN der Insel: eine zweite
   * Wahrheit ueber denselben Wert, und genau die Klasse, gegen die E-V6 die Grenze auf EINE
   * Stelle legt. ⛔ Beide sind skalar und serialisierbar; die Grenze bleibt, wo sie ist.
   */
  suchtext: string;
  suchfelder: string[];
  vorschlaege: Record<Vorschlagsfeld, string[]>;
  /** ⛔ BOOLEANS, keine Funktionen und keine Viewer-Objekte — 1:1 `DeviceList.tsx:150`. */
  darfAnlegen: boolean;
  darfExportieren: boolean;
};

/**
 * DIE BLAETTERUNG — eine eigene, URL-schreibende Komponente (Regime B).
 *
 * ⛔ KEIN GROESSENWECHSLER (1:1 `DeviceList.tsx:168`, `showSizeChanger: false`) und kein
 * `size` (Falle 4).
 */
function Blaetterung({
  seite,
  gesamt,
  seitenGroesse,
  aufSeite,
}: {
  seite: number;
  gesamt: number;
  seitenGroesse: number;
  aufSeite: (naechste: number) => void;
}) {
  const seiten = Math.max(1, Math.ceil(gesamt / seitenGroesse));
  return (
    <div className={s.blaetterung} data-rolle="radio-blaetterung">
      <span className={s.blaetterungText}>
        Seite {seite} von {seiten} · {gesamt} Geräte
      </span>
      {/*
        ⛔ antd-`Button` UND KEIN NACKTES `<button>`: antd 6 ist das Design-System der Suite
        (`CLAUDE.md`), und ein handzurueckgesetzter Knopf braeuchte ein `background`, das
        `_ui/verwaltung-css.test.ts:158-165` zu Recht als verdrahteten Flaechenwert meldet
        (gemessen: `background: none` faerbte den Waechter rot). ⛔ OHNE `size` — Falle 4.
      */}
      <Button
        data-rolle="radio-blaettern-zurueck"
        disabled={seite <= 1}
        onClick={() => aufSeite(seite - 1)}
      >
        Zurück
      </Button>
      <Button
        data-rolle="radio-blaettern-vor"
        disabled={seite >= seiten}
        onClick={() => aufSeite(seite + 1)}
      >
        Weiter
      </Button>
    </div>
  );
}

export function GeraeteTabelle({
  zeilen,
  gesamt,
  seite,
  seitenGroesse,
  sortierung,
  filter,
  suchtext,
  suchfelder,
  vorschlaege,
  darfAnlegen,
  darfExportieren,
}: GeraeteTabelleProps) {
  const router = useRouter();
  const pfad = usePathname();
  const bildschirm = Grid.useBreakpoint();
  const breit = bildschirm.md === true;

  const spalten = useSyncExternalStore(abonniere, schnappschuss, serverSchnappschuss);
  const [filterOffen, setFilterOffen] = useState(false);
  const [anlegenOffen, setAnlegenOffen] = useState(false);

  /**
   * ⛔ DER EINE SCHREIBWEG IN DIE ADRESSZEILE. Er legt IMMER den vollstaendigen Patch auf die
   * bestehende Abfrage (`suchparameterZu` fuehrt alle vierzehn Schluessel, auch die leeren) —
   * das ist der Alt-Satz „so that clearing a filter actually removes it from params"
   * (`DeviceList.tsx:77-78`) in seiner URL-Form.
   *
   * ⛔ `replace`, NICHT `push` (Vorbild `lagerbuch/_ui/useUrlFilter.ts:27`): Filtereingaben
   * gehoeren nicht in die Browser-Historie, sonst kostet „zurueck" so viele Klicks, wie
   * jemand Haken gesetzt hat.
   */
  const schreibeUrl = useCallback(
    (werte: GeraeteSuchWerte) => {
      const bestand = new URLSearchParams(
        typeof window === "undefined" ? "" : window.location.search,
      );
      const abfrage = angewandt(bestand, suchparameterZu(werte)).toString();
      router.replace(abfrage ? `${pfad}?${abfrage}` : pfad, { scroll: false });
    },
    [router, pfad],
  );

  /** Der aktuelle Stand als ein Wert — die Grundlage jeder Schreibung. */
  const stand: GeraeteSuchWerte = {
    q: suchtext,
    sf: suchfelder,
    seite,
    sortierung: sortierung ?? "",
    filter,
  };

  /* ⛔ JEDE AENDERUNG AN SUCHE ODER FILTER SETZT AUF SEITE 1 ZURUECK — 1:1 `DeviceList.tsx:71`, `:92`. */
  const gelesen = sortierungLesen(stand.sortierung);
  const spaltenSortierung = (schluessel: string): "descend" | "ascend" | null => {
    if (gelesen?.schluessel !== schluessel) return null;
    return gelesen.richtung === "desc" ? "descend" : "ascend";
  };

  const sichtbareSpalten = baueSpalten(spalten).map((spalte) =>
    spalte.sorter
      ? { ...spalte, sortOrder: spaltenSortierung(String(spalte.key ?? "")) }
      : spalte,
  );

  return (
    <>
      <GeraeteWerkzeugleiste
        suchtext={suchtext}
        suchfelder={suchfelder}
        spalten={spalten}
        spaltenOptionen={SPALTEN_OPTIONEN}
        filter={filter}
        darfAnlegen={darfAnlegen}
        darfExportieren={darfExportieren}
        aufSuchtext={(q) => schreibeUrl({ ...stand, q, seite: 1 })}
        aufSuchfelder={(sf) => schreibeUrl({ ...stand, sf, seite: 1 })}
        aufSpalten={merkeSpaltenAuswahl}
        aufFilterOeffnen={() => setFilterOffen(true)}
        aufAnlegen={() => setAnlegenOffen(true)}
      />

      {breit ? (
        <Table<GeraetZeile>
          rowKey="id"
          columns={sichtbareSpalten}
          dataSource={zeilen}
          /*
            ⛔ `pagination={false}` — die Blaetterung laeuft ueber die URL (Regime B,
            antd-Zuordnung `.superpowers/sdd/planteil4/briefs/KOPF.md:1053`). ⚠️ Ein
            versehentlich eingeschaltetes `pagination` faellt in Vitest NICHT auf: jsdom
            zeigte dann eine zweite, rein clientseitige Blaetterung ueber den bereits
            geschnittenen zwanzig Zeilen. Der Waechter ist der Playwright-Fall (V23).
          */
          pagination={false}
          /* Ohne `scroll` bricht eine antd-Tabelle auf 390 px (`aufgaben/_ui/RoutinenTabelle.tsx:33-34`). */
          scroll={{ x: "max-content" }}
          aria-label="Geräteliste"
          locale={{ emptyText: "Kein Gerät gefunden" }}
          onChange={(_blaetterung, _filter, sortierer) => {
            /*
             * ⛔ 1:1 AUS `DeviceList.tsx:114-130`: aus dem Sortierereignis wird
             * `schluessel:asc|desc`. Der Unterschied zum Bestand ist das ZIEL — dort ein
             * lokales `setParams`, hier die Adresszeile. Ein unbekannter Schluessel ergibt
             * die leere Sortierung (`sortierungZeichenkette`, E-V9).
             */
            const einzeln = Array.isArray(sortierer) ? sortierer[0] : sortierer;
            schreibeUrl({
              ...stand,
              sortierung: sortierungZeichenkette(einzeln?.columnKey, einzeln?.order),
              seite: 1,
            });
          }}
          onRow={(zeile) => ({
            className: s.tabelleZeile,
            onClick: () => router.push(`/admin/geraete/${zeile.id}`),
          })}
        />
      ) : (
        /*
         * DER MOBILE ZWEIG — 1:1 aus `DeviceList.tsx:188-231`, ⛔ IN DERSELBEN INSEL, weil
         * `Grid.useBreakpoint()` ein Client-Hook ist und `renderItem` Falle 9 waere.
         * ⛔ OHNE `List`-eigene Blaetterung (`DeviceList.tsx:192-197`): sie liefe gegen die
         * URL-Blaetterung darunter.
         */
        <List
          dataSource={zeilen}
          locale={{ emptyText: "Kein Gerät gefunden" }}
          renderItem={(zeile) => (
            <List.Item>
              <Card
                hoverable
                className={s.mobilKarte}
                onClick={() => router.push(`/admin/geraete/${zeile.id}`)}
              >
                <div className={s.mobilKopf}>
                  <span className={s.mobilName}>
                    {zeile.rufname || zeile.opta || zeile.issi}
                  </span>
                  <Tag color={STAND_TON[zeile.updateStand]}>{STAND_WORT[zeile.updateStand]}</Tag>
                </div>
                <span className={s.mobilNeben}>ISSI: {zeile.issi}</span>
                {(zeile.funktion || zeile.geraeteTyp) && (
                  <span className={s.mobilNeben}>
                    {[zeile.funktion, zeile.geraeteTyp].filter(Boolean).join(" · ")}
                  </span>
                )}
                <div className={s.mobilMarken}>
                  {zeile.lagerort && <Tag>{zeile.lagerort}</Tag>}
                  {/* Die Marke „Abweichung" 1:1 aus `DeviceList.tsx:220-224`, ohne Zeichen (E-V7). */}
                  {zeile.hatAbweichung && <Tag color="warning">Abweichung</Tag>}
                </div>
              </Card>
            </List.Item>
          )}
        />
      )}

      <Blaetterung
        seite={seite}
        gesamt={gesamt}
        seitenGroesse={seitenGroesse}
        aufSeite={(naechste) => schreibeUrl({ ...stand, seite: naechste })}
      />

      {/*
        ⛔ SCHUBLADE UND DIALOG WERDEN NUR IM OFFENEN ZUSTAND EINGEHAENGT. Das ist die
        Suite-Form von `destroyOnHidden` (`DeviceFilterDrawer.tsx:70`,
        `DeviceFormModal.tsx:95`): jedes Oeffnen bekommt einen frischen Entwurf, ohne dass
        ein Effekt ihn zuruecksetzen muss — und ein solcher Effekt waere hier ein
        Lint-Fehler (`react-hooks/set-state-in-effect`).
      */}
      {filterOffen && (
        <FilterSchublade
          wert={filter}
          vorschlaege={vorschlaege}
          aufSchliessen={() => setFilterOffen(false)}
          aufAnwenden={(naechste) => {
            setFilterOffen(false);
            schreibeUrl({ ...stand, filter: naechste, seite: 1 });
          }}
        />
      )}

      {darfAnlegen && anlegenOffen && (
        <NeuGeraetModal aufSchliessen={() => setAnlegenOffen(false)} />
      )}
    </>
  );
}
