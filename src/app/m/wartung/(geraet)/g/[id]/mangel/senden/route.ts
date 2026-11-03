/**
 * EINEN MANGEL AM GERÄT MELDEN (IDA-312) — POST, multipart: `text`, `einsatzbereit` (`ja`/`nein`) und
 * höchstens ein `foto`. Melden darf jeder Angemeldete; der Handler riegelt selbst (kein Layout).
 */
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../../../../_db/client";
import { idSchema, mangelEingabe } from "../../../../../_lib/eingabe";
import { entferneFotos, FOTO_MAX_BYTES, legeFotoAb, rechneFotoNeu } from "../../../../../_lib/fotos";
import { heute } from "../../../../../_lib/heute";
import { hostAbweisung } from "../../../../../_lib/host";
import { antwort, datei, formularGelesen, fremdeHerkunft, RAHMEN_MAX } from "../../../../../_lib/koerper";
import { Abgelehnt, mangelMelden, neueId } from "../../../../../_lib/schreiben";
import { anzeigename, requireAktion } from "../../../../../_lib/zugang";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (fremdeHerkunft(req)) return new Response(null, { status: 403 });
  let viewer;
  try {
    ({ viewer } = await requireAktion("angemeldet"));
  } catch {
    return antwort(401, { ok: false, fehler: "Die Anmeldung ist abgelaufen. Bitte den QR-Code noch einmal scannen." });
  }
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return new Response(null, { status: 404 });

  return withAuditContext({ actor: auditActor(viewer) }, async (): Promise<Response> => {
    const formular = await formularGelesen(req, FOTO_MAX_BYTES + RAHMEN_MAX);
    if (formular === "zu_gross") return antwort(413, { ok: false, fehler: "Das Foto ist zu groß." });
    if (formular === null) return antwort(400, { ok: false, fehler: "Die Meldung kam nicht vollständig an. Bitte noch einmal senden." });

    const m = mangelEingabe.safeParse({ text: String(formular.get("text") ?? ""), einsatzbereit: formular.get("einsatzbereit") !== "nein" });
    if (!m.success) return antwort(400, { ok: false, fehler: m.error.issues[0]?.message ?? "Bitte beschreiben, was los ist.", feld: "text" });

    const mangelId = neueId();
    const d = datei(formular.get("foto"));
    if (d) {
      const bild = await rechneFotoNeu(new Uint8Array(await d.arrayBuffer()));
      if (!bild) return antwort(400, { ok: false, fehler: "Das Foto ließ sich nicht lesen. Bitte ein anderes wählen.", feld: "foto" });
      await legeFotoAb(mangelId, bild);
    }
    try {
      mangelMelden(getDb(), id, { id: mangelId, text: m.data.text, foto: d !== null, einsatzbereit: m.data.einsatzbereit }, {
        jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer),
      });
      return antwort(200, { ok: true });
    } catch (e) {
      if (d) await entferneFotos([mangelId]);
      if (e instanceof Abgelehnt) return antwort(400, { ok: false, fehler: e.message, feld: e.feld });
      throw e;
    }
  });
}
