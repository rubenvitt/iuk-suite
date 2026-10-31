/**
 * DER WÖCHENTLICHE PUSH — montags ab 7 Uhr in der Suite-Zone, einmal je Kalenderwoche und Person
 * (IDA-297). Jede Person mit Abo bekommt ihr eigenes Thema, darin nur die Module, die sie verwaltet,
 * und nur die Arten, die sie angewählt hat (`auswahl.ts`).
 *
 * Ein Prüfschritt alle `PRUEF_TAKT_MS` statt eines Weckers auf Montag 7:00: ein Container, der um 7 Uhr
 * gerade neu startet oder dessen ntfy kurz schweigt, holt die Nachricht beim nächsten Schritt nach. Die
 * gesendete Woche steht je Person in `faelligkeiten_abos` und überlebt so jeden Neustart — ohne sie
 * käme nach jedem Rollout am Montag eine zweite Nachricht.
 *
 * Wer etwas sehen darf, sagt Pocket ID (`personenGruppen.ts`), nicht der Stand vom letzten Besuch.
 * Antwortet Pocket ID nicht, wird in diesem Schritt an niemanden gesendet.
 *
 * Geht der Versand an eine Person schief, wird ihre Woche NICHT vermerkt, und der nächste Schritt
 * versucht es wieder. Ins Log kommt das einmal je Woche, nicht alle 15 Minuten.
 *
 * Ist nichts fällig, wird nichts gesendet (die Woche gilt trotzdem als erledigt). Eine Mitteilung
 * „nichts zu tun" jede Woche lehrt, die Mitteilungen wegzuwischen.
 *
 * Derselbe Start trägt den Sofort-Push (IDA-298, `sofort.ts`): ohne eingerichteten Versand gibt es
 * keinen der beiden.
 *
 * Kein `"use client"`. Zeitzone je Aufruf aus `core/zeit` (CLAUDE.md, „Zeitzone").
 */
import type { FaelligkeitenAbo } from "@/app/m/portal/_db/schema";
import { moduleUrl } from "@/core/shell/moduleUrl";
import { zeitzone } from "@/core/zeit";
import { abosMitPush, vermerkeWoche } from "./abos";
import { fuerPerson } from "./auswahl";
import { sendeZielFuer, versand, type SendeZiel, type Versand } from "./konfiguration";
import { baueNachricht, type PushNachricht } from "./nachricht";
import { personenGruppen, type GruppenJePerson } from "./personenGruppen";
import { QUELLEN, type FaelligkeitsQuelle } from "./quellen";
import { sammle, type FaelligkeitsGruppe } from "./sammeln";
import { sendeAnNtfy } from "./senden";
import { SOFORT_TAKT_MS, sofortschritt } from "./sofort";

export const SENDE_STUNDE = 7;
export const PRUEF_TAKT_MS = 15 * 60_000;
/** Der erste Schritt nicht beim Boot: die Seite soll zuerst antworten. */
export const ERSTER_SCHRITT_MS = 2 * 60_000;

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

export type Schrittstand = "aus" | "wartet" | "schon" | "fertig" | "fehler";

export interface Schrittergebnis {
  stand: Schrittstand;
  gesendet: number;
  /** Nichts fällig, oder die Person darf nichts (mehr) sehen. */
  leer: number;
  gescheitert: number;
}

export interface SchrittAbhaengigkeiten {
  jetzt: Date;
  zone: string;
  versand: Versand | null;
  abos: () => FaelligkeitenAbo[];
  /** `null`: kein Verzeichnis, es gilt `abo.gruppen`. Wirft, wenn das Verzeichnis nicht antwortet. */
  verzeichnis: () => Promise<GruppenJePerson | null>;
  quellen: readonly FaelligkeitsQuelle[];
  sammeln: (quellen: readonly FaelligkeitsQuelle[], jetzt: Date) => FaelligkeitsGruppe[];
  vermerkeWoche: (personId: string, woche: string) => void;
  seitenUrl: string | null;
  senden: (ziel: SendeZiel, n: PushNachricht) => Promise<void>;
  melden: (meldung: string) => void;
}

/**
 * Die Nachricht für eine Person — oder `null`, wenn für sie nichts ansteht. `gruppen` sind ihre
 * Gruppen (Verzeichnis oder Sitzung), `alle` die Gruppen aller Quellen.
 */
export function nachrichtFuerPerson(
  abo: Pick<FaelligkeitenAbo, "abgewaehlt">,
  gruppen: readonly string[],
  alle: readonly FaelligkeitsGruppe[],
  quellen: readonly FaelligkeitsQuelle[],
  seitenUrl: string | null,
): PushNachricht | null {
  const sichtbar = new Set(quellen.filter((q) => q.darfSehen(gruppen)).map((q) => q.modul));
  if (sichtbar.size === 0) return null;
  return baueNachricht(fuerPerson(alle, quellen, sichtbar, abo.abgewaehlt), seitenUrl);
}

let gemeldeteWoche: string | null = null;
/**
 * `<person>|<woche>`, an die in diesem Prozess schon gesendet wurde. Scheitert nach einem
 * erfolgreichen Versand nur das Vermerken der Woche (Datenbank gesperrt), schickte der nächste
 * Schritt sonst dieselbe Nachricht noch einmal.
 */
const lokalGesendet = new Set<string>();

function meldeEinmal(d: SchrittAbhaengigkeiten, woche: string, text: string): void {
  if (gemeldeteWoche === woche) return;
  gemeldeteWoche = woche;
  d.melden(`Was steht an: ${text}, nächster Versuch in 15 Minuten`);
}

function grund(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}

/** Ein Prüfschritt. Wirft nie. */
export async function wochenschritt(d: SchrittAbhaengigkeiten): Promise<Schrittergebnis> {
  const ergebnis: Schrittergebnis = { stand: "aus", gesendet: 0, leer: 0, gescheitert: 0 };
  let woche = "";
  try {
    if (!d.versand) return ergebnis;
    const fenster = sendefenster(d.jetzt, d.zone);
    woche = fenster.woche;
    if (!fenster.erreicht) return { ...ergebnis, stand: "wartet" };
    const offen = d.abos().filter((a) => a.gesendeteWoche !== woche);
    if (offen.length === 0) return { ...ergebnis, stand: "schon" };

    const verzeichnis = await d.verzeichnis();
    const alle = d.sammeln(d.quellen, d.jetzt);
    for (const abo of offen) {
      const gruppen = verzeichnis ? verzeichnis.get(abo.personId) ?? null : abo.gruppen;
      const nachricht = gruppen ? nachrichtFuerPerson(abo, gruppen, alle, d.quellen, d.seitenUrl) : null;
      const merker = `${abo.personId}|${woche}`;
      try {
        if (nachricht && !lokalGesendet.has(merker)) {
          await d.senden(sendeZielFuer(d.versand, abo.thema), nachricht);
          lokalGesendet.add(merker);
        }
        d.vermerkeWoche(abo.personId, woche);
        if (nachricht) ergebnis.gesendet += 1;
        else ergebnis.leer += 1;
      } catch (fehler) {
        ergebnis.gescheitert += 1;
        meldeEinmal(d, woche, `Push an ein Abo gescheitert — ${grund(fehler)}`);
      }
    }
    return { ...ergebnis, stand: ergebnis.gescheitert > 0 ? "fehler" : "fertig" };
  } catch (fehler) {
    meldeEinmal(d, woche, `wöchentlicher Push gescheitert — ${grund(fehler)}`);
    return { ...ergebnis, stand: "fehler" };
  }
}

/** Nur für Tests. */
export function _meldesperreZuruecksetzen(): void {
  gemeldeteWoche = null;
  lokalGesendet.clear();
}

/** Die Adresse der Seite „Was steht an" — Ziel des Tipps auf die Mitteilung. */
export function faelligkeitenSeitenUrl(): string | null {
  const portal = moduleUrl("portal");
  return portal ? `${portal}/faelligkeiten` : null;
}

let gestartet = false;

/**
 * Am Boot (`core/bootstrap.ts`, `startBackgroundWork`). Synchron, wirft nie, und ohne eingerichteten
 * Versand startet sie gar keinen Zeitgeber. Die Zeitgeber halten den Prozess nicht am Leben (`unref`).
 */
export function starteFaelligkeitenTakt(): void {
  if (gestartet) return;
  try {
    if (!versand()) return;
    gestartet = true;
    let laeuft = false;
    const schritt = async () => {
      if (laeuft) return;
      laeuft = true;
      try {
        await wochenschritt({
          jetzt: new Date(),
          zone: zeitzone(),
          versand: versand(),
          abos: () => abosMitPush(),
          verzeichnis: () => personenGruppen(),
          quellen: QUELLEN,
          sammeln: (q, j) => sammle(q, j),
          vermerkeWoche: (p, w) => vermerkeWoche(p, w),
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

    // IDA-298 — der Sofort-Push (`sofort.ts`) hängt an derselben Einrichtung und läuft jede Minute.
    let sofortLaeuft = false;
    const sofort = async () => {
      if (sofortLaeuft) return;
      sofortLaeuft = true;
      try {
        await sofortschritt({
          jetzt: new Date(),
          versand: versand(),
          abos: () => abosMitPush(),
          verzeichnis: () => personenGruppen(),
          quellen: QUELLEN,
          basis: (modul) => moduleUrl(modul),
          senden: (z, n) => sendeAnNtfy(z, n),
          melden: console.error,
        });
      } finally {
        sofortLaeuft = false;
      }
    };
    setInterval(() => void sofort(), SOFORT_TAKT_MS).unref?.();
  } catch (fehler) {
    console.error("Was steht an: Takt nicht gestartet —", fehler);
  }
}
