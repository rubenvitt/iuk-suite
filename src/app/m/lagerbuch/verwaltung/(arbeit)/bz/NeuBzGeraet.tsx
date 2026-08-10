"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, InputNumber, Modal, Select } from "antd";
import { geraetSpeichern } from "../../../_actions/bz";
import type { LagerortOption as Lagerort } from "../../../_lib/lesepfade/bz";
import { Ikone } from "../../../_ui/ikonen";

type Werte = {
  name: string;
  barcode?: string;
  lagerortId: string;
  streifenLot?: string;
  level1Label: string;
  level1Min?: number;
  level1Max?: number;
  level2Label: string;
  level2Min?: number;
  level2Max?: number;
};

const FORM_FELDER = new Set<keyof Werte>([
  "name",
  "barcode",
  "lagerortId",
  "streifenLot",
  "level1Label",
  "level1Min",
  "level1Max",
  "level2Label",
  "level2Min",
  "level2Max",
]);

function istFormFeld(name: string): name is keyof Werte {
  return FORM_FELDER.has(name as keyof Werte);
}

export type LagerortOption = {
  value: string;
  label: string;
};

export function lagerortFilter(eingabe: string, option?: LagerortOption): boolean {
  return (option?.label ?? "")
    .toLocaleLowerCase("de-DE")
    .includes(eingabe.trim().toLocaleLowerCase("de-DE"));
}

export function NeuBzGeraet({ lagerorte }: { lagerorte: Lagerort[] }) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const [form] = Form.useForm<Werte>();
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

  function speichern(werte: Werte): void {
    setFehler(null);
    start(async () => {
      try {
        const ergebnis = await geraetSpeichern(werte);
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
        setFehler("BZ-Gerät konnte nicht angelegt werden.");
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
        Neues BZ-Gerät
      </Button>
      <Modal
        open={offen}
        title="Neues BZ-Gerät"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        // Waehrend des Speicherns kein Weg nach draussen: sonst laeuft ein
        // spaeterer `setFehler` gegen einen geschlossenen Dialog, und `oeffnen()`
        // raeumt die Meldung beim naechsten Versuch weg (Modulform aus NeuFahrzeug).
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
          onFinish={speichern}
          data-rolle="neues-bz-geraet"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
          >
            <Input aria-label="Name des BZ-Geräts" autoComplete="off" />
          </Form.Item>
          <Form.Item name="barcode" label="Barcode">
            <Input aria-label="Barcode" autoComplete="off" />
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
          <Form.Item name="streifenLot" label="Streifen-Lot">
            <Input aria-label="Streifen-Lot" autoComplete="off" />
          </Form.Item>
          <Form.Item
            name="level1Label"
            label="Level 1 — Bezeichnung"
            rules={[
              { required: true, whitespace: true, message: "Level-1-Bezeichnung angeben" },
            ]}
          >
            <Input aria-label="Level-1-Bezeichnung" autoComplete="off" />
          </Form.Item>
          <Form.Item name="level1Min" label="Level 1 — von">
            <InputNumber
              aria-label="Level-1-Untergrenze"
              min={0}
              max={9999}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="level1Max" label="Level 1 — bis">
            <InputNumber
              aria-label="Level-1-Obergrenze"
              min={0}
              max={9999}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item
            name="level2Label"
            label="Level 2 — Bezeichnung"
            rules={[
              { required: true, whitespace: true, message: "Level-2-Bezeichnung angeben" },
            ]}
          >
            <Input aria-label="Level-2-Bezeichnung" autoComplete="off" />
          </Form.Item>
          <Form.Item name="level2Min" label="Level 2 — von">
            <InputNumber
              aria-label="Level-2-Untergrenze"
              min={0}
              max={9999}
              precision={0}
              style={{ width: "100%" }}
            />
          </Form.Item>
          <Form.Item name="level2Max" label="Level 2 — bis">
            <InputNumber
              aria-label="Level-2-Obergrenze"
              min={0}
              max={9999}
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
