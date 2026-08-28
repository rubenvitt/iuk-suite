import { NextResponse } from "next/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { identitaetAus } from "../../_lib/identitaet";
import { fortschritt } from "../../_lib/queries";

export const dynamic = "force-dynamic";

const fehler = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Nur Teilnehmer — Admins sehen den Fortschritt über die Auswertung, nicht diesen Weg. */
export async function GET(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  const db = getDb();
  const identitaet = await identitaetAus(req, db);
  if (identitaet.kind !== "participant") return fehler(401, "unauthorized", "Nur für Teilnehmer");
  return NextResponse.json(fortschritt(db, identitaet.id));
}
