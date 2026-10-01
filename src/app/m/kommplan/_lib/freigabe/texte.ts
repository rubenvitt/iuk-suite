import { STAND_ZEIT } from "../rahmen";
import type { FreigabeZeile } from "./regeln";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
export const ZEIT = STAND_ZEIT;

/** Texte eines Links — geteilt von Teilen-Flyin, (Task 10) Plan-Flyin und Druckdaten. Rein; der Status kommt vom Server. */
export function ablaufText(f: Pick<FreigabeZeile, "status" | "ablauf" | "widerrufenAm">): string {
  if (f.status === "widerrufen") return `widerrufen am ${ZEIT.format(f.widerrufenAm!)}`;
  if (f.status === "abgelaufen") return `abgelaufen am ${ZEIT.format(f.ablauf!)}`;
  return f.ablauf === null ? "unbegrenzt gültig" : `gültig bis ${ZEIT.format(f.ablauf)}`;
}
export function abrufText(f: Pick<FreigabeZeile, "abrufe" | "zuletztAbgerufen">): string {
  if (f.abrufe === 0 || f.zuletztAbgerufen === null) return "noch nie abgerufen";
  return `${f.abrufe} ${f.abrufe === 1 ? "Abruf" : "Abrufe"}, zuletzt ${ZEIT.format(f.zuletztAbgerufen)}`;
}

/** Wohin der QR des Ausdrucks führt (Entscheidung 10) — Plan-Flyin, Teilen-Flyin und Druckseite sagen es gleich. */
export function qrZielSatz(f: { notiz: string | null; ablauf: number | null }): string {
  const name = f.notiz ? `„${f.notiz}“` : "den Link ohne Notiz";
  return f.ablauf === null
    ? `Der QR-Code führt auf ${name} – unbegrenzt gültig.`
    : `Der QR-Code führt auf ${name} – gültig bis ${ZEIT.format(f.ablauf)}; danach führt der Ausdruck ins Leere.`;
}
