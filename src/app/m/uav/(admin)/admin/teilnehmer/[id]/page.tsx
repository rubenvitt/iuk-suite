import { notFound } from "next/navigation";
import { Button } from "antd";
import { getDb } from "../../../../_db/client";
import { NotFound, teilnehmerDetail } from "../../../../_lib/queries";
import { magicLink } from "../../../../_lib/magicLink";
import type { ParticipantDetailDTO } from "../../../../_lib/typen";
import { requireUavAdminPage } from "../../../../_lib/requireUavAdmin";
import { TeilnehmerDetail } from "../../../../_ui/admin/TeilnehmerDetail";
import { Seitenkopf } from "@/core/shell/Seitenkopf";

export const dynamic = "force-dynamic";

/**
 * `/admin/teilnehmer/<id>` — Detail-Auswertung, Stammdaten, Code und Magic-
 * Link (Aufgabe 16). `teilnehmerDetailInhalt` ist die reine, exportierte
 * Inhaltsfunktion (Vorbild `personenInhalt`) — `magicLink()` läuft HIER,
 * serverseitig, aus `getModule("uav")`/`SUITE_HOST_UAV` (nie `AUTH_URL`, nie
 * `headers().host`).
 *
 * DER KOPF LIEGT IN DER SEITE, DIE INSEL DARUNTER — Vorbild
 * `files/(verwaltung)/shares/[id]/page.tsx`. Vorher baute die Client-Insel drei
 * Dinge selbst nach, die `core/shell/Seitenkopf` schon kann, und jedes davon
 * schlechter:
 *
 *   · den RÜCKWEG als nacktes `<a href="/admin">← Teilnehmer</a>`. Ein `<a>`
 *     warf die Anwendung weg und lud sie neu, es trug antds `colorLink` (also
 *     Suite-Rot, Falle 3), es stand ohne `<nav>`-Landmark da (per Screenreader
 *     springt man zwischen Landmarks) und es unterbot die 44px-Tapfläche.
 *   · die ÜBERSCHRIFT als eigenes `<h1>` in einer eigenen Flex-Zeile.
 *   · den CSV-WEG als roten TEXTLINK neben der Überschrift — eine Handlung, die
 *     wie ein Fehler aussah und keine Knopffläche hatte.
 *
 * `Seitenkopf` trägt kein `"use client"`; er gehört deshalb hierher und nicht in
 * die Insel — und `<Button href>` ist in einer Server Component sicher (Falle 1
 * betrifft nur Compound-Zugriffe `Xxx.Yyy`).
 *
 * DIE ÜBERSCHRIFT IST DAMIT DER SERVER-STAND DES NAMENS. Ändert jemand den Namen
 * im Formular darunter, ruft die Insel `teilnehmerAendernAction` auf, die
 * `revalidatePath` auf genau diesen Pfad legt — die Antwort der Server Action
 * bringt den neuen Kopf mit. Ein zweiter Client-Zustand für dieselbe Zeichenkette
 * wäre eine zweite Wahrheit.
 */
export function teilnehmerDetailInhalt(detail: ParticipantDetailDTO) {
  return (
    <>
      <Seitenkopf
        titel={detail.participant.name}
        beschreibung="Stammdaten ändern, den Zugang neu vergeben und nachlesen, welche Aufgabe wie oft geübt wurde."
        zurueck={{ titel: "Teilnehmer", href: "/admin" }}
        aktionen={
          <Button href={`/api/admin/participants/${detail.participant.id}/export`}>
            Auswertung als CSV
          </Button>
        }
      />
      <TeilnehmerDetail detail={detail} magicLink={magicLink(detail.participant.loginCode)} />
    </>
  );
}

export default async function AdminTeilnehmerDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requireUavAdminPage();
  const { id } = await params;
  let detail: ParticipantDetailDTO;
  try {
    detail = teilnehmerDetail(getDb(), id);
  } catch (e) {
    if (e instanceof NotFound) notFound();
    throw e;
  }
  return teilnehmerDetailInhalt(detail);
}
