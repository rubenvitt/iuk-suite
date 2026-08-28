import { NextResponse } from "next/server";
import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { identitaetAus } from "../../_lib/identitaet";
import { alleTasks } from "../../_lib/queries";

export const dynamic = "force-dynamic";

const fehler = (status: number, code: string, message: string) => NextResponse.json({ error: { code, message } }, { status });

/** Teilnehmer oder Admin — der globale Aufgabenkatalog (nur aktive) für die Teilnehmer-App. */
export async function GET(req: Request) {
  const abweisung = hostAbweisung(req); if (abweisung) return abweisung;
  const db = getDb();
  const identitaet = await identitaetAus(req, db);
  if (identitaet.kind === "anon") return fehler(401, "unauthorized", "Anmeldung erforderlich");
  return NextResponse.json(alleTasks(db, false));
}
