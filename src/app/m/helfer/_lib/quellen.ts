/**
 * Die Quellen des Helferverzeichnisses. Eine eigene Datei ohne Datenbank-Import, damit auch die
 * Inseln die Namen lesen können (`einstellungen.ts` zöge drizzle ins Client-Bundle).
 */
export const QUELLEN = ["demo", "hiorg", "datei"] as const;
export type Quelle = (typeof QUELLEN)[number];

export const QUELLE_TEXT: Record<Quelle, string> = { demo: "Demo", hiorg: "HiOrg-Server", datei: "Excel-Datei" };

/**
 * Der Text im Bestätigungsdialog eines Quellwechsels. Besteht ein Zugang für Lifeline Hub, sagt er zusätzlich,
 * dass die Personen neue Kennungen bekommen und Lifeline sie einmal neu zuordnen muss (LLH-1194, Entscheidung 7).
 */
export function quellwechselHinweis(anzahl: number, neu: Quelle, lifelineZugang: boolean): string {
  if (anzahl === 0) return neu === "datei" ? "Danach lädst du die Liste unter „Abgleich“ hoch." : "Danach holst du die Helfer unter „Abgleich“.";
  const basis = `Die ${anzahl} Helfer der bisherigen Quelle werden gelöscht. Danach holst du die neuen unter „Abgleich“.`;
  return lifelineZugang ? `${basis} Die Personen bekommen dabei neue Kennungen: Lifeline Hub muss sie danach einmal neu zuordnen.` : basis;
}
