/**
 * Die Planung der Gemeinschaft (IDA-320) als Daten, die eine Seite an ihre Client-Inseln reicht: nur
 * serialisierbare Felder (Falle 9). Dazu die reinen Helfer für Anzeige und Zählung, die Server und Browser
 * gleich rechnen. Kein `"use client"`: Server Components lesen diese Werte (Falle 6).
 */
import { zeitFormat } from "@/core/zeit";
import type { BarEintrag } from "./vorhabenBar";
import { tagInZone, uhrInZone } from "./zeit";

export type VorhabenArt = "event" | "projekt";

export type MitgliedWahl = { id: string; name: string };

export type AufgabeDTO = {
  id: string;
  titel: string;
  /** Kalendertag `JJJJ-MM-TT` oder `null`. */
  faellig: string | null;
  erledigt: boolean;
  /** Mitglieds-Kennungen in Namensreihenfolge. */
  zustaendig: string[];
};

/** Das Nötigste für eine Karte in Liste, Übersicht oder Projektseite. */
export type VorhabenKarteDTO = {
  id: string;
  art: VorhabenArt;
  titel: string;
  verantwortlich: MitgliedWahl | null;
  von: number | null;
  bis: number | null;
  ort: string;
  barBelegen: boolean;
  ziel: string | null;
  projekt: { id: string; titel: string } | null;
  /** Nur bei Projekten: Zahl der zugehörigen Events. */
  events: number;
  aufgaben: number;
  erledigt: number;
  /** Offene Aufgaben ohne Zuständige. */
  ohneZustaendige: number;
  vorbei: boolean;
};

export type VorhabenDetailDTO = VorhabenKarteDTO & {
  beschreibung: string;
  verantwortlichId: string | null;
  projektId: string | null;
  aufgabenListe: AufgabeDTO[];
  /** Bei Projekten: die zugehörigen Events, nach Beginn. */
  eventKarten: VorhabenKarteDTO[];
};

/** Was das Formular zum Bearbeiten vorbelegt. */
export type VorhabenVorlage = {
  id?: string;
  art: VorhabenArt;
  titel?: string;
  beschreibung?: string;
  verantwortlichId?: string | null;
  von?: number | null;
  bis?: number | null;
  ort?: string;
  barBelegen?: boolean;
  projektId?: string | null;
  ziel?: string | null;
};

/** Was das Formular zur Auswahl braucht; die Seite lädt es auf dem Server (`formularDaten`). */
export type FormularDaten = {
  mitglieder: MitgliedWahl[];
  projekte: { id: string; titel: string }[];
  /** Die Belegung der Bar ab heute (für die Konfliktanzeige beim Schalter „Bar belegen“). */
  bar: BarEintrag[];
};

/**
 * Die Seite eines Vorhabens liegt unter seiner Liste, damit die Seitenleiste „Events“ bzw. „Projekte“ markiert
 * (IDA-398; die Markierung folgt dem Pfadanfang). Die Art ändert sich nach dem Anlegen nie.
 */
export function vorhabenPfad(art: VorhabenArt, id: string): string {
  return `${art === "event" ? "/events" : "/projekte"}/${id}`;
}

/** Ein Event ist vorbei, wenn sein Ende vor `jetzt` liegt; ein Projekt ist nie vorbei. */
export function istVorbei(v: { art: VorhabenArt; bis: number | null }, jetzt: number): boolean {
  return v.art === "event" && v.bis !== null && v.bis <= jetzt;
}

export function fortschritt(v: { aufgaben: number; erledigt: number }): number {
  return v.aufgaben ? Math.round((v.erledigt / v.aufgaben) * 100) : 0;
}

export function kuerzel(name: string): string {
  return name.split(/\s+/).filter(Boolean).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
}

/* ── Zeit als Text ──────────────────────────────────────────────────────────── */

const WOCHENTAG = zeitFormat("de-DE", { weekday: "short" });
const TAG_MONAT_JAHR = zeitFormat("de-DE", { day: "numeric", month: "short", year: "numeric" });

/** `Sa, 28. Nov. 2026` in der Suite-Zone. */
export function tagText(ms: number): string {
  return `${WOCHENTAG.format(ms).replace(/\.$/, "")}, ${TAG_MONAT_JAHR.format(ms)}`;
}

/**
 * Der Zeitraum eines Events wie im POC: am selben Tag `Sa, 28. Nov. 2026, 14:00–21:00 Uhr`, über
 * Mitternacht bis in den frühen Morgen „(bis in die Nacht)“, sonst mit beiden Tagen.
 */
export function zeitraumText(von: number, bis: number): string {
  const tagA = tagInZone(von), tagB = tagInZone(bis);
  const uhr = `${uhrInZone(von)}–${uhrInZone(bis)} Uhr`;
  if (tagA === tagB) return `${tagText(von)}, ${uhr}`;
  const [h] = uhrInZone(bis).split(":").map(Number);
  if (tagesAbstand(tagA, tagB) === 1 && h < 8) return `${tagText(von)}, ${uhr} (bis in die Nacht)`;
  return `${tagText(von)}, ${uhrInZone(von)} Uhr – ${tagText(bis)}, ${uhrInZone(bis)} Uhr`;
}

/** Tage von `a` bis `b` (Kalendertage `JJJJ-MM-TT`). */
export function tagesAbstand(a: string, b: string): number {
  const ms = (t: string) => { const [j, m, d] = t.split("-").map(Number); return Date.UTC(j, m - 1, d); };
  return Math.round((ms(b) - ms(a)) / 86_400_000);
}

/*
 * Kalendertage (Fälligkeit, Zieltermin) haben keine Uhrzeit und keine Zone: als Mitternacht UTC gelesen
 * und in UTC formatiert (die Ausnahme aus CLAUDE.md „Zeitzone“). Deshalb hier `timeZone: "UTC"`.
 */
const kalendertag = (optionen: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat("de-DE", { ...optionen, timeZone: "UTC" });
const KT_KURZ = kalendertag({ day: "numeric", month: "short" });
const KT_WT = kalendertag({ weekday: "short" });
const KT_LANG = kalendertag({ weekday: "short", day: "numeric", month: "long", year: "numeric" });
const KT_MITTEL = kalendertag({ day: "numeric", month: "short", year: "numeric" });
const alsUtc = (iso: string) => { const [j, m, d] = iso.split("-").map(Number); return Date.UTC(j, m - 1, d); };

/** `6. Nov.` */
export function kalendertagKurz(iso: string): string {
  return KT_KURZ.format(alsUtc(iso));
}

/** `Fr, 6. Nov.` */
export function kalendertagMitWochentag(iso: string): string {
  return `${KT_WT.format(alsUtc(iso)).replace(/\.$/, "")}, ${KT_KURZ.format(alsUtc(iso))}`;
}

/** `So., 29. November 2026` → `So, 29. November 2026` */
export function kalendertagLang(iso: string): string {
  return KT_LANG.format(alsUtc(iso)).replace(/^(\p{L}+)\.,/u, "$1,");
}

/** `29. Nov. 2026` */
export function kalendertagMittel(iso: string): string {
  return KT_MITTEL.format(alsUtc(iso));
}

/** Die Fälligkeit als Satzteil, relativ zu `heute`; `warn` bei überfällig und heute. */
export function faelligText(faellig: string | null, heute: string, erledigt = false): { text: string; warn: boolean } | null {
  if (!faellig) return null;
  if (erledigt) return { text: `war fällig ${kalendertagKurz(faellig)}`, warn: false };
  const diff = tagesAbstand(heute, faellig);
  if (diff < 0) return { text: `überfällig seit ${kalendertagKurz(faellig)}`, warn: true };
  if (diff === 0) return { text: "fällig heute", warn: true };
  if (diff === 1) return { text: "fällig morgen", warn: false };
  return { text: `fällig ${kalendertagMitWochentag(faellig)}`, warn: false };
}

const DB_MONAT = zeitFormat("de-DE", { month: "short" });
const DB_TAG = zeitFormat("de-DE", { day: "numeric" });

/** Die drei Zeilen des Datumsblocks (`NOV.` / `28` / `SA`) in der Suite-Zone. */
export function datumsblock(ms: number): { monat: string; tag: string; wochentag: string } {
  return { monat: DB_MONAT.format(ms), tag: DB_TAG.format(ms), wochentag: WOCHENTAG.format(ms).replace(/\.$/, "") };
}
