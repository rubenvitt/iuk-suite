import { auditActor, withAuditContext } from "@/core/audit/server";
import { getDb } from "../../_db/client";
import { istHelferHost } from "../../_lib/host";
import { HiorgFehler, kontoName, tauscheCode } from "../../_lib/hiorg/api";
import { hiorgKonfiguration } from "../../_lib/hiorg/konfiguration";
import { loeseVorgangEin, merkeAccessToken, speichereVerbindung } from "../../_lib/hiorg/verbindung";
import { vorgangAusCookie, vorgangsCookieLoeschen, weiter } from "../../_lib/hiorg/vorgangsCookie";
import { anzeigeName, helferVerwaltenZugang } from "../../_lib/zugang";

export const dynamic = "force-dynamic";

/**
 * Rückkehr von HiOrg-Server (Redirect-URI `<Modul-Host>/hiorg/callback`). Prüft, dass derselbe Browser
 * (Cookie) und dieselbe Person (Vorgang) zurückkommt, tauscht den Code und speichert das
 * Refresh-Token verschlüsselt. Ergebnis als Hinweis auf der Einstellungsseite; die Fehlertexte
 * stehen dort, nicht in der Adresse.
 */
export async function GET(req: Request): Promise<Response> {
  if (!istHelferHost(new Headers(req.headers))) return new Response("Not found", { status: 404 });
  const z = await helferVerwaltenZugang();
  if (!z.ok) return z.response;
  const viewer = z.viewer;
  const url = new URL(req.url);
  const state = url.searchParams.get("state") ?? "";
  const code = url.searchParams.get("code") ?? "";
  const loeschen = vorgangsCookieLoeschen();
  if (url.searchParams.get("error")) return weiter("/einstellungen?hiorg=abgelehnt", loeschen);
  if (!state || state !== vorgangAusCookie(req.headers.get("cookie"))) return weiter("/einstellungen?hiorg=abgelaufen", loeschen);
  const db = getDb();
  const verifier = loeseVorgangEin(db, state, viewer.id);
  if (!verifier || !code) return weiter("/einstellungen?hiorg=abgelaufen", loeschen);
  const k = hiorgKonfiguration();
  if (!k.ok) return weiter("/einstellungen?hiorg=nicht-eingerichtet", loeschen);
  return withAuditContext({ actor: auditActor(viewer) }, async () => {
    try {
      const t = await tauscheCode(k.konfiguration, fetch, code, verifier);
      if (!t.refreshToken) return weiter("/einstellungen?hiorg=ohne-refresh", loeschen);
      const name = await kontoName(k.konfiguration, fetch, t.accessToken);
      speichereVerbindung(db, { kontoName: name, verbundenVon: anzeigeName(viewer), verbundenVonSub: viewer.id, refreshToken: t.refreshToken });
      merkeAccessToken(t.accessToken, t.laeuftAbIn);
      return weiter("/einstellungen?hiorg=verbunden", loeschen);
    } catch (e) {
      if (e instanceof HiorgFehler) return weiter("/einstellungen?hiorg=fehler", loeschen);
      throw e;
    }
  });
}
