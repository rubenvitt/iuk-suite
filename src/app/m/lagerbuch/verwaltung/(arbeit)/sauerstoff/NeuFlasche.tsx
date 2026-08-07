"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, InputNumber, Modal, Select } from "antd";
import { flascheSpeichern } from "../../../_actions/sauerstoff";
import { Ikone } from "../../../_ui/ikonen";

type Werte = {
  name: string;
  lagerortId: string;
  groesseLiter?: number;
  nennfuelldruckBar: number;
};

const FORM_FELDER = new Set<keyof Werte>([
  "name", "lagerortId", "groesseLiter", "nennfuelldruckBar",
]);

function istFormFeld(name: string): name is keyof Werte {
  return FORM_FELDER.has(name as keyof Werte);
}

type LagerortOption = {
  label: string;
  value: string;
};

/** Das Select filtert sichtbar nach seiner Beschriftung, nicht nach der ID. */
export function lagerortFilter(eingabe: string, option?: LagerortOption): boolean {
  return String(option?.label ?? "")
    .toLocaleLowerCase("de-DE")
    .includes(eingabe.trim().toLocaleLowerCase("de-DE"));
}

export function NeuFlasche({
  lagerorte,
}: {
  lagerorte: { id: string; name: string }[];
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const [form] = Form.useForm<Werte>();
  const router = useRouter();

  const oeffnen = () => {
    setFehler(null);
    form.setFields([]);
    setOffen(true);
  };

  const schliessen = () => {
    setFehler(null);
    setOffen(false);
    form.resetFields();
  };

  const speichern = (werte: Werte) => {
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await flascheSpeichern(werte);
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof Werte, string] => istFormFeld(eintrag[0]))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }
        schliessen();
        router.refresh();
      } catch {
        setFehler("Sauerstoffflasche konnte nicht angelegt werden.");
      }
    });
  };

  return (
    <>
      <Button
        type="primary"
        icon={<Ikone name="plus" groesse={16} />}
        onClick={oeffnen}
      >
        Neue Sauerstoffflasche
      </Button>
      <Modal
        open={offen}
        title="Neue Sauerstoffflasche"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<Werte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          onFinish={speichern}
          data-rolle="neue-o2-flasche"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
          >
            <Input aria-label="Name der Sauerstoffflasche" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="lagerortId"
            label="Standort"
            rules={[{ required: true, message: "Standort wählen" }]}
          >
            <Select<string, LagerortOption>
              aria-label="Standort"
              showSearch
              filterOption={lagerortFilter}
              options={lagerorte.map((lagerort) => ({
                value: lagerort.id,
                label: lagerort.name,
              }))}
              virtual={false}
            />
          </Form.Item>
          <Form.Item name="groesseLiter" label="Größe in Litern (optional)">
            <InputNumber
              aria-label="Größe in Litern"
              min={1}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="nennfuelldruckBar"
            label="Nennfülldruck in bar"
            rules={[
              { required: true, message: "Nennfülldruck angeben" },
              { type: "number", min: 1, message: "Nennfülldruck muss größer als 0 sein" },
            ]}
          >
            <InputNumber
              aria-label="Nennfülldruck in bar"
              min={1}
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
