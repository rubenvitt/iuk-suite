"use client";

import { useState, type ReactNode } from "react";
import { App, Button, Checkbox, Input, InputNumber, Radio, Select } from "antd";
import { fingerabdruck } from "@/core/entwurf/ablage";
import { EntwurfHinweis } from "@/core/entwurf/EntwurfHinweis";
import { useEntwurf } from "@/core/entwurf/useEntwurf";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";
import { einheitSpeichernAction, planungSpeichernAction, tempHelferSpeichernAction } from "../_actions/planung";
import type { ActionErgebnis, FeldFehler } from "../_lib/actionErgebnis";
import type { Anforderung, EinheitArt, EinheitDTO, FahrzeugWahl, PlanungArt, PlanungDTO, Quali, TempHelferDTO } from "../_lib/typen";
import { MAX_ANFORDERUNGEN, MINUTE, postenSchluessel } from "../_lib/typen";
import { stunden } from "../_lib/zeit";
import { type Zeitraum, Zeitfelder } from "./Zeitfelder";
import s from "./schichtplan.module.css";

/** Schichtlängen zur Wahl; im Sanitätsdienst auch kurze (Rubens Vorgabe aus dem POC). */
const LAENGEN_MIN = [10, 15, 20, 30, 45, 60, 90, 120, 180, 240, 300, 360, 480, 600, 720];
const laengenOptionen = (aktuell?: number) =>
  [...new Set([...LAENGEN_MIN, ...(aktuell ? [aktuell] : [])])].sort((a, b) => a - b).map((m) => ({ value: m, label: stunden(m * MINUTE) }));

export function Feld({ titel, hilfe, fehler, children }: { titel: string; hilfe?: ReactNode; fehler?: string; children: ReactNode }) {
  return (
    <label className={s.feld}>
      <span className={s.feldTitel}>{titel}</span>
      {children}
      {fehler ? <span className={s.feldFehler} role="alert">{fehler}</span> : hilfe ? <span className={s.neben}>{hilfe}</span> : null}
    </label>
  );
}

/** Führt eine Action aus und meldet den Fehlersatz; gibt das Ergebnis oder `null` zurück. */
async function senden<T>(aufruf: () => Promise<ActionErgebnis<T>>, setFehler: (f: FeldFehler) => void, warnen: (t: string) => void): Promise<T | null> {
  try {
    const r = await aufruf();
    if (r.ok) return (r as { wert: T }).wert;
    setFehler(r.feldFehler ?? {});
    warnen(r.fehler);
  } catch {
    warnen("Das ging nicht. Bitte die Seite neu laden.");
  }
  return null;
}


// ── Planung ────────────────────────────────────────────────────────────────

/**
 * Anlegen oder ändern. Beim Anlegen lassen sich gleich Abschnitte (Freitext) und Fahrzeuge (Stammdaten)
 * mit einer gemeinsamen Schichtlänge hinzufügen; danach geht es im Raster weiter.
 */
export function PlanungFormular({ planung, fahrzeuge, onGespeichert }: {
  planung: PlanungDTO | null; fahrzeuge: FahrzeugWahl[]; onGespeichert: (id: string, neu: PlanungDTO | null) => void;
}) {
  const { message } = App.useApp();
  const [name, setName] = useState(planung?.name ?? "");
  const [art, setArt] = useState<PlanungArt>(planung?.art ?? "veranstaltung");
  const [ort, setOrt] = useState(planung?.ort ?? "");
  const [zeitraum, setZeitraum] = useState<Zeitraum>({ von: planung?.von ?? null, bis: planung?.bis ?? null });
  const [laenge, setLaenge] = useState(240);
  const [abschnitte, setAbschnitte] = useState<string[]>([]);
  const [gewaehlt, setGewaehlt] = useState<string[]>([]);
  const [maxDienst, setMaxDienst] = useState((planung?.maxDienstMin ?? 720) / 60);
  const [minRuhe, setMinRuhe] = useState((planung?.minRuheMin ?? 480) / 60);
  const [fehler, setFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  // IDA-358: die Eingaben liegen auf dem Gerät, bis das Speichern bestätigt ist.
  const entwurf = useEntwurf({
    schluessel: planung ? `schichtplan:planung:${planung.id}:${fingerabdruck(planung)}` : "schichtplan:planung:neu",
    stand: { name, art, ort, zeitraum, laenge, abschnitte, gewaehlt, maxDienst, minRuhe },
    wiederherstellen: (w) => {
      setName(w.name); setArt(w.art); setOrt(w.ort); setZeitraum(w.zeitraum); setLaenge(w.laenge);
      setAbschnitte(w.abschnitte); setGewaehlt(w.gewaehlt); setMaxDienst(w.maxDienst); setMinRuhe(w.minRuhe);
    },
  });

  async function speichern() {
    const { von, bis } = zeitraum;
    if (von === null || bis === null) { setFehler({ bis: "Bitte Beginn und Ende wählen." }); return; }
    // IDA-373: Jeder Name nur einmal — sonst lehnt der Server die zweite Einheit ab, und die Planung stünde ohne sie da.
    const namen = [...abschnitte, ...gewaehlt.map((fid) => fahrzeuge.find((f) => f.id === fid)?.name ?? "")].map(postenSchluessel);
    if (new Set(namen).size < namen.length) { setFehler({ abschnitte: "Jeder Name darf nur einmal vorkommen." }); return; }
    setLaeuft(true);
    const eingabe = {
      name, art, ort, von, bis,
      maxDienstMin: Math.round(maxDienst * 60), minRuheMin: Math.round(minRuhe * 60),
    };
    const id = await senden(() => planungSpeichernAction(planung?.id ?? null, eingabe), setFehler, (t) => void message.warning(t));
    if (id === null) { setLaeuft(false); return; }
    let letzte: PlanungDTO | null = null;
    if (!planung) {
      const einheiten = [
        ...abschnitte.map((n) => ({ art: "abschnitt" as const, name: n, fahrzeugId: null, kenner: null })),
        ...gewaehlt.map((fid) => fahrzeuge.find((f) => f.id === fid)).filter((f): f is FahrzeugWahl => !!f)
          .map((f) => ({ art: "fahrzeug" as const, name: f.name, fahrzeugId: f.id, kenner: f.kenner })),
      ];
      for (const e of einheiten) {
        const r = await senden(() => einheitSpeichernAction(id, null, { ...e, schichtMin: laenge, soll: 2, anforderungen: [] }), () => undefined, (t) => void message.warning(t));
        if (r) letzte = r;
      }
    }
    setLaeuft(false);
    entwurf.verwerfen();
    onGespeichert(id, letzte);
  }

  return (
    <div>
      <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
      <Feld titel="Name" fehler={fehler.name}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Stadtfest Uelzen" maxLength={120} /></Feld>
      <Feld titel="Art">
        <Radio.Group value={art} onChange={(e) => setArt(e.target.value as PlanungArt)} options={[{ value: "veranstaltung", label: "Veranstaltung" }, { value: "lage", label: "Lage" }]} />
      </Feld>
      <Feld titel="Ort" fehler={fehler.ort}><Input value={ort} onChange={(e) => setOrt(e.target.value)} maxLength={120} /></Feld>
      <div className={s.feld} role="group" aria-label="Zeitraum">
        <span className={s.feldTitel}>Zeitraum</span>
        <Zeitfelder wert={zeitraum} onChange={setZeitraum} />
        {fehler.bis ?? fehler.von ? <span className={s.feldFehler} role="alert">{fehler.bis ?? fehler.von}</span> : <span className={s.neben}>{planung ? "Bestehende Schichten müssen im neuen Zeitraum liegen." : "Höchstens 14 Tage."}</span>}
      </div>
      {planung ? null : (
        <>
          <Feld titel="Abschnitte" fehler={fehler.abschnitte}>
            <Select mode="tags" value={abschnitte} onChange={setAbschnitte} open={false} suffixIcon={null} placeholder="Abschnitt eintippen" />
          </Feld>
          <Feld titel="Fahrzeuge" hilfe={fahrzeuge.length ? undefined : "In der Fahrzeugverwaltung ist noch kein Fahrzeug im Dienst."}>
            <Select mode="multiple" value={gewaehlt} onChange={setGewaehlt} options={fahrzeuge.map((f) => ({ value: f.id, label: f.name }))} placeholder="Fahrzeuge wählen" showSearch={{ optionFilterProp: "label" }} />
          </Feld>
          <Feld titel="Schichtlänge">
            <Select value={laenge} onChange={setLaenge} options={laengenOptionen()} />
          </Feld>
        </>
      )}
      <div className={s.zweiSpalten}>
        <Feld titel="Höchstens im Dienst" hilfe="Stunden ohne Ruhepause" fehler={fehler.maxDienstMin}>
          <InputNumber min={1} max={24} step={0.5} value={maxDienst} onChange={(v) => setMaxDienst(v ?? 12)} suffix="h" style={{ width: "100%" }} />
        </Feld>
        <Feld titel="Mindestens Ruhe" hilfe="zwischen zwei Diensten" fehler={fehler.minRuheMin}>
          <InputNumber min={0} max={24} step={0.5} value={minRuhe} onChange={(v) => setMinRuhe(v ?? 8)} suffix="h" style={{ width: "100%" }} />
        </Feld>
      </div>
      <Button type="primary" loading={laeuft} disabled={!name.trim() || zeitraum.von === null || zeitraum.bis === null} onClick={() => void speichern()}>{planung ? "Speichern" : "Planung anlegen"}</Button>
    </div>
  );
}

// ── Abschnitt / Fahrzeug ───────────────────────────────────────────────────

export function EinheitFormular({ planId, einheit, fahrzeuge, katalog, einteilungen, onPlanung }: {
  planId: string; einheit: EinheitDTO | null; fahrzeuge: FahrzeugWahl[]; katalog: Quali[];
  /** Wie viele Einteilungen beim Neu-Aufteilen wegfielen. */
  einteilungen: number;
  onPlanung: (p: PlanungDTO) => void;
}) {
  const { message } = App.useApp();
  const [art, setArt] = useState<EinheitArt>(einheit?.art ?? "abschnitt");
  const [name, setName] = useState(einheit?.art === "abschnitt" ? einheit.name : "");
  const [fahrzeugId, setFahrzeugId] = useState<string | null>(einheit?.fahrzeugId ?? null);
  const [kenner, setKenner] = useState(einheit?.art === "abschnitt" ? (einheit.kenner ?? "") : "");
  const [laenge, setLaenge] = useState(einheit?.schichtMin ?? 240);
  const [soll, setSoll] = useState(einheit?.soll ?? 2);
  const [anf, setAnf] = useState<Anforderung[]>(einheit?.anforderungen ?? []);
  const [neuAufteilen, setNeuAufteilen] = useState(false);
  const [fehler, setFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  // IDA-358: je Zeile ein Entwurf, bis das Speichern bestätigt ist.
  const entwurf = useEntwurf({
    schluessel: einheit ? `schichtplan:einheit:${planId}:${einheit.id}:${fingerabdruck(einheit)}` : `schichtplan:einheit:${planId}:neu`,
    stand: { art, name, fahrzeugId, kenner, laenge, soll, anf, neuAufteilen },
    wiederherstellen: (w) => {
      setArt(w.art); setName(w.name); setFahrzeugId(w.fahrzeugId); setKenner(w.kenner);
      setLaenge(w.laenge); setSoll(w.soll); setAnf(w.anf); setNeuAufteilen(w.neuAufteilen);
    },
  });
  // Ein Fahrzeug, das inzwischen außer Dienst ist, bleibt wählbar, solange es hier steht.
  const wahl = einheit?.fahrzeugId && !fahrzeuge.some((f) => f.id === einheit.fahrzeugId)
    ? [...fahrzeuge, { id: einheit.fahrzeugId, name: einheit.name, kenner: einheit.kenner }] : fahrzeuge;
  const gueltig = art === "abschnitt" ? name.trim() !== "" : fahrzeugId !== null;
  const laengeGeaendert = einheit !== null && laenge !== einheit.schichtMin;

  async function speichern() {
    const f = wahl.find((x) => x.id === fahrzeugId);
    const eingabe = {
      art, name: art === "fahrzeug" ? (f?.name ?? "") : name, fahrzeugId: art === "fahrzeug" ? fahrzeugId : null,
      kenner: art === "fahrzeug" ? (f?.kenner ?? null) : kenner.trim() || null,
      schichtMin: laenge, soll, anforderungen: anf, neuAufteilen: laengeGeaendert && neuAufteilen,
    };
    setLaeuft(true);
    const p = await senden(() => einheitSpeichernAction(planId, einheit?.id ?? null, eingabe), setFehler, (t) => void message.warning(t));
    setLaeuft(false);
    if (p) { entwurf.verwerfen(); onPlanung(p); }
  }

  const qualiOptionen = katalog.map((q) => ({ value: q.kurz, label: q.name === q.kurz ? q.kurz : `${q.name} (${q.kurz})` }));
  const quali = (kurz: string): Quali => katalog.find((q) => q.kurz === kurz) ?? { kurz, name: kurz };

  return (
    <div>
      <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
      {einheit ? null : (
        <Feld titel="Art">
          <Radio.Group value={art} onChange={(e) => setArt(e.target.value as EinheitArt)} options={[{ value: "abschnitt", label: "Abschnitt" }, { value: "fahrzeug", label: "Fahrzeug" }]} />
        </Feld>
      )}
      {art === "abschnitt" ? (
        <div className={s.zweiSpalten}>
          <Feld titel="Name" fehler={fehler.name}><Input value={name} onChange={(e) => setName(e.target.value)} placeholder="z. B. Sanitätswache Markt" maxLength={80} /></Feld>
          <Feld titel="Kennung" hilfe="Optional" fehler={fehler.kenner}><Input value={kenner} onChange={(e) => setKenner(e.target.value)} maxLength={40} /></Feld>
        </div>
      ) : (
        <Feld titel="Fahrzeug" fehler={fehler.name}>
          <Select value={fahrzeugId} onChange={setFahrzeugId} options={wahl.map((x) => ({ value: x.id, label: x.name }))} placeholder="Fahrzeug wählen" showSearch={{ optionFilterProp: "label" }} />
        </Feld>
      )}
      <Feld titel="Schichtlänge" fehler={fehler.schichtMin}>
        <Select value={laenge} onChange={setLaenge} options={laengenOptionen(einheit?.schichtMin)} />
      </Feld>
      {laengeGeaendert ? (
        <Checkbox checked={neuAufteilen} onChange={(e) => setNeuAufteilen(e.target.checked)} style={{ marginBlockEnd: 16 }}>
          Alle Schichten neu aufteilen{einteilungen > 0 ? ` (${einteilungen === 1 ? "1 Einteilung fällt" : `${einteilungen} Einteilungen fallen`} weg)` : ""}
        </Checkbox>
      ) : null}
      <Feld titel="Soll-Besetzung je Schicht" fehler={fehler.soll}>
        <InputNumber min={1} max={50} value={soll} onChange={(v) => setSoll(v ?? 1)} suffix="Personen" style={{ width: "100%" }} />
      </Feld>
      <div className={s.abschnitt}>
        <span className={s.feldTitel}>Davon mindestens</span>
        {anf.map((a, i) => (
          <div key={i} style={{ display: "flex", gap: 8 }}>
            <InputNumber aria-label="Anzahl" min={1} max={soll} value={a.anzahl} onChange={(v) => setAnf(anf.map((x, j) => (j === i ? { ...x, anzahl: v ?? 1 } : x)))} style={{ width: 96 }} />
            <Select aria-label="Qualifikation" style={{ flex: 1, minWidth: 0 }} value={a.quali.kurz} onChange={(k: string) => setAnf(anf.map((x, j) => (j === i ? { ...x, quali: quali(k) } : x)))} options={qualiOptionen} showSearch={{ optionFilterProp: "label" }} />
            <Button aria-label="Anforderung entfernen" icon={<Icons8Ikone name="trash" groesse={16} />} onClick={() => setAnf(anf.filter((_, j) => j !== i))} />
          </div>
        ))}
        {fehler.anforderungen ? <span className={s.feldFehler} role="alert">{fehler.anforderungen}</span> : null}
        <Button disabled={anf.length >= MAX_ANFORDERUNGEN} onClick={() => setAnf([...anf, { quali: quali("San"), anzahl: 1 }])} icon={<Icons8Ikone name="plus" groesse={16} />} style={{ alignSelf: "flex-start" }}>Qualifikation fordern</Button>
      </div>
      <Button type="primary" loading={laeuft} disabled={!gueltig} onClick={() => void speichern()}>{einheit ? "Speichern" : "Hinzufügen"}</Button>
    </div>
  );
}

// ── Temporärer Helfer ──────────────────────────────────────────────────────

export function TempFormular({ planId, helfer, katalog, onPlanung }: {
  planId: string; helfer: TempHelferDTO | null; katalog: Quali[]; onPlanung: (p: PlanungDTO) => void;
}) {
  const { message } = App.useApp();
  const [vorname, setVorname] = useState(helfer?.vorname ?? "");
  const [nachname, setNachname] = useState(helfer?.nachname ?? "");
  const [telefon, setTelefon] = useState(helfer?.telefon ?? "");
  const [organisation, setOrganisation] = useState(helfer?.organisation ?? "");
  const [qualis, setQualis] = useState<string[]>(helfer?.qualifikationen.map((q) => q.kurz) ?? []);
  const [fehler, setFehler] = useState<FeldFehler>({});
  const [laeuft, setLaeuft] = useState(false);
  // IDA-358: die Eingaben liegen auf dem Gerät, bis das Speichern bestätigt ist.
  const entwurf = useEntwurf({
    schluessel: helfer ? `schichtplan:helfer:${planId}:${helfer.id}:${fingerabdruck(helfer)}` : `schichtplan:helfer:${planId}:neu`,
    stand: { vorname, nachname, telefon, organisation, qualis },
    wiederherstellen: (w) => {
      setVorname(w.vorname); setNachname(w.nachname); setTelefon(w.telefon); setOrganisation(w.organisation); setQualis(w.qualis);
    },
  });
  const zuQuali = (kurz: string): Quali => katalog.find((q) => q.kurz === kurz) ?? helfer?.qualifikationen.find((q) => q.kurz === kurz) ?? { kurz, name: kurz };

  async function speichern() {
    setLaeuft(true);
    const p = await senden(
      () => tempHelferSpeichernAction(planId, helfer?.id ?? null, { vorname, nachname, telefon, organisation, qualifikationen: qualis.map(zuQuali) }),
      setFehler, (t) => void message.warning(t),
    );
    setLaeuft(false);
    if (p) { entwurf.verwerfen(); onPlanung(p); }
  }

  return (
    <div>
      <div className={s.entwurf}><EntwurfHinweis entwurf={entwurf} /></div>
      <div className={s.zweiSpalten}>
        <Feld titel="Vorname" fehler={fehler.vorname}><Input value={vorname} onChange={(e) => setVorname(e.target.value)} maxLength={80} /></Feld>
        <Feld titel="Nachname" fehler={fehler.nachname}><Input value={nachname} onChange={(e) => setNachname(e.target.value)} maxLength={80} /></Feld>
      </div>
      <Feld titel="Telefon" fehler={fehler.telefon}><Input value={telefon} onChange={(e) => setTelefon(e.target.value)} inputMode="tel" maxLength={40} /></Feld>
      <Feld titel="Organisation" fehler={fehler.organisation}><Input value={organisation} onChange={(e) => setOrganisation(e.target.value)} placeholder="z. B. Nachbarkreis" maxLength={120} /></Feld>
      <Feld titel="Qualifikationen">
        <Select mode="tags" value={qualis} onChange={setQualis} options={katalog.map((q) => ({ value: q.kurz, label: q.name === q.kurz ? q.kurz : `${q.name} (${q.kurz})` }))} showSearch={{ optionFilterProp: "label" }} />
      </Feld>
      <Button type="primary" loading={laeuft} disabled={!vorname.trim() || !nachname.trim()} onClick={() => void speichern()}>{helfer ? "Speichern" : "Anlegen"}</Button>
    </div>
  );
}

