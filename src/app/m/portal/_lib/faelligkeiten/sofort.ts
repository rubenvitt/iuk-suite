/**
 * DER SOFORT-PUSH (IDA-298) — Meldungen, die nicht bis Montag warten sollen (heute: gemeldete Mängel im
 * Lagerbuch), an dieselben Abos wie „Was steht an".
 *
 * Wer bekommt eine Meldung? Wer ein Abo mit eingeschaltetem Push hat, die Fälligkeiten des Moduls sehen
 * darf (dasselbe Prädikat wie Seite und Riegel, `quellen.ts`) und die Art nicht abgewählt hat. Die
 * Gruppen kommen wie beim Wochen-Push aus Pocket ID (`personenGruppen.ts`); antwortet es nicht, wartet
 * die Meldung auf den nächsten Schritt.
 *
 * Ein Schritt alle `SOFORT_TAKT_MS` statt eines Aufrufs aus dem Modul: das Portal liest die Module,
 * nicht umgekehrt (`quellen.ts`), und ein ntfy, der kurz schweigt, bekommt die Meldung beim nächsten
 * Schritt. Vermerkt wird eine Meldung erst, wenn sie jedes Abo erreicht hat oder niemand sie bekommen
 * soll; scheitert der Versand an eines, bleibt sie offen (längstens `SOFORT_FENSTER_MS`). Wer sie in
 * diesem Prozess schon bekam, bekommt sie beim Nachholen nicht noch einmal (`lokalGesendet`); nach einem
 * Neustart mitten im Nachholen kann sie doppelt kommen — lieber doppelt als nie.
 *
 * Nur Meldungen der letzten `SOFORT_FENSTER_MS`: wird der Push erst später eingerichtet, gehen alte
 * Meldungen nicht auf einmal hinaus — sie stehen ohnehin auf „Was steht an".
 *
 * Kein `"use client"`.
 */
import type { FaelligkeitenAbo } from "@/app/m/portal/_db/schema";
import type { Sofortmeldung } from "@/core/faelligkeiten";
import { artSchluessel } from "./auswahl";
import { sendeZielFuer, type SendeZiel, type Versand } from "./konfiguration";
import type { PushNachricht } from "./nachricht";
import type { GruppenJePerson } from "./personenGruppen";
import type { FaelligkeitsQuelle } from "./quellen";

export const SOFORT_TAKT_MS = 60_000;
export const SOFORT_FENSTER_MS = 24 * 60 * 60_000;

export interface SofortAbhaengigkeiten {
  jetzt: Date;
  versand: Versand | null;
  abos: () => FaelligkeitenAbo[];
  verzeichnis: () => Promise<GruppenJePerson | null>;
  quellen: readonly FaelligkeitsQuelle[];
  /** `https://<host des Moduls>` oder `null` — Ziel des Tipps auf die Mitteilung. */
  basis: (modul: string) => string | null;
  senden: (ziel: SendeZiel, n: PushNachricht) => Promise<void>;
  melden: (meldung: string) => void;
}

export interface SofortErgebnis {
  gesendet: number;
  gescheitert: number;
  vermerkt: number;
}

/** `<modul>|<meldung>|<person>` — schon gesendet in diesem Prozess. */
const lokalGesendet = new Set<string>();
let zuletztGemeldet = 0;

/** Nur für Tests. */
export function _sofortZuruecksetzen(): void {
  lokalGesendet.clear();
  zuletztGemeldet = 0;
}

/** Höchstens eine Logzeile je Viertelstunde — sonst schriebe ein schweigender ntfy jede Minute eine. */
function meldeGedrosselt(d: SofortAbhaengigkeiten, text: string): void {
  if (d.jetzt.getTime() - zuletztGemeldet < 15 * 60_000) return;
  zuletztGemeldet = d.jetzt.getTime();
  d.melden(`Sofort-Push: ${text}`);
}

function grund(fehler: unknown): string {
  return fehler instanceof Error ? fehler.message : String(fehler);
}

export function sofortNachricht(m: Sofortmeldung, basis: string | null): PushNachricht {
  return {
    title: m.titel,
    message: m.zeilen.join("\n") || m.art,
    priority: 4,
    tags: ["warning"],
    ...(basis ? { click: `${basis}${m.pfad}` } : {}),
  };
}

/** Ein Schritt. Wirft nie. */
export async function sofortschritt(d: SofortAbhaengigkeiten): Promise<SofortErgebnis> {
  const ergebnis: SofortErgebnis = { gesendet: 0, gescheitert: 0, vermerkt: 0 };
  if (!d.versand) return ergebnis;
  const seit = new Date(d.jetzt.getTime() - SOFORT_FENSTER_MS);
  try {
    const anstehend = d.quellen.flatMap((q) => {
      if (!q.sofort) return [];
      try {
        return q.sofort.lesen(seit).map((m) => ({ q, m }));
      } catch (fehler) {
        meldeGedrosselt(d, `${q.titel} nicht lesbar — ${grund(fehler)}`);
        return [];
      }
    });
    if (anstehend.length === 0) return ergebnis;

    const abos = d.abos();
    const verzeichnis = await d.verzeichnis();
    const vermerken = new Map<FaelligkeitsQuelle, string[]>();

    for (const { q, m } of anstehend) {
      const empfaenger = abos.filter((abo) => {
        const gruppen = verzeichnis ? verzeichnis.get(abo.personId) ?? null : abo.gruppen;
        return gruppen !== null && q.darfSehen(gruppen) && !abo.abgewaehlt.includes(artSchluessel(q.modul, m.art));
      });
      const nachricht = sofortNachricht(m, d.basis(q.modul));
      let erreicht = 0;
      for (const abo of empfaenger) {
        const merker = `${q.modul}|${m.id}|${abo.personId}`;
        if (lokalGesendet.has(merker)) { erreicht += 1; continue; }
        try {
          await d.senden(sendeZielFuer(d.versand, abo.thema), nachricht);
          lokalGesendet.add(merker);
          erreicht += 1;
          ergebnis.gesendet += 1;
        } catch (fehler) {
          ergebnis.gescheitert += 1;
          meldeGedrosselt(d, `an ein Abo gescheitert — ${grund(fehler)}`);
        }
      }
      if (erreicht === empfaenger.length) vermerken.set(q, [...(vermerken.get(q) ?? []), m.id]);
    }

    for (const [q, ids] of vermerken) {
      try {
        q.sofort!.vermerken(ids, d.jetzt);
        ergebnis.vermerkt += ids.length;
      } catch (fehler) {
        meldeGedrosselt(d, `${q.titel}: Versand nicht vermerkt — ${grund(fehler)}`);
      }
    }
  } catch (fehler) {
    meldeGedrosselt(d, `Schritt gescheitert — ${grund(fehler)}`);
  }
  return ergebnis;
}
