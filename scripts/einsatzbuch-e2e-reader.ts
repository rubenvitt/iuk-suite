import { chromium } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "../e2e/fixtures";

/**
 * Stufe 6, Task 11: öffnet die Exportdatei des Ende-zu-Ende-Laufs im Reader der Suite
 * (`/reader` auf dem Modul-Host) — Chromium über die Playwright-API, ohne Testrunner, wie
 * `scripts/einsatzbuch-e2e-anmeldung.ts`.
 *
 *   pnpm exec tsx scripts/einsatzbuch-e2e-reader.ts <suite-url> <datei> <kennwort> <nummer> <stichwort>
 *
 * `nummer` und `stichwort` sind die Erwartung für das Detail (der Treiber `e2e_lauf.rs` kennt
 * sie aus Schritt 3). Je Prüfung eine Zeile `Reader: …`; eine verfehlte Prüfung beendet das
 * Skript mit Exit 1.
 *
 * Sicherer Kontext wie `e2e/einsatzbuch-reader.spec.ts`: Der Reader entschlüsselt mit
 * WebCrypto, und `http://*.localtest.me` ist kein sicherer Kontext. Der Startschalter
 * `--unsafely-treat-insecure-origin-as-secure=<suite>` stellt HTTPS für genau diesen Ursprung
 * nach; `channel: "chromium"`, weil die Headless-Shell den Schalter still übergeht. Zugesichert
 * wird das vor der Datei, sonst endete sie als „beschädigt“.
 */
const GRUPPE = "einsatzbuch-verwaltung";
const TESTBAND = "Testdaten — kein echter Einsatz";
/** PBKDF2 mit 600 000 Runden im Browser, auf einer ausgelasteten Maschine. */
const ENTSCHLUESSELT_MS = 60_000;
/** Obergrenze für den ganzen Aufruf; hängt er, beendet er sich selbst. */
const GESAMTFRIST_MS = 240_000;

async function main(): Promise<void> {
  const [suite, datei, kennwort, nummer, stichwort] = process.argv.slice(2);
  if (!suite || !datei || !kennwort || !nummer || !stichwort) {
    throw new Error("Aufruf: einsatzbuch-e2e-reader.ts <suite-url> <datei> <kennwort> <nummer> <stichwort>");
  }
  const u = new URL(suite);
  const ursprung = u.origin;
  const port = Number(u.port || (u.protocol === "https:" ? 443 : 80));
  const browser = await chromium.launch({ channel: "chromium", args: [`--unsafely-treat-insecure-origin-as-secure=${ursprung}`] });
  try {
    const page = await (await browser.newContext()).newPage();
    await devLogin(page, { host: u.hostname, port, groups: GRUPPE, callbackPath: "/" });
    console.log(`Reader: Dev-Login als ${GRUPPE} auf ${u.hostname}`);

    // Falle 10: Route Handler vor dem ersten POST aufwärmen.
    const warm = await page.request.get(`${ursprung}/api/audit/browser`, { timeout: 120_000 });
    if (warm.status() !== 204) throw new Error(`Warmlauf /api/audit/browser: HTTP ${warm.status()}`);
    const antwort = await page.goto(`${ursprung}/reader`);
    if (antwort?.status() !== 200) throw new Error(`GET /reader: HTTP ${antwort?.status() ?? "keine Antwort"}`);
    // Erst nach der Hydrierung wählen — sonst geht das change-Ereignis am React-Handler vorbei.
    await page.waitForLoadState("networkidle");
    const sicher = await page.evaluate(() => window.isSecureContext && typeof crypto.subtle === "object");
    if (!sicher) throw new Error("Kein sicherer Kontext: crypto.subtle fehlt (Startschalter oder volles Chromium fehlt).");
    console.log(`Reader: GET /reader 200, sicherer Kontext mit crypto.subtle`);

    // Falle 10: die ausgelöste Anfrage selbst prüfen, nicht nur ihr Absenden.
    const geoeffnet = page.waitForResponse((r) => r.url() === `${ursprung}/api/audit/browser` && r.request().method() === "POST"
      && r.request().postData()?.includes('"reader_oeffnen"') === true, { timeout: ENTSCHLUESSELT_MS });
    await page.getByLabel("Einsatzbuch-Datei").setInputFiles(datei);
    await page.getByRole("region", { name: "Kennwort" }).locator("input").fill(kennwort);
    await klickeWennRuhig(page.getByRole("button", { name: "Entschlüsseln" }));

    await page.locator("[data-kettenpruefung]").getByText("Kette intakt", { exact: true }).waitFor({ timeout: ENTSCHLUESSELT_MS });
    console.log("Reader: Kettenprüfung „Kette intakt“");
    const audit = await geoeffnet;
    if (audit.status() !== 204) throw new Error(`Audit reader_oeffnen: HTTP ${audit.status()}`);
    console.log(`Reader: Audit reader_oeffnen 204 ${JSON.stringify(audit.request().postDataJSON())}`);

    await page.getByText(TESTBAND, { exact: true }).waitFor({ timeout: 10_000 });
    console.log(`Reader: Testband „${TESTBAND}“`);

    const detail = page.getByRole("region", { name: "Block 1", exact: true });
    await detail.locator("[data-kicker]").first().getByText(`Block 1 · ${nummer}`, { exact: true }).waitFor({ timeout: 10_000 });
    console.log(`Reader: Detail Block 1 · ${nummer}`);
    await detail.getByRole("heading", { name: stichwort, exact: true }).waitFor({ timeout: 10_000 });
    console.log(`Reader: Detail Stichwort „${stichwort}“`);
  } finally {
    await browser.close();
  }
}

setTimeout(() => {
  console.error(`Abbruch nach ${GESAMTFRIST_MS / 1000} s ohne Ergebnis.`);
  process.exit(2);
}, GESAMTFRIST_MS).unref();

// Kein Top-Level-`await`: `tsx` übersetzt dieses Skript nach CJS, das kennt es nicht.
main().then(
  () => process.exit(0),
  (e) => { console.error(e instanceof Error ? e.message : e); process.exit(1); },
);
