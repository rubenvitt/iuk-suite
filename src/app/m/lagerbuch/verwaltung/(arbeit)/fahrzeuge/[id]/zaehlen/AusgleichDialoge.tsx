"use client";

/**
 * DIE DREI DIALOGE DES REITERS „Ausgleichen" (Spec 6.4) — Auffüllen,
 * Zurücklegen, Aussondern. Jeder nimmt EINE Absicht auf; gebucht wird erst
 * mit dem Abschluss (`_actions/verwaltungscheck.ts`).
 *
 * ⚠️ `Modal`, KEINE `Drawer` (Falle 13/24): klein, mittig, kein Fokusdiebstahl
 * beim Schließen. Jeder Dialog wird zum Öffnen gemountet und zum Schließen
 * entfernt — die Felder beginnen so immer bei der Vorbelegung, ohne
 * `resetFields` an jeder Ausgangstür.
 *
 * ⚠️ WAS KEIN SPERRGRUND ABDECKT, PRÜFT DER DIALOG: Menge leer, ≤ 0 oder nicht
 * ganzzahlig, und ein Schrank ohne Charge. Die Leiste sperrte das nicht, und
 * der Server wiese den ganzen Abschluss ab. Was vom Zusammenspiel der Absichten
 * abhängt („höchstens n aussondern"), rechnet weiter allein `sperrGruende`.
 * Gemeldet wird am Feld; „Übernehmen" bleibt bedienbar (docs/design/README.md,
 * Formulare Regel 1).
 */

import dayjs from "dayjs";
import { useEffect, useState, type ReactNode } from "react";
import { Alert, Form, Input, InputNumber, Modal, Select, Switch, type FormRule } from "antd";
import { getDetail, type ArtikelDetailResult } from "../../../../../_actions/detail";
import { BUCHUNG_MENGE_MAX } from "../../../../../_lib/grenzen";
import { ENTNAHMEBOX_ID } from "../../../../../_lib/konstanten";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import type { Ausgleich, AusgleichZeile, Herkunft } from "../../../../../_lib/verwaltungscheck";
import { useMonatsPruefung } from "../../../../../_ui/MonatsFeld";
import {
  HANDLAGER_ZUERST, HerkunftFelder, NEU, suchFilter, type HerkunftWerte,
} from "../HerkunftFelder";
import { verfallAusPicker } from "./BestandZellen";

const AUSSONDERN_GRUND_VORGABE = "Beim Zählen ausgesondert";

/**
 * Die Menge einer Absicht: Pflicht, ganzzahlig, ab 1 — wie `Menge` im Schema
 * der Action. Das Feld trägt bewusst kein `precision`: es rundete „2,5" still
 * auf, statt es zu melden.
 */
const MENGE_REGELN: FormRule[] = [
  { required: true, message: "Menge fehlt." },
  { type: "integer", min: 1, max: BUCHUNG_MENGE_MAX, message: "Menge: eine ganze Zahl ab 1." },
];

function MengeFeld({ einheit }: { einheit: string }) {
  return (
    <Form.Item name="menge" label={`Menge (${einheit})`} rules={MENGE_REGELN}>
      <InputNumber<number> aria-label="Menge" style={{ width: "100%" }} />
    </Form.Item>
  );
}

/** Der gemeinsame Rahmen: Titel mit Artikel, „Übernehmen"/„Abbrechen". */
function Dialog({ titel, zeile, onOk, onSchliessen, children }: {
  titel: string;
  zeile: AusgleichZeile;
  onOk: () => void;
  onSchliessen: () => void;
  children: ReactNode;
}) {
  return (
    <Modal
      open
      title={`${titel}: ${zeile.artikelName}`}
      okText="Übernehmen"
      cancelText="Abbrechen"
      onOk={onOk}
      onCancel={onSchliessen}
      destroyOnHidden
    >
      {children}
    </Modal>
  );
}

type DialogProps<A> = {
  zeile: AusgleichZeile;
  daten: VerwaltungscheckDaten;
  /** Die schon erfasste Absicht dieser Art — der Dialog ändert sie dann. */
  vorher: A | undefined;
  onUebernehmen: (absicht: A) => void;
  onSchliessen: () => void;
};

type AuffuellenAbsicht = NonNullable<Ausgleich["auffuellen"]>;
type AuffuellenWerte = HerkunftWerte & { menge?: number; mitgezaehlt?: boolean };

/**
 * Die Absicht zurück in die Felder — der Dialog öffnet auf dem erfassten Stand.
 * Ohne Absicht: die Fehlmenge; fehlt nichts und liegt mehr als im Lagerbuch,
 * ist die Frage „woher?" (Spec 6.12.5) — dann das Plus, schon mitgezählt.
 */
function auffuellenWerte(zeile: AusgleichZeile, vorher: AuffuellenAbsicht | undefined): AuffuellenWerte {
  if (!vorher) {
    const nurPlus = zeile.fehlmenge === 0 && zeile.plusOhneHerkunft;
    return {
      menge: nurPlus ? zeile.ist - zeile.buchstand : zeile.fehlmenge || undefined,
      herkunft: HANDLAGER_ZUERST,
      mitgezaehlt: nurPlus,
    };
  }
  const h = vorher.herkunft;
  const basis = { menge: vorher.menge, mitgezaehlt: vorher.mitgezaehlt ?? false };
  if (h.art === "handlager") return { ...basis, herkunft: HANDLAGER_ZUERST };
  if (h.art === "ort") return { ...basis, herkunft: h.vonLagerortId, chargeId: h.chargeId };
  if (h.charge.art === "vorhanden") return { ...basis, herkunft: NEU, chargeId: h.charge.chargeId };
  return {
    ...basis, herkunft: NEU, chargeId: NEU,
    chargenNr: h.charge.chargenNr, verfall: dayjs(`${h.charge.verfall}-01`),
  };
}

/** Die Felder als Herkunft — `null`, wenn sie keine ergeben (die Feldregeln fangen das vorher). */
function herkunftAus(w: AuffuellenWerte): Herkunft | null {
  if (w.herkunft === HANDLAGER_ZUERST) return { art: "handlager" };
  if (!w.herkunft || !w.chargeId) return null;
  if (w.herkunft !== NEU) return { art: "ort", vonLagerortId: w.herkunft, chargeId: w.chargeId };
  if (w.chargeId !== NEU) return { art: "neu", charge: { art: "vorhanden", chargeId: w.chargeId } };
  const verfall = verfallAusPicker(w.verfall);
  if (!verfall) return null;
  return { art: "neu", charge: { art: "neu", chargenNr: w.chargenNr?.trim() ?? "", verfall } };
}

/**
 * AUFFÜLLEN — Menge vorbelegt mit der Fehlmenge, Herkunft vorbelegt mit dem
 * Handlager (zuerst ablaufende, Spec 6.4). „Schon eingeräumt und mitgezählt"
 * (Spec 6.12.5): das Material steckt schon im Ist; der Abschluss bucht nur die
 * Umlagerung von der Herkunft.
 */
export function AuffuellenDialog({ zeile, daten, vorher, onUebernehmen, onSchliessen }: DialogProps<AuffuellenAbsicht>) {
  const [form] = Form.useForm<AuffuellenWerte>();
  const verfallPruefung = useMonatsPruefung(form, "verfall", "Bitte Verfallsmonat auswählen.");
  const [detail, setDetail] = useState<ArtikelDetailResult | null>(null);
  const [laedt, setLaedt] = useState(true);
  const [fehler, setFehler] = useState<string | null>(null);

  // Die Verteilung über alle Orte kommt wie beim Aufladen aus `getDetail`, nicht aus der Seite.
  useEffect(() => {
    let gilt = true;
    void (async () => {
      try {
        const ergebnis = await getDetail(zeile.artikelId);
        if (!gilt) return;
        if (ergebnis.ok) setDetail(ergebnis.wert);
        else setFehler(ergebnis.fehler);
      } catch {
        if (gilt) setFehler("Der Artikel konnte nicht geladen werden.");
      } finally {
        if (gilt) setLaedt(false);
      }
    })();
    return () => { gilt = false; };
  }, [zeile.artikelId]);

  function uebernehmen(w: AuffuellenWerte) {
    const herkunft = herkunftAus(w);
    if (!herkunft || w.menge === undefined) return;
    onUebernehmen({ menge: w.menge, herkunft, ...(w.mitgezaehlt ? { mitgezaehlt: true } : {}) });
  }

  return (
    <Dialog titel="Auffüllen" zeile={zeile} onOk={() => form.submit()} onSchliessen={onSchliessen}>
      <Form<AuffuellenWerte>
        form={form}
        layout="vertical"
        initialValues={auffuellenWerte(zeile, vorher)}
        onFinish={uebernehmen}
        data-rolle="auffuellen-form"
      >
        <MengeFeld einheit={zeile.einheit} />
        <HerkunftFelder
          detail={detail}
          laedt={laedt}
          fahrzeugId={daten.fahrzeug.id}
          verfallPruefung={verfallPruefung}
          mitHandlager
        />
        <Form.Item
          name="mitgezaehlt"
          label="Schon eingeräumt und mitgezählt"
          valuePropName="checked"
          extra="Dann steckt die Menge schon im gezählten Ist; gebucht wird nur, woher sie kam."
        >
          <Switch aria-label="Schon eingeräumt und mitgezählt" />
        </Form.Item>
      </Form>
      {fehler ? <Alert type="warning" showIcon={false} title={fehler} /> : null}
    </Dialog>
  );
}

type ZuruecklegenAbsicht = NonNullable<Ausgleich["zuruecklegen"]>;
type ZuruecklegenWerte = { menge?: number; zielLagerortId?: string; chargeId?: string };

/**
 * ZURÜCKLEGEN — Menge vorbelegt mit dem Überschuss; Ziel ein Handlager-Schrank
 * oder die Entnahmebox (wenn aktiv). In den Schrank ist die Charge Pflicht
 * (Spec 6.12.1, DRK-366: im Handlager trägt die Charge den Verfall), in die
 * Box nicht — dort wandern die zuerst ablaufenden.
 */
export function ZuruecklegenDialog({ zeile, daten, vorher, onUebernehmen, onSchliessen }: DialogProps<ZuruecklegenAbsicht>) {
  const [form] = Form.useForm<ZuruecklegenWerte>();
  const ziel = Form.useWatch("zielLagerortId", form);
  const inDieBox = ziel === ENTNAHMEBOX_ID;
  const chargen = daten.chargenAnEinheit[zeile.artikelId] ?? [];

  const zielOptionen = [
    ...daten.ruecklaufZiele.map((z) => ({ value: z.id, label: z.name })),
    ...(daten.entnahmeboxAktiv ? [{ value: ENTNAHMEBOX_ID, label: "Entnahmebox" }] : []),
  ];

  // Genau eine Charge an der Einheit: sie steht schon da (wie beim Aufladen).
  const initial: ZuruecklegenWerte = vorher
    ? { menge: vorher.menge, zielLagerortId: vorher.zielLagerortId, chargeId: vorher.chargeId }
    : { menge: zeile.ueberschuss || undefined, chargeId: chargen.length === 1 ? chargen[0]!.chargeId : undefined };

  function uebernehmen(w: ZuruecklegenWerte) {
    if (w.menge === undefined || !w.zielLagerortId) return;
    // Doppelt hält besser: ohne Charge geht nur die Box durch, auch wenn die Feldregel umgangen wäre.
    if (w.zielLagerortId !== ENTNAHMEBOX_ID && !w.chargeId) return;
    onUebernehmen({
      menge: w.menge, zielLagerortId: w.zielLagerortId, ...(w.chargeId ? { chargeId: w.chargeId } : {}),
    });
  }

  return (
    <Dialog titel="Zurücklegen" zeile={zeile} onOk={() => form.submit()} onSchliessen={onSchliessen}>
      <Form<ZuruecklegenWerte>
        form={form}
        layout="vertical"
        initialValues={initial}
        onFinish={uebernehmen}
        data-rolle="zuruecklegen-form"
      >
        <MengeFeld einheit={zeile.einheit} />
        <Form.Item name="zielLagerortId" label="Wohin" rules={[{ required: true, message: "Ziel wählen" }]}>
          <Select
            aria-label="Wohin"
            placeholder={zielOptionen.length === 0 ? "Kein Schrank und keine Entnahmebox aktiv" : "Ziel wählen"}
            options={zielOptionen}
          />
        </Form.Item>
        <Form.Item
          name="chargeId"
          label="Charge"
          required={!inDieBox}
          dependencies={["zielLagerortId"]}
          rules={[({ getFieldValue }) => ({
            validator: async (_regel, wert: string | undefined) => {
              if (!wert && getFieldValue("zielLagerortId") !== ENTNAHMEBOX_ID) throw new Error("Charge wählen");
            },
          })]}
          extra={inDieBox
            ? "Ohne Wahl gehen die zuerst ablaufenden in die Box."
            : "Im Schrank trägt die Charge den Verfall."}
        >
          <Select
            aria-label="Charge"
            placeholder="Charge wählen"
            allowClear
            showSearch
            filterOption={suchFilter}
            options={chargen.map((c) => ({
              value: c.chargeId, label: `${c.label} · ${c.menge} ${zeile.einheit}`, keywords: c.label,
            }))}
          />
        </Form.Item>
      </Form>
    </Dialog>
  );
}

type AussondernAbsicht = NonNullable<Ausgleich["aussondern"]>;
type AussondernWerte = { menge?: number; grund?: string };

/** AUSSONDERN — Menge ohne Vorgabe (eine bewusste Zahl), Grund mit Vorgabe (Spec 6.4). */
export function AussondernDialog({ zeile, vorher, onUebernehmen, onSchliessen }: DialogProps<AussondernAbsicht>) {
  const [form] = Form.useForm<AussondernWerte>();

  function uebernehmen(w: AussondernWerte) {
    if (w.menge === undefined) return;
    const grund = w.grund?.trim();
    onUebernehmen({ menge: w.menge, ...(grund ? { grund } : {}) });
  }

  return (
    <Dialog titel="Aussondern" zeile={zeile} onOk={() => form.submit()} onSchliessen={onSchliessen}>
      <Form<AussondernWerte>
        form={form}
        layout="vertical"
        initialValues={{ menge: vorher?.menge, grund: vorher ? vorher.grund : AUSSONDERN_GRUND_VORGABE }}
        onFinish={uebernehmen}
        data-rolle="aussondern-form"
      >
        <MengeFeld einheit={zeile.einheit} />
        <Form.Item name="grund" label="Grund">
          <Input aria-label="Grund" maxLength={500} autoComplete="off" />
        </Form.Item>
      </Form>
    </Dialog>
  );
}
