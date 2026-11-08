/**
 * Die Excel-Mappe einer Planung — zugleich die Übergabe an Lifeline Hub (IDA-313: nur Export, die
 * eigentliche Schnittstelle entscheidet LLH-1523). Die ersten vier Blätter sind zum Lesen gebaut; das
 * Blatt „Austausch“ (IDA-365) ist das Format, das Lifeline Hub einliest (LLH-1556) und dort vor jedem
 * anderen Blatt gilt. Rein, ohne Browser: `export.test.ts` liest die Mappe.
 */
import { blatt, freiesBlatt, type FertigesBlatt } from "@/core/export/spalten";
import { KONFLIKT_TITEL, type Auswertung, type Konflikt } from "../_lib/pruefung";
import type { EinheitDTO, PlanHelfer, PlanungDTO, SchichtDTO } from "../_lib/typen";
import { schluessel, STUNDE } from "../_lib/typen";
import { isoMitVersatz, zeitspanne } from "../_lib/zeit";
import { einheitTitel, name } from "./teile";

export interface Eintrag { s: SchichtDTO; e: EinheitDTO; personen: PlanHelfer[] }

/** Alle Schichten in zeitlicher Reihenfolge, mit Einheit und eingeteilten Personen. */
export function eintraege(p: PlanungDTO, helfer: readonly PlanHelfer[]): Eintrag[] {
  const map = new Map(helfer.map((h) => [h.schluessel, h]));
  const einheit = new Map(p.einheiten.map((e) => [e.id, e]));
  const reihe = new Map(p.einheiten.map((e, i) => [e.id, i]));
  return [...p.schichten]
    .filter((s) => einheit.has(s.einheitId))
    .sort((x, y) => x.von - y.von || (reihe.get(x.einheitId) ?? 0) - (reihe.get(y.einheitId) ?? 0))
    .map((s) => ({
      s, e: einheit.get(s.einheitId)!,
      personen: p.zuordnungen.filter((z) => z.schichtId === s.id).map((z) => map.get(schluessel(z.quelle, z.helferId))).filter((h): h is PlanHelfer => !!h)
        .sort((a, b) => a.nachname.localeCompare(b.nachname, "de")),
    }));
}

/**
 * Eine Zeile des Austauschblatts: eine Person in einer Schicht, oder eine Schicht ohne Person. Die
 * Spalten heißen wie in der Anwenderdoku von Lifeline Hub („Format der Schichtplan-Datei“).
 */
export interface AustauschZeile { x: Eintrag; h: PlanHelfer | null }

/** Komma und Semikolon trennen in Lifeline Hub die Listen; in einem Namen werden sie zu Leerzeichen. */
/** Mehr Qualifikationen je Person nimmt Lifeline Hub nicht an (die Zeile wäre ein Fehler); sie dienen dort nur dem Anlegen neuer Helfer. */
const QUALIS_JE_PERSON_MAX = 20;
const listenTeil = (t: string) => t.replace(/[,;]+/g, " ").replace(/\s+/g, " ").trim();

/**
 * Kennung und Herkunft sind in Lifeline Hub EIN Schlüssel: dieselbe Person aus derselben Quelle wird
 * beim zweiten Einlesen wiedererkannt. Deshalb nennt die Herkunft, woher die Kennung stammt — die
 * HiOrg-Kennung gilt über alle Planungen, die Suite-Kennungen nur in der Suite.
 */
export const AUSTAUSCH_HERKUNFT = { hiorg: "HiOrg", stamm: "IuK-Suite Stammdaten", temp: "IuK-Suite temporär" } as const;

export function austauschKennung(h: PlanHelfer): { kennung: string; herkunft: string } {
  if (h.quelle === "temp") return { kennung: h.id, herkunft: AUSTAUSCH_HERKUNFT.temp };
  if (h.hiorgId) return { kennung: h.hiorgId, herkunft: AUSTAUSCH_HERKUNFT.hiorg };
  return { kennung: h.id, herkunft: AUSTAUSCH_HERKUNFT.stamm };
}

/** Je Schicht eine Zeile je Person; eine unbesetzte Schicht steht als Zeile ohne Person da. */
export function austauschZeilen(liste: readonly Eintrag[]): AustauschZeile[] {
  return liste.flatMap((x): AustauschZeile[] => (x.personen.length ? x.personen.map((h) => ({ x, h })) : [{ x, h: null }]));
}

export function austauschBlatt(liste: readonly Eintrag[]): FertigesBlatt {
  const person = <T>(f: (h: PlanHelfer) => T) => (z: AustauschZeile) => (z.h ? f(z.h) : null);
  return blatt("Austausch", [
    { kopf: "Posten", wert: (z: AustauschZeile) => z.x.e.name, breite: 28 },
    { kopf: "Abschnitt", wert: () => null, breite: 14 },
    { kopf: "Posten-Art", wert: (z: AustauschZeile) => (z.x.e.art === "fahrzeug" ? "Fahrzeug" : "Einheit"), breite: 11 },
    { kopf: "Beginn", wert: (z: AustauschZeile) => isoMitVersatz(z.x.s.von), breite: 23 },
    { kopf: "Ende", wert: (z: AustauschZeile) => isoMitVersatz(z.x.s.bis), breite: 23 },
    { kopf: "Soll-Anzahl", wert: (z: AustauschZeile) => z.x.e.soll, breite: 11 },
    { kopf: "Soll-Qualifikationen", wert: (z: AustauschZeile) => z.x.e.anforderungen.map((a) => `${a.anzahl} ${listenTeil(a.quali.name)}`).join(", ") || null, breite: 32 },
    { kopf: "Nachname", wert: person((h) => h.nachname), breite: 18 },
    { kopf: "Vorname", wert: person((h) => h.vorname), breite: 16 },
    { kopf: "Telefon", wert: person((h) => h.telefon || null), breite: 16 },
    { kopf: "Organisation", wert: person((h) => h.organisation || null), breite: 22 },
    { kopf: "Qualifikationen", wert: person((h) => [...new Set(h.qualifikationen.map((q) => listenTeil(q.name)).filter(Boolean))].slice(0, QUALIS_JE_PERSON_MAX).join(", ") || null), breite: 32 },
    { kopf: "Kennung", wert: person((h) => austauschKennung(h).kennung), breite: 34 },
    { kopf: "Herkunft", wert: person((h) => austauschKennung(h).herkunft), breite: 22 },
  ], austauschZeilen(liste));
}

const herkunft = (h: PlanHelfer) => (h.quelle === "temp" ? `Temporär${h.organisation ? ` (${h.organisation})` : ""}` : "Stammdaten");

export function planungsMappe(p: PlanungDTO, a: Auswertung, helfer: readonly PlanHelfer[]): FertigesBlatt[] {
  const liste = eintraege(p, helfer);
  const jeHelfer = [...helfer]
    .sort((x, y) => x.nachname.localeCompare(y.nachname, "de") || x.vorname.localeCompare(y.vorname, "de"))
    .flatMap((h) => liste.filter((x) => x.personen.includes(h)).map((x) => ({ h, ...x })));
  type JeHelfer = (typeof jeHelfer)[number];
  return [
    freiesBlatt("Planung", [
      ["Planung", p.name], ["Art", p.art === "lage" ? "Lage" : "Veranstaltung"], ["Ort", p.ort], ["Zeitraum", zeitspanne(p.von, p.bis, true)],
      ["Besetzung", `${a.ist} von ${a.soll} Plätzen`], ["Konflikte", a.konflikte.length],
    ], [16, 48]),
    blatt("Je Abschnitt", [
      { kopf: "Abschnitt / Fahrzeug", wert: (x: Eintrag) => einheitTitel(x.e), breite: 28 },
      { kopf: "Schicht", wert: (x: Eintrag) => zeitspanne(x.s.von, x.s.bis, true), breite: 26 },
      { kopf: "Soll", wert: (x: Eintrag) => x.e.soll, breite: 6 },
      { kopf: "Ist", wert: (x: Eintrag) => x.personen.length, breite: 6 },
      { kopf: "Eingeteilt", wert: (x: Eintrag) => x.personen.map(name).join(", "), breite: 60 },
    ], liste),
    blatt("Je Helfer", [
      { kopf: "Name", wert: (x: JeHelfer) => `${x.h.nachname}, ${x.h.vorname}`, breite: 24 },
      { kopf: "Herkunft", wert: (x: JeHelfer) => herkunft(x.h), breite: 22 },
      { kopf: "Telefon", wert: (x: JeHelfer) => x.h.telefon ?? "", breite: 16 },
      { kopf: "Abschnitt / Fahrzeug", wert: (x: JeHelfer) => einheitTitel(x.e), breite: 28 },
      { kopf: "Schicht", wert: (x: JeHelfer) => zeitspanne(x.s.von, x.s.bis, true), breite: 26 },
      { kopf: "Stunden", wert: (x: JeHelfer) => (x.s.bis - x.s.von) / STUNDE, breite: 9 },
    ], jeHelfer),
    blatt("Konflikte", [
      { kopf: "Art", wert: (k: Konflikt) => KONFLIKT_TITEL[k.art], breite: 22 },
      { kopf: "Beschreibung", wert: (k: Konflikt) => k.text, breite: 90 },
    ], a.konflikte),
    austauschBlatt(liste),
  ];
}

/** `schichtplan-stadtfest-2026-11-14.xlsx` — ohne Umlaute und Sonderzeichen. */
export function dateiname(p: Pick<PlanungDTO, "name">, tag: string): string {
  const kern = p.name.toLocaleLowerCase("de").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `schichtplan-${kern || "planung"}-${tag}.xlsx`;
}
