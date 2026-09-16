import { auditDelivery, auditActor } from "@/core/audit/server";
import { blatt } from "@/core/export";
import { xlsxAntwort } from "@/core/export/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/hostRiegel";
import { adminZugang } from "../../../../_lib/requireUavAdmin";
import {
  UEBERSICHT_BLATT,
  UEBERSICHT_DATEINAME,
  UEBERSICHT_SPALTEN,
} from "../../../../_lib/export";
import { teilnehmerUebersicht } from "../../../../_lib/queries";

export const dynamic = "force-dynamic";

/**
 * Überblick als Excel-Mappe — eine Zeile pro Teilnehmer. Alt `admin.ts:53-64`,
 * seit DRK-186 `.xlsx` statt `.csv`.
 *
 * ⚠️ DER ÄUSSERE PFAD BLEIBT `/api/admin/participants/export` — ohne Endung, und
 * das war schon vorher so. Nur der Dateiname im `Content-Disposition` wechselt;
 * die beiden Knöpfe in der Oberfläche zeigen unverändert hierher.
 */
export async function GET(req: Request) {
  const ab = hostAbweisung(req); if (ab) return ab;
  const zugang = await adminZugang(); if (!zugang.ok) return zugang.response;
  return auditDelivery("uav", "export", "participant_collection", auditActor(zugang.viewer), async (target) => {
    target("participants");
    const zeilen = teilnehmerUebersicht(getDb()).map((z) => ({
      name: z.participant.name,
      beginn: z.participant.beginn,
      erledigt: z.erledigt,
      gesamt: z.gesamt,
      quoteProzent: Math.round(z.quote * 100),
      letzteAktivitaet: z.participant.lastSeen,
      aktiv: z.participant.aktiv,
    }));
    return xlsxAntwort(UEBERSICHT_DATEINAME, [
      blatt(UEBERSICHT_BLATT, UEBERSICHT_SPALTEN, zeilen),
    ]);
  });
}
