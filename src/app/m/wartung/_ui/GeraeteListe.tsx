"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { App, Button, Segmented } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { Seitenkopf } from "@/core/shell/Seitenkopf";
import { Kartentabelle, nachRang, nachText } from "@/core/tabelle";
import { geraetAnlegenAction } from "../_actions/verwaltung";
import { RANG, type Stufe, type Zustand } from "../_lib/fristen";
import type { Ergebnis, GeraetZeile } from "../_lib/typen";
import { GeraetFormular, type GeraetWerte } from "./GeraetFormular";
import { GruppenFilter } from "./GruppenFilter";
import { FristChip, OrtText, stundenText, ZustandChip } from "./teile";
import s from "./wartung.module.css";

const KURZ: Record<Zustand, string> = { ok: "Einsatzbereit", mangel: "Mit Mangel", defekt: "Nicht einsatzbereit" };
const STUFEN = (Object.keys(RANG) as Stufe[]).sort((a, b) => RANG[a] - RANG[b]);

export function GeraeteListe({
  zeilen, arten, gruppen, orte, verwalter, gruppenWahl, gewaehlt,
}: {
  zeilen: GeraetZeile[];
  arten: { id: string; name: string; einzahl: string }[];
  /** Gruppen, die diese Person verwaltet — leer heißt: nur ansehen und prüfen. */
  gruppen: { id: string; name: string }[];
  orte: string[];
  verwalter: boolean;
  gruppenWahl: { id: string; name: string }[];
  gewaehlt: string | null;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const [art, setArt] = useState("alle");
  const [anlegen, setAnlegen] = useState(false);
  const [feldFehler, setFeldFehler] = useState<Record<string, string>>({});
  const [laeuft, starte] = useTransition();
  const sperre = useRef(false);
  const href = (id: string) => (verwalter ? `/geraete/${id}` : `/g/${id}`);
  const liste = art === "alle" ? zeilen : zeilen.filter((g) => g.artId === art);
  const artWahl = arten.filter((a) => zeilen.some((g) => g.artId === a.id));
  const start = useMemo<GeraetWerte>(() => ({
    gruppeId: gewaehlt ?? gruppen[0]?.id ?? "", artId: arten[0]?.id ?? "", name: "", hersteller: "", typ: "", seriennr: "",
    ortArt: "lager", ort: "", stunden: null,
  }), [gewaehlt, gruppen, arten]);

  const speichern = (w: GeraetWerte) => {
    if (sperre.current) return;
    sperre.current = true;
    starte(async () => {
      try {
        const r: Ergebnis = await geraetAnlegenAction(w);
        if (r.ok) {
          message.success("Gerät angelegt.");
          setAnlegen(false);
          if (r.id) router.push(`/geraete/${r.id}`);
        } else {
          setFeldFehler(r.feldFehler ?? {});
          if (!r.feldFehler) message.error(r.fehler);
        }
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
      {(gruppenWahl.length > 1 || artWahl.length > 1) && (
        <div className={s.reihe}>
          <GruppenFilter wahl={gruppenWahl} gewaehlt={gewaehlt} />
          {artWahl.length > 1 && (
            <Segmented
              aria-label="Geräteart"
              value={art}
              onChange={(v) => setArt(String(v))}
              options={[{ label: "Alle Arten", value: "alle" }, ...artWahl.map((a) => ({ label: a.name, value: a.id }))]}
            />
          )}
        </div>
      )}
      <Kartentabelle<GeraetZeile>
        rowKey="id"
        aria-label="Geräte"
        dataSource={liste}
        leer={{ nichts: "Noch keine Geräte.", gefiltert: "Keine Geräte dieser Art.", aktiv: art !== "alle" }}
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
            render: (_: unknown, g: GeraetZeile) => <ZustandChip z={g.zustand} text={KURZ[g.zustand]} />,
          },
        ]}
      />
      {verwalter && anlegen && (
        <GeraetFormular
          offen={anlegen}
          titel="Gerät anlegen"
          start={start}
          gruppen={gruppen}
          arten={arten}
          orte={orte}
          laeuft={laeuft}
          feldFehler={feldFehler}
          onAbbrechen={() => setAnlegen(false)}
          onSpeichern={speichern}
        />
      )}
    </>
  );
}
