"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, App, Button, Form, Input, InputNumber, Modal } from "antd";
import { createArtikel } from "../../../_actions/artikel";
import { Ikone } from "../../../_ui/ikonen";
import { EntwurfZeile } from "../../../_ui/EntwurfZeile";
import { useFormEntwurf } from "@/core/entwurf/useFormEntwurf";
import { KategorieEingabe } from "../../../_ui/KategorieEingabe";

type ArtikelWerte = {
  name: string;
  fach: string;
  einheit: string;
  mindestbestand: number;
  kategorie?: string;
};

const FORM_FELDER = new Set<keyof ArtikelWerte>([
  "name",
  "fach",
  "einheit",
  "mindestbestand",
  "kategorie",
]);

function istFormFeld(name: string): name is keyof ArtikelWerte {
  return FORM_FELDER.has(name as keyof ArtikelWerte);
}

export function NeuArtikel({
  kategorien = [], onAngelegt,
}: {
  kategorien?: readonly string[];
  /** IDA-378 — die Liste oeffnet danach die Schublade des neuen Artikels. */
  onAngelegt?: (id: string) => void;
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  /**
   * IDA-378 — der Name, zu dem die Warnung „gibt es schon" steht. Der naechste
   * Versuch mit DEMSELBEN Namen ist „Trotzdem anlegen"; wer den Namen aendert,
   * wird wieder gefragt.
   */
  const [dublette, setDublette] = useState<string | null>(null);
  const { message } = App.useApp();
  const [laeuft, start] = useTransition();
  const [form] = Form.useForm<ArtikelWerte>();
  // IDA-358: die Eingaben ueberstehen ein Neuladen; liegt ein Entwurf, steht
  // der Dialog danach gleich wieder offen — sonst saehe ihn niemand.
  const entwurf = useFormEntwurf(form, "lagerbuch:neu-artikel");
  const router = useRouter();

  function oeffnen(): void {
    setFehler(null);
    setDublette(null);
    setOffen(true);
  }

  function schliessen(): void {
    setFehler(null);
    setDublette(null);
    setOffen(false);
    entwurf.verwerfen();
  }

  function speichern(werte: ArtikelWerte): void {
    setFehler(null);
    form.setFields(Array.from(FORM_FELDER, (name) => ({ name, errors: [] })));
    const name = werte.name.trim();
    const bestaetigt = dublette !== null && dublette === name;
    start(async () => {
      try {
        const ergebnis = await createArtikel(
          bestaetigt ? { ...werte, dublettBestaetigt: true } : werte,
        );
        if (!ergebnis.ok) {
          if ("dublette" in ergebnis) {
            setDublette(name);
          } else if (ergebnis.feldFehler) {
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
        // IDA-378: vorher schloss „Anlegen" den Dialog ohne Rueckmeldung, und
        // der Artikel stand unmarkiert am Listenende.
        void message.success(`„${name}“ angelegt.`);
        onAngelegt?.(ergebnis.wert.id);
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
        open={offen || entwurf.wiederhergestellt}
        title="Neuer Artikel"
        okText={dublette ? "Trotzdem anlegen" : "Anlegen"}
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
        <Form<ArtikelWerte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          initialValues={{ mindestbestand: 0 }}
          onFinish={speichern}
          onValuesChange={(geaendert: Partial<ArtikelWerte>, alle: ArtikelWerte) => {
            if ("name" in geaendert && dublette !== null) {
              setDublette(null);
              setFehler(null);
            }
            entwurf.onValuesChange(geaendert, alle);
          }}
          data-rolle="neuer-artikel"
        >
          <EntwurfZeile entwurf={entwurf} />
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
          {/* DRK-294. Optional — ohne Kategorie bleibt der Artikel in jedem
              Kategorienfilter sichtbar. */}
          <Form.Item name="kategorie" label="Kategorie">
            <KategorieEingabe kategorien={kategorien} aria-label="Kategorie" />
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
