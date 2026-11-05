import { auditActor, auditDelivery } from "@/core/audit/server";
import { getDb } from "../../../../../../_db/client";
import { ansichtPdf } from "../../../../../../_lib/dokumentErzeugen";
import { hostAbweisung } from "../../../../../../_lib/host";
import { dokumentGrundlage } from "../../../../../../_lib/vermietung";
import { idSchema } from "../../../../../../_lib/vermietungEingabe";
import { ansichtKopf } from "../../../../../../_lib/vermietungPdf";
import { istDokumentart } from "../../../../../../_lib/vermietungTypen";
import { leitungImHandler } from "../../../../../../_lib/vermietungZugang";
import { NICHT_DA, pdfAntwort } from "../../../../../../_lib/uploadLesen";
import { dokumentDateiname } from "../../../../../../_lib/vertragName";

/**
 * `GET /vermietung/dokument/<id>/<art>/ansicht` — das Dokument einer Zusage so, wie es gerade steht (Werte und
 * Unterschriften, die es gibt), zum Ansehen für die Leitung (IDA-354). Riegel wie die anderen Handler: Host → Leitung →
 * Kennung → Zeile, sonst ein 404 ohne Rumpf.
 */
type Ctx = { params: Promise<{ id: string; art: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const viewer = await leitungImHandler();
  if (!viewer) return NICHT_DA();
  return auditDelivery("gemeinschaft", "download", "vertragsdokument", auditActor(viewer), async (target) => {
    const { id, art } = await ctx.params;
    if (!idSchema.safeParse(id).success || !istDokumentart(art)) return NICHT_DA();
    const g = dokumentGrundlage(getDb(), id, art);
    if (!g || g.anfrage.status !== "zugesagt") return NICHT_DA();
    target(JSON.stringify([id, art]));
    return pdfAntwort(await ansichtPdf(g, art), ansichtKopf(dokumentDateiname(art, g.anfrage.von, false)));
  });
}
