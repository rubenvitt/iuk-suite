"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, InputNumber, Modal } from "antd";
import { createSchrank } from "../../../_actions/lagerorte";
import { Ikone } from "../../../_ui/ikonen";
import { istFormFeld, leereFormFehler, type SchrankWerte } from "./schrankWerte";

/**
 * Anlegen-Formular fuer einen Schrank — 1:1 nach dem Muster von
 * `fahrzeuge/NeuFahrzeug.tsx` (Modal, Verriegelung gegen Doppelabsenden,
 * Feldfehler am Feld, allgemeiner Fehler daneben, Schliessen nur bei Erfolg).
 */
export function NeuSchrank() {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const laeuftRef = useRef(false);
  const [form] = Form.useForm<SchrankWerte>();
  const router = useRouter();

  function oeffnen(): void {
    setFehler(null);
    setOffen(true);
  }

  function schliessen(): void {
    if (laeuftRef.current) return;
    setFehler(null);
    setOffen(false);
    form.resetFields();
  }

  function speichern(werte: SchrankWerte): void {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    form.setFields(leereFormFehler());

    start(async () => {
      try {
        const ergebnis = await createSchrank(werte);
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof SchrankWerte, string] => (
                istFormFeld(eintrag[0])
              ))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }

        setFehler(null);
        setOffen(false);
        form.resetFields();
        router.refresh();
      } catch {
        setFehler("Schrank konnte nicht angelegt werden.");
      } finally {
        laeuftRef.current = false;
      }
    });
  }

  return (
    <>
      <Button
        type="primary"
        icon={<Ikone name="plus" groesse={16} />}
        onClick={oeffnen}
      >
        Neuer Schrank
      </Button>
      <Modal
        open={offen}
        title="Neuer Schrank"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        closable={!laeuft}
        keyboard={!laeuft}
        mask={{ closable: !laeuft }}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<SchrankWerte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          onFinish={speichern}
          data-rolle="neuer-schrank"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
          >
            <Input aria-label="Name" autoComplete="off" />
          </Form.Item>
          <Form.Item name="zugangshinweis" label="Zugangshinweis">
            <Input aria-label="Zugangshinweis" autoComplete="off" />
          </Form.Item>
          <Form.Item name="sortierung" label="Reihenfolge">
            <InputNumber aria-label="Reihenfolge" style={{ width: "100%" }} />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
