"use server";

import { redirect } from "next/navigation";
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../_db/client";
import { requireEinsatzbuchAktion } from "../_lib/zugang";
import { erzeugeCode } from "../_lib/anbindung/einmalcode";
import { leseAnmeldeparameter, rueckrufUrl } from "../_lib/anbindung/anmeldeseite";

/**
 * Bestätigt die Ersetzen-Frage der Anmeldeseite (Entscheidung 1, Plan Stufe 5): ein neuer echter
 * Rechner widerruft den bisherigen. `art` steht bewusst NICHT unter den versteckten Feldern des
 * Formulars — die Frage erscheint nur, wenn `p.einrichtung?.art === "echt"` war, `art` ist hier
 * also immer „echt“ und wird fest ergänzt, bevor `leseAnmeldeparameter` die restlichen Felder
 * erneut prüft (`port`, `state`, `challenge`, `name` müssen exakt zur Anmeldung passen).
 */
export async function ersetzenBestaetigenAction(formData: FormData): Promise<void> {
  const viewer = await requireEinsatzbuchAktion();
  const p = leseAnmeldeparameter({
    port: String(formData.get("port") ?? ""),
    state: String(formData.get("state") ?? ""),
    challenge: String(formData.get("challenge") ?? ""),
    art: "echt",
    name: String(formData.get("name") ?? ""),
  });
  if (!p || !p.einrichtung) throw new Error("Anmeldung ungültig.");
  const einrichtung = p.einrichtung;

  const ziel = await withAuditContext({ actor: auditActor(viewer) }, () => {
    const db = getDb();
    const name = viewer.name?.trim() ? viewer.name : viewer.id;
    const code = erzeugeCode(db, {
      challenge: p.challenge, sub: viewer.id, name, jetzt: new Date(),
      einrichtung: { ...einrichtung, ersetzen: true },
    });
    return rueckrufUrl(p, { code });
  });
  redirect(ziel);
}
