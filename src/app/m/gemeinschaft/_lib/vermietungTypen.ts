import type { Eintrag } from "./belegung";
import type { VertragStand } from "./vermietungText";
import type { Rolle, Vertragsfeld, Werte } from "./vertragFeld";

/**
 * Die Datenformen der Vermietung, ohne Datenbank-Import: die Client-Inseln der Leitung bekommen sie als Props und
 * rechnen damit (`_lib/vermietung.ts` zöge sonst drizzle und `node:crypto` in den Browser).
 */

export type AnfrageStatus = "angefragt" | "zugesagt" | "abgelehnt" | "zurueckgezogen";

/** Eine Anfrage für die Leitung — ohne die PDF-Bytes, nur deren Kenndaten. */
export type AnfrageDTO = {
  id: string; status: AnfrageStatus; code: string; von: number; bis: number; anlass: string; personen: number;
  person: string; kontakt: string; hinweis: string; mitglied: boolean; begruendung: string; vertrag: VertragStand;
  eingegangenAm: number; entschiedenAm: number | null;
  /** Je Art, immer alle drei in `DOKUMENTARTEN`-Reihenfolge: Vorlage da?, erstelltes Dokument, abgelegte Fassung (IDA-354). */
  dokumente: DokumentKurz[];
};

/** Die drei Dokumente einer Vermietung (IDA-354), in dieser Reihenfolge. */
export const DOKUMENTARTEN = ["mietvertrag", "uebergabe", "rueckgabe"] as const;
export type Dokumentart = (typeof DOKUMENTARTEN)[number];
export const DOKUMENT_TITEL: Record<Dokumentart, string> = { mietvertrag: "Mietvertrag", uebergabe: "Übergabeprotokoll", rueckgabe: "Rückgabeprotokoll" };
export const istDokumentart = (x: unknown): x is Dokumentart => typeof x === "string" && (DOKUMENTARTEN as readonly string[]).includes(x);

export type Abgelegt = { name: string; groesse: number; abgelegtAm: number; herkunft: Herkunft; unterschriebenVon: string | null };
/** `stand`: `null` = kein Dokument erstellt, sonst Entwurf oder freigegeben; `vorlage` = es lässt sich eins erstellen. */
export type DokumentKurz = { art: Dokumentart; vorlage: boolean; stand: "entwurf" | "freigegeben" | null; datei: Abgelegt | null };

/** Woher der abgelegte Vertrag kommt (IDA-343). */
export type Herkunft = "leitung" | "gezeichnet" | "hochgeladen";

/** Eine Vorlage für die Verwaltung, ohne Bytes. */
export type VorlageDTO = { art: Dokumentart; name: string; groesse: number; abgelegtAm: number; sha256: string; felder: Vertragsfeld[]; zeichnen: boolean };

/** Eine Unterschrift ohne Bild, für die Ausfüllseite. */
export type UnterschriftKurz = { feldId: string; rolle: Rolle; name: string; am: number };

/** Ein Dokument einer Anfrage für die Ausfüllseite der Leitung (IDA-354). */
export type DokumentDTO = {
  anfrageId: string; art: Dokumentart; felder: Vertragsfeld[]; werte: Werte; version: number; freigegebenAm: number | null;
  unterschriften: UnterschriftKurz[]; datei: Abgelegt | null; zeichnen: boolean;
  anfrage: { person: string; anlass: string; von: number; bis: number };
};

/**
 * Ein Dokument auf der Statusseite einer Zusage: zum Unterschreiben (freigegeben, `version` schickt die Seite mit,
 * `zeichnen` = darf dort gezeichnet werden, sonst nur der Upload) oder unterschrieben (`datei` gesetzt, wenn eine
 * Fassung liegt).
 */
export type StatusDokument =
  | { art: Dokumentart; stand: "offen"; version: number; zeichnen: boolean }
  | { art: Dokumentart; stand: "unterschrieben"; datei: { am: number; herkunft: Herkunft } | null };
export type VertragStatus = { stand: VertragStand; dokumente: StatusDokument[] };

/** Eine Sperrzeit für die Leitung; `eventId` gesetzt = aus einem Event abgeleitet, hier nicht löschbar. */
export type SperrzeitDTO = { id: string; von: number; bis: number; grund: string; eventId: string | null };

/** Was die anfragende Person auf ihrer Statusseite sieht — ihre eigenen Angaben und die Entscheidung. */
export type StatusDTO = Pick<AnfrageDTO, "status" | "von" | "bis" | "anlass" | "personen" | "person" | "kontakt" | "begruendung"> & {
  vertrag: VertragStatus | null;
};

export const anfrageAlsEintrag = (a: Pick<AnfrageDTO, "id" | "von" | "bis" | "anlass" | "status">): Eintrag =>
  ({ id: a.id, art: "anfrage", von: a.von, bis: a.bis, titel: a.anlass, zustand: a.status, eventId: null });
export const sperreAlsEintrag = (s: SperrzeitDTO): Eintrag =>
  ({ id: s.id, art: "sperre", von: s.von, bis: s.bis, titel: s.grund, zustand: "gesperrt", eventId: s.eventId });

