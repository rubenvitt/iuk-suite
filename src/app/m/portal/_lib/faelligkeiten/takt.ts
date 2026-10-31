/**
 * DER WÖCHENTLICHE PUSH — montags ab 7 Uhr in der Suite-Zone, einmal je Kalenderwoche (IDA-297).
 *
 * Ein Prüfschritt alle `PRUEF_TAKT_MS` statt eines Weckers auf Montag 7:00: ein Container, der um 7 Uhr
 * gerade neu startet oder dessen ntfy kurz schweigt, holt die Nachricht beim nächsten Schritt nach. Die
 * gesendete Woche steht in `portal_einstellungen` und überlebt so jeden Neustart — ohne sie käme nach
 * jedem Rollout am Montag eine zweite Nachricht.
 *
 * Geht der Versand schief, wird die Woche NICHT vermerkt, und der nächste Schritt versucht es wieder.
 * Ins Log kommt das einmal je Woche, nicht alle 15 Minuten.
 *
 * Ist nichts fällig, wird nichts gesendet (die Woche gilt trotzdem als erledigt). Eine Mitteilung
 * „nichts zu tun" jede Woche lehrt, die Mitteilungen wegzuwischen.
 *
 * Kein `"use client"`. Zeitzone je Aufruf aus `core/zeit` (CLAUDE.md, „Zeitzone").
 */
import { eq } from "drizzle-orm";
import { getDb } from "@/app/m/portal/_db/client";
import { einstellungen } from "@/app/m/portal/_db/schema";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { zeitzone } from "@/core/zeit";
import { sendeZiel, type SendeZiel } from "./konfiguration";
import { baueNachricht, type PushNachricht } from "./nachricht";
import { QUELLEN } from "./quellen";
import { sammle, type FaelligkeitsGruppe } from "./sammeln";
import { sendeAnNtfy } from "./senden";

export const SENDE_STUNDE = 7;
export const PRUEF_TAKT_MS = 15 * 60_000;
/** Der erste Schritt nicht beim Boot: die Seite soll zuerst antworten. */
export const ERSTER_SCHRITT_MS = 2 * 60_000;
export const WOCHE_SCHLUESSEL = "faelligkeiten_push_woche";

const WOCHENTAG: Record<string, number> = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };

/** Kalenderwoche nach ISO 8601 („2026-W45") und ob Montag 7 Uhr in dieser Woche schon vorbei ist. */
export function sendefenster(jetzt: Date, zone: string): { woche: string; erreicht: boolean } {
  const teile = Object.fromEntries(
    new Intl.DateTimeFormat("en-US", {
      timeZone: zone, year: "numeric", month: "numeric", day: "numeric",
      hour: "numeric", hourCycle: "h23", weekday: "short",
    }).formatToParts(jetzt).map((t) => [t.type, t.value]),
  );
  const tag = WOCHENTAG[teile.weekday] ?? 1;
  const stunde = Number(teile.hour);
  // ISO-Woche: der Donnerstag derselben Woche bestimmt das Jahr.
  const datum = Date.UTC(Number(teile.year), Number(teile.month) - 1, Number(teile.day));
  const donnerstag = new Date(datum + (4 - tag) * 86_400_000);
  const jahr = donnerstag.getUTCFullYear();
  const woche = Math.ceil(((donnerstag.getTime() - Date.UTC(jahr, 0, 1)) / 86_400_000 + 1) / 7);
  return {
    woche: `${jahr}-W${String(woche).padStart(2, "0")}`,
    erreicht: tag > 1 || stunde >= SENDE_STUNDE,
  };
}

export type Schrittergebnis = "aus" | "wartet" | "schon" | "leer" | "gesendet" | "fehler";

export interface SchrittAbhaengigkeiten {
  jetzt: Date;
  zone: string;
  ziel: SendeZiel | null;
  leseWoche: () => string | null;
  schreibeWoche: (woche: string) => void;
  gruppen: (jetzt: Date) => FaelligkeitsGruppe[];
  seitenUrl: string | null;
  senden: (ziel: SendeZiel, n: PushNachricht) => Promise<void>;
  melden: (meldung: string) => void;
}

let gemeldeteWoche: string | null = null;

/** Ein Prüfschritt. Wirft nie. */
export async function wochenschritt(d: SchrittAbhaengigkeiten): Promise<Schrittergebnis> {
  try {
    if (!d.ziel) return "aus";
    const { woche, erreicht } = sendefenster(d.jetzt, d.zone);
    if (!erreicht) return "wartet";
    if (d.leseWoche() === woche) return "schon";
    const nachricht = baueNachricht(d.gruppen(d.jetzt), d.seitenUrl);
    if (nachricht) await d.senden(d.ziel, nachricht);
    d.schreibeWoche(woche);
    return nachricht ? "gesendet" : "leer";
  } catch (fehler) {
    const woche = sendefenster(d.jetzt, d.zone).woche;
    if (gemeldeteWoche !== woche) {
      gemeldeteWoche = woche;
      d.melden(`Was steht an: wöchentlicher Push gescheitert, nächster Versuch in 15 Minuten — ${fehler instanceof Error ? fehler.message : String(fehler)}`);
    }
    return "fehler";
  }
}

/** Nur für Tests. */
export function _meldesperreZuruecksetzen(): void {
  gemeldeteWoche = null;
}

export function leseGesendeteWoche(): string | null {
  return getDb().select().from(einstellungen).where(eq(einstellungen.schluessel, WOCHE_SCHLUESSEL)).get()?.wert ?? null;
}

export function vermerkeGesendeteWoche(woche: string): void {
  getDb().insert(einstellungen).values({ schluessel: WOCHE_SCHLUESSEL, wert: woche })
    .onConflictDoUpdate({ target: einstellungen.schluessel, set: { wert: woche } }).run();
}

/** Die Adresse der Seite „Was steht an" — Ziel des Tipps auf die Mitteilung. */
export function faelligkeitenSeitenUrl(): string | null {
  const portal = moduleUrl("portal");
  return portal ? `${portal}/faelligkeiten` : null;
}

/** Alle Quellen, ohne Rechteprüfung — nur für den Push, der an ein Thema geht und an keine Person. */
export function alleGruppen(jetzt: Date): FaelligkeitsGruppe[] {
  return sammle(QUELLEN, jetzt);
}

let gestartet = false;

/**
 * Am Boot (`core/bootstrap.ts`, `startBackgroundWork`). Synchron, wirft nie, und ohne eingerichteten
 * Versand startet sie gar keinen Zeitgeber. Die Zeitgeber halten den Prozess nicht am Leben (`unref`).
 */
export function starteFaelligkeitenTakt(): void {
  if (gestartet) return;
  try {
    if (!sendeZiel()) return;
    gestartet = true;
    let laeuft = false;
    const schritt = async () => {
      if (laeuft) return;
      laeuft = true;
      try {
        await wochenschritt({
          jetzt: new Date(),
          zone: zeitzone(),
          ziel: sendeZiel(),
          leseWoche: leseGesendeteWoche,
          schreibeWoche: vermerkeGesendeteWoche,
          gruppen: alleGruppen,
          seitenUrl: faelligkeitenSeitenUrl(),
          senden: (z, n) => sendeAnNtfy(z, n),
          melden: console.error,
        });
      } finally {
        laeuft = false;
      }
    };
    setTimeout(() => void schritt(), ERSTER_SCHRITT_MS).unref?.();
    setInterval(() => void schritt(), PRUEF_TAKT_MS).unref?.();
  } catch (fehler) {
    console.error("Was steht an: Takt nicht gestartet —", fehler);
  }
}
