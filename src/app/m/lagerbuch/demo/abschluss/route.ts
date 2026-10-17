import { getDb } from "../../_db/client";
import { hostAbweisung } from "../../_lib/hostRiegel";
import { demoCheckDaten } from "../../_lib/lesepfade/demo";
import { DEMO_EINGABE_TEXT, DemoNutzlastSchema, demoErgebnis } from "../../_lib/demoCheck";
import { verfallSchwellen } from "../../_lib/domain/verfall";

/**
 * DER ABSCHLUSS DES DEMO-CHECKS — IDA-224, voruebergehend (Rueckbau: IDA-225).
 *
 * Rechnet aus, was der echte Abschluss melden wuerde, und VERWIRFT es: keine
 * Transaktion, kein Audit-Kontext, kein `revalidatePath`, kein Cookie. Fremder
 * Host oder Demo aus → 404, wie die Seite.
 *
 * Ein Route Handler und keine Server Action, damit „Demo aus" auch hier ein
 * echtes HTTP 404 ist.
 */
export const dynamic = "force-dynamic";

/** Eine echte Nutzlast hat wenige Kilobyte; alles darueber ist kein Check. */
const MAX_BYTES = 256_000;

export async function POST(req: Request): Promise<Response> {
  const abgewiesen = hostAbweisung(req);
  if (abgewiesen) return abgewiesen;
  const daten = demoCheckDaten(getDb());
  if (!daten) return new Response("Not found", { status: 404 });

  if (Number(req.headers.get("content-length") ?? "0") > MAX_BYTES) {
    return new Response("Payload too large", { status: 413 });
  }
  const text = await req.text();
  let roh: unknown = null;
  if (text.length <= MAX_BYTES) {
    try { roh = JSON.parse(text); } catch { roh = null; }
  }
  const geparst = DemoNutzlastSchema.safeParse(roh);
  const wert = geparst.success
    ? demoErgebnis(geparst.data, daten.soll, verfallSchwellen(), new Date())
    : null;
  return Response.json(
    wert ? { ok: true, wert } : { ok: false, grund: "eingabe", text: DEMO_EINGABE_TEXT },
    { headers: { "cache-control": "no-store" } },
  );
}
