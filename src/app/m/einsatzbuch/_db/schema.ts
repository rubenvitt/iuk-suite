/**
 * Datenbank des Moduls einsatzbuch. Stufe 1 trägt nur die Audit-Outbox; Stammdaten,
 * Schlüsselpaar, Rechner, Anker, Einmalcodes und Sitzungen folgen mit Stufe 2 und 5
 * (Spec §5.1). Die Einsätze selbst liegen NIE hier, sondern auf dem Einsatzbuch-Rechner.
 */
export { auditOutbox } from "@/core/audit/_db/schema";
