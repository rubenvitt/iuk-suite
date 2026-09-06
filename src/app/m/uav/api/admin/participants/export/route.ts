import { auditDelivery, auditActor } from "@/core/audit/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/hostRiegel";
import { adminZugang } from "../../../../_lib/requireUavAdmin";
import { csvAntwort } from "../../../../_lib/csv";
import { teilnehmerUebersicht } from "../../../../_lib/queries";

export const dynamic = "force-dynamic";

/** Überblick als CSV — eine Zeile pro Teilnehmer. Alt `admin.ts:53-64`. */
export async function GET(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const zugang = await adminZugang(); if (!zugang.ok) return zugang.response;
  return auditDelivery("uav", "export", "export", auditActor(zugang.viewer), async () => {
    const header = ["Name", "Beginn", "Erledigt", "Gesamt", "Quote", "LetzteAktivität", "Status"];
    const rows = teilnehmerUebersicht(getDb()).map((z) => [
      z.participant.name,
      z.participant.beginn ?? "",
      String(z.erledigt),
      String(z.gesamt),
      `${Math.round(z.quote * 100)}%`,
      z.participant.lastSeen ?? "",
      z.participant.aktiv ? "aktiv" : "inaktiv",
    ]);
    return csvAntwort([header, ...rows], "teilnehmer-uebersicht.csv");
  });
}
