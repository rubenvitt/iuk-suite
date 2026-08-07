"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Flex, Form, Input, Modal, Space, Switch } from "antd";
import {
  deleteTemplate,
  renameTemplate,
  setTemplateAktiv,
  templateAufFahrzeugeSyncen,
} from "../../../../_actions/templates";
import { Ikone } from "../../../../_ui/ikonen";
import { LoeschButton } from "../../../../_ui/LoeschButton";

const UMBENENNEN_FEHLER = "Vorlage konnte nicht umbenannt werden.";
const STATUS_FEHLER = "Vorlagenstatus konnte nicht geändert werden.";
const SYNC_FEHLER = "Vorlage konnte nicht synchronisiert werden.";
const LOESCH_FEHLER = "Vorlage konnte nicht gelöscht werden.";

type UmbenennenWerte = { name: string };

export function TemplateAktionen({
  id,
  name,
  aktiv,
  fahrzeuge,
}: {
  id: string;
  name: string;
  aktiv: boolean;
  fahrzeuge: number;
}) {
  const [aktuellerName, setAktuellerName] = useState(name);
  const [istAktiv, setIstAktiv] = useState(aktiv);
  const [umbenennenOffen, setUmbenennenOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [syncText, setSyncText] = useState<string | null>(null);
  const [laeuft, startTransition] = useTransition();
  const laufendRef = useRef(false);
  const [form] = Form.useForm<UmbenennenWerte>();

  function einmalig(aktion: () => Promise<void>): void {
    if (laufendRef.current) return;
    laufendRef.current = true;
    startTransition(async () => {
      try {
        await aktion();
      } finally {
        laufendRef.current = false;
      }
    });
  }

  function umbenennenOeffnen(): void {
    setFehler(null);
    form.setFields([]);
    form.setFieldsValue({ name: aktuellerName });
    setUmbenennenOffen(true);
  }

  function nameSpeichern(werte: UmbenennenWerte): void {
    einmalig(async () => {
      const naechsterName = werte.name.trim();
      setFehler(null);
      form.setFields([]);
      try {
        const ergebnis = await renameTemplate({ id, name: naechsterName });
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler?.name) {
            form.setFields([{
              name: "name",
              errors: [ergebnis.feldFehler.name],
            }]);
          }
          setFehler(UMBENENNEN_FEHLER);
          return;
        }
        setAktuellerName(naechsterName);
        setUmbenennenOffen(false);
      } catch {
        setFehler(UMBENENNEN_FEHLER);
      }
    });
  }

  function statusAendern(naechsterStatus: boolean): void {
    einmalig(async () => {
      setFehler(null);
      try {
        const ergebnis = await setTemplateAktiv({ id, aktiv: naechsterStatus });
        if (!ergebnis.ok) {
          setFehler(STATUS_FEHLER);
          return;
        }
        setIstAktiv(naechsterStatus);
      } catch {
        setFehler(STATUS_FEHLER);
      }
    });
  }

  function synchronisieren(): void {
    einmalig(async () => {
      setFehler(null);
      setSyncText(null);
      try {
        const ergebnis = await templateAufFahrzeugeSyncen({ templateId: id });
        if (!ergebnis.ok) {
          setFehler(SYNC_FEHLER);
          return;
        }
        const wert = ergebnis.wert;
        setSyncText(
          `${wert.fahrzeuge} Fahrzeug(e): ${wert.hinzugefuegt} hinzugefügt, ` +
          `${wert.aktualisiert} aktualisiert, ${wert.uebersprungen} übersprungen, ` +
          `${wert.entfernt} entfernt, ${wert.losgeloest} losgelöst.`,
        );
      } catch {
        setFehler(SYNC_FEHLER);
      }
    });
  }

  async function loeschen(): Promise<void> {
    try {
      const ergebnis = await deleteTemplate({ id });
      if (!ergebnis.ok) throw new Error(LOESCH_FEHLER);
    } catch {
      throw new Error(LOESCH_FEHLER);
    }
  }

  return (
    <Space orientation="vertical" size={12} style={{ width: "100%" }}>
      <Flex gap={8} wrap align="center">
        <Button
          icon={<Ikone name="stift" groesse={16} />}
          disabled={laeuft}
          onClick={umbenennenOeffnen}
        >
          Umbenennen
        </Button>
        <Space>
          <Switch
            checked={istAktiv}
            loading={laeuft}
            disabled={laeuft}
            aria-label="Vorlage aktiv"
            onChange={statusAendern}
          />
          <span>{istAktiv ? "aktiv" : "inaktiv"}</span>
        </Space>
        <Button
          icon={<Ikone name="erneut" groesse={16} />}
          loading={laeuft}
          disabled={laeuft}
          onClick={synchronisieren}
        >
          Auf alle Fahrzeuge übertragen
        </Button>
      </Flex>

      {syncText ? <span>{syncText}</span> : null}
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}

      <LoeschButton
        name={aktuellerName}
        typLabel="Vorlage"
        hinweis={
          `${fahrzeuge} Fahrzeug(e) werden von dieser Vorlage gelöst; ihre Positionen bleiben ` +
          "als individuelle Bestückung erhalten."
        }
        pruefen={async () => ({ loeschbar: true })}
        onLoeschen={loeschen}
      />

      <Modal
        open={umbenennenOffen}
        title="Vorlage umbenennen"
        okText="Speichern"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        closable={!laeuft}
        keyboard={!laeuft}
        mask={{ closable: !laeuft }}
        onCancel={() => {
          if (!laufendRef.current) setUmbenennenOffen(false);
        }}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<UmbenennenWerte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          onFinish={nameSpeichern}
        >
          <Form.Item name="name" label="Name">
            <Input aria-label="Name der Vorlage" />
          </Form.Item>
        </Form>
      </Modal>
    </Space>
  );
}
