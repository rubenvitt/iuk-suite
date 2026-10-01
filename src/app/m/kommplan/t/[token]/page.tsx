import { headers } from "next/headers";
import { getDb } from "@/app/m/kommplan/_db/client";
import { kopfFuerZeichnung } from "@/app/m/kommplan/_lib/briefkopf";
import { requireKommplanHost } from "@/app/m/kommplan/_lib/host";
import { TOKEN_METADATEN } from "@/app/m/kommplan/_lib/tokenMetadaten";
import { tokenPlanOder404 } from "@/app/m/kommplan/_lib/tokenZugang";
import { symboleFuer } from "@/app/m/kommplan/_lib/zeichen/zeichen";
import { Betrachter } from "@/app/m/kommplan/_ui/betrachter/Betrachter";
import { ARIMO } from "@/app/m/kommplan/_ui/schrift";
import { TokenKopf } from "@/app/m/kommplan/_ui/token/TokenKopf";
import { TokenRahmen } from "@/app/m/kommplan/_ui/token/TokenRahmen";

export const dynamic = "force-dynamic";
export const metadata = TOKEN_METADATEN;

/**
 * DIE TOKEN-ANSICHT (Spec §8.2; Entscheidung 8): nur lesend, immer der aktuelle Stand, derselbe Betrachter wie
 * innen. An Client-Inseln gehen NUR Planinhalt, Titel, Symbole und der Token (für die Druckziele) — nie die
 * Plan-ID (Review Focus 4).
 */
export default async function TokenAnsicht({ params }: { params: Promise<{ token: string }> }) {
  requireKommplanHost(await headers());
  const { token } = await params;
  const { plan } = await tokenPlanOder404(token);
  return (
    <TokenRahmen>
      <TokenKopf token={token} kopf={kopfFuerZeichnung(getDb())} plan={{
        titel: plan.titel, typ: plan.typ, anlass: plan.anlass, datum: plan.datum, aktualisiertAm: plan.aktualisiertAm,
        aktualisiertVon: plan.aktualisiertVon, vermerkVsNfD: plan.inhalt?.optionen.vermerkVsNfD ?? false,
      }} />
      {plan.inhalt ? (
        <div className={`kp-token-flaeche ${ARIMO.className}`}>
          <Betrachter inhalt={plan.inhalt} symbole={symboleFuer(plan.inhalt)} titel={plan.titel} schrift={ARIMO.style.fontFamily} />
        </div>
      ) : (
        <p className="kp-token-hinweis">Dieser Plan lässt sich gerade nicht anzeigen.</p>
      )}
    </TokenRahmen>
  );
}
