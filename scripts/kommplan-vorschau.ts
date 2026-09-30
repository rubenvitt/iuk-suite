/**
 * Rendert die Beispielpläne (und auf Wunsch einen Zufallsplan) als SVG und PNG, damit man die
 * Layout-Engine ANSIEHT, bevor Golden-Dateien eingefroren werden.
 *
 * Lauf: pnpm exec tsx scripts/kommplan-vorschau.ts [zielordner] [--zufall <seed> <stellen>]
 * Ausgabe (Vorgabe .data/kommplan-vorschau/, nicht eingecheckt):
 *   <id>-bildschirm.svg|png · <id>-a4-<n>.svg|png · bericht.txt (Maßstab je Blatt, Befunde)
 *
 * Die Schrift steckt als data:-URI in jeder SVG-Datei: ein Rasterer ohne Arimo würde sonst mit
 * einer Ersatzschrift andere Breiten zeichnen, als die Engine gemessen hat. Gerastert wird mit
 * Chromium aus @playwright/test, nicht mit sharp/librsvg (die Arimo nicht zuverlässig finden).
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { chromium } from "@playwright/test";
import { BEISPIELE, type Beispiel } from "../src/app/m/kommplan/_lib/beispiele";
import { layout } from "../src/app/m/kommplan/_lib/layout/layout";
import { pruefeMitte, pruefeVerbindungen, pruefeZeichnung } from "../src/app/m/kommplan/_lib/layout/pruefung";
import { zufallsPlan } from "../src/app/m/kommplan/_lib/layout/zufall";
import { rahmenFuer } from "../src/app/m/kommplan/_lib/rahmen";
import { symboleFuer } from "../src/app/m/kommplan/_lib/zeichen/zeichen";
import { Blattansicht } from "../src/app/m/kommplan/_ui/zeichnung/Blatt";
import { Zeichnung } from "../src/app/m/kommplan/_ui/zeichnung/Zeichnung";

const args = process.argv.slice(2);
// --zufall <seed> <stellen> [stab]: ein roter Seed aus eigenschaften.test.ts zum Ansehen.
const zufallIndex = args.indexOf("--zufall");
const ZIEL = args[0] && !args[0].startsWith("--") ? args[0] : ".data/kommplan-vorschau";
const schrift = readFileSync("src/app/m/kommplan/_fonts/Arimo-Variable.ttf").toString("base64");
const STIL = `@font-face{font-family:"Arimo";src:url(data:font/ttf;base64,${schrift}) format("truetype");font-weight:400 700}`;

const beispiele: Beispiel[] = [...BEISPIELE];
if (zufallIndex >= 0) {
  const seed = Number(args[zufallIndex + 1]), stellen = Number(args[zufallIndex + 2] ?? 25);
  const form = args[zufallIndex + 3] === "stab" ? "stab" : "frei";
  beispiele.push({ id: `zufall-${form}-${seed}`, titel: `Zufallsplan ${seed} (${form})`, typ: "kommunikationsplan", anlass: null, datum: null,
    istVorlage: false, stand: "2026-01-01T00:00:00.000Z", bearbeiter: "Vorschau", inhalt: zufallsPlan(seed, { stellen, form }) });
}

mkdirSync(ZIEL, { recursive: true });
const bericht: string[] = [];
const dateien: string[] = [];
for (const b of beispiele) {
  const symbole = symboleFuer(b.inhalt);
  const l = layout(b.inhalt, "a4-quer");
  const befunde = [...pruefeZeichnung(l), ...pruefeMitte(l), ...pruefeVerbindungen(l, b.inhalt)];
  bericht.push(`${b.id}: ${l.karten.length} Karten, ${l.breite.toFixed(1)} × ${l.hoehe.toFixed(1)} mm, ${befunde.length} Befunde`);
  for (const f of befunde) bericht.push(`  ! ${f.text}`);
  const bildschirm = renderToStaticMarkup(createElement(Zeichnung, { daten: layout(b.inhalt, "bildschirm"), symbole, titel: b.titel, schrift: "Arimo", kopfStil: STIL }));
  writeFileSync(join(ZIEL, `${b.id}-bildschirm.svg`), bildschirm);
  dateien.push(`${b.id}-bildschirm`);
  const rahmen = rahmenFuer({ titel: b.titel, anlass: b.anlass, datum: b.datum ? Date.parse(`${b.datum}T00:00:00Z`) : null,
    aktualisiertAm: Date.parse(b.stand), aktualisiertVon: b.bearbeiter, vermerkVsNfD: b.inhalt.optionen.vermerkVsNfD });
  for (const blatt of l.seiten) {
    bericht.push(`  Blatt ${blatt.nummer}/${blatt.von}: Maßstab ${blatt.massstab.toFixed(3)}${blatt.unterMindestschrift ? " (unter 6 pt!)" : ""}`);
    const blattBefunde = [...pruefeZeichnung(blatt.zeichnung), ...pruefeMitte(blatt.zeichnung), ...pruefeVerbindungen(blatt.zeichnung, b.inhalt)];
    for (const f of blattBefunde) bericht.push(`    ! ${f.text}`);
    const svg = renderToStaticMarkup(createElement(Blattansicht, { blatt, rahmen, symbole, schrift: "Arimo", kopfStil: STIL }));
    writeFileSync(join(ZIEL, `${b.id}-a4-${blatt.nummer}.svg`), svg);
    dateien.push(`${b.id}-a4-${blatt.nummer}`);
  }
}
writeFileSync(join(ZIEL, "bericht.txt"), `${bericht.join("\n")}\n`);
console.log(bericht.join("\n"));

/** Kein Top-Level-await: das Root-Paket ist kein ESM-Paket, tsx lädt .ts-Skripte hier als CommonJS. */
async function rastere(): Promise<void> {
  try {
    const browser = await chromium.launch({ args: ["--proxy-server=direct://"] });
    const page = await browser.newPage({ deviceScaleFactor: 1754 / 1123 });
    for (const name of dateien) {
      const svg = readFileSync(join(ZIEL, `${name}.svg`), "utf8");
      await page.setContent(`<!doctype html><html><body style="margin:0;background:#fff">${svg}</body></html>`, { waitUntil: "load" });
      await page.evaluate(() => document.fonts.ready.then(() => true));
      await page.locator("svg").first().screenshot({ path: join(ZIEL, `${name}.png`) });
    }
    await browser.close();
    console.log(`PNG: ${dateien.length} Dateien in ${ZIEL}`);
  } catch (fehler) {
    console.warn(`PNG übersprungen (${(fehler as Error).message.split("\n")[0]}) — die SVG-Dateien lassen sich im Browser öffnen.`);
  }
}
void rastere();
