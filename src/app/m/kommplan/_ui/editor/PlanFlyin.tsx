"use client";

import { useId, useRef, useState } from "react";
import dayjs, { type Dayjs } from "dayjs";
import { Alert, Button, DatePicker, Drawer, Input, Select, Switch } from "antd";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { flyinBreite } from "@/core/theme/flyin";
import { LAENGE_ANLASS, PLAN_TYPEN, TYP_NAME, type Planangaben, type PlanTyp } from "../../_lib/angaben";
import type { FeldFehler, SpeicherErgebnis } from "../../_lib/ergebnis";
import { setzeOptionen } from "../../_lib/plan/operationen";
import { ART_NAME, LAENGE, VERBINDUNGS_ARTEN, type PlanInhalt, type VerbindungsArt } from "../../_lib/plan/schema";
import { aendereVerbindung, legeVerbindungAn, loescheVerbindung, verbindungsNutzung } from "../../_lib/plan/verbindungen";
import type { Aendere } from "./aendere";
import { neueId } from "./ids";

export const PLAN_FLYIN_GRUND = 560;
export interface PlanFormularProps {
  angaben: Planangaben; inhalt: PlanInhalt; aendere: Aendere;
  speichereAngaben: (a: Planangaben) => Promise<SpeicherErgebnis>; onEntwurf: (offen: boolean) => void;
}

/**
 * DAS FLYIN DES PLANS (Entscheidungen 3, 20): Planangaben sind Spalten und speichern sich selbst —
 * beim Verlassen eines Textfelds, mit Enter, bei Art und Datum sofort (eigene Action, je Speichern
 * eine Audit-Zeile); Optionen und Verbindungen sind Dokument und wirken sofort. Ohne Maske wie das
 * Flyin der Stelle; `nachSchliessen` läuft nach der Schließ-Animation (Fokus auf die Fläche).
 */
export function PlanFlyin({ offen, onSchliessen, nachSchliessen, abschnitt, ...p }: PlanFormularProps & {
  offen: boolean; onSchliessen: () => void; nachSchliessen: () => void; abschnitt: "angaben" | "verbindungen";
}) {
  return (
    <Drawer open={offen} onClose={onSchliessen} mask={false} size={flyinBreite(PLAN_FLYIN_GRUND)} destroyOnHidden rootClassName="kp-flyin"
      title="Plan und Verbindungen"
      afterOpenChange={(auf) => {
        if (!auf) { nachSchliessen(); return; }
        if (abschnitt === "verbindungen") document.querySelector('[data-abschnitt="verbindungen"]')?.scrollIntoView({ block: "start" });
      }}>
      {offen ? <PlanFormular {...p} /> : null}
    </Drawer>
  );
}

export function PlanFormular({ angaben, inhalt, aendere, speichereAngaben, onEntwurf }: PlanFormularProps) {
  return (
    <div className="kp-formular">
      <Angaben angaben={angaben} speichereAngaben={speichereAngaben} onEntwurf={onEntwurf} />
      <fieldset className="kp-abschnitt">
        <legend>Optionen</legend>
        <label className="kp-schalter"><Switch data-option="leerzeilen" checked={inhalt.optionen.leerzeilen}
          onChange={(v) => aendere((q) => setzeOptionen(q, { leerzeilen: v }))} /> Leerzeilen für den Handeintrag</label>
        <label className="kp-schalter"><Switch data-option="vermerkVsNfD" checked={inhalt.optionen.vermerkVsNfD}
          onChange={(v) => aendere((q) => setzeOptionen(q, { vermerkVsNfD: v }))} /> Vermerk „VS – Nur für den Dienstgebrauch“</label>
      </fieldset>
      <Verbindungen inhalt={inhalt} aendere={aendere} />
    </div>
  );
}

interface Entwurf { titel: string; typ: PlanTyp; anlass: string; datum: string | null }
/** Wie `angabenSchema` vergleicht: getrimmt, leerer Anlass = null. So wird Unverändertes nie gesendet (Review Focus 6). */
const gleich = (a: Entwurf, b: Planangaben) =>
  a.titel.trim() === b.titel && a.typ === b.typ && (a.anlass.trim() || null) === b.anlass && a.datum === b.datum;

function Angaben({ angaben, speichereAngaben, onEntwurf }: Pick<PlanFormularProps, "angaben" | "speichereAngaben" | "onEntwurf">) {
  const basis = useId();
  const [titel, setTitel] = useState(angaben.titel);
  const [typ, setTyp] = useState<PlanTyp>(angaben.typ);
  const [anlass, setAnlass] = useState(angaben.anlass ?? "");
  const [datum, setDatum] = useState<Dayjs | null>(angaben.datum ? dayjs(angaben.datum) : null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [meldung, setMeldung] = useState<string | null>(null);
  /** Zuletzt gespeicherter Stand — gesät aus den Props; der Editor keyt diese Komponente neu, wenn die Angaben von außen kommen. */
  const gespeichert = useRef(angaben);
  const entwurf = (): Entwurf => ({ titel, typ, anlass, datum: datum ? datum.format("YYYY-MM-DD") : null });

  const sende = (e: Entwurf) => {
    if (gleich(e, gespeichert.current)) { setFeldFehler({}); onEntwurf(false); return; }
    setMeldung(null);
    void speichereAngaben(e as unknown as Planangaben) // der Server trimmt und macht aus leerem Anlass null (`angabenSchema`)
      .then((r) => {
        if (r.ok) { gespeichert.current = { titel: e.titel.trim(), typ: e.typ, anlass: e.anlass.trim() || null, datum: e.datum }; setFeldFehler({}); onEntwurf(false); }
        else if (r.grund === "ungueltig") setFeldFehler(r.feldFehler ?? {});
        else if (r.grund === "konflikt") setMeldung("Nicht gespeichert: der Plan wurde inzwischen geändert. Entscheide oben, welche Fassung gilt.");
        else setMeldung("Diesen Plan gibt es nicht mehr, oder er wurde archiviert.");
      })
      .catch(() => setMeldung("Nicht gespeichert — prüfe die Verbindung und ob du noch angemeldet bist."));
  };
  const geaendert = () => onEntwurf(true);
  // Dasselbe Paar wie in `NeuerPlan` (docs/design/feedback-admin.md 4.4): aria-invalid UND aria-describedby.
  const feld = (name: string) => ({
    id: `${basis}-${name}`, "aria-invalid": feldFehler[name] ? true : undefined,
    "aria-describedby": feldFehler[name] ? `${basis}-${name}-fehler` : undefined,
  });
  const fehlerText = (name: string) => (feldFehler[name] ? <p id={`${basis}-${name}-fehler`} className="kp-feldfehler">{feldFehler[name]}</p> : null);

  return (
    <fieldset className="kp-abschnitt" aria-label="Planangaben">
      <legend>Planangaben</legend>
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input name="titel" value={titel} maxLength={LAENGE.titel} {...feld("titel")}
        onChange={(e) => { setTitel(e.target.value); geaendert(); }} onBlur={() => sende(entwurf())}
        onPressEnter={(e) => { e.preventDefault(); sende(entwurf()); }} />
      {fehlerText("titel")}
      <label className="kp-feldname" htmlFor={`${basis}-typ`}>Art</label>
      <Select id={`${basis}-typ`} value={typ} options={PLAN_TYPEN.map((t) => ({ value: t, label: TYP_NAME[t] }))}
        onChange={(v: PlanTyp) => { setTyp(v); sende({ ...entwurf(), typ: v }); }} />
      <label className="kp-feldname" htmlFor={`${basis}-anlass`}>Anlass</label>
      <Input name="anlass" value={anlass} maxLength={LAENGE_ANLASS} {...feld("anlass")}
        onChange={(e) => { setAnlass(e.target.value); geaendert(); }} onBlur={() => sende(entwurf())}
        onPressEnter={(e) => { e.preventDefault(); sende(entwurf()); }} />
      {fehlerText("anlass")}
      <label className="kp-feldname" htmlFor={`${basis}-datum`}>Datum</label>
      <DatePicker {...feld("datum")} value={datum} format="DD.MM.YYYY" onKeyDown={enterUebernimmtNurDasFeld}
        status={feldFehler.datum ? "error" : undefined}
        onChange={(d: Dayjs | null) => { setDatum(d); sende({ ...entwurf(), datum: d ? d.format("YYYY-MM-DD") : null }); }} />
      {fehlerText("datum")}
      {meldung ? <Alert type="warning" showIcon title={meldung} /> : null}
    </fieldset>
  );
}

function nutzungText(n: { eltern: number; kanal: number }): string {
  const teile = [
    n.eltern > 0 ? `Weg zu ${n.eltern} ${n.eltern === 1 ? "Stelle" : "Stellen"}` : null,
    n.kanal > 0 ? `Kanal an ${n.kanal} ${n.kanal === 1 ? "Stelle" : "Stellen"}` : null,
  ].filter(Boolean);
  return teile.join(" · ");
}

/** „Verbindungen des Plans verwalten": umbenennen, Art ändern, löschen nur unbenutzt; unbenutzt = Reserve (Legende). */
function Verbindungen({ inhalt, aendere }: Pick<PlanFormularProps, "inhalt" | "aendere">) {
  const [entwurf, setEntwurf] = useState<Record<string, string>>({});
  const [bezeichnung, setBezeichnung] = useState("");
  const [art, setArt] = useState<VerbindungsArt>(() => inhalt.verbindungen.at(-1)?.art ?? "tmo");
  const [fehler, setFehler] = useState<string | null>(null);
  const nutzung = verbindungsNutzung(inhalt);
  const ARTEN = VERBINDUNGS_ARTEN.map((a) => ({ value: a, label: ART_NAME[a] }));

  const umbenennen = (id: string, wert: string) => {
    setEntwurf((e) => ({ ...e, [id]: wert }));
    if (wert.trim() !== "") aendere((p) => aendereVerbindung(p, id, { bezeichnung: wert }), `verbindung:${id}`);
  };
  const anlegen = () => {
    if (bezeichnung.trim() === "") return;
    const f = aendere((p) => legeVerbindungAn(p, { id: neueId(p, "v"), art, bezeichnung }));
    setFehler(f);
    if (f === null) setBezeichnung("");
  };

  return (
    <fieldset className="kp-abschnitt" data-abschnitt="verbindungen">
      <legend>Verbindungen</legend>
      {inhalt.verbindungen.length === 0 ? <p className="kp-hilfe">Noch keine Verbindungen.</p> : null}
      {inhalt.verbindungen.map((v, i) => {
        const n = nutzung.get(v.id) ?? { eltern: 0, kanal: 0 };
        const reserve = n.eltern === 0 && n.kanal === 0;
        const wert = entwurf[v.id] ?? v.bezeichnung;
        return (
          <div key={v.id} className="kp-verbindung" data-verbindung-zeile={v.id}>
            <div className="kp-zeile">
              <Input aria-label={`Verbindung ${i + 1}: Bezeichnung`} value={wert} maxLength={LAENGE.bezeichnung}
                aria-invalid={wert.trim() === "" ? true : undefined}
                onChange={(e) => umbenennen(v.id, e.target.value)}
                onBlur={() => setEntwurf((e) => { const rest = { ...e }; delete rest[v.id]; return rest; })} />
              <Select aria-label={`Verbindung ${i + 1}: Art`} value={v.art} options={ARTEN}
                onChange={(a: VerbindungsArt) => aendere((p) => aendereVerbindung(p, v.id, { art: a }))} />
              <Button aria-label={`Verbindung ${i + 1} (${v.bezeichnung}) löschen`} disabled={!reserve} title={reserve ? undefined : "Wird noch benutzt"}
                onClick={() => setFehler(aendere((p) => loescheVerbindung(p, v.id)))}>Löschen</Button>
            </div>
            <p className="kp-hilfe">{reserve ? <span className="kp-chip">Reserve</span> : nutzungText(n)}</p>
            {wert.trim() === "" ? <p className="kp-feldfehler">Die Verbindung braucht eine Bezeichnung.</p> : null}
          </div>
        );
      })}
      <div className="kp-zeile">
        <Input aria-label="Bezeichnung der neuen Verbindung" value={bezeichnung} maxLength={LAENGE.bezeichnung} onChange={(e) => setBezeichnung(e.target.value)} placeholder="z. B. K_UE_2"
          onPressEnter={(e) => { e.preventDefault(); anlegen(); }} />
        <Select aria-label="Art der neuen Verbindung" value={art} onChange={(a: VerbindungsArt) => setArt(a)} options={ARTEN} />
        <Button onClick={anlegen} disabled={bezeichnung.trim() === ""}>Verbindung anlegen</Button>
      </div>
      {fehler ? <p className="kp-feldfehler" role="status">{fehler}</p> : null}
    </fieldset>
  );
}
