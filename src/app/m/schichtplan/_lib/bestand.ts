/**
 * Was die Schichtplanung aus anderen Modulen liest — nur über deren Bereitstellung
 * (`helfer/_lib/bereitstellung.ts`, `fahrzeuge/_lib/bereitstellung.ts`), nie über ihre Datenbank.
 * Namen von Stammhelfern stehen nie in der eigenen Datenbank; sie kommen bei jedem Aufruf frisch.
 */
import { kurzname, bereitgestellteFahrzeuge } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { helferFuerSchichtplanung } from "@/app/m/helfer/_lib/bereitstellung";
import { alsPlanHelfer } from "./planHelfer";
import type { FahrzeugWahl, PlanHelfer } from "./typen";

export { tempAlsPlanHelfer } from "./planHelfer";

const nachName = (a: PlanHelfer, b: PlanHelfer) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de");

/** Alle Stammhelfer, nach Namen. Ist das Helfer-Modul leer oder nicht erreichbar, ist die Liste leer. */
export function stammHelfer(): PlanHelfer[] {
  return alsPlanHelfer(helferFuerSchichtplanung().helfer).sort(nachName);
}

/** Die Kennungen, die eine Einteilung annehmen darf. */
export function stammKennungen(): Set<string> {
  return new Set(helferFuerSchichtplanung().helfer.map((h) => h.id));
}

/** Aktive Fahrzeuge (keine Anhänger) für die Auswahl „Fahrzeug hinzufügen“. */
export function fahrzeugAuswahl(): FahrzeugWahl[] {
  return bereitgestellteFahrzeuge().fahrzeuge
    .filter((f) => f.aktiv && f.art === "fahrzeug")
    .map((f) => ({ id: f.id, name: kurzname(f), kenner: f.funkkenner }))
    .sort((a, b) => a.name.localeCompare(b.name, "de", { numeric: true }));
}
