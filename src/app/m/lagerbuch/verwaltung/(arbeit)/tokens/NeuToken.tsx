"use client";

import { useState, useTransition } from "react";
import { Alert, Button, Form, Input, Modal, Radio, Select } from "antd";
import { createToken } from "../../../_actions/tokens";
import { SCHRIFT } from "../../../_lib/schrift";
import { Ikone } from "../../../_ui/ikonen";

type ZielArt = "fahrzeug" | "artikel" | "liste";

type Werte = {
  label: string;
  zielArt: ZielArt;
  zielId?: string;
};

export type ZielOption = {
  value: string;
  label: string;
  keywords: string;
};

const FORM_FELDER = new Set<keyof Werte>(["label", "zielId"]);

function istFormFeld(name: string): name is keyof Werte {
  return FORM_FELDER.has(name as keyof Werte);
}

/**
 * Ant Design darf hier nicht implizit nach der technischen ID filtern: Für
 * Fahrzeuge gehören Name und Kennung, für Artikel Name und Fach zur Suche.
 */
export function zielFilter(eingabe: string, option?: ZielOption): boolean {
  return String(option?.keywords ?? option?.label ?? "")
    .toLocaleLowerCase("de-DE")
    .includes(eingabe.trim().toLocaleLowerCase("de-DE"));
}

export function NeuToken({
  ziele,
}: {
  ziele: {
    fahrzeuge: { id: string; name: string; kennung: string | null }[];
    artikel: { id: string; name: string; fach: string }[];
  };
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [code, setCode] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const [form] = Form.useForm<Werte>();
  const zielArt = Form.useWatch("zielArt", form) ?? "liste";

  const oeffnen = () => {
    setFehler(null);
    setCode(null);
    form.setFields([]);
    setOffen(true);
  };

  const schliessen = () => {
    setFehler(null);
    setCode(null);
    setOffen(false);
    form.resetFields();
  };

  const speichern = (werte: Werte) => {
    setFehler(null);
    form.setFields([]);
    start(async () => {
      try {
        const label = werte.label.trim();
        const eingabe = werte.zielArt === "liste"
          ? { label }
          : { label, zielTyp: werte.zielArt, zielId: werte.zielId };
        const ergebnis = await createToken(eingabe);
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof Werte, string] => istFormFeld(eintrag[0]))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }
        setCode(ergebnis.wert.code);
      } catch {
        setFehler("Zugangs-Code konnte nicht angelegt werden.");
      }
    });
  };

  const fahrzeugOptionen: ZielOption[] = ziele.fahrzeuge.map((fahrzeug) => ({
    value: fahrzeug.id,
    label: fahrzeug.name,
    keywords: `${fahrzeug.name} ${fahrzeug.kennung ?? ""}`,
  }));
  const artikelOptionen: ZielOption[] = ziele.artikel.map((artikel) => ({
    value: artikel.id,
    label: artikel.name,
    keywords: `${artikel.name} ${artikel.fach}`,
  }));

  return (
    <>
      <Button
        type="primary"
        icon={<Ikone name="plus" groesse={16} />}
        onClick={oeffnen}
      >
        Neuen Code anlegen
      </Button>
      <Modal
        open={offen}
        title="Neuen Zugangs-Code anlegen"
        okText={code ? "Schließen" : "Code anlegen"}
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onCancel={schliessen}
        onOk={code ? schliessen : () => form.submit()}
        destroyOnHidden
      >
        <Form<Werte>
          form={form}
          layout="vertical"
          disabled={laeuft || code !== null}
          initialValues={{ zielArt: "liste" }}
          onValuesChange={(geaendert) => {
            if (!("zielArt" in geaendert)) return;
            form.setFieldValue("zielId", undefined);
            form.setFields([{ name: "zielId", errors: [] }]);
          }}
          onFinish={speichern}
          data-rolle="neu-token-form"
        >
          <Form.Item
            name="label"
            label="Bezeichnung"
            rules={[{ required: true, whitespace: true, message: "Bezeichnung erforderlich" }]}
          >
            <Input aria-label="Bezeichnung" autoComplete="off" />
          </Form.Item>
          <Form.Item name="zielArt" label="Zielart">
            <Radio.Group
              options={[
                { value: "fahrzeug", label: "Fahrzeug" },
                { value: "artikel", label: "Artikel" },
                { value: "liste", label: "Artikel-Liste" },
              ]}
            />
          </Form.Item>
          {zielArt !== "liste" ? (
            <Form.Item
              name="zielId"
              label="Ziel auswählen"
              rules={[{ required: true, message: "Ziel auswählen" }]}
            >
              <Select<string, ZielOption>
                aria-label="Ziel auswählen"
                showSearch
                optionFilterProp="label"
                filterOption={zielFilter}
                options={zielArt === "fahrzeug" ? fahrzeugOptionen : artikelOptionen}
                virtual={false}
              />
            </Form.Item>
          ) : null}
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
        {code ? (
          <div role="status" style={{ marginBlockStart: 16 }}>
            <div>Erzeugter Code — jetzt notieren:</div>
            <div style={{ ...SCHRIFT.mono, fontSize: 28, fontWeight: 700 }}>{code}</div>
          </div>
        ) : null}
      </Modal>
    </>
  );
}
