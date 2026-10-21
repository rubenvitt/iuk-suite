"use server";
import { revalidatePath } from "next/cache";
import { auditActor, auditEvent } from "@/core/audit/server";
import { RechteFehler, setzeMitgliedschaft } from "@/app/m/portal/_lib/rechte";
import { requireRechteVerwalter } from "@/app/m/portal/_lib/rechteZugang";

export type RechtErgebnis = { ok: true; geaendert: boolean } | { ok: false; fehler: string };

/**
 * Nimmt eine Person in eine Pocket-ID-Gruppe auf („an") oder heraus. Jede tatsächliche Änderung wird ein
 * Audit-Ereignis: Aufnahme als `create`, Entfernen als `delete` der Gruppenmitgliedschaft. Die Referenz
 * (Person und Gruppe) speichert das Audit-Log gehasht, wie jede andere.
 */
export async function setzeRechtAction(eingabe: {
  personId: string;
  gruppeId: string;
  mitglied: boolean;
}): Promise<RechtErgebnis> {
  const verwalter = await requireRechteVerwalter();
  const actor = auditActor(verwalter);
  try {
    const { geaendert, gruppe } = await setzeMitgliedschaft({
      personId: String(eingabe.personId),
      gruppeId: String(eingabe.gruppeId),
      mitglied: eingabe.mitglied === true,
      selbstId: verwalter.id,
    });
    if (geaendert) {
      auditEvent(
        {
          module: "portal",
          action: eingabe.mitglied ? "create" : "delete",
          objectType: "gruppenmitgliedschaft",
          objectRef: `${eingabe.personId}:${gruppe.name}`,
          result: "success",
          origin: "server",
        },
        actor,
      );
      revalidatePath("/m/portal/admin/rechte");
    }
    return { ok: true, geaendert };
  } catch (fehler) {
    auditEvent(
      {
        module: "portal",
        action: "update",
        objectType: "gruppenmitgliedschaft",
        objectRef: `${eingabe.personId}:${eingabe.gruppeId}`,
        result: fehler instanceof RechteFehler ? "denied" : "failure",
        origin: "server",
      },
      actor,
    );
    if (fehler instanceof RechteFehler) return { ok: false, fehler: fehler.message };
    console.error("[portal][rechte] Ändern fehlgeschlagen:", fehler);
    return { ok: false, fehler: "Pocket ID hat die Änderung nicht angenommen. Versuch es gleich noch einmal." };
  }
}
