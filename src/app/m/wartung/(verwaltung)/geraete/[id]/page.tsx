import { headers } from "next/headers";
import { notFound } from "next/navigation";
import { auditActor, auditDenied } from "@/core/audit/server";
import { qrSvg } from "@/core/qr";
import { getDb } from "../../../_db/client";
import { linkBasisAus, qrZiel } from "../../../_lib/ansicht";
import { bekannteOrte, ladeArten, ladeGeraet, ladeGruppen, ladeInhalt, ladeMaengel, ladeUnterlagen, ladeVerlauf } from "../../../_lib/daten";
import { idSchema } from "../../../_lib/eingabe";
import { heute } from "../../../_lib/heute";
import { requireVerwalter, verwaltetGruppe } from "../../../_lib/zugang";
import { GeraetAkte } from "../../../_ui/GeraetAkte";

export const dynamic = "force-dynamic";

/** Die Akte eines Geräts — nur für Verwalter seiner Gruppe; die Gruppe kommt aus der Datenbank (IDOR). */
export default async function AktenSeite({ params }: { params: Promise<{ id: string }> }) {
  const { viewer, rechte } = await requireVerwalter();
  const { id } = await params;
  if (!idSchema.safeParse(id).success) notFound();
  const db = getDb();
  const tag = heute();
  const g = ladeGeraet(db, id, tag);
  if (!g) notFound();
  if (!verwaltetGruppe(rechte, g.gruppeId)) {
    auditDenied("wartung", auditActor(viewer));
    notFound();
  }
  const kopf = await headers();
  return (
    <GeraetAkte
      g={g}
      inhalt={g.kiste ? ladeInhalt(db, id) : []}
      maengel={ladeMaengel(db, { gruppen: null, geraetId: id, offen: true })}
      verlauf={ladeVerlauf(db, { gruppen: null, geraetId: id, grenze: 200 })}
      unterlagen={ladeUnterlagen(db, id)}
      qr={await qrSvg(qrZiel(linkBasisAus(kopf), id))}
      heute={tag}
      arten={ladeArten(db).map((a) => ({ id: a.id, einzahl: a.einzahl }))}
      gruppen={ladeGruppen(db).filter((x) => verwaltetGruppe(rechte, x.id)).map((x) => ({ id: x.id, name: x.name }))}
      orte={bekannteOrte(db)}
    />
  );
}
