"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, Modal } from "antd";
import { createFahrzeug } from "../../../_actions/fahrzeuge";
import { Ikone } from "../../../_ui/ikonen";

type FahrzeugWerte = {
  name: string;
  kennung?: string;
};

const FORM_FELDER = new Set<keyof FahrzeugWerte>(["name", "kennung"]);

function istFormFeld(name: string): name is keyof FahrzeugWerte {
  return FORM_FELDER.has(name as keyof FahrzeugWerte);
}

export function NeuFahrzeug() {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const laeuftRef = useRef(false);
  const [form] = Form.useForm<FahrzeugWerte>();
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

  function speichern(werte: FahrzeugWerte): void {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    form.setFields(Array.from(FORM_FELDER, (name) => ({ name, errors: [] })));

    start(async () => {
      try {
        const ergebnis = await createFahrzeug(werte);
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof FahrzeugWerte, string] => (
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
        setFehler("Fahrzeug konnte nicht angelegt werden.");
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
        Neues Fahrzeug
      </Button>
      <Modal
        open={offen}
        title="Neues Fahrzeug"
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
        <Form<FahrzeugWerte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          onFinish={speichern}
          data-rolle="neues-fahrzeug"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
          >
            <Input aria-label="Name" autoComplete="off" />
          </Form.Item>
          <Form.Item name="kennung" label="Kennung">
            <Input aria-label="Kennung" autoComplete="off" />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
