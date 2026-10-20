import { getDb } from "../../_db/client";
import { istHelferHost } from "../../_lib/host";
import { anmeldeAdresse, neuerVorgang } from "../../_lib/hiorg/api";
import { hiorgKonfiguration } from "../../_lib/hiorg/konfiguration";
import { legeVorgangAn } from "../../_lib/hiorg/verbindung";
import { vorgangsCookie, weiter } from "../../_lib/hiorg/vorgangsCookie";
import { helferVerwaltenZugang } from "../../_lib/zugang";

export const dynamic = "force-dynamic";

/**
 * Beginnt das Verbinden mit HiOrg-Server: Vorgang (state + PKCE) anlegen, an die Person binden und
 * zur Anmeldung bei HiOrg weiterleiten. GET, weil es ein Link ist; geschrieben wird nur der
 * kurzlebige Vorgang, die Verbindung entsteht erst im Rückruf.
 */
export async function GET(req: Request): Promise<Response> {
  if (!istHelferHost(new Headers(req.headers))) return new Response("Not found", { status: 404 });
  const z = await helferVerwaltenZugang();
  if (!z.ok) return z.response;
  const k = hiorgKonfiguration();
  if (!k.ok) return weiter("/einstellungen?hiorg=nicht-eingerichtet");
  const v = neuerVorgang();
  legeVorgangAn(getDb(), { state: v.state, verifier: v.verifier, sub: z.viewer.id });
  return weiter(anmeldeAdresse(k.konfiguration, v.state, v.challenge), vorgangsCookie(v.state));
}
