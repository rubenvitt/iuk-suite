/**
 * DIE PRÜFUNG AM GERÄT ABSCHLIESSEN (IDA-312) — POST, multipart: `daten` (JSON nach `pruefungEingabe`) und je
 * Punkt mit Mangel höchstens ein Foto `foto:<punktId>`. Eine Route statt einer Server Action, weil Fotos
 * mitkommen. Prüfen darf jeder Angemeldete; ein Route Handler hat kein Layout, also riegelt er selbst.
 *
 * Erst werden die Fotos neu gerechnet und abgelegt, dann steht der Eintrag. Scheitert das Schreiben, bleiben
 * höchstens Bilder ohne Zeile liegen, die niemand ausliefert.
 */
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../../../../_db/client";
import { idSchema, pruefungEingabe } from "../../../../../_lib/eingabe";
import { legeFotoAb, rechneFotoNeu } from "../../../../../_lib/fotos";
import { heute } from "../../../../../_lib/heute";
import { hostAbweisung } from "../../../../../_lib/host";
import { antwort, datei, formularGelesen, fremdeHerkunft } from "../../../../../_lib/koerper";
import { Abgelehnt, neueId, pruefungAbschliessen } from "../../../../../_lib/schreiben";
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
    const formular = await formularGelesen(req);
    if (formular === "zu_gross") return antwort(413, { ok: false, fehler: "Die Fotos sind zu groß." });
    if (formular === null) return antwort(400, { ok: false, fehler: "Die Prüfung kam nicht vollständig an. Bitte noch einmal senden." });

    let roh: unknown;
    try {
      roh = JSON.parse(String(formular.get("daten") ?? ""));
    } catch {
      roh = null;
    }
    const p = pruefungEingabe.safeParse(roh);
    if (!p.success) return antwort(400, { ok: false, fehler: "Die Prüfung kam nicht vollständig an. Bitte noch einmal senden." });

    const mitMangel = new Set(p.data.antworten.filter((a) => !a.ok).map((a) => a.punktId));
    const fotos = new Map<string, string>();
    for (const punktId of mitMangel) {
      const d = datei(formular.get(`foto:${punktId}`));
      if (!d) continue;
      const bild = await rechneFotoNeu(new Uint8Array(await d.arrayBuffer()));
      if (!bild) return antwort(400, { ok: false, fehler: "Ein Foto ließ sich nicht lesen. Bitte ein anderes wählen." });
      const mangelId = neueId();
      await legeFotoAb(mangelId, bild);
      fotos.set(punktId, mangelId);
    }

    try {
      const r = pruefungAbschliessen(getDb(), id, p.data, fotos, { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer) });
      return antwort(200, { ok: true, maengel: r.maengel });
    } catch (e) {
      if (e instanceof Abgelehnt) return antwort(400, { ok: false, fehler: e.message, feld: e.feld });
      throw e;
    }
  });
}
