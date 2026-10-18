"use client";

import { useRef, useState, useTransition } from "react";
import { Alert, Button, Dropdown, Flex, Form, Input, Modal, Popconfirm } from "antd";
import { useRouter } from "next/navigation";
import { SPACE } from "@/core/theme/tokens";
import {
  deleteTemplate,
  renameTemplate,
  setTemplateAktiv,
  templateAufFahrzeugeSyncen,
} from "../../../../_actions/templates";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { SCHRIFT } from "../../../../_lib/schrift";
import { Ikone } from "../../../../_ui/ikonen";
import { LoeschDialog } from "../../../../_ui/LoeschDialog";

const UMBENENNEN_FEHLER = "Vorlage konnte nicht umbenannt werden.";
const STATUS_FEHLER = "Vorlagenstatus konnte nicht geändert werden.";
const SYNC_FEHLER = "Vorlage konnte nicht synchronisiert werden.";
const LOESCH_FEHLER = "Vorlage konnte nicht gelöscht werden.";

type UmbenennenWerte = { name: string };

/**
 * DIE AKTIONEN EINER VORLAGE — SEIT IDA-239 IM SEITENKOPF.
 *
 * Vorher standen Umbenennen, Aktiv-Schalter, „Auf alle Einheiten übertragen"
 * und der rote Löschknopf in einer Karte UNTER der Positionsliste — bei einer
 * großen Vorlage rund 14 800 px tief. Jetzt: EINE Hauptaktion im Kopf
 * (übertragen), der Rest hinter „Weitere Aktionen". Löschen steht dort
 * zuletzt und ohne Rot (Falle 3) — ob gelöscht wird, entscheidet der Dialog,
 * der den Namen abfragt.
 *
 * Ergebnis und Fehler stehen direkt unter den Knöpfen, rechtsbündig im Kopf:
 * dort, wo geklickt wurde.
 */
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
  const router = useRouter();
  const [aktuellerName, setAktuellerName] = useState(name);
  const [istAktiv, setIstAktiv] = useState(aktiv);
  const [umbenennenOffen, setUmbenennenOffen] = useState(false);
  const [loeschenOffen, setLoeschenOffen] = useState(false);
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
          `${wert.fahrzeuge} Einheit(en): ${wert.hinzugefuegt} hinzugefügt, ` +
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
    router.push("/verwaltung/vorlagen");
  }

  return (
    <div style={{ display: "grid", gap: SPACE.sm, justifyItems: "end" }}>
      <Flex gap={SPACE.sm} wrap align="center" justify="flex-end">
        {/*
          Die folgenreichste Aktion der Seite: sie schreibt ueber alle
          verknuepften Einheiten und loescht dabei verwaiste Soll-Zeilen
          (`_lib/schreibpfade/templateSync.ts`, Regel 4) — deren IDs stehen in
          historischen `checks.ergebnis`-JSONs. Die Zahl der betroffenen
          Einheiten liegt als Prop bereits vor, sie gehoert VOR den Klick.

          ⚠️ NEUTRAL, NICHT ART-BEWUSST (DRK-309). Hier steht kein Baustein aus
          `konstanten.ts`, und das ist Absicht: dieselbe Vorlage haengt an einem
          RTW UND an drei Sanitaetstaschen, der Satz spricht also ueber MEHRERE
          Einheiten verschiedener Art. Ein „Auf alle Fahrzeuge übertragen" waere
          hier nicht nur schief, sondern eine falsche Zusage — es klaenge, als
          bliebe die Tasche daneben unberuehrt.

          IDA-239: OHNE VERKNÜPFTE EINHEIT GESPERRT — es gäbe nichts zu
          übertragen, und eine Hauptaktion, die nichts tut, ist eine Falle.
        */}
        <Popconfirm
          title="Auf alle verknüpften Einheiten übertragen?"
          description={
            `Überschreibt die Soll-Bestückung von ${fahrzeuge} verknüpften Einheit(en). ` +
            "Positionen, die nicht mehr in der Vorlage stehen, werden dort entfernt."
          }
          okText="Übertragen"
          cancelText="Abbrechen"
          okButtonProps={{ loading: laeuft }}
          onConfirm={synchronisieren}
          disabled={fahrzeuge === 0}
        >
          <Button
            type="primary"
            icon={<Ikone name="erneut" groesse={16} />}
            loading={laeuft}
            disabled={laeuft || fahrzeuge === 0}
            title={fahrzeuge === 0 ? "Keine Einheit nutzt diese Vorlage." : undefined}
          >
            Auf alle Einheiten übertragen
          </Button>
        </Popconfirm>
        <Dropdown
          trigger={["click"]}
          disabled={laeuft}
          menu={{
            items: [
              {
                key: "umbenennen",
                icon: <Ikone name="stift" groesse={16} />,
                label: "Umbenennen",
                onClick: umbenennenOeffnen,
              },
              {
                key: "status",
                label: istAktiv ? "Deaktivieren" : "Aktivieren",
                onClick: () => statusAendern(!istAktiv),
              },
              { type: "divider" },
              {
                key: "loeschen",
                icon: <Ikone name="papierkorb" groesse={16} />,
                label: "Vorlage löschen",
                onClick: () => setLoeschenOffen(true),
              },
            ],
          }}
        >
          {/* KEIN `size` (Falle 4) — 44px wie der Knopf daneben. */}
          <Button
            aria-label="Weitere Aktionen"
            icon={<Icons8Ikone name="more" groesse={18} />}
          />
        </Dropdown>
      </Flex>

      {syncText ? (
        <span role="status" style={{ ...SCHRIFT.neben, maxWidth: "48ch", textAlign: "end" }}>
          {syncText}
        </span>
      ) : null}
      {fehler && !umbenennenOffen
        ? <Alert type="warning" showIcon={false} title={fehler} />
        : null}

      <LoeschDialog
        offen={loeschenOffen}
        name={aktuellerName}
        typLabel="Vorlage"
        hinweis={
          `${fahrzeuge} Einheit(en) werden von dieser Vorlage gelöst; ihre Positionen bleiben ` +
          "als individuelle Bestückung erhalten."
        }
        pruefen={async () => ({ loeschbar: true })}
        onLoeschen={loeschen}
        onSchliessen={() => setLoeschenOffen(false)}
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
          if (!laufendRef.current) {
            setFehler(null);
            setUmbenennenOffen(false);
          }
        }}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        {fehler
          ? <Alert type="warning" showIcon={false} title={fehler} />
          : null}
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
    </div>
  );
}
