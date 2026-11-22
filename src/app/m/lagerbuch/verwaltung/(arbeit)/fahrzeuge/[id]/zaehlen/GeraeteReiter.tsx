"use client";

/**
 * DER REITER „Geräte" (Spec 6.6) — je Gerät an der Einheit Zustand oder
 * „fehlt", Selbsttest (nur mit dieser Frage), Bemerkung; dazu die sofort
 * wirkende Einrichtung: verknüpfen (Scan oder Auswahl), anlegen, an einen
 * anderen Ort setzen.
 *
 * ⚠️ ZWEI ARTEN VON EINGRIFF. Zustand/„fehlt"/Selbsttest/Bemerkung sind
 * Ergebnis und landen im Zählstand — gemeldet werden nur beantwortete Geräte
 * (`geraetBeantwortet`, wie im Check). Verknüpfen, Anlegen und Umsetzen sind
 * Stammdaten und wirken sofort (`useSofort` → `router.refresh()`).
 *
 * ⚠️ `geraetUmsetzen`, NICHT `geraetSpeichern`: Speichern schriebe den ganzen
 * Datensatz aus einem Formular zurück, das hier niemand sieht.
 */

import { useState } from "react";
import { Alert, Button, Form, Input, Modal, Select } from "antd";
import { Filterchips } from "@/core/filterchips/Filterchips";
import { geraetUmsetzen, geraetZuBarcode } from "../../../../../_actions/geraete";
import { standortMeta, ZUSTAENDE, type Zustand } from "../../../../../_lib/konstanten";
import type { VerwaltungscheckDaten } from "../../../../../_lib/lesepfade/verwaltungscheck";
import type { GeraetEingabe, ZaehlZustand } from "../../../../../_lib/verwaltungscheck";
import { BarcodeScanner } from "../../../../../_ui/BarcodeScanner";
import { Ikone } from "../../../../../_ui/ikonen";
import { NeuGeraet } from "../../../geraete/NeuGeraet";
import type { ReiterProps } from "./reiter";
import { useSofort } from "./useSofort";
import k from "./zaehlen.module.css";

type Antwort = Zustand | "fehlt";

const ANTWORTEN = [
  ...ZUSTAENDE.map((z) => ({ wert: z as Antwort, label: z })),
  { wert: "fehlt" as Antwort, label: "fehlt" },
];

const SELBSTTEST = [
  { wert: "ja" as const, label: "bestanden" },
  { wert: "nein" as const, label: "nicht bestanden" },
];

function mitGeraet(z: ZaehlZustand, geraetId: string, eingabe: GeraetEingabe): ZaehlZustand {
  return { ...z, geraete: { ...z.geraete, [geraetId]: eingabe } };
}

/** Eine Antwort setzen: „fehlt" nimmt Zustand und Selbsttest weg, ein Zustand heißt „vorhanden". */
function mitAntwort(e: GeraetEingabe | undefined, antwort: Antwort): GeraetEingabe {
  const bemerkung = e?.bemerkung !== undefined ? { bemerkung: e.bemerkung } : {};
  if (antwort === "fehlt") return { vorhanden: false, ...bemerkung };
  return { ...e, vorhanden: true, zustand: antwort };
}

export function GeraeteReiter({ daten, zustand, aendere, gesperrt }: ReiterProps) {
  const [umsetzen, setUmsetzen] = useState<{ id: string; name: string } | null>(null);
  return (
    <div className={k.liste}>
      <div className={k.kopfzeile}>
        <GeraetVerknuepfen daten={daten} gesperrt={gesperrt} />
        <NeuGeraet lagerorte={daten.lagerorte} vorgabeLagerortId={daten.fahrzeug.id} ausloeser="neutral" />
      </div>
      {daten.geraete.length === 0 ? (
        <p className={k.hinweis} data-rolle="geraete-leer">Noch kein Gerät an dieser Einheit.</p>
      ) : daten.geraete.map((g) => {
        const e = zustand.geraete[g.id];
        const setze = (f: (vorher: GeraetEingabe | undefined) => GeraetEingabe) =>
          aendere((z) => mitGeraet(z, g.id, f(z.geraete[g.id])));
        return (
          // Filterchips kennen kein `disabled`: das gesperrte `fieldset` sperrt ihre Knöpfe mit.
          <fieldset key={g.id} className={k.karte} disabled={gesperrt} data-rolle="geraet" data-geraet={g.id}>
            <div className={k.name}>{g.name}</div>
            <Filterchips<Antwort>
              aria-label={`Zustand ${g.name}`}
              wert={e?.vorhanden === false ? "fehlt" : e?.zustand ?? null}
              onChange={(antwort) => setze((vorher) => mitAntwort(vorher, antwort))}
              optionen={ANTWORTEN}
            />
            {/* IDA-411: nur bei Geräten mit Selbsttest-Frage, und nur, wenn das Gerät da ist. */}
            {g.selbsttest && e?.vorhanden !== false ? (
              <div className={k.selbsttest} data-rolle="selbsttest">
                <span className={k.hinweis}>Selbsttest</span>
                <Filterchips<"ja" | "nein">
                  aria-label={`Selbsttest ${g.name}`}
                  wert={e?.selbsttest === undefined ? null : e.selbsttest ? "ja" : "nein"}
                  onChange={(w) => setze((vorher) => ({ ...vorher, vorhanden: true, selbsttest: w === "ja" }))}
                  optionen={SELBSTTEST}
                />
              </div>
            ) : null}
            <div className={k.knoepfe}>
              <Input
                aria-label={`Bemerkung ${g.name}`}
                placeholder="Bemerkung"
                maxLength={500}
                disabled={gesperrt}
                value={e?.bemerkung ?? ""}
                style={{ flex: "1 1 220px", width: "auto" }}
                onChange={(ev) => {
                  const bemerkung = ev.target.value;
                  // Eine Bemerkung allein beantwortet das Gerät nicht (`geraetBeantwortet`).
                  setze((vorher) => ({ vorhanden: true, ...vorher, bemerkung }));
                }}
              />
              <Button data-rolle="umsetzen" disabled={gesperrt} onClick={() => setUmsetzen({ id: g.id, name: g.name })}>
                An anderen Ort
              </Button>
            </div>
          </fieldset>
        );
      })}
      {umsetzen ? (
        <GeraetUmsetzen
          daten={daten}
          geraet={umsetzen}
          onSchliessen={() => setUmsetzen(null)}
        />
      ) : null}
    </div>
  );
}

/**
 * „Gerät verknüpfen" — holt ein Gerät von woanders an diese Einheit: per Scan
 * (`BarcodeScanner onTreffer`, die Seite bleibt stehen) oder aus der Liste der
 * aktiven Geräte an anderen Orten.
 */
function GeraetVerknuepfen({ daten, gesperrt }: { daten: VerwaltungscheckDaten; gesperrt: boolean }) {
  const [form] = Form.useForm<{ geraetId?: string }>();
  const [offen, setOffen] = useState(false);
  /** Der Scanner hält nach einem Treffer still, bis er neu gemountet wird — nach einer Absage soll er wieder lesen. */
  const [scanRunde, setScanRunde] = useState(0);
  const sofort = useSofort("Gerät konnte nicht verknüpft werden.");

  function schliessen() {
    if (sofort.laeuft) return;
    form.resetFields();
    sofort.setFehler(null);
    setOffen(false);
  }

  async function verknuepfe(geraetId: string) {
    const ok = await sofort.ausfuehren(
      () => geraetUmsetzen({ geraetId, lagerortId: daten.fahrzeug.id }),
      () => { form.resetFields(); setOffen(false); },
    );
    if (!ok) setScanRunde((n) => n + 1);
  }

  return (
    <>
      <Button icon={<Ikone name="verketten" groesse={16} />} disabled={gesperrt} onClick={() => setOffen(true)}>
        Gerät verknüpfen
      </Button>
      <Modal
        open={offen}
        title="Gerät verknüpfen"
        okText="Verknüpfen"
        cancelText="Abbrechen"
        confirmLoading={sofort.laeuft}
        onOk={() => form.submit()}
        onCancel={schliessen}
        destroyOnHidden
      >
        <BarcodeScanner
          key={scanRunde}
          zuBarcode={async (rohwert) => {
            const ergebnis = await geraetZuBarcode(rohwert);
            // `null` heißt „unbekannt"; ein gescheiterter Lesevorgang gehört in den catch-Zweig des Scanners.
            if (!ergebnis.ok) throw new Error(ergebnis.fehler);
            return ergebnis.wert;
          }}
          onTreffer={(id) => { void verknuepfe(id); }}
        />
        <Form<{ geraetId?: string }>
          form={form}
          layout="vertical"
          disabled={sofort.laeuft}
          onFinish={(w) => { if (w.geraetId) void verknuepfe(w.geraetId); }}
        >
          <Form.Item
            name="geraetId"
            label="Oder aus der Liste"
            rules={[{ required: true, message: "Gerät wählen" }]}
          >
            <Select
              aria-label="Gerät an anderem Ort"
              placeholder={daten.geraeteWoanders.length === 0 ? "Kein Gerät an einem anderen Ort" : "Gerät suchen"}
              showSearch
              optionFilterProp="label"
              options={daten.geraeteWoanders.map((g) => ({ value: g.id, label: `${g.name} · ${g.ortLabel}` }))}
            />
          </Form.Item>
        </Form>
        {sofort.fehler ? <Alert type="warning" showIcon={false} title={sofort.fehler} /> : null}
      </Modal>
    </>
  );
}

/** „An anderen Ort" — für ein Gerät, das gar nicht hierher gehört (Spec 6.6). */
function GeraetUmsetzen({ daten, geraet, onSchliessen }: {
  daten: VerwaltungscheckDaten;
  geraet: { id: string; name: string };
  onSchliessen: () => void;
}) {
  const [form] = Form.useForm<{ lagerortId?: string }>();
  const sofort = useSofort("Gerät konnte nicht umgesetzt werden.");
  const orte = daten.lagerorte.filter((o) => o.id !== daten.fahrzeug.id);

  return (
    <Modal
      open
      title={`${geraet.name} an anderen Ort`}
      okText="Umsetzen"
      cancelText="Abbrechen"
      confirmLoading={sofort.laeuft}
      onOk={() => form.submit()}
      onCancel={() => { if (!sofort.laeuft) onSchliessen(); }}
      destroyOnHidden
    >
      <Form<{ lagerortId?: string }>
        form={form}
        layout="vertical"
        disabled={sofort.laeuft}
        onFinish={(w) => {
          if (!w.lagerortId) return;
          const lagerortId = w.lagerortId;
          void sofort.ausfuehren(() => geraetUmsetzen({ geraetId: geraet.id, lagerortId }), onSchliessen);
        }}
      >
        <Form.Item name="lagerortId" label="Neuer Standort" rules={[{ required: true, message: "Standort wählen" }]}>
          <Select
            aria-label="Neuer Standort"
            showSearch
            optionFilterProp="label"
            options={orte.map((o) => ({ value: o.id, label: `${o.name} · ${standortMeta(o)}` }))}
          />
        </Form.Item>
      </Form>
      {sofort.fehler ? <Alert type="warning" showIcon={false} title={sofort.fehler} /> : null}
    </Modal>
  );
}
