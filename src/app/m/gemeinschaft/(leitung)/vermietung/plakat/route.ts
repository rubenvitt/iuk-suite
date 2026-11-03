import { barPlakatPdf, PLAKAT_DATEINAME } from "../../../_lib/barPlakat";
import { barAnfrageLink } from "../../../_lib/barLink";
import { hostAbweisung } from "../../../_lib/host";
import { leitungImHandler } from "../../../_lib/vermietungZugang";

export const dynamic = "force-dynamic";

/**
 * `GET /vermietung/plakat` — das QR-Plakat der öffentlichen Bar-Anfrage als PDF (IDA-334). Riegel hier selbst,
 * ein Handler hat kein Layout über sich: Host → Leitung, sonst 404 ohne Rumpf. Die Adresse kommt aus den
 * Kopfzeilen des Modul-Hosts, nie aus einem Parameter — sonst druckte jemand einen fremden Link auf unser Plakat.
 *
 * `inline`: das Plakat öffnet im Betrachter des Browsers und wird von dort gedruckt oder gesichert.
 */
export async function GET(req: Request): Promise<Response> {
  const ab = hostAbweisung(req);
  if (ab) return ab;
  if (!(await leitungImHandler())) return new Response("Not found", { status: 404 });
  const bytes = await barPlakatPdf(barAnfrageLink(new Headers(req.headers)));
  return new Response(Buffer.from(bytes), {
    status: 200,
    headers: {
      "content-type": "application/pdf",
      "content-disposition": `inline; filename="${PLAKAT_DATEINAME}"`,
      "x-content-type-options": "nosniff",
      "cache-control": "private, no-store",
    },
  });
}
