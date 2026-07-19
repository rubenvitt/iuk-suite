import { getModule } from "@/core/registry";
import { resolveWebfinger } from "@/core/webfinger";

/**
 * Ersetzt den Alt-Container `iuk-overview-webfinger`, der nach dem
 * Portal-Cutover als einziger Grund weiterlief, den Alt-Stack nicht abzubauen.
 *
 * Die Route liegt global (nicht unter einem Modul), weil `/.well-known/*` per
 * Definition öffentlich und host-übergreifend ist; die Zuständigkeit ergibt
 * sich stattdessen aus der geprüften Domain im `resource`-Parameter. Damit sie
 * nicht in den Auth-Rewrite läuft, steht `/.well-known` in PASSTHROUGH
 * (`core/routing.ts`).
 */
export async function GET(req: Request) {
  const issuer = process.env.POCKET_ID_ISSUER;
  if (!issuer) {
    // Ohne konfigurierten Issuer gibt es nichts zu entdecken. Lieber ehrlich
    // 503 als ein JRD, das auf "undefined" zeigt.
    return new Response("issuer not configured", {
      status: 503,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  const result = resolveWebfinger({
    resource: new URL(req.url).searchParams.get("resource"),
    domains: getModule("portal").prodHosts,
    issuer,
  });

  if (result.status !== 200) {
    return new Response(result.message, {
      status: result.status,
      headers: { "content-type": "text/plain; charset=utf-8" },
    });
  }

  return new Response(JSON.stringify(result.jrd), {
    status: 200,
    headers: {
      // Wie der Alt-Dienst: JRD-Content-Type und offenes CORS — WebFinger wird
      // von fremden Origins abgefragt, das ist der Sinn der Sache.
      "content-type": "application/jrd+json",
      "access-control-allow-origin": "*",
      "cache-control": "public, max-age=300",
    },
  });
}
