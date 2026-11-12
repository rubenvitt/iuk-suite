"use client";

import { useState } from "react";
import Link from "next/link";
import { Button, Select } from "antd";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle } from "@/core/tabelle";
import { fahrzeugTitel, fahrzeugUnterzeile, pruefungenDerArt, reifenTeil, schlimmstePruefung } from "../../_lib/akte/anzeige";
import { datum, GELB_KM, GELB_TAGE, kmText } from "../../_lib/akte/regeln";
import { STUFE_WORT, type AkteMitStand, type PruefArt, type Stufe } from "../../_lib/akte/typen";
import { Entfaellt, StandZelle, STUFE_KLASSE, StufenChip } from "./teile";
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
  if (!p) return <Entfaellt />;
  const unter = [p.faelligAm ? datum(p.faelligAm) : null, p.kmGrenze != null ? kmText(p.kmGrenze) : null].filter(Boolean).join(" · ");
  return <StandZelle stufe={p.stufe} text={p.text} unter={unter} />;
}

/** Alle weiteren Prüfungen in einer Zelle: die schlimmste mit Namen, sonst die Zahl derer, die in Ordnung sind. */
function WeitereZelle({ x }: { x: AkteMitStand }) {
  const liste = pruefungenDerArt(x.stand, "Weitere");
  const p = schlimmstePruefung(liste);
  if (!p) return <Entfaellt />;
  if (p.stufe === "ok") return <StandZelle stufe="ok" text={`${liste.length} in Ordnung`} unter={liste.map((y) => y.pruefung.name).join(", ")} />;
  return <StandZelle stufe={p.stufe} text={p.text} unter={p.pruefung.name} />;
}

function ReifenZelle({ x }: { x: AkteMitStand }) {
  const r = x.stand.reifen;
  if (!r) return <StufenChip stufe="offen" />;
  const teil = reifenTeil(r);
  return <StandZelle stufe={teil.stufe} text={teil.kurz} unter={`DOT ${r.satz.dot} · ${r.alterJahre} J.`} />;
}

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
        karte={{ titel: "fahrzeug", kennzeichen: ["gesamt"] }}
        columns={[
          {
            title: "Fahrzeug", key: "fahrzeug",
            render: (_: unknown, x: AkteMitStand) => (
              <div className={s.zelle}>
                <Link href={`/fahrzeug/${x.akte.fahrzeug.id}`} className={s.fahrzeugLink}>{fahrzeugTitel(x.akte.fahrzeug)}</Link>
                <span className={s.unter}>{fahrzeugUnterzeile(x.akte.fahrzeug)}</span>
              </div>
            ),
          },
          { title: "Gesamt", key: "gesamt", render: (_: unknown, x: AkteMitStand) => <StufenChip stufe={x.stand.stufe}>{STUFE_WORT[x.stand.stufe]}</StufenChip> },
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
                  <span className={s.ziffern}>{kmText(x.akte.km)}</span>
                  {x.akte.kmAm ? <span className={s.unter}>abgelesen {datum(x.akte.kmAm)}</span> : null}
                </div>
              ),
          },
        ]}
      />

      <p className={s.hinweis}>
        Gelb heißt fällig in den nächsten {GELB_TAGE} Tagen oder weniger als {kmText(GELB_KM)} bis zur Grenze. Rot heißt überfällig. Beim Service
        zählt, was zuerst erreicht ist: Datum oder Kilometer.
      </p>
    </div>
  );
}
