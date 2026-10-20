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
          Die Helfer stammen aus einer eingebauten Beispielantwort im Format von HiOrg-Server, alle Personen sind erfunden.
          Das Einsatzbuch zeigt sie in seiner Vorschau, übernimmt sie aber nicht.
          {darfVerwalten ? <> Die echte Quelle stellst du unter <Link href="/einstellungen">Einstellungen</Link> ein.</> : null}
        </>
      }
    />
  );
}
