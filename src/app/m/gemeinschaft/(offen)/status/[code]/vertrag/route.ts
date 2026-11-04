import { revalidatePath } from "next/cache";
import { auditDelivery, withAuditContext } from "@/core/audit/server";
import { clientIpAus, RateLimiter } from "@/core/ratelimit";
import { getDb } from "../../../../_db/client";
import { hostAbweisung } from "../../../../_lib/host";
import { istLinkCode } from "../../../../_lib/kennung";
import { Abgelehnt, legeUnterschriebenAb, NichtGefunden, pruefeUnterschreibbar, vertragFuerStatus } from "../../../../_lib/vermietung";
import { anhangKopf, ansichtKopf, VERTRAG_MAX_BYTES } from "../../../../_lib/vermietungPdf";
import { jsonAntwort, leseDatei, NICHT_DA, pdfAntwort } from "../../../../_lib/uploadLesen";
import { scanneVertrag, scanSatz } from "../../../../_lib/vertragScan";
import { vertragDateiname, vertragTitel } from "../../../../_lib/vertragName";
import { fotoAlsPdf, pruefeUnterschriebeneDatei } from "../../../../_lib/vertragUnterschrift";

/**
 * `/status/<code>/vertrag` — der Mietvertrag einer Zusage für die anfragende Person, ohne Anmeldung (IDA-343). Der
 * Code ist der Zugang, wie bei der Statusseite selbst; aufgelöst wird gegen die Datenbank, nie über die Kennung.
 *
 * `GET`: die unterschriebene Fassung zum Herunterladen, sonst die Vorlage zum Ansehen (`inline`).
 * `POST`: eine unterschriebene PDF oder ein Foto davon (Feld `datei`) — Magic Bytes, clamd, Foto wird zur PDF.
 * Zähler je Absender gegen Massenabsenden; der Zustand wird VOR dem Lesen des Körpers geprüft, damit niemand
 * zehn MB an eine Anfrage ohne Zusage schicken kann.
 */

const jeAbsender = new RateLimiter({ windowMs: 60 * 60_000, max: 20 });
type Ctx = { params: Promise<{ code: string }> };

export async function GET(req: Request, ctx: Ctx): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  const { code } = await ctx.params;
  if (!istLinkCode(code)) return NICHT_DA();
  return auditDelivery("gemeinschaft", "download", "vertragsdatei", { kind: "anonymous" }, async (target) => {
    const v = vertragFuerStatus(getDb(), code);
    if (!v) return NICHT_DA();
    target(v.id);
    return pdfAntwort(v.inhalt, v.art === "unterschrieben" ? anhangKopf(v.name) : ansichtKopf(v.name));
  });
}

export async function POST(req: Request, ctx: Ctx): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (req.headers.get("sec-fetch-site") === "cross-site") return NICHT_DA();
  const { code } = await ctx.params;
  if (!istLinkCode(code)) return NICHT_DA();
  if (!jeAbsender.check(clientIpAus(req.headers))) return jsonAntwort(429, { ok: false, fehler: "Zu viele Versuche. Bitte in einer Stunde noch einmal." });

  return withAuditContext({ actor: { kind: "anonymous" } }, async () => {
    const db = getDb();
    let a: ReturnType<typeof pruefeUnterschreibbar>;
    try {
      a = pruefeUnterschreibbar(db, code);
    } catch (e) {
      if (e instanceof NichtGefunden) return NICHT_DA();
      if (e instanceof Abgelehnt) return jsonAntwort(409, { ok: false, fehler: e.message });
      throw e;
    }
    const d = await leseDatei(req, VERTRAG_MAX_BYTES, "Bitte eine PDF oder ein Foto wählen.");
    if (!d.ok) return jsonAntwort(d.status, { ok: false, fehler: d.fehler });
    const p = pruefeUnterschriebeneDatei(d.name, d.bytes);
    if (!p.ok) return jsonAntwort(p.status, { ok: false, fehler: p.fehler });
    const scan = await scanneVertrag(d.bytes);
    if (scan.art !== "clean") return jsonAntwort(scan.art === "infected" ? 422 : 503, { ok: false, fehler: scanSatz(scan) ?? "" });
    let inhalt: Buffer;
    try {
      inhalt = p.art === "pdf" ? d.bytes : Buffer.from(await fotoAlsPdf(d.bytes, p.art, vertragTitel(a.von, true)));
    } catch {
      return jsonAntwort(415, { ok: false, fehler: "Dieses Foto lässt sich nicht lesen. Bitte als JPG oder PNG speichern." });
    }
    try {
      legeUnterschriebenAb(db, code, { name: vertragDateiname(a.von, true), inhalt, herkunft: "hochgeladen", unterschriebenVon: null, vorlageStand: null }, Date.now());
    } catch (e) {
      if (e instanceof NichtGefunden) return NICHT_DA();
      if (e instanceof Abgelehnt) return jsonAntwort(409, { ok: false, fehler: e.message });
      throw e;
    }
    revalidatePath("/m/gemeinschaft", "layout");
    return jsonAntwort(200, { ok: true });
  });
}
