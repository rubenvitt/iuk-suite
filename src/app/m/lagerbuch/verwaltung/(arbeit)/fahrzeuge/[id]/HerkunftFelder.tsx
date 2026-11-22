"use client";

import type { Dayjs } from "dayjs";
import { Form, Input, Select } from "antd";
import type { ArtikelDetailResult } from "../../../../_actions/detail";
import { fmtVerfall } from "../../../../_lib/format";
import { ortZeile } from "../../../../_lib/konstanten";
import { MonatsFeld, type useMonatsPruefung } from "../../../../_ui/MonatsFeld";

/**
 * Der Wert der Herkunft „neu angeliefert" und der Charge „neue Charge".
 *
 * ⚠️ KEIN WERT, DEN EINE `lagerorte.id` ODER `chargen.id` ANNEHMEN KANN: beide
 * sind nanoid mit 21 Zeichen oder ein festes Wort wie `handlager`. Sonst
 * uebernaehme ein echter Ort still die Wahl „neu".
 */
export const NEU = "__neu__";

/**
 * Der Wert der Herkunft „aus dem Handlager, zuerst ablaufende" (Verwaltungscheck,
 * Spec 6.4). Aus demselben Grund wie `NEU` NICHT `HANDLAGER_ID`: die Wurzel des
 * Handlagers ist auch ein Ort, von dem sich gezielt eine Charge nehmen lässt.
 */
export const HANDLAGER_ZUERST = "__handlager__";

/** Die Felder, die `HerkunftFelder` im umgebenden Formular belegt. */
export type HerkunftWerte = {
  herkunft?: string;
  chargeId?: string;
  chargenNr?: string;
  verfall?: Dayjs | null;
};

type Quelle = { id: string; label: string; menge: number };

/** Sucht in Beschriftung UND Stichwort (Fach bzw. Chargennummer). */
export function suchFilter(eingabe: string, option?: { label?: unknown; keywords?: string }): boolean {
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

/** Ein bestimmter Ort als Herkunft — weder „neu" noch „Handlager, zuerst ablaufende". */
function vonOrtAus(herkunft: string | undefined): string | null {
  return herkunft && herkunft !== NEU && herkunft !== HANDLAGER_ZUERST ? herkunft : null;
}

/** Die Chargen, die am gewählten Ort liegen, mit ihrer Menge dort. */
function ortChargenAus(detail: ArtikelDetailResult | null, vonOrt: string | null) {
  if (!vonOrt || !detail) return [];
  return detail.chargen.flatMap((charge) => {
    const menge = charge.orte.find((ort) => ort.id === vonOrt)?.menge ?? 0;
    return menge > 0 ? [{ charge, menge }] : [];
  });
}

/** Was von der gewählten Charge am gewählten Ort liegt — die Obergrenze der Menge, sonst `undefined`. */
export function restAmOrt(
  detail: ArtikelDetailResult | null,
  herkunft: string | undefined,
  chargeId: string | undefined,
): number | undefined {
  return ortChargenAus(detail, vonOrtAus(herkunft)).find((c) => c.charge.id === chargeId)?.menge;
}

/**
 * DIE FELDER „WOHER", „CHARGE" (UND BEI EINER NEUEN CHARGE NUMMER UND VERFALL)
 * — aus `AufladenDialog` gezogen, damit das Auffüllen im Verwaltungscheck
 * (`zaehlen/AusgleichDialoge.tsx`) dieselben Regeln hat (Spec 6.4).
 *
 * Steht IN einem antd-`Form` und belegt dort `herkunft`, `chargeId`,
 * `chargenNr`, `verfall`; das Formular holt es sich über `useFormInstance`.
 * Die Nutzlast baut der Aufrufer: der eine bucht sofort, der andere merkt eine
 * Absicht vor.
 *
 * Beim Umpacken ist die Charge Pflicht und nur die angeboten, die DORT liegen;
 * beim Wareneingang eine vorhandene oder eine neue. `mitHandlager` stellt
 * „Aus dem Handlager (zuerst ablaufende)" an den Anfang — dann sucht der
 * Server die Chargen selbst, und es gibt kein Chargenfeld.
 */
export function HerkunftFelder({
  detail,
  laedt,
  fahrzeugId,
  verfallPruefung,
  mitHandlager = false,
}: {
  /** Der Artikel mit seinen Chargen und Orten (`getDetail`); `null`, solange keiner gewählt/geladen ist. */
  detail: ArtikelDetailResult | null;
  laedt: boolean;
  fahrzeugId: string;
  verfallPruefung: ReturnType<typeof useMonatsPruefung>;
  mitHandlager?: boolean;
}) {
  const form = Form.useFormInstance<HerkunftWerte>();
  const herkunft = Form.useWatch("herkunft", form);
  const chargeId = Form.useWatch("chargeId", form);

  const vonOrt = vonOrtAus(herkunft);
  const ortChargen = ortChargenAus(detail, vonOrt);
  const einheit = detail?.artikel.einheit ?? "";

  function herkunftGewaehlt(wert: string | undefined) {
    /*
     * Gibt es an diesem Ort genau EINE Charge, steht sie schon da — eine
     * Auswahl aus einem Eintrag ist ein Klick ohne Entscheidung. Beim
     * Wareneingang nicht: dort ist „neue Charge" immer die zweite Wahl.
     */
    const einzige = ortChargenAus(detail, vonOrtAus(wert));
    verfallPruefung.vergessen();
    form.setFieldsValue({
      chargeId: einzige.length === 1 ? einzige[0]!.charge.id : undefined,
      chargenNr: undefined,
      verfall: null,
    });
  }

  // Das Handlager braucht keine Verteilung: als Vorgabe steht es schon da, während `getDetail` lädt.
  const herkunftOptionen = [
    ...(mitHandlager ? [{ value: HANDLAGER_ZUERST, label: "Aus dem Handlager (zuerst ablaufende)" }] : []),
    ...(detail
      ? [
        { value: NEU, label: "Neu angeliefert (Wareneingang)" },
        ...quellenAus(detail, fahrzeugId).map((q) => ({
          value: q.id, label: `${q.label} · ${q.menge} ${einheit}`.trimEnd(),
        })),
      ]
      : []),
  ];

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
      <Form.Item
        name="herkunft"
        label="Woher"
        rules={[{ required: true, message: "Herkunft wählen" }]}
        extra={herkunft === HANDLAGER_ZUERST ? "Die zuerst ablaufenden Chargen aus dem Handlager." : undefined}
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
      {herkunft === HANDLAGER_ZUERST ? null : (
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
      )}
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
            required
            rules={[verfallPruefung.regel]}
          >
            <MonatsFeld
              aria-label="Verfallsmonat"
              onUngueltig={verfallPruefung.onUngueltig}
            />
          </Form.Item>
        </>
      ) : null}
    </>
  );
}
