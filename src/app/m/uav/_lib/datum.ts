// KEIN "use client" (Falle 6) — von Client-Komponenten UND Server Components
// gelesen (Aufgabe 15/16 rendern Datumswerte teils direkt in einer Server
// Component, teils in `_ui/admin/*`).
import { zeitFormat } from "@/core/zeit";

/**
 * Zeitstempel-Formatierung der Verwaltung (Fix-Runde 1, Aufgabe 15–17):
 * ISO-Strings (`beginn`, `lastSeen`, `letzteAktivitaet`, `letzteDurchfuehrung`)
 * kamen bisher roh auf den Bildschirm (`2026-08-29T09:14:22.481Z`) — Vorbild
 * `uav-praxis/src/admin/ParticipantsPage.tsx`s `formatDatum` (`toLocaleDateString
 * ("de-DE")`), hier in der Suite-Zone (`core/zeit`) statt der des
 * Server-Prozesses, damit Verwaltung und Teilnehmer dasselbe Datum sehen,
 * unabhängig davon, wo der Container läuft.
 */
const KURZ = zeitFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
});

const MIT_ZEIT = zeitFormat("de-DE", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
});

/** `dd.mm.yyyy` — leerer String für `null` oder einen ungültigen Wert. */
export function datumKurz(iso: string | null): string {
  if (!iso) return "";
  const datum = new Date(iso);
  return Number.isNaN(datum.getTime()) ? "" : KURZ.format(datum);
}

/** `dd.mm.yyyy, HH:MM` — leerer String für `null` oder einen ungültigen Wert. */
export function datumZeit(iso: string | null): string {
  if (!iso) return "";
  const datum = new Date(iso);
  return Number.isNaN(datum.getTime()) ? "" : MIT_ZEIT.format(datum);
}
