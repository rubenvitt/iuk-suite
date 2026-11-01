/**
 * Die Excel-Mappe einer Planung — zugleich die Übergabe an Lifeline Hub (IDA-313: nur Export, die
 * eigentliche Schnittstelle entscheidet LLH-1523). Rein, ohne Browser: `export.test.ts` liest die Mappe.
 */
import { blatt, freiesBlatt, type FertigesBlatt } from "@/core/export/spalten";
import { KONFLIKT_TITEL, type Auswertung, type Konflikt } from "../_lib/pruefung";
import type { EinheitDTO, PlanHelfer, PlanungDTO, SchichtDTO } from "../_lib/typen";
import { schluessel, STUNDE } from "../_lib/typen";
import { zeitspanne } from "../_lib/zeit";
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
  ];
}

/** `schichtplan-stadtfest-2026-11-14.xlsx` — ohne Umlaute und Sonderzeichen. */
export function dateiname(p: Pick<PlanungDTO, "name">, tag: string): string {
  const kern = p.name.toLocaleLowerCase("de").replace(/ä/g, "ae").replace(/ö/g, "oe").replace(/ü/g, "ue").replace(/ß/g, "ss")
    .replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40);
  return `schichtplan-${kern || "planung"}-${tag}.xlsx`;
}
