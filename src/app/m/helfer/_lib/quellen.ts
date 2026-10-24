/**
 * Die Quellen des Helferverzeichnisses. Eine eigene Datei ohne Datenbank-Import, damit auch die
 * Inseln die Namen lesen können (`einstellungen.ts` zöge drizzle ins Client-Bundle).
 */
export const QUELLEN = ["demo", "hiorg", "datei"] as const;
export type Quelle = (typeof QUELLEN)[number];

export const QUELLE_TEXT: Record<Quelle, string> = { demo: "Demo", hiorg: "HiOrg-Server", datei: "Excel-Datei" };
