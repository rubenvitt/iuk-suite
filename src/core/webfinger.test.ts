import { describe, it, expect } from "vitest";
import { resolveWebfinger, OIDC_ISSUER_REL } from "@/core/webfinger";

/**
 * Die Erwartungen sind am laufenden Alt-Dienst abgemessen (curl gegen
 * https://iuk-ue.de/.well-known/webfinger, 19.07.2026), nicht aus der RFC
 * abgeleitet — der Nachbau soll sich verhalten wie das, was externe Clients
 * heute vorfinden.
 */
const ARGS = { domains: ["iuk-ue.de"], issuer: "https://id.iuk-ue.de" };

describe("webfinger", () => {
  it("liefert den Issuer-Link für einen Account der eigenen Domain", () => {
    const res = resolveWebfinger({ resource: "acct:a@iuk-ue.de", ...ARGS });
    expect(res).toEqual({
      status: 200,
      jrd: {
        subject: "acct:a@iuk-ue.de",
        links: [{ rel: OIDC_ISSUER_REL, href: "https://id.iuk-ue.de" }],
      },
    });
  });

  it("400 ohne resource-Parameter", () => {
    expect(resolveWebfinger({ resource: null, ...ARGS })).toEqual({
      status: 400,
      message: "missing resource parameter",
    });
  });

  it("400 für nicht-acct-Resources", () => {
    expect(resolveWebfinger({ resource: "https://iuk-ue.de/x", ...ARGS })).toEqual({
      status: 400,
      message: "unsupported resource format",
    });
  });

  it("400 wenn das @ fehlt", () => {
    expect(resolveWebfinger({ resource: "acct:nobody", ...ARGS }).status).toBe(400);
  });

  it("404 für fremde Domains", () => {
    expect(resolveWebfinger({ resource: "acct:foo@example.com", ...ARGS }).status).toBe(404);
  });

  it("404 für Subdomains — nur die konfigurierte Domain zählt", () => {
    expect(resolveWebfinger({ resource: "acct:a@id.iuk-ue.de", ...ARGS }).status).toBe(404);
  });

  it("leerer Localpart bleibt erlaubt (wie der Alt-Dienst)", () => {
    expect(resolveWebfinger({ resource: "acct:@iuk-ue.de", ...ARGS }).status).toBe(200);
  });

  it("Domain case-insensitiv — bewusste Abweichung vom Alt-Dienst (dort 404)", () => {
    const res = resolveWebfinger({ resource: "acct:A@IUK-UE.DE", ...ARGS });
    expect(res.status).toBe(200);
    // Das Subject wird unverändert zurückgespiegelt, nicht normalisiert.
    expect(res.status === 200 && res.jrd.subject).toBe("acct:A@IUK-UE.DE");
  });

  it("mehrere @ im Localpart: der letzte trennt die Domain", () => {
    expect(resolveWebfinger({ resource: "acct:a@b@iuk-ue.de", ...ARGS }).status).toBe(200);
  });

  it("ohne konfigurierte Domain wird nichts beantwortet", () => {
    expect(
      resolveWebfinger({ resource: "acct:a@iuk-ue.de", domains: [], issuer: ARGS.issuer }).status,
    ).toBe(404);
  });
});
