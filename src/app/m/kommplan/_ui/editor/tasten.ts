/**
 * TASTATUR DES EDITORS (Spec §6.3, §6.6) als reine Abbildung Taste → Befehl.
 * - Rückgängig/Wiederholen gelten global, aber NIE in einem Textfeld: dort gehört Strg+Z dem Feld.
 * - Die Flächenbefehle gelten nur, wenn die Zeichenfläche den Fokus hat (das Flyin ist ein Portal
 *   außerhalb der Fläche) — so löscht „Entf" im Titelfeld nie die Karte.
 * - Rücktaste zählt wie Entf: auf Mac-Tastaturen heißt „Entf" so.
 * - Andere druckbare Tasten bewusst ohne Wirkung (Entscheidung 9): §6.3 legt N als Befehl fest,
 *   „Tippen bearbeitet den Titel" machte N zur einzigen Ausnahme. F2 öffnet wie Enter.
 */
export interface Taste { key: string; ctrlKey: boolean; metaKey: boolean; shiftKey: boolean; altKey: boolean }
export type Richtung = "hoch" | "runter" | "links" | "rechts";
export type Befehl =
  | { art: "rueckgaengig" } | { art: "wiederholen" } | { art: "wandere"; richtung: Richtung }
  | { art: "oeffnen" } | { art: "neueUnterstelle" } | { art: "loeschen" } | { art: "abwaehlen" };

export function globalerBefehl(t: Taste, imTextfeld: boolean): Befehl | null {
  if (imTextfeld || t.altKey || !(t.ctrlKey || t.metaKey)) return null;
  const k = t.key.toLowerCase();
  if (k === "z") return t.shiftKey ? { art: "wiederholen" } : { art: "rueckgaengig" };
  if (k === "y" && !t.shiftKey) return { art: "wiederholen" };
  return null;
}

const PFEILE: Readonly<Record<string, Richtung>> = { ArrowUp: "hoch", ArrowDown: "runter", ArrowLeft: "links", ArrowRight: "rechts" };

export function flaechenBefehl(t: Taste): Befehl | null {
  if (t.ctrlKey || t.metaKey || t.altKey) return null;
  if (Object.prototype.hasOwnProperty.call(PFEILE, t.key)) return { art: "wandere", richtung: PFEILE[t.key] };
  if (t.key === "Enter" || t.key === "F2") return { art: "oeffnen" };
  if (t.key === "n" || t.key === "N") return { art: "neueUnterstelle" };
  if (t.key === "Delete" || t.key === "Backspace") return { art: "loeschen" };
  if (t.key === "Escape") return { art: "abwaehlen" };
  return null;
}

export function istTextfeld(ziel: EventTarget | null): boolean {
  if (typeof Element === "undefined" || !(ziel instanceof Element)) return false;
  return ziel.closest('input, textarea, select, [contenteditable=""], [contenteditable="true"]') !== null;
}
