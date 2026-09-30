"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { Alert, Button, type InputRef } from "antd";
import { ladeStandAction, speichereAngabenAction, speichereInhaltAction } from "../../_actions/plan";
import { ladeZeichenAction } from "../../_actions/zeichen";
import { angabenSchema, type Planangaben } from "../../_lib/angaben";
import type { SpeicherErgebnis, Speicherstand } from "../../_lib/ergebnis";
import { layout } from "../../_lib/layout/layout";
import { baueSicht } from "../../_lib/layout/sicht";
import { legende } from "../../_lib/layout/zeichne";
import { fuegeEinheitenEin } from "../../_lib/plan/einheiten";
import { PlanFehler, fuegeSeitenstelleEin, fuegeUnterstelleEin, fuegeWurzelEin, loescheStelle } from "../../_lib/plan/operationen";
import type { PlanInhalt } from "../../_lib/plan/schema";
import type { ZeichenIndexEintrag } from "../../_lib/zeichen/grundlagen";
import { Flaeche, type FlaecheGriff } from "../betrachter/Flaeche";
import { Legende } from "../betrachter/Legende";
import { Umschalter } from "../betrachter/EinklappKnopf";
import type { Symbolsatz } from "../zeichnung/Symbole";
import type { Aendere } from "./aendere";
import { Griffe } from "./Griffe";
import { neueId } from "./ids";
import { Kopfleiste } from "./Kopfleiste";
import { wandere } from "./navigation";
import { PLAN_FLYIN_GRUND, PlanFlyin } from "./PlanFlyin";
import { Speicherer, type SpeicherZustand } from "./speicherer";
import { STELLE_FLYIN_GRUND, StelleFlyin } from "./StelleFlyin";
import { flaechenBefehl, globalerBefehl, istTextfeld } from "./tasten";
import { kannRueckgaengig, kannWiederholen, neuerVerlauf, rueckgaengig, tue, wiederholen, type Verlauf } from "./verlauf";
import { leseZuletzt } from "./zuletzt";

export interface EditorPlan { id: string; version: number; angaben: Planangaben; inhalt: PlanInhalt; aktualisiertAm: number; aktualisiertVon: string }
interface Hinweis { text: string; rueckgaengig?: boolean }
const BEDIENHINWEIS = "Pfeiltasten wählen Stellen, Enter oder F2 bearbeitet, N legt eine Unterstelle an, Entf löscht, Plus und Minus zoomen";
/** Sichtbar unter der Fläche (Entscheidung 9) — dieselben Befehle wie im `aria-label`, knapper. */
const BEDIENZEILE = "Pfeile wählen · Enter oder F2 bearbeitet · N neue Unterstelle · Entf löscht · Strg/Cmd+Z nimmt zurück";
/** Deckel der eingepassten Ansicht (Entscheidung 18): eine einzelne Karte nicht mit Maßstab 16. */
export const EDITOR_MASSSTAB = 4;
/**
 * Luft um eine gezeigte Karte: oben nur der übliche Rand (über einer Karte steht kein Griff); seitlich
 * 8 px + „+"-Knopf mit Symbol (rund 64 px) + 12 px; unten 8 px + Griffleiste, am Telefon zweizeilig
 * (2 × 44 + 8) + 16 px. Dieselben Zahlen gibt der Editor der Fläche fürs Einpassen (`platzSeite`,
 * `platzUnten`): eingepasst liegen die Griffe jeder Karte schon im Bild, `zeige()` verschiebt dann
 * nichts, und die Ansicht bleibt eingepasst (Entscheidung 18).
 */
export const GRIFF_RAND = { oben: 16, seite: 84, unten: 120 };

/** Die Vorfahren einer Stelle (ohne sie selbst) — zum Aufklappen, damit eine bearbeitete Stelle sichtbar bleibt. */
function vorfahren(p: PlanInhalt, id: string | null): string[] {
  const nachId = new Map(p.stellen.map((s) => [s.id, s]));
  const aus: string[] = [];
  let x = id === null ? undefined : nachId.get(id);
  while (x && x.eltern !== null) { aus.push(x.eltern); x = nachId.get(x.eltern); }
  return aus;
}

/**
 * DER DIAGRAMM-EDITOR (Spec §6.2–6.4, §6.6). Die Insel ist bis zum Neuladen die Quelle der Wahrheit:
 * aus den Props einmal gesät, über `key={plan.id}` an den Plan gebunden, kein `revalidatePath`. Beim
 * Montieren prüft sie den Serverstand (Entscheidung 21: nach Browser-Zurück sind die Props alt).
 *
 * - Jede Änderung ist eine reine Operation (`aendere`); `PlanFehler` wird ein Hinweis, kein Absturz.
 * - Rückgängig ist ein Stapel von Dokumenten (`verlauf.ts`); gespeichert wird über `speicherer.ts`,
 *   aufgerufen aus den Ereignis-Rückrufen, nie aus einem Effekt (`set-state-in-effect`).
 * - Das Layout rechnet aus `useDeferredValue` — Tippen bleibt auch an großen Plänen flüssig (Entscheidung 15).
 * - Linien blenden nur nach STRUKTURELLEN Änderungen neu ein (`linien`), nicht bei jedem Tastendruck.
 * - Hinweise stehen IN der Fläche und schließen nur bei X, beim nächsten Hinweis oder bei der nächsten
 *   strukturellen Änderung, nicht beim Tippen (Entscheidung 19).
 * - Nach Flyin-Schließen, Löschen und Rückgängig per Knopf hat die Fläche den Fokus (Entscheidung 17).
 * - Eine bearbeitete oder neue Stelle wird nie von einer eingeklappten Vorfahrin verdeckt: die
 *   Vorfahren werden aufgeklappt (ein Ansichtszustand, kein Rückgängig-Schritt).
 */
export function Editor({ plan, symbole: symboleStart, zeichenIndex, schrift }: {
  plan: EditorPlan; symbole: Symbolsatz; zeichenIndex: ZeichenIndexEintrag[]; schrift: string;
}) {
  const [verlauf, setVerlauf] = useState<Verlauf>(() => neuerVerlauf(plan.inhalt));
  const [angaben, setAngaben] = useState(plan.angaben);
  /** Zählt hoch, wenn Angaben VON AUSSEN kommen (Neu laden, Meine Fassung behalten, Serverstand) — keyt das Angaben-Formular neu. */
  const [angabenFremd, setAngabenFremd] = useState(0);
  const [auswahl, setAuswahl] = useState<string | null>(null);
  const [flyin, setFlyin] = useState<"stelle" | "plan" | null>(null);
  const [planAbschnitt, setPlanAbschnitt] = useState<"angaben" | "verbindungen">("angaben");
  const [fokus, setFokus] = useState<{ ziel: "titel" | "einheit"; stelle: string | null; n: number }>({ ziel: "titel", stelle: null, n: 0 });
  const [eingeklappt, setEingeklappt] = useState<ReadonlySet<string>>(() => new Set());
  const [hinweis, setHinweis] = useState<Hinweis | null>(null);
  const [symbole, setSymbole] = useState<Symbolsatz>(symboleStart);
  const [linien, setLinien] = useState(0);
  const [speicherZustand, setSpeicherZustand] = useState<SpeicherZustand>({ status: "gespeichert", version: plan.version, konflikt: null, zuletztGespeichert: null, fehler: null });
  const [speicherer] = useState(() => new Speicherer({
    planId: plan.id, version: plan.version, inhalt: plan.inhalt,
    senden: { inhalt: speichereInhaltAction, angaben: speichereAngabenAction }, melde: setSpeicherZustand,
  }));
  const flaeche = useRef<FlaecheGriff>(null);
  const titelRef = useRef<InputRef>(null);
  const zeigeNach = useRef<string | null>(null);
  const flyinJetzt = useRef(flyin);
  const angabenEntwurf = useRef(false);
  const kuerzel = useRef<{ rueck: () => void; wieder: () => void; pruefeStand: (s: Speicherstand) => void }>({ rueck: () => {}, wieder: () => {}, pruefeStand: () => {} });
  /** Schlüssel, deren SVG schon unterwegs ist: Server Actions laufen nacheinander, eine Suchsalve stellte sich sonst vor das Autosave. */
  const unterwegs = useRef(new Set<string>());

  const inhalt = verlauf.jetzt;
  const zeichenStand = useDeferredValue(inhalt);
  const daten = useMemo(() => layout(zeichenStand, "bildschirm", { eingeklappt }), [zeichenStand, eingeklappt]);
  const eintraege = useMemo(() => legende(inhalt, baueSicht(inhalt)), [inhalt]);
  const gewaehlt = auswahl !== null && inhalt.stellen.some((s) => s.id === auswahl) ? auswahl : null;
  const stelle = gewaehlt === null ? undefined : inhalt.stellen.find((s) => s.id === gewaehlt);
  const auswahlKarte = gewaehlt === null ? undefined : daten.karten.find((k) => k.id === gewaehlt);

  function klappeAuf(ids: string[]) {
    setEingeklappt((s) => {
      if (!ids.some((id) => s.has(id))) return s;
      const neu = new Set(s);
      for (const id of ids) neu.delete(id);
      return neu;
    });
  }
  function uebernimm(neu: Verlauf, strukturell: boolean) {
    if (neu === verlauf) return;
    setVerlauf(neu);
    speicherer.aendere(neu.jetzt);
    if (strukturell) { setLinien((n) => n + 1); setHinweis(null); }
  }
  const aendere: Aendere = (op, schluessel) => {
    let neu: PlanInhalt;
    try { neu = op(verlauf.jetzt); } catch (e) {
      if (e instanceof PlanFehler) { setHinweis({ text: e.message }); return e.message; }
      throw e;
    }
    // `new Date()` statt `Date.now()`: `react-hooks/purity` hält `aendere` für Render-Code (Vorbild lagerbuch/_ui/HelferRahmen.tsx).
    uebernimm(tue(verlauf, neu, new Date().getTime(), schluessel), schluessel === undefined);
    // z. B. nach dem Umhängen unter eine eingeklappte Stelle: die gewählte bleibt sichtbar
    if (gewaehlt !== null) klappeAuf(vorfahren(neu, gewaehlt));
    return null;
  };

  function ladeSymbole(schluessel: string[]) {
    const fehlen = [...new Set(schluessel)].filter((k) => !symbole[k] && !unterwegs.current.has(k)).slice(0, 40);
    if (fehlen.length === 0) return;
    for (const k of fehlen) unterwegs.current.add(k);
    void ladeZeichenAction(fehlen)
      .then((neu) => setSymbole((alt) => ({ ...alt, ...neu })))
      .catch(() => { /* Vorschau fehlt, Wahl geht trotzdem */ })
      .finally(() => { for (const k of fehlen) unterwegs.current.delete(k); });
  }
  function oeffne(id: string, ziel: "titel" | "einheit" = "titel") {
    setAuswahl(id);
    setFlyin("stelle");
    setFokus((f) => ({ ziel, stelle: id, n: f.n + 1 }));
    zeigeNach.current = id; // die Karte aus dem Bereich unter dem Flyin holen (Entscheidung 18)
    ladeSymbole(leseZuletzt());
  }
  function schliesseFlyin() {
    setFlyin(null);
    flaeche.current?.fokus(); // verlässt ein Angaben-Feld → es speichert (Entscheidung 3)
  }
  function lege(art: "unter" | "links" | "rechts" | "wurzel", eltern: string | null) {
    const id = neueId(inhalt, "s");
    const f = aendere((p) => art === "wurzel" ? fuegeWurzelEin(p, id)
      : art === "unter" ? fuegeUnterstelleEin(p, eltern!, id) : fuegeSeitenstelleEin(p, eltern!, art, id));
    if (f !== null) return;
    if (eltern !== null) klappeAuf([eltern, ...vorfahren(inhalt, eltern)]);
    oeffne(id);
  }
  function neueEinheit(stelleId: string) {
    if (aendere((p) => fuegeEinheitenEin(p, stelleId, [{ id: neueId(p, "e"), typ: "", rufname: "", zeichen: null }])) === null) oeffne(stelleId, "einheit");
  }
  function loesche(id: string) {
    const s = inhalt.stellen.find((x) => x.id === id);
    if (!s) return;
    const r = { entfernt: 0 };
    if (aendere((p) => { const x = loescheStelle(p, id); r.entfernt = x.entfernt; return x.inhalt; }) !== null) return;
    setAuswahl(s.eltern);
    setFlyin(null);
    flaeche.current?.fokus();
    const weitere = r.entfernt - 1;
    setHinweis({ rueckgaengig: true, text: `„${s.titel.trim() || "(ohne Titel)"}“ gelöscht${weitere > 0 ? ` samt ${weitere} ${weitere === 1 ? "weiterer Stelle" : "weiteren Stellen"}` : ""}.` });
  }
  function rueck() { if (kannRueckgaengig(verlauf)) uebernimm(rueckgaengig(verlauf), true); }
  function wieder() { if (kannWiederholen(verlauf)) uebernimm(wiederholen(verlauf), true); }
  function perKnopf(f: () => void) { f(); flaeche.current?.fokus(); }
  function pruefeStand(s: Speicherstand) {
    if (speicherer.pruefeStand(s) !== "uebernommen") return;
    if (s.inhalt === null) { window.location.reload(); return; }
    setVerlauf(neuerVerlauf(s.inhalt));
    setAngaben(s.angaben); setAngabenFremd((n) => n + 1);
    setLinien((n) => n + 1);
  }
  useEffect(() => { kuerzel.current = { rueck, wieder, pruefeStand }; flyinJetzt.current = flyin; });

  // Entscheidung 21: Serverstand beim Montieren — übernommen im `.then`, nie im Effekt-Rumpf.
  useEffect(() => {
    let aktiv = true;
    void ladeStandAction(plan.id).then((s) => { if (aktiv && s) kuerzel.current.pruefeStand(s); }).catch(() => { /* dann zeigt es das nächste Speichern */ });
    return () => { aktiv = false; };
  }, [plan.id]);

  // Strg/Cmd+Z global, aber nie in einem Textfeld (dort gehört es dem Feld).
  useEffect(() => {
    const beiTaste = (e: globalThis.KeyboardEvent) => {
      const b = globalerBefehl(e, istTextfeld(e.target));
      if (!b) return;
      e.preventDefault();
      if (b.art === "rueckgaengig") kuerzel.current.rueck(); else kuerzel.current.wieder();
    };
    document.addEventListener("keydown", beiTaste);
    return () => document.removeEventListener("keydown", beiTaste);
  }, []);

  // Ungespeichertes (auch ein Angaben-Feld, das noch nicht verlassen wurde) hält das Schließen auf (Entscheidung 11);
  // wieder online → sofort erneut senden.
  useEffect(() => {
    const warne = (e: BeforeUnloadEvent) => { if (speicherer.hatUngespeichertes() || angabenEntwurf.current) e.preventDefault(); };
    const online = () => { if (speicherer.zustand.status === "fehler") void speicherer.erneut(); };
    window.addEventListener("beforeunload", warne);
    window.addEventListener("online", online);
    return () => { window.removeEventListener("beforeunload", warne); window.removeEventListener("online", online); };
  }, [speicherer]);

  // Neue, per Pfeil gewählte oder im Flyin geöffnete Karte in den freien Bereich holen, sobald das Layout sie kennt.
  useEffect(() => {
    const id = zeigeNach.current;
    if (id === null) return;
    const k = daten.karten.find((x) => x.id === id);
    if (k) { zeigeNach.current = null; flaeche.current?.zeige(k, GRIFF_RAND); }
  }, [daten, gewaehlt, flyin]);

  function taste(e: KeyboardEvent<HTMLDivElement>): boolean {
    const b = flaechenBefehl(e);
    if (!b) return false;
    e.preventDefault();
    if (b.art === "wandere") {
      const z = wandere(inhalt, eingeklappt, gewaehlt, b.richtung);
      if (z !== null) { setAuswahl(z); zeigeNach.current = z; }
    } else if (b.art === "oeffnen") { if (gewaehlt) oeffne(gewaehlt); }
    else if (b.art === "neueUnterstelle") {
      if (stelle && stelle.lage !== "unter") setHinweis({ text: "Eine Seitenstelle trägt keine Unterstellen." });
      else if (stelle) lege("unter", stelle.id);
    } else if (b.art === "loeschen") { if (gewaehlt) loesche(gewaehlt); }
    else if (b.art === "abwaehlen") { setAuswahl(null); setFlyin(null); }
    return true;
  }
  function klick(id: string | null, doppelt: boolean) {
    if (id === null) { setAuswahl(null); return; }
    if (doppelt || (id === gewaehlt && flyin === null)) oeffne(id);
    else { setAuswahl(id); zeigeNach.current = id; } // jede Auswahl: Karte samt Griffen ins Bild (eingepasst: nichts zu tun)
  }
  function neuLaden() {
    const k = speicherZustand.konflikt;
    if (!k) return;
    if (k.inhalt === null) { window.location.reload(); return; }
    speicherer.uebernimm(k);
    setVerlauf(neuerVerlauf(k.inhalt));
    setAngaben(k.angaben); setAngabenFremd((n) => n + 1);
    setAuswahl(null); setFlyin(null); setHinweis(null);
    setLinien((n) => n + 1);
  }
  function behalten() {
    const k = speicherZustand.konflikt;
    if (!k) return;
    // Die Angaben sind nicht Teil „meiner Fassung": die der anderen gelten, sonst überschriebe ein späteres Speichern sie still.
    setAngaben(k.angaben); setAngabenFremd((n) => n + 1);
    void speicherer.behalteMeine();
  }
  async function speichereAngaben(a: Planangaben): Promise<SpeicherErgebnis> {
    const r = await speicherer.angaben(a);
    if (r.ok) setAngaben(angabenSchema.parse(a));
    return r;
  }
  async function drucken() {
    const ziel = `/p/${plan.id}/druck/a4`;
    const fenster = window.open("", "_blank"); // synchron im Klick, sonst greift der Popup-Blocker (Entscheidung 12)
    if (!(await speicherer.jetzt())) {
      fenster?.close();
      setHinweis({ text: "Vor dem Drucken ließ sich nicht speichern. Gedruckt wird immer der gespeicherte Stand — kläre erst den Hinweis." });
      return;
    }
    if (fenster) fenster.location.href = ziel; else window.open(ziel, "_self"); // Popup gesperrt: dann im selben Tab
  }
  const umschalten = (id: string) => setEingeklappt((s) => {
    const neu = new Set(s);
    if (neu.has(id)) neu.delete(id); else neu.add(id);
    return neu;
  });
  const oeffnePlan = (abschnitt: "angaben" | "verbindungen") => { setPlanAbschnitt(abschnitt); setFlyin("plan"); };
  const nachSchliessen = () => { if (flyinJetzt.current === null) flaeche.current?.fokus(); };

  const meldung = hinweis ? (
    <Alert type="warning" showIcon title={hinweis.text} closable={{ onClose: () => setHinweis(null) }}
      action={hinweis.rueckgaengig ? <Button onClick={() => perKnopf(rueck)}>Rückgängig</Button> : undefined} />
  ) : speicherZustand.status === "fehler" && speicherZustand.fehler ? (
    <Alert type="warning" showIcon title={speicherZustand.fehler}
      action={<Button onClick={() => void speicherer.erneut()}>Erneut versuchen</Button>} />
  ) : null;

  return (
    <div className="kp-editor">
      <Kopfleiste angaben={angaben} zustand={speicherZustand} standSeit={plan.aktualisiertAm}
        kannRueck={kannRueckgaengig(verlauf)} kannWieder={kannWiederholen(verlauf)}
        onRueck={() => perKnopf(rueck)} onWieder={() => perKnopf(wieder)}
        onPlan={() => oeffnePlan("angaben")} onDrucken={() => void drucken()}
        onNeuLaden={neuLaden} onBehalten={behalten} />
      <Flaeche daten={daten} symbole={symbole} titel={angaben.titel} schrift={schrift} bedienhinweis={BEDIENHINWEIS}
        griff={flaeche} gleitend linienSchluessel={String(linien)} maxMassstab={EDITOR_MASSSTAB} platzSeite={GRIFF_RAND.seite} platzUnten={GRIFF_RAND.unten}
        flyinGrund={flyin === "stelle" ? STELLE_FLYIN_GRUND : flyin === "plan" ? PLAN_FLYIN_GRUND : null}
        zusatz={(k) => <Umschalter k={k} onUmschalten={umschalten} />}
        onKarteKlick={klick} onTaste={taste} meldung={meldung}
        ueberlagerung={(a, f) => (auswahlKarte && stelle ? (
          <Griffe karte={auswahlKarte} ansicht={a} flaeche={f} seitenstelle={stelle.lage !== "unter"}
            onUnterstelle={() => lege("unter", stelle.id)} onSeitenstelle={(seite) => lege(seite, stelle.id)}
            onEinheit={() => neueEinheit(stelle.id)} onBearbeiten={() => oeffne(stelle.id)} />
        ) : null)}
        leer={<div className="kp-leer"><p>Dieser Plan hat noch keine Stellen.</p><Button type="primary" onClick={() => lege("wurzel", null)}>Erste Stelle anlegen</Button></div>}
        werkzeuge={eingeklappt.size > 0 ? <Button onClick={() => setEingeklappt(new Set())}>Alle ausklappen</Button> : null} />
      <p className="kp-hilfe kp-bedienhinweis">{BEDIENZEILE}</p>
      <Legende eintraege={eintraege} />
      <Button onClick={() => oeffnePlan("verbindungen")}>Verbindungen bearbeiten</Button>
      {gewaehlt !== null ? (
        <StelleFlyin offen={flyin === "stelle"} onSchliessen={schliesseFlyin} nachSchliessen={nachSchliessen} inhalt={inhalt} stelleId={gewaehlt} aendere={aendere}
          symbole={symbole} zeichenIndex={zeichenIndex} ladeSymbole={ladeSymbole} fokus={fokus} titelRef={titelRef}
          onLoeschen={() => loesche(gewaehlt)} onFertig={schliesseFlyin} />
      ) : null}
      <PlanFlyin key={angabenFremd} offen={flyin === "plan"} onSchliessen={schliesseFlyin} nachSchliessen={nachSchliessen} abschnitt={planAbschnitt}
        angaben={angaben} inhalt={inhalt} aendere={aendere} speichereAngaben={speichereAngaben}
        onEntwurf={(offen) => { angabenEntwurf.current = offen; }} />
    </div>
  );
}
