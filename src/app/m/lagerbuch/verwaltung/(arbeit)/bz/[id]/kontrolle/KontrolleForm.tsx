"use client";

import { useState, useTransition } from "react";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Radio } from "antd";
import type { Dayjs } from "dayjs";
import { kontrolleErfassen } from "../../../../../_actions/bz";
import { monatAusPicker } from "../../../../../_ui/monat";

export type KontrolleLevelDto = {
  label: string | null;
  min: number | null;
  max: number | null;
} | null;

type KontrolleWerte = {
  level1Wert?: number;
  level2Wert?: number;
  kompresseVerfall?: Dayjs;
  sticks: number;
  lanzetten: number;
  batterieGewechselt: boolean;
  kommentar?: string;
};

const FORM_FELDER = new Set<keyof KontrolleWerte>([
  "level1Wert",
  "level2Wert",
  "kompresseVerfall",
  "sticks",
  "lanzetten",
  "batterieGewechselt",
  "kommentar",
]);

function istFormFeld(name: string): name is keyof KontrolleWerte {
  return FORM_FELDER.has(name as keyof KontrolleWerte);
}

function bereich(level: KontrolleLevelDto): string {
  if (!level || (level.min === null && level.max === null)) return "";
  return ` (${level.min ?? "?"}–${level.max ?? "?"})`;
}

function levelLabel(level: KontrolleLevelDto, fallback: string): string {
  return `${level?.label?.trim() || fallback}${bereich(level)}`;
}

export function KontrolleForm({
  geraetId,
  level1,
  level2,
}: {
  geraetId: string;
  level1: KontrolleLevelDto;
  level2: KontrolleLevelDto;
}) {
  const [form] = Form.useForm<KontrolleWerte>();
  const [laeuft, start] = useTransition();
  const [bestanden, setBestanden] = useState<boolean | null>(null);
  const [fehler, setFehler] = useState<string | null>(null);
  const level1Text = levelLabel(level1, "Level 1");
  const level2Text = levelLabel(level2, "Level 2");

  function speichern(werte: KontrolleWerte): void {
    setBestanden(null);
    setFehler(null);
    form.setFields(Array.from(FORM_FELDER, (name) => ({ name, errors: [] })));
    start(async () => {
      try {
        const ergebnis = await kontrolleErfassen({
          geraetId,
          ...werte,
          kompresseVerfall: monatAusPicker(werte.kompresseVerfall),
        });
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof KontrolleWerte, string] => (
                istFormFeld(eintrag[0])
              ))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }
        setBestanden(ergebnis.wert.bestanden);
        form.resetFields();
      } catch {
        setFehler("Kontrolle konnte nicht gespeichert werden.");
      }
    });
  }

  return (
    <Form<KontrolleWerte>
      form={form}
      layout="vertical"
      disabled={laeuft}
      initialValues={{ sticks: 0, lanzetten: 0, batterieGewechselt: false }}
      onFinish={speichern}
      aria-label="BZ-Kontrolle erfassen"
    >
      {level1 ? (
        <Form.Item name="level1Wert" label={level1Text}>
          <InputNumber
            data-rolle="level-wert"
            aria-label={level1Text}
            min={0}
            max={9999}
            precision={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      ) : null}
      {level2 ? (
        <Form.Item name="level2Wert" label={level2Text}>
          <InputNumber
            data-rolle="level-wert"
            aria-label={level2Text}
            min={0}
            max={9999}
            precision={0}
            style={{ width: "100%" }}
          />
        </Form.Item>
      ) : null}
      <Form.Item name="kompresseVerfall" label="Kompressen-Verfall">
        <DatePicker
          data-rolle="kompresse"
          picker="month"
          format="YYYY-MM"
          aria-label="Kompressen-Verfall"
          style={{ width: "100%" }}
        />
      </Form.Item>
      {/* 9999 bleibt absichtlich erlaubt: echter Überbestand muss beim Abgleich
          zählbar sein und darf nicht still auf einen kleineren Wert fallen. */}
      <Form.Item name="sticks" label="Teststreifen">
        <InputNumber
          data-rolle="sticks"
          aria-label="Teststreifen"
          min={0}
          max={9999}
          precision={0}
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item name="lanzetten" label="Lanzetten">
        <InputNumber
          data-rolle="lanzetten"
          aria-label="Lanzetten"
          min={0}
          max={9999}
          precision={0}
          style={{ width: "100%" }}
        />
      </Form.Item>
      <Form.Item name="batterieGewechselt" label="Akku gewechselt">
        {/* Eine echte Radio-Gruppe: ein Tabstop, Auswahl per Pfeiltasten. */}
        <Radio.Group
          aria-label="Akku gewechselt"
          options={[
            { value: false, label: "nein" },
            { value: true, label: "ja" },
          ]}
        />
      </Form.Item>
      <Form.Item name="kommentar" label="Kommentar">
        <Input aria-label="Kommentar" autoComplete="off" />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={laeuft}>
        Kontrolle speichern
      </Button>
      {bestanden !== null ? (
        <Alert
          type={bestanden ? "success" : "warning"}
          showIcon={false}
          title={bestanden
            ? "Kontrolle gespeichert — bestanden."
            : "Kontrolle gespeichert — NICHT bestanden."}
          role="status"
          style={{ marginBlockStart: 12 }}
        />
      ) : null}
      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          role="alert"
          style={{ marginBlockStart: 12 }}
        />
      ) : null}
    </Form>
  );
}
