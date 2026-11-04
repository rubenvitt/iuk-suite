import { notFound } from "next/navigation";
import { auditActor, auditDenied } from "@/core/audit/server";
import { getDb } from "../../../../_db/client";
import { ladeInhalt } from "../../../../_lib/daten";
import { inhaltStand } from "../../../../_lib/schreiben";
import { verwaltetGruppe } from "../../../../_lib/zugang";
import { InhaltAmGeraet } from "../../../../_ui/telefon/InhaltAmGeraet";
import { geraetOder404 } from "../laden";

export const dynamic = "force-dynamic";

/** Inhaltsliste einer Materialkiste bearbeiten (IDA-335) — Verwalter ihrer Gruppe; die Gruppe kommt aus der Datenbank. */
export default async function InhaltSeite({ params }: { params: Promise<{ id: string }> }) {
  const { g, viewer, rechte } = await geraetOder404(params, "inhalt");
  if (!g.kiste) notFound();
  if (!verwaltetGruppe(rechte, g.gruppeId)) {
    auditDenied("wartung", auditActor(viewer));
    notFound();
  }
  const inhalt = ladeInhalt(getDb(), g.id);
  return <InhaltAmGeraet geraetId={g.id} geraetName={g.name} inhalt={inhalt} stand={inhaltStand(inhalt)} />;
}
