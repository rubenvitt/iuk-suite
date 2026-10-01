"use client";

import { useDeferredValue, useEffect, useMemo, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";
import { Alert, Button, type InputRef } from "antd";
import { flyinBreite } from "@/core/theme/flyin";
import { ladeStandAction, speichereAngabenAction, speichereInhaltAction } from "../../_actions/plan";
import { ladeZeichenAction } from "../../_actions/zeichen";
import { angabenSchema, type Planangaben } from "../../_lib/angaben";
import { LEERE_BIBLIOTHEK, type Bibliothek } from "../../_lib/bibliothek/typen";
import { adresseMitAnsicht, SCHMAL, sichtbareAnsicht, type EditorAnsicht } from "../../_lib/editorAnsicht";
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
import { druckZiel, type DruckWahl } from "../druck/DruckMenue";
import { Gliederung, type GliederungGriff } from "../gliederung/Gliederung";
import { SymbolDefs, type Symbolsatz } from "../zeichnung/Symbole";
import type { Aendere } from "./aendere";
import { BibliothekAnbieter } from "./bibliothekKontext";
import { AUSWAHLLEISTE, Griffe } from "./Griffe";
import { neueId } from "./ids";
import { Kopfleiste, statusText, VERLAUFSKNOPF } from "./Kopfleiste";
import { wandere } from "./navigation";
import { PLAN_FLYIN_GRUND, PlanFlyin } from "./PlanFlyin";
import { Speicherer, type SpeicherZustand } from "./speicherer";
import { STELLE_FLYIN_GRUND, StelleFlyin } from "./StelleFlyin";
import { flaechenBefehl, globalerBefehl, istTextfeld } from "./tasten";
import { kannRueckgaengig, kannWiederholen, neuerVerlauf, rueckgaengig, tue, verwirf, wiederholen, type Verlauf } from "./verlauf";
import { leseZuletzt } from "./zuletzt";

export interface EditorPlan { id: string; version: number; angaben: Planangaben; inhalt: PlanInhalt; aktualisiertAm: number; aktualisiertVon: string }
/** `nach`: der Stand direkt nach dem Löschen — „Rückgängig“ im Hinweis gilt nur, solange genau er der jetzige ist. */
/** `bestaetigt`: eine Erfolgsmeldung (grün statt Warnstil) — bisher nur der Kopie-Hinweis mit ersetztem Datum. */
interface Hinweis { text: string; nach?: PlanInhalt; aktion?: HinweisAktion; bestaetigt?: boolean }
/** Ein Knopf im Hinweis statt „Rückgängig“ (Phase 4: „Angaben ändern“ nach dem Duplizieren, „Angaben übernehmen“ nach dem Einfügen). */
export interface HinweisAktion { text: string; tu(): void }
/** Ein per Griff angelegtes, noch unberührtes Element: Esc/X verwirft es wieder (Review Phase 2). */
interface Angelegt { nach: PlanInhalt; stelle: string; zurueck: string | null }
const BEDIENHINWEIS = "Pfeiltasten wählen Stellen, Enter oder F2 bearbeitet, N legt eine Unterstelle an, Entf löscht, Plus und Minus zoomen";
/** Sichtbar unter der Fläche (Entscheidung 9) — dieselben Befehle wie im `aria-label`, knapper. */
const BEDIENZEILE = "Pfeile wählen · Enter oder F2 bearbeitet · N neue Unterstelle · Entf löscht · Strg/Cmd+Z nimmt zurück";
/** Deckel der eingepassten Ansicht (Entscheidung 18): eine einzelne Karte nicht mit Maßstab 16. */
export const EDITOR_MASSSTAB = 4;
/**
 * Luft um eine gezeigte Karte (Phase 3, Entscheidung 18; Phase 4, Entscheidung 15): oben die Auswahlleiste
 * (`AUSWAHLLEISTE`) plus 8 px, seitlich nur der Auswahlrahmen (4 px außen) plus Luft, unten der Meldungsplatz
 * (12 px + eine Alert-Zeile + Luft). Dieselben Zahlen gibt der Editor der Fläche fürs Einpassen (`platzOben`,
 * `platzSeite`, `platzUnten`): eingepasst liegt die Leiste über keiner Karte, `zeige()` verschiebt nichts,
 * die Ansicht bleibt eingepasst (Phase 2, Entscheidung 18); gezoomt hält `zeige()` die Karte unter der Leiste.
 */
export const GRIFF_RAND = { oben: AUSWAHLLEISTE.abstand + AUSWAHLLEISTE.hoehe + 8, seite: 16, unten: 72 };

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
 *   strukturellen Änderung, nicht beim Tippen (Entscheidung 19). „Rückgängig“ im Lösch-Hinweis steht
 *   nur, solange die Löschung der letzte Schritt ist — sonst nähme er etwas anderes zurück.
 * - Esc/X nach einem Griff ohne jede Eingabe verwirft das leere Element wieder; Enter behält es.
 * - Nach Flyin-Schließen, Löschen und Rückgängig per Knopf hat die Fläche den Fokus (Entscheidung 17).
 * - Eine bearbeitete oder neue Stelle wird nie von einer eingeklappten Vorfahrin verdeckt: die
 *   Vorfahren werden aufgeklappt (ein Ansichtszustand, kein Rückgängig-Schritt).
 * - Zwei Ansichten auf denselben Zustand (Phase 3): Diagramm und Gliederung bleiben montiert;
 *   `data-editoransicht` und CSS entscheiden, was zu sehen ist; Fokus kehrt über `fokusZurueck` in die sichtbare zurück.
 */
export function Editor({ plan, symbole: symboleStart, zeichenIndex, schrift, schriftKlasse, ansicht: ansichtStart = null, kopieHinweis, bibliothek = LEERE_BIBLIOTHEK }: {
  plan: EditorPlan; symbole: Symbolsatz; zeichenIndex: ZeichenIndexEintrag[]; schrift: string;
  /** Aus `?ansicht=`; `null` = CSS wählt am Breakpoint (Phase 3, Entscheidung 1). */
  ansicht?: EditorAnsicht | null;
  /** Klasse der Zeichenschrift (next/font) — nur für die Legende, wie im Betrachter; der Rest steht in der Suite-Schrift. */
  schriftKlasse?: string;
  /** Nach „Duplizieren“ (`?kopie=<art>`, Phase 4, Entscheidung 9; Text aus `kopieHinweis`): einmal angezeigt, mit „Angaben ändern“. */
  kopieHinweis?: { text: string; bestaetigt: boolean };
  /** Die Bibliothek für Kopien in den Plan (Phase 4, Entscheidung 13); nur für Bearbeitende geladen. */
  bibliothek?: Bibliothek;
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
  const [hinweis, setHinweis] = useState<Hinweis | null>(() => (kopieHinweis
    ? { text: kopieHinweis.text, bestaetigt: kopieHinweis.bestaetigt, aktion: { text: "Angaben ändern", tu: () => { setPlanAbschnitt("angaben"); setFlyin("plan"); } } }
    : null));
  // `?kopie=` aus der Adresse nehmen (ohne setState): ein Neuladen zeigt den Kopie-Hinweis nicht noch einmal.
  useEffect(() => {
    if (!kopieHinweis) return;
    const adresse = new URL(window.location.href);
    if (!adresse.searchParams.has("kopie")) return;
    adresse.searchParams.delete("kopie");
    window.history.replaceState(window.history.state, "", adresse.toString());
  }, [kopieHinweis]);
  const [symbole, setSymbole] = useState<Symbolsatz>(symboleStart);
  const [linien, setLinien] = useState(0);
  const [ansicht, setAnsicht] = useState<EditorAnsicht | null>(ansichtStart);
  const [speicherZustand, setSpeicherZustand] = useState<SpeicherZustand>({ status: "gespeichert", version: plan.version, konflikt: null, zuletztGespeichert: null, fehler: null });
  const [speicherer] = useState(() => new Speicherer({
    planId: plan.id, version: plan.version, inhalt: plan.inhalt,
    senden: { inhalt: speichereInhaltAction, angaben: speichereAngabenAction }, melde: setSpeicherZustand,
  }));
  const flaeche = useRef<FlaecheGriff>(null);
  const gliederung = useRef<GliederungGriff>(null);
  const wurzel = useRef<HTMLDivElement>(null);
  const titelRef = useRef<InputRef>(null);
  const zeigeNach = useRef<string | null>(null);
  const flyinJetzt = useRef(flyin);
  const angabenEntwurf = useRef(false);
  const angelegt = useRef<Angelegt | null>(null);
  const kuerzel = useRef<{ rueck: () => void; wieder: () => void; pruefeStand: (s: Speicherstand) => void; nachTaste: () => void }>({ rueck: () => {}, wieder: () => {}, pruefeStand: () => {}, nachTaste: () => {} });
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
  /** Fehlt die gewählte Stelle im neuen Stand, ist auch ihr Flyin zu — sonst öffnete die nächste Auswahl es wieder (Review Phase 2). */
  function pruefeAuswahl(neu: PlanInhalt) {
    if (auswahl === null || neu.stellen.some((s) => s.id === auswahl)) return;
    setAuswahl(null);
    if (flyin === "stelle") setFlyin(null);
  }
  function uebernimm(neu: Verlauf, strukturell: boolean) {
    if (neu === verlauf) return;
    setVerlauf(neu);
    speicherer.aendere(neu.jetzt);
    pruefeAuswahl(neu.jetzt);
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
  /** Welche Ansicht zu sehen ist — zur EREIGNISZEIT gefragt, nie im Rendern (Phase 3, Entscheidung 16). */
  function schmal(): boolean { return typeof window.matchMedia === "function" && window.matchMedia(SCHMAL).matches; }
  function sichtbar(): EditorAnsicht { return sichtbareAnsicht(ansicht, schmal()); }
  /**
   * Fokus zurück in die sichtbare Ansicht: die Fläche oder die Zeile (Phase 2, Entscheidung 17; Phase 3,
   * Entscheidung 16). In der Zeile schmal auf „⋯" — ein Titelfeld öffnete am Telefon die Bildschirmtastatur —,
   * breit in den Titel.
   */
  function fokusZurueck(id: string | null = gewaehlt) {
    if (sichtbar() === "diagramm") { flaeche.current?.fokus(); return; }
    gliederung.current?.fokus(id, schmal() ? "aktionen" : "titel");
  }
  function wechsleAnsicht(a: EditorAnsicht) {
    gliederung.current?.raeumeAuf(); // ein unberührt angelegtes Element verschwindet (Entscheidung 8)
    setAnsicht(a);
    // Ein reiner Bedienhinweis gehört zur Tastenaktion der anderen Ansicht; einer mit „Rückgängig“ bleibt (Review Phase 3).
    setHinweis((h) => (h?.nach !== undefined ? h : null));
    try { window.history.replaceState(null, "", adresseMitAnsicht(window.location.href, a)); } catch { /* ohne Adresse bleibt es Zustand */ }
    if (gewaehlt === null) return;
    const id = gewaehlt;
    if (a === "diagramm") zeigeNach.current = id;
    else requestAnimationFrame(() => gliederung.current?.zeige(id));
  }
  function schliesseFlyin() {
    angelegt.current = null;
    setFlyin(null);
    fokusZurueck(); // verlässt ein Angaben-Feld → es speichert (Entscheidung 3)
  }
  /** Esc/X am Flyin einer Stelle: ein eben per Griff angelegtes, unberührtes Element war ein Fehlgriff. */
  function brecheAb() {
    const a = angelegt.current;
    if (a && a.stelle === gewaehlt && a.nach === verlauf.jetzt) {
      uebernimm(verwirf(verlauf), true);
      setAuswahl(a.zurueck);
    }
    schliesseFlyin();
  }
  /** Führt eine Operation aus und liefert den neuen Stand (oder `null` bei `PlanFehler`). */
  function tueMit(op: (p: PlanInhalt) => PlanInhalt): PlanInhalt | null {
    let nach: PlanInhalt | null = null;
    return aendere((p) => (nach = op(p))) === null ? nach : null;
  }
  function lege(art: "unter" | "links" | "rechts" | "wurzel", eltern: string | null) {
    const id = neueId(inhalt, "s");
    const nach = tueMit((p) => art === "wurzel" ? fuegeWurzelEin(p, id)
      : art === "unter" ? fuegeUnterstelleEin(p, eltern!, id) : fuegeSeitenstelleEin(p, eltern!, art, id));
    if (nach === null) return;
    if (eltern !== null) klappeAuf([eltern, ...vorfahren(inhalt, eltern)]);
    oeffne(id);
    angelegt.current = { nach, stelle: id, zurueck: eltern };
  }
  function neueEinheit(stelleId: string) {
    const nach = tueMit((p) => fuegeEinheitenEin(p, stelleId, [{ id: neueId(p, "e"), typ: "", rufname: "", zeichen: null }]));
    if (nach === null) return;
    oeffne(stelleId, "einheit");
    angelegt.current = { nach, stelle: stelleId, zurueck: stelleId };
  }
  function loesche(id: string) {
    const s = inhalt.stellen.find((x) => x.id === id);
    if (!s) return;
    const r = { entfernt: 0 };
    const nach = tueMit((p) => { const x = loescheStelle(p, id); r.entfernt = x.entfernt; return x.inhalt; });
    if (nach === null) return;
    setAuswahl(s.eltern);
    setFlyin(null);
    fokusZurueck(s.eltern);
    const weitere = r.entfernt - 1;
    setHinweis({ nach, text: `„${s.titel.trim() || "(ohne Titel)"}“ gelöscht${weitere > 0 ? ` samt ${weitere} ${weitere === 1 ? "weiterer Stelle" : "weiteren Stellen"}` : ""}.` });
  }
  function rueck() { if (kannRueckgaengig(verlauf)) uebernimm(rueckgaengig(verlauf), true); }
  function wieder() { if (kannWiederholen(verlauf)) uebernimm(wiederholen(verlauf), true); }
  /** Strg/Cmd+Z mit Fokus auf `body` und sichtbarer Gliederung: zurück in die Zeile (Phase 3, Entscheidung 10). */
  function nachTaste() {
    if (typeof document === "undefined" || (document.activeElement !== null && document.activeElement !== document.body)) return;
    if (sichtbar() === "gliederung") gliederung.current?.fokus(gewaehlt);
  }
  function perKnopf(f: () => void) { f(); fokusZurueck(); }
  /** Rückgängig/Wiederholen per Knopf: ein unberührt angelegtes Element nimmt der Knopf selbst zurück (Review Phase 3). */
  function perVerlaufsknopf(f: () => void) { gliederung.current?.vergiss(); perKnopf(f); }
  function pruefeStand(s: Speicherstand) {
    if (speicherer.pruefeStand(s) !== "uebernommen") return;
    if (s.inhalt === null) { window.location.reload(); return; }
    setVerlauf(neuerVerlauf(s.inhalt));
    pruefeAuswahl(s.inhalt);
    setAngaben(s.angaben); setAngabenFremd((n) => n + 1);
    setLinien((n) => n + 1);
  }
  useEffect(() => { kuerzel.current = { rueck, wieder, pruefeStand, nachTaste }; flyinJetzt.current = flyin; });

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
      kuerzel.current.nachTaste();
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

  // Abbau (Client-Navigation weg vom Editor, z. B. „Alle Pläne"): Wartendes sofort senden, statt einen
  // Autosave-Timer zurückzulassen, der erst nach dem Verlassen feuert.
  useEffect(() => () => { void speicherer.jetzt(); }, [speicherer]);

  // Höhe der Fläche (Review Phase 2): sie endet am unteren Bildrand, egal wie hoch Kopfleiste und
  // Werkzeuge darüber umbrechen — sonst lagen die Hinweise unten in der Fläche am Tablet und Telefon
  // (und bei offenem Flyin, das die Kopfleiste umbricht) unter dem Bildrand. Gemessen wird der
  // Abstand der Fläche vom Dokumentanfang, bei jeder Größenänderung (die Hülle bricht nach `load` um).
  useEffect(() => {
    const el = wurzel.current;
    if (!el) return;
    const messe = () => {
      const f = el.querySelector<HTMLElement>(".kp-betrachter");
      if (f) el.style.setProperty("--kp-flaeche-oben", `${Math.round(f.getBoundingClientRect().top + window.scrollY)}px`);
    };
    messe();
    const beobachter = new ResizeObserver(messe);
    beobachter.observe(el);
    window.addEventListener("resize", messe);
    return () => { beobachter.disconnect(); window.removeEventListener("resize", messe); };
  }, []);

  // Ein neuer Hinweis steht im Bild (Review Phase 2): am Telefon reicht die Fläche unter den Rand,
  // weil die Kopfleiste untereinander steht. „nearest“: liegt er schon im Bild, rollt nichts.
  const meldungText = hinweis?.text ?? (speicherZustand.status === "fehler" ? speicherZustand.fehler : null);
  useEffect(() => {
    if (meldungText === null) return;
    wurzel.current?.querySelector<HTMLElement>(".kp-meldungsplatz")?.scrollIntoView?.({ block: "nearest" });
  }, [meldungText]);

  // Neue, per Pfeil gewählte oder im Flyin geöffnete Karte in den freien Bereich holen, sobald das Layout sie kennt.
  useEffect(() => {
    const id = zeigeNach.current;
    if (id === null) return;
    const k = daten.karten.find((x) => x.id === id);
    if (k) { zeigeNach.current = null; flaeche.current?.zeige(k, GRIFF_RAND); }
  }, [daten, gewaehlt, flyin, ansicht]);

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
    if (id === null) { setAuswahl(null); if (flyin === "stelle") setFlyin(null); return; }
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
  async function drucken(wahl: DruckWahl) {
    const ziel = druckZiel(`/p/${plan.id}`, wahl);
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
  const nachSchliessen = () => { if (flyinJetzt.current === null) fokusZurueck(); };

  const meldung = hinweis ? (
    <Alert type={hinweis.bestaetigt ? "success" : "warning"} showIcon title={hinweis.text} closable={{ onClose: () => setHinweis(null) }}
      // Erst schließen, dann tun: meldet die Aktion selbst etwas (ein Fehler aus `aendere`), bleibt das stehen.
      action={hinweis.aktion ? <Button onClick={() => { const a = hinweis.aktion!; setHinweis(null); a.tu(); }}>{hinweis.aktion.text}</Button>
        : hinweis.nach !== undefined && hinweis.nach === verlauf.jetzt ? <Button onClick={() => perKnopf(rueck)}>Rückgängig</Button> : undefined} />
  ) : speicherZustand.status === "fehler" && speicherZustand.fehler ? (
    <Alert type="warning" showIcon title={speicherZustand.fehler}
      action={<Button onClick={() => void speicherer.erneut()}>Erneut versuchen</Button>} />
  ) : null;

  const flyinGrund = flyin === "stelle" && gewaehlt !== null ? STELLE_FLYIN_GRUND : flyin === "plan" ? PLAN_FLYIN_GRUND : null;
  // Ein offenes Flyin hält seine Breite im Seitenfluss frei (CSS `.kp-editor[data-flyin]`, ab Tablet):
  // sonst läge es über der rechtsbündigen Kopfleiste und dem Konflikthinweis (e2e, Phase 2).
  const flyinStil = flyinGrund === null ? undefined : ({ "--kp-flyin-breite": flyinBreite(flyinGrund) } as CSSProperties);

  return (
    <BibliothekAnbieter start={bibliothek}>
      <div ref={wurzel} className="kp-editor" data-editoransicht={ansicht ?? "auto"} data-flyin={flyinGrund === null ? undefined : flyin ?? undefined} style={flyinStil}>
        {/* Der Symbolvorrat EINMAL für Zeichnung, Flyin und Gliederung, außerhalb jeder Ansicht (Phase 3,
            Entscheidung 17): eine verborgene Ansicht verbärge sonst die Vorschauen, zwei Vorräte gäben doppelte IDs (M11). */}
        <svg className="kp-symbolvorrat" aria-hidden="true" focusable="false" width={0} height={0} style={{ position: "absolute" }}>
          <SymbolDefs symbole={symbole} />
        </svg>
        <Kopfleiste angaben={angaben} zustand={speicherZustand} standSeit={plan.aktualisiertAm}
          kannRueck={kannRueckgaengig(verlauf)} kannWieder={kannWiederholen(verlauf)} ansicht={ansicht} onAnsicht={wechsleAnsicht}
          onRueck={() => perVerlaufsknopf(rueck)} onWieder={() => perVerlaufsknopf(wieder)}
          onPlan={() => oeffnePlan("angaben")} onDrucken={(w) => void drucken(w)}
          onNeuLaden={neuLaden} onBehalten={behalten} />
        <div className="kp-ansicht-diagramm">
          <Flaeche daten={daten} symbole={symbole} titel={angaben.titel} schrift={schrift} bedienhinweis={BEDIENHINWEIS}
            griff={flaeche} gleitend linienSchluessel={String(linien)} maxMassstab={EDITOR_MASSSTAB} platzOben={GRIFF_RAND.oben} platzSeite={GRIFF_RAND.seite} platzUnten={GRIFF_RAND.unten}
            flyinGrund={flyinGrund} defs={false}
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
          <div className={schriftKlasse}><Legende eintraege={eintraege} /></div>
          <Button onClick={() => oeffnePlan("verbindungen")}>Verbindungen bearbeiten</Button>
        </div>
        <div className="kp-ansicht-gliederung">
          <Gliederung griff={gliederung} inhalt={inhalt} auswahl={gewaehlt} aendere={aendere} meldung={meldung}
            onAuswahl={setAuswahl} onDetails={(id) => oeffne(id)} onLoeschen={loesche}
            onRueck={rueck} onWieder={wieder} onHinweis={(text, aktion?: HinweisAktion) => setHinweis({ text, aktion })}
            verwirfUnberuehrt={(nach, dann) => {
              if (verlauf.jetzt !== nach) return null;
              const w = verwirf(verlauf);
              const x = dann ? tue(w, dann(w.jetzt), new Date().getTime()) : w;
              uebernimm(x, true);
              return x.jetzt;
            }}
            symbole={symbole} zeichenIndex={zeichenIndex} ladeSymbole={ladeSymbole} />
        </div>
        <div className="kp-verlaufsleiste kp-nur-schmal" role="toolbar" aria-label="Verlauf">
          <span className="kp-verlaufsstatus" role="status" aria-live="polite">{statusText(speicherZustand)}</span>
          <Button {...VERLAUFSKNOPF} onClick={() => perVerlaufsknopf(rueck)} disabled={!kannRueckgaengig(verlauf)}>Rückgängig</Button>
        </div>
        {gewaehlt !== null ? (
          <StelleFlyin offen={flyin === "stelle"} onSchliessen={brecheAb} nachSchliessen={nachSchliessen} inhalt={inhalt} stelleId={gewaehlt} aendere={aendere}
            symbole={symbole} zeichenIndex={zeichenIndex} ladeSymbole={ladeSymbole} fokus={fokus} titelRef={titelRef}
            onLoeschen={() => loesche(gewaehlt)} onFertig={schliesseFlyin} />
        ) : null}
        <PlanFlyin key={angabenFremd} offen={flyin === "plan"} onSchliessen={schliesseFlyin} nachSchliessen={nachSchliessen} abschnitt={planAbschnitt}
          angaben={angaben} inhalt={inhalt} aendere={aendere} speichereAngaben={speichereAngaben}
          onEntwurf={(offen) => { angabenEntwurf.current = offen; }} />
      </div>
    </BibliothekAnbieter>
  );
}
