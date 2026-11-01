import type { Eintrag } from "./belegung";
import type { VertragStand } from "./vermietungText";

/**
 * Die Datenformen der Vermietung, ohne Datenbank-Import: die Client-Inseln der Leitung bekommen sie als Props und
 * rechnen damit (`_lib/vermietung.ts` zöge sonst drizzle und `node:crypto` in den Browser).
 */

export type AnfrageStatus = "angefragt" | "zugesagt" | "abgelehnt" | "zurueckgezogen";

/** Eine Anfrage für die Leitung — ohne die PDF-Bytes, nur deren Kenndaten. */
export type AnfrageDTO = {
  id: string; status: AnfrageStatus; code: string; von: number; bis: number; anlass: string; personen: number;
  person: string; kontakt: string; hinweis: string; mitglied: boolean; begruendung: string; vertrag: VertragStand;
  eingegangenAm: number; entschiedenAm: number | null; datei: { name: string; groesse: number; abgelegtAm: number } | null;
};

/** Eine Sperrzeit für die Leitung; `eventId` gesetzt = aus einem Event abgeleitet, hier nicht löschbar. */
export type SperrzeitDTO = { id: string; von: number; bis: number; grund: string; eventId: string | null };

/** Was die anfragende Person auf ihrer Statusseite sieht — ihre eigenen Angaben und die Entscheidung. */
export type StatusDTO = Pick<AnfrageDTO, "status" | "von" | "bis" | "anlass" | "personen" | "person" | "kontakt" | "begruendung">;

export const anfrageAlsEintrag = (a: Pick<AnfrageDTO, "id" | "von" | "bis" | "anlass" | "status">): Eintrag =>
  ({ id: a.id, art: "anfrage", von: a.von, bis: a.bis, titel: a.anlass, zustand: a.status, eventId: null });
export const sperreAlsEintrag = (s: SperrzeitDTO): Eintrag =>
  ({ id: s.id, art: "sperre", von: s.von, bis: s.bis, titel: s.grund, zustand: "gesperrt", eventId: s.eventId });

