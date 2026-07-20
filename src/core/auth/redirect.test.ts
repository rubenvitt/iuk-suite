import { describe, it, expect } from "vitest";
import { suiteRedirect } from "@/core/auth/redirect";

const BASE = "https://iuk-ue.de";

describe("suiteRedirect", () => {
  // Der eigentliche Befund: Auth.js löst `AUTH_URL` als baseUrl auf (immer, auch
  // bei trustHost — createActionURL bevorzugt envUrl vor dem Host-Header). Der
  // Default-redirect-Callback wirft damit JEDE fremde Origin auf iuk-ue.de
  // zurück. Ein Login, der auf qr.iuk-ue.de beginnt, endet dann auf dem Portal.
  it("lässt bekannte Modul-Hosts stehen", () => {
    const env = { SUITE_HOST_QR: "qr.iuk-ue.de" };
    expect(suiteRedirect({ url: "https://qr.iuk-ue.de/", baseUrl: BASE, env })).toBe(
      "https://qr.iuk-ue.de/",
    );
  });

  it("erhält Pfad und Query eines bekannten Hosts", () => {
    const env = { SUITE_HOST_QR: "qr.iuk-ue.de" };
    expect(
      suiteRedirect({ url: "https://qr.iuk-ue.de/admin?tab=presets", baseUrl: BASE, env }),
    ).toBe("https://qr.iuk-ue.de/admin?tab=presets");
  });

  // Ohne Allowlist wäre das hier ein offener Redirector: Auth.js hängt den Wert
  // ungeprüft an, ein präparierter callbackUrl schickte den frisch
  // eingeloggten Nutzer auf eine fremde Seite.
  it("wirft unbekannte Hosts auf die baseUrl zurück", () => {
    for (const url of [
      "https://evil.example.com/",
      "https://iuk-ue.de.evil.example.com/",
      "https://qr.iuk-ue.de.evil.example.com/",
    ]) {
      expect(suiteRedirect({ url, baseUrl: BASE, env: { SUITE_HOST_QR: "qr.iuk-ue.de" } })).toBe(
        BASE,
      );
    }
  });

  // Ein Host, dessen SUITE_HOST_* leer gesetzt ist, hat bewusst keine
  // Prod-Domain (siehe hosts.ts) — dann darf er auch kein Redirect-Ziel sein.
  it("erlaubt keinen Host, dessen Modul-Variable leer gesetzt ist", () => {
    expect(
      suiteRedirect({ url: "https://qr.iuk-ue.de/", baseUrl: BASE, env: { SUITE_HOST_QR: "" } }),
    ).toBe(BASE);
  });

  it("erlaubt die baseUrl selbst, auch wenn kein Modul sie beansprucht", () => {
    expect(suiteRedirect({ url: `${BASE}/x`, baseUrl: BASE, env: { SUITE_HOST_PORTAL: "" } })).toBe(
      `${BASE}/x`,
    );
  });

  // Bestehendes Auth.js-Verhalten, das erhalten bleiben muss: relative Ziele
  // hängen an der baseUrl. Genau dieser Fall ist die Ursache des Fehlers — nur
  // beheben lässt er sich nicht hier, sondern beim Absenden (login-form).
  it("hängt relative Pfade an die baseUrl", () => {
    expect(suiteRedirect({ url: "/dashboard", baseUrl: BASE, env: {} })).toBe(`${BASE}/dashboard`);
  });

  // Protokoll-Downgrade: ein bekannter Host per http würde die Session-Cookies
  // (secure) nicht mitnehmen und ist in Prod immer ein Konfigurationsfehler.
  it("erlaubt kein Protokoll-Downgrade auf einen bekannten Host", () => {
    expect(
      suiteRedirect({ url: "http://qr.iuk-ue.de/", baseUrl: BASE, env: { SUITE_HOST_QR: "qr.iuk-ue.de" } }),
    ).toBe(BASE);
  });

  // Auth.js' Default-Callback prueft `url.startsWith("/")` — und das trifft auch
  // auf `//evil.example.com/x` zu, das der Browser als fremde Origin liest. Der
  // Default baut daraus `https://iuk-ue.de//evil.example.com/x` (harmlos, aber
  // Unsinn); hier wird es sauber abgewiesen, damit die Allowlist keine Luecke
  // hat, durch die ein Wert ungeprueft durchrutscht.
  it("behandelt protokoll-relative Werte nicht als relativ", () => {
    expect(suiteRedirect({ url: "//evil.example.com/x", baseUrl: BASE, env: {} })).toBe(BASE);
  });

  it("weist unparsbare Werte ab, statt zu werfen", () => {
    expect(suiteRedirect({ url: "javascript:alert(1)", baseUrl: BASE, env: {} })).toBe(BASE);
    expect(suiteRedirect({ url: "not a url", baseUrl: BASE, env: {} })).toBe(BASE);
  });

  // In Dev läuft die Suite unter <key>.localtest.me — dieselbe Mechanik, nur
  // per http. Ohne diesen Fall bräche der Cross-Host-Login lokal.
  it("erlaubt localtest.me-Hosts auf demselben Protokoll", () => {
    const base = "http://portal.localtest.me:3000";
    expect(suiteRedirect({ url: "http://qr.localtest.me:3000/", baseUrl: base, env: {} })).toBe(
      "http://qr.localtest.me:3000/",
    );
  });
});
