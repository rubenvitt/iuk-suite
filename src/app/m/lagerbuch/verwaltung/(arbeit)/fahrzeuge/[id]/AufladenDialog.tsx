"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import type { Dayjs } from "dayjs";
import { Alert, Button, DatePicker, Form, Input, InputNumber, Modal, Select } from "antd";
import { bucheAufladen } from "../../../../_actions/aufladen";
import { getDetail, type ArtikelDetailResult } from "../../../../_actions/detail";
import { fmtVerfall } from "../../../../_lib/format";
import { dieseEinheit, ortZeile, type Einheitenart } from "../../../../_lib/konstanten";
import { Ikone } from "../../../../_ui/ikonen";
import { monatAusPicker } from "../../../../_ui/monat";

/**
 * Der Wert der Herkunft „neu angeliefert" und der Charge „neue Charge".
 *
 * ⚠️ KEIN WERT, DEN EINE `lagerorte.id` ODER `chargen.id` ANNEHMEN KANN: beide
 * sind nanoid mit 21 Zeichen oder ein festes Wort wie `handlager`. Sonst
 * uebernaehme ein echter Ort still die Wahl „neu".
 */
const NEU = "__neu__";

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

type Quelle = { id: string; label: string; menge: number };

/** Sucht in Beschriftung UND Stichwort (Fach bzw. Chargennummer). */
function suchFilter(eingabe: string, option?: { label?: unknown; keywords?: string }): boolean {
  const nadel = eingabe.trim().toLocaleLowerCase("de");
  const label = typeof option?.label === "string" ? option.label : "";
  return `${label} ${option?.keywords ?? ""}`.toLocaleLowerCase("de").includes(nadel);
}

/** Die Orte, an denen der Artikel liegt — ohne die Einheit selbst. */
function quellenAus(detail: ArtikelDetailResult, fahrzeugId: string): Quelle[] {
  const jeOrt = new Map<string, Quelle>();
  for (const charge of detail.chargen) {
    for (const ort of charge.orte) {
      if (ort.id === fahrzeugId || ort.menge <= 0) continue;
      const bisher = jeOrt.get(ort.id);
      if (bisher) bisher.menge += ort.menge;
      else jeOrt.set(ort.id, { id: ort.id, label: ortZeile(ort), menge: ort.menge });
    }
  }
  // Die Reihenfolge kommt aus `verteilungJeCharge`: Handlager zuerst, dann die
  // Einheiten — die Map haelt die Einfuegereihenfolge.
  return [...jeOrt.values()];
}

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

  const quellen = detail ? quellenAus(detail, fahrzeugId) : [];
  const vonOrt = herkunft && herkunft !== NEU ? herkunft : null;
  const ortChargen = vonOrt && detail
    ? detail.chargen.flatMap((charge) => {
      const menge = charge.orte.find((ort) => ort.id === vonOrt)?.menge ?? 0;
      return menge > 0 ? [{ charge, menge }] : [];
    })
    : [];
  const rest = vonOrt ? ortChargen.find((c) => c.charge.id === chargeId)?.menge : undefined;
  const einheit = detail?.artikel.einheit ?? "";

  // Bei jedem Oeffnen frisch — die Form-Instanz ueberlebt `destroyOnHidden`.
  useEffect(() => {
    if (!offen) return;
    form.setFieldsValue({
      artikelId: undefined, herkunft: undefined, chargeId: undefined,
      chargenNr: undefined, verfall: null, menge: 1,
    });
  }, [offen, form]);

  function oeffnen() {
    setFehler(null);
    setBeleg(null);
    setDetail(null);
    angefragt.current = null;
    setOffen(true);
  }

  function schliessen() {
    if (laeuft) return;
    form.resetFields();
    setOffen(false);
  }

  async function artikelGewaehlt(id: string | undefined) {
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

  function herkunftGewaehlt(wert: string | undefined) {
    /*
     * Gibt es an diesem Ort genau EINE Charge, steht sie schon da — eine
     * Auswahl aus einem Eintrag ist ein Klick ohne Entscheidung. Beim
     * Wareneingang nicht: dort ist „neue Charge" immer die zweite Wahl.
     */
    const einzige = wert && wert !== NEU && detail
      ? detail.chargen.filter((c) => c.orte.some((o) => o.id === wert && o.menge > 0))
      : [];
    form.setFieldsValue({
      chargeId: einzige.length === 1 ? einzige[0]!.id : undefined,
      chargenNr: undefined,
      verfall: null,
    });
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

  const herkunftOptionen = detail
    ? [
      { value: NEU, label: "Neu angeliefert (Wareneingang)" },
      ...quellen.map((q) => ({ value: q.id, label: `${q.label} · ${q.menge} ${einheit}`.trimEnd() })),
    ]
    : [];

  const chargeOptionen = !detail || !herkunft
    ? []
    : herkunft === NEU
      ? [
        { value: NEU, label: "+ Neue Charge", keywords: "neue Charge" },
        ...detail.chargen.map((charge) => ({
          value: charge.id,
          label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)}`,
          keywords: charge.chargenNr,
        })),
      ]
      : ortChargen.map(({ charge, menge }) => ({
        value: charge.id,
        label: `${charge.chargenNr} · ${fmtVerfall(charge.verfall)} · ${menge} ${einheit}`.trimEnd(),
        keywords: charge.chargenNr,
      }));

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
          <Form.Item
            name="herkunft"
            label="Woher"
            rules={[{ required: true, message: "Herkunft wählen" }]}
            extra="Neu angeliefert: kommt direkt vom Lieferanten, ohne vorher im Lager zu liegen."
          >
            <Select
              aria-label="Woher"
              placeholder={laedt ? "Wird geladen …" : "Herkunft wählen"}
              loading={laedt}
              disabled={!detail}
              options={herkunftOptionen}
              onChange={herkunftGewaehlt}
            />
          </Form.Item>
          <Form.Item
            name="chargeId"
            label="Charge"
            rules={[{ required: true, message: "Charge wählen" }]}
            extra={vonOrt ? "Nur Chargen, die an diesem Ort liegen — genau diese wandert mit." : undefined}
          >
            <Select
              aria-label="Charge"
              placeholder="Charge wählen"
              showSearch
              filterOption={suchFilter}
              disabled={!herkunft}
              options={chargeOptionen}
            />
          </Form.Item>
          {herkunft === NEU && chargeId === NEU ? (
            <>
              <Form.Item
                name="chargenNr"
                label="Chargennummer"
                rules={[{ required: true, whitespace: true, message: "Chargennummer angeben" }]}
              >
                <Input aria-label="Chargennummer" autoComplete="off" />
              </Form.Item>
              <Form.Item
                name="verfall"
                label="Verfallsmonat"
                rules={[{ required: true, message: "Bitte Verfallsmonat auswählen." }]}
              >
                <DatePicker
                  picker="month"
                  format="YYYY-MM"
                  aria-label="Verfallsmonat"
                  style={{ width: "100%" }}
                />
              </Form.Item>
            </>
          ) : null}
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
