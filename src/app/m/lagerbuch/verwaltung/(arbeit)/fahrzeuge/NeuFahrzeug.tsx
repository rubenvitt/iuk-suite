"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, Form, Input, Modal, Radio, Select } from "antd";
import { createFahrzeug } from "../../../_actions/fahrzeuge";
import {
  EINHEITENARTEN,
  EINHEITENART_LABEL,
  type Einheitenart,
} from "../../../_lib/konstanten";
import type { StammAuswahl } from "../../../_lib/stammAbgleich";
import { Ikone } from "../../../_ui/ikonen";

type FahrzeugWerte = {
  name: string;
  kennung?: string;
  einheitenart: Einheitenart;
  stammId?: string;
};

const FORM_FELDER = new Set<keyof FahrzeugWerte>([
  "name", "kennung", "einheitenart", "stammId",
]);

function istFormFeld(name: string): name is keyof FahrzeugWerte {
  return FORM_FELDER.has(name as keyof FahrzeugWerte);
}

/**
 * IDA-258: Mit `stammAuswahl` kommt ein FAHRZEUG aus der Fahrzeugverwaltung — Name und Kennzeichen
 * stehen dort, der Dialog fragt nur, welches. Taschen bleiben freie Felder. Ohne Auswahl (die
 * Fahrzeugverwaltung ist leer oder nicht erreichbar) bleibt der Dialog, wie er war.
 */
export function NeuFahrzeug({ stammAuswahl = [] }: { stammAuswahl?: StammAuswahl[] }) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const laeuftRef = useRef(false);
  const [form] = Form.useForm<FahrzeugWerte>();
  const router = useRouter();
  const art = Form.useWatch("einheitenart", form);
  const ausStamm = art === "fahrzeug" && stammAuswahl.length > 0;

  function oeffnen(): void {
    setFehler(null);
    setOffen(true);
  }

  function schliessen(): void {
    if (laeuftRef.current) return;
    setFehler(null);
    setOffen(false);
    form.resetFields();
  }

  function speichern(werte: FahrzeugWerte): void {
    if (laeuftRef.current) return;
    laeuftRef.current = true;
    setFehler(null);
    form.setFields(Array.from(FORM_FELDER, (name) => ({ name, errors: [] })));

    start(async () => {
      try {
        const ergebnis = await createFahrzeug(ausStamm
          ? { stammId: werte.stammId, einheitenart: "fahrzeug" }
          : { name: werte.name, kennung: werte.kennung, einheitenart: werte.einheitenart });
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof FahrzeugWerte, string] => (
                istFormFeld(eintrag[0])
              ))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }

        setFehler(null);
        setOffen(false);
        form.resetFields();
        router.refresh();
      } catch {
        setFehler("Einheit konnte nicht angelegt werden.");
      } finally {
        laeuftRef.current = false;
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
        Neue Einheit
      </Button>
      <Modal
        open={offen}
        title="Neue Einheit"
        okText="Anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        closable={!laeuft}
        keyboard={!laeuft}
        mask={{ closable: !laeuft }}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        <Form<FahrzeugWerte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          onFinish={speichern}
          data-rolle="neues-fahrzeug"
        >
          {/*
            ⚠️ OHNE VORBELEGUNG, UND DAS IST DIE ANFORDERUNG AUS DRK-309
            („neue Objekte müssen kategorisiert werden").

            „Fahrzeug" als Vorgabe wäre der bequemere Dialog und die
            schlechtere Angabe: der häufigere Fall gewinnt dann jedes Mal,
            wenn jemand das Feld übersieht — und eine Tasche, die als
            Fahrzeug in der Liste steht, ist nicht als Irrtum erkennbar. Der
            Zwischenstand aus der Migration heißt „noch nicht zugeordnet" und
            ist sichtbar; eine falsche Zuordnung ist es nicht.

            ⚠️ DAS FELD STEHT OBEN, nicht unten. Die Art entscheidet, was
            „Kennung" darunter überhaupt bedeutet (ein Kennzeichen oder eine
            aufgeklebte Nummer) — eine Pflichtangabe hinter den Feldern, die
            von ihr abhängen, wird als Nachtrag gelesen.
          */}
          <Form.Item
            name="einheitenart"
            label="Art"
            rules={[{ required: true, message: "Fahrzeug oder Tasche wählen" }]}
          >
            <Radio.Group
              optionType="button"
              buttonStyle="solid"
              options={EINHEITENARTEN.map((art) => ({
                value: art,
                label: EINHEITENART_LABEL[art],
              }))}
            />
          </Form.Item>
          {ausStamm ? (
            <Form.Item
              name="stammId"
              label="Fahrzeug aus der Fahrzeugverwaltung"
              extra="Name und Kennzeichen kommen von dort. Fehlt ein Fahrzeug, lege es zuerst in der Fahrzeugverwaltung an."
              rules={[{ required: true, message: "Fahrzeug wählen" }]}
            >
              <Select
                aria-label="Fahrzeug aus der Fahrzeugverwaltung"
                showSearch={{ optionFilterProp: "label" }}
                options={stammAuswahl.map((s) => ({
                  value: s.id,
                  label: s.kennzeichen ? `${s.name} · ${s.kennzeichen}` : s.name,
                }))}
              />
            </Form.Item>
          ) : (
            <>
              <Form.Item
                name="name"
                label="Name"
                rules={[{ required: true, whitespace: true, message: "Name angeben" }]}
              >
                <Input aria-label="Name" autoComplete="off" />
              </Form.Item>
              <Form.Item name="kennung" label="Kennung">
                <Input aria-label="Kennung" autoComplete="off" />
              </Form.Item>
            </>
          )}
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
