"use client";

import { ViewTransition } from "react";
import { usePathname } from "next/navigation";

import { SEITENWECHSEL } from "@/core/shell/seitenwechselKlassen";

/**
 * DER INHALT BLENDET BEIM SEITENWECHSEL WEICH ÜBER (Haarlinie, Etappe 3) — nur unter `FullShell`.
 *
 * Reacts `<ViewTransition>` über die View Transitions API des Browsers; Next startet jede Navigation
 * als Transition, also läuft sie ohne Konfiguration (`node_modules/next/dist/docs/01-app/02-guides/
 * view-transitions.md`). Ohne Browser-Unterstützung wird schlicht navigiert.
 *
 * `key` IST DER PFAD, und das ist der Auslöser: wechselt er, verlässt der alte Inhalt die Grenze
 * (`exit`) und der neue betritt sie (`enter`). `default="none"` hält alles andere still — Suchparameter
 * (Filter, Reiter über `?…`), `router.refresh()` nach einer Server Action, das Nachstreamen hinter
 * `Suspense`. Der Preis: Client-Zustand in Layouts UNTER der Shell beginnt bei einem Pfadwechsel neu.
 *
 * Das Menü steht außerhalb und bewegt sich nicht; die Regeln (Dauer, Anker des Menüs, reduzierte
 * Bewegung) stehen in `globals.css` unter „SEITENWECHSEL".
 */
export function Seitenwechsel({ children }: { children: React.ReactNode }) {
  const pfad = usePathname();
  return (
    <ViewTransition key={pfad} enter={SEITENWECHSEL.ein} exit={SEITENWECHSEL.aus} default="none">
      {children}
    </ViewTransition>
  );
}
