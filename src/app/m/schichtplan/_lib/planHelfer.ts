/**
 * Personen der Planung in einer Form (`PlanHelfer`), egal ob aus den Stammdaten oder temporär. Rein und
 * ohne Datenbank: der Editor im Browser rechnet damit, `bestand.ts` (Server) liest die Stammdaten.
 */
import type { HelferFuerSchichtplanung } from "@/app/m/helfer/_lib/bereitstellung";
import { alsFahrerlaubnis } from "./qualis";
import { type PlanHelfer, type TempHelferDTO, schluessel } from "./typen";

/** Stammhelfer als einteilbare Personen; die Fahrerlaubnisklassen werden zu Qualifikationen. */
export function alsPlanHelfer(liste: readonly HelferFuerSchichtplanung[]): PlanHelfer[] {
  return liste.map((h) => ({
    schluessel: schluessel("stamm", h.id), quelle: "stamm", id: h.id, vorname: h.vorname, nachname: h.nachname, demo: h.demo,
    ...(h.hiorgId ? { hiorgId: h.hiorgId } : {}),
    qualifikationen: [...h.qualifikationen.map((q) => ({ kurz: q.kurz || q.name, name: q.name })), ...h.fahrerlaubnis.map(alsFahrerlaubnis)],
  }));
}

export function tempAlsPlanHelfer(liste: readonly TempHelferDTO[]): PlanHelfer[] {
  return liste.map((t) => ({
    schluessel: schluessel("temp", t.id), quelle: "temp", id: t.id, vorname: t.vorname, nachname: t.nachname, demo: false,
    qualifikationen: t.qualifikationen, telefon: t.telefon, organisation: t.organisation,
  }));
}
