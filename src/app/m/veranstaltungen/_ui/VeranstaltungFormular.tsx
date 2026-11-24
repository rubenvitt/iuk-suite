"use client";

import { useState, type ReactNode } from "react";
import { App, Button, Input, Radio, Select } from "antd";
import { Zeitfelder, type Zeitraum } from "@/app/m/schichtplan/_ui/Zeitfelder";
import { veranstaltungLoeschenAction, veranstaltungSpeichernAction } from "../_actions/veranstaltung";
import type { FeldFehler } from "../_lib/actionErgebnis";
import { ARTEN, ART_TITEL, STATUS, STATUS_TITEL, type VeranstaltungArt, type VeranstaltungDTO, type VeranstaltungStatus } from "../_lib/typen";
import s from "./veranstaltungen.module.css";

function Feld({ titel, fehler, hilfe, children }: { titel: string; fehler?: string; hilfe?: ReactNode; children: ReactNode }) {
  return (
    <label className={s.feld}>
      <span className={s.feldTitel}>{titel}</span>
      {children}
      {fehler ? <span className={s.feldFehler} role="alert">{fehler}</span> : hilfe ? <span className={s.neben}>{hilfe}</span> : null}
    </label>
  );
}

const NAME_FEHLT = "Bitte einen Namen eintragen.";
const ZEIT_FEHLT = "Bitte Beginn und Ende wählen.";

/** Anlegen (`veranstaltung === null`) oder ändern; Modul-Admins können hier auch löschen. */
export function VeranstaltungFormular({ veranstaltung, darfLoeschen, onFertig }: {
  veranstaltung: VeranstaltungDTO | null; darfLoeschen: boolean; onFertig: () => void;
}) {
  const { message, modal } = App.useApp();
  const [name, setName] = useState(veranstaltung?.name ?? "");
  const [art, setArt] = useState<VeranstaltungArt>(veranstaltung?.art ?? "sanitaetsdienst");
  const [status, setStatus] = useState<VeranstaltungStatus>(veranstaltung?.status ?? "angefragt");
  const [ort, setOrt] = useState(veranstaltung?.ort ?? "");
  const [veranstalter, setVeranstalter] = useState(veranstaltung?.veranstalter ?? "");
  const [zeitraum, setZeitraum] = useState<Zeitraum>({ von: veranstaltung?.von ?? null, bis: veranstaltung?.bis ?? null });
  const [bemerkung, setBemerkung] = useState(veranstaltung?.bemerkung ?? "");
  const [fehler, setFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);

  async function speichern() {
    const { von, bis } = zeitraum;
    // Der Knopf ist nie grau; was fehlt, steht am Feld (wie in der Schichtplanung, IDA-385).
    const fehlt: FeldFehler = { ...(name.trim() ? {} : { name: NAME_FEHLT }), ...(von === null || bis === null ? { bis: ZEIT_FEHLT } : {}) };
    if (von === null || bis === null || Object.keys(fehlt).length) { setFehler(fehlt); return; }
    setLaeuft(true);
    try {
      const r = await veranstaltungSpeichernAction(veranstaltung?.id ?? null, { name, art, status, ort, veranstalter, von, bis, bemerkung });
      if (r.ok) { onFertig(); return; }
      setFehler(r.feldFehler ?? {});
      void message.warning(r.fehler);
    } catch {
      void message.warning("Das ging nicht. Bitte die Seite neu laden.");
    } finally {
      setLaeuft(false);
    }
  }

  function loeschen() {
    if (!veranstaltung) return;
    modal.confirm({
      title: "Veranstaltung löschen?",
      content: "Eine Planung in der Schichtplanung, die zu dieser Veranstaltung gehört, bleibt bestehen.",
      okText: "Löschen",
      cancelText: "Abbrechen",
      onOk: async () => {
        const r = await veranstaltungLoeschenAction(veranstaltung.id).catch(() => null);
        if (r?.ok) onFertig();
        else void message.warning(r?.fehler ?? "Die Veranstaltung ließ sich nicht löschen.");
      },
    });
  }

  const zeitFehler = fehler.bis ?? fehler.von;
  return (
    <div>
      <Feld titel="Name" fehler={fehler.name}>
        <Input value={name} aria-required status={fehler.name ? "error" : undefined} aria-invalid={!!fehler.name} maxLength={120} placeholder="z. B. Stadtfest Uelzen"
          onChange={(e) => { setName(e.target.value); if (e.target.value.trim()) setFehler((f) => (f.name === NAME_FEHLT ? { ...f, name: "" } : f)); }} />
      </Feld>
      <Feld titel="Art">
        <Select value={art} onChange={setArt} options={ARTEN.map((a) => ({ value: a, label: ART_TITEL[a] }))} />
      </Feld>
      <Feld titel="Status">
        <Radio.Group value={status} onChange={(e) => setStatus(e.target.value as VeranstaltungStatus)} options={STATUS.map((x) => ({ value: x, label: STATUS_TITEL[x] }))} />
      </Feld>
      <div className={s.feld} role="group" aria-label="Zeitraum">
        <span className={s.feldTitel}>Zeitraum</span>
        <Zeitfelder wert={zeitraum} pflicht fehlerId={zeitFehler ? "veranstaltung-zeitraum-fehler" : undefined}
          onChange={(z) => { setZeitraum(z); if (z.von !== null && z.bis !== null) setFehler((f) => (f.bis === ZEIT_FEHLT ? { ...f, bis: "" } : f)); }} />
        {zeitFehler ? <span id="veranstaltung-zeitraum-fehler" className={s.feldFehler} role="alert">{zeitFehler}</span> : <span className={s.neben}>Höchstens 14 Tage.</span>}
      </div>
      <Feld titel="Ort" fehler={fehler.ort}><Input value={ort} onChange={(e) => setOrt(e.target.value)} maxLength={120} /></Feld>
      <Feld titel="Veranstalter" fehler={fehler.veranstalter}><Input value={veranstalter} onChange={(e) => setVeranstalter(e.target.value)} maxLength={120} /></Feld>
      <Feld titel="Bemerkung" fehler={fehler.bemerkung}>
        <Input.TextArea value={bemerkung} onChange={(e) => setBemerkung(e.target.value)} maxLength={2000} autoSize={{ minRows: 3, maxRows: 8 }} />
      </Feld>
      <div className={s.knoepfe}>
        <Button type="primary" loading={laeuft} onClick={() => void speichern()}>{veranstaltung ? "Speichern" : "Anlegen"}</Button>
        {veranstaltung && darfLoeschen ? <Button danger onClick={loeschen}>Löschen</Button> : null}
      </div>
    </div>
  );
}
