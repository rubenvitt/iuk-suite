"use client";

import { useState } from "react";
import { InputNumber, Modal, Select, Switch, Tag } from "antd";
import { pruefplanSpeichernAction } from "../_actions/verwaltung";
import type { PruefplanEingabe } from "../_lib/eingabe";
import { intervallText, WER_TEXT } from "../_lib/fristen";
import type { PlanPunkt, PruefartZeile } from "../_lib/pruefplan";
import { useAktion } from "./useAktion";
import s from "./wartung.module.css";

type Zeile = PruefplanEingabe[number] & { pruefart: PruefartZeile; standard: boolean };

const ausPlan = (plan: readonly PlanPunkt[]): Zeile[] =>
  plan.map((p) => ({ pruefartId: p.pruefart.id, pruefart: p.pruefart, standard: p.standard, an: p.an, eigenes: p.eigenes }));

/**
 * Der Prüfplan eines Geräts (IDA-368): die Prüfarten seiner Art an- und abschalten, weitere aus dem Katalog
 * zuschalten und ein eigenes Intervall setzen. Gespeichert wird nur, wo das Gerät von der Art abweicht.
 *
 * Der Aufrufer hängt den Dialog nur ein, solange er offen ist: so beginnt jedes Öffnen beim aktuellen Plan, ohne
 * ein `afterOpenChange`, das unter Last erst nach dem ersten Klick käme (Falle 24).
 */
export function PruefplanDialog({ geraetId, plan, katalog, offen, schliessen }: {
  geraetId: string;
  plan: PlanPunkt[];
  katalog: PruefartZeile[];
  offen: boolean;
  schliessen: () => void;
}) {
  const { laeuft, fuehreAus } = useAktion();
  const [zeilen, setZeilen] = useState<Zeile[]>(() => ausPlan(plan));
  const setze = (id: string, teil: Partial<Zeile>) => setZeilen((alt) => alt.map((z) => (z.pruefartId === id ? { ...z, ...teil } : z)));
  const weitere = katalog.filter((p) => !zeilen.some((z) => z.pruefartId === p.id));

  return (
    <Modal
      open={offen}
      width={760}
      title="Prüfungen anpassen"
      okText="Speichern"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      onCancel={schliessen}
      onOk={() => fuehreAus(
        () => pruefplanSpeichernAction(geraetId, zeilen.map(({ pruefartId, an, eigenes }) => ({ pruefartId, an, eigenes }))),
        "Gespeichert.",
        schliessen,
      )}
      destroyOnHidden
    >
      <ul className={s.zeilen} aria-label="Prüfarten des Geräts">
        {zeilen.map((z) => {
          const eigen = z.eigenes !== null;
          return (
            <li key={z.pruefartId} className={s.planzeile}>
              <Switch checked={z.an} aria-label={`${z.pruefart.name} an diesem Gerät`} onChange={(an) => setze(z.pruefartId, { an })} />
              <div className={z.an ? undefined : s.planAus}>
                <div className={s.reihe}><strong>{z.pruefart.name}</strong>{!z.standard && <Tag>zusätzlich</Tag>}</div>
                <div className={s.neben}>{WER_TEXT[z.pruefart.wer]}</div>
              </div>
              <div className={s.planIntervall}>
                <Select
                  disabled={!z.an}
                  value={eigen ? "eigen" : "katalog"}
                  aria-label={`${z.pruefart.name}: Intervall`}
                  style={{ minWidth: 200 }}
                  onChange={(v) => setze(z.pruefartId, { eigenes: v === "eigen" ? { monate: z.pruefart.monate, stunden: z.pruefart.stunden } : null })}
                  options={[{ value: "katalog", label: intervallText(z.pruefart) }, { value: "eigen", label: "Eigenes Intervall" }]}
                />
                {z.an && z.eigenes && (
                  <>
                    <InputNumber value={z.eigenes.monate ?? undefined} min={1} max={120} precision={0} suffix="Monate" style={{ width: 150 }}
                      aria-label={`${z.pruefart.name}: alle … Monate`}
                      onChange={(v) => setze(z.pruefartId, { eigenes: { monate: v ?? null, stunden: z.eigenes!.stunden } })} />
                    <InputNumber value={z.eigenes.stunden ?? undefined} min={1} precision={0} suffix="h" style={{ width: 150 }}
                      aria-label={`${z.pruefart.name}: oder alle … Betriebsstunden`}
                      onChange={(v) => setze(z.pruefartId, { eigenes: { monate: z.eigenes!.monate, stunden: v ?? null } })} />
                  </>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      {weitere.length > 0 && (
        <Select
          value={null}
          placeholder="Prüfart hinzufügen"
          aria-label="Prüfart hinzufügen"
          style={{ minWidth: 260, marginTop: 12 }}
          options={weitere.map((p) => ({ value: p.id, label: `${p.name} · ${intervallText(p)}` }))}
          onChange={(id: string) => {
            const p = katalog.find((x) => x.id === id);
            if (p) setZeilen((alt) => [...alt, { pruefartId: p.id, pruefart: p, standard: false, an: true, eigenes: null }]);
          }}
        />
      )}
    </Modal>
  );
}
