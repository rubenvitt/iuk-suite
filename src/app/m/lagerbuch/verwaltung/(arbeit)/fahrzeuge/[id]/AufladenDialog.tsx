"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Dayjs } from "dayjs";
import { Alert, Button, Form, InputNumber, Modal, Select } from "antd";
import { bucheAufladen } from "../../../../_actions/aufladen";
import { getDetail, type ArtikelDetailResult } from "../../../../_actions/detail";
import { dieseEinheit, type Einheitenart } from "../../../../_lib/konstanten";
import { Ikone } from "../../../../_ui/ikonen";
import { monatAusPicker } from "../../../../_ui/monat";
import { useMonatsPruefung } from "../../../../_ui/MonatsFeld";
import { HerkunftFelder, NEU, restAmOrt, suchFilter } from "./HerkunftFelder";

const ALLGEMEIN = "Aufladen fehlgeschlagen.";

export type AufladenArtikel = { id: string; name: string; fach: string };

type Werte = {
  artikelId?: string;
  herkunft?: string;
  chargeId?: string;
  chargenNr?: string;
  verfall?: Dayjs | null;
  menge: number;
};

/**
 * MATERIAL AUF DIESE EINHEIT PACKEN — DRK-485.
 *
 * Zwei Herkuenfte in einer Auswahl: „Neu angeliefert" (Wareneingang direkt an
 * der Einheit) oder jeder Ort, an dem der Artikel gerade liegt. Beim Umpacken
 * ist die Charge Pflicht und nur die angeboten, die DORT liegen; beim
 * Wareneingang eine vorhandene oder eine neue.
 *
 * ⚠️ DER DIALOG BLEIBT NACH EINER BUCHUNG OFFEN und leert nur Artikel, Charge
 * und Menge: wer ein Fahrzeug bestueckt, packt mehrere Artikel nacheinander.
 * Der Beleg darueber nennt, was zuletzt gebucht wurde.
 *
 * ⚠️ DIE HERKUNFTSLISTE KOMMT AUS `getDetail`, nicht aus der Seite: die
 * Verteilung ALLER Artikel ueber alle Orte fuer jedes Fahrzeugblatt
 * vorzurechnen, damit einer davon gewaehlt wird, waere Ballast im Payload.
 *
 * Die Felder „Woher"/„Charge" stehen in `HerkunftFelder` — dieselben im
 * Auffüllen des Verwaltungschecks.
 */
export function AufladenDialog({
  fahrzeugId,
  einheitenart,
  artikel,
}: {
  fahrzeugId: string;
  einheitenart: Einheitenart | null;
  /** Die AKTIVEN Artikel — auf einen deaktivierten geht kein Material mehr zu. */
  artikel: AufladenArtikel[];
}) {
  const [form] = Form.useForm<Werte>();
  const verfallPruefung = useMonatsPruefung(form, "verfall", "Bitte Verfallsmonat auswählen.");
  const [offen, setOffen] = useState(false);
  const [detail, setDetail] = useState<ArtikelDetailResult | null>(null);
  const [laedt, setLaedt] = useState(false);
  const [fehler, setFehler] = useState<string | null>(null);
  const [beleg, setBeleg] = useState<string | null>(null);
  const [laeuft, start] = useTransition();
  const schreibtGerade = useRef(false);
  /** Die zuletzt angefragte Artikel-ID — eine ueberholte Antwort wird verworfen. */
  const angefragt = useRef<string | null>(null);

  const herkunft = Form.useWatch("herkunft", form);
  const chargeId = Form.useWatch("chargeId", form);

  const rest = restAmOrt(detail, herkunft, chargeId);
  const einheit = detail?.artikel.einheit ?? "";

  // Bei jedem Oeffnen frisch — die Form-Instanz ueberlebt `destroyOnHidden`.
  useEffect(() => {
    if (!offen) return;
    verfallPruefung.vergessen();
    form.setFieldsValue({
      artikelId: undefined, herkunft: undefined, chargeId: undefined,
      chargenNr: undefined, verfall: null, menge: 1,
    });
  }, [offen, form, verfallPruefung]);

  function oeffnen() {
    setFehler(null);
    setBeleg(null);
    setDetail(null);
    angefragt.current = null;
    setOffen(true);
  }

  function schliessen() {
    if (laeuft) return;
    verfallPruefung.vergessen();
    form.resetFields();
    setOffen(false);
  }

  async function artikelGewaehlt(id: string | undefined) {
    verfallPruefung.vergessen();
    form.setFieldsValue({ herkunft: undefined, chargeId: undefined, chargenNr: undefined, verfall: null });
    setDetail(null);
    setFehler(null);
    angefragt.current = id ?? null;
    if (!id) return;
    setLaedt(true);
    try {
      const ergebnis = await getDetail(id);
      if (angefragt.current !== id) return;
      if (ergebnis.ok) setDetail(ergebnis.wert);
      else setFehler(ergebnis.fehler);
    } catch {
      if (angefragt.current === id) setFehler("Der Artikel konnte nicht geladen werden.");
    } finally {
      if (angefragt.current === id) setLaedt(false);
    }
  }

  function speichern(werte: Werte) {
    if (schreibtGerade.current || !detail) return;
    schreibtGerade.current = true;
    setFehler(null);
    setBeleg(null);
    const name = detail.artikel.name;
    start(async () => {
      try {
        const neu = werte.herkunft === NEU;
        const ergebnis = await bucheAufladen({
          fahrzeugId,
          artikelId: werte.artikelId ?? "",
          menge: werte.menge,
          herkunft: neu
            ? {
              art: "neu",
              charge: werte.chargeId === NEU
                ? {
                  art: "neu",
                  chargenNr: werte.chargenNr?.trim() ?? "",
                  verfall: monatAusPicker(werte.verfall) ?? "",
                }
                : { art: "vorhanden", chargeId: werte.chargeId ?? "" },
            }
            : { art: "ort", vonLagerortId: werte.herkunft ?? "", chargeId: werte.chargeId ?? "" },
        });
        if (!ergebnis.ok) {
          // Der Satz aus der Action: nur er nennt die tatsaechlich vorhandene Menge.
          setFehler(ergebnis.fehler);
          return;
        }
        setBeleg(`Aufgeladen: ${ergebnis.wert.gebucht} × ${name} → ${ergebnis.wert.ziel}`);
        verfallPruefung.vergessen();
        form.setFieldsValue({
          artikelId: undefined, herkunft: undefined, chargeId: undefined,
          chargenNr: undefined, verfall: null, menge: 1,
        });
        setDetail(null);
        angefragt.current = null;
      } catch {
        setFehler(ALLGEMEIN);
      } finally {
        schreibtGerade.current = false;
      }
    });
  }

  return (
    <>
      {/* KEIN size — Arbeitsdichte 44px (Falle 4). */}
      <Button icon={<Ikone name="plus" groesse={16} />} onClick={oeffnen}>
        Material aufladen
      </Button>
      <Modal
        open={offen}
        title={`Material auf ${dieseEinheit(einheitenart)}`}
        okText="Aufladen"
        cancelText="Schließen"
        confirmLoading={laeuft}
        okButtonProps={{ disabled: !detail || laedt }}
        closable={!laeuft}
        keyboard={!laeuft}
        mask={{ closable: !laeuft }}
        onCancel={schliessen}
        onOk={() => form.submit()}
        destroyOnHidden
      >
        {beleg ? (
          <Alert
            type="success"
            showIcon={false}
            title={beleg}
            role="status"
            data-rolle="aufladen-beleg"
            style={{ marginBlockEnd: 12 }}
          />
        ) : null}
        <Form<Werte>
          form={form}
          layout="vertical"
          disabled={laeuft}
          initialValues={{ menge: 1 }}
          onFinish={speichern}
          data-rolle="aufladen"
        >
          <Form.Item
            name="artikelId"
            label="Artikel"
            rules={[{ required: true, message: "Artikel wählen" }]}
          >
            <Select
              aria-label="Artikel"
              placeholder="Artikel suchen"
              showSearch
              allowClear
              filterOption={suchFilter}
              options={artikel.map((a) => ({ value: a.id, label: a.name, keywords: a.fach }))}
              onChange={(id?: string) => { void artikelGewaehlt(id); }}
            />
          </Form.Item>
          <HerkunftFelder
            detail={detail}
            laedt={laedt}
            fahrzeugId={fahrzeugId}
            verfallPruefung={verfallPruefung}
          />
          <Form.Item
            name="menge"
            label={rest === undefined ? "Menge" : `Menge (von dieser Charge liegen dort ${rest} ${einheit})`.trimEnd()}
            rules={[{ required: true, message: "Menge angeben" }]}
          >
            <InputNumber aria-label="Menge" min={1} max={rest} precision={0} style={{ width: "100%" }} />
          </Form.Item>
        </Form>
        {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
      </Modal>
    </>
  );
}
