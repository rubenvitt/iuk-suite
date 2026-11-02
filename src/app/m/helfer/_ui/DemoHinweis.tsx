"use client";

import Link from "next/link";
import { Alert } from "antd";

/**
 * Der Hinweis auf jeder Seite, solange die Demo-Quelle eingestellt ist. Ein Client-Bauteil, weil
 * `Alert` mit `description` in einer Server Component nicht sicher ist (Falle 1).
 */
export function DemoHinweis({ darfVerwalten }: { darfVerwalten: boolean }) {
  return (
    <Alert
      type="info"
      showIcon
      data-testid="demo-hinweis"
      title="Demo-Modus"
      description={
        <>
          Alle Personen sind erfunden.
          {darfVerwalten ? <> <Link href="/einstellungen">Quelle ändern</Link></> : null}
        </>
      }
    />
  );
}
