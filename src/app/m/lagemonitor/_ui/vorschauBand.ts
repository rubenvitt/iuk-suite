"use client";

import { useEffect, useState } from "react";
import { STANDORT_VORGABE } from "../_lib/konfiguration";
import { istFaellig, type KategorieDTO } from "../_lib/kategorieRegeln";
import { MELDUNGEN_MAX_AKTIV, planeMeldung, sichtbar, type MeldungDTO } from "../_lib/meldungRegeln";
import type { Lage } from "../_lib/lagekarteRegeln";
import type { ZugangDTO } from "../_lib/schluessel";
import type { StandortDTO } from "../_lib/standort";
import { countdownText, type VorschauMeldung } from "../_lib/vorschau";
import type { MeldungEntwurf } from "./Meldungen";

/** Die Uhr erst nach dem Hydrieren: Server und Browser zählten sonst verschieden herunter. */
export function useJetzt(): number | null {
  const [jetzt, setJetzt] = useState<number | null>(null);
  useEffect(() => {
    const tick = () => setJetzt(Date.now());
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, []);
  return jetzt;
}

/**
 * Die Meldungen im Band der Vorschau, wie der Monitor sie gerade zeigt, und dahinter der getippte Entwurf.
 * Gemeinsam für „Meldungen" und „Einrichtung" (IDA-396), damit beide Vorschauen dasselbe Band zeigen.
 */
export function bandMeldungen(meldungen: MeldungDTO[], kategorien: KategorieDTO[], entwurf: MeldungEntwurf | null, jetzt: number | null): VorschauMeldung[] {
  const zaehler = (ziel: number | null) => (ziel !== null && jetzt !== null ? countdownText(ziel, jetzt) : null);
  const blinkt = (ziel: number | null, k: KategorieDTO | null) => jetzt !== null && istFaellig(ziel, k?.vorlaufMinuten ?? null, jetzt);
  // Wie am Monitor: höchstens drei begonnene. Ohne Uhr (Server, vor dem Hydrieren) die ohne späteren Beginn.
  const amMonitor = jetzt === null ? meldungen.filter((m) => m.anzeigenAb === null).slice(0, MELDUNGEN_MAX_AKTIV) : sichtbar(meldungen, jetzt);
  const laufend = amMonitor.map((m) => {
    const ziel = m.zeitpunkt ? Date.parse(m.zeitpunkt) : null;
    return { text: m.text, countdown: zaehler(ziel), kategorie: m.kategorie, faellig: blinkt(ziel, m.kategorie) };
  });
  if (!entwurf) return laufend;
  // Beginnt der Entwurf später oder stehen schon drei am Monitor, zeigt ihn der Monitor jetzt noch nicht.
  if (laufend.length >= MELDUNGEN_MAX_AKTIV) return laufend;
  const plan = jetzt === null ? null : planeMeldung({ uhrzeit: entwurf.uhrzeit, anzeigenAb: entwurf.anzeigenAb, laufzeitMinuten: 0 }, new Date(jetzt));
  if (plan?.anzeigenAb) return laufend;
  const ziel = plan?.zeitpunkt?.getTime() ?? null;
  const k = kategorien.find((x) => x.id === entwurf.kategorieId) ?? null;
  return [...laufend, { text: entwurf.text, countdown: zaehler(ziel), entwurf: true, kategorie: k, faellig: blinkt(ziel, k) }];
}

/** Die Vorschau zeigt den Namen des ersten Monitors mit Standort; jeder Monitor hat seinen eigenen. */
export function vorschauOrtVon(zugaenge: ZugangDTO[], standorte: Record<string, StandortDTO>): string {
  return zugaenge.map((x) => standorte[x.id]?.name).find((n): n is string => !!n) ?? "";
}

/** Die Lagekarte steht in der Vorschau und auf der Karte um den ersten Monitor mit Koordinaten. */
export function kartenMitte(zugaenge: ZugangDTO[], standorte: Record<string, StandortDTO>): Lage {
  const s = zugaenge.map((x) => standorte[x.id]).find((o) => o && o.breite !== null && o.laenge !== null);
  return s ? [s.laenge!, s.breite!] : [STANDORT_VORGABE.lon, STANDORT_VORGABE.lat];
}
