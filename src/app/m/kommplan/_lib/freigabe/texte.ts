import { zeitFormat } from "@/core/zeit";
import type { FreigabeZeile } from "./regeln";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").
export const ZEIT = zeitFormat("de-DE", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });

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
