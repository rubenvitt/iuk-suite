"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Alert, Button, DatePicker, Form, Input, Modal, Radio, Select } from "antd";
import type { Dayjs } from "dayjs";
import { geraetSpeichern } from "../../../_actions/geraete";
import { standortMeta } from "../../../_lib/konstanten";
import type { LagerortOption as Lagerort } from "../../../_lib/lesepfade/bz";
import { Ikone } from "../../../_ui/ikonen";
import { EntwurfZeile } from "../../../_ui/EntwurfZeile";
import { useFormEntwurf } from "@/core/entwurf/useFormEntwurf";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";

type Werte = {
  typ: "medizin" | "objekt";
  name: string;
  barcode?: string;
  lagerortId: string;
  anmerkung?: string;
  mtkFaellig?: Dayjs | null;
  beschreibung?: string;
  ablaufdatum?: Dayjs | null;
};

const FORM_FELDER = new Set<keyof Werte>([
  "typ",
  "name",
  "barcode",
  "lagerortId",
  "anmerkung",
  "mtkFaellig",
  "beschreibung",
  "ablaufdatum",
]);

function istFormFeld(name: string): name is keyof Werte {
  return FORM_FELDER.has(name as keyof Werte);
}

export type LagerortOption = {
  value: string;
  label: string;
};

/** Das Select sucht explizit in der sichtbaren Standortbezeichnung. */
export function lagerortFilter(eingabe: string, option?: LagerortOption): boolean {
  return (option?.label ?? "")
    .toLocaleLowerCase("de-DE")
    .includes(eingabe.trim().toLocaleLowerCase("de-DE"));
}

function tag(datum: Dayjs | null | undefined): string | undefined {
  return datum ? datum.format("YYYY-MM-DD") : undefined;
}

export function NeuGeraet({
  lagerorte,
}: {
  lagerorte: Lagerort[];
}) {
  const [offen, setOffen] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [laeuft, setLaeuft] = useState(false);
  const submitLaeuft = useRef(false);
  const [form] = Form.useForm<Werte>();
  // IDA-358: die Eingaben ueberstehen ein Neuladen; liegt ein Entwurf, steht
  // der Dialog danach gleich wieder offen — sonst saehe ihn niemand.
  const entwurf = useFormEntwurf(form, "lagerbuch:neu-geraet");
  const router = useRouter();
  const typ = Form.useWatch("typ", form) ?? "medizin";

  function oeffnen(): void {
    setFehler(null);
    entwurf.verwerfen();
    setOffen(true);
  }

  function schliessen(): void {
    if (submitLaeuft.current) return;
    setFehler(null);
    setOffen(false);
    entwurf.verwerfen();
  }

  function speichern(werte: Werte): void {
    if (submitLaeuft.current) return;
    submitLaeuft.current = true;
    setLaeuft(true);
    setFehler(null);

    void (async () => {
      try {
        const gemeinsam = {
          typ: werte.typ,
          name: werte.name,
          barcode: werte.barcode?.trim() || undefined,
          lagerortId: werte.lagerortId,
          anmerkung: werte.anmerkung?.trim() || undefined,
        };
        const payload = werte.typ === "medizin"
          ? { ...gemeinsam, mtkFaellig: tag(werte.mtkFaellig) }
          : {
              ...gemeinsam,
              beschreibung: werte.beschreibung?.trim() || undefined,
              ablaufdatum: tag(werte.ablaufdatum),
            };
        const ergebnis = await geraetSpeichern(payload);
        if (!ergebnis.ok) {
          if (ergebnis.feldFehler) {
            form.setFields(Object.entries(ergebnis.feldFehler)
              .filter((eintrag): eintrag is [keyof Werte, string] => istFormFeld(eintrag[0]))
              .map(([name, text]) => ({ name, errors: [text] })));
          }
          setFehler(ergebnis.fehler);
          return;
        }
        setOffen(false);
        entwurf.verwerfen();
        router.refresh();
      } catch {
        setFehler("Gerät konnte nicht angelegt werden.");
      } finally {
        submitLaeuft.current = false;
        setLaeuft(false);
      }
    })();
  }

  return (
    <>
      <Button
        type="primary"
        icon={<Ikone name="plus" groesse={16} />}
        onClick={oeffnen}
      >
        Neues Gerät
      </Button>
      <Modal
        open={offen || entwurf.wiederhergestellt}
        title="Neues Gerät"
        okText="Gerät anlegen"
        cancelText="Abbrechen"
        confirmLoading={laeuft}
        okButtonProps={{ disabled: laeuft }}
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
          initialValues={{ typ: "medizin" }}
          onFinish={speichern}
          onValuesChange={entwurf.onValuesChange}
          data-rolle="neues-geraet"
        >
          <EntwurfZeile entwurf={entwurf} />
          <Form.Item
            name="typ"
            label="Klasse"
            rules={[{ required: true, message: "Klasse wählen" }]}
          >
            <Radio.Group options={[
              { value: "medizin", label: "Medizinisches Gerät" },
              { value: "objekt", label: "Objekt" },
            ]} />
          </Form.Item>
          <Form.Item
            name="name"
            label="Bezeichnung"
            rules={[{ required: true, whitespace: true, message: "Bezeichnung angeben" }]}
          >
            <Input placeholder="z. B. Corpuls C3" autoComplete="off" />
          </Form.Item>
          <Form.Item name="barcode" label="Barcode (optional)">
            <Input placeholder="Barcode / Seriennummer" autoComplete="off" />
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
              // DRK-309: Art (bzw. „Lager") und Kennung hinter dem Namen —
              // Namen sind in `lagerorte` nicht eindeutig.
              options={lagerorte.map((lagerort) => ({
                value: lagerort.id,
                label: `${lagerort.name} · ${standortMeta(lagerort)}`,
              }))}
              virtual={false}
            />
          </Form.Item>
          {typ === "medizin" ? (
            <Form.Item name="mtkFaellig" label="Nächste MTK (optional)">
              <DatePicker
                popupAlign={WAEHLER_IM_BILD}
                aria-label="Nächste MTK"
                format="YYYY-MM-DD"
                allowClear
                style={{ width: "100%" }}
              />
            </Form.Item>
          ) : (
            <>
              <Form.Item name="beschreibung" label="Beschreibung (optional)">
                <Input.TextArea
                  aria-label="Beschreibung"
                  placeholder="z. B. Spineboard mit Gurtspinne"
                  autoSize={{ minRows: 2, maxRows: 5 }}
                />
              </Form.Item>
              <Form.Item name="ablaufdatum" label="Ablaufdatum (optional)">
                <DatePicker
                  popupAlign={WAEHLER_IM_BILD}
                  aria-label="Ablaufdatum"
                  format="YYYY-MM-DD"
                  allowClear
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </>
          )}
          <Form.Item name="anmerkung" label="Anmerkung (optional)">
            <Input.TextArea aria-label="Anmerkung" autoSize={{ minRows: 2, maxRows: 5 }} />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
