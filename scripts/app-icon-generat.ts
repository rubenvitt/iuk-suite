/**
 * Erzeugt die PNG-Fassungen des App-Icons (`src/core/favicon/app-icon.ts`).
 *
 * WARUM EINGECHECKT: die Suite rastert zur Laufzeit nicht — `sharp` ist nur
 * devDependency und steht nicht im Container. Jede PNG trägt die Prüfsumme des
 * SVG, aus dem sie entstand; `app-icon.test.ts` vergleicht sie mit dem
 * heutigen SVG und meldet so ein geändertes Zeichen ohne Neuerzeugung.
 *
 * Lauf: pnpm exec tsx scripts/app-icon-generat.ts
 */
import { writeFileSync } from "node:fs";
import sharp from "sharp";
import { appIconSvg, rasterDateien } from "../src/core/favicon/app-icon";
import { pruefsumme } from "../src/core/favicon";

const ZIEL = "src/core/favicon/app-icon.generiert.json";

async function erzeuge(): Promise<void> {
  const generat: Record<string, { quelle: string; png: string }> = {};
  for (const { datei, name, zuschnitt, kante } of rasterDateien()) {
    const svg = appIconSvg(name, zuschnitt);
    // Gleich in Zielgröße rastern statt 512 zu verkleinern: schärfere Kanten.
    const png = await sharp(Buffer.from(svg), { density: (72 * kante) / 512 })
      .resize(kante, kante)
      .png({ compressionLevel: 9, palette: true })
      .toBuffer();
    generat[datei] = { quelle: pruefsumme(svg), png: png.toString("base64") };
  }
  writeFileSync(ZIEL, JSON.stringify(generat, null, 2) + "\n");
  console.log(`${Object.keys(generat).length} PNGs nach ${ZIEL}`);
}

void erzeuge();
