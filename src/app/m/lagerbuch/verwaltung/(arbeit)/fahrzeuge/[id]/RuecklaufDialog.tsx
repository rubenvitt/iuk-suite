"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { Alert, Button, Form, InputNumber, Modal, Select } from "antd";
import { bucheRuecklauf } from "../../../../_actions/ruecklauf";
import type { ActionErgebnis } from "../../../../_lib/actionErgebnis";
import { inDerEinheit, type Einheitenart } from "../../../../_lib/konstanten";
import type { ChargeZeile } from "../../../../_lib/lesepfade/artikel";
import type { VerfallWert } from "../../../../_lib/verfallStand";
import { Ikone } from "../../../../_ui/ikonen";

const ALLGEMEIN = "Zurückbuchen fehlgeschlagen.";

/** Die wählbaren Ziele — `zugangsZiele`: Handlager-Wurzel plus aktive Schränke. */
export type RuecklaufZiel = { id: string; name: string };

type Werte = { chargeId?: string; menge: number; zielLagerortId?: string };

/**
 * Bucht eine Menge von der Einheit zurück in einen Schrank des Handlagers
 * (DRK-366). Die Charge ist Pflicht und wählbar sind nur die, die an der
 * Einheit liegen — sie wandert unverändert mit.
 *
 * ⚠️ DER DIALOG FÜHRT DIE AKTION NICHT SELBST AUS, sondern reicht sie in den
 * Trichter der Verfallstabelle (`useVerfallStand`), wie `AussondernDialog`: der
 * Rücklauf kann die gemeldete Verfallsangabe der Einheit abräumen, und nur die
 * Antwort weiß, ob er es getan hat. Ein eigener Weg daneben ließe den
 * Monatswähler einen Wert zeigen, der nicht mehr gespeichert ist.
 */
export function RuecklaufDialog({
  fahrzeugId,
  artikelId,
  artikelName,
  einheit,
  chargen,
  ziele,
  einheitenart,
  gesperrt = false,
  schreibe,
}: {
  fahrzeugId: string;
  artikelId: string;
  artikelName: string;
  einheit: string;
  /** Chargen mit Rest AN DIESER Einheit, FEFO sortiert. */
  chargen: ChargeZeile[];
  ziele: RuecklaufZiel[];
  einheitenart: Einheitenart | null;
  gesperrt?: boolean;
  schreibe: (
    aktion: () => Promise<ActionErgebnis<VerfallWert>>,
  ) => Promise<ActionErgebnis<VerfallWert>>;
}) {
  const [form] = Form.useForm<Werte>();
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const schreibtGerade = useRef(false);

  const gewaehlt = Form.useWatch("chargeId", form);
  const rest = chargen.find((c) => c.id === gewaehlt)?.rest;

  /*
   * Bei JEDEM Öffnen setzen, nicht nur über `initialValues` — dieselbe Falle wie
   * in `AussondernDialog`: die Form-Instanz überlebt `destroyOnHidden` samt
   * Feldspeicher. Gibt es genau eine Charge oder genau ein Ziel, steht es schon
   * da; eine Auswahl aus einem Eintrag ist ein Klick ohne Entscheidung.
   */
  useEffect(() => {
    if (!offen) return;
    form.setFieldsValue({
      chargeId: chargen.length === 1 ? chargen[0]!.id : undefined,
      menge: 1,
      zielLagerortId: ziele.length === 1 ? ziele[0]!.id : undefined,
    });
  }, [offen, chargen, ziele, form]);

  function oeffnen() {
    setFehler(null);
    setOffen(true);
  }

  function schliessen() {
    if (laeuft) return;
    form.resetFields();
    setOffen(false);
  }

  function speichern(werte: Werte) {
    if (schreibtGerade.current) return;
    schreibtGerade.current = true;
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await schreibe(() => bucheRuecklauf({
          fahrzeugId,
          artikelId,
          chargeId: werte.chargeId ?? "",
          menge: werte.menge,
          zielLagerortId: werte.zielLagerortId ?? "",
        }));
        if (ergebnis.ok) {
          form.resetFields();
          setOffen(false);
          return;
        }
        // Der Satz aus der Action: nur er nennt die tatsächlich vorhandene Menge.
        setFehler(ergebnis.fehler);
      } catch {
        setFehler(ALLGEMEIN);
      } finally {
        schreibtGerade.current = false;
      }
    });
  }

  return (
    <>
      {/* KEIN size="small" — Arbeitsdichte 44px (Falle 4, WCAG 2.5.5). */}
      <Button
        disabled={gesperrt || chargen.length === 0 || ziele.length === 0}
        icon={<Ikone name="pfeil-links" groesse={14} />}
        onClick={oeffnen}
        aria-label={`${artikelName} zurück ins Handlager`}
      >
        zurückbuchen
      </Button>
      <Modal
        open={offen}
        title={`${artikelName} zurück ins Handlager`}
        okText="Zurückbuchen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        closable={!laeuft}
        keyboard={!laeuft}
        mask={{ closable: !laeuft }}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<Werte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          initialValues={{ menge: 1 }}
          onFinish={speichern}
          data-rolle="ruecklauf"
        >
          <Form.Item
            name="chargeId"
            label="Charge"
            rules={[{ required: true, message: "Charge wählen" }]}
            extra={`Nur Chargen, die ${inDerEinheit(einheitenart)} liegen.`}
          >
            <Select
              aria-label="Charge"
              placeholder="Charge wählen"
              options={chargen.map((charge) => ({
                value: charge.id,
                label: `${charge.chargenNr} · ${charge.verfall} · ${charge.rest} ${einheit}`,
              }))}
            />
          </Form.Item>
          <Form.Item
            name="menge"
            label={rest === undefined ? "Menge" : `Menge (von dieser Charge liegen hier ${rest} ${einheit})`}
            rules={[{ required: true, message: "Menge angeben" }]}
          >
            <InputNumber
              aria-label="Menge"
              min={1}
              max={rest}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="zielLagerortId"
            label="Ziel im Handlager"
            rules={[{ required: true, message: "Ziel wählen" }]}
          >
            <Select
              aria-label="Ziel"
              placeholder="Schrank wählen"
              options={ziele.map((ziel) => ({ value: ziel.id, label: ziel.name }))}
            />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
