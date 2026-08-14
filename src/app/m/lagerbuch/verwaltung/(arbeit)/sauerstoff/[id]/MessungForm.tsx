"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Form, Input, InputNumber } from "antd";
import { SPACE } from "@/core/theme/tokens";
import { messungErfassen } from "../../../../_actions/sauerstoff";

const MESSUNG_FEHLER = "Messung konnte nicht gespeichert werden.";

type MessungWerte = {
  druckBar: number;
  kommentar?: string;
};

const FORM_FELDER = new Set<keyof MessungWerte>(["druckBar", "kommentar"]);

function istFormFeld(name: string): name is keyof MessungWerte {
  return FORM_FELDER.has(name as keyof MessungWerte);
}

export function MessungForm({ flascheId }: { flascheId: string }) {
  const [form] = Form.useForm<MessungWerte>();
  const [fehler, setFehler] = useState<string | null>(null);
  const [meldung, setMeldung] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  const laufendRef = useRef(false);

  function absenden(werte: MessungWerte): void {
    if (laufendRef.current) return;
    laufendRef.current = true;
    setFehler(null);
    setMeldung(null);
    form.setFields(Array.from(FORM_FELDER, (name) => ({ name, errors: [] })));
    startTransition(async () => {
      try {
        const ergebnis = await messungErfassen({
          flascheId,
          druckBar: werte.druckBar,
          kommentar: werte.kommentar?.trim() || undefined,
        });
        if (!ergebnis.ok) {
          form.setFields(Object.entries(ergebnis.feldFehler ?? {})
            .filter((eintrag): eintrag is [keyof MessungWerte, string] => (
              istFormFeld(eintrag[0])
            ))
            .map(([name, errors]) => ({ name, errors: [errors] })));
          setFehler(MESSUNG_FEHLER);
          return;
        }
        form.resetFields();
        setMeldung("Messung erfasst.");
      } catch {
        setFehler(MESSUNG_FEHLER);
      } finally {
        laufendRef.current = false;
      }
    });
  }

  return (
    <Form<MessungWerte>
      form={form}
      layout="inline"
      disabled={laeuft}
      onFinish={absenden}
    >
      <Form.Item
        name="druckBar"
        label="Druck (bar)"
        rules={[{ required: true, message: "Druck erforderlich" }]}
      >
        <InputNumber<number>
          min={0}
          precision={0}
          aria-label="Druck (bar)"
        />
      </Form.Item>
      <Form.Item name="kommentar" label="Kommentar">
        <Input
          aria-label="Kommentar"
          placeholder="optional"
          style={{ minWidth: 220 }}
        />
      </Form.Item>
      <Button type="primary" htmlType="submit" loading={laeuft}>
        Messung speichern
      </Button>
      {meldung ? (
        <Alert
          type="success"
          showIcon={false}
          title={meldung}
          style={{ marginInlineStart: SPACE.md }}
        />
      ) : null}
      {fehler ? (
        <Alert
          type="warning"
          showIcon={false}
          title={fehler}
          style={{ marginInlineStart: SPACE.md }}
        />
      ) : null}
    </Form>
  );
}
