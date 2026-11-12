"use client";

import { useState } from "react";
import { Button, Checkbox, DatePicker, Form, Input, InputNumber, Modal, Radio } from "antd";
import dayjs from "dayjs";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import {
  kilometerEintragenAction, pruefungErledigtAction, pruefungSpeichernAction, reifensatzSpeichernAction, reifenwechselAction,
} from "../../_actions/akte";
import { datum, kmText } from "../../_lib/akte/regeln";
import {
  PRUEF_ARTEN, REIFEN_ARTEN, type AkteDTO, type ErledigtEingabe, type PruefArt, type PruefungDTO, type PruefungEingabe,
  type ReifenArt, type ReifensatzDTO, type ReifensatzEingabe,
} from "../../_lib/akte/typen";
import { feldHilfe, useAktion } from "./useAktion";
import s from "./akte.module.css";

/**
 * Die Dialoge der Fahrzeugakte (IDA-299). Jeder wird nur gerendert, solange er offen ist, und beginnt so
 * mit frischem Zustand. Geprüft wird auf dem Server; dessen Feldfehler stehen am Feld (`feldHilfe`), der
 * Hauptknopf bleibt aktiv (`docs/design/README.md`, „Formulare“). `Form` mit `component="div"`: nur das
 * Raster von antd, der Zustand liegt in `useState` wie in der Gerätewartung.
 */

/** Ein Kalendertag als `JJJJ-MM-TT` hinter antds Datumswähler. */
function TagFeld({ id, wert, onChange, bis, leerbar = false }: { id: string; wert: string | null; onChange: (tag: string | null) => void; bis?: string; leerbar?: boolean }) {
  return (
    <DatePicker
      id={id}
      format="DD.MM.YYYY"
      style={{ width: "100%" }}
      allowClear={leerbar}
      value={wert ? dayjs(wert) : null}
      maxDate={bis ? dayjs(bis) : undefined}
      popupAlign={WAEHLER_IM_BILD}
      onChange={(d) => { if (d) onChange(d.format("YYYY-MM-DD")); else if (leerbar) onChange(null); }}
    />
  );
}

const fuehrtKilometer = (akte: AkteDTO): boolean => akte.fahrzeug.art !== "anhaenger";
const kmFeld = { min: 0, precision: 0, suffix: "km", style: { width: "100%" } } as const;

/* ---------- Erledigt ---------- */

export function ErledigtDialog({ akte, pruefung, heute, schliessen }: { akte: AkteDTO; pruefung: PruefungDTO; heute: string; schliessen: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const mitKm = fuehrtKilometer(akte);
  const [w, setW] = useState<ErledigtEingabe>({ am: heute, km: mitKm ? akte.km : null, vonHand: null, bemerkung: "" });
  const [vonHand, setVonHand] = useState(false);
  const vorschau = dayjs(w.am).add(pruefung.monate, "month").format("YYYY-MM-DD");

  return (
    <Modal
      open
      title={`${pruefung.name} erledigt eintragen`}
      okText="Eintragen"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      onCancel={schliessen}
      onOk={() => fuehreAus(() => pruefungErledigtAction(pruefung.id, { ...w, vonHand: vonHand ? w.vonHand : null }), `${pruefung.name} eingetragen.`, schliessen)}
      destroyOnHidden
    >
      <Form layout="vertical" component="div">
        <Form.Item label="Erledigt am" htmlFor="fz-erledigt-am" required {...feldHilfe(feldFehler, "am")}>
          <TagFeld id="fz-erledigt-am" wert={w.am} bis={heute} onChange={(am) => am && setW({ ...w, am })} />
        </Form.Item>
        {mitKm && (
          <Form.Item label="Kilometerstand bei der Prüfung" htmlFor="fz-erledigt-km" required={pruefung.kmAbstand !== null} {...feldHilfe(feldFehler, "km")}>
            <InputNumber id="fz-erledigt-km" {...kmFeld} value={w.km ?? undefined} onChange={(km) => setW({ ...w, km: km ?? null })} />
          </Form.Item>
        )}
        <Checkbox id="fz-erledigt-hand" checked={vonHand} onChange={(e) => setVonHand(e.target.checked)}>Nächsten Termin von Hand setzen</Checkbox>
        <p className={s.neben} style={{ margin: "4px 0 12px" }}>
          Sonst rechnet die Akte: {pruefung.monate} Monate nach dem Prüfdatum, also etwa {datum(vorschau)}.
        </p>
        {vonHand && (
          <Form.Item label="Nächster Termin" htmlFor="fz-erledigt-vonhand" required {...feldHilfe(feldFehler, "vonHand")}>
            <TagFeld id="fz-erledigt-vonhand" wert={w.vonHand} leerbar onChange={(tag) => setW({ ...w, vonHand: tag })} />
          </Form.Item>
        )}
        <Form.Item label="Bemerkung" htmlFor="fz-erledigt-bemerkung" {...feldHilfe(feldFehler, "bemerkung")}>
          <Input.TextArea id="fz-erledigt-bemerkung" rows={2} placeholder="zum Beispiel: Bremsflüssigkeit gewechselt" value={w.bemerkung} onChange={(e) => setW({ ...w, bemerkung: e.target.value })} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ---------- Prüfung hinzufügen und bearbeiten ---------- */

/** Was eine neue Prüfung je Art mitbringt; „Weitere“ benennst du selbst. Die Abstände sind Vorschläge. */
const ART_VORGABE: Record<PruefArt, { name: string; monate: number }> = {
  HU: { name: "HU (TÜV)", monate: 24 },
  UVV: { name: "UVV-Prüfung", monate: 12 },
  Service: { name: "Inspektion", monate: 12 },
  Weitere: { name: "", monate: 12 },
};
const ART_WORT: Record<PruefArt, string> = { HU: "HU", UVV: "UVV", Service: "Service", Weitere: "Weitere Prüfung" };
const VORGABE_NAMEN = new Set(Object.values(ART_VORGABE).map((v) => v.name));

/** Die Art, die einer Akte als Nächstes fehlt — eine neue Akte ist leer, also zuerst die HU. */
function fehlendeArt(akte: AkteDTO): PruefArt {
  const da = new Set(akte.pruefungen.map((p) => p.art));
  return PRUEF_ARTEN.find((a) => a !== "Weitere" && !da.has(a)) ?? "Weitere";
}

export function PruefungDialog({ akte, pruefung, heute, schliessen }: { akte: AkteDTO; pruefung: PruefungDTO | null; heute: string; schliessen: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const [w, setW] = useState<PruefungEingabe>(() => {
    if (pruefung) return { art: pruefung.art, name: pruefung.name, monate: pruefung.monate, kmAbstand: pruefung.kmAbstand, zuletzt: pruefung.zuletzt, vonHand: pruefung.vonHand };
    const art = fehlendeArt(akte);
    return { art, ...ART_VORGABE[art], kmAbstand: null, zuletzt: null, vonHand: null };
  });
  /** Ein Artwechsel zieht Namen und Abstand nach, solange der Name noch ein Vorschlag ist. */
  const waehleArt = (art: PruefArt) => setW((alt) => (VORGABE_NAMEN.has(alt.name.trim()) ? { ...alt, art, ...ART_VORGABE[art] } : { ...alt, art }));

  return (
    <Modal
      open
      title={pruefung ? `${pruefung.name} bearbeiten` : "Prüfung hinzufügen"}
      okText={pruefung ? "Speichern" : "Hinzufügen"}
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      onCancel={schliessen}
      onOk={() => fuehreAus(() => pruefungSpeichernAction(akte.fahrzeug.id, pruefung?.id ?? null, { ...w, name: w.name.trim() }), pruefung ? "Prüfung gespeichert." : `${w.name.trim() || "Prüfung"} hinzugefügt.`, schliessen)}
      destroyOnHidden
    >
      <Form layout="vertical" component="div">
        <Form.Item label="Art" required {...feldHilfe(feldFehler, "art")}>
          <Radio.Group
            aria-label="Art"
            value={w.art}
            onChange={(e) => waehleArt(e.target.value as PruefArt)}
            options={PRUEF_ARTEN.map((a) => ({ value: a, label: ART_WORT[a] }))}
          />
        </Form.Item>
        <Form.Item label="Bezeichnung" htmlFor="fz-pruefung-name" required {...feldHilfe(feldFehler, "name")}>
          <Input id="fz-pruefung-name" placeholder="zum Beispiel Feuerlöscher, Stromerzeuger oder Ladebordwand" value={w.name} onChange={(e) => setW({ ...w, name: e.target.value })} />
        </Form.Item>
        <div className={s.raster}>
          <Form.Item label="Abstand in Monaten" htmlFor="fz-pruefung-monate" required {...feldHilfe(feldFehler, "monate")}>
            <InputNumber id="fz-pruefung-monate" min={1} max={120} precision={0} style={{ width: "100%" }} value={w.monate} onChange={(m) => setW({ ...w, monate: m ?? 0 })} />
          </Form.Item>
          {fuehrtKilometer(akte) && (
            <Form.Item label="Oder nach Kilometern" htmlFor="fz-pruefung-km" {...feldHilfe(feldFehler, "kmAbstand")}>
              <InputNumber id="fz-pruefung-km" {...kmFeld} step={1000} value={w.kmAbstand ?? undefined} onChange={(km) => setW({ ...w, kmAbstand: km ?? null })} />
            </Form.Item>
          )}
        </div>
        <div className={s.raster}>
          <Form.Item label="Zuletzt erledigt am" htmlFor="fz-pruefung-zuletzt" {...feldHilfe(feldFehler, "zuletzt")}>
            <TagFeld id="fz-pruefung-zuletzt" wert={w.zuletzt} bis={heute} leerbar onChange={(tag) => setW({ ...w, zuletzt: tag })} />
          </Form.Item>
          <Form.Item label="Nächster Termin von Hand" htmlFor="fz-pruefung-vonhand" {...feldHilfe(feldFehler, "vonHand")}>
            <TagFeld id="fz-pruefung-vonhand" wert={w.vonHand} leerbar onChange={(tag) => setW({ ...w, vonHand: tag })} />
          </Form.Item>
        </div>
        <p className={s.neben} style={{ margin: 0 }}>
          Ohne Termin von Hand rechnet die Akte: letzte Prüfung plus Abstand. Mit Kilometern zählt, was zuerst erreicht ist.
        </p>
      </Form>
    </Modal>
  );
}

/* ---------- Kilometerstand ---------- */

export function KilometerDialog({ akte, schliessen }: { akte: AkteDTO; schliessen: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const [km, setKm] = useState<number | null>(akte.km);
  const [fehlt, setFehlt] = useState(false);
  const fehler = fehlt ? "Gib den Kilometerstand an." : feldFehler.km;

  return (
    <Modal
      open
      title="Kilometerstand eintragen"
      okText="Speichern"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      onCancel={schliessen}
      onOk={() => {
        if (km === null) { setFehlt(true); return; }
        fuehreAus(() => kilometerEintragenAction(akte.fahrzeug.id, { km }), "Kilometerstand gespeichert.", schliessen);
      }}
      destroyOnHidden
    >
      <Form layout="vertical" component="div">
        <Form.Item
          label="Stand laut Tacho, heute"
          htmlFor="fz-km"
          required
          extra={akte.km !== null && akte.kmAm ? `Zuletzt ${kmText(akte.km)} am ${datum(akte.kmAm)}.` : undefined}
          validateStatus={fehler ? "error" : undefined}
          help={fehler}
        >
          <InputNumber id="fz-km" {...kmFeld} step={10} value={km ?? undefined} onChange={(v) => { setKm(v ?? null); setFehlt(false); }} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ---------- Reifensatz ---------- */

export function ReifensatzDialog({ akte, satz, schliessen }: { akte: AkteDTO; satz: ReifensatzDTO | null; schliessen: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  const [w, setW] = useState<ReifensatzEingabe>(() => {
    if (satz) return { art: satz.art, dot: satz.dot, lager: satz.lager };
    const da = new Set(akte.reifensaetze.map((x) => x.art));
    return { art: REIFEN_ARTEN.find((a) => !da.has(a)) ?? REIFEN_ARTEN[0], dot: "", lager: "" };
  });

  return (
    <Modal
      open
      title={satz ? `${satz.art}reifen bearbeiten` : "Reifensatz hinzufügen"}
      okText={satz ? "Speichern" : "Hinzufügen"}
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      onCancel={schliessen}
      onOk={() => fuehreAus(() => reifensatzSpeichernAction(akte.fahrzeug.id, satz?.id ?? null, { ...w, dot: w.dot.trim(), lager: w.lager.trim() }), "Reifensatz gespeichert.", schliessen)}
      destroyOnHidden
    >
      <Form layout="vertical" component="div">
        <Form.Item label="Art" required {...feldHilfe(feldFehler, "art")}>
          <Radio.Group
            aria-label="Art"
            value={w.art}
            onChange={(e) => setW({ ...w, art: e.target.value as ReifenArt })}
            options={REIFEN_ARTEN.map((a) => ({ value: a, label: `${a}reifen` }))}
          />
        </Form.Item>
        <Form.Item
          label="DOT-Nummer"
          htmlFor="fz-satz-dot"
          required
          extra="Vier Ziffern von der Reifenflanke: Woche und Jahr der Herstellung, zum Beispiel 3822."
          {...feldHilfe(feldFehler, "dot")}
        >
          <Input id="fz-satz-dot" inputMode="numeric" maxLength={4} value={w.dot} onChange={(e) => setW({ ...w, dot: e.target.value })} />
        </Form.Item>
        <Form.Item label="Lagerort" htmlFor="fz-satz-lager" extra="Wo der Satz liegt, solange er nicht aufgezogen ist." {...feldHilfe(feldFehler, "lager")}>
          <Input id="fz-satz-lager" placeholder="zum Beispiel Fahrzeughalle, Regal 2" value={w.lager} onChange={(e) => setW({ ...w, lager: e.target.value })} />
        </Form.Item>
      </Form>
    </Modal>
  );
}

/* ---------- Reifenwechsel ---------- */

export function ReifenwechselDialog({ akte, schliessen }: { akte: AkteDTO; schliessen: () => void }) {
  const { laeuft, feldFehler, fuehreAus } = useAktion();
  // Je Art ein Eintrag: gewechselt wird auf eine Art, nicht auf einen einzelnen Satz.
  const andere = akte.reifensaetze.filter((x, i, alle) => x.art !== akte.aufgezogen && alle.findIndex((y) => y.art === x.art) === i);
  const [art, setArt] = useState<ReifenArt | null>(andere[0]?.art ?? null);

  if (andere.length === 0) {
    return (
      <Modal open title="Reifenwechsel eintragen" onCancel={schliessen} footer={<Button onClick={schliessen}>Schließen</Button>} destroyOnHidden>
        <p style={{ margin: 0 }}>
          Für dieses Fahrzeug ist nur ein Satz erfasst ({akte.aufgezogen}reifen). Leg zuerst den zweiten Satz an. Bei neuen Reifen trägst du am
          Satz die neue DOT-Nummer ein.
        </p>
      </Modal>
    );
  }

  return (
    <Modal
      open
      title="Reifenwechsel eintragen"
      okText="Speichern"
      cancelText="Abbrechen"
      confirmLoading={laeuft}
      onCancel={schliessen}
      onOk={() => art && fuehreAus(() => reifenwechselAction(akte.fahrzeug.id, { aufgezogen: art }), `${art}reifen aufgezogen.`, schliessen)}
      destroyOnHidden
    >
      <Form layout="vertical" component="div">
        <p style={{ marginTop: 0 }}>
          Welcher Satz ist jetzt drauf?{akte.aufgezogen ? ` Der bisherige Satz (${akte.aufgezogen}reifen) gilt danach als eingelagert.` : ""}
        </p>
        <Form.Item {...feldHilfe(feldFehler, "aufgezogen")}>
          <Radio.Group
            aria-label="Aufgezogener Satz"
            value={art}
            onChange={(e) => setArt(e.target.value as ReifenArt)}
            options={andere.map((x) => ({ value: x.art, label: `${x.art}reifen, DOT ${x.dot}` }))}
          />
        </Form.Item>
      </Form>
    </Modal>
  );
}
