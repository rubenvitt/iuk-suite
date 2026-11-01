"use client";

import { Button } from "antd";
import { Icons8Ikone } from "@/core/ikonen/Icons8Ikone";

/**
 * Der Weg aus der Verwaltung zum laufenden Online-Monitor, oben im Seitenkopf. Neuer Tab, damit die
 * Verwaltung offen bleibt: wer eine Einstellung speichert, sieht sie daneben nach spätestens einer Minute.
 * Ohne `online` (Adresse aus `LAGEMONITOR_ONLINE_URL`, `_lib/online.ts`) gibt es kein Ziel und keinen Knopf.
 * Der Schrägstrich am Ende spart die Weiterleitung von `/monitor` auf `/monitor/`, die erst über http läuft.
 * Der zugängliche Name beginnt mit dem sichtbaren Text und sagt den neuen Tab dazu.
 */
export function ZumMonitor({ online }: { online: string | null }) {
  if (online === null) return null;
  const ziel = new URL(online);
  if (!ziel.pathname.endsWith("/")) ziel.pathname += "/";
  return (
    <Button href={ziel.toString()} target="_blank" rel="noopener noreferrer" icon={<Icons8Ikone name="monitor" groesse={16} />} aria-label="Live-Lagemonitor öffnen (neuer Tab)" data-testid="zum-monitor">
      Live-Lagemonitor öffnen
    </Button>
  );
}
