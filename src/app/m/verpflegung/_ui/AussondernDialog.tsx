"use client";

import { useState } from "react";
import { Input, InputNumber, Modal, Segmented } from "antd";
import { aussondernAction } from "../_actions/verwaltung";
import { AUSSONDER_GRUENDE, datumLang, mengeText, TEILBAR, type AussonderGrund } from "../_lib/mhd";
import type { ChargeSicht } from "../_lib/typen";
import { useAktion } from "./useAktion";
import s from "./verpflegung.module.css";

/** Aussondern aus der Verwaltung: Menge (vorbelegt: alles), Grund, bei „Sonstiges“ ein Satz. */
export function AussondernDialog({ charge, onClose }: { charge: ChargeSicht | null; onClose: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const [menge, setMenge] = useState<number | null>(null);
  const [grund, setGrund] = useState<AussonderGrund>("abgelaufen");
  const [freitext, setFreitext] = useState("");
  const m = menge ?? charge?.menge ?? 0;
  return (
    <Modal
      open={charge !== null}
      title="Aussondern"
      okText="Aussondern"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      okButtonProps={{ disabled: !charge || m <= 0 || (grund === "Sonstiges" && !freitext.trim()) }}
      afterOpenChange={(auf) => {
        if (auf && charge) {
          setMenge(charge.menge);
          setGrund(charge.status.abgelaufen ? "abgelaufen" : "beschädigt");
          setFreitext("");
        }
      }}
      onCancel={onClose}
      onOk={() => charge && fuehreAus(() => aussondernAction({ chargeId: charge.id, menge: m, grund, freitext }), "Ausgesondert.", onClose)}
      destroyOnHidden
    >
      {charge && (
        <div className={s.stapel}>
          <div>
            <strong>{charge.artikelName}</strong>
            <div className={s.neben}>{charge.ortName} · MHD {datumLang(charge.mhd)} · Bestand {mengeText(charge.menge, charge.einheit)}</div>
          </div>
          <label className={s.stapel} style={{ gap: 6 }}>
            <span>Menge ({charge.einheit})</span>
            <InputNumber
              aria-label="Menge"
              min={TEILBAR.includes(charge.einheit) ? 0.001 : 1}
              step={TEILBAR.includes(charge.einheit) ? 0.1 : 1}
              precision={TEILBAR.includes(charge.einheit) ? 3 : 0}
              max={charge.menge}
              value={m}
              onChange={(v) => setMenge(v ?? 0)}
              status={feldFehler.menge ? "error" : undefined}
            />
          </label>
          <div className={s.stapel} style={{ gap: 6 }}>
            <span id="grund-titel">Grund</span>
            <Segmented<AussonderGrund> aria-labelledby="grund-titel" block value={grund} onChange={setGrund} options={AUSSONDER_GRUENDE.map((g) => ({ value: g, label: g }))} />
            {grund === "Sonstiges" && (
              <Input aria-label="Was ist passiert?" placeholder="Was ist passiert?" maxLength={200} value={freitext} onChange={(e) => setFreitext(e.target.value)} />
            )}
          </div>
        </div>
      )}
    </Modal>
  );
}
