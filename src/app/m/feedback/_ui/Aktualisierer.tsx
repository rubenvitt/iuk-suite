"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";
import { Button } from "antd";

/**
 * SELBSTAKTUALISIERUNG DER LAUFENDEN KARTE (Entwurf §4.5, §2.3, §4.13-Tabelle).
 *
 * Warum es diese Insel überhaupt gibt: Die Karte hängt im Gruppenraum, während
 * die Leute noch tippen. Daneben steht serverseitig „Stand: 21:47". Ohne einen
 * Takt, der den Server erneut fragt, behauptet diese Zeile Aktualität für eine
 * Zahl, die seit dem ersten Rendern feststeht — laut §4.5 „die einzige Art, wie
 * diese Karte falsch informieren kann". Dieselbe Aktualisierung ist außerdem
 * die Voraussetzung dafür, dass das `aria-live="polite"` an der Stand-Zeile
 * (§4.14, genau einmal im Modul) etwas zu melden hat: ein Knoten, der nie
 * mutiert, ist eine tote Vorlesehilfe.
 *
 * Zwei Bedingungen, beide aus §4.5, beide bewusst:
 *
 * 1. **Nur bei laufender Umfrage.** Diese Bedingung ist hier absichtlich NICHT
 *    als Prop umgesetzt, sondern baulich: `Aktualisierer` steht ausschließlich
 *    in `LaufendeKarte`, und die entsteht in `Lagekarte` nur im Zweig
 *    `laufend !== null`. Damit gibt es weiterhin genau EINE Stelle, die über
 *    die Belegung entscheidet (§2.2) — ein `laeuft`-Prop wäre eine zweite,
 *    die immer `true` trägt. Der Testfall prüft die Bedingung deshalb am
 *    Verhalten der `Lagekarte`, nicht an einem Flag.
 * 2. **Nur bei sichtbarem Dokument.** Der Handy-Tab im Gruppenraum liegt oft
 *    im Hintergrund; ein `router.refresh()` alle 30s auf einem unsichtbaren
 *    Tab ist reine Serverlast ohne Leser. Die Prüfung liegt IM Intervall, nicht
 *    in einem `visibilitychange`-Abonnement: der Takt ist ohnehin grob, und ein
 *    zweiter Zustand (Listener + Intervall-Neuaufbau) wäre mehr Mechanik als
 *    Wirkung.
 *
 * Die Komponente rendert nichts (§2.3: „`Aktualisierer` (rendert nichts)").
 */

/** 30s laut §4.5. Exportiert, damit der Test nicht auf eine Zahl im Code rät. */
export const AKTUALISIERUNGS_TAKT_MS = 30_000;

export function Aktualisierer() {
  const router = useRouter();

  useEffect(() => {
    const takt = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      router.refresh();
    }, AKTUALISIERUNGS_TAKT_MS);
    return () => clearInterval(takt);
  }, [router]);

  return null;
}

/**
 * „AKTUALISIEREN" — der Textknopf neben „Stand: 21:47" (§4.5, §2.3-Fußzeile).
 *
 * Er ist die Handbremse zum Takt: wer die Karte gerade ansieht, wartet nicht
 * bis zu 30s, sondern fragt selbst. Absichtlich OHNE `loading`-Zustand: §4.5
 * lässt Ladeanzeigen nur aus `useActionState` (Formulare) und aus dem
 * `useTransition` eines `Popconfirm` zu — dieser Knopf hat beides nicht, und
 * ein eigener Spinner wäre genau die „Choreografie", die derselbe Abschnitt
 * für 50 Aufrufe im Jahr ablehnt. Die Rückmeldung ist die Zahl selbst, plus die
 * Stand-Zeile, die sich mitbewegt.
 *
 * KEIN `size="small"` MEHR (Nachtrag Task 11): die frühere Ausnahme richtete
 * sich gegen `size="large"` (72px) bzw. den 56px-Rückfall ohne `size` — mit
 * `ARBEITSDICHTE` (Task 5, `controlHeight: 44`) fällt ein Knopf ohne `size`
 * heute auf 44px, nicht mehr auf 56. Die Begründung „lauter als die Zahl, um
 * die es geht" trug damit nicht mehr, und `size="small"` unterbietet die
 * 44px-Tapfläche (WCAG 2.5.8) — dieselbe Korrektur wie bei den elf
 * Zeilenaktionen-Fundstellen der Aufgaben 8/9, hier an einem Textknopf statt
 * einer Tabellenzeile.
 *
 * Er liegt als GESCHWISTER der Stand-Zeile in der Fußzeile, nicht in ihr: die
 * Zeile trägt das einzige `aria-live="polite"` des Moduls (§4.14), und eine
 * Knopfbeschriftung in der Live-Region würde bei jeder Aktualisierung
 * mitvorgelesen.
 */
export function AktualisierenKnopf() {
  const router = useRouter();

  return (
    <Button type="text" onClick={() => router.refresh()}>
      Aktualisieren
    </Button>
  );
}
