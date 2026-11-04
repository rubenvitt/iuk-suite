import { revalidatePath } from "next/cache";
import { auditActor, auditDelivery, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/host";
import { ladeVorlage, legeVorlageAb, RAUM } from "../../../../_lib/vermietung";
import { ansichtKopf, pruefePdf, VERTRAG_MAX_BYTES } from "../../../../_lib/vermietungPdf";
import { leitungImHandler } from "../../../../_lib/vermietungZugang";
import { jsonAntwort, leseDatei, NICHT_DA, pdfAntwort } from "../../../../_lib/uploadLesen";
import { scanneVertrag, scanSatz } from "../../../../_lib/vertragScan";
import { leseVorlage, sha256 } from "../../../../_lib/vertragUnterschrift";

/**
 * `GET /vermietung/vorlage/datei` liefert die Vertragsvorlage (die Verwaltung rendert daraus die Seiten zum
 * Aufziehen des Unterschriftenfelds), `POST` legt sie ab oder ersetzt sie (IDA-343). Riegel wie
 * `vermietung/vertrag/[id]/route.ts`: Host → Leitung; alles andere ist ein 404 ohne Rumpf.
 *
 * Reihenfolge beim Ablegen: PDF nach Magic Bytes → mit `pdf-lib` lesbar (sonst ließe sich später nichts einsetzen)
 * → clamd. Erst ein `clean` schreibt.
 */

export async function GET(req: Request): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const viewer = await leitungImHandler();
  if (!viewer) return NICHT_DA();
  return auditDelivery("gemeinschaft", "download", "vertragsvorlage", auditActor(viewer), async (target) => {
    const v = ladeVorlage(getDb());
    if (!v) return NICHT_DA();
    target(RAUM);
    return pdfAntwort(v.inhalt, ansichtKopf(v.name));
  });
}

export async function POST(req: Request): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (req.headers.get("sec-fetch-site") === "cross-site") return NICHT_DA();
  const viewer = await leitungImHandler();
  if (!viewer) return NICHT_DA();

  const d = await leseDatei(req, VERTRAG_MAX_BYTES, "Bitte eine PDF-Datei wählen.");
  if (!d.ok) return jsonAntwort(d.status, { ok: false, fehler: d.fehler });
  const pruefung = pruefePdf(d.name, d.typ, d.bytes);
  if (!pruefung.ok) return jsonAntwort(pruefung.status, { ok: false, fehler: pruefung.fehler });
  const lesbar = await leseVorlage(d.bytes);
  if (!lesbar.ok) return jsonAntwort(422, { ok: false, fehler: lesbar.fehler });
  const scan = await scanneVertrag(d.bytes);
  if (scan.art !== "clean") return jsonAntwort(scan.art === "infected" ? 422 : 503, { ok: false, fehler: scanSatz(scan) ?? "" });

  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    legeVorlageAb(getDb(), pruefung.name, d.bytes, sha256(d.bytes), Date.now());
    revalidatePath("/m/gemeinschaft", "layout");
    return jsonAntwort(200, { ok: true });
  });
}
