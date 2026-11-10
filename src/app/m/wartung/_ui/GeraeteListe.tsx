"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button } from "antd";
import { Filterchips } from "@/core/filterchips/Filterchips";
import { loescheEntwurf } from "@/core/entwurf/ablage";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachRang, nachText } from "@/core/tabelle";
import { geraetAnlegenAction } from "../_actions/verwaltung";
import { RANG, STUFE_TEXT, ZUSTAND_TEXT, type Stufe, type Zustand } from "../_lib/fristen";
import { passtGeraet, type FristFilter, type GeraeteFilter } from "../_lib/geraeteFilter";
import type { FahrzeugWahl } from "../_lib/fahrzeugsuche";
import type { BekannteOrte, Ergebnis, GeraetZeile } from "../_lib/typen";
import { GeraetFormular, type GeraetWerte } from "./GeraetFormular";
import { GruppenFilter } from "./GruppenFilter";
import { NICHT_GESPEICHERT } from "./useAktion";
import { FristChip, OrtText, stundenText, ZustandChip } from "./teile";
import s from "./wartung.module.css";

/** IDA-358: der Entwurf „Gerät anlegen" (`GeraetFormular.tsx`). */
const NEU = "wartung:geraet:neu";

const STUFEN = (Object.keys(RANG) as Stufe[]).sort((a, b) => RANG[a] - RANG[b]);
const ZUSTAENDE: Zustand[] = ["ok", "mangel", "defekt"];

/** Schreibt einen Filter in die Adresse, ohne die Seite neu zu laden; `gruppe` und die anderen bleiben. */
function inAdresse(name: "frist" | "zustand", wert: string | null) {
  const q = new URLSearchParams(window.location.search);
  if (wert) q.set(name, wert);
  else q.delete(name);
  const s = q.toString();
  window.history.replaceState(null, "", s ? `${window.location.pathname}?${s}` : window.location.pathname);
}

export function GeraeteListe({
  zeilen, arten, gruppen, orte, fahrzeuge, verwalter, gruppenWahl, gewaehlt, filter,
}: {
  zeilen: GeraetZeile[];
  arten: { id: string; name: string; einzahl: string }[];
  /** Gruppen, die diese Person verwaltet — leer heißt: nur ansehen und prüfen. */
  gruppen: { id: string; name: string }[];
  orte: BekannteOrte;
  fahrzeuge: FahrzeugWahl[];
  verwalter: boolean;
  gruppenWahl: { id: string; name: string }[];
  gewaehlt: string | null;
  /** Aus `?frist=` und `?zustand=` (IDA-381): die Kennzahlen der Übersicht führen hierher. */
  filter: GeraeteFilter;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [art, setArt] = useState("alle");
  const [nurUnterwegs, setNurUnterwegs] = useState(false);
  const [frist, setFrist] = useState<FristFilter | null>(filter.frist);
  const [zustand, setZustand] = useState<Zustand | null>(filter.zustand);
  const [anlegen, setAnlegen] = useState(false);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, starte] = useTransition();
  const sperre = useRef(false);
  const href = (id: string) => (verwalter ? `/geraete/${id}` : `/g/${id}`);
  // Falle 15: die Liste wird abgeleitet, nicht über `Table.onChange` gefiltert.
  const liste = zeilen.filter((g) => (art === "alle" || g.artId === art) && (!nurUnterwegs || g.unterwegs) && passtGeraet(g, { frist, zustand }));
  const gibtUnterwegs = zeilen.some((g) => g.unterwegs);
  const gibtFaellige = zeilen.some((g) => g.naechste && g.naechste.stufe !== "ok");
  const gibtZustaende = zeilen.some((g) => g.zustand !== "ok");
  const gefiltert = art !== "alle" || nurUnterwegs || frist !== null || zustand !== null;
  const artWahl = arten.filter((a) => zeilen.some((g) => g.artId === a.id));
  const start = useMemo<GeraetWerte>(() => ({
    gruppeId: gewaehlt ?? gruppen[0]?.id ?? "", artId: arten[0]?.id ?? "", name: "", hersteller: "", typ: "", seriennr: "",
    ortArt: "lager", ort: "", fahrzeugId: null, stunden: null, hinweise: "", pruefanleitung: "",
  }), [gewaehlt, gruppen, arten]);

  const speichern = (w: GeraetWerte) => {
    if (sperre.current) return;
    sperre.current = true;
    starte(async () => {
      try {
        const r: Ergebnis = await geraetAnlegenAction(w);
        if (r.ok) {
          loescheEntwurf(NEU);
          message.success("Gerät angelegt.");
          setAnlegen(false);
          if (r.id) router.push(`/geraete/${r.id}`);
        } else {
          setFeldFehler(r.feldFehler ?? {});
          if (!r.feldFehler) message.error(r.fehler);
        }
      } catch {
        message.error(NICHT_GESPEICHERT);
      } finally {
        sperre.current = false;
      }
    });
  };

  return (
    <>
      <Seitenkopf
        titel="Geräte"
        aktionen={verwalter && gruppen.length > 0 ? (
          <Button type="primary" icon={<Icons8Ikone name="plus" groesse={16} />} onClick={() => { setFeldFehler({}); setAnlegen(true); }}>
            Gerät anlegen
          </Button>
        ) : undefined}
      />
      {(gruppenWahl.length > 1 || artWahl.length > 1 || gibtUnterwegs || gibtFaellige || frist || gibtZustaende || zustand) && (
        <div className={s.reihe}>
          <GruppenFilter wahl={gruppenWahl} gewaehlt={gewaehlt} />
          {artWahl.length > 1 && (
            <Filterchips<string>
              aria-label="Geräteart"
              wert={art}
              onChange={setArt}
              optionen={[{ label: "Alle Arten", wert: "alle" }, ...artWahl.map((a) => ({ label: a.name, wert: a.id }))]}
            />
          )}
          {(gibtUnterwegs || nurUnterwegs) && (
            <Filterchips<string>
              aria-label="Unterwegs"
              wert={nurUnterwegs ? "unterwegs" : "alle"}
              onChange={(w) => setNurUnterwegs(w === "unterwegs")}
              optionen={[{ label: "Alle", wert: "alle" }, { label: "Unterwegs", wert: "unterwegs" }]}
            />
          )}
          {(gibtFaellige || frist) && (
            <Filterchips<string>
              aria-label="Frist"
              wert={frist ?? "alle"}
              onChange={(w) => {
                const neu = w === "alle" ? null : (w as FristFilter);
                setFrist(neu);
                inAdresse("frist", neu);
              }}
              optionen={[
                { label: "Alle Fristen", wert: "alle" },
                { label: STUFE_TEXT.ueberfaellig, wert: "ueberfaellig" },
                { label: STUFE_TEXT.bald, wert: "bald" },
              ]}
            />
          )}
          {(gibtZustaende || zustand) && (
            <Filterchips<string>
              aria-label="Zustand"
              wert={zustand ?? "alle"}
              onChange={(w) => {
                const neu = w === "alle" ? null : (w as Zustand);
                setZustand(neu);
                inAdresse("zustand", neu);
              }}
              optionen={[{ label: "Jeder Zustand", wert: "alle" }, ...ZUSTAENDE.map((z) => ({ label: ZUSTAND_TEXT[z], wert: z }))]}
            />
          )}
        </div>
      )}
      <Kartentabelle<GeraetZeile>
        rowKey="id"
        aria-label="Geräte"
        dataSource={liste}
        leer={{ nichts: "Noch keine Geräte", figur: "wartung", gefiltert: "Keine Geräte mit dieser Auswahl.", aktiv: gefiltert }}
        karte={{ titel: "name", kennzeichen: ["zustand"] }}
        columns={[
          {
            title: "Gerät", key: "name", sorter: nachText<GeraetZeile>((g) => g.name),
            render: (_: unknown, g: GeraetZeile) => (
              <Link href={href(g.id)}>
                <strong>{g.name}</strong>
                <div className={s.neben}>{[g.hersteller, g.typ].filter(Boolean).join(" ")}</div>
              </Link>
            ),
          },
          { title: "Gruppe", key: "gruppe", render: (_: unknown, g: GeraetZeile) => g.gruppeName },
          { title: "Standort", key: "ort", render: (_: unknown, g: GeraetZeile) => <OrtText ortArt={g.ortArt} ort={g.ort} /> },
          {
            title: "Betriebsstunden", key: "stunden", align: "right",
            render: (_: unknown, g: GeraetZeile) => <span className={s.ziffern}>{stundenText(g.stunden)}</span>,
          },
          {
            title: "Nächste Frist", key: "frist", sorter: nachRang<GeraetZeile, Stufe>((g) => g.naechste?.stufe ?? "ok", STUFEN),
            render: (_: unknown, g: GeraetZeile) => (g.naechste ? (
              <div>
                <span className={s.reihe}><FristChip f={g.naechste} /> {g.naechste.vorlage.name}</span>
                <div className={s.neben}>{g.naechste.text}</div>
              </div>
            ) : "—"),
          },
          {
            title: "Zustand", key: "zustand", sorter: nachRang<GeraetZeile, GeraetZeile["zustand"]>((g) => g.zustand, ["defekt", "mangel", "ok"]),
            render: (_: unknown, g: GeraetZeile) => <ZustandChip z={g.zustand} />,
          },
        ]}
      />
      {verwalter && anlegen && (
        <GeraetFormular
          entwurfSchluessel={NEU}
          offen={anlegen}
          titel="Gerät anlegen"
          start={start}
          gruppen={gruppen}
          arten={arten}
          orte={orte}
          fahrzeuge={fahrzeuge}
          laeuft={laeuft}
          feldFehler={feldFehler}
          onAbbrechen={() => setAnlegen(false)}
          onSpeichern={speichern}
        />
      )}
    </>
  );
}
