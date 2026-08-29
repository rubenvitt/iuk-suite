import { getDb } from "../../_db/client";
import { teilnehmerUebersicht } from "../../_lib/queries";
import type { ParticipantProgressDTO } from "../../_lib/typen";
import { requireUavAdminPage } from "../../_lib/requireUavAdmin";
import { TeilnehmerAnlegen } from "../../_ui/admin/TeilnehmerAnlegen";
import { TeilnehmerTabelle } from "../../_ui/admin/TeilnehmerTabelle";
import { SCHRIFT } from "@/core/theme/schrift";
import { SPACE } from "@/core/theme/tokens";

export const dynamic = "force-dynamic";

/**
 * `/admin` — die Teilnehmer-Übersicht (Aufgabe 15). `teilnehmerInhalt` ist die
 * reine, exportierte Inhaltsfunktion (Vorbild `aufgaben/personen/page.tsx`s
 * `personenInhalt`) — `page.test.tsx` ruft sie direkt, ohne Layout, ohne
 * Riegel.
 */
export function teilnehmerInhalt(zeilen: ParticipantProgressDTO[]) {
  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBlockEnd: SPACE.lg }}>
        <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>Teilnehmer</h1>
        <a href="/api/admin/participants/export">CSV</a>
      </div>
      <TeilnehmerAnlegen />
      <TeilnehmerTabelle zeilen={zeilen} />
    </>
  );
}

export default async function AdminTeilnehmerPage() {
  await requireUavAdminPage();
  const zeilen = teilnehmerUebersicht(getDb());
  return teilnehmerInhalt(zeilen);
}
