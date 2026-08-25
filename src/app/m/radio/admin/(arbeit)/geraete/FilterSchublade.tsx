"use client";

// src/app/m/radio/admin/(arbeit)/geraete/FilterSchublade.tsx
import { useState } from "react";
import { Button, Drawer, Select, Space, Switch } from "antd";
import type { Vorschlagsfeld } from "../../../_lib/lesepfade/geraete";
/*
 * ⛔ DIE ZWEI FESTEN WERTELISTEN KOMMEN AUS DEM BLATTMODUL `_lib/geraeteFelder.ts`, NICHT AUS
 * `_lib/csv/klassifizieren.ts` (das `GERAETE_MODI` nur noch weiterreicht, `:33`): ueber jene
 * Datei haengt der ganze CSV-Teilbaum, und diese hier ist eine `"use client"`-Datei.
 */
import { GERAETE_MODI, STATUS_OPTIONEN } from "../../../_lib/geraeteFelder";
import {
  LEERE_FILTER,
  UPDATE_STAND_WERTE,
  type GeraetFilterWerte,
} from "../../../_lib/suchparameter";
import s from "../../../_ui/verwaltung.module.css";

/**
 * DIE FILTERSCHUBLADE DER GERAETELISTE — Nachfolgerin von
 * `radio-admin/client/src/features/devices/DeviceFilterDrawer.tsx`.
 *
 * ⛔ SIE IST EIN KIND VON INSEL 1, KEINE EIGENE INSEL (Entscheidung E-V6,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:603-632`). Ihre Daten bekommt sie von
 * `GeraeteTabelle.tsx` und NICHT vom Server: sie teilt mit ihr den Filterzustand, und
 * Zustand ueber eine RSC-Grenze zu heben endet in einer zweiten Zustandsquelle, die still
 * auseinanderlaeuft.
 *
 * ⛔ `"use client"` IST PFLICHT: der `Drawer` haelt Formularzustand (antd-Zuordnung,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:1062`).
 *
 * ⚠️ BENANNTE ABWEICHUNG VON `DeviceFilterDrawer.tsx:67`, `:78-95`: der Bestand haelt die
 * Werte in einem antd-`Form`; hier haelt sie ein `useState`-Entwurf. Der Grund ist die
 * Pruefbarkeit — `form.getFieldsValue()` liest einen Zustand, den kein Test ohne antds
 * Formularinnenleben erreicht, waehrend der Entwurf hier derselbe Wert ist, den
 * `aufAnwenden` weiterreicht. ⛔ AN DER FACHLICHKEIT AENDERT DAS NICHTS: dieselben zehn
 * Filter, dieselbe Reihenfolge, dieselben zwei Knoepfe.
 */

/**
 * DER FILTERZAEHLER AM KNOPF — ⛔ 1:1 aus `countActiveFilters`
 * (`DeviceFilterDrawer.tsx:14-24`).
 *
 * ⛔ DIE ZAEHLREGEL IST DER GANZE PUNKT: `updateStand` zaehlt EINZELN, die SECHS Listen je
 * als EINS (nicht je Eintrag), und die DREI Schalter je als EINS. Ein Zaehler, der
 * Listeneintraege zaehlte, zeigte bei zwei gewaehlten Standorten eine Zwei — und niemand
 * saehe, dass es EIN Filter ist.
 */
export function aktiveFilterZahl(f: GeraetFilterWerte): number {
  let n = 0;
  if (f.updateStand) n++;
  for (const liste of [
    f.status,
    f.lagerort,
    f.geraeteTyp,
    f.funktion,
    f.hersteller,
    f.geraeteFunktionen,
  ]) {
    if (liste.length) n++;
  }
  if (f.ausleihbar) n++;
  if (f.alamos) n++;
  if (f.hatAbweichung) n++;
  return n;
}

/** Die drei Etiketten des Update-Stands, 1:1 aus `DeviceFilterDrawer.tsx:26-30`. */
const UPDATE_STAND_ETIKETT: Record<string, string> = {
  aktuell: "Aktuell",
  veraltet: "Veraltet",
  unbekannt: "Unbekannt",
};

/**
 * ⛔ SIE WIRD NUR IM OFFENEN ZUSTAND GERENDERT — `GeraeteTabelle.tsx` haengt sie erst beim
 * Oeffnen ein, und damit ist der Entwurf bei jedem Oeffnen der Stand der Adresszeile. Das ist
 * die Suite-Form von `destroyOnHidden` (`DeviceFilterDrawer.tsx:70`). ⛔ Ein `useEffect`, der
 * den Entwurf zuruecksetzt, waere ein Lint-Fehler (`react-hooks/set-state-in-effect`) — und
 * die Regel hat recht: er rendert zweimal und zeigt den verworfenen Entwurf einen Frame lang.
 */
export type FilterSchubladeProps = {
  wert: GeraetFilterWerte;
  vorschlaege: Record<Vorschlagsfeld, string[]>;
  aufSchliessen: () => void;
  aufAnwenden: (naechste: GeraetFilterWerte) => void;
};

/** Ein beschriftetes Feld — statt `Form.Item`, aus demselben Grund wie oben. */
function Feld({ id, etikett, children }: { id: string; etikett: string; children: React.ReactNode }) {
  return (
    <div className={s.filterFeld}>
      <label htmlFor={id} className={s.filterEtikett}>
        {etikett}
      </label>
      {children}
    </div>
  );
}

export function FilterSchublade({
  wert,
  vorschlaege,
  aufSchliessen,
  aufAnwenden,
}: FilterSchubladeProps) {
  const [entwurf, setEntwurf] = useState<GeraetFilterWerte>(wert);

  const listenFeld = (
    schluessel: "geraeteTyp" | "funktion" | "lagerort" | "hersteller",
    etikett: string,
  ) => (
    <Feld id={`radio-filter-${schluessel}`} etikett={etikett}>
      <Select
        id={`radio-filter-${schluessel}`}
        mode="multiple"
        allowClear
        placeholder="Alle"
        className={s.filterWeit}
        value={entwurf[schluessel]}
        onChange={(v: string[]) => setEntwurf({ ...entwurf, [schluessel]: v })}
        options={vorschlaege[schluessel].map((v) => ({ label: v, value: v }))}
      />
    </Feld>
  );

  const schalterFeld = (
    schluessel: "ausleihbar" | "alamos" | "hatAbweichung",
    etikett: string,
  ) => (
    <div className={s.filterSchalter}>
      <span className={s.filterEtikett}>{etikett}</span>
      {/*
        ⛔ DAS `data-rolle` STEHT AN DER HUELLE UND NICHT AM `Switch`: antds `SwitchProps`
        fuehrt keine Datenattribute, und ein Cast dorthin waere eine Zusage an einen fremden
        Typ. Der Testgriff ist deshalb `[data-rolle="…"] button`.
      */}
      <span data-rolle={`radio-filter-${schluessel}`}>
        <Switch
          checked={entwurf[schluessel]}
          onChange={(an) => setEntwurf({ ...entwurf, [schluessel]: an })}
        />
      </span>
    </div>
  );

  return (
    <Drawer
      title="Filter"
      open
      onClose={aufSchliessen}
      width={360}
      extra={
        <Space wrap>
          <Button
            data-rolle="radio-filter-zuruecksetzen"
            onClick={() => {
              setEntwurf(LEERE_FILTER);
              aufAnwenden(LEERE_FILTER);
            }}
          >
            Zurücksetzen
          </Button>
          <Button
            type="primary"
            data-rolle="radio-filter-anwenden"
            onClick={() => aufAnwenden(entwurf)}
          >
            Anwenden
          </Button>
        </Space>
      }
    >
      {/* ⛔ DIE REIHENFOLGE DER ZEHN FELDER IST 1:1 `DeviceFilterDrawer.tsx:79-94`. */}
      {listenFeld("geraeteTyp", "Gerät")}
      {listenFeld("funktion", "Funktion")}
      <Feld id="radio-filter-status" etikett="Status">
        <Select
          id="radio-filter-status"
          mode="multiple"
          allowClear
          placeholder="Alle"
          className={s.filterWeit}
          value={entwurf.status}
          onChange={(v: string[]) => setEntwurf({ ...entwurf, status: v })}
          options={STATUS_OPTIONEN.map((v) => ({ label: v, value: v }))}
        />
      </Feld>
      <Feld id="radio-filter-updateStand" etikett="Update-Stand">
        <Select
          id="radio-filter-updateStand"
          allowClear
          placeholder="Alle"
          className={s.filterWeit}
          value={entwurf.updateStand || undefined}
          onChange={(v?: string) => setEntwurf({ ...entwurf, updateStand: v ?? "" })}
          options={UPDATE_STAND_WERTE.map((v) => ({
            label: UPDATE_STAND_ETIKETT[v] ?? v,
            value: v,
          }))}
        />
      </Feld>
      {listenFeld("lagerort", "Lagerort")}
      {listenFeld("hersteller", "Hersteller")}
      <Feld id="radio-filter-geraeteFunktionen" etikett="Gerätefunktionen">
        <Select
          id="radio-filter-geraeteFunktionen"
          mode="multiple"
          allowClear
          placeholder="Alle"
          className={s.filterWeit}
          value={entwurf.geraeteFunktionen}
          onChange={(v: string[]) => setEntwurf({ ...entwurf, geraeteFunktionen: v })}
          options={GERAETE_MODI.map((v) => ({ label: v, value: v }))}
        />
      </Feld>
      {schalterFeld("ausleihbar", "Ausleihbar")}
      {schalterFeld("alamos", "Alamos integriert")}
      {schalterFeld("hatAbweichung", "Abweichung gemeldet")}
    </Drawer>
  );
}
