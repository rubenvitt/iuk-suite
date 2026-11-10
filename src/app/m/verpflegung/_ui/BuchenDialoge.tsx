"use client";

import { useState } from "react";
import { Input, InputNumber, Modal, Select } from "antd";
import { ausgabeAction, eingangAction } from "../_actions/verwaltung";
import { AUSGABE_ZIELE, datumLang, MHD_ART_TEXT, mengeText, TEILBAR, tageBis, type MhdArt } from "../_lib/mhd";
import type { ChargeSicht, OrtDTO } from "../_lib/typen";
import { useAktion } from "./useAktion";
import s from "./verpflegung.module.css";

/**
 * IDA-382 — Ein- und Ausgang am Schreibtisch, als Dialog aus der Bestandszeile. Dieselben Buchungen wie am Telefon
 * (`_lib/schreiben.ts`), unter dem Namen der angemeldeten Person.
 *
 * Frisch je Ziel über `key` beim Aufrufer, nicht über `afterOpenChange`: das kommt erst nach der Animation und
 * löschte, was schon getippt ist.
 */

const zahlFeld = (einheit: string) => ({
  min: TEILBAR.includes(einheit) ? 0.001 : 1,
  step: TEILBAR.includes(einheit) ? 0.1 : 1,
  precision: TEILBAR.includes(einheit) ? 3 : 0,
});

export interface EingangZiel {
  artikelId: string;
  name: string;
  einheit: string;
  mhdArt: MhdArt;
}

export function EingangDialog({ ziel, orte, heute, onClose }: { ziel: EingangZiel | null; orte: OrtDTO[]; heute: string; onClose: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const [mhd, setMhd] = useState("");
  const [menge, setMenge] = useState<number>(1);
  const [ortId, setOrtId] = useState<string | null>(orte.length === 1 ? orte[0].id : null);
  const vergangen = mhd !== "" && tageBis(mhd, heute) < 0;
  // Ein gesperrter Knopf sagt, was fehlt (IDA-382).
  const fehlt = !mhd && !ortId ? "Datum und Ort wählen" : !mhd ? "Datum wählen" : !ortId ? "Ort wählen" : null;
  return (
    <Modal
      open={ziel !== null}
      title="Einbuchen"
      okText={fehlt ?? "Einbuchen"}
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      okButtonProps={{ disabled: fehlt !== null || vergangen || menge <= 0 }}
      onCancel={onClose}
      onOk={() => ziel && ortId && fuehreAus(() => eingangAction({ artikelId: ziel.artikelId, ortId, mhd, menge }), "Eingebucht.", onClose)}
      destroyOnHidden
    >
      {ziel && (
        <div className={s.stapel}>
          <strong>{ziel.name}</strong>
          <label className={s.stapel} style={{ gap: 6 }}>
            <span>{MHD_ART_TEXT[ziel.mhdArt]}</span>
            <Input
              type="date"
              aria-label={MHD_ART_TEXT[ziel.mhdArt]}
              min={heute}
              value={mhd}
              onChange={(e) => setMhd(e.target.value)}
              status={vergangen || feldFehler.mhd ? "error" : undefined}
            />
            {vergangen && <span className={s.textRot}>Datum liegt in der Vergangenheit.</span>}
          </label>
          <label className={s.stapel} style={{ gap: 6 }}>
            <span>Menge ({ziel.einheit})</span>
            <InputNumber aria-label="Menge" {...zahlFeld(ziel.einheit)} value={menge} onChange={(v) => setMenge(v ?? 0)} status={feldFehler.menge ? "error" : undefined} />
          </label>
          <label className={s.stapel} style={{ gap: 6 }}>
            <span>Lagerort</span>
            <Select<string>
              aria-label="Lagerort"
              value={ortId ?? undefined}
              onChange={setOrtId}
              options={orte.map((o) => ({ value: o.id, label: o.name }))}
            />
          </label>
        </div>
      )}
    </Modal>
  );
}

export function AusgabeDialog({ charge, onClose }: { charge: ChargeSicht | null; onClose: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const [menge, setMenge] = useState<number>(1);
  const [ziel, setZiel] = useState<string>("Dienstabend");
  const m = charge ? Math.min(menge, charge.menge) : menge;
  return (
    <Modal
      open={charge !== null}
      title="Ausgeben"
      okText="Ausgeben"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      okButtonProps={{ disabled: !charge || m <= 0 }}
      onCancel={onClose}
      onOk={() => charge && fuehreAus(() => ausgabeAction({ chargeId: charge.id, menge: m, ziel }), "Ausgegeben.", onClose)}
      destroyOnHidden
    >
      {charge && (
        <div className={s.stapel}>
          <div>
            <strong>{charge.artikelName}</strong>
            <div className={s.neben}>{charge.ortName} · MHD {datumLang(charge.mhd)} · Bestand {mengeText(charge.menge, charge.einheit)}</div>
          </div>
          {charge.status.abgelaufen && <span className={s.textGelb}>MHD überschritten. Nur nach Sichtprüfung ausgeben.</span>}
          <label className={s.stapel} style={{ gap: 6 }}>
            <span>Menge ({charge.einheit})</span>
            <InputNumber aria-label="Menge" {...zahlFeld(charge.einheit)} max={charge.menge} value={m} onChange={(v) => setMenge(v ?? 0)} status={feldFehler.menge ? "error" : undefined} />
          </label>
          <label className={s.stapel} style={{ gap: 6 }}>
            <span>Wofür?</span>
            <Select<string> aria-label="Wofür?" value={ziel} onChange={setZiel} options={AUSGABE_ZIELE.map((z) => ({ value: z, label: z }))} />
          </label>
        </div>
      )}
    </Modal>
  );
}
