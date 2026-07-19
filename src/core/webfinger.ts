/**
 * WebFinger für OIDC-Issuer-Discovery (RFC 7033 + OpenID Connect Discovery 1.0).
 *
 * Portiert aus dem Alt-Stack (`iuk-overview-webfinger`), damit dieser Container
 * beim Abbau von iuk-overview mit weg kann. Das Verhalten ist am laufenden
 * Alt-Dienst abgemessen, nicht aus der Spec abgeleitet — siehe webfinger.test.ts.
 *
 * Eine bewusste Abweichung: der Alt-Dienst vergleicht die Domain
 * case-**sensitiv** (`acct:a@IUK-UE.DE` → 404). Hostnamen sind
 * case-insensitiv; hier wird deshalb normalisiert verglichen. Das lässt
 * ausschließlich Anfragen zusätzlich durch, die vorher scheiterten — es
 * bricht keine, die vorher funktionierten.
 */

export type WebfingerResult =
  | { status: 200; jrd: { subject: string; links: { rel: string; href: string }[] } }
  | { status: 400 | 404; message: string };

export const OIDC_ISSUER_REL = "http://openid.net/specs/connect/1.0/issuer";

export function resolveWebfinger(input: {
  resource: string | null;
  /** Domains, für die Accounts beantwortet werden (i. d. R. die Apex-Domain). */
  domains: string[];
  /** OIDC-Issuer-URL, z. B. https://id.iuk-ue.de */
  issuer: string;
}): WebfingerResult {
  const { resource, domains, issuer } = input;

  if (!resource) return { status: 400, message: "missing resource parameter" };
  if (!resource.startsWith("acct:")) {
    return { status: 400, message: "unsupported resource format" };
  }

  const acct = resource.slice("acct:".length);
  const at = acct.lastIndexOf("@");
  if (at === -1) return { status: 400, message: "unsupported resource format" };

  // Leerer Localpart ist erlaubt — der Alt-Dienst beantwortet `acct:@iuk-ue.de`
  // mit 200. Hier wird nichts strenger gemacht als vorher.
  const domain = acct.slice(at + 1).toLowerCase();
  if (!domains.some((d) => d.toLowerCase() === domain)) {
    return { status: 404, message: "resource not found" };
  }

  // `rel` wird bewusst ignoriert: der Alt-Dienst liefert den Issuer-Link auch
  // bei fremdem oder fehlendem rel. RFC 7033 erlaubt das (Filtern ist optional).
  return {
    status: 200,
    jrd: { subject: resource, links: [{ rel: OIDC_ISSUER_REL, href: issuer }] },
  };
}
