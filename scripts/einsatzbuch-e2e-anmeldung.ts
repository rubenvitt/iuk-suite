import { createHash, randomBytes } from "node:crypto";
import { createServer } from "node:http";
import { chromium, type Page } from "@playwright/test";
import { devLogin, klickeWennRuhig } from "../e2e/fixtures";

/**
 * Stufe 5, Task 12: der Browserteil des Ende-zu-Ende-Laufs (Entscheidung 16). Pocket ID ersetzt
 * hier der Dev-Login der Suite (`AUTH_DEV_LOGIN=true`); gestartet wird Chromium über die
 * Playwright-API, ohne Testrunner.
 *
 *   pnpm exec tsx scripts/einsatzbuch-e2e-anmeldung.ts <anmelde-url>
 *     Anmelden mit der Gruppe `einsatzbuch-verwaltung` und die Anmelde-URL der App öffnen. Die
 *     Suite leitet auf `http://127.0.0.1:<port>/rueckruf` weiter; dort antwortet der ECHTE
 *     Loopback-Listener der App (`e2e_lauf.rs` startet dieses Skript aus seinem `oeffne`).
 *   pnpm exec tsx scripts/einsatzbuch-e2e-anmeldung.ts --loeschen <suite-url> <rechnername>
 *     Den Test-Rechner über die Seite „Rechner“ löschen (Schritt 6 des Treibers).
 *   pnpm exec tsx scripts/einsatzbuch-e2e-anmeldung.ts --echt-anlegen <suite-url> <rechnername>
 *     Vor dem Lauf einen echten Rechner anlegen, wie `rechnerAnlegen` in
 *     `e2e/einsatzbuch-anbindung.spec.ts` — damit „der Lauf ändert keine echte Zeile“ an einer
 *     vorhandenen Zeile geprüft wird statt an einer leeren Tabelle.
 *
 * Nie ausgegeben: die Rückrufadresse (sie trägt den Einmalcode) und jedes Token.
 */
const GRUPPE = "einsatzbuch-verwaltung";
/** Obergrenze für den ganzen Aufruf. Hängt er, beendet er sich selbst; der Treiber bricht dann die Anmeldung ab. */
const GESAMTFRIST_MS = 240_000;

/**
 * Die Routen, die die App im Lauf trifft, auf genau dem Pfad, den der Rust-Kern baut
 * (`anmeldung::modul_url`: `<suite>/m/einsatzbuch<pfad>`). Warmlauf (Falle 10, `CLAUDE.md`):
 * `next dev` übersetzt eine Route erst beim ersten Aufruf, und das kann länger dauern als das
 * Zeitlimit des Rust-Transports (15 s). Ein GET auf einen POST-Handler antwortet 405, ohne Token
 * 401 — beides genügt. Ein 404 hieße, dass der interne Pfad auf dem Modul-Host nicht gilt.
 */
const ROUTEN = ["/api/anmelden/tausch", "/api/einrichten", "/api/anker", "/api/stammdaten", "/api/schluessel/freigeben", "/api/rechner/warmlauf"];

async function waermeAuf(page: Page, suite: string): Promise<void> {
  for (const pfad of ROUTEN) {
    const antwort = await page.request.get(`${suite}/m/einsatzbuch${pfad}`, { maxRedirects: 0, timeout: 120_000 });
    const status = antwort.status();
    if (status === 404 || status >= 500) throw new Error(`Warmlauf ${pfad}: HTTP ${status}`);
    console.log(`Warmlauf /m/einsatzbuch${pfad}: HTTP ${status}`);
  }
}

function hostUndPort(suite: string): { host: string; port: number } {
  const u = new URL(suite);
  return { host: u.hostname, port: Number(u.port || (u.protocol === "https:" ? 443 : 80)) };
}

async function mitBrowser(arbeit: (page: Page) => Promise<void>): Promise<void> {
  const browser = await chromium.launch();
  try {
    const page = await (await browser.newContext()).newPage();
    await arbeit(page);
  } finally {
    await browser.close();
  }
}

async function anmelden(page: Page, anmeldeUrl: string): Promise<void> {
  const u = new URL(anmeldeUrl);
  const suite = u.origin;
  await waermeAuf(page, suite);
  await devLogin(page, { ...hostUndPort(suite), groups: GRUPPE, callbackPath: "/" });
  console.log(`Dev-Login als ${GRUPPE} auf ${u.hostname}`);
  await page.goto(anmeldeUrl);
  try {
    await page.waitForURL((ziel) => ziel.hostname === "127.0.0.1" && ziel.pathname === "/rueckruf", { timeout: 60_000 });
  } catch {
    const titel = await page.locator("h1, h2, .ant-result-title").first().textContent().catch(() => null);
    throw new Error(`Keine Weiterleitung auf den Rückruf; die Suite zeigt: ${titel ?? "(nichts Lesbares)"}`);
  }
  await page.getByText("Du kannst dieses Fenster schließen.").waitFor({ timeout: 30_000 });
  console.log(`Rückruf an 127.0.0.1:${new URL(page.url()).port} zugestellt, die App hat geantwortet`);
}

async function loeschen(page: Page, suite: string, name: string): Promise<void> {
  await devLogin(page, { ...hostUndPort(suite), groups: GRUPPE, callbackPath: "/" });
  await page.goto(`${suite}/rechner`);
  // Über die Tabellen-Rolle (wie `e2e/einsatzbuch-anbindung.spec.ts`): `Kartentabelle` rendert
  // Karten- und Tabellendarstellung, ein reiner Textgreifer träfe beide.
  const tabelle = page.getByRole("table", { name: "Test-Rechner" });
  const zeile = tabelle.locator("[data-row-key]", { hasText: name });
  await zeile.waitFor({ timeout: 60_000 });
  await klickeWennRuhig(zeile.getByRole("button", { name: "Test-Rechner löschen" }));
  await page.getByText(`Test-Rechner „${name}“ löschen?`).waitFor();
  await klickeWennRuhig(page.getByRole("button", { name: "Endgültig löschen" }));
  await zeile.waitFor({ state: "detached", timeout: 30_000 });
  console.log(`Test-Rechner „${name}“ über die Seite „Rechner“ gelöscht`);
}

async function echtAnlegen(page: Page, suite: string, name: string): Promise<void> {
  await waermeAuf(page, suite);
  await devLogin(page, { ...hostUndPort(suite), groups: GRUPPE, callbackPath: "/" });
  const verifier = randomBytes(48).toString("base64url");
  const challenge = createHash("sha256").update(verifier, "ascii").digest("base64url");
  const state = randomBytes(16).toString("base64url");
  const port = 40_000 + Math.floor(Math.random() * 20_000);

  let aufgeloest!: (code: string | null) => void;
  const empfangen = new Promise<string | null>((resolve) => { aufgeloest = resolve; });
  const server = createServer((req, res) => {
    res.writeHead(200, { "content-type": "text/html; charset=utf-8" });
    res.end("Du kannst dieses Fenster schließen.");
    aufgeloest(new URL(req.url ?? "/", `http://127.0.0.1:${port}`).searchParams.get("code"));
  });
  await new Promise<void>((resolve) => server.listen(port, "127.0.0.1", resolve));
  let code: string | null;
  try {
    const q = new URLSearchParams({ port: String(port), state, challenge, art: "echt", name });
    await page.goto(`${suite}/anmelden?${q.toString()}`);
    const ersetzen = page.getByRole("button", { name: "Ersetzen" });
    if (await ersetzen.isVisible().catch(() => false)) await ersetzen.click();
    code = await empfangen;
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
  if (!code) throw new Error("Kein Code im Rückruf.");

  const tausch = await page.request.post(`${suite}/m/einsatzbuch/api/anmelden/tausch`, { data: { code, verifier } });
  if (!tausch.ok()) throw new Error(`tausch: HTTP ${tausch.status()}`);
  const { sitzungstoken } = (await tausch.json()) as { sitzungstoken: string };
  const einrichten = await page.request.post(`${suite}/m/einsatzbuch/api/einrichten`, {
    headers: { authorization: `Bearer ${sitzungstoken}` },
    data: { art: "echt", name },
  });
  if (!einrichten.ok()) throw new Error(`einrichten: HTTP ${einrichten.status()}`);
  const { rechnerId } = (await einrichten.json()) as { rechnerId: string };
  console.log(`Echter Rechner „${name}“ angelegt: ${rechnerId}`);
}

async function main(): Promise<void> {
  const [erstes, suite, name] = process.argv.slice(2);
  if (erstes === "--loeschen" && suite && name) return mitBrowser((page) => loeschen(page, suite, name));
  if (erstes === "--echt-anlegen" && suite && name) return mitBrowser((page) => echtAnlegen(page, suite, name));
  if (erstes && !erstes.startsWith("--")) return mitBrowser((page) => anmelden(page, erstes));
  throw new Error(
    "Aufruf: einsatzbuch-e2e-anmeldung.ts <anmelde-url> | --loeschen <suite-url> <name> | --echt-anlegen <suite-url> <name>",
  );
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
