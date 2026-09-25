/**
 * Verwaltung am Rechner im echten Browser gegen den Vite-Dev-Server, mit gestubbtem `invoke`
 * (`./stub.ts`). Deckt Einrichtung (Testrechner), Anmeldung, die entschlüsselte Verwaltung samt
 * Kettenprüfung, die Sperre (Knopf und Ruhe-Uhr über `page.clock`) und den Freigabe-Fehler ohne
 * Verbindung ab. Ein Klick-Ende-zu-Ende über die echte Tauri-Hülle gibt es nicht (Spec §9.3,
 * Entscheidung 16 aus `kontext.md`: WKWebView kennt keinen WebDriver) — dafür steht
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

import type { Block } from "@kern/format";

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
