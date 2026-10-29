/**
 * DIE ANWENDERANLEITUNG FÜR DEN EINSATZBUCH-RECHNER (IDA-289) — zwei A4-Blätter mit Bildern der
 * Desktop-App: Einsatz erfassen, dann prüfen und versiegeln. Gegenstück zur Helfer-Anleitung des
 * Lagerbuchs (`lagerbuch/_lib/helferAnleitung.ts`), die das Handy zeigt.
 *
 * KEIN "use client": den Pfad lesen die Server Component `rechner/page.tsx` UND der Test, der
 * prüft, dass die Datei wirklich daliegt (Falle 6).
 *
 * ⚠️ DER PFAD TRÄGT DAS INTERNE PRÄFIX `/m/einsatzbuch/` wie der des Lagerbuchs: ein solcher Pfad
 * wird nicht noch einmal umgeschrieben (`core/routing.ts`, „Bereits interner Pfad"), die Datei
 * kommt also vom Einsatzbuch-Host direkt aus `public/m/einsatzbuch/`. Sie enthält nur Bilder
 * des Stubs, keine Daten — dass sie ohne Anmeldung abrufbar ist, ist gewollt.
 *
 * ⚠️ DIE BILDER SIND SCREENSHOTS. Ändert sich die Erfassung sichtbar, das PDF mit
 * `pnpm --filter einsatzbuch anleitung` neu erzeugen (`apps/einsatzbuch/anleitung/`).
 */
export const RECHNER_ANLEITUNG_PFAD = "/m/einsatzbuch/rechner-anleitung.pdf";

/** Der Dateiname beim Herunterladen — sprechend statt `rechner-anleitung.pdf`. */
export const RECHNER_ANLEITUNG_DATEINAME = "Einsatzbuch-Anleitung-Rechner.pdf";
