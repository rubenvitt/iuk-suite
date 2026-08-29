import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/hostRiegel";
import { adminAbweisung } from "../../../../_lib/requireUavAdmin";
import { csvAntwort } from "../../../../_lib/csv";
import { teilnehmerUebersicht } from "../../../../_lib/queries";

export const dynamic = "force-dynamic";

/** Überblick als CSV — eine Zeile pro Teilnehmer. Alt `admin.ts:53-64`. */
export async function GET(req: Request) {
  const ab = hostAbweisung(req) ?? (await adminAbweisung()); if (ab) return ab;
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
}
