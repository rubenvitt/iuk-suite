"use server";

import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { entferneLogo, setzeOrganisation } from "../_lib/briefkopf";
import type { EinfachErgebnis } from "../_lib/ergebnis";
import { bearbeiterAus, requireKommplanBearbeitenAktion } from "../_lib/zugang";

// Briefkopf (Spec §4.4): Organisationsname und „Logo entfernen". Hochladen ist der Route Handler `logo/route.ts`
// (Server Actions nehmen höchstens 1 MB an). Kein revalidatePath: die Seite ruft `router.refresh()`.

export async function speichereOrganisationAction(eingabe: unknown): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => setzeOrganisation(getDb(), eingabe, bearbeiterAus(viewer), Date.now()));
}

export async function entferneLogoAction(): Promise<EinfachErgebnis> {
  const viewer = await requireKommplanBearbeitenAktion();
  return withAuditContext({ actor: auditActor(viewer) }, async () => entferneLogo(getDb(), bearbeiterAus(viewer), Date.now()));
}
