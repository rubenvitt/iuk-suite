import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { teileAuf } from "./papier";
import { zeichne } from "./zeichne";

/** Auf 0,01 mm gerundet: Fließkomma-Rauschen ist kein Befund, eine verschobene Karte schon. */
const runde = (wert: unknown): unknown =>
  JSON.parse(JSON.stringify(wert, (_, v) => (typeof v === "number" ? Math.round(v * 100) / 100 : v)));

describe("Golden: Koordinaten der Beispielpläne", () => {
  it.each(BEISPIELE.map((b) => [b.id, b] as const))("%s", async (id, b) => {
    const z = zeichne(b.inhalt, "bildschirm");
    const kompakt = {
      breite: z.breite, hoehe: z.hoehe,
      karten: z.karten.map((k) => [k.id, k.art, k.x, k.y, k.breite, k.hoehe]),
      einheiten: z.einheiten.map((e) => [e.id, e.x, e.y]),
      sechsecke: z.sechsecke.map((s) => [s.netz, s.x, s.y, s.breite]),
      linien: z.linien.map((l) => [l.netz, l.x1, l.y1, l.x2, l.y2, l.duenn]),
      a4: teileAuf(b.inhalt, "a4-quer").map((bl) => ({
        nummer: bl.nummer, massstab: bl.massstab, ursprung: bl.ursprung,
        karten: bl.zeichnung.karten.map((k) => [k.id, k.art, k.x, k.y]),
      })),
    };
    await expect(`${JSON.stringify(runde(kompakt), null, 1)}\n`).toMatchFileSnapshot(`__golden__/${id}.json`);
  });
});
