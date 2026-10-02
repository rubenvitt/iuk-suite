"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { loescheEigenesZeichen, speichereEigenesZeichen } from "../_lib/eigeneZeichenDb";
import type { EigenesZeichenErgebnis, EinfachErgebnis } from "../_lib/ergebnis";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Eigene Zeichen (Bibliothek, Reiter „Zeichen"): jede Action prüft selbst; Form, Bild, Dubletten und IDs in
// `_lib/eigeneZeichenDb.ts`. Der Browser schickt nur die Zusammenstellung — gezeichnet wird auf dem Server.

export async function speichereEigenesZeichenAction(eingabe: unknown): Promise<EigenesZeichenErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => speichereEigenesZeichen(getDb(), eingabe, bearbeiterAus(viewer), Date.now()));
}

export async function loescheEigenesZeichenAction(eingabe: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => loescheEigenesZeichen(getDb(), eingabe));
}
