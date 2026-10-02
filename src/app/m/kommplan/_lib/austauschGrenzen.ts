/**
 * Die zwei Zahlen des Austauschformats, die auch der Browser braucht (`(intern)/PlanImport.tsx`). Eigene Datei: der
 * Rest von `austausch.ts` liest die Datenbank und gehört nicht in ein Client-Bündel.
 */
export const AUSTAUSCH_ENDUNG = ".kommplan.json";
/** Eine Server Action nimmt höchstens 1 MB (`speichern.ts`, GRÖSSE); darunter mit Luft für die Hülle. */
export const AUSTAUSCH_MAX_BYTES = 900_000;
