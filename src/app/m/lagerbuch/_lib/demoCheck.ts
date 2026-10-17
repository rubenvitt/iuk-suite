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
import type { VerfallSchwellen } from "./domain/verfall";
import { MONAT_REGEX } from "./konstanten";

/** AEUSSERE Pfade (Lagerbuch-Host); innen `/m/lagerbuch/demo…`. */
export const DEMO_PFAD = "/demo";
export const DEMO_ABSCHLUSS_PFAD = "/demo/abschluss";

/** Die Id des Demo-Fahrzeugs. Es gibt keine Zeile dazu — nur der Seed der Stichprobe liest sie. */
export const DEMO_FAHRZEUG_ID = "demo-check";

export const DEMO_EINGABE_TEXT =
  "Die Eingabe passt nicht zur Demo. Bitte die Seite neu laden und erneut abschließen.";
export const DEMO_BEENDET_TEXT = "Die Demo ist beendet.";

/** Was der Abschluss von der Nutzlast liest; alles andere (Plomben, Geräte, Flaschen) gibt es in der Demo nicht. */
export const DemoNutzlastSchema = z.object({
  positionen: z.array(z.object({
    sollPositionId: z.string().min(1).max(64),
    ist: z.number().int().min(0).max(100_000),
    nachfuellMenge: z.number().int().min(0).max(100_000),
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
  soll: readonly { id: string; artikelId: string; soll: number }[],
  schwellen: VerfallSchwellen,
  now: Date,
): CheckAbschlussWert | null {
  const byId = new Map(soll.map((p) => [p.id, p]));
  const artikelIds = new Set(soll.map((p) => p.artikelId));
  const gruppen = new Map<string, { sollSumme: number; istSumme: number; nachfuell: number }>();
  for (const p of v.positionen) {
    const row = byId.get(p.sollPositionId);
    if (!row) return null;
    const g = gruppen.get(row.artikelId) ?? { sollSumme: 0, istSumme: 0, nachfuell: 0 };
    g.sollSumme += row.soll;
    g.istSumme += p.ist;
    g.nachfuell += Math.min(p.nachfuellMenge, Math.max(0, row.soll - p.ist));
    gruppen.set(row.artikelId, g);
  }
  if (v.verfaelle.some((e) => !artikelIds.has(e.artikelId))) return null;

  let nachgefuellt = 0;
  let offen = 0;
  for (const g of gruppen.values()) {
    nachgefuellt += g.nachfuell;
    offen += Math.max(0, g.sollSumme - g.istSumme - g.nachfuell);
  }
  return {
    checkId: DEMO_FAHRZEUG_ID,
    nachgefuellt,
    nachfuellBestaetigt: nachgefuellt,
    offen,
    geraeteAuffaellig: 0,
    flaschenAuffaellig: 0,
    flaschenNichtBewertbar: 0,
    verfallAuffaellig: zaehleAblaufende(
      Object.fromEntries(v.verfaelle.map((e) => [e.artikelId, e.verfall])), schwellen, now),
    plombenOffen: 0,
    plombenGesetzt: 0,
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
