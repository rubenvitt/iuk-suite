import { xlsxAntwort } from "@/core/export/server";
import { VORLAGE_DATEINAME, vorlageBlaetter } from "../../_lib/datei/vorlage";
import { istHelferHost } from "../../_lib/host";
import { helferVerwaltenZugang } from "../../_lib/zugang";

export const dynamic = "force-dynamic";

/** Die leere Vorlage für den Upload (IDA-281). Sie enthält keine Personendaten. */
export async function GET(req: Request): Promise<Response> {
  if (!istHelferHost(new Headers(req.headers))) return new Response("Not found", { status: 404 });
  const z = await helferVerwaltenZugang();
  if (!z.ok) return z.response;
  return xlsxAntwort(VORLAGE_DATEINAME, vorlageBlaetter());
}
