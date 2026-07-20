import { readFile } from "node:fs/promises";
import { test, expect, type Page } from "@playwright/test";
import { devLogin } from "./fixtures";
import { decodeQr, decodeQrPng } from "./helpers/decode-qr";

/**
 * E2E fuer das Modul `qr`. Die QR-Tests dekodieren den angezeigten Code
 * zurueck, statt nur die Anwesenheit eines `<svg>` zu pruefen — nur so faellt
 * auf, wenn der Code den falschen Inhalt traegt.
 */

const QR = "http://qr.localtest.me:3100";

/**
 * `QrDisplay` erzeugt das SVG in einem Effekt; bis die Promise aufloest, ist die
 * Box leer. Ohne dieses Warten liefert `innerHTML()` den leeren String, und der
 * Test schlaege mit "konnte nicht dekodiert werden" fehl statt mit dem echten
 * Vergleich.
 */
async function readQrSvg(page: Page): Promise<string> {
  const box = page.getByTestId("qr-display");
  await expect(box.locator("svg")).toBeVisible();
  return box.innerHTML();
}

test("anonym: URL eingeben erzeugt einen lesbaren QR-Code", async ({ page }) => {
  await page.goto(`${QR}/`);
  await page.getByLabel("Link oder Text").fill("https://drk.de");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  expect(await decodeQr(await readQrSvg(page))).toBe("https://drk.de");
});

test("anonym: WLAN-Formular erzeugt den korrekten WIFI:-String", async ({ page }) => {
  await page.goto(`${QR}/wifi`);
  await page.getByLabel("SSID").fill("DRK-Test");
  await page.getByLabel("Passwort").fill("geheim");
  await page.getByRole("button", { name: /erzeugen/i }).click();
  expect(await decodeQr(await readQrSvg(page))).toBe("WIFI:T:WPA;S:DRK-Test;P:geheim;H:false;;");
});

test("anonym sieht keine Presets, sondern den Anmelde-Hinweis", async ({ page }) => {
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("qr-login-hint")).toBeVisible();
  await expect(page.getByTestId("preset-grid")).toHaveCount(0);
});

test("eingeloggt sieht das Preset-Grid mit dem Seed-Preset", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "" });
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("preset-grid")).toBeVisible();
  await expect(page.getByText("Beispiel-Link")).toBeVisible();
});

/**
 * Das geteilte Einsatz-Tablet. Der Verlauf liegt im localStorage und ueberlebt
 * jeden Logout — ohne Bindung an die Sitzung sah die naechste, anonyme Person
 * die Schnellzugriffe der vorigen und holte sich mit einem Tipp deren Nutzlast
 * zurueck, bei einem WLAN-Preset samt Passwort in der Adresszeile.
 *
 * Bewusst hier und nicht in `pwa-spike.spec.ts`: der Verlauf haengt am
 * localStorage, nicht am Service Worker, und die Session-Tests des Moduls stehen
 * ohnehin in dieser Datei (samt Seed-Preset).
 */
test("nach dem Logout sieht die naechste Person den Verlauf nicht mehr", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "" });
  await page.goto(`${QR}/`);
  await page.getByTestId("preset-tile").filter({ hasText: "Beispiel-Link" }).click();
  await expect(page.getByTestId("qr-display").locator("svg")).toBeVisible();

  // Erst der Beleg, dass ueberhaupt etwas im Verlauf steht — sonst waere der
  // Test auch dann gruen, wenn der Schnellzugriff gar nichts geschrieben haette.
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("history-entry").filter({ hasText: "Beispiel-Link" })).toHaveCount(
    1,
  );

  // Abmelden heisst hier: die Sitzungs-Cookies weg. Der localStorage bleibt
  // unangetastet — genau das ist der Fall, um den es geht.
  await page.context().clearCookies();
  await page.goto(`${QR}/`);
  await expect(page.getByTestId("qr-login-hint")).toBeVisible();

  // Auf den anonymen Zustand warten, nicht auf ein statisches HTML: der Server
  // liefert das Login-Hint sofort (anonym), aber `HistoryOwner` liest die
  // Sitzung clientseitig — in der CI kann das länger dauern als der
  // Schnappschuss in HistoryList. Ohne diesen Poll kann der Verlauf eines
  // Angemeldeten noch sichtbar sein, wenn der Test prüft, ob er weg ist.
  // Das Hook spiegelt denselben Wert, den HistoryOwner in den Store schreibt —
  // der Test wartet also genau auf den Zustand, den die Komponente auch sieht.
  await expect
    .poll(() => page.evaluate(() => window.__historyOwner ?? null), { timeout: 10_000 })
    .toBeNull();

  await expect(page.getByTestId("qr-history")).toHaveCount(0);
});

test("Admin-Route ist ohne die Gruppe nicht vorhanden (404, nicht 403)", async ({ page }) => {
  await devLogin(page, { host: "qr.localtest.me", groups: "drk-qr-user" });
  const res = await page.goto(`${QR}/admin`);
  expect(res?.status()).toBe(404);
});

test("drk-qr-admin kann ein Preset anlegen", async ({ page }) => {
  await devLogin(page, {
    host: "qr.localtest.me",
    groups: "drk-qr-admin",
    callbackPath: "/admin",
  });
  await expect(page.getByTestId("qr-admin")).toBeVisible();
  await page.getByLabel("Bezeichnung").fill("Neues Preset");
  // Die Art steht per Vorgabe auf "Web-Adresse"; das Wertfeld traegt dessen
  // Namen. Ueber die Rolle adressiert, weil `getByLabel` zusaetzlich die
  // Art-Auswahl traefe — deren Label schliesst die Optionstexte mit ein.
  await page.getByRole("textbox", { name: "Web-Adresse" }).fill("https://neu.example");
  await page.getByRole("button", { name: /anlegen/i }).click();
  // Auf die Liste eingegrenzt, nicht per getByText: die Ueberschrift "Neues
  // Preset anlegen" enthaelt denselben Text und machte die Zusicherung
  // mehrdeutig — sie wuerde auch dann gruen, wenn nichts angelegt wurde.
  await expect(page.getByTestId("preset-row").filter({ hasText: "Neues Preset" })).toHaveCount(1);

  // Bis hierher ist nur die BEZEICHNUNG belegt. Die Preset-Zeile rendert den
  // gespeicherten Wert nirgends — verwirft oder vertauscht die Server-Action
  // ihn, bliebe der Test gruen und das Preset erzeugte im Einsatz einen Code,
  // der ins Leere fuehrt. Deshalb dem Preset bis zum fertigen Code folgen:
  // Formular -> DB -> Kachel -> QR-Code.
  await page.goto(`${QR}/`);
  await page.getByTestId("preset-tile").filter({ hasText: "Neues Preset" }).click();
  expect(await decodeQr(await readQrSvg(page))).toBe("https://neu.example");
});

/**
 * Der Bearbeiten-Pfad. Ohne ihn blieb einem Admin nach einer WLAN-Passwort-
 * rotation nur Loeschen und Neuanlegen — und `createPreset` vergibt dabei
 * sortOrder = max+1, die Kachel rutscht im Schnellzugriff also ans Ende, weg von
 * der Position, die die Einsatzkraefte kennen.
 *
 * Dem Preset wird bis zum fertigen Code gefolgt (Formular -> DB -> Kachel ->
 * QR-Code): die Preset-Zeile rendert den gespeicherten Wert nirgends, ein Test
 * bis zur Liste bliebe also auch dann gruen, wenn die Action den Wert verwirft.
 */
test("drk-qr-admin kann ein Preset bearbeiten, ohne es neu anzulegen", async ({ page }) => {
  await devLogin(page, {
    host: "qr.localtest.me",
    groups: "drk-qr-admin",
    callbackPath: "/admin",
  });
  await page.getByLabel("Bezeichnung").fill("Preset vor Rotation");
  await page.getByRole("textbox", { name: "Web-Adresse" }).fill("https://alt.example");
  await page.getByRole("button", { name: /anlegen/i }).click();

  const row = page.getByTestId("preset-row").filter({ hasText: "Preset vor Rotation" });
  await expect(row).toHaveCount(1);
  await row.getByTestId("preset-edit").click();

  // Die Art bleibt beim Bearbeiten gesperrt — ein Wechsel machte den
  // gespeicherten Wert bedeutungslos.
  await expect(page.getByLabel("Art")).toBeDisabled();
  await page.getByLabel("Bezeichnung").fill("Preset nach Rotation");
  await page.getByRole("textbox", { name: "Web-Adresse" }).fill("https://neu.example");
  await page.getByRole("button", { name: "Speichern" }).click();

  // Auch die Bezeichnung wird geaendert, damit hier auf etwas SICHTBAR Neues
  // gewartet werden kann. Auf die unveraenderte Zeile zu pruefen waere sofort
  // gruen — und das anschliessende page.goto brach die noch laufende Action ab.
  const updated = page.getByTestId("preset-row").filter({ hasText: "Preset nach Rotation" });
  await expect(updated).toHaveCount(1);
  // Dieselbe id wie beim Anlegen: bearbeitet, nicht geloescht und neu angelegt.
  // An der id haengen sortOrder (die Kachelposition) und die Audit-Felder.
  await expect(updated.locator("code")).toHaveText("preset-vor-rotation");
  await expect(page.getByTestId("preset-row").filter({ hasText: "Preset vor Rotation" })).toHaveCount(
    0,
  );

  await page.goto(`${QR}/`);
  await page.getByTestId("preset-tile").filter({ hasText: "Preset nach Rotation" }).click();
  expect(await decodeQr(await readQrSvg(page))).toBe("https://neu.example");
});

test("der QR-URL-Vertrag funktioniert direkt", async ({ page }) => {
  // Dieser Link-Aufbau ist im Umlauf (gebookmarkt, geteilt) — er muss halten.
  await page.goto(`${QR}/qr?data=${encodeURIComponent("https://drk.de")}&label=Test&kind=url`);
  expect(await decodeQr(await readQrSvg(page))).toBe("https://drk.de");
});

test("anonym: Kontakt-Formular erzeugt eine lesbare vCard", async ({ page }) => {
  // Bewusst eine LANGE vCard mit allen vier Feldern. Zwei Gruende:
  //
  // 1. Alle uebrigen QR-Tests hier tragen 14 bis 40 Bytes und damit kleine
  //    Codes. Erst ein grosser Code prueft den Dekodier-Helfer ernsthaft: mit
  //    dem frueheren festen `resize(512, 512)` scheiterte er hier mit
  //    "QR-Code konnte nicht dekodiert werden", obwohl der Code einwandfrei
  //    war — und der naechste Entwickler haette den Fehler im vCard-Encoding
  //    gesucht statt im Testwerkzeug.
  // 2. /contact war bis hierher gar nicht durch die E2E abgedeckt.
  const name = "Maximiliane von Musterhausen-Schoenberg";
  const tel = "+49 30 85404 1234";
  const email = "maximiliane.von.musterhausen@drk-kreisverband-berlin-nordwest.example";
  const org =
    "Deutsches Rotes Kreuz Kreisverband Berlin Nordwest e.V. Fachdienst Information und " +
    "Kommunikation Einsatzabschnitt Fuehrungsunterstuetzung Bereitschaft 4 Standort Reinickendorf";

  await page.goto(`${QR}/contact`);
  await page.getByLabel("Name").fill(name);
  await page.getByLabel("Telefon").fill(tel);
  await page.getByLabel("E-Mail").fill(email);
  await page.getByLabel("Organisation").fill(org);
  await page.getByRole("button", { name: /erzeugen/i }).click();

  expect(await decodeQr(await readQrSvg(page))).toBe(
    `BEGIN:VCARD\nVERSION:3.0\nFN:${name}\nTEL:${tel}\nEMAIL:${email}\nORG:${org}\nEND:VCARD`,
  );
});

/**
 * Ab hier die drei Einsatz-Funktionen der Anzeige, die Task 8 ausdruecklich
 * hierher delegiert hat ("eine Unit-Test-Attrappe fuer Canvas/Fullscreen waere
 * teurer als aussagekraeftig"). Sie tragen echte Logik — 1024x1024-Canvas,
 * weisser Hintergrund vor dem drawImage, Dateiname aus `label` — und waren
 * bislang weder hier noch in QrDisplay.test.tsx abgedeckt.
 */

const VIEW = `/qr?data=${encodeURIComponent("https://drk.de")}&label=Test&kind=url`;

test("PNG speichern laedt eine Datei mit demselben Code herunter", async ({ page }) => {
  await page.goto(`${QR}${VIEW}`);
  await readQrSvg(page);

  const [download] = await Promise.all([
    page.waitForEvent("download"),
    page.getByRole("button", { name: "PNG speichern" }).click(),
  ]);

  // Der Dateiname kommt aus `label`. Faellt er auf "qr" zurueck, heissen alle
  // Downloads eines Einsatzes qr.png, qr (1).png — die Zuordnung ist weg.
  expect(download.suggestedFilename()).toBe("Test.png");

  // Und der entscheidende Teil: dass die Datei denselben Code traegt wie der
  // Bildschirm. Ein auf 0x0 skaliertes drawImage oder ein fehlender weisser
  // Hintergrund ergaebe eine Datei, die ankommt und nichts zeigt.
  const path = await download.path();
  expect(await decodeQrPng(await readFile(path))).toBe("https://drk.de");
});

test("Vollbild schaltet die Anzeige in den Vollbildmodus", async ({ page }) => {
  await page.goto(`${QR}${VIEW}`);
  await readQrSvg(page);

  expect(await page.evaluate(() => document.fullscreenElement !== null)).toBe(false);
  await page.getByRole("button", { name: "Vollbild" }).click();
  await expect
    .poll(() => page.evaluate(() => document.fullscreenElement?.getAttribute("data-testid")))
    .toBe("qr-display");
});

test("Teilen reicht Nutzlast und Bezeichnung an das System weiter", async ({ page }) => {
  // navigator.share gibt es im Testbrowser nicht — ohne Attrappe verliesse
  // QrDisplay die Funktion sofort ueber `if (!navigator.share) return`, und der
  // Test bewiese nichts. Vor der Navigation gesetzt, damit die Attrappe steht,
  // bevor React haengt.
  await page.addInitScript(() => {
    (window as unknown as { __shared: unknown[] }).__shared = [];
    Object.defineProperty(navigator, "share", {
      value: (data: unknown) => {
        (window as unknown as { __shared: unknown[] }).__shared.push(data);
        return Promise.resolve();
      },
      configurable: true,
    });
  });

  await page.goto(`${QR}${VIEW}`);
  await readQrSvg(page);
  await page.getByRole("button", { name: "Teilen" }).click();

  // Geteilt wird bewusst der Nutzlast-TEXT, nicht das Bild: so kann der
  // Empfaenger den Link direkt oeffnen, statt einen Code abzuscannen.
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { __shared: unknown[] }).__shared))
    .toEqual([{ title: "Test", text: "https://drk.de" }]);
});
