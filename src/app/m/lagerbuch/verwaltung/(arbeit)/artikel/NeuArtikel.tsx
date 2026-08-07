"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, InputNumber, Modal } from "antd";
import { createArtikel } from "../../../_actions/artikel";
import { Ikone } from "../../../_ui/ikonen";

type ArtikelWerte = {
  name: string;
  fach: string;
  einheit: string;
  mindestbestand: number;
};

const FORM_FELDER = new Set<keyof ArtikelWerte>([
  "name",
  "fach",
  "einheit",
  "mindestbestand",
]);

function istFormFeld(name: string): name is keyof ArtikelWerte {
  return FORM_FELDER.has(name as keyof ArtikelWerte);
}

export function NeuArtikel() {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const [form] = Form.useForm<ArtikelWerte>();
  const router = useRouter();

  function oeffnen(): void {
    setFehler(null);
    setOffen(true);
  }

  function schliessen(): void {
    setFehler(null);
    setOffen(false);
    form.resetFields();
  }

  function speichern(werte: ArtikelWerte): void {
    setFehler(null);
    form.setFields(Array.from(FORM_FELDER, (name) => ({ name, errors: [] })));
    start(async () => {
      try {
        const ergebnis = await createArtikel(werte);
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof ArtikelWerte, string] => (
                istFormFeld(eintrag[0])
              ))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }
        schliessen();
        router.refresh();
      } catch {
        setFehler("Artikel konnte nicht angelegt werden.");
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
        Neuer Artikel
      </Button>
      <Modal
        open={offen}
        title="Neuer Artikel"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<ArtikelWerte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          initialValues={{ mindestbestand: 0 }}
          onFinish={speichern}
          data-rolle="neuer-artikel"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
          >
            <Input aria-label="Name" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="fach"
            label="Fach"
            rules={[{ required: true, whitespace: true, message: "Fach angeben" }]}
          >
            <Input aria-label="Fach" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="einheit"
            label="Einheit"
            rules={[{ required: true, whitespace: true, message: "Einheit angeben" }]}
          >
            <Input aria-label="Einheit" autoComplete="off" />
          </Form.Item>
          <Form.Item name="mindestbestand" label="Mindestbestand">
            <InputNumber
              aria-label="Mindestbestand"
              min={0}
              max={99999}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
