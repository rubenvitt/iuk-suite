"use client";

import { useState } from "react";
import { Button, Drawer, Form, Input, InputNumber, Select } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { technikSpeichernAction } from "../../_actions/akte";
import { cmAlsMeter, kgText, meterAlsCm } from "../../_lib/akte/anzeige";
import { BESONDERHEITEN, FUEHRERSCHEINE, type AkteDTO, type Fuehrerschein, type TechnikEingabe } from "../../_lib/akte/typen";
import { feldHilfe, useAktion } from "./useAktion";
import s from "./akte.module.css";

/** Falle 24: die Schublade gibt den Fokus beim Schließen nicht an das Element vom Öffnen zurück. */
const OHNE_FOKUSRUECKGABE = { focusTriggerAfterClose: false } as const;

const MASSE = [
  { feld: "laengeCm", wort: "Länge" },
  { feld: "breiteCm", wort: "Breite" },
  { feld: "hoeheCm", wort: "Höhe" },
] as const;
type Massfeld = (typeof MASSE)[number]["feld"];

type Zahlfeld = "baujahr" | "zggKg" | "leerKg" | "sitze" | "tragen";

/**
 * „Technische Daten bearbeiten“ (IDA-299). Maße tippst du in Metern mit Komma („5,30“), gespeichert
 * werden Zentimeter; alles andere geht so hinaus, wie es dasteht. Ein leeres Feld heißt „nicht erfasst“,
 * deshalb gibt es hier kein Pflichtfeld. Breite über `flyinBreite`, Raster per `auto-fit` (Falle 13).
 */
export function TechnikFlyin({ akte, schliessen }: { akte: AkteDTO; schliessen: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const anhaenger = akte.fahrzeug.art === "anhaenger";
  const [w, setW] = useState<TechnikEingabe>(akte.technik);
  const [meter, setMeter] = useState<Record<Massfeld, string>>({
    laengeCm: cmAlsMeter(akte.technik.laengeCm), breiteCm: cmAlsMeter(akte.technik.breiteCm), hoeheCm: cmAlsMeter(akte.technik.hoeheCm),
  });
  const [staerke, setStaerke] = useState<[number | null, number | null, number | null]>(akte.technik.staerke ?? [null, null, null]);
  const [massFehler, setMassFehler] = useState<Partial<Record<Massfeld, string>>>({});

  const zuladung = w.zggKg !== null && w.leerKg !== null ? w.zggKg - w.leerKg : null;
  const hilfe = (feld: string) => feldHilfe(feldFehler, feld);

  function speichern(): void {
    const cm: Partial<Record<Massfeld, number | null>> = {};
    const fehler: Partial<Record<Massfeld, string>> = {};
    for (const { feld, wort } of MASSE) {
      const wert = meterAlsCm(meter[feld]);
      if (wert === "ungueltig") fehler[feld] = `Gib die ${wort} in Metern an, zum Beispiel 5,30.`;
      else cm[feld] = wert;
    }
    setMassFehler(fehler);
    if (Object.keys(fehler).length > 0) return;
    const eingabe: TechnikEingabe = {
      ...w,
      modell: w.modell?.trim() || null,
      laengeCm: cm.laengeCm ?? null, breiteCm: cm.breiteCm ?? null, hoeheCm: cm.hoeheCm ?? null,
      // Ganz leer heißt „nicht erfasst“; ist eine Zahl da, zählen die leeren als 0.
      staerke: anhaenger || staerke.every((n) => n === null) ? null : [staerke[0] ?? 0, staerke[1] ?? 0, staerke[2] ?? 0],
    };
    fuehreAus(() => technikSpeichernAction(akte.fahrzeug.id, eingabe), "Technische Daten gespeichert.", schliessen);
  }

  const zahl = (feld: Zahlfeld, label: string, rest: { min?: number; max?: number; step?: number; suffix?: string } = {}) => (
    <Form.Item label={label} htmlFor={`fz-technik-${feld}`} {...hilfe(feld)}>
      <InputNumber id={`fz-technik-${feld}`} min={0} precision={0} style={{ width: "100%" }} {...rest} value={w[feld] ?? undefined} onChange={(v) => setW({ ...w, [feld]: v ?? null })} />
    </Form.Item>
  );
  const kopf = (i: 0 | 1 | 2, label: string, max: number) => (
    <Form.Item label={label} htmlFor={`fz-technik-staerke-${i}`}>
      <InputNumber
        id={`fz-technik-staerke-${i}`} min={0} max={max} precision={0} style={{ width: "100%" }} value={staerke[i] ?? undefined}
        onChange={(v) => setStaerke((alt) => alt.map((n, j) => (j === i ? (v ?? null) : n)) as typeof alt)}
      />
    </Form.Item>
  );

  return (
    <Drawer
      open
      onClose={schliessen}
      title="Technische Daten bearbeiten"
      size={flyinBreite(560)}
      destroyOnHidden
      autoFocus={false}
      focusable={OHNE_FOKUSRUECKGABE}
      footer={
        <div className={s.schubladenfuss}>
          <Button onClick={schliessen}>Abbrechen</Button>
          <Button type="primary" loading={laeuft} onClick={speichern}>Speichern</Button>
        </div>
      }
    >
      <Form layout="vertical" component="div">
        <div className={s.raster}>
          <Form.Item label="Modell" htmlFor="fz-technik-modell" {...hilfe("modell")}>
            <Input id="fz-technik-modell" placeholder="zum Beispiel VW T6.1 Kombi" value={w.modell ?? ""} onChange={(e) => setW({ ...w, modell: e.target.value })} />
          </Form.Item>
          {zahl("baujahr", "Baujahr", { min: 1950, max: 2100 })}
        </div>

        <p className={`${s.kicker} ${s.gruppe}`}>Maße in Metern</p>
        <div className={s.raster}>
          {MASSE.map(({ feld, wort }) => {
            const fehler = massFehler[feld] ?? feldFehler[feld];
            return (
              <Form.Item key={feld} label={wort} htmlFor={`fz-technik-${feld}`} validateStatus={fehler ? "error" : undefined} help={fehler}>
                <Input id={`fz-technik-${feld}`} inputMode="decimal" suffix="m" placeholder="5,30" value={meter[feld]} onChange={(e) => setMeter({ ...meter, [feld]: e.target.value })} />
              </Form.Item>
            );
          })}
        </div>

        <p className={`${s.kicker} ${s.gruppe}`}>Gewicht in kg</p>
        <div className={s.raster}>
          {zahl("zggKg", "Zul. Gesamtgewicht", { step: 10, suffix: "kg" })}
          {zahl("leerKg", "Leergewicht", { step: 10, suffix: "kg" })}
        </div>
        <p className={s.neben} style={{ margin: "0 0 16px" }} data-rolle="zuladung">
          {zuladung === null ? "Die Zuladung rechnet die Akte aus beiden Gewichten." : `Zuladung: ${kgText(zuladung)} (berechnet)`}
        </p>

        {!anhaenger && (
          <>
            <p className={`${s.kicker} ${s.gruppe}`}>Standardstärke</p>
            <Form.Item style={{ marginBottom: 0 }} {...hilfe("staerke")}>
              <div className={s.raster3}>
                {kopf(0, "Führer", 9)}
                {kopf(1, "Unterführer", 9)}
                {kopf(2, "Mannschaft", 20)}
              </div>
            </Form.Item>
          </>
        )}

        <div className={s.raster}>
          {zahl("sitze", "Sitzplätze", { max: 20 })}
          {zahl("tragen", "Tragen", { max: 8 })}
          <Form.Item label="Führerschein" htmlFor="fz-technik-fuehrerschein" {...hilfe("fuehrerschein")}>
            <Select<Fuehrerschein>
              id="fz-technik-fuehrerschein"
              allowClear
              value={w.fuehrerschein ?? undefined}
              onChange={(v) => setW({ ...w, fuehrerschein: v ?? null })}
              options={FUEHRERSCHEINE.map((k) => ({ value: k, label: `Klasse ${k}` }))}
            />
          </Form.Item>
        </div>

        <Form.Item label="Besonderheiten" htmlFor="fz-technik-besonderheiten" {...hilfe("besonderheiten")}>
          <Select
            id="fz-technik-besonderheiten"
            mode="tags"
            placeholder="auswählen oder eintippen"
            value={w.besonderheiten}
            onChange={(v: string[]) => setW({ ...w, besonderheiten: v })}
            options={BESONDERHEITEN.map((b) => ({ value: b, label: b }))}
          />
        </Form.Item>
      </Form>
    </Drawer>
  );
}
