import type { VerlassenSperre } from "@/core/shell/verlassen";
import type { SpeicherZustand } from "./speicherer";

const KONFLIKT: VerlassenSperre = {
  titel: "Speicherkonflikt offen",
  text: "Deine letzten Änderungen am Diagramm gehen verloren.",
};

/**
 * Solange ein Konflikt offen ist, speichert der Editor nicht mehr (`speicherer.ts`) — wer die Seite
 * verlässt, verliert die lokale Fassung (IDA-357). „Neu laden" und „Meine Fassung behalten" heben
 * den Konflikt und damit die Sperre auf.
 */
export function konfliktSperre(zustand: SpeicherZustand): VerlassenSperre | null {
  return zustand.konflikt ? KONFLIKT : null;
}
