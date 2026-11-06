/**
 * EINE UNTERLAGE AN EIN GERÄT HÄNGEN (IDA-300) — POST, multipart: `titel` und `datei` (PDF oder Bild). Nur für
 * Verwalter der Gruppe des Geräts; die Gruppe kommt aus der Datenbank (IDOR). Ein Route Handler und keine Server
 * Action, weil ein Handbuch weit über der Körpergrenze von Actions liegt. Er riegelt selbst (kein Layout).
 */
import { auditActor, withAuditContext } from "@/core/audit/server";
import { eq } from "drizzle-orm";
import { getDb } from "../../../../_db/client";
import { geraet } from "../../../../_db/schema";
import { idSchema, unterlageTitel } from "../../../../_lib/eingabe";
import { hostAbweisung } from "../../../../_lib/host";
import { antwort, datei, formularGelesen, fremdeHerkunft, RAHMEN_MAX } from "../../../../_lib/koerper";
import { UNTERLAGE_MAX_BYTES } from "../../../../_lib/unterlagen";
import { unterlageHochladenVorgang } from "../../../../_lib/vorgaenge";
import { requireAktion, verwaltetGruppe } from "../../../../_lib/zugang";

export const dynamic = "force-dynamic";

const ZU_GROSS = `Die Datei ist zu groß (höchstens ${UNTERLAGE_MAX_BYTES / 1024 / 1024} MB).`;

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (fremdeHerkunft(req)) return new Response(null, { status: 403 });
  let z;
  try {
    z = await requireAktion("verwalter");
  } catch {
    return antwort(403, { ok: false, fehler: "Dafür fehlt dir die Berechtigung." });
  }
  const { id } = await params;
  if (!idSchema.safeParse(id).success) return new Response(null, { status: 404 });
  const gruppeId = getDb().select({ g: geraet.gruppeId }).from(geraet).where(eq(geraet.id, id)).get()?.g;
  if (!gruppeId) return antwort(404, { ok: false, fehler: "Dieses Gerät gibt es nicht mehr." });
  if (!verwaltetGruppe(z.rechte, gruppeId)) return antwort(403, { ok: false, fehler: "Dieses Gerät gehört zu einer Gruppe, die du nicht verwaltest." });

  const formular = await formularGelesen(req, UNTERLAGE_MAX_BYTES + RAHMEN_MAX);
  if (formular === "zu_gross") return antwort(413, { ok: false, fehler: ZU_GROSS, feld: "datei" });
  if (formular === null) return antwort(400, { ok: false, fehler: "Die Datei kam nicht vollständig an. Bitte noch einmal senden." });
  const d = datei(formular.get("datei"));
  const titel = String(formular.get("titel") ?? "");
  if (!d) {
    // Erst der Titel, wie bisher: fehlt beides, nennt die Antwort den Titel.
    if (!unterlageTitel.safeParse(titel).success) return antwort(400, { ok: false, fehler: "Bitte die Unterlage benennen.", feld: "titel" });
    return antwort(400, { ok: false, fehler: "Bitte eine Datei wählen.", feld: "datei" });
  }
  // Dieselben Prüfungen wie das MCP-Werkzeug (`_lib/vorgaenge.ts`).
  const akteur = z;
  const r = await withAuditContext({ actor: auditActor(akteur.viewer) }, async () =>
    unterlageHochladenVorgang(akteur, id, titel, new Uint8Array(await d.arrayBuffer())));
  if (r.ok) return antwort(200, { ok: true });
  return antwort(400, { ok: false, fehler: r.fehler, feld: Object.keys(r.feldFehler ?? {})[0] });
}
