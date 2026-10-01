import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { druckseitenDaten, qrUrlFuerToken } from "@/app/m/kommplan/_lib/druckdaten";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { TOKEN_METADATEN } from "@/app/m/kommplan/_lib/tokenMetadaten";
import { tokenPlanOder404 } from "@/app/m/kommplan/_lib/tokenZugang";
import { Druckseite } from "@/app/m/kommplan/_ui/druck/Druckseite";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";

export const dynamic = "force-dynamic";
export const metadata = TOKEN_METADATEN;

/** TOKEN-DRUCK A4 QUER (Entscheidung 9): dieselbe Druckseite, ohne SVG-Export. */
export default async function TokenDruckA4({ params }: { params: Promise<{ token: string }> }) {
  requireKommplanHost(await headers());
  const { token } = await params;
  const { plan } = await tokenPlanOder404(token);
  return <Druckseite schrift={{ familie: ARIMO.style.fontFamily, klasse: ARIMO.className }} daten={await druckseitenDaten(getDb(), plan, { format: "a4-quer", qrUrl: qrUrlFuerToken(plan, token) })} />;
}
