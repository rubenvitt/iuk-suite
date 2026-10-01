import { vergleichsform, type BibEinheit, type BibStelle, type BibVerbindung } from "../bibliothek/typen";
import { fuegeEinheitenEin } from "./einheiten";
import { aendereStelle, PlanFehler, stelleOder } from "./operationen";
import type { Kontakt, PlanInhalt, Stelle } from "./schema";
import { findeVerbindung, legeVerbindungAn } from "./verbindungen";

/**
 * KOPIEN AUS DER BIBLIOTHEK (Spec §4.3, §6.4, §6.5; Umsetzungsplan Phase 4, Entscheidungen 13, 14) — reine
 * Operationen wie alle in `_lib/plan/`: Eingabe unverändert, Ausgabe gültig oder `PlanFehler`. Jede ist im
 * Editor EIN Rückgängig-Schritt. Kopiert wird tief (Kontakte), damit der Plan nie auf einen
 * Bibliothekseintrag verweist; Notizen bleiben in der Bibliothek.
 */
export const BIB_OPTION = "~bib:";

export function uebernimmBibStelle(inhalt: PlanInhalt, stelleId: string, b: BibStelle): PlanInhalt {
  return aendereStelle(inhalt, stelleId, { titel: b.titel, zeichen: b.zeichen, leiter: b.leiter, kontakte: b.kontakte.map((k) => ({ art: k.art, wert: k.wert })) });
}

export function fuegeBibEinheitenEin(inhalt: PlanInhalt, stelleId: string, eintraege: readonly BibEinheit[], ids: readonly string[]): PlanInhalt {
  return fuegeEinheitenEin(inhalt, stelleId, eintraege.map((e, i) => ({ id: ids[i], typ: e.typ, rufname: e.rufname, zeichen: e.zeichen })));
}

/** Gleichnamige Verbindung derselben Art im Plan → die wird genommen (keine Doppelung, wie `VerbindungWahl`); sonst eine Kopie. */
export function verbindeMitBibVerbindung(inhalt: PlanInhalt, stelleId: string, b: BibVerbindung, neueId: string): PlanInhalt {
  if (stelleOder(inhalt, stelleId).eltern === null) throw new PlanFehler("Eine Stelle der obersten Ebene hat keine Verbindung nach oben.");
  const vorhanden = findeVerbindung(inhalt, b.bezeichnung, b.art);
  const mit = vorhanden ? inhalt : legeVerbindungAn(inhalt, { id: neueId, art: b.art, bezeichnung: b.bezeichnung });
  return aendereStelle(mit, stelleId, { verbindungId: vorhanden?.id ?? neueId });
}

/** Was die Verbindungsauswahl zusätzlich „aus der Bibliothek" anbietet: nur, was der Plan noch nicht hat. */
export function bibVerbindungenFuerPlan(inhalt: PlanInhalt, bib: readonly BibVerbindung[]): BibVerbindung[] {
  return bib.filter((b) => !findeVerbindung(inhalt, b.bezeichnung, b.art));
}

const gleicheKontakte = (a: readonly Kontakt[], b: readonly Kontakt[]) =>
  a.length === b.length && a.every((k, i) => k.art === b[i].art && k.wert === b[i].wert);

/**
 * Titelvorschläge der Gliederung und des Flyins (Entscheidung 14). Ein Eintrag mit GENAU dem Titel der Stelle wird
 * nur angeboten, solange die Stelle keine eigene Leitung und keine Kontakte trägt: sonst stünde da ein Knopf mit dem
 * Text, der schon im Feld steht, und ein Tipp ersetzte die Kontakte still (Review Phase 4). Gezielt überschreiben
 * bleibt „Aus Bibliothek" im Flyin.
 */
export function stelleVorschlaege(bib: readonly BibStelle[], stelle: Pick<Stelle, "titel" | "zeichen" | "leiter" | "kontakte">, max = 3): BibStelle[] {
  const text = vergleichsform(stelle.titel);
  if (text.length < 2) return [];
  const eigeneAngaben = (stelle.leiter ?? "").trim() !== "" || stelle.kontakte.some((k) => k.wert.trim() !== "");
  const traegtSchon = (b: BibStelle) => vergleichsform(b.titel) === text && (eigeneAngaben || (b.zeichen === stelle.zeichen
    && (b.leiter ?? null) === (stelle.leiter ?? null) && gleicheKontakte(b.kontakte, stelle.kontakte)));
  const titel = (b: BibStelle) => vergleichsform(b.titel);
  const beginnt = bib.filter((b) => titel(b).startsWith(text));
  const enthaelt = bib.filter((b) => !titel(b).startsWith(text) && titel(b).includes(text));
  return [...beginnt, ...enthaelt].filter((b) => !traegtSchon(b)).slice(0, max);
}

/** „In Bibliothek übernehmen": was von einer Stelle in die Bibliothek geht — neu, ohne Notiz. */
export function bibStelleAus(s: Stelle): { id: null; titel: string; zeichen: string | null; leiter: string | null; kontakte: Kontakt[]; notiz: null } {
  return { id: null, titel: s.titel.trim(), zeichen: s.zeichen, leiter: s.leiter, kontakte: s.kontakte.filter((k) => k.wert.trim() !== ""), notiz: null };
}

/**
 * Abgleich nach dem Einfügen einer Gliederung (Entscheidung 14): welche der NEUEN Stellen heißen genau wie ein
 * Bibliothekseintrag (Vergleichsform) und tragen dessen Angaben noch nicht? Der Editor bietet „Angaben übernehmen"
 * für alle Treffer in einem Schritt an.
 */
export function bibStellenTreffer(inhalt: PlanInhalt, ids: readonly string[], bib: readonly BibStelle[]): { stelleId: string; b: BibStelle }[] {
  const nachTitel = new Map(bib.map((b) => [vergleichsform(b.titel), b]));
  return ids.flatMap((id) => {
    const s = inhalt.stellen.find((x) => x.id === id);
    const b = s ? nachTitel.get(vergleichsform(s.titel)) : undefined;
    if (!s || !b) return [];
    const traegt = b.zeichen === s.zeichen && (b.leiter ?? null) === (s.leiter ?? null) && gleicheKontakte(b.kontakte, s.kontakte);
    return traegt ? [] : [{ stelleId: id, b }];
  });
}

/**
 * „Angaben übernehmen" wird erst später gedrückt (Entscheidung 14): nur die Treffer, deren Stelle seit dem Einfügen
 * (`vorher`) unberührt ist — sonst setzte der Knopf einen danach getippten Titel oder eine Leitung still auf den Stand
 * der Bibliothek zurück (Review Phase 4). Gelöschte Stellen fallen ebenso heraus.
 */
export function unberuehrteTreffer<T extends { stelleId: string }>(jetzt: PlanInhalt, vorher: PlanInhalt, treffer: readonly T[]): T[] {
  return treffer.filter((t) => {
    const a = jetzt.stellen.find((s) => s.id === t.stelleId);
    const b = vorher.stellen.find((s) => s.id === t.stelleId);
    return a !== undefined && b !== undefined && a.titel === b.titel && a.zeichen === b.zeichen
      && (a.leiter ?? null) === (b.leiter ?? null) && gleicheKontakte(a.kontakte, b.kontakte);
  });
}

/** Wo steht welches Fahrzeug? Vergleichsform des Rufnamens → Stelle — für „schon bei …" in der Einheitenauswahl. */
export function einsatzOrte(inhalt: PlanInhalt): Map<string, { stelleId: string; titel: string }> {
  const orte = new Map<string, { stelleId: string; titel: string }>();
  for (const s of inhalt.stellen) for (const e of s.einheiten) {
    const k = vergleichsform(e.rufname);
    if (!orte.has(k)) orte.set(k, { stelleId: s.id, titel: s.titel.trim() || "(ohne Titel)" });
  }
  return orte;
}
