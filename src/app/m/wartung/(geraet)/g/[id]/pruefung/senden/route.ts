/**
 * DIE PRÜFUNG AM GERÄT ABSCHLIESSEN (IDA-312) — POST, multipart: `daten` (JSON nach `pruefungEingabe`) und je
 * Punkt mit Mangel höchstens ein Foto `foto:<punktId>`. Eine Route statt einer Server Action, weil Fotos
 * mitkommen. Prüfen darf jeder Angemeldete; ein Route Handler hat kein Layout, also riegelt er selbst.
 *
 * Erst werden die Fotos neu gerechnet und abgelegt, dann steht der Eintrag. Fotos gibt es nur zu Punkten der
 * Checkliste dieses Geräts; scheitert das Schreiben, gehen die abgelegten Bilder wieder weg.
 */
import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../../../../_db/client";
import { idSchema, pruefungEingabe } from "../../../../../_lib/eingabe";
import { entferneFotos, legeFotoAb, rechneFotoNeu } from "../../../../../_lib/fotos";
import { heute } from "../../../../../_lib/heute";
import { hostAbweisung } from "../../../../../_lib/host";
import { antwort, datei, formularGelesen, fremdeHerkunft } from "../../../../../_lib/koerper";
import { Abgelehnt, neueId, pruefungAbschliessen, schonGesendet } from "../../../../../_lib/schreiben";
import { ladeAmGeraet } from "../../../../../_lib/telefon";
import { anzeigename, requireAktion } from "../../../../../_lib/zugang";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (fremdeHerkunft(req)) return new Response(null, { status: 403 });
  let viewer;
  try {
    ({ viewer } = await requireAktion("zugang"));
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

    const db = getDb();
    const schon = schonGesendet(db, "pruefung", p.data.sendung, id);
    if (schon === "fremd") return antwort(400, { ok: false, fehler: "Die Prüfung kam nicht vollständig an. Bitte noch einmal senden." });
    if (schon) return antwort(200, { ok: true, maengel: schon.maengel });
    const amGeraet = ladeAmGeraet(db, id, heute());
    if (!amGeraet) return antwort(400, { ok: false, fehler: "Dieses Gerät gibt es nicht mehr." });
    const punkte = new Set(amGeraet.checkliste.map((pk) => pk.id));
    const mitMangel = new Set(p.data.antworten.filter((a) => !a.ok && punkte.has(a.punktId)).map((a) => a.punktId));

    const fotos = new Map<string, string>();
    try {
      for (const punktId of mitMangel) {
        const d = datei(formular.get(`foto:${punktId}`));
        if (!d) continue;
        const bild = await rechneFotoNeu(new Uint8Array(await d.arrayBuffer()));
        if (!bild) {
          await entferneFotos(fotos.values());
          return antwort(400, { ok: false, fehler: "Ein Foto ließ sich nicht lesen. Bitte ein anderes wählen." });
        }
        const mangelId = neueId();
        await legeFotoAb(mangelId, bild);
        fotos.set(punktId, mangelId);
      }
      const r = pruefungAbschliessen(db, id, p.data, fotos, { jetzt: Date.now(), heute: heute(), wer: anzeigename(viewer) });
      await entferneFotos(r.ungenutzteFotos);
      return antwort(200, { ok: true, maengel: r.maengel });
    } catch (e) {
      await entferneFotos(fotos.values());
      if (e instanceof Abgelehnt) return antwort(400, { ok: false, fehler: e.message, feld: e.feld });
      throw e;
    }
  });
}
