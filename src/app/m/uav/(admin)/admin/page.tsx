import { Button } from "antd";
import { getDb } from "../../_db/client";
import { teilnehmerUebersicht } from "../../_lib/queries";
import { magicLink } from "../../_lib/magicLink";
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
 *
 * `magicLink()` LÄUFT HIER, SERVERSEITIG, je Zeile (Fix-Runde 1, Parität mit
 * `uav-praxis/src/admin/ParticipantsPage.tsx`) — sie liest `prodHostsFor()`/
 * die Registry (Aufgabe 16) und gehört deshalb nicht in `TeilnehmerTabelle.tsx`
 * (`"use client"`); der fertige String geht als Prop mit.
 *
 * `<Button href>` ist in einer Server Component sicher (kein Compound-Zugriff,
 * Falle 1 betrifft nur `Xxx.Yyy`-Zugriffe) — Vorbild `feedback/(admin)/
 * page.tsx`, `qr/admin/page.tsx`.
 */
export function teilnehmerInhalt(zeilen: ParticipantProgressDTO[]) {
  const mitLink = zeilen.map((zeile) => ({ ...zeile, magicLink: magicLink(zeile.participant.loginCode) }));

  return (
    <>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBlockEnd: SPACE.lg }}>
        <h1 style={{ ...SCHRIFT.titel, margin: 0 }}>Teilnehmer</h1>
        <Button href="/api/admin/participants/export">CSV</Button>
      </div>
      <TeilnehmerAnlegen />
      <TeilnehmerTabelle zeilen={mitLink} />
    </>
  );
}

export default async function AdminTeilnehmerPage() {
  await requireUavAdminPage();
  const zeilen = teilnehmerUebersicht(getDb());
  return teilnehmerInhalt(zeilen);
}
