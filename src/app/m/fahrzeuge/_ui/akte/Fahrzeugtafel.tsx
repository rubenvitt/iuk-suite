"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, ConfigProvider, Select, type TableProps } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle } from "@/core/tabelle";
import { fahrzeugTitel, fahrzeugUnterzeile, pruefungenDerArt, reifenTeil, schlimmstePruefung } from "../../_lib/akte/anzeige";
import { datum, GELB_KM, GELB_TAGE, kmText } from "../../_lib/akte/regeln";
import { STUFE_WORT, type AkteMitStand, type PruefArt, type Stufe } from "../../_lib/akte/typen";
import { karteAus } from "./karten";
import { ENGE_ZELLEN, Entfaellt, ohneEintrag, StandZelle, STUFE_KLASSE, StufenChip } from "./teile";
import s from "./akte.module.css";

/** Die drei Kacheln über der Tabelle. „nicht erfasst“ hat keine: es ist kein Befund, die Zeile zeigt es. */
const KACHELN: readonly { stufe: Stufe; wort: string }[] = [
  { stufe: "ueberfaellig", wort: "Überfällig" },
  { stufe: "bald", wort: "Bald fällig" },
  { stufe: "ok", wort: "In Ordnung" },
];

const ALLE_STANDORTE = "alle";

/** HU, UVV und Service haben je Fahrzeug höchstens eine Prüfung; gibt es doch mehrere, zählt die schlimmste. */
function PruefZelle({ x, art }: { x: AkteMitStand; art: Exclude<PruefArt, "Weitere"> }) {
  const p = schlimmstePruefung(pruefungenDerArt(x.stand, art));
  if (!p) return <Entfaellt text={ohneEintrag(art, x.akte.fahrzeug.art === "anhaenger")} />;
  // Datum und Kilometergrenze untereinander: nebeneinander machten sie die Spalte breiter als ihren Chip.
  const unter = p.faelligAm || p.kmGrenze != null ? (
    <>
      {p.faelligAm ? <span className={s.zeile}>{datum(p.faelligAm)}</span> : null}
      {p.kmGrenze != null ? <span className={s.zeile}>{kmText(p.kmGrenze)}</span> : null}
    </>
  ) : undefined;
  return <StandZelle stufe={p.stufe} text={p.text} unter={unter} />;
}

/** Alle weiteren Prüfungen in einer Zelle: die schlimmste mit Namen, sonst die Zahl derer, die in Ordnung sind. */
function WeitereZelle({ x }: { x: AkteMitStand }) {
  const liste = pruefungenDerArt(x.stand, "Weitere");
  const p = schlimmstePruefung(liste);
  if (!p) return <Entfaellt text={ohneEintrag("Weitere", false)} />;
  if (p.stufe === "ok") return <StandZelle stufe="ok" text={`${liste.length} in Ordnung`} unter={liste.map((y) => y.pruefung.name).join(", ")} unterKlasse={`${s.unter} ${s.schmal}`} />;
  return <StandZelle stufe={p.stufe} text={p.text} unter={p.pruefung.name} unterKlasse={`${s.unter} ${s.schmal}`} />;
}

function ReifenZelle({ x }: { x: AkteMitStand }) {
  const r = x.stand.reifen;
  if (!r) return <StufenChip stufe="offen" />;
  const teil = reifenTeil(r);
  return <StandZelle stufe={teil.stufe} text={teil.kurz} unter={`DOT ${r.satz.dot} · ${r.alterJahre} J.`} />;
}

type Spalten = NonNullable<TableProps<AkteMitStand>["columns"]>;

function FahrzeugZelle({ x, mitStand }: { x: AkteMitStand; mitStand: boolean }) {
  return (
    <div className={`${s.zelle} ${s.namenszelle}`}>
      <Link href={`/fahrzeug/${x.akte.fahrzeug.id}`} className={s.fahrzeugLink}>{fahrzeugTitel(x.akte.fahrzeug)}</Link>
      <span className={s.unter}>{fahrzeugUnterzeile(x.akte.fahrzeug)}</span>
      {mitStand ? <span className={s.gesamt} data-rolle="gesamt"><StufenChip stufe={x.stand.stufe}>{STUFE_WORT[x.stand.stufe]}</StufenChip></span> : null}
    </div>
  );
}

/** Die Spalten hinter dem Fahrzeug — dieselben in Tabelle und Karte. */
const TERMINE: Spalten = [
  { title: "HU", key: "hu", render: (_: unknown, x: AkteMitStand) => <PruefZelle x={x} art="HU" /> },
  { title: "UVV", key: "uvv", render: (_: unknown, x: AkteMitStand) => <PruefZelle x={x} art="UVV" /> },
  { title: "Service", key: "service", render: (_: unknown, x: AkteMitStand) => <PruefZelle x={x} art="Service" /> },
  { title: "Reifen", key: "reifen", render: (_: unknown, x: AkteMitStand) => <ReifenZelle x={x} /> },
  { title: "Weitere Prüfungen", key: "weitere", render: (_: unknown, x: AkteMitStand) => <WeitereZelle x={x} /> },
  {
    title: "Kilometer", key: "km",
    render: (_: unknown, x: AkteMitStand) =>
      x.akte.fahrzeug.art === "anhaenger" ? <Entfaellt /> : (
        <div className={s.zelle}>
          <span className={`${s.ziffern} ${s.fest}`}>{kmText(x.akte.km)}</span>
          {x.akte.kmAm ? <span className={`${s.unter} ${s.fest}`}>am {datum(x.akte.kmAm)}</span> : null}
        </div>
      ),
  },
];

/**
 * In der Tabelle steht der Gesamtstand in der Fahrzeugzelle: als eigene Spalte passten die acht Angaben bei
 * 1280px nicht nebeneinander (`docs/design/README.md`, „Bei 1280px scrollt keine Tabelle waagerecht“).
 */
const FAHRZEUG_MIT_STAND: Spalten[number] = { title: "Fahrzeug", key: "fahrzeug", render: (_: unknown, x: AkteMitStand) => <FahrzeugZelle x={x} mitStand /> };

/** Die Karte am Telefon führt den Gesamtstand weiter einzeln, oben neben dem Titel. */
const KARTE = karteAus<AkteMitStand>(
  [
    { title: "Fahrzeug", key: "fahrzeug", render: (_: unknown, x: AkteMitStand) => <FahrzeugZelle x={x} mitStand={false} /> },
    { title: "Gesamt", key: "gesamt", render: (_: unknown, x: AkteMitStand) => <StufenChip stufe={x.stand.stufe}>{STUFE_WORT[x.stand.stufe]}</StufenChip> },
    ...TERMINE,
  ],
  { titel: "fahrzeug", kennzeichen: ["gesamt"] },
  (x) => fahrzeugTitel(x.akte.fahrzeug),
);

/**
 * Etwa so hoch ist eine Karte der Tafel. Die Kartenliste rendert außerhalb des Sichtfelds nur Platzhalter
 * dieser Höhe (`content-visibility` in `core/tabelle/schmalkarten.module.css`); mit der Vorgabe von 160px
 * sprang die Seitenlänge beim Scrollen.
 */
const KARTEN_HOEHE = 340;

/**
 * Die Fahrzeugtafel (IDA-299): alle Fahrzeuge im Dienst mit ihren nächsten Prüf- und Serviceterminen.
 * Client-Insel, weil die Spalten `render` tragen (Falle 9); sie bekommt nur die fertig gerechneten Akten.
 * Gemerkt wird hier allein der Filter (Falle 15), die Liste ist daraus abgeleitet.
 */
export function Fahrzeugtafel({ liste }: { liste: AkteMitStand[] }) {
  const [filter, setFilter] = useState<Stufe | null>(null);
  const [standort, setStandort] = useState<string>(ALLE_STANDORTE);

  const standorte = [...new Set(liste.map((x) => x.akte.fahrzeug.standort))].sort((a, b) => a.localeCompare(b, "de", { numeric: true }));
  const anzahl = (stufe: Stufe) => liste.filter((x) => x.stand.stufe === stufe).length;
  const zeilen = liste.filter((x) => (filter === null || x.stand.stufe === filter) && (standort === ALLE_STANDORTE || x.akte.fahrzeug.standort === standort));

  return (
    <div className={s.seite}>
      <Seitenkopf
        titel="Fahrzeugtafel"
        beschreibung="Alle Fahrzeuge mit ihren nächsten Prüf- und Serviceterminen. Ein Klick auf ein Fahrzeug öffnet seine Akte."
        aktionen={<Button href="/halle">Als Hallentafel zeigen</Button>}
      />

      <div className={s.kpis} role="group" aria-label="Nach Stand filtern">
        {KACHELN.map(({ stufe, wort }) => {
          const n = anzahl(stufe);
          const an = filter === stufe;
          return (
            <button key={stufe} type="button" className={s.kpi} data-stufe={stufe} aria-pressed={an} onClick={() => setFilter(an ? null : stufe)}>
              <span className={s.kpiWort}><span className={`${s.punkt} ${STUFE_KLASSE[stufe]}`} aria-hidden="true" />{wort}</span>
              <span className={s.kpiZahl}>{n}</span>
              <span className={`${s.neben} ${s.klein}`}>{n === 1 ? "Fahrzeug" : "Fahrzeuge"}{an ? " · Filter aktiv" : ""}</span>
            </button>
          );
        })}
      </div>

      <div className={s.listenkopf}>
        <h2 className={s.listentitel}>Fahrzeuge</h2>
        <Select
          aria-label="Standort"
          value={standort}
          onChange={setStandort}
          style={{ minWidth: 180 }}
          options={[{ value: ALLE_STANDORTE, label: "Alle Standorte" }, ...standorte.map((o) => ({ value: o, label: o }))]}
        />
      </div>

      <ConfigProvider theme={ENGE_ZELLEN}>
        <Kartentabelle<AkteMitStand>
          rowKey={(x) => x.akte.fahrzeug.id}
          aria-label="Fahrzeugtafel"
          dataSource={zeilen}
          leer={{
            nichts: "Noch keine Fahrzeuge",
            figur: "fahrzeuge",
            gefiltert: "Kein Fahrzeug passt zu diesem Filter.",
            aktiv: filter !== null || standort !== ALLE_STANDORTE,
          }}
          karte={KARTE}
          kartenHoehe={KARTEN_HOEHE}
          columns={[FAHRZEUG_MIT_STAND, ...TERMINE]}
        />
      </ConfigProvider>

      <p className={s.hinweis}>
        Gelb heißt fällig in den nächsten {GELB_TAGE} Tagen oder weniger als {kmText(GELB_KM)} bis zur Grenze. Rot heißt überfällig. Beim Service
        zählt, was zuerst erreicht ist: Datum oder Kilometer.
      </p>
    </div>
  );
}
