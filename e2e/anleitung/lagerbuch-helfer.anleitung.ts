/**
 * DIE HELFER-ANLEITUNG DES LAGERBUCHS ZUM AUSHÄNGEN (IDA-278, Generator IDA-291) — drei A4-Blätter
 * mit Bildern der Helfer-Ansicht: Material entnehmen, in die Entnahmebox zurückpacken, Fahrzeugcheck.
 * Vorbild ist die Anleitung für den Einsatzbuch-Rechner (`apps/einsatzbuch/anleitung/`).
 *
 * Fährt die Helfer-Ansicht auf dem Handy gegen die Suite mit den lokalen Demodaten ab
 * (`playwright.anleitung.config.ts`), hebt an jedem Schritt hervor, worauf es ankommt (der Rest des
 * Bildes wird hell und blass, fest ins JPEG gerechnet, damit jeder PDF-Betrachter dasselbe zeigt),
 * setzt die Bilder in `lagerbuch-helfer.html` ein und druckt sie nach
 * `public/m/lagerbuch/helfer-anleitung.pdf`. Ändert sich die Helfer-Ansicht sichtbar,
 * `pnpm anleitung:lagerbuch` neu fahren und das PDF mit committen. Bricht ein Schritt, weil die
 * Ansicht sich geändert hat, wird der CI-Job `anleitung` rot.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

import { registerAuditFunctions } from "@/core/audit/context";
import { expect, test, type Locator, type Page } from "@playwright/test";
import Database from "better-sqlite3";
import QRCode from "qrcode";

import { decodeQrPng } from "../helpers/decode-qr";

const VORLAGE = path.join(__dirname, "lagerbuch-helfer.html");
// Die CI (`ci.yml`, Job `anleitung`) schreibt woandershin: Sie prüft nur, dass die Anleitung
// noch entsteht, und legt das Ergebnis als Artefakt ab.
const ZIEL = process.env.ANLEITUNG_ZIEL ?? path.join(__dirname, "../../public/m/lagerbuch/helfer-anleitung.pdf");
/** Die Datenbank, die `playwright.anleitung.config.ts` frisch mit den Demodaten füllt. */
const DB_PFAD = path.join(__dirname, "../../.data/anleitung/lagerbuch.db");
/** Die Gegenprobe zu `scheinQr`: ein echter Code, gleich gesetzt, MUSS sich lesen lassen. */
const QR_PROBE = "BEISPIEL - kein echter Lagerbuch-Code";
/** Der allgemeine Helfer-Code der Demodaten (`_lib/seedLokal.ts`, `CODE_HELFER`). */
const CODE_HELFER = "100-100";

/**
 * Ein Muster, das wie ein QR-Code aussieht, sich aber nicht scannen lässt: ein ausgedrucktes Blatt
 * in der Halle darf nirgendwo hinführen, auch nicht zu einem Text. Die drei Suchmarken stehen wie
 * bei einem echten Code (Version 2, 25 × 25), alles andere ist Zufall mit festem Startwert, also
 * auch keine Format- und Fehlerkorrektur-Angaben, die ein Scanner auflösen könnte. Ob das hält,
 * prüft der Generator am fertigen Blatt.
 */
function scheinQr(): string {
  const n = 25;
  let zustand = 0x1a2b3c4d;
  const zufall = () => {
    zustand = (zustand * 1103515245 + 12345) >>> 0;
    return (zustand >>> 16) / 0x10000;
  };
  const marke = (x: number, y: number, ox: number, oy: number) => {
    const dx = x - ox;
    const dy = y - oy;
    if (dx < -1 || dy < -1 || dx > 7 || dy > 7) return undefined;
    if (dx === -1 || dy === -1 || dx === 7 || dy === 7) return false; // die helle Kante
    const rand = dx === 0 || dy === 0 || dx === 6 || dy === 6;
    const kern = dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4;
    return rand || kern;
  };
  const felder: string[] = [];
  for (let y = 0; y < n; y++) {
    for (let x = 0; x < n; x++) {
      const fest = marke(x, y, 0, 0) ?? marke(x, y, n - 7, 0) ?? marke(x, y, 0, n - 7);
      if (fest ?? zufall() < 0.5) felder.push(`M${x} ${y}h1v1h-1z`);
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${n} ${n}" shape-rendering="crispEdges"><path d="${felder.join("")}"/></svg>`;
}

/** Ein Feld, das hervorgehoben wird; mehrere Locatoren in einem Feld werden ein gemeinsamer Kasten. */
type Feld = Locator | Locator[];

/**
 * Ein Bild des ganzen Handy-Bildschirms. `felder` bleiben in voller Farbe, mit dunkler Kante und
 * leichtem Schatten; der Rest wird hell und blass. Ohne Felder: das Bild, wie es ist.
 * `mitte` wird vorher mittig gerollt (sonst das erste Feld).
 */
async function bild(page: Page, bilder: Map<string, Buffer>, name: string, felder: Feld[] = [], mitte?: Locator) {
  const ziel = mitte ?? [felder[0]].flat()[0];
  if (ziel) await ziel.evaluate((e) => e.scrollIntoView({ block: "center" }));
  // Rollen, Fokus und Übergänge brauchen ein paar Frames, sonst sitzt der Kasten daneben.
  await page.waitForTimeout(400);
  const kaesten = [];
  for (const feld of felder) {
    const teile = await Promise.all([feld].flat().map(async (l) => (await l.boundingBox())!));
    const links = Math.min(...teile.map((k) => k.x));
    const oben = Math.min(...teile.map((k) => k.y));
    kaesten.push({
      x: links,
      y: oben,
      w: Math.max(...teile.map((k) => k.x + k.width)) - links,
      h: Math.max(...teile.map((k) => k.y + k.height)) - oben,
    });
  }
  if (kaesten.length) {
    await page.evaluate((kaesten) => {
      const RAND = 4;
      const ns = "http://www.w3.org/2000/svg";
      const huelle = document.createElement("div");
      huelle.id = "anleitung-spotlight";
      huelle.style.cssText = "position:fixed;inset:0;z-index:2147483647;pointer-events:none;";
      const svg = document.createElementNS(ns, "svg");
      svg.setAttribute("width", "100%");
      svg.setAttribute("height", "100%");
      svg.style.cssText = "position:absolute;inset:0;";
      const maske = document.createElementNS(ns, "mask");
      maske.id = "anleitung-maske";
      const voll = document.createElementNS(ns, "rect");
      voll.setAttribute("width", "100%");
      voll.setAttribute("height", "100%");
      voll.setAttribute("fill", "#fff");
      maske.appendChild(voll);
      for (const k of kaesten) {
        const loch = document.createElementNS(ns, "rect");
        loch.setAttribute("x", String(k.x - RAND));
        loch.setAttribute("y", String(k.y - RAND));
        loch.setAttribute("width", String(k.w + 2 * RAND));
        loch.setAttribute("height", String(k.h + 2 * RAND));
        loch.setAttribute("rx", "10");
        loch.setAttribute("fill", "#000");
        maske.appendChild(loch);
      }
      svg.appendChild(maske);
      const schleier = document.createElementNS(ns, "rect");
      schleier.setAttribute("width", "100%");
      schleier.setAttribute("height", "100%");
      schleier.setAttribute("fill", "rgba(255,255,255,0.62)");
      schleier.setAttribute("mask", "url(#anleitung-maske)");
      svg.appendChild(schleier);
      huelle.appendChild(svg);
      for (const k of kaesten) {
        const kante = document.createElement("div");
        kante.style.cssText =
          `position:absolute;left:${k.x - RAND}px;top:${k.y - RAND}px;width:${k.w + 2 * RAND}px;height:${k.h + 2 * RAND}px;` +
          "border:2px solid #1a1a1a;border-radius:10px;box-shadow:0 2px 10px rgba(0,0,0,0.28);box-sizing:border-box;";
        huelle.appendChild(kante);
      }
      document.body.appendChild(huelle);
    }, kaesten);
  }
  bilder.set(name, await page.screenshot({ type: "jpeg", quality: 85 }));
  await page.evaluate(() => document.getElementById("anleitung-spotlight")?.remove());
}

test("Helfer-Anleitung des Lagerbuchs erzeugen", async ({ page }) => {
  const bilder = new Map<string, Buffer>();

  // Im Kopf steht der Name des Codes; „(Demo)" gehört nicht auf ein Blatt, das in der Halle hängt.
  const db = new Database(DB_PFAD);
  registerAuditFunctions(db);
  db.prepare("UPDATE tokens SET label = 'Helfer Bereitschaft' WHERE code = ?").run(CODE_HELFER);
  db.close();

  await page.goto(`/t/${CODE_HELFER}`);
  await page.waitForURL(/\/helfer$/);

  /* ── Blatt 1: Material entnehmen ─────────────────────────────────────── */
  const kompressen = page.getByRole("link", { name: /^Kompressen 10×10 cm, steril/ });
  await expect(kompressen).toBeVisible();
  await bild(page, bilder, "e2-artikel", [kompressen], page.getByRole("searchbox", { name: "Artikel suchen" }));

  await kompressen.click();
  await expect(page.getByRole("heading", { name: "Kompressen 10×10 cm, steril" })).toBeVisible();
  const zielWaehlen = page.getByRole("link", { name: "Ziel wählen" });
  await expect(page.getByRole("button", { name: "Entnahme buchen" })).toBeDisabled();
  await bild(page, bilder, "e3-ziel-waehlen", [zielWaehlen]);

  await zielWaehlen.click();
  await page.waitForURL(/\/helfer\/ziel/);
  const rtw = page.getByRole("radio", { name: /^RTW 1/ });
  await rtw.check();
  const uebernehmen = page.getByRole("button", { name: "Ziel übernehmen" });
  await bild(page, bilder, "e4-wohin", [uebernehmen], uebernehmen);

  await uebernehmen.click();
  await page.waitForURL(/\/a\/art-kompresse-10x10/);
  await expect(page.locator("[data-rolle='entnahme-ziel']")).toContainText("RTW 1");
  const plus = page.getByRole("button", { name: "Menge erhöhen" });
  await plus.click();
  await plus.click();
  await expect(page.getByRole("textbox", { name: "Menge" })).toHaveValue("3");
  const buchen = page.getByRole("button", { name: "Entnahme buchen" });
  await bild(page, bilder, "e5-menge", [plus, buchen], plus);

  await buchen.click();
  const ergebnis = page.locator("[data-rolle='entnahme-ergebnis']");
  await expect(ergebnis).toContainText("Entnahme gebucht");
  await bild(page, bilder, "e6-fertig", [ergebnis], plus);

  /* ── Blatt 2: Material zurückpacken ──────────────────────────────────── */
  const boxReiter = page.getByRole("navigation", { name: "Helfer-Bereiche" }).getByRole("link", { name: "Box" });
  await boxReiter.click();
  await page.waitForURL(/\/helfer\/box/);
  const rtwBox = page.getByRole("link", { name: /^RTW 1/ });
  await expect(rtwBox).toBeVisible();
  await bild(page, bilder, "b2-einheit", [rtwBox, boxReiter], rtwBox);

  await rtwBox.click();
  await expect(page.locator("[data-rolle='box-liste-titel']")).toBeVisible();
  const mullbinde = page.locator("[data-rolle='box-posten']").filter({ hasText: "Mullbinde 6 cm" });
  await mullbinde.locator("[data-rolle='box-posten-knopf']").click();
  const eingabe = mullbinde.locator("[data-rolle='box-eingabe']");
  await expect(eingabe).toBeVisible();
  await bild(page, bilder, "b3-artikel", [mullbinde.locator("[data-rolle='box-posten-knopf']")]);

  await eingabe.getByRole("button", { name: /erhöhen$/ }).click();
  const ablegen = mullbinde.locator("[data-rolle='box-buchen']");
  await bild(page, bilder, "b4-menge", [[eingabe, ablegen]], eingabe);

  await ablegen.click();
  const abgelegt = page.locator("[data-rolle='box-ergebnis']");
  await expect(abgelegt).toContainText("In die Entnahmebox gelegt: 2 × Mullbinde 6 cm");
  await bild(page, bilder, "b5-bestaetigung", [abgelegt]);

  /* ── Blatt 3: Fahrzeugcheck ──────────────────────────────────────────── */
  await page.goto("/helfer/check");
  await page.getByRole("link", { name: /^RTW 1/ }).click();
  await page.waitForURL(/\/helfer\/check\?fz=/);
  const kurz = page.locator("[data-rolle='check-art-kurz']");
  const voll = page.locator("[data-rolle='check-art-voll']");
  await bild(page, bilder, "c2-art", [[kurz, voll]]);

  await kurz.click();
  await page.waitForURL((u) => u.searchParams.get("art") === "kurz");
  const plombe = page.locator("[data-rolle='plombe']").first();
  const nummer = plombe.locator("[data-rolle='plombe-nummer']");
  await nummer.fill("4711-001");
  await bild(page, bilder, "c3-plomben", [[nummer, plombe.locator("[data-rolle='plombe-fehlt']")]], plombe);

  const weiter = page.locator("[data-rolle='weiter']");
  await weiter.click();
  const zeilen = page.locator("[data-rolle='zaehlzeile']");
  await expect(zeilen.first()).toBeVisible();
  // Kompressen fehlen, Mullbinden sind zu viele, der Rest ist einmal da: so hat der Nachfüll-Schritt
  // beides zu zeigen, aufs Fahrzeug und in die Box.
  const tippe = async (artikel: string, menge: string) => {
    const feld = page.getByRole("textbox", { name: new RegExp(`^${artikel}`) });
    await feld.click();
    await page.keyboard.type(menge);
    await expect(feld).toHaveValue(menge);
  };
  await tippe("Kompressen 10×10 cm, steril", "9");
  await tippe("Mullbinde 6 cm", "22");
  for (const zeile of (await zeilen.all()).slice(2)) {
    await zeile.getByRole("button", { name: /erhöhen$/ }).click();
  }
  await expect(weiter).toBeEnabled();
  await bild(page, bilder, "c4-zaehlen", [zeilen.first()]);

  const schritt = (name: string) => page.locator("[data-rolle='schritt']").filter({ hasText: name });
  await weiter.click();
  await expect(page.getByText("Aus dem Handlager aufs Fahrzeug legen")).toBeVisible();
  await bild(page, bilder, "c5-nachfuellen", [schritt("Nachfüllen"), page.getByRole("button", { name: /^geholt .* erhöhen$/ }).first()], schritt("Nachfüllen"));

  await weiter.click();
  await expect(page.getByText("Sind die Geräte da und in Ordnung?")).toBeVisible();
  const vorhanden = page.locator("[data-rolle='geraet-vorhanden']").first();
  await expect(vorhanden).toHaveAttribute("aria-pressed", "true");
  await bild(page, bilder, "c6-geraete", [[vorhanden, page.getByRole("button", { name: "In Ordnung" }).first()]], schritt("Geräte"));

  await weiter.click();
  await expect(page.getByText("Welchen Druck zeigt das Manometer?")).toBeVisible();
  const druck = page.getByRole("textbox", { name: /^Druck O₂/ }).first();
  const abschliessen = page.locator("[data-rolle='abschliessen']");
  await bild(page, bilder, "c7-sauerstoff", [druck, abschliessen], schritt("Sauerstoff"));

  await abschliessen.click();
  await expect(page.getByText("Kurzcheck abgeschlossen")).toBeVisible();
  await bild(page, bilder, "c8-zusammenfassung");


  /* ── Druck ───────────────────────────────────────────────────────────── */
  // Die Vorlage auf dem Ursprung der Suite, damit sie deren Schriften (`next/font`, Barlow) findet;
  // die `@font-face`-Regeln kommen aus der eben gefahrenen Seite.
  const schriften = await page.evaluate(() =>
    [...document.styleSheets]
      .flatMap((blatt) => [...blatt.cssRules].map((regel) => ({ regel, basis: blatt.href ?? location.href })))
      .filter(({ regel }) => regel instanceof CSSFontFaceRule && /^["']?Barlow/.test(regel.style.fontFamily))
      // Die Adressen stehen relativ zum Stylesheet; in der Vorlage gilt die Seitenadresse.
      .map(({ regel, basis }) => regel.cssText.replace(/url\("?([^")]+)"?\)/g, (_, u: string) => `url("${new URL(u, basis).href}")`))
      .join("\n"),
  );
  expect(schriften, "die Suite liefert keine Barlow mehr aus").toContain("Barlow Condensed");
  const blatt = await page.context().newPage();
  await blatt.goto("/");
  await blatt.setContent(
    readFileSync(VORLAGE, "utf8").replace(
      "<!-- --schriften -->",
      `<style>${schriften}\n:root { --schrift-text: "Barlow"; --schrift-titel: "Barlow Condensed"; }</style>`,
    ),
  );
  const qr = scheinQr();
  const quellen = Object.fromEntries([...bilder].map(([name, b]) => [name, `data:image/jpeg;base64,${b.toString("base64")}`]));
  const { fehlend, ungenutzt } = await blatt.evaluate(({ quellen, qr }) => {
    const offen: string[] = [];
    const genutzt = new Set<string>();
    document.querySelectorAll<HTMLImageElement>("img[data-bild]").forEach((img) => {
      const q = quellen[img.dataset.bild!];
      if (q) img.src = q;
      else offen.push(img.dataset.bild!);
      genutzt.add(img.dataset.bild!);
    });
    document.querySelectorAll<HTMLElement>("[data-qr]").forEach((feld) => (feld.innerHTML = qr));
    return { fehlend: offen, ungenutzt: Object.keys(quellen).filter((n) => !genutzt.has(n)) };
  }, { quellen, qr });
  // Lesbar wäre ein Fehler, und die Prüfung zählt nur, wenn sie einen echten Code an derselben
  // Stelle erkennt: erst die Gegenprobe, dann jedes Muster auf dem Blatt.
  const muster = blatt.locator("[data-qr]");
  const echt = await QRCode.toString(QR_PROBE, { type: "svg", margin: 0, errorCorrectionLevel: "M" });
  await muster.first().evaluate((feld, svg) => (feld.innerHTML = svg), echt);
  await expect(decodeQrPng(await muster.first().screenshot()), "Gegenprobe: ein echter Code wird gelesen").resolves.toBe(QR_PROBE);
  await muster.first().evaluate((feld, svg) => (feld.innerHTML = svg), qr);
  expect(await muster.count()).toBe(4);
  for (const feld of await muster.all()) {
    await expect(decodeQrPng(await feld.screenshot()), "ein Muster auf dem Blatt lässt sich scannen").rejects.toThrow();
  }
  expect(fehlend, "Bilder in der Vorlage ohne Aufnahme").toEqual([]);
  expect(ungenutzt, "Aufnahmen ohne Platz in der Vorlage").toEqual([]);
  await blatt.evaluate(async () => {
    for (const f of ["400 1em Barlow", "600 1em Barlow", "700 1em 'Barlow Condensed'"]) await document.fonts.load(f);
    await Promise.all([document.fonts.ready, ...[...document.images].map((i) => i.decode())]);
  });
  await blatt.pdf({ path: ZIEL, format: "A4", printBackground: true, preferCSSPageSize: true });
  const pdf = readFileSync(ZIEL).toString("latin1");
  expect(pdf.slice(0, 5)).toBe("%PDF-");
  expect(pdf.match(/\/Type\s*\/Page(?!s)/g), "drei Blätter: Entnahme, Zurückpacken, Fahrzeugcheck").toHaveLength(3);
});
