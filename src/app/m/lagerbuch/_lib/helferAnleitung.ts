/**
 * DIE HELFER-ANLEITUNG ZUM AUSHAENGEN (IDA-278) — drei A4-Blaetter mit Bildern
 * der Helfer-Ansicht: Material entnehmen, in die Entnahmebox zurueckpacken,
 * Fahrzeugcheck.
 *
 * KEIN "use client": den Pfad liest die Client-Insel `OrtsetikettenChrome` UND
 * der Test, der prueft, dass die Datei wirklich daliegt (Falle 6).
 *
 * ⚠️ DER PFAD TRAEGT DAS INTERNE PRAEFIX `/m/lagerbuch/`, wie die Bilder von
 * `uav` (`/m/uav/illustrations/…`). Ein Pfad mit diesem Praefix wird nicht noch
 * einmal umgeschrieben (`core/routing.ts`, „Bereits interner Pfad"), und das
 * Lagerbuch verlangt keine Anmeldung — die Datei kommt also von jedem
 * Lagerbuch-Host direkt aus `public/m/lagerbuch/`.
 *
 * ⚠️ DIE BILDER SIND SCREENSHOTS. Aendert sich die Helfer-Ansicht sichtbar,
 * `pnpm anleitung:lagerbuch` neu fahren (`e2e/anleitung/`, IDA-291; die CI prueft ihn).
 */
export const HELFER_ANLEITUNG_PFAD = "/m/lagerbuch/helfer-anleitung.pdf";

/** Der Dateiname beim Herunterladen — sprechend statt `helfer-anleitung.pdf`. */
export const HELFER_ANLEITUNG_DATEINAME = "Lagerbuch-Helfer-Anleitung.pdf";
