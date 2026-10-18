"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Button, Card, type TableProps } from "antd";
import {
  Kartentabelle,
  nachDatum,
  nachRang,
  nachText,
  nachZahl,
  trifftWert,
  werteAlsFilter,
  Zellentext,
  zustandsFilter,
} from "@/core/tabelle";
import { SPACE } from "@/core/theme/tokens";
import type { AmpelTon } from "../../../../_lib/format";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Chip } from "../../../../_ui/Chip";
import type { IkonName } from "../../../../_ui/ikonen";
import {
  abgleichWeichtAb,
  adresseMitAlle,
  flascheWeichtAb,
  geraetWeichtAb,
  nachfuellungWeichtAb,
  verfallWeichtAb,
  type AbschnittSchluessel,
} from "./abweichungen";

export type DetailChipAnzeige = {
  text: string;
  ton: AmpelTon;
  zeichen: IkonName | null;
};

export type AbgleichAnzeigeZeile = {
  id: string;
  artikel: string;
  sollText: string;
  istText: string;
  korrekturText: string;
  nachgefuelltText: string;
  /**
   * Die vier Zahlen und die Offen-Menge als Zahl — allein fuer die Sortierung.
   * ⚠️ Die `…Text`-Felder sind `String(…)` und ordneten als Zeichenkette „10"
   * vor „2"; die Begruendung steht an der Zeilenquelle (`page.tsx`).
   */
  sollZahl: number;
  istZahl: number;
  korrekturZahl: number;
  nachgefuelltZahl: number;
  offenZahl: number;
  offenChip: DetailChipAnzeige;
};

export type NachfuellAnzeigeZeile = {
  id: string;
  fachText: string;
  artikelText: string;
  einheitText: string;
  sollText: string;
  istText: string;
  /** Rohzahlen fuer die Sortierung, s. `AbgleichAnzeigeZeile`. */
  sollZahl: number;
  istZahl: number;
  lueckeZahl: number;
  lueckeChip: DetailChipAnzeige;
};

export type GeraetAnzeigeZeile = {
  id: string;
  name: string;
  vorhandenChip: DetailChipAnzeige;
  zustandChip: DetailChipAnzeige;
  bemerkungText: string;
};

export type FlascheAnzeigeZeile = {
  id: string;
  name: string;
  druck: {
    darstellung: "chip" | "mono";
    text: string;
    ton: AmpelTon | null;
  };
  /** Der Druck als Zahl — allein fuer die Sortierung, `null` heisst ungemessen. */
  druckZahl: number | null;
  fuellstandChip: DetailChipAnzeige;
};

export type VerfallAnzeigeZeile = {
  id: string;
  artikel: string;
  /** „YYYY-MM" — Anzeige UND Sortierschluessel zugleich, deshalb ohne Rohfeld. */
  verfallText: string;
  statusChip: DetailChipAnzeige;
};

export type CheckDetailTabellenProps = {
  abgleichZeilen: AbgleichAnzeigeZeile[];
  nachfuellZeilen: NachfuellAnzeigeZeile[];
  geraeteZeilen: GeraetAnzeigeZeile[];
  flaschenZeilen: FlascheAnzeigeZeile[];
  verfallZeilen: VerfallAnzeigeZeile[];
  nachfuellLeertext: string;
  /**
   * §11.5 Zustand 27: ist das `ergebnis` unlesbar, ersetzt dieser EINE Satz die
   * Leertexte ALLER fuenf Tabellen — auch `nachfuellLeertext`.
   *
   * ⚠️ WARUM EIN PROP UND NICHT FUENF. Es ist EINE Ursache. Jeder Vorgabetext
   * unten BEHAUPTET etwas („Keine Geraete in diesem Check."); bei zerstoertem
   * Ergebnis hat das niemand geprueft, und die Tabellen widersprechen sonst der
   * Warnung ueber ihnen. Fuenf getrennte Props laden dazu ein, den Satz spaeter
   * an vier Stellen zu pflegen und an einer zu vergessen.
   */
  /**
   * ⛔ EIN ERSATZ FUER ALLE FUENF LEERTEXTE, gespeist von ZWEI Ursachen: einem
   * unlesbaren Ergebnis (§11.5, Zustand 27) und einem laufenden Check (DRK-196).
   * Beide Male ist jeder Vorgabetext eine TATSACHENBEHAUPTUNG („Keine Geraete in
   * diesem Check“), die niemand geprueft hat — und die der Meldung ueber den
   * Tabellen widerspraeche.
   *
   * ⚠️ ER HIESS BIS ZUM CODEX-REVIEW ZU PR #210 `unlesbarLeertext`, also nach
   * EINER der beiden Ursachen. Ein Name, der eine von zwei Ursachen nennt, laedt
   * dazu ein, fuer die zweite einen zweiten Weg zu bauen.
   */
  ersatzLeertext?: string | null;
  /**
   * IDA-236: die Abschnitte, die beim Öffnen GANZ stehen statt nur mit ihren
   * Abweichungen — vom Server aus `?alle=` gelesen (`alleAusAdresse`).
   */
  alleAnfangs?: AbschnittSchluessel[];
};

/**
 * Die Ampel ist die fachliche Ordnung dieser Chips — weder alphabetisch noch
 * numerisch. Rot zuerst: was Aufmerksamkeit verlangt, gehoert nach oben.
 */
const AMPEL_RANG = ["rot", "gelb", "grau", "ok"] as const;

function AnzeigeChip({ chip }: { chip: DetailChipAnzeige }) {
  return (
    <Chip ton={chip.ton} zeichen={chip.zeichen ?? undefined}>
      {chip.text}
    </Chip>
  );
}

const OFFEN_FILTER = zustandsFilter<AbgleichAnzeigeZeile>([
  { wert: "offen", text: "fehlt weiterhin", trifft: (zeile) => zeile.offenZahl > 0 },
  { wert: "vollstaendig", text: "vollständig", trifft: (zeile) => zeile.offenZahl === 0 },
]);

const LUECKE_FILTER = zustandsFilter<NachfuellAnzeigeZeile>([
  { wert: "luecke", text: "Lücke", trifft: (zeile) => zeile.lueckeZahl > 0 },
  { wert: "vollstaendig", text: "vollständig", trifft: (zeile) => zeile.lueckeZahl === 0 },
]);

const ABGLEICH_SPALTEN: TableProps<AbgleichAnzeigeZeile>["columns"] = [
  {
    title: "Artikel",
    dataIndex: "artikel",
    key: "artikel",
    sorter: nachText<AbgleichAnzeigeZeile>((zeile) => zeile.artikel),
  },
  {
    title: "Soll",
    dataIndex: "sollText",
    key: "soll",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.sollZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Gezählt",
    dataIndex: "istText",
    key: "ist",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.istZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Korrigiert",
    dataIndex: "korrekturText",
    key: "korrektur",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.korrekturZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Nachgefüllt",
    dataIndex: "nachgefuelltText",
    key: "nachgefuellt",
    align: "right",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.nachgefuelltZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Offen",
    dataIndex: "offenChip",
    key: "offen",
    sorter: nachZahl<AbgleichAnzeigeZeile>((zeile) => zeile.offenZahl),
    filters: OFFEN_FILTER.filters,
    onFilter: OFFEN_FILTER.onFilter,
    render: (offenChip: DetailChipAnzeige) => <AnzeigeChip chip={offenChip} />,
  },
];

const NACHFUELL_SPALTEN: TableProps<NachfuellAnzeigeZeile>["columns"] = [
  {
    title: "Fach",
    dataIndex: "fachText",
    key: "fach",
    sorter: nachText<NachfuellAnzeigeZeile>((zeile) => zeile.fachText),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Artikel",
    dataIndex: "artikelText",
    key: "artikel",
    sorter: nachText<NachfuellAnzeigeZeile>((zeile) => zeile.artikelText),
    render: (text: string, zeile: NachfuellAnzeigeZeile) => (
      <>
        {text}{" "}
        <span style={SCHRIFT.neben}>{zeile.einheitText}</span>
      </>
    ),
  },
  {
    title: "Soll",
    dataIndex: "sollText",
    key: "soll",
    align: "right",
    sorter: nachZahl<NachfuellAnzeigeZeile>((zeile) => zeile.sollZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Gezählt",
    dataIndex: "istText",
    key: "ist",
    align: "right",
    sorter: nachZahl<NachfuellAnzeigeZeile>((zeile) => zeile.istZahl),
    render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
  },
  {
    title: "Lücke im Fach",
    dataIndex: "lueckeChip",
    key: "luecke",
    sorter: nachZahl<NachfuellAnzeigeZeile>((zeile) => zeile.lueckeZahl),
    filters: LUECKE_FILTER.filters,
    onFilter: LUECKE_FILTER.onFilter,
    render: (lueckeChip: DetailChipAnzeige) => <AnzeigeChip chip={lueckeChip} />,
  },
];

function geraeteSpalten(
  zeilen: GeraetAnzeigeZeile[],
): TableProps<GeraetAnzeigeZeile>["columns"] {
  return [
    {
      title: "Gerät",
      dataIndex: "name",
      key: "name",
      sorter: nachText<GeraetAnzeigeZeile>((zeile) => zeile.name),
    },
    {
      title: "Vorhanden",
      dataIndex: "vorhandenChip",
      key: "vorhanden",
      sorter: nachRang<GeraetAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.vorhandenChip.ton,
        AMPEL_RANG,
      ),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.vorhandenChip.text),
      onFilter: trifftWert<GeraetAnzeigeZeile>((zeile) => zeile.vorhandenChip.text),
      render: (vorhandenChip: DetailChipAnzeige) => <AnzeigeChip chip={vorhandenChip} />,
    },
    {
      title: "Zustand",
      dataIndex: "zustandChip",
      key: "zustand",
      sorter: nachRang<GeraetAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.zustandChip.ton,
        AMPEL_RANG,
      ),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.zustandChip.text),
      onFilter: trifftWert<GeraetAnzeigeZeile>((zeile) => zeile.zustandChip.text),
      render: (zustandChip: DetailChipAnzeige) => <AnzeigeChip chip={zustandChip} />,
    },
    {
      /*
       * ⚠️ EINE BREITE (DRK-372). Die Bemerkung einer Geraetepruefung ist
       * Freitext ohne Laengengrenze, die Tabelle faehrt `scroll.x:
       * "max-content"` — EIN langer Satz macht sie beliebig breit, und das
       * Symptom fuehrt in die Irre: die Zeile sieht richtig aus, sie steht nur
       * sehr weit rechts. Ohne `zeilen`, weil dieses Blatt der Nachweis ist.
       */
      title: "Bemerkung",
      dataIndex: "bemerkungText",
      key: "bemerkung",
      render: (text: string) => (
        <Zellentext text={text} style={SCHRIFT.neben} />
      ),
    },
  ];
}

const FLASCHEN_SPALTEN: TableProps<FlascheAnzeigeZeile>["columns"] = [
  {
    title: "Flasche",
    dataIndex: "name",
    key: "name",
    sorter: nachText<FlascheAnzeigeZeile>((zeile) => zeile.name),
  },
  {
    title: "Druck",
    dataIndex: "druck",
    key: "druck",
    align: "right",
    sorter: nachZahl<FlascheAnzeigeZeile>((zeile) => zeile.druckZahl),
    render: (druck: FlascheAnzeigeZeile["druck"]) => druck.darstellung === "chip"
      ? <Chip ton={druck.ton ?? "grau"}>{druck.text}</Chip>
      : <span style={SCHRIFT.mono}>{druck.text}</span>,
  },
  {
    title: "Füllstand",
    dataIndex: "fuellstandChip",
    key: "fuellstand",
    sorter: nachRang<FlascheAnzeigeZeile, AmpelTon>(
      (zeile) => zeile.fuellstandChip.ton,
      AMPEL_RANG,
    ),
    render: (fuellstandChip: DetailChipAnzeige) => (
      <AnzeigeChip chip={fuellstandChip} />
    ),
  },
];

function verfallSpalten(
  zeilen: VerfallAnzeigeZeile[],
): TableProps<VerfallAnzeigeZeile>["columns"] {
  return [
    {
      title: "Artikel",
      dataIndex: "artikel",
      key: "artikel",
      sorter: nachText<VerfallAnzeigeZeile>((zeile) => zeile.artikel),
    },
    {
      title: "Verfall",
      dataIndex: "verfallText",
      key: "verfall",
      // „YYYY-MM" ordnet als Zeichenkette bereits richtig — deshalb hier
      // ausnahmsweise dasselbe Feld fuer Anzeige und Sortierung.
      sorter: nachDatum<VerfallAnzeigeZeile>((zeile) => zeile.verfallText),
      defaultSortOrder: "ascend",
      render: (text: string) => <span style={SCHRIFT.mono}>{text}</span>,
    },
    {
      title: "Status",
      dataIndex: "statusChip",
      key: "status",
      sorter: nachRang<VerfallAnzeigeZeile, AmpelTon>(
        (zeile) => zeile.statusChip.ton,
        AMPEL_RANG,
      ),
      filters: werteAlsFilter(zeilen, (zeile) => zeile.statusChip.text),
      onFilter: trifftWert<VerfallAnzeigeZeile>((zeile) => zeile.statusChip.text),
      render: (statusChip: DetailChipAnzeige) => <AnzeigeChip chip={statusChip} />,
    },
  ];
}

type Einheit = { eins: string; viele: string; vieleDativ: string };

const ARTIKEL: Einheit = { eins: "Artikel", viele: "Artikel", vieleDativ: "Artikeln" };
const POSITION: Einheit = { eins: "Position", viele: "Positionen", vieleDativ: "Positionen" };
const GERAET: Einheit = { eins: "Gerät", viele: "Geräte", vieleDativ: "Geräten" };
const FLASCHE: Einheit = { eins: "Flasche", viele: "Flaschen", vieleDativ: "Flaschen" };
const ANGABE: Einheit = { eins: "Angabe", viele: "Angaben", vieleDativ: "Angaben" };

function anzahl(n: number, einheit: Einheit, fall: "nominativ" | "dativ" = "nominativ"): string {
  if (n === 1) return `1 ${einheit.eins}`;
  return `${n} ${fall === "dativ" ? einheit.vieleDativ : einheit.viele}`;
}

/**
 * Wie weit ein Sprung auf `#abschnitt-…` (Kacheln, Fokus) unter dem oberen Rand
 * landet: die feste Kopfzeile der Shell (`Layout.headerHeight` 64 in
 * `core/theme/theme.ts`) plus der Abschnittsabstand. Ohne ihn verschwindet der
 * Kartenkopf genau unter der Kopfzeile — man landet in der Tabelle ohne Titel.
 */
const SPRUNG_ABSTAND = 64 + SPACE.lg;

/** Was die Insel je Abschnitt braucht — die Tabelle selbst baut `tabelle(alle)`. */
type AbschnittDaten = {
  schluessel: AbschnittSchluessel;
  titel: string;
  einheit: Einheit;
  gesamt: number;
  abweichend: number;
  leertext: string;
  tabelle: (alle: boolean) => ReactNode;
};

/** Die Zeile über der Tabelle: was gerade steht, und der eine Knopf zum Umschalten. */
function Steuerzeile({
  abschnitt,
  alle,
  onAlle,
}: {
  abschnitt: AbschnittDaten;
  alle: boolean;
  onAlle: (an: boolean) => void;
}) {
  const { gesamt, abweichend, einheit, schluessel } = abschnitt;
  const stand = alle
    ? `${gesamt > 1 ? "Alle " : ""}${anzahl(gesamt, einheit)} · ${abweichend === 0 ? "keine Abweichung" : `${abweichend} mit Abweichung`}`
    : `${abweichend} von ${anzahl(gesamt, einheit, "dativ")} mit Abweichung`;
  return (
    <div
      data-rolle="check-abschnitt-stand"
      style={{
        display: "flex",
        flexWrap: "wrap",
        alignItems: "center",
        justifyContent: "space-between",
        columnGap: SPACE.md,
        marginBlockEnd: SPACE.sm,
      }}
    >
      <span style={SCHRIFT.neben}>{stand}</span>
      <Button
        type="link"
        data-umschalter={schluessel}
        onClick={() => onAlle(!alle)}
        style={{ paddingInline: 0 }}
      >
        {alle ? (abweichend === 0 ? "Ausblenden" : "Nur Abweichungen") : "Alle anzeigen"}
      </Button>
    </div>
  );
}

export function CheckDetailTabellen({
  abgleichZeilen,
  nachfuellZeilen,
  geraeteZeilen,
  flaschenZeilen,
  verfallZeilen,
  nachfuellLeertext,
  ersatzLeertext,
  alleAnfangs,
}: CheckDetailTabellenProps) {
  // ZWEI Ursachen speisen ihn (unlesbar, laufend), deshalb heisst er nach seiner
  // ROLLE und nicht nach einer von beiden: er schlaegt JEDEN Vorgabetext.
  const leertext = (vorgabe: string) => ersatzLeertext ?? vorgabe;
  // Zwei Spaltenlisten entstehen aus den Daten (die Filterwerte); ohne `useMemo`
  // baute jedes Rendern eine neue und zwaenge die Tabelle zur Neuberechnung.
  const geraeteListe = useMemo(() => geraeteSpalten(geraeteZeilen), [geraeteZeilen]);
  const verfallListe = useMemo(() => verfallSpalten(verfallZeilen), [verfallZeilen]);

  /*
   * IDA-236 — ZUERST NUR DIE ABWEICHUNGEN. Bei 200 Artikeln standen hier rund
   * 600 Zeilen, fast alle „vollständig"; gesucht wird das, was nicht stimmt.
   *
   * ⚠️ VORGEFILTERT WIRD DIE `dataSource`, NICHT ÜBER EINEN SPALTENFILTER. Die
   * Regel je Abschnitt (`abweichungen.ts`) ist breiter als jeder einzelne
   * Spaltenfilter (der Abgleich zählt auch Nachgefülltes und Korrigiertes), und
   * die Spaltenfilter bleiben so frei für die Frage innerhalb der Sicht.
   * `Kartentabelle` leitet ihre angezeigte Liste aus der `dataSource` ab, statt
   * sie zu merken — ein Wechsel der Sicht ist deshalb kein Fall für Falle 15.
   */
  const abgleichAbw = useMemo(() => abgleichZeilen.filter(abgleichWeichtAb), [abgleichZeilen]);
  const nachfuellAbw = useMemo(() => nachfuellZeilen.filter(nachfuellungWeichtAb), [nachfuellZeilen]);
  const geraeteAbw = useMemo(() => geraeteZeilen.filter(geraetWeichtAb), [geraeteZeilen]);
  const flaschenAbw = useMemo(() => flaschenZeilen.filter(flascheWeichtAb), [flaschenZeilen]);
  const verfallAbw = useMemo(() => verfallZeilen.filter(verfallWeichtAb), [verfallZeilen]);

  /*
   * Welche Abschnitte ganz gezeigt werden — Startwert aus der Adresse
   * (`?alle=…`, vom Server gelesen), danach Zustand dieser Insel.
   *
   * ⚠️ `replaceState`, NICHT `router.replace`: der Umschalter filtert nur, was
   * schon im Browser liegt. Ein Router-Rundlauf rechnete die ganze Seite neu aus
   * der Datenbank (`force-dynamic`), nur um dieselben Zeilen zu schicken.
   * Next.js gleicht `replaceState` mit dem Router ab; Lesezeichen und Neuladen
   * treffen dieselbe Sicht.
   */
  const [alle, setAlle] = useState<ReadonlySet<AbschnittSchluessel>>(
    () => new Set(alleAnfangs ?? []),
  );
  useEffect(() => {
    try {
      const neu = adresseMitAlle(window.location.href, alle);
      if (neu) window.history.replaceState(null, "", neu);
    } catch {
      // Ohne Adresse bleibt es Zustand dieser Seite.
    }
  }, [alle]);

  /*
   * ⚠️ DER FOKUS FOLGT DEM UMSCHALTER. Ein ruhiger Abschnitt wechselt beim
   * Aufklappen den Ort (aus der Sammelzeile in seine Karte) — der Knopf, der
   * gerade gedrückt wurde, ist danach weg, und der Fokus fiele auf `body`.
   * Beide Darstellungen tragen deshalb denselben `data-umschalter`.
   */
  const fokusNach = useRef<AbschnittSchluessel | null>(null);
  useEffect(() => {
    const ziel = fokusNach.current;
    if (!ziel) return;
    fokusNach.current = null;
    const knopf = document.querySelector<HTMLElement>(`[data-umschalter="${ziel}"]`);
    if (knopf && document.activeElement !== knopf) knopf.focus();
  }, [alle]);

  const umschalten = useCallback((schluessel: AbschnittSchluessel, an: boolean) => {
    fokusNach.current = schluessel;
    setAlle((vorher) => {
      const neu = new Set(vorher);
      if (an) neu.add(schluessel);
      else neu.delete(schluessel);
      return neu;
    });
  }, []);

  const abschnitte: AbschnittDaten[] = [
    {
      schluessel: "abgleich",
      titel: "Abgleich",
      einheit: ARTIKEL,
      gesamt: abgleichZeilen.length,
      abweichend: abgleichAbw.length,
      leertext: leertext("Keine Positionen erfasst."),
      tabelle: (ganz) => (
        <Kartentabelle<AbgleichAnzeigeZeile>
          rowKey="id"
          aria-label="Abgleich"
          leer={{ nichts: leertext("Keine Positionen erfasst."), gefiltert: "Keine Position passt zum Filter." }}
          dataSource={ganz ? abgleichZeilen : abgleichAbw}
          columns={ABGLEICH_SPALTEN}
        />
      ),
    },
    {
      schluessel: "nachfuellung",
      titel: "Nachfüllung (je Fach)",
      einheit: POSITION,
      gesamt: nachfuellZeilen.length,
      abweichend: nachfuellAbw.length,
      leertext: leertext(nachfuellLeertext),
      tabelle: (ganz) => (
        <Kartentabelle<NachfuellAnzeigeZeile>
          rowKey="id"
          aria-label="Nachfüllung je Fach"
          leer={{ nichts: leertext(nachfuellLeertext), gefiltert: "Kein Fach passt zum Filter." }}
          dataSource={ganz ? nachfuellZeilen : nachfuellAbw}
          columns={NACHFUELL_SPALTEN}
        />
      ),
    },
    {
      schluessel: "geraete",
      titel: "Geräte",
      einheit: GERAET,
      gesamt: geraeteZeilen.length,
      abweichend: geraeteAbw.length,
      leertext: leertext("Keine Geräte in diesem Check."),
      tabelle: (ganz) => (
        <Kartentabelle<GeraetAnzeigeZeile>
          rowKey="id"
          aria-label="Geräte im Check"
          leer={{ nichts: leertext("Keine Geräte in diesem Check."), gefiltert: "Kein Gerät passt zum Filter." }}
          dataSource={ganz ? geraeteZeilen : geraeteAbw}
          columns={geraeteListe}
        />
      ),
    },
    {
      schluessel: "sauerstoff",
      titel: "Sauerstoff",
      einheit: FLASCHE,
      gesamt: flaschenZeilen.length,
      abweichend: flaschenAbw.length,
      leertext: leertext("Keine Flaschen in diesem Check."),
      tabelle: (ganz) => (
        <Kartentabelle<FlascheAnzeigeZeile>
          rowKey="id"
          aria-label="Sauerstoff im Check"
          leer={{ nichts: leertext("Keine Flaschen in diesem Check."), gefiltert: "Keine Flasche passt zum Filter." }}
          dataSource={ganz ? flaschenZeilen : flaschenAbw}
          columns={FLASCHEN_SPALTEN}
        />
      ),
    },
    {
      schluessel: "verfall",
      titel: "Verfall (gegen heute gerechnet)",
      einheit: ANGABE,
      gesamt: verfallZeilen.length,
      abweichend: verfallAbw.length,
      leertext: leertext("Keine Verfallsangabe in diesem Check."),
      tabelle: (ganz) => (
        <Kartentabelle<VerfallAnzeigeZeile>
          rowKey="id"
          aria-label="Verfallsmeldungen des Checks"
          leer={{ nichts: leertext("Keine Verfallsangabe in diesem Check."), gefiltert: "Keine Verfallsangabe passt zum Filter." }}
          dataSource={ganz ? verfallZeilen : verfallAbw}
          columns={verfallListe}
        />
      ),
    },
  ];

  /*
   * ⛔ EIN ABSCHNITT OHNE ZEILEN IST NIE „OHNE ABWEICHUNG". Er steht in der
   * Sammelzeile mit seinem bisherigen Leertext — wortgleich, denn genau diese
   * Sätze tragen die Unterscheidung laufend/unlesbar/Altformat (`ersatzLeertext`).
   * „Keine Abweichung (0 Geräte)" wäre die lügende Null, gegen die DRK-196
   * angetreten ist.
   */
  const alsKarte = (abschnitt: AbschnittDaten) =>
    abschnitt.gesamt > 0 && (abschnitt.abweichend > 0 || alle.has(abschnitt.schluessel));
  const karten = abschnitte.filter(alsKarte);
  const ruhige = abschnitte.filter((abschnitt) => !alsKarte(abschnitt));

  return (
    <>
      {karten.map((abschnitt) => {
        const ganz = alle.has(abschnitt.schluessel);
        return (
          <Card
            key={abschnitt.schluessel}
            id={`abschnitt-${abschnitt.schluessel}`}
            title={abschnitt.titel}
            style={{ marginBlockEnd: SPACE.lg, scrollMarginBlockStart: SPRUNG_ABSTAND }}
          >
            {/* Stimmen Sicht und Ganzes überein, gibt es nichts umzuschalten. */}
            {abschnitt.abweichend < abschnitt.gesamt ? (
              <Steuerzeile
                abschnitt={abschnitt}
                alle={ganz}
                onAlle={(an) => umschalten(abschnitt.schluessel, an)}
              />
            ) : null}
            {abschnitt.tabelle(ganz)}
          </Card>
        );
      })}
      {ruhige.length > 0 ? (
        <Card data-rolle="check-ruhige-abschnitte" style={{ marginBlockEnd: SPACE.lg }}>
          <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
            {ruhige.map((abschnitt) => (
              <li
                key={abschnitt.schluessel}
                id={`abschnitt-${abschnitt.schluessel}`}
                data-rolle="check-ruhiger-abschnitt"
                style={{
                  display: "flex",
                  flexWrap: "wrap",
                  alignItems: "center",
                  columnGap: SPACE.sm,
                  minBlockSize: 44,
                  scrollMarginBlockStart: SPRUNG_ABSTAND,
                }}
              >
                <strong>{abschnitt.titel}</strong>
                <span style={SCHRIFT.neben}>
                  {abschnitt.gesamt === 0
                    ? abschnitt.leertext
                    : `keine Abweichung (${anzahl(abschnitt.gesamt, abschnitt.einheit)})`}
                </span>
                {abschnitt.gesamt > 0 ? (
                  <Button
                    type="link"
                    data-umschalter={abschnitt.schluessel}
                    onClick={() => umschalten(abschnitt.schluessel, true)}
                    style={{ paddingInline: 0 }}
                  >
                    Anzeigen
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </>
  );
}
