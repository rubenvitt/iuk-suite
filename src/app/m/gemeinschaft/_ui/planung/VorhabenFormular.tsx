"use client";

import { useRef, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { App, Button, DatePicker, Drawer, Input, Select, Switch, type InputRef } from "antd";
import type { Dayjs } from "dayjs";
import { flyinBreite } from "@/core/theme/flyin";
import { WAEHLER_IM_BILD } from "@/core/theme/waehlerImBild";
import { vorhabenSpeichernAction } from "../../_actions/vorhaben";
import { barKonflikte, barKonfliktName } from "../../_lib/vorhabenBar";
import type { FeldFehler } from "../../_lib/vorhabenErgebnis";
import { zeitraumText, type FormularDaten, type VorhabenVorlage } from "../../_lib/vorhabenTypen";
import { alsDayjs, ausDayjs, tagAlsDayjs, tagAusDayjs } from "./datum";
import { fokussiereWennFrei } from "./fokus";
import s from "./planung.module.css";


type FlyinZustand = { vorlage: VorhabenVorlage; nr: number; offen: boolean };

/** Zustand des Flyins: die Vorlage bleibt beim Schließen stehen, damit der Titel nicht während der Animation wechselt. */
export function useVorhabenFlyin() {
  const [zustand, setZustand] = useState<FlyinZustand | null>(null);
  return {
    zustand,
    oeffne: (vorlage: VorhabenVorlage) => setZustand((alt) => ({ vorlage, nr: (alt?.nr ?? 0) + 1, offen: true })),
    schliesse: () => setZustand((alt) => (alt ? { ...alt, offen: false } : alt)),
  };
}

function flyinTitel(v: VorhabenVorlage): string {
  if (v.id) return v.art === "event" ? "Event bearbeiten" : "Projekt bearbeiten";
  return v.art === "event" ? "Event anlegen" : "Projekt anlegen";
}

/**
 * Anlegen und Bearbeiten im Flyin (POC `VorhabenFormular`). Breite über `flyinBreite` (Falle 13); kein
 * Fokusraub beim Öffnen und keine Fokusrückgabe beim Schließen (Falle 24).
 */
export function VorhabenFlyin({ zustand, schliesse, daten }: { zustand: FlyinZustand | null; schliesse: () => void; daten: FormularDaten }) {
  const titelRef = useRef<InputRef>(null);
  return (
    <Drawer
      open={!!zustand?.offen}
      onClose={schliesse}
      size={flyinBreite(560)}
      title={zustand ? flyinTitel(zustand.vorlage) : ""}
      destroyOnHidden
      autoFocus={false}
      focusable={{ focusTriggerAfterClose: false }}
      afterOpenChange={(offen) => { if (offen) fokussiereWennFrei(titelRef.current?.input); }}
    >
      {zustand ? <VorhabenFormular key={zustand.nr} vorlage={zustand.vorlage} daten={daten} titelRef={titelRef} onFertig={schliesse} /> : null}
    </Drawer>
  );
}

function Feld({ titel, hilfe, fehler, children }: { titel: string; hilfe?: ReactNode; fehler?: string; children: ReactNode }) {
  return (
    <label className={s.feld}>
      <span className={s.feldTitel}>{titel}</span>
      {hilfe ? <span className={s.neben}>{hilfe}</span> : null}
      {children}
      {fehler ? <span className={s.feldFehler} role="alert">{fehler}</span> : null}
    </label>
  );
}

const ZEITFORMAT = "DD.MM.YYYY HH:mm";
const ZWEI_STUNDEN = 2 * 3_600_000;

export function VorhabenFormular({ vorlage, daten, titelRef, onFertig }: {
  vorlage: VorhabenVorlage; daten: FormularDaten; titelRef?: React.Ref<InputRef>; onFertig: () => void;
}) {
  const { message } = App.useApp();
  const router = useRouter();
  const art = vorlage.art;
  const [titel, setTitel] = useState(vorlage.titel ?? "");
  const [beschreibung, setBeschreibung] = useState(vorlage.beschreibung ?? "");
  const [verantwortlichId, setVerantwortlichId] = useState<string | null>(vorlage.verantwortlichId ?? null);
  const [von, setVon] = useState<Dayjs | null>(vorlage.von ? alsDayjs(vorlage.von) : null);
  const [bis, setBis] = useState<Dayjs | null>(vorlage.bis ? alsDayjs(vorlage.bis) : null);
  const [ort, setOrt] = useState(vorlage.ort ?? "");
  const [barBelegen, setBarBelegen] = useState(vorlage.barBelegen ?? false);
  const [projektId, setProjektId] = useState<string | null>(vorlage.projektId ?? null);
  const [ziel, setZiel] = useState<Dayjs | null>(vorlage.ziel ? tagAlsDayjs(vorlage.ziel) : null);
  const [fehler, setFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);

  const entwurf = von && bis ? { von: ausDayjs(von), bis: ausDayjs(bis) } : null;
  const konflikte = art === "event" && barBelegen && entwurf && entwurf.bis > entwurf.von
    ? barKonflikte(daten.bar, entwurf, vorlage.id ?? null) : { hart: [], hinweis: [] };
  const gueltig = titel.trim().length >= 3 && (art === "projekt" || (entwurf !== null && entwurf.bis > entwurf.von && konflikte.hart.length === 0));

  /** Beginn gesetzt und Ende leer oder davor: Ende zwei Stunden später vorschlagen. */
  function setzeBeginn(d: Dayjs | null) {
    setVon(d);
    if (d && (!bis || ausDayjs(bis) <= ausDayjs(d))) setBis(alsDayjs(ausDayjs(d) + ZWEI_STUNDEN));
  }

  async function speichern() {
    const eingabe = art === "event"
      ? { art, titel, beschreibung, verantwortlichId, von: entwurf?.von, bis: entwurf?.bis, ort, barBelegen, projektId }
      : { art, titel, beschreibung, verantwortlichId, ziel: ziel ? tagAusDayjs(ziel) : null };
    setLaeuft(true);
    try {
      const r = await vorhabenSpeichernAction(vorlage.id ?? null, eingabe);
      if (!r.ok) {
        setFehler(r.feldFehler ?? {});
        void message.warning(r.fehler);
        return;
      }
      if (vorlage.id) {
        void message.success("Gespeichert.");
      } else {
        void message.success(art === "event" ? "Event angelegt. Jetzt Aufgaben verteilen." : "Projekt angelegt. Jetzt Aufgaben verteilen.");
        router.push(`/v/${r.wert}`);
      }
      onFertig();
    } catch {
      void message.warning("Das ging nicht. Bitte die Seite neu laden.");
    } finally {
      setLaeuft(false);
    }
  }

  const personen = daten.mitglieder.map((m) => ({ value: m.id, label: m.name }));
  return (
    <div className={s.formular}>
      <Feld titel="Titel" fehler={fehler.titel}>
        <Input ref={titelRef} value={titel} onChange={(e) => setTitel(e.target.value)} maxLength={120}
          placeholder={art === "event" ? "Zum Beispiel Spieleabend" : "Zum Beispiel Bar renovieren"} />
      </Feld>
      {art === "event" ? (
        <>
          <div className={s.zweiFelder}>
            <Feld titel="Beginn" fehler={fehler.von}>
              <DatePicker showTime={{ format: "HH:mm", minuteStep: 15 }} format={ZEITFORMAT} value={von} onChange={setzeBeginn}
                popupAlign={WAEHLER_IM_BILD} style={{ width: "100%" }} placeholder="Datum und Uhrzeit" />
            </Feld>
            <Feld titel="Ende" fehler={fehler.bis}>
              <DatePicker showTime={{ format: "HH:mm", minuteStep: 15 }} format={ZEITFORMAT} value={bis} onChange={setBis}
                popupAlign={WAEHLER_IM_BILD} style={{ width: "100%" }} placeholder="Datum und Uhrzeit" />
            </Feld>
          </div>
          <Feld titel="Ort" fehler={fehler.ort}>
            <Input value={ort} onChange={(e) => setOrt(e.target.value)} maxLength={120} placeholder="Zum Beispiel Bar, Marktplatz" />
          </Feld>
          <div className={s.schalterZeile}>
            <Switch id="vorhaben-bar-belegen" checked={barBelegen} onChange={setBarBelegen} aria-describedby="vorhaben-bar-hilfe" />
            <label htmlFor="vorhaben-bar-belegen" style={{ display: "grid", gap: 2 }}>
              <span className={s.feldTitel}>Bar belegen</span>
              <span id="vorhaben-bar-hilfe" className={s.neben}>Die Bar steht dann in der Vermietung als belegt, niemand kann sie für diese Zeit anfragen.</span>
            </label>
          </div>
          {konflikte.hart.length > 0 || konflikte.hinweis.length > 0 ? (
            <div className={s.konflikt} aria-live="polite" data-konflikt={konflikte.hart.length ? "hart" : "hinweis"}>
              {konflikte.hart.length
                ? <b>Die Bar ist in dieser Zeit schon vergeben.</b>
                : <span><b>Offene Bar-Anfragen in dieser Zeit.</b> Lehn sie danach unter Vermietung mit Begründung ab:</span>}
              {[...konflikte.hart, ...konflikte.hinweis].map((k) => (
                <span key={`${k.art}-${k.id}`}>{barKonfliktName(k)} · {zeitraumText(k.von, k.bis)}</span>
              ))}
            </div>
          ) : null}
          <Feld titel="Gehört zu Projekt" hilfe="Freiwillig" fehler={fehler.projektId}>
            <Select allowClear value={projektId ?? undefined} onChange={(w?: string) => setProjektId(w ?? null)} placeholder="Kein Projekt"
              showSearch={{ optionFilterProp: "label" }} options={daten.projekte.map((p) => ({ value: p.id, label: p.titel }))} />
          </Feld>
        </>
      ) : (
        <Feld titel="Fertig bis" hilfe="Freiwillig. Ein Projekt hat keinen festen Tag, höchstens ein Ziel." fehler={fehler.ziel}>
          <DatePicker value={ziel} onChange={setZiel} format={["DD.MM.YYYY", "YYYY-MM-DD"]} popupAlign={WAEHLER_IM_BILD}
            style={{ width: "100%" }} placeholder="Ohne Zieltermin" />
        </Feld>
      )}
      <Feld titel="Verantwortlich" hilfe="Behält den Überblick und ist Ansprechperson." fehler={fehler.verantwortlichId}>
        <Select allowClear value={verantwortlichId ?? undefined} onChange={(w?: string) => setVerantwortlichId(w ?? null)} placeholder="Niemand"
          showSearch={{ optionFilterProp: "label" }} options={personen} />
      </Feld>
      <Feld titel="Beschreibung" hilfe="Freiwillig" fehler={fehler.beschreibung}>
        <Input.TextArea rows={4} value={beschreibung} onChange={(e) => setBeschreibung(e.target.value)} maxLength={2000} />
      </Feld>
      <div className={s.knoepfe}>
        <Button type="primary" disabled={!gueltig} loading={laeuft} onClick={() => void speichern()}>{vorlage.id ? "Speichern" : "Anlegen"}</Button>
        <Button onClick={onFertig}>Abbrechen</Button>
      </div>
    </div>
  );
}
