import { wartezeit, type SendeZustand } from "./senden";

const LAENGSTE_S = wartezeit(Number.MAX_SAFE_INTEGER) / 1000;

/**
 * Die Statuszeile zu einem Entwurf — EIN Wortlaut für alle Module, damit „nicht
 * gesendet" überall gleich aussieht. Reine Funktion ohne "use client"
 * (Falle 6, `CLAUDE.md`); die Module stellen sie in ihrem eigenen Markup dar.
 *
 * Nur Status, keine Erklärung (Projektregel): was zu tun ist, sagt der Knopf
 * daneben.
 */
export type EntwurfMeldung = { art: "nicht-gesendet" | "sendet" | "wiederhergestellt"; text: string };

export function entwurfMeldung(
  e: { zustand: SendeZustand; naechsterVersuch: number | null; wiederhergestellt: boolean },
  jetzt: number,
): EntwurfMeldung | null {
  if (e.zustand === "wartet") {
    const s = e.naechsterVersuch === null ? 0 : Math.min(LAENGSTE_S, Math.max(0, Math.ceil((e.naechsterVersuch - jetzt) / 1000)));
    return {
      art: "nicht-gesendet",
      text: s > 0 ? `Nicht gesendet. Neuer Versuch in ${s} s.` : "Nicht gesendet. Neuer Versuch läuft.",
    };
  }
  if (e.zustand === "sendet" && e.wiederhergestellt) return { art: "sendet", text: "Wird gesendet …" };
  if (e.wiederhergestellt && e.zustand === "ruhe") return { art: "wiederhergestellt", text: "Eingaben wiederhergestellt." };
  return null;
}
