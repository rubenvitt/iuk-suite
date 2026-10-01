"use client";

import { useId, useState } from "react";
import { Button, Input, Select } from "antd";
import { BIB_OPTION, bibVerbindungenFuerPlan, verbindeMitBibVerbindung } from "../../_lib/plan/bibliothek";
import { aendereStelle } from "../../_lib/plan/operationen";
import { ART_NAME, GRENZE, LAENGE, VERBINDUNGS_ARTEN, type PlanInhalt, type Stelle, type VerbindungsArt } from "../../_lib/plan/schema";
import { findeVerbindung, legeVerbindungAn } from "../../_lib/plan/verbindungen";
import type { Aendere } from "./aendere";
import { useBibliothek } from "./bibliothekKontext";
import { neueId } from "./ids";

const KEINE = "~keine";

/**
 * „Verbindung zur Elternstelle" (Spec §6.4): vorhandene wählen oder neu eintippen (Bezeichnung + Art).
 * Neu eingetippt und gleichnamig vorhanden (gleiche Art) → die vorhandene wird genommen, keine Doppelung.
 * Dazu die Kanäle der Stelle ohne Gegenstelle (Phase-1-Abweichung 12, Entscheidung 10).
 */
export function VerbindungWahl({ inhalt, stelle, aendere }: { inhalt: PlanInhalt; stelle: Stelle; aendere: Aendere }) {
  const basis = useId();
  const [neu, setNeu] = useState(false);
  const [bezeichnung, setBezeichnung] = useState("");
  // Vorbelegt mit der Art der zuletzt angelegten Verbindung: in einem Plan sind es meist dieselben (Kritik).
  const [art, setArt] = useState<VerbindungsArt>(() => inhalt.verbindungen.at(-1)?.art ?? "tmo");
  const [fehler, setFehler] = useState<string | null>(null);
  const { aktiv, bib } = useBibliothek();
  const ausBib = aktiv ? bibVerbindungenFuerPlan(inhalt, bib.verbindungen) : [];
  const optionen = inhalt.verbindungen.map((v) => ({ value: v.id, label: `${v.bezeichnung} · ${ART_NAME[v.art]}` }));

  const verbindeNeu = () => {
    const id = neueId(inhalt, "v");
    const f = aendere((p) => {
      const vorhanden = findeVerbindung(p, bezeichnung, art);
      const mit = vorhanden ? p : legeVerbindungAn(p, { id, art, bezeichnung });
      return aendereStelle(mit, stelle.id, { verbindungId: vorhanden?.id ?? id });
    });
    setFehler(f);
    if (f === null) { setNeu(false); setBezeichnung(""); }
  };

  return (
    <fieldset className="kp-abschnitt">
      <legend>Verbindung</legend>
      {stelle.eltern !== null ? (
        <>
          <label className="kp-feldname" htmlFor={`${basis}-weg`}>Zur Elternstelle</label>
          <div className="kp-zeile">
            <Select id={`${basis}-weg`} value={stelle.verbindungId ?? KEINE}
              onChange={(v: string) => {
                const b = v.startsWith(BIB_OPTION) ? bib.verbindungen.find((x) => `${BIB_OPTION}${x.id}` === v) : undefined;
                if (b) { setFehler(aendere((p) => verbindeMitBibVerbindung(p, stelle.id, b, neueId(p, "v")))); return; }
                setFehler(aendere((p) => aendereStelle(p, stelle.id, { verbindungId: v === KEINE ? null : v })));
              }}
              options={[{ value: KEINE, label: "keine (dünne Linie)" }, ...optionen,
                ...(ausBib.length > 0 ? [{ label: "Aus der Bibliothek", options: ausBib.map((b) => ({ value: `${BIB_OPTION}${b.id}`, label: `${b.bezeichnung} · ${ART_NAME[b.art]}` })) }] : [])]} />
            <Button onClick={() => setNeu(true)} disabled={neu}>Neue Verbindung</Button>
          </div>
          {neu ? (
            <div className="kp-zeile">
              {/* autoFocus + Enter: „neu eintippen" (§6.4) ist ein Feld, keine Klickstrecke (Kritik) */}
              <Input autoFocus aria-label="Bezeichnung der neuen Verbindung" value={bezeichnung} maxLength={LAENGE.bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. R_UE_2"
                onPressEnter={(e) => { e.preventDefault(); if (bezeichnung.trim() !== "") verbindeNeu(); }} />
              <Select aria-label="Art der neuen Verbindung" value={art} onChange={(a: VerbindungsArt) => setArt(a)} options={VERBINDUNGS_ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }))} />
              <Button type="primary" onClick={verbindeNeu} disabled={bezeichnung.trim() === ""}>Anlegen und verbinden</Button>
            </div>
          ) : null}
        </>
      ) : <p className="kp-hilfe">Eine Stelle der obersten Ebene hat keine Elternstelle.</p>}
      <label className="kp-feldname" htmlFor={`${basis}-kanaele`}>Kanäle an dieser Stelle (ohne Gegenstelle)</label>
      <Select id={`${basis}-kanaele`} mode="multiple" value={stelle.kanaele} maxCount={GRENZE.kanaele} placeholder="keine"
        onChange={(k: string[]) => setFehler(aendere((p) => aendereStelle(p, stelle.id, { kanaele: k })))} options={optionen} />
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}
