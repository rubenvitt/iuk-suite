import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../../_lib/beispiele";
import { baueBaum } from "../../_lib/plan/baum";
import type { PlanInhalt } from "../../_lib/plan/schema";
import { KARTE } from "../../_lib/layout/masse";
import { textBreite } from "../../_lib/layout/text";
import type { TextZeile, Zeichnungsdaten } from "../../_lib/layout/typen";
import { zeichne } from "../../_lib/layout/zeichne";
import { mulberry32, zufallsPlan } from "../../_lib/layout/zufall";
import { METRIK } from "../../_lib/zeichen/grundlagen";
import { STRICH } from "../zeichnung/farben";
import { umschalterLage } from "./umschalter";

interface Rechteck { name: string; x: number; y: number; b: number; h: number }
const PT = 25.4 / 72;
function textKasten(name: string, ox: number, oy: number, t: TextZeile): Rechteck {
  const w = textBreite(t.text, t.groesse, t.fett);
  const g = t.groesse * PT;
  const links = t.anker === "start" ? t.x : t.anker === "mitte" ? t.x - w / 2 : t.x - w;
  const auf = (METRIK.aufstieg / METRIK.einheitenProEm) * g, ab = (METRIK.abstieg / METRIK.einheitenProEm) * g;
  return { name: `${name} „${t.text}"`, x: ox + links, y: oy + t.y - auf, b: w, h: auf + ab };
}
const abstandZuRechteck = (cx: number, cy: number, r: Rechteck) =>
  Math.hypot(Math.max(r.x - cx, 0, cx - (r.x + r.b)), Math.max(r.y - cy, 0, cy - (r.y + r.h)));
function abstandZuStrecke(cx: number, cy: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1, dy = y2 - y1, l2 = dx * dx + dy * dy;
  const t = l2 === 0 ? 0 : Math.max(0, Math.min(1, ((cx - x1) * dx + (cy - y1) * dy) / l2));
  return Math.hypot(cx - (x1 + t * dx), cy - (y1 + t * dy));
}

/** Was der Kreis einer Karte berührt — alles außer dem Rahmen der eigenen Karte, auf dem er sitzt. */
function beruehrt(z: Zeichnungsdaten): string[] {
  const funde: string[] = [];
  const hindernisse: Rechteck[] = [];
  for (const k of z.karten) {
    hindernisse.push(...[...k.titel, ...(k.leiter ? [k.leiter] : []), ...k.kontakte.flatMap((x) => x.zeilen)].map((t) => textKasten(`Karte ${k.id}`, k.x, k.y, t)));
    for (const x of k.kontakte) {
      hindernisse.push({ name: `Piktogramm ${k.id}/${x.art}`, x: k.x + (KARTE.piktoSpalte - KARTE.piktoGroesse) / 2, y: k.y + x.y + (x.hoehe - KARTE.piktoGroesse) / 2, b: KARTE.piktoGroesse, h: KARTE.piktoGroesse });
    }
    if (k.zeichen) hindernisse.push({ name: `Zeichen ${k.id}`, x: k.x + KARTE.rand, y: k.y + KARTE.rand, b: KARTE.zeichen, h: KARTE.zeichen });
  }
  hindernisse.push(...z.einheiten.map((e) => ({ name: `Einheit ${e.id}`, x: e.x, y: e.y, b: e.breite, h: e.hoehe })));
  hindernisse.push(...z.abzeichen.map((a) => ({ name: `Abzeichen ${a.stelleId}`, x: a.x, y: a.y, b: a.breite, h: a.hoehe })));
  hindernisse.push(...z.sechsecke.map((s) => ({ name: `Sechseck ${s.netz}`, x: s.x, y: s.y, b: s.breite, h: s.hoehe })));
  for (const k of z.karten.filter((x) => x.einklappbar)) {
    const u = umschalterLage(k);
    const cx = k.x + u.cx, cy = k.y + u.cy;
    for (const h of hindernisse) if (abstandZuRechteck(cx, cy, h) < u.r) funde.push(`${k.id}: ${h.name}`);
    for (const a of z.karten) if (a.id !== k.id && abstandZuRechteck(cx, cy, { name: "", x: a.x, y: a.y, b: a.breite, h: a.hoehe }) < u.r) funde.push(`${k.id}: Karte ${a.id}`);
    for (const l of z.linien) if (abstandZuStrecke(cx, cy, l.x1, l.y1, l.x2, l.y2) < u.r + STRICH.linie / 2) funde.push(`${k.id}: Linie ${l.netz}`);
  }
  return funde;
}

function eingeklapptHalb(inhalt: PlanInhalt, seed: number): Set<string> {
  const baum = baueBaum(inhalt);
  const r = mulberry32(seed);
  return new Set(inhalt.stellen.filter((s) => baum.unter(s.id).length > 0 && r() < 0.5).map((s) => s.id));
}

describe("Einklapp-Umschalter", () => {
  it.each(BEISPIELE.map((b) => [b.id, b] as const))("%s: der Kreis berührt weder Text noch Kasten noch Linie, auf- und eingeklappt", (_, b) => {
    const baum = baueBaum(b.inhalt);
    const alle = new Set(b.inhalt.stellen.filter((s) => baum.unter(s.id).length > 0).map((s) => s.id));
    expect(beruehrt(zeichne(b.inhalt, "bildschirm"))).toEqual([]);
    expect(beruehrt(zeichne(b.inhalt, "bildschirm", { eingeklappt: alle }))).toEqual([]);
    for (const id of alle) expect(beruehrt(zeichne(b.inhalt, "bildschirm", { eingeklappt: new Set([id]) })), id).toEqual([]);
  });
  it.each(Array.from({ length: 60 }, (_, i) => i + 1))("Zufallsplan %i: frei und stab-förmig, halb eingeklappt", (seed) => {
    for (const inhalt of [zufallsPlan(seed, { stellen: 5 + (seed % 36) }), zufallsPlan(seed, { stellen: 60, form: "stab" })]) {
      expect(beruehrt(zeichne(inhalt, "bildschirm"))).toEqual([]);
      expect(beruehrt(zeichne(inhalt, "bildschirm", { eingeklappt: eingeklapptHalb(inhalt, seed) }))).toEqual([]);
    }
  });
  it("die frühere Lage mitten auf der Unterkante würde die letzte Kontaktzeile treffen (Gegenprobe)", () => {
    const openr = BEISPIELE.find((b) => b.id === "beispiel-openr-2022-07-01")!;
    const z = zeichne(openr.inhalt, "bildschirm");
    const lts = z.karten.find((k) => k.id === "lts")!;
    const letzte = lts.kontakte.at(-1)!.zeilen.at(-1)!;
    const kasten = textKasten("lts", lts.x, lts.y, letzte);
    expect(abstandZuRechteck(lts.x + lts.breite / 2, lts.y + lts.hoehe, kasten)).toBeLessThan(2.2);
  });
});
