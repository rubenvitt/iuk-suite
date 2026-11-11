/**
 * EINEN MANGEL AM GERÄT MELDEN (IDA-312) — POST, multipart: `text`, `einsatzbereit` (`ja`/`nein`, Pflicht) und
 * höchstens ein `foto`, dazu `sendung` (die ID vom Telefon: ein zweites Senden legt nichts doppelt an).
 * Melden darf jeder mit dem QR-Code, auch ohne Anmeldung (IDA-337); dann mit freiwilligem `name` und hinter der
 * Notbremse (`_lib/bremse.ts`) und, wenn konfiguriert, Cloudflare Turnstile (IDA-341, Feld `cf-turnstile-response`):
 * VOR der Notbremse, damit Meldungen ohne gültiges Token sie nicht für echte leeren. Eine schon angelegte Sendung
 * kommt ohne neue Prüfung durch — ihr Token ist bei Cloudflare verbraucht. Der Handler riegelt selbst (kein Layout).
 */
import { auditActor, withAuditContext } from "@/core/audit/server";
import { auth } from "@/core/auth";
import { TURNSTILE_ABGELEHNT, TURNSTILE_AKTIONEN, TURNSTILE_FELD } from "@/core/turnstile/aktionen";
import { pruefeTurnstile } from "@/core/turnstile/server";
import { getDb } from "../../../../../_db/client";
import { idSchema, mangelEingabe } from "../../../../../_lib/eingabe";
import { entferneFotos, FOTO_MAX_BYTES, legeFotoAb, rechneFotoNeu } from "../../../../../_lib/fotos";
import { heute } from "../../../../../_lib/heute";
import { hostAbweisung } from "../../../../../_lib/host";
import { antwort, datei, formularGelesen, fremdeHerkunft, RAHMEN_MAX } from "../../../../../_lib/koerper";
import { Abgelehnt, mangelMelden, schonGesendet } from "../../../../../_lib/schreiben";
import { meldungOhneAnmeldungErlaubt } from "../../../../../_lib/bremse";
import { anzeigename, hatWartungZugang } from "../../../../../_lib/zugang";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (fremdeHerkunft(req)) return new Response(null, { status: 403 });
  const viewer = (await auth())?.user ?? null;
  const mitZugang = viewer !== null && hatWartungZugang(viewer.groups);
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return new Response(null, { status: 404 });

  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<Response> => {
    const formular = await formularGelesen(req, FOTO_MAX_BYTES + RAHMEN_MAX);
    if (formular === "zu_gross") return antwort(413, { ok: false, fehler: "Das Foto ist zu groß." });
    if (formular === null) return antwort(400, { ok: false, fehler: "Die Meldung kam nicht vollständig an. Bitte noch einmal senden." });

    // Die Einsatzfrage hat keine Vorgabe mehr (IDA-381): fehlt die Antwort, geht nichts still als „einsatzbereit“ durch.
    const einsatz = formular.get("einsatzbereit");
    if (einsatz !== "ja" && einsatz !== "nein") {
      return antwort(400, { ok: false, fehler: "Bitte wählen, ob das Gerät noch raus kann.", feld: "einsatzbereit" });
    }
    const m = mangelEingabe.safeParse({
      text: String(formular.get("text") ?? ""), einsatzbereit: einsatz === "ja", name: String(formular.get("name") ?? ""),
    });
    if (!m.success) return antwort(400, { ok: false, fehler: m.error.issues[0]?.message ?? "Bitte beschreiben, was los ist.", feld: "text" });

    const sendung = idSchema.safeParse(formular.get("sendung"));
    if (!sendung.success) return antwort(400, { ok: false, fehler: "Die Meldung kam nicht vollständig an. Bitte noch einmal senden." });
    const mangelId = sendung.data;
    const schon = schonGesendet(getDb(), "mangel", mangelId, id);
    if (schon === "fremd") return antwort(400, { ok: false, fehler: "Die Meldung kam nicht vollständig an. Bitte noch einmal senden." });
    if (schon) return antwort(200, { ok: true });
    const token = formular.get(TURNSTILE_FELD);
    if (!mitZugang && !(await pruefeTurnstile(typeof token === "string" ? token : "", TURNSTILE_AKTIONEN.mangel))) {
      return antwort(400, { ok: false, fehler: TURNSTILE_ABGELEHNT });
    }
    if (!mitZugang && !meldungOhneAnmeldungErlaubt(id)) {
      return antwort(429, { ok: false, fehler: "Gerade kommen zu viele Meldungen an. Bitte in ein paar Minuten noch einmal senden." });
    }
    const d = datei(formular.get("foto"));
    if (d) {
      const bild = await rechneFotoNeu(new Uint8Array(await d.arrayBuffer()));
      if (!bild) return antwort(400, { ok: false, fehler: "Das Foto ließ sich nicht lesen. Bitte ein anderes wählen.", feld: "foto" });
      await legeFotoAb(mangelId, bild);
    }
    try {
      mangelMelden(getDb(), id, { id: mangelId, text: m.data.text, foto: d !== null, einsatzbereit: m.data.einsatzbereit }, {
        jetzt: Date.now(), heute: heute(), wer: mitZugang && viewer ? anzeigename(viewer) : m.data.name || "Ohne Anmeldung",
      });
      return antwort(200, { ok: true });
    } catch (e) {
      if (d) await entferneFotos([mangelId]);
      if (e instanceof Abgelehnt) return antwort(400, { ok: false, fehler: e.message, feld: e.feld });
      throw e;
    }
  });
}
