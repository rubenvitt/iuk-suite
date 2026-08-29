import { Button } from "antd";
import { getDb } from "../../_db/client";
import { teilnehmerUebersicht } from "../../_lib/queries";
import { magicLink } from "../../_lib/magicLink";
import type { ParticipantProgressDTO } from "../../_lib/typen";
import { requireUavAdminPage } from "../../_lib/requireUavAdmin";
import { TeilnehmerAnlegen } from "../../_ui/admin/TeilnehmerAnlegen";
import { TeilnehmerTabelle } from "../../_ui/admin/TeilnehmerTabelle";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

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
 *
 * DER KOPF IST `core/shell/Seitenkopf` UND KEIN EIGENES `<h1>` MEHR. Hier stand
 * eine handgebaute Flex-Zeile mit Überschrift und CSV-Knopf; jede andere
 * Verwaltungsseite der Suite (portal, feedback, files, lagerbuch, qr) benutzt
 * denselben Baustein, und drei Abweichungen in einem Modul lesen sich als
 * fremde Anwendung. `Seitenkopf` trägt kein `"use client"` und rendert ein
 * nacktes `<h1>` statt `Typography.Title` — genau deshalb ist er in dieser
 * Server Component richtig (Falle 1).
 *
 * DER CSV-KNOPF HEISST JETZT „Liste als CSV" UND NICHT MEHR „CSV". „CSV" nennt
 * ein Dateiformat und nicht die Handlung; daneben steht auf der Detailseite ein
 * zweiter Ausgabeweg für EINEN Teilnehmer, und die beiden waren als „CSV" und
 * „Detail-CSV" nicht auseinanderzuhalten.
 */
export function teilnehmerInhalt(zeilen: ParticipantProgressDTO[]) {
  const mitLink = zeilen.map((zeile) => ({ ...zeile, magicLink: magicLink(zeile.participant.loginCode) }));

  return (
    <>
      <Seitenkopf
        titel="Teilnehmer"
        beschreibung="Hier legst du Teilnehmer an, gibst ihnen ihren Zugang weiter und siehst, wie weit jede und jeder im Training ist."
        aktionen={<Button href="/api/admin/participants/export">Liste als CSV</Button>}
      />
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
