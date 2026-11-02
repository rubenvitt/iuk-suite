/**
 * Die Eingabe des Rechners als URL-Parameter für den Ausdruck (IDA-330). Das Modul hat keine Datenbank
 * (IDA-322): was gedruckt wird, reist deshalb im Link mit, und die Druckseite rechnet mit demselben Kern.
 * Ein neu geladener oder weitergegebener Link druckt so dieselbe Rechnung.
 *
 * Der Parameter kommt von außen: `eingabeAusParam` nimmt nur bekannte Felder, kappt Längen und Mengen und
 * liefert bei allem Unlesbaren `null`. Zahlen bereinigt danach der Rechenkern selbst (`zahl` in `rechner.ts`).
 *
 * KEIN "use client": vom Rechner (Client) wie von der Druckseite (Server) gelesen (Falle 6).
 */
import type { Belegung, Eingabe, Raum, Weg, Zeltbestand } from "./rechner";
import { RICHTWERTE } from "./richtwerte";

export const DRUCK_PARAM = "e";
const MAX_RAEUME = 200;
const MAX_ABZUEGE = 10;
const MAX_BEZEICHNUNG = 80;
const WEGE: readonly Weg[] = ["personen", "flaeche", "raeume", "zelte"];
const TYPEN = RICHTWERTE.zelte.typen.map((t) => t.typ);

function zuBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = "";
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function ausBase64Url(roh: string): string {
  const b64 = roh.replace(/-/g, "+").replace(/_/g, "/");
  const bin = atob(b64 + "=".repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder("utf-8", { fatal: true }).decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

/** Pfad der Druckseite für diese Eingabe, relativ zum Modul-Host. */
export function druckHref(eingabe: Eingabe): string {
  return `/druck?${DRUCK_PARAM}=${zuBase64Url(JSON.stringify(eingabe))}`;
}

const istObjekt = (x: unknown): x is Record<string, unknown> => typeof x === "object" && x !== null && !Array.isArray(x);
/** Endliche Zahl ≥ 0, sonst 0. */
const zahl = (x: unknown): number => (typeof x === "number" && Number.isFinite(x) && x > 0 ? x : 0);
const text = (x: unknown): string => (typeof x === "string" ? x.slice(0, MAX_BEZEICHNUNG) : "");

function zahlenfelder<K extends string>(x: unknown, schluessel: readonly K[]): Partial<Record<K, number>> {
  if (!istObjekt(x)) return {};
  const aus: Partial<Record<K, number>> = {};
  for (const k of schluessel) if (k in x) aus[k] = zahl(x[k]);
  return aus;
}

function bestand(x: unknown): Zeltbestand | undefined {
  if (!istObjekt(x)) return undefined;
  return Object.fromEntries(TYPEN.map((t) => [t, Math.floor(zahl(x[t]))]));
}

function raum(x: unknown): Raum {
  const r = istObjekt(x) ? x : {};
  const abzuege = Array.isArray(r.abzuege) ? r.abzuege.slice(0, MAX_ABZUEGE) : [];
  const aus: Raum = {
    bezeichnung: text(r.bezeichnung),
    laenge_m: zahl(r.laenge_m),
    breite_m: zahl(r.breite_m),
    abzuege: abzuege.map((a) => ({ laenge_m: zahl(istObjekt(a) ? a.laenge_m : 0), breite_m: zahl(istObjekt(a) ? a.breite_m : 0) })),
  };
  if (r.belegung === "maenner" || r.belegung === "frauen") aus.belegung = r.belegung as Belegung;
  return aus;
}

/** Liest den Parameter der Druckseite; `null`, wenn er fehlt oder nicht zu lesen ist. */
export function eingabeAusParam(roh: string | string[] | undefined): Eingabe | null {
  if (typeof roh !== "string" || roh.length === 0 || roh.length > 100_000) return null;
  let x: unknown;
  try {
    x = JSON.parse(ausBase64Url(roh));
  } catch {
    return null;
  }
  if (!istObjekt(x) || !WEGE.includes(x.weg as Weg)) return null;
  const e: Eingabe = { weg: x.weg as Weg, trennung: x.trennung === true };
  if (e.weg === "personen") e.personen = zahlenfelder(x.personen, ["maenner", "frauen", "gesamt"] as const);
  if (e.weg === "flaeche") e.flaeche = zahlenfelder(x.flaeche, ["maenner_m2", "frauen_m2", "gesamt_m2"] as const);
  if (e.weg === "raeume") e.raeume = Array.isArray(x.raeume) ? x.raeume.slice(0, MAX_RAEUME).map(raum) : [];
  if (e.weg === "zelte") {
    const z = istObjekt(x.zelte) ? x.zelte : {};
    e.zelte = e.trennung ? { maenner: bestand(z.maenner), frauen: bestand(z.frauen) } : { gesamt: bestand(z.gesamt) };
  }
  return e;
}
