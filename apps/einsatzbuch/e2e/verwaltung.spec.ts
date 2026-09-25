/**
 * Verwaltung am Rechner im echten Browser gegen den Vite-Dev-Server, mit gestubbtem `invoke`
 * (`./stub.ts`). Deckt Einrichtung (Testrechner), Anmeldung, die entschlüsselte Verwaltung samt
 * Kettenprüfung, die Sperre (Knopf und Ruhe-Uhr über `page.clock`), den Freigabe-Fehler ohne
 * Verbindung, den Export, das Berichtsblatt samt Druckregeln und die Karte „Einstellungen“
 * (Sicherungsordner, Wiederherstellen, Autostart) ab. Ein Klick-Ende-zu-Ende über die echte Tauri-Hülle gibt es nicht (Spec §9.3,
 * Plan Stufe 5, Entscheidung 16: WKWebView kennt keinen WebDriver) — dafür steht
 * `T/examples/e2e_lauf.rs` (Task 12). Diese Datei prüft nur die Oberfläche.
 *
 * Blöcke und Inhaltsschlüssel kommen wörtlich aus den eingefrorenen Kern-Testvektoren
 * (`K/testvektoren/erwartet.json`, `eingaben.json`) — demselben Datensatz wie
 * `verwaltung/useVerwaltung.test.tsx` und `App.test.tsx`. Entschlüsselt wird dabei nicht der
 * Stub, sondern der geteilte Kern im echten Browser (`@kern/block`, Web Crypto) — anders als in
 * Vitest/jsdom ein echter Rundlauf.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { expect, test, type Page } from "@playwright/test";

import { entschluesseleExport } from "@kern/export";
import type { Block, Exportdatei } from "@kern/format";

import type { Schluesselposten } from "../src/typen";
import { installiereStub, type StubOptionen } from "./stub";

const KERN_TESTVEKTOREN = path.resolve(import.meta.dirname, "../../../src/app/m/einsatzbuch/_lib/kern/testvektoren");

interface ErwartetJson {
  bloecke: Block[];
}
interface EingabenJson {
  bloecke: { cek: string }[];
}

const erwartet: ErwartetJson = JSON.parse(readFileSync(path.join(KERN_TESTVEKTOREN, "erwartet.json"), "utf-8"));
const eingaben: EingabenJson = JSON.parse(readFileSync(path.join(KERN_TESTVEKTOREN, "eingaben.json"), "utf-8"));

/** Drei schon versiegelte Blöcke: RD 2 (2026-041), SanD (2026-042), MANV 10 (2026-043, neuester). */
const BLOECKE: Block[] = erwartet.bloecke;
/** Deren Inhaltsschlüssel, block-weise — wie `verwaltung/testvektoren.ts` sie für Vitest bildet. */
const SCHLUESSELPOSTEN: Schluesselposten[] = eingaben.bloecke.map((b, i) => ({ block: i + 1, cek: b.cek }));

interface Aufruf {
  cmd: string;
  args: Record<string, unknown>;
}

/** Das Aufrufprotokoll des Stubs, wahlweise auf einen Befehlsnamen gefiltert. */
async function aufrufe(page: Page, cmd?: string): Promise<Aufruf[]> {
  return page.evaluate(
    (gesuchterCmd) =>
      (window as unknown as { __aufrufe: Aufruf[] }).__aufrufe.filter((a) => gesuchterCmd === undefined || a.cmd === gesuchterCmd),
    cmd,
  );
}

/**
 * Von der eingerichteten Startseite über die Anmeldekarte in die Verwaltung — der gemeinsame
 * Anfang aller Tests, die schon eine Sitzung mit entschlüsselbaren Blöcken brauchen.
 */
async function meldeAnUndOeffneVerwaltung(page: Page, optionen: StubOptionen = {}): Promise<void> {
  await installiereStub(page, { betrieb: "echt", bloecke: BLOECKE, schluesselposten: SCHLUESSELPOSTEN, ...optionen });
  await page.goto("/");
  await page.getByRole("button", { name: "Verwaltung · Anmelden" }).click();
  await expect(page.getByText("Anmelden, um Einsätze zu lesen")).toBeVisible();
  await page.getByRole("button", { name: "Mit Pocket ID anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Versiegelte Einsätze" })).toBeVisible();
}

test("Verwaltung nach der Anmeldung: Kette, neuester Einsatz, „Kette prüfen“ bestätigt den Anker", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page);

  await expect(page.locator("button[data-block]")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();
  await expect(page.getByText("Kette intakt")).toBeVisible();
  await expect(page.getByText("Noch kein Anker von der Suite bestätigt")).toBeVisible();

  await page.getByRole("button", { name: "Kette prüfen" }).click();

  await expect(page.getByText("Kette intakt")).toBeVisible();
  await expect(page.getByText("Anker bestätigt bis Block 3")).toBeVisible();
});

test("Sitzung sperren verwirft den Klartext", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page);
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();

  await page.getByRole("button", { name: "Sitzung sperren" }).click();

  await expect(page.getByText("Sitzung gesperrt. Die Einsätze liegen nur noch verschlüsselt vor.")).toBeVisible();
  await expect(page.getByText("MANV 10")).toHaveCount(0);
  expect(await aufrufe(page, "abmelden")).toHaveLength(1);
});

test("Automatische Sperre: 10 Minuten ohne Eingabe sperren app-weit", async ({ page }) => {
  // Vor dem Laden installiert, damit alle Timer während des Ladens und der Anmeldung normal
  // laufen (`page.clock`-Leitfaden); erst danach wird gesprungen — ohne dazwischen die Maus zu
  // bewegen, sonst setzte ein Playwright-Klick die Ruhe-Uhr selbst wieder zurück.
  await page.clock.install();
  await installiereStub(page, { betrieb: "echt", bloecke: BLOECKE, schluesselposten: SCHLUESSELPOSTEN });
  await page.goto("/");
  await page.getByRole("button", { name: "Verwaltung · Anmelden" }).click();
  await page.getByRole("button", { name: "Mit Pocket ID anmelden" }).click();
  await expect(page.getByRole("heading", { name: "Versiegelte Einsätze" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();

  await page.clock.fastForward("10:01");

  await expect(page.getByText("Sitzung gesperrt. Die Einsätze liegen nur noch verschlüsselt vor.")).toBeVisible();
  await expect(page.getByText("MANV 10")).toHaveCount(0);
});

test("Ohne Verbindung: Die Freigabe scheitert, die Kette zeigt nur das Chiffrat", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page, { freigabeFehler: "Lesen braucht Verbindung zur Suite." });

  await expect(page.getByRole("alert")).toHaveText("Lesen braucht Verbindung zur Suite.");
  await expect(page.locator("button[data-block]")).toHaveCount(3);
  for (const block of [1, 2, 3]) {
    await expect(page.locator(`button[data-block="${block}"]`)).toHaveAccessibleName(`Block ${block}, verschlüsselt`);
  }
  await expect(page.getByText("MANV 10")).toHaveCount(0);
});

test("Einrichtungsfrage: „Testrechner“ mit Name ruft `einrichten` mit art „test“", async ({ page }) => {
  await installiereStub(page, { betrieb: null, entwicklung: false });
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Diesen Rechner einrichten" })).toBeVisible();

  await page.getByRole("radio", { name: /Testrechner/ }).check();
  await page.getByLabel("Name des Rechners").fill("Testrechner 1");
  await page.getByRole("button", { name: "Mit Pocket ID anmelden und einrichten" }).click();

  const [aufruf] = await aufrufe(page, "einrichten");
  expect(aufruf?.args).toMatchObject({ art: "test", name: "Testrechner 1" });
});

test("Export: Herunterladen, Kennwort zweimal, gespeichert — der Kern öffnet die Datei wieder", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page);
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();

  await page.getByRole("button", { name: "Herunterladen", exact: true }).click();
  const dialog = page.getByRole("dialog", { name: "Einsätze als Datei speichern" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("PBKDF2, 600.000 Runden")).toBeVisible();
  await dialog.getByLabel("Kennwort für die Datei").fill("korrekt-pferd-batterie");
  await dialog.getByLabel("Kennwort wiederholen").fill("korrekt-pferd-batterie");
  await dialog.getByRole("button", { name: "Datei speichern" }).click();

  await expect(dialog.getByText(/^Gespeichert als einsatzbuch_\d{4}-\d{2}-\d{2}_block-1-3\.einsatzbuch$/)).toBeVisible({ timeout: 30_000 });
  await expect(dialog.getByLabel("Kennwort für die Datei")).toHaveValue("");

  // Frische Schlüssel genau für die exportierten Blöcke (die erste Freigabe beim Öffnen ist ohne Liste).
  const freigaben = await aufrufe(page, "schluessel_freigeben");
  expect(freigaben.map((a) => a.args.bloecke)).toEqual([null, [1, 2, 3]]);
  const [speichern] = await aufrufe(page, "export_speichern");
  expect(speichern?.args.dateiname).toMatch(/^einsatzbuch_\d{4}-\d{2}-\d{2}_block-1-3\.einsatzbuch$/);

  // Der Stub hat nur eine Exportdatei der Version 2 angenommen; der Kern öffnet sie mit dem Kennwort.
  const datei = await page.evaluate(() => (window as unknown as { __export: Exportdatei }).__export);
  expect(datei).toMatchObject({ format: "einsatzbuch-export", version: 2, kopf: { umfang: "alle", von: 1, bis: 3, anzahl: 3, quelle: "DRK-Bereitschaft Uelzen" } });
  const inhalt = await entschluesseleExport(datei, "korrekt-pferd-batterie");
  expect(inhalt.bloecke).toEqual(BLOECKE);
  expect(Object.keys(inhalt.schluessel)).toEqual(["1", "2", "3"]);
  expect(inhalt.exportiertVon).toBe("Ruben Vitt");
});

test("Export „einzeln“ gibt nur den gewählten Block frei", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page);
  await page.locator('button[data-block="2"]').click();
  await expect(page.getByRole("heading", { name: "SanD" })).toBeVisible();

  await page.getByRole("button", { name: "Diesen Einsatz herunterladen" }).click();
  const dialog = page.getByRole("dialog", { name: "Einsätze als Datei speichern" });
  await expect(dialog.getByRole("button", { name: /^Nur 2026-042/ })).toHaveAttribute("aria-pressed", "true");
  await dialog.getByLabel("Kennwort für die Datei").fill("korrekt-pferd-batterie");
  await dialog.getByLabel("Kennwort wiederholen").fill("korrekt-pferd-batterie");
  await dialog.getByRole("button", { name: "Datei speichern" }).click();

  await expect(dialog.getByText("Gespeichert als einsatz_2026-042.einsatzbuch")).toBeVisible({ timeout: 30_000 });
  const freigaben = await aufrufe(page, "schluessel_freigeben");
  expect(freigaben.at(-1)?.args.bloecke).toEqual([2]);
});

test("Berichtsblatt: „PDF erzeugen“, im Druck nur das Blatt, „Als PDF speichern“ druckt über die Hülle", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page);
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();

  await page.getByRole("button", { name: "PDF erzeugen" }).click();
  const huelle = page.getByRole("dialog", { name: "Einsatzbericht · 2026-043" });
  await expect(huelle).toBeVisible();
  await expect(huelle.getByText("Im Druckdialog „Als PDF speichern“ wählen.")).toBeVisible();
  await expect(huelle.getByText("Unverändert seit der Versiegelung")).toBeVisible();

  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#wurzel")).toBeHidden();
  await expect(page.locator("[data-bericht]")).toBeVisible();
  await expect(huelle.getByRole("button", { name: "Als PDF speichern" })).toBeHidden();
  await page.emulateMedia({ media: "screen" });

  await huelle.getByRole("button", { name: "Als PDF speichern" }).click();
  await expect.poll(async () => (await aufrufe(page, "drucken")).length).toBe(1);

  await huelle.getByRole("button", { name: "Schließen" }).click();
  await expect(huelle).toHaveCount(0);
  // Ohne offene Überlagerung greifen die Druckregeln nicht mehr.
  await page.emulateMedia({ media: "print" });
  await expect(page.locator("#wurzel")).toBeVisible();
});

test("Einstellungen: „Ordner wählen“ zeigt danach die letzte Sicherung, der Autostart lässt sich schalten", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page);
  const karte = page.locator("section.karte").filter({ has: page.getByRole("heading", { name: "Einstellungen" }) });
  await expect(karte.getByText("Noch kein Sicherungsordner gewählt")).toBeVisible();
  // Die Kette ist nicht leer: kein Wiederherstellen.
  await expect(karte.getByRole("button", { name: "Aus Sicherung wiederherstellen" })).toHaveCount(0);

  const statusVorher = (await aufrufe(page, "status")).length;
  await karte.getByRole("button", { name: "Ordner wählen" }).click();
  await expect(karte.getByText(/^Letzte Sicherung: \d{2}\.\d{2}\.\d{4}, \d{2}:\d{2} Uhr$/)).toBeVisible();
  await expect(karte.getByText("/Volumes/Sicherung/Einsatzbuch")).toBeVisible();
  expect((await aufrufe(page, "status")).length).toBeGreaterThan(statusVorher);

  const schalter = karte.getByRole("switch", { name: "Beim Anmelden am Rechner starten" });
  await expect(schalter).toBeChecked();
  await schalter.click();
  await expect(schalter).not.toBeChecked();
  const [setzen] = await aufrufe(page, "autostart_setzen");
  expect(setzen?.args).toEqual({ an: false });
});

test("Aus Sicherung wiederherstellen: nach der Bestätigung „3 Blöcke wiederhergestellt“ und die Kette in der Verwaltung", async ({ page }) => {
  await meldeAnUndOeffneVerwaltung(page, { bloecke: [], sicherungsdatei: BLOECKE });
  await expect(page.locator("button[data-block]")).toHaveCount(0);

  await page.getByRole("button", { name: "Aus Sicherung wiederherstellen" }).click();
  const dialog = page.getByRole("dialog", { name: "Aus Sicherung wiederherstellen?" });
  await expect(dialog).toBeVisible();
  expect(await aufrufe(page, "wiederherstellen")).toHaveLength(0);
  await dialog.getByRole("button", { name: "Datei wählen" }).click();

  await expect(page.getByText("3 Blöcke wiederhergestellt")).toBeVisible();
  await expect(page.locator("button[data-block]")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "MANV 10" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Aus Sicherung wiederherstellen" })).toHaveCount(0);
  expect(await aufrufe(page, "wiederherstellen")).toHaveLength(1);
});
