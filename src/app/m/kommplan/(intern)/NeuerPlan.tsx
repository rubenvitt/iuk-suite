"use client";

import { useId, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import dayjs, { type Dayjs } from "dayjs";
import { Alert, Button, DatePicker, Drawer, Input, Select, type InputRef } from "antd";
import { enterUebernimmtNurDasFeld } from "@/core/formular/enter";
import { flyinBreite } from "@/core/theme/flyin";
import { legePlanAnAction } from "../_actions/plan";
import { LAENGE_ANLASS, PLAN_TYPEN, TYP_NAME, type PlanTyp } from "../_lib/angaben";
import type { FeldFehler } from "../_lib/ergebnis";
import { LAENGE } from "../_lib/plan/schema";
import type { VorlageWahl } from "../_lib/planverwaltung";
import { ersetzeDatumImTitel } from "../_lib/tagesfassung";
import { fokussiereWennFrei } from "../_ui/fokus";

/**
 * „Neu" in der Planliste (Spec §6.1): Titel, Art, Anlass, Datum — danach direkt in den Editor.
 * Eigenes `<form>` mit `useState`, kein antd-`Form` (Vorbild `einsatzbuch/_ui/stammdaten/
 * StammdatenFormular.tsx`); Feldfehler als Text am Feld (docs/design/feedback-admin.md 4.4).
 * Die Seite rendert diese Insel nur für `darfKommplanBearbeiten` — dasselbe Prädikat prüft die Action.
 */
export function NeuerPlan({ vorlagen = [], heute }: { vorlagen?: VorlageWahl[]; heute?: string }) {
  const router = useRouter();
  const [offen, setOffen] = useState(false);
  const titelRef = useRef<InputRef>(null);
  return (
    <>
      <Button type="primary" data-neu="" onClick={() => setOffen(true)}>Neu</Button>
      <Drawer open={offen} onClose={() => setOffen(false)} title="Neuer Plan" size={flyinBreite(480)} destroyOnHidden
        afterOpenChange={(auf) => { if (auf) fokussiereWennFrei(titelRef.current?.input); }}>
        {offen ? <NeuerPlanFormular titelRef={titelRef} vorlagen={vorlagen} heute={heute} onAngelegt={(id) => router.push(`/p/${id}`)} onAbbrechen={() => setOffen(false)} /> : null}
      </Drawer>
    </>
  );
}

export function NeuerPlanFormular({ onAngelegt, onAbbrechen, titelRef, vorlagen = [], startVorlage, heute }: {
  onAngelegt: (id: string) => void; onAbbrechen: () => void; titelRef?: React.Ref<InputRef>;
  /** Vorlagen zur Auswahl (Phase 4, Entscheidung 8); `heute` als `YYYY-MM-DD` in der Suite-Zone vom Server. */
  vorlagen?: VorlageWahl[]; startVorlage?: string; heute?: string;
}) {
  const basis = useId();
  /** Titel einer Vorlage für den neuen Plan (Entscheidung 8): ein Datum darin wird heute, sonst bleibt er — kein „ (Kopie)". */
  const titelAus = (v: VorlageWahl) => (heute ? ersetzeDatumImTitel(v.titel, heute) ?? v.titel : v.titel);
  const start = vorlagen.find((v) => v.id === startVorlage) ?? null;
  const [vorlage, setVorlage] = useState<string>(start?.id ?? "");
  const [titel, setTitel] = useState(start ? titelAus(start) : "");
  const [typ, setTyp] = useState<PlanTyp>(start?.typ ?? "kommunikationsplan");
  const [anlass, setAnlass] = useState(start?.anlass ?? "");
  const [datum, setDatum] = useState<Dayjs | null>(start && heute ? dayjs(heute) : null);
  const waehleVorlage = (id: string) => {
    setVorlage(id);
    const v = vorlagen.find((x) => x.id === id);
    if (!v) return;
    setTyp(v.typ);
    if (anlass.trim() === "") setAnlass(v.anlass ?? "");
    if (heute && datum === null) setDatum(dayjs(heute));
    if (titel.trim() === "") setTitel(titelAus(v));
  };
  const [fehler, setFehler] = useState<string | null>(null);
  const [feldFehler, setFeldFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);

  function absenden(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (laeuft) return;
    setFehler(null); setFeldFehler({}); setLaeuft(true);
    void legePlanAnAction({ titel, typ, anlass, datum: datum ? datum.format("YYYY-MM-DD") : null, vorlage: vorlage === "" ? null : vorlage })
      .then((r) => {
        if (r.ok) { onAngelegt(r.id); return; }
        setFehler(r.fehler); setFeldFehler(r.feldFehler); setLaeuft(false);
      })
      .catch(() => { setFehler("Der Plan ließ sich nicht anlegen. Prüfe die Verbindung und versuche es noch einmal."); setLaeuft(false); });
  }

  const feld = (name: keyof FeldFehler & string) => ({
    id: `${basis}-${name}`, "aria-invalid": feldFehler[name] ? true : undefined,
    "aria-describedby": feldFehler[name] ? `${basis}-${name}-fehler` : undefined,
  });
  const fehlerText = (name: string) => (feldFehler[name] ? <p id={`${basis}-${name}-fehler`} className="kp-feldfehler">{feldFehler[name]}</p> : null);

  return (
    <form aria-label="Neuer Plan" onSubmit={absenden} className="kp-formular">
      {fehler && Object.keys(feldFehler).length === 0 ? <Alert type="warning" showIcon title={fehler} /> : null}
      {vorlagen.length > 0 ? (
        <>
          <label className="kp-feldname" htmlFor={`${basis}-vorlage`}>Vorlage</label>
          <Select value={vorlage} onChange={waehleVorlage} {...feld("vorlage")}
            options={[{ value: "", label: "Leerer Plan" }, ...vorlagen.map((v) => ({ value: v.id, label: v.titel }))]} />
          {fehlerText("vorlage")}
        </>
      ) : null}
      <label className="kp-feldname" htmlFor={`${basis}-titel`}>Titel</label>
      <Input ref={titelRef} name="titel" value={titel} maxLength={LAENGE.titel} onChange={(e) => setTitel(e.target.value)} {...feld("titel")} />
      {fehlerText("titel")}
      <label className="kp-feldname" htmlFor={`${basis}-typ`}>Art</label>
      <Select id={`${basis}-typ`} value={typ} onChange={setTyp} options={PLAN_TYPEN.map((t) => ({ value: t, label: TYP_NAME[t] }))} />
      <label className="kp-feldname" htmlFor={`${basis}-anlass`}>Anlass</label>
      <Input name="anlass" value={anlass} maxLength={LAENGE_ANLASS} onChange={(e) => setAnlass(e.target.value)} {...feld("anlass")} />
      {fehlerText("anlass")}
      <label className="kp-feldname" htmlFor={`${basis}-datum`}>Datum</label>
      {/* feld() auch hier: aria-invalid UND aria-describedby auf den Fehlertext (docs/design/feedback-admin.md 4.4) */}
      <DatePicker {...feld("datum")} value={datum} onChange={setDatum} format="DD.MM.YYYY" onKeyDown={enterUebernimmtNurDasFeld}
        status={feldFehler.datum ? "error" : undefined} />
      {fehlerText("datum")}
      <div className="kp-formular-knoepfe">
        <Button type="primary" htmlType="submit" loading={laeuft} disabled={laeuft}>Anlegen und bearbeiten</Button>
        <Button onClick={onAbbrechen}>Abbrechen</Button>
      </div>
    </form>
  );
}
