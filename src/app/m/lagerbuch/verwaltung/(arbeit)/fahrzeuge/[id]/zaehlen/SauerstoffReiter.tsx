"use client";

/**
 * DER REITER „Sauerstoff" (Spec 6.7) — je Flasche an der Einheit der
 * abgelesene Druck mit Füllstand; „Flasche verknüpfen" (Auswahl — Flaschen
 * haben keinen Barcode) und „Flasche anlegen" wirken sofort.
 *
 * Nicht abgelesene Flaschen gehen nicht in den Abschluss. Ein Druck über dem
 * Nennfülldruck steht hier am Feld und sperrt in der Leiste (`sperrGruende`);
 * der Server prüft dasselbe (`druckZuHoch`).
 */

import { useState } from "react";
import { Alert, Button, Form, InputNumber, Modal, Select } from "antd";
import { flascheUmsetzen } from "../../../../../_actions/sauerstoff";
import { druckHoechstBar, druckZuHoch, o2Status } from "../../../../../_lib/domain/o2";
import { ampelTon } from "../../../../../_lib/format";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import type { ZaehlZustand } from "../../../../../_lib/verwaltungscheck";
import { Chip } from "../../../../../_ui/Chip";
import { Ikone } from "../../../../../_ui/ikonen";
import { NeuFlasche } from "../../../sauerstoff/NeuFlasche";
import type { ReiterProps } from "./reiter";
import { useSofort } from "./useSofort";
import k from "./zaehlen.module.css";

type Flasche = VerwaltungscheckDaten["flaschen"][number];

function mitDruck(z: ZaehlZustand, flascheId: string, druck: number | null): ZaehlZustand {
  const neu = { ...z.druck };
  // Ein geleertes Feld heißt „nicht abgelesen".
  if (druck === null) delete neu[flascheId];
  else neu[flascheId] = druck;
  return { ...z, druck: neu };
}

/**
 * Der Füllstand als Chips — wie im Check: ohne Nennfülldruck ist er NICHT
 * BEWERTBAR (sonst stünde eine volle Flasche rot da), und die Wechselgrenze
 * nennt ihren Wert in bar.
 */
function DruckStatus({ flasche, druck }: { flasche: Flasche; druck: number | undefined }) {
  if (druck === undefined) return <Chip ton="grau">nicht abgelesen</Chip>;
  if (druckZuHoch(druck, flasche.nennfuelldruckBar)) {
    return <Chip ton="rot">über {druckHoechstBar(flasche.nennfuelldruckBar)} bar – bitte prüfen</Chip>;
  }
  if (flasche.nennfuelldruckBar <= 0) return <Chip ton="grau">nicht bewertbar</Chip>;
  const st = o2Status(druck, flasche.nennfuelldruckBar, flasche.wechselAbProzent);
  return (
    <>
      <Chip ton={ampelTon(st.ampel)}>{st.prozent} %</Chip>
      {st.wechseln ? <Chip ton="rot">wechseln – ab {st.wechselAbBar} bar ({st.wechselAbProzent} %)</Chip> : null}
    </>
  );
}

export function SauerstoffReiter({ daten, zustand, aendere, gesperrt }: ReiterProps) {
  return (
    <div className={k.liste}>
      <div className={k.kopfzeile}>
        <FlascheVerknuepfen daten={daten} gesperrt={gesperrt} />
        <NeuFlasche lagerorte={daten.lagerorte} vorgabeLagerortId={daten.fahrzeug.id} ausloeser="neutral" />
      </div>
      {daten.flaschen.length === 0 ? (
        <p className={k.hinweis} data-rolle="flaschen-leer">Noch keine Flasche an dieser Einheit.</p>
      ) : daten.flaschen.map((f) => (
        <div key={f.id} className={k.karte} data-rolle="flasche" data-flasche={f.id}>
          <div className={k.name}>{f.name}</div>
          <p className={k.merkmale}>
            <span>
              {f.nennfuelldruckBar > 0 ? `Nennfülldruck ${f.nennfuelldruckBar} bar` : "Nennfülldruck nicht hinterlegt"}
            </span>
            <DruckStatus flasche={f} druck={zustand.druck[f.id]} />
          </p>
          <InputNumber<number>
            aria-label={`Druck ${f.name}`}
            placeholder="Druck am Manometer"
            suffix="bar"
            min={0}
            precision={0}
            disabled={gesperrt}
            value={zustand.druck[f.id] ?? null}
            style={{ width: "100%", maxWidth: 240 }}
            onChange={(wert) => {
              const druck = typeof wert === "number" ? wert : null;
              aendere((z) => mitDruck(z, f.id, druck));
            }}
          />
        </div>
      ))}
    </div>
  );
}

/** „Flasche verknüpfen" — aus den aktiven Flaschen an anderen Orten (Spec 6.7). */
function FlascheVerknuepfen({ daten, gesperrt }: { daten: VerwaltungscheckDaten; gesperrt: boolean }) {
  const [form] = Form.useForm<{ flascheId?: string }>();
  const [offen, setOffen] = useState(false);
  const sofort = useSofort("Flasche konnte nicht verknüpft werden.");

  function schliessen() {
    if (sofort.laeuft) return;
    form.resetFields();
    sofort.setFehler(null);
    setOffen(false);
  }

  return (
    <>
      <Button icon={<Ikone name="verketten" groesse={16} />} disabled={gesperrt} onClick={() => setOffen(true)}>
        Flasche verknüpfen
      </Button>
      <Modal
        open={offen}
        title="Flasche verknüpfen"
        okText="Verknüpfen"
        cancelText="Abbrechen"
        confirmLoading={sofort.laeuft}
        onOk={() => form.submit()}
        onCancel={schliessen}
        destroyOnHidden
      >
        <Form<{ flascheId?: string }>
          form={form}
          layout="vertical"
          disabled={sofort.laeuft}
          onFinish={(w) => {
            if (!w.flascheId) return;
            const flascheId = w.flascheId;
            void sofort.ausfuehren(
              () => flascheUmsetzen({ flascheId, lagerortId: daten.fahrzeug.id }),
              () => { form.resetFields(); setOffen(false); },
            );
          }}
        >
          <Form.Item name="flascheId" label="Flasche" rules={[{ required: true, message: "Flasche wählen" }]}>
            <Select
              aria-label="Flasche an anderem Ort"
              placeholder={daten.flaschenWoanders.length === 0 ? "Keine Flasche an einem anderen Ort" : "Flasche suchen"}
              showSearch
              optionFilterProp="label"
              options={daten.flaschenWoanders.map((f) => ({ value: f.id, label: `${f.name} · ${f.ortLabel}` }))}
            />
          </Form.Item>
        </Form>
        {sofort.fehler ? <Alert type="warning" showIcon={false} title={sofort.fehler} /> : null}
      </Modal>
    </>
  );
}
