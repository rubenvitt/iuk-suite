"use client";

import type { ReactNode } from "react";
import { Tabs } from "antd";
import { SCHRIFT } from "../../../../_lib/schrift";
import { reiterAus, START_REITER, type ReiterSchluessel } from "./reiter";
import { useAdressParameter } from "./useAdressParameter";

export type FahrzeugReiterEintrag = {
  schluessel: ReiterSchluessel;
  titel: string;
  /** Kurzer Zusatz hinter dem Titel, z. B. „210" oder „2 abgelaufen". */
  zusatz?: string;
  inhalt: ReactNode;
};

/**
 * DIE REITER DES EINHEITENBLATTS (IDA-232).
 *
 * Bis hierher stand alles untereinander — Art, Vorlage, 200 Soll-Zeilen,
 * Plomben und DANACH der Verfall, bei einem großen Fahrzeug ab rund 17 000px.
 * Was im Alltag gebraucht wird (was ist abgelaufen, was fehlt), lag damit am
 * weitesten unten. Jetzt öffnet das Blatt auf „Bestand & Verfall", die
 * Einrichtung liegt in eigenen Reitern.
 *
 * ⚠️ EINE INSEL, DIE NUR UMSCHALTET. Die Inhalte kommen fertig aus der Server
 * Component (`inhalt`); `Tabs` ist ein Client-Bauteil und darf deshalb nur hier
 * stehen (Falle 1).
 *
 * ⚠️ NICHT AKTIVE REITER WERDEN ERST BEIM ERSTEN ÖFFNEN EINGEHÄNGT (antds
 * Vorgabe). Wer in e2e einen Inhalt greift, öffnet das Blatt mit `?reiter=…`.
 */
export function FahrzeugReiter({ reiter }: { reiter: FahrzeugReiterEintrag[] }) {
  const [ausAdresse, setzeReiter] = useAdressParameter("reiter", "neuer-eintrag");
  const aktiv = reiterAus(ausAdresse);

  return (
    <Tabs
      activeKey={aktiv}
      onChange={(schluessel) => setzeReiter(
        schluessel === START_REITER ? null : (schluessel as ReiterSchluessel),
      )}
      items={reiter.map((eintrag) => ({
        key: eintrag.schluessel,
        label: (
          <span>
            {eintrag.titel}
            {eintrag.zusatz ? (
              <span style={SCHRIFT.neben}>{` · ${eintrag.zusatz}`}</span>
            ) : null}
          </span>
        ),
        children: eintrag.inhalt,
      }))}
    />
  );
}
