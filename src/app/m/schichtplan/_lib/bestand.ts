/**
 * Was die Schichtplanung aus anderen Modulen liest — nur über deren Bereitstellung
 * (`helfer/_lib/bereitstellung.ts`, `fahrzeuge/_lib/bereitstellung.ts`, `veranstaltungen/_lib/bereitstellung.ts`),
 * nie über ihre Datenbank.
 * Namen von Stammhelfern stehen nie in der eigenen Datenbank; sie kommen bei jedem Aufruf frisch.
 */
import { kurzname, bereitgestellteFahrzeuge } from "@/app/m/fahrzeuge/_lib/bereitstellung";
import { helferFuerSchichtplanung } from "@/app/m/helfer/_lib/bereitstellung";
import { bereitgestellteVeranstaltung, bereitgestellteVeranstaltungen } from "@/app/m/veranstaltungen/_lib/bereitstellung";
import { alsPlanHelfer } from "./planHelfer";
import type { FahrzeugWahl, PlanHelfer, VeranstaltungWahl } from "./typen";

export { tempAlsPlanHelfer } from "./planHelfer";

const nachName = (a: PlanHelfer, b: PlanHelfer) => a.nachname.localeCompare(b.nachname, "de") || a.vorname.localeCompare(b.vorname, "de");

/** Alle Stammhelfer, nach Namen. Ist das Helfer-Modul leer, ist die Liste leer; ein Datenbankfehler fliegt bewusst durch. */
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

/** Die Veranstaltungen für die Auswahl im Formular (IDA-415), frühester Beginn zuerst. */
export function veranstaltungAuswahl(): VeranstaltungWahl[] {
  return bereitgestellteVeranstaltungen().map((v) => ({ id: v.id, name: v.name, ort: v.ort, von: v.von, bis: v.bis, abgesagt: v.status === "abgesagt" }));
}

/** Gibt es diese Veranstaltung (noch)? Eine Planung darf nur auf eine bestehende verweisen. */
export function gibtVeranstaltung(id: string): boolean {
  return bereitgestellteVeranstaltung(id) !== null;
}

/** Der Name der Veranstaltung einer Planung, oder `null`, wenn sie gelöscht ist. */
export function veranstaltungsName(id: string | null): string | null {
  return id ? bereitgestellteVeranstaltung(id)?.name ?? null : null;
}
