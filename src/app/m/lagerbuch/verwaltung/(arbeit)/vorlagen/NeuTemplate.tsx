"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, Modal } from "antd";
import { createTemplate } from "../../../_actions/templates";
import { Ikone } from "../../../_ui/ikonen";

type TemplateWerte = {
  name: string;
};

export function NeuTemplate() {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const [form] = Form.useForm<TemplateWerte>();
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

  function speichern(werte: TemplateWerte): void {
    setFehler(null);
    form.setFields([{ name: "name", errors: [] }]);
    start(async () => {
      try {
        const ergebnis = await createTemplate(werte);
        if (!ergebnis.ok) {
          const nameFehler = ergebnis.feldFehler?.name;
          if (nameFehler) form.setFields([{ name: "name", errors: [nameFehler] }]);
          setFehler(ergebnis.fehler);
          return;
        }
        schliessen();
        router.refresh();
      } catch {
        setFehler("Vorlage konnte nicht angelegt werden.");
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
        Neue Vorlage
      </Button>
      <Modal
        open={offen}
        title="Neue Vorlage"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<TemplateWerte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          onFinish={speichern}
          data-rolle="neue-vorlage"
        >
          <Form.Item
            name="name"
            label="Name"
            rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
          >
            <Input aria-label="Name" autoComplete="off" />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
