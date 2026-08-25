"use client";

// src/app/m/radio/admin/(arbeit)/ausleihen/AusleihenTabelle.tsx
import { useCallback } from "react";
import { Button, Card, DatePicker, Grid, List, Select, Table, Tag, type TableColumnType } from "antd";
import dayjs from "dayjs";
import { usePathname, useRouter } from "next/navigation";
import type { AusleihZeile, GeraetWahl } from "../../../_lib/lesepfade/ausleihen";
import {
  angewandt,
  ausleihenSuchparameterZu,
  istKalendertag,
  LEERER_AUSLEIHEN_FILTER,
  type AusleihenFilterWerte,
  type AusleihenSuchWerte,
} from "../../../_lib/suchparameter";
import s from "../../../_ui/verwaltung.module.css";

/**
 * INSEL 2 — DIE AUSLEIHENLISTE DER VERWALTUNG (`Spec:4498-4506`, §5.9; Aufgabe V16).
 *
 * ⛔ WARUM CLIENT — **Falle 9** (Bauform-Zulaessigkeitstafel Nr. 1, `CLAUDE.md`): die sieben
 * Spalten fuehren sieben `render`-Funktionen. Eine `render`-Funktion, die in einer Server
 * Component entstuende, ist eine gewoehnliche Funktion — keine Server Action —, und React
 * lehnt ab, sie ueber die RSC-Grenze zu reichen
 * (`Error: Functions cannot be passed directly to Client Components`). Dazu kommen
 * `Grid.useBreakpoint()` (ein Client-Hook, Nr. 5), `renderItem` des mobilen Zweigs und die
 * zustandshaltenden Bedienelemente des Filters. ⚠️ Weder `typecheck` noch `lint` noch `build`
 * sehen das, und jsdom kann es STRUKTURELL nicht sehen — dort gibt es keine RSC-Grenze. Der
 * Waechter ist der Playwright-Fall aus `Spec:4881-4882` (Fall 5), Eigentuemer Aufgabe V23.
 *
 * ⛔ JEDE ZEILE KOMMT VORFORMATIERT: kein `Date` und kein Rohzeitstempel
 * (Bauform-Zulaessigkeitstafel Nr. 7, `Spec:4536-4539`) — was an einer Uhr haengt, entsteht
 * auf dem Server (`_db/leihen.ts`, `ausgeliehenText`/`zurueckText`), sonst entscheiden Server
 * und Client an der Tagesgrenze verschieden (`Spec:3341-3342`).
 *
 * ⛔ DER TYP KOMMT ALS `import type` IN EINER EIGENEN ANWEISUNG, nie als `type` in einer
 * gemischten Klammer: `_lib/lesepfade/ausleihen.ts` importiert `_db/leihen.ts` als WERT, und
 * das zieht `drizzle-orm` und `better-sqlite3` (`_lib/csv/klassifizieren.ts:6-9`: „weder
 * `typecheck` noch `lint` noch `build` saehen es").
 *
 * ⛔ SECHS PROPS, NICHT DREI — UND DAS IST EINE BENANNTE ABWEICHUNG VON `Spec:4504`. Die Spec
 * schliesst den Vertrag bei `{ zeilen, gesamt, seite }`; die Betreiberentscheidung ⬜ **V-L11**
 * vom 2026-08-24 (`.superpowers/sdd/planteil4/progress.md`, Abschnitt „✅ V-L11": „Beides.")
 * verlangt einen Filter nach Geraet UND Zeitraum, und der Dreiervertrag kann ihn nicht tragen
 * (Vorabscan-Fund F3, `.superpowers/sdd/planteil4/VORABSCAN.md:126-150`). Dazu kommt
 * `seitenGroesse`, weil die Blaetterung dieselbe Zahl anzeigen muss, die die Abfrage benutzt
 * hat. ⛔ ALLE SECHS SIND SKALAR ODER EINE LISTE SKALARER WERTE.
 *
 * ⛔ FILTER UND BLAETTERUNG LIEGEN IN DERSELBEN INSEL, weil hier der EINE Schreibweg in die
 * Adresszeile liegt (Vorbild `geraete/GeraeteTabelle.tsx`). Zwei unabhaengige Schreiber
 * derselben Adresse haetten keinen Eigentuemer fuer das Zuruecksetzen auf Seite 1.
 *
 * ⛔ DIE 1:1-UNTERGRENZE BLEIBT UNANGETASTET (Auflage aus derselben Entscheidung: „die
 * Grundliste, ihre Sortierung und ihre Spalten bleiben, wie der Bestand sie hat; der Filter
 * kommt HINZU"): sieben Spalten in ihrer Reihenfolge (`LoanList.tsx:15-47`), feste Sortierung
 * `desc(borrowedAt)` ohne Sortierpfeil (`loanRepo.ts:153`), Seitengroesse zwanzig ohne
 * Groessenwechsler (`LoanList.tsx:8`, `:66`).
 *
 * ⛔ KEIN `size` (Falle 4): die Verwaltung laeuft in `FullShell` mit `controlHeight: 44`
 * (`src/core/theme/theme.ts:207-209`), auch auf dem Telefon. Platz schafft
 * `scroll={{ x: "max-content" }}`.
 */

/** Der Gedankenstrich dieses Moduls — dieselbe Wahl wie `GeraeteTabelle.tsx:69`. */
const LEER = "—";

/**
 * Der Rueckfall an der PROPS-GRENZE, 1:1 aus `LoanList.tsx:21` und `:45`
 * (je `render: (v) => v || '—'`).
 *
 * ⛔ MIT `||` UND NICHT `??`: beide Spalten sind Freitext (`_db/schema.ts:216`, `:221`), die
 * LEERE Zeichenkette muss weiterfallen.
 *
 * ⚠️ ⛔ NUR FUER TYP UND NOTIZ. `zurueckText` faltet der Lesepfad bereits, und das mit
 * Absicht: seine Faltung ist eine ZEITFORMATIERUNG und gehoert auf den Server
 * (`_db/leihen.ts`, `ZURUECK_OFFEN`; im Bestand tut `formatTimestamp(null)` beides in einer
 * Funktion, `format.ts:2-4`).
 */
const wert = (v: string | null) => v || LEER;

/**
 * DAS STATUSZEICHEN — Entscheidung **E-V14**, 1:1 aus `LoanList.tsx:10-13` („Active vs.
 * returned status, derived purely from `returnedAt`").
 *
 * ⛔ DIE ABLEITUNG STEHT NICHT HIER, SONDERN IM LESEPFAD: `aktiv` IST `returnedAt === null`
 * (`_db/leihen.ts`). Diese Insel liest den fertigen Wahrheitswert — nie die Spalte
 * `devices.status` und nie einen zweiten Zustandsbegriff.
 *
 * ⛔ DER TON IST NIE DER EINZIGE TRAEGER (Falle 3): beide Zustaende tragen ihr WORT,
 * zeichengleich aus dem Bestand. `color="processing"` ist antds blauer Vorgabeton und in
 * `FullShell` unauffaellig — ⛔ und ausdruecklich KEIN zweiter Hexsatz, den NS-A8b verboete
 * (`_lib/status.ts:125`).
 */
function StatusMarke({ aktiv }: { aktiv: boolean }) {
  return aktiv ? (
    <Tag color="processing" data-rolle="radio-leihe-status">
      Aktiv
    </Tag>
  ) : (
    <Tag data-rolle="radio-leihe-status">Zurückgegeben</Tag>
  );
}

/**
 * DIE SIEBEN SPALTEN, 1:1 AUS `LoanList.tsx:15-47` — in dieser Reihenfolge.
 *
 * ⛔ KEINE TRAEGT EINEN `sorter`. `leihhistorie` sortiert IMMER `desc(borrowedAt)`, ohne
 * Parameter (1:1 `loanRepo.ts:153`); ein `sorter` ergaebe eine antd-INTERNE Sortierung ueber
 * der bereits geschnittenen Seite — die Reihenfolge auf dem Bildschirm waere eine andere als
 * die der Abfrage, und zwar nur auf der gerade sichtbaren Seite.
 *
 * ⛔ EXPORTIERT, DAMIT DIE ZELLEN OHNE TABELLE PRUEFBAR SIND: in jsdom rendert diese Insel
 * den MOBILEN Zweig (`vitest.setup.ts` stubt `matchMedia` mit `matches: false`), der
 * Tabellenkopf entsteht dort nie. Der Grund steht im Kopf von `AusleihenTabelle.test.tsx`.
 */
export const SPALTEN: TableColumnType<AusleihZeile>[] = [
  {
    title: "Gerät",
    key: "rufname",
    // Der unveraenderliche Anzeige-Schnappschuss der Leihzeile, kein Join auf `devices`.
    render: (_: unknown, z: AusleihZeile) => (
      <span data-rolle="radio-leihe-geraet">{z.rufname}</span>
    ),
  },
  {
    title: "Typ",
    key: "geraetetyp",
    render: (_: unknown, z: AusleihZeile) => (
      <span data-rolle="radio-leihe-typ">{wert(z.geraetetyp)}</span>
    ),
  },
  {
    title: "Ausleihende:r",
    key: "entleiher",
    render: (_: unknown, z: AusleihZeile) => (
      <span data-rolle="radio-leihe-entleiher">{z.entleiher}</span>
    ),
  },
  {
    title: "Ausgeliehen",
    key: "ausgeliehen",
    render: (_: unknown, z: AusleihZeile) => (
      <span data-rolle="radio-leihe-ausgeliehen">{z.ausgeliehenText}</span>
    ),
  },
  {
    title: "Zurückgegeben",
    key: "zurueck",
    render: (_: unknown, z: AusleihZeile) => (
      <span data-rolle="radio-leihe-zurueck">{z.zurueckText}</span>
    ),
  },
  {
    title: "Status",
    key: "status",
    render: (_: unknown, z: AusleihZeile) => <StatusMarke aktiv={z.aktiv} />,
  },
  {
    title: "Notiz",
    key: "notiz",
    render: (_: unknown, z: AusleihZeile) => (
      <span data-rolle="radio-leihe-notiz">{wert(z.notiz)}</span>
    ),
  },
];

export type AusleihenTabelleProps = {
  zeilen: AusleihZeile[];
  /** ⛔ Die GEFILTERTE Menge, nicht die Seite — die Blaetterung haengt an dieser Zahl. */
  gesamt: number;
  seite: number;
  seitenGroesse: number;
  filter: AusleihenFilterWerte;
  /** ⛔ Nur Geraete, die ueberhaupt eine Leihzeile haben — die Begruendung steht in `_db/leihen.ts`. */
  geraete: GeraetWahl[];
};

/**
 * DIE FILTERLEISTE (⬜ **V-L11**).
 *
 * ⛔ DIE BESCHRIFTUNG DER ZWEI DATUMSFELDER IST FACHLICH UND NICHT KOSMETISCH: das Fenster
 * steht auf `borrowedAt` und nicht auf einer Ueberlappung (1:1 `loanRepo.ts:140-141`,
 * ausgeschrieben in `_db/leihen.ts`). „Zeitraum von/bis" liesse den Bedienenden glauben, er
 * sehe jede Leihe, die an diesem Tag LIEF — ⬜ **V16-L1** in `_lib/suchparameter.ts`.
 *
 * ⛔ `dayjs` LEBT NUR HIER, NICHT AN DER PROPS-GRENZE: hinueber gehen `YYYY-MM-DD`-Zeichenketten
 * (Bauform-Zulaessigkeitstafel Nr. 7). Dieselbe Form wie im Hausvorbild
 * `lagerbuch/verwaltung/(arbeit)/journal/JournalFilter.tsx`.
 *
 * ⛔ DIE INSEL PRUEFT DEN TAG NOCH EINMAL, obwohl der Server nur geprueftes liefert: `value=`
 * eines `DatePicker` ist der Ort, an dem ein defekter Wert zu einem Absturz wird, und der
 * Vertrag ist eine Zeichenkette.
 */
function Filterleiste({
  filter,
  geraete,
  aufFilter,
}: {
  filter: AusleihenFilterWerte;
  geraete: GeraetWahl[];
  aufFilter: (naechster: AusleihenFilterWerte) => void;
}) {
  const tag = (roh: string) => (istKalendertag(roh) ? dayjs(roh) : null);
  const gesetzt = filter.geraet !== "" || filter.von !== "" || filter.bis !== "";

  return (
    <div className={s.werkzeugleiste} data-rolle="radio-ausleihen-filter">
      <Select
        data-rolle="radio-ausleihen-geraetefeld"
        allowClear
        showSearch
        optionFilterProp="label"
        aria-label="Gerät"
        placeholder="Alle Geräte"
        className={s.suchfeld}
        value={filter.geraet || undefined}
        onChange={(gewaehlt) => aufFilter({ ...filter, geraet: gewaehlt ?? "" })}
        options={geraete.map((g) => ({ value: g.id, label: g.rufname }))}
      />
      <DatePicker
        aria-label="Ausgeliehen von"
        format="DD.MM.YYYY"
        value={tag(filter.von)}
        // ⛔ Die Adresszeile fuehrt IMMER `YYYY-MM-DD` — die deutsche Anzeigeform oben ist
        // Darstellung, der Vertrag ist es nicht (`_lib/suchparameter.ts`, `TAG_MUSTER`).
        onChange={(gewaehlt) =>
          aufFilter({ ...filter, von: gewaehlt ? gewaehlt.format("YYYY-MM-DD") : "" })
        }
      />
      <DatePicker
        aria-label="Ausgeliehen bis"
        format="DD.MM.YYYY"
        value={tag(filter.bis)}
        onChange={(gewaehlt) =>
          aufFilter({ ...filter, bis: gewaehlt ? gewaehlt.format("YYYY-MM-DD") : "" })
        }
      />
      {gesetzt && (
        <Button
          data-rolle="radio-ausleihen-filter-zuruecksetzen"
          /*
           * ⛔ DER LEERE FILTER STEHT AN EINER STELLE (`_lib/suchparameter.ts`,
           * `LEERER_AUSLEIHEN_FILTER`) UND NICHT ZWEIMAL. Ein hier von Hand hingeschriebenes
           * Literal liefe beim naechsten Filterfeld auseinander — und keine Messung hielte die
           * beiden Fassungen zusammen (Schlusspruefung V16, Fund 2).
           */
          onClick={() => aufFilter(LEERER_AUSLEIHEN_FILTER)}
        >
          Zurücksetzen
        </Button>
      )}
    </div>
  );
}

/**
 * DIE BLAETTERUNG — eine eigene, URL-schreibende Komponente (Regime B), zeichengleich zur
 * Form der Geraeteliste (`geraete/GeraeteTabelle.tsx`).
 *
 * ⛔ KEIN GROESSENWECHSLER (1:1 `LoanList.tsx:66`, `showSizeChanger: false`) und kein `size`
 * (Falle 4).
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
      <span className={s.blaetterungText} data-rolle="radio-blaetterung-text">
        Seite {seite} von {seiten} · {gesamt} Ausleihen
      </span>
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

export function AusleihenTabelle({
  zeilen,
  gesamt,
  seite,
  seitenGroesse,
  filter,
  geraete,
}: AusleihenTabelleProps) {
  const router = useRouter();
  const pfad = usePathname();
  const bildschirm = Grid.useBreakpoint();
  const breit = bildschirm.md === true;

  /**
   * ⛔ DER EINE SCHREIBWEG IN DIE ADRESSZEILE. Er legt IMMER den vollstaendigen Patch auf die
   * bestehende Abfrage (`ausleihenSuchparameterZu` fuehrt alle vier Schluessel, auch die
   * leeren) — sonst bliebe ein geleerter Filter dort stehen (`DeviceList.tsx:77-78` in seiner
   * URL-Form).
   *
   * ⛔ `replace`, NICHT `push` (Vorbild `lagerbuch/_ui/useUrlFilter.ts:27`): Filtereingaben
   * gehoeren nicht in die Browser-Historie.
   */
  const schreibeUrl = useCallback(
    (werte: AusleihenSuchWerte) => {
      const bestand = new URLSearchParams(
        typeof window === "undefined" ? "" : window.location.search,
      );
      const abfrage = angewandt(bestand, ausleihenSuchparameterZu(werte)).toString();
      router.replace(abfrage ? `${pfad}?${abfrage}` : pfad, { scroll: false });
    },
    [router, pfad],
  );

  const stand: AusleihenSuchWerte = { ...filter, seite };

  return (
    <div data-rolle="radio-ausleihen-flaeche">
      <Filterleiste
        filter={filter}
        geraete={geraete}
        /* ⛔ JEDE AENDERUNG AM FILTER SETZT AUF SEITE 1 ZURUECK — 1:1 `DeviceList.tsx:71`, `:92`. */
        aufFilter={(naechster) => schreibeUrl({ ...naechster, seite: 1 })}
      />

      {breit ? (
        <Table<AusleihZeile>
          rowKey="id"
          columns={SPALTEN}
          dataSource={zeilen}
          /*
            ⛔ `pagination={false}` — die Blaetterung laeuft ueber die URL (Regime B,
            antd-Zuordnung `.superpowers/sdd/planteil4/briefs/KOPF.md:1053`). ⚠️ Ein
            versehentlich eingeschaltetes `pagination` faellt in Vitest NICHT auf: jsdom zeigte
            dann eine zweite, rein clientseitige Blaetterung ueber den bereits geschnittenen
            zwanzig Zeilen. Der Waechter ist der Quelltext-Scan in der Testdatei und der
            Playwright-Fall (V23).
          */
          pagination={false}
          /* Ohne `scroll` bricht eine antd-Tabelle auf 390 px (`aufgaben/_ui/RoutinenTabelle.tsx:33-34`). */
          scroll={{ x: "max-content" }}
          aria-label="Ausleihen"
          locale={{ emptyText: "Keine Ausleihe gefunden" }}
        />
      ) : (
        /*
         * DER MOBILE ZWEIG — 1:1 aus `LoanList.tsx:86-…`, ⛔ IN DERSELBEN INSEL, weil
         * `Grid.useBreakpoint()` ein Client-Hook ist und `renderItem` Falle 9 waere.
         * ⛔ OHNE `List`-eigene Blaetterung (`LoanList.tsx:89-94`): sie liefe gegen die
         * URL-Blaetterung darunter.
         * ⚠️ BENANNTE BAUFORM-WAHL: der Bestand baut die Karte aus `Typography.Text`; hier
         * stehen dieselben Angaben in den Klassen dieses Moduls (`GeraeteTabelle.tsx`,
         * mobiler Zweig). Der Inhalt wandert, das Bauteil ist das des Hauses.
         */
        <List
          dataSource={zeilen}
          locale={{ emptyText: "Keine Ausleihe gefunden" }}
          renderItem={(z) => (
            <List.Item>
              <Card className={s.mobilKarte}>
                <div className={s.mobilKopf}>
                  <span className={s.mobilName} data-rolle="radio-leihe-mobil-name">
                    {z.rufname}
                  </span>
                  <StatusMarke aktiv={z.aktiv} />
                </div>
                <span className={s.mobilNeben} data-rolle="radio-leihe-mobil-entleiher">
                  {z.entleiher}
                </span>
                <span className={s.mobilNeben} data-rolle="radio-leihe-mobil-ausgeliehen">
                  Ausgeliehen: {z.ausgeliehenText}
                </span>
                {/* ⛔ 1:1: die Rueckgabezeile steht NUR bei einer zurueckgegebenen Leihe (`LoanList.tsx:104-108`). */}
                {!z.aktiv && (
                  <span className={s.mobilNeben} data-rolle="radio-leihe-mobil-zurueck">
                    Zurückgegeben: {z.zurueckText}
                  </span>
                )}
                {z.notiz && (
                  <span className={s.mobilNeben} data-rolle="radio-leihe-mobil-notiz">
                    {z.notiz}
                  </span>
                )}
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
    </div>
  );
}
