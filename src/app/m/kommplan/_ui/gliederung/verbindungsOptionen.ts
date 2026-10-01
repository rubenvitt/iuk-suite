import { ART_NAME, LAENGE, VERBINDUNGS_ARTEN, type PlanInhalt, type VerbindungsArt } from "../../_lib/plan/schema";
import type { BibVerbindung } from "../../_lib/bibliothek/typen";
import { BIB_OPTION, bibVerbindungenFuerPlan } from "../../_lib/plan/bibliothek";
import { findeVerbindung } from "../../_lib/plan/verbindungen";

/**
 * OPTIONEN DES VERBINDUNGSFELDS DER GLIEDERUNG (Umsetzungsplan Phase 3, Entscheidung 12): wählen oder
 * neu tippen. Ein neuer Text bietet JE ART eine Option — die Art steht sichtbar in der Option (anders
 * als das in Phase 2 verworfene Kombifeld, Kritik 29), die zuletzt angelegte Art zuerst.
 */
export const KEINE = "~keine";
const NEU = "~neu:";
export interface VerbindungsOption { value: string; label: string; disabled?: boolean }

export function leseNeu(wert: string): VerbindungsArt | null {
  if (!wert.startsWith(NEU)) return null;
  const art = wert.slice(NEU.length);
  return (VERBINDUNGS_ARTEN as readonly string[]).includes(art) ? (art as VerbindungsArt) : null;
}

export function verbindungsOptionen(inhalt: PlanInhalt, suche: string, bib: readonly BibVerbindung[] = []): VerbindungsOption[] {
  const text = suche.trim();
  if (text.length > LAENGE.bezeichnung) return [{ value: "~zu-lang", label: `Höchstens ${LAENGE.bezeichnung} Zeichen`, disabled: true }];
  const klein = text.toLocaleLowerCase("de");
  const keine = klein === "" || "keine".includes(klein) ? [{ value: KEINE, label: "keine (dünne Linie)" }] : [];
  const vorhanden = inhalt.verbindungen
    .filter((v) => klein === "" || v.bezeichnung.toLocaleLowerCase("de").includes(klein))
    .map((v) => ({ value: v.id, label: `${v.bezeichnung} · ${ART_NAME[v.art]}` }));
  const ausBib = bibVerbindungenFuerPlan(inhalt, bib)
    .filter((b) => klein === "" || b.bezeichnung.toLocaleLowerCase("de").includes(klein))
    .map((b) => ({ value: `${BIB_OPTION}${b.id}`, label: `Aus Bibliothek: ${b.bezeichnung} · ${ART_NAME[b.art]}` }));
  if (text === "") return [...keine, ...vorhanden, ...ausBib];
  const zuerst = inhalt.verbindungen.at(-1)?.art ?? "tmo";
  const neu = [zuerst, ...VERBINDUNGS_ARTEN.filter((a) => a !== zuerst)]
    .filter((a) => !findeVerbindung(inhalt, text, a))
    .map((a) => ({ value: `${NEU}${a}`, label: `Neu: „${text}“ als ${ART_NAME[a]}` }));
  return [...keine, ...vorhanden, ...ausBib, ...neu];
}
