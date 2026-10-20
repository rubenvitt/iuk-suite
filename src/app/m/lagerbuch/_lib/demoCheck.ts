/**
 * DER DEMO-CHECK — IDA-224, voruebergehend fuer die Kommandositzung am
 * 20.10.2026 (Rueckbau: IDA-225).
 *
 * Jeder kann unter `/demo` ohne Code den Fahrzeug-Check an einer Vorlage
 * ausprobieren. Das Demo-Fahrzeug gibt es NUR IM SPEICHER: keine Zeile in
 * `lagerorte`, also taucht es in keiner Liste auf, ohne dass irgendwo ein Filter
 * noetig waere. Der Abschluss rechnet das Ergebnis aus und schreibt NICHTS.
 *
 * Kein "use client" und keine Datenbank: die Check-Insel (`_ui/CheckFlow.tsx`)
 * und der Route Handler (`demo/abschluss/route.ts`) lesen dieselbe Datei.
 */
import { z } from "zod";
import type { CheckAbschlussWert } from "../_actions/check";
import type { HelferErgebnis } from "./actionTypen";
import { zaehleAblaufende } from "./checkNutzlast";
import { offenJeArtikel } from "./domain/check";
import { o2Status } from "./domain/o2";
import { ueberschuss } from "./domain/sollBereich";
import { plombenNummerNorm } from "./plombe";
import type { VerfallSchwellen } from "./domain/verfall";
import { MONAT_REGEX, ZUSTAENDE, ZUSTAND_DEFEKT } from "./konstanten";

/** AEUSSERE Pfade (Lagerbuch-Host); innen `/m/lagerbuch/demo…`. */
export const DEMO_PFAD = "/demo";
export const DEMO_ABSCHLUSS_PFAD = "/demo/abschluss";

/** Die Id des Demo-Fahrzeugs. Es gibt keine Zeile dazu — nur der Seed der Stichprobe liest sie. */
export const DEMO_FAHRZEUG_ID = "demo-check";

export const DEMO_EINGABE_TEXT =
  "Die Eingabe passt nicht zur Demo. Bitte die Seite neu laden und erneut abschließen.";
export const DEMO_BEENDET_TEXT = "Die Demo ist beendet.";

/** IDA-248: die eine Plombe des Demo-Fahrzeugs, über der Medikamententasche. */
export type DemoPlombe = { id: string; bezeichnung: string; fachLabel: string; nummer: string };

/** Was der Abschluss von der Nutzlast liest — seit IDA-248 auch Plomben, Geräte und Flaschen. */
export const DemoNutzlastSchema = z.object({
  art: z.enum(["kurz", "voll"]).default("voll"),
  plomben: z.array(z.object({
    plombeId: z.string().min(1).max(64),
    nummer: z.string().trim().max(64).nullable(),
  })).max(20).default([]),
  geraete: z.array(z.object({
    geraetId: z.string().min(1).max(64),
    vorhanden: z.boolean(),
    zustand: z.enum(ZUSTAENDE).optional(),
  })).max(200).default([]),
  flaschen: z.array(z.object({
    flascheId: z.string().min(1).max(64),
    druckBar: z.number().int().min(0).max(1_000),
  })).max(200).default([]),
  positionen: z.array(z.object({
    sollPositionId: z.string().min(1).max(64),
    ist: z.number().int().min(0).max(100_000),
    nachfuellMenge: z.number().int().min(0).max(100_000),
    boxMenge: z.number().int().min(0).max(100_000).default(0),
  })).max(2_000).default([]),
  verfaelle: z.array(z.object({
    artikelId: z.string().min(1).max(64),
    verfall: z.string().regex(MONAT_REGEX).nullable(),
  })).max(2_000).default([]),
});
export type DemoNutzlast = z.infer<typeof DemoNutzlastSchema>;

/**
 * Das Ergebnis, das der echte Abschluss (`_actions/check.ts`, `checkAbschluss`)
 * melden wuerde — je Artikel abgeglichen, Nachfuellung auf `soll − ist`
 * geklemmt. Das Demo-Handlager hat immer genug (die Seite zeigt Soll als
 * Handlagerbestand), also ist alles Bestaetigte auch nachgefuellt.
 *
 * `null`, wenn eine Position oder ein Artikel nicht zur Vorlage gehoert.
 */
export function demoErgebnis(
  v: DemoNutzlast,
  daten: {
    soll: readonly { id: string; artikelId: string; fachLabel: string; soll: number; sollMax?: number | null }[];
    plombe: DemoPlombe;
    geraete: readonly { id: string }[];
    flaschen: readonly { id: string; nennfuelldruckBar: number; wechselAbProzent: number }[];
    verfall: Readonly<Record<string, string>>;
  },
  schwellen: VerfallSchwellen,
  now: Date,
): CheckAbschlussWert | null {
  const { soll } = daten;
  const byId = new Map(soll.map((p) => [p.id, p]));
  const artikelIds = new Set(soll.map((p) => p.artikelId));
  const gruppen = new Map<string, { sollSumme: number; istSumme: number; nachfuell: number; box: number }>();
  for (const p of v.positionen) {
    const row = byId.get(p.sollPositionId);
    if (!row) return null;
    const g = gruppen.get(row.artikelId) ?? { sollSumme: 0, istSumme: 0, nachfuell: 0, box: 0 };
    g.sollSumme += row.soll;
    g.istSumme += p.ist;
    g.nachfuell += Math.min(p.nachfuellMenge, Math.max(0, row.soll - p.ist));
    // IDA-247: dieselbe Klemmung wie im echten Abschluss.
    g.box += Math.min(p.boxMenge, ueberschuss(p.ist, row.soll, row.sollMax));
    gruppen.set(row.artikelId, g);
  }
  if (v.verfaelle.some((e) => !artikelIds.has(e.artikelId))) return null;

  /*
   * IDA-248 — PLOMBE, GERAETE, FLASCHEN, mit denselben Regeln wie
   * `checkAbschluss`: fremde Ids sind ein Eingabefehler, eine offene Plombe
   * verlangt ihr gezaehltes Fach, defekt oder fehlend ist auffaellig, eine
   * Flasche ohne Nennfuelldruck ist nicht bewertbar.
   */
  let plombenOffen = 0;
  let plombenGesetzt = 0;
  for (const e of v.plomben) {
    if (e.plombeId !== daten.plombe.id) return null;
    if (v.art === "kurz") {
      const intakt = e.nummer !== null
        && plombenNummerNorm(e.nummer) === plombenNummerNorm(daten.plombe.nummer);
      if (!intakt) {
        plombenOffen++;
        const gezaehlt = new Set(v.positionen.map((p) => p.sollPositionId));
        if (soll.some((p) => p.fachLabel === daten.plombe.fachLabel && !gezaehlt.has(p.id))) return null;
      }
    } else if (e.nummer) {
      plombenGesetzt++;
    }
  }
  const geraetIds = new Set(daten.geraete.map((g) => g.id));
  let geraeteAuffaellig = 0;
  for (const e of v.geraete) {
    if (!geraetIds.has(e.geraetId)) return null;
    if (!e.vorhanden || e.zustand === ZUSTAND_DEFEKT) geraeteAuffaellig++;
  }
  const flaschenById = new Map(daten.flaschen.map((f) => [f.id, f]));
  let flaschenAuffaellig = 0;
  let flaschenNichtBewertbar = 0;
  for (const e of v.flaschen) {
    const f = flaschenById.get(e.flascheId);
    if (!f) return null;
    if (f.nennfuelldruckBar <= 0) flaschenNichtBewertbar++;
    else if (o2Status(e.druckBar, f.nennfuelldruckBar, f.wechselAbProzent).niedrig) flaschenAuffaellig++;
  }

  let nachgefuellt = 0;
  let inBox = 0;
  let offen = 0;
  for (const g of gruppen.values()) {
    nachgefuellt += g.nachfuell;
    inBox += g.box;
    offen += offenJeArtikel({
      sollSumme: g.sollSumme, istSumme: g.istSumme, nachfuellGebucht: g.nachfuell, boxGebucht: g.box,
    });
  }
  return {
    checkId: DEMO_FAHRZEUG_ID,
    nachgefuellt,
    nachfuellBestaetigt: nachgefuellt,
    inBox,
    offen,
    geraeteAuffaellig,
    flaschenAuffaellig,
    flaschenNichtBewertbar,
    // Wie im Ernstfall der GANZE Stand nach dem Check: die Vorbelegung, darueber
    // das Gemeldete (`null` loescht eine Angabe).
    verfallAuffaellig: zaehleAblaufende(
      { ...daten.verfall, ...Object.fromEntries(v.verfaelle.map((e) => [e.artikelId, e.verfall])) },
      schwellen, now),
    plombenOffen,
    plombenGesetzt,
  };
}

/**
 * Der Abschluss aus der Insel heraus: ein POST an den Route Handler statt der
 * Server Action. So ist „Demo aus" auch hier ein echtes HTTP 404.
 *
 * ⚠️ NIE `grund: "sitzung"`: der Check zeigte sonst das Kärtchen-Feld, und
 * dessen Erneuerung setzt ein Helfer-Cookie. Ein Netzfehler wirft und landet im
 * `catch` des Flows (Grund `netz`).
 */
export async function demoAbschluss(nutzlast: unknown): Promise<HelferErgebnis<CheckAbschlussWert>> {
  const antwort = await fetch(DEMO_ABSCHLUSS_PFAD, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(nutzlast),
  });
  if (antwort.status === 404) return { ok: false, grund: "eingabe", text: DEMO_BEENDET_TEXT };
  if (!antwort.ok) throw new Error(`Demo-Abschluss: HTTP ${antwort.status}`);
  return (await antwort.json()) as HelferErgebnis<CheckAbschlussWert>;
}
