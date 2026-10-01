import type { PlanTyp } from "../../_lib/angaben";
import type { KopfAngaben } from "../../_lib/briefkopf";
import { tokenPfad } from "../../_lib/freigabe/regeln";
import { planAngabenZeile, STAND_ZEIT } from "../../_lib/rahmen";
import { DruckMenue } from "../druck/DruckMenue";

// zeitFormat löst die Zone erst beim Formatieren auf — auf Modulebene erlaubt (CLAUDE.md, „Zeitzone").

export interface TokenKopfPlan {
  titel: string; typ: PlanTyp; anlass: string | null; datum: number | null; aktualisiertAm: number; aktualisiertVon: string; vermerkVsNfD: boolean;
}

/**
 * DER KOPF DER TOKEN-ANSICHT (Entscheidung 8) — HTML statt Blattkopf, damit er am Telefon lesbar bleibt.
 * Briefkopf aus `kopfFuerZeichnung` (Spec §4.4: ohne Eintrag bleibt die Stelle leer). Das Logo als `<image>` mit
 * `data:`-URI im Inline-SVG wie auf dem Blatt: keine Bildroute, kein Skript aus einem SVG-Logo, kein `<img>`.
 * Der VS-NfD-Vermerk neutral umrandet, nie rot (Falle 3). Keine Server-Abhängigkeit außer der Uhrformatierung.
 */
export function TokenKopf({ plan, kopf, token }: { plan: TokenKopfPlan; kopf: KopfAngaben; token: string }) {
  const angaben = planAngabenZeile(plan);
  return (
    <header className="kp-token-kopf">
      <div className="kp-token-links">
        <h1>{plan.titel}</h1>
        <p className="kp-token-zeile" data-token-angaben="">{angaben}</p>
        <p className="kp-token-zeile" data-token-stand="">{`Stand ${STAND_ZEIT.format(plan.aktualisiertAm)}${plan.aktualisiertVon.trim() ? ` · Bearbeitung: ${plan.aktualisiertVon}` : ""}`}</p>
        {plan.vermerkVsNfD ? <p className="kp-token-vermerk" data-vermerk="">VS – nur für den Dienstgebrauch</p> : null}
      </div>
      {kopf.organisation || kopf.logo ? (
        <div className="kp-token-briefkopf">
          {kopf.organisation ? <span data-organisation="">{kopf.organisation}</span> : null}
          {kopf.logo ? (
            <svg data-logo="" viewBox="0 0 40 11" role="img" aria-label={kopf.organisation ? `Logo ${kopf.organisation}` : "Logo"}>
              <image width="40" height="11" preserveAspectRatio="xMaxYMid meet" href={kopf.logo.href} />
            </svg>
          ) : null}
        </div>
      ) : null}
      <div className="kp-token-aktionen"><DruckMenue basis={tokenPfad(token)} /></div>
    </header>
  );
}
