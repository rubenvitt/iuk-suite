import { test, expect, type BrowserContext } from "@playwright/test";
import { decode, encode } from "next-auth/jwt";
import { devLogin } from "./fixtures";
import { UAV_ADMIN_GRUPPE, UAV_HOST, uavUrl } from "./helpers/uav";

/**
 * DRK-284 — EIN ENDGUELTIG GESCHEITERTER REFRESH SPERRT SERVERSEITIG, OHNE
 * BROWSER-JAVASCRIPT.
 *
 * Nachgestellt wird das Cookie, das der Server nach einem `invalid_grant`
 * schrieb: dieselbe Sitzung, dieselben Admin-Gruppen, dazu der Vermerk
 * `error: "RefreshTokenError"`. Vorher trug es weiter — der Vermerk wurde nur
 * an den `SessionGuard` im Browser gereicht, und wer den nicht ausfuehren liess
 * (ein direkter HTTP-Client), las `GET /api/admin/participants` samt
 * Login-Codes weiter. Die Anfragen hier laufen ueber `page.request`: echtes
 * HTTP mit den Cookies des Kontexts, aber ohne eine Zeile Seiten-JavaScript.
 *
 * Den `invalid_grant` selbst kann diese Umgebung nicht erzeugen — sie faehrt
 * Dev-Login ohne Pocket ID. Dass ein echter `invalid_grant` genau zu diesem
 * Vermerk wird und dann verworfen wird, belegt `src/core/auth/endgueltig.test.ts`
 * ueber den echten Route Handler mit ersetztem Netz.
 */

/**
 * Wert-gleich mit `AUTH_SECRET` in `webServer.env` (`playwright.config.ts`).
 * Weicht er ab, scheitert `decode` LAUT — kein stiller Fehlbefund.
 */
const E2E_AUTH_SECRET = "test-secret";
/** Unter HTTP ohne `__Secure-`-Praefix; zugleich das Salz der Verschluesselung. */
const SITZUNGS_KEKS = "authjs.session-token";

async function sitzungsKeks(kontext: BrowserContext) {
  const kekse = await kontext.cookies(uavUrl("/"));
  return kekse.find((k) => k.name === SITZUNGS_KEKS);
}

/** Schreibt dieselbe Sitzung mit Fehlervermerk zurueck — so, wie sie der alte Stand hinterliess. */
async function alsEndgueltigGescheitertMarkieren(kontext: BrowserContext, wert: string) {
  const token = await decode({ token: wert, secret: E2E_AUTH_SECRET, salt: SITZUNGS_KEKS });
  if (!token) throw new Error("Sitzungs-Cookie nicht lesbar — stimmt E2E_AUTH_SECRET noch?");
  expect(token.groups).toContain(UAV_ADMIN_GRUPPE);
  const markiert = await encode({
    token: { ...token, error: "RefreshTokenError" },
    secret: E2E_AUTH_SECRET,
    salt: SITZUNGS_KEKS,
  });
  const vorlage = await sitzungsKeks(kontext);
  if (!vorlage) throw new Error("kein Sitzungs-Cookie im Kontext");
  await kontext.addCookies([{ ...vorlage, value: markiert }]);
  return markiert;
}

test("nach endgueltigem Refresh-Fehler liefert die Admin-API weder Daten noch nimmt sie Aenderungen an", async ({
  page,
}) => {
  const kontext = page.context();
  await devLogin(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });

  // Gegenprobe: MIT diesem Cookie antwortet die API — sonst bewiese das Rot unten nichts.
  const vorher = await page.request.get(uavUrl("/api/admin/participants"), { maxRedirects: 0 });
  expect(vorher.status()).toBe(200);

  const keks = await sitzungsKeks(kontext);
  expect(keks, "Dev-Login hat kein Sitzungs-Cookie gesetzt").toBeDefined();
  const markiert = await alsEndgueltigGescheitertMarkieren(kontext, keks!.value);

  const lesen = await page.request.get(uavUrl("/api/admin/participants"), { maxRedirects: 0 });
  expect(lesen.status(), await lesen.text()).not.toBe(200);
  expect([302, 303, 307, 401, 403, 404]).toContain(lesen.status());
  expect(await lesen.text()).not.toContain("E2ETEST1");

  // Der Server raeumt das Cookie ab (`sessionStore.clean()`), statt es neu auszustellen.
  expect(await sitzungsKeks(kontext)).toBeUndefined();

  // Wer das Cookie aufbewahrt und erneut schickt, kommt auch beim naechsten Mal
  // nicht weiter — und eine Mutation schon gar nicht.
  await kontext.addCookies([{ ...keks!, value: markiert }]);
  const anlegen = await page.request.post(uavUrl("/api/admin/participants"), {
    data: { name: "DRK-284 darf nicht entstehen" },
    maxRedirects: 0,
  });
  expect(anlegen.status(), await anlegen.text()).not.toBe(201);
  expect([302, 303, 307, 401, 403, 404]).toContain(anlegen.status());

  // Beleg ueber eine frische, gueltige Admin-Sitzung: nichts wurde angelegt.
  await devLogin(page, { host: UAV_HOST, groups: UAV_ADMIN_GRUPPE, callbackPath: "/admin" });
  const nachher = await page.request.get(uavUrl("/api/admin/participants"), { maxRedirects: 0 });
  expect(nachher.status()).toBe(200);
  expect(await nachher.text()).not.toContain("DRK-284 darf nicht entstehen");
});
