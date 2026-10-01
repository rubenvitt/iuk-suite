import { describe, expect, it } from "vitest";
import { BEISPIELE } from "../beispiele";
import { ABSTAND, EINHEIT } from "./masse";
import { teileAuf } from "./papier";
import type { KarteL, Zeichnungsdaten } from "./typen";
import { zeichne } from "./zeichne";

const plan = (id: string) => BEISPIELE.find((b) => b.id === id)!.inhalt;
const k = (z: Zeichnungsdaten, id: string) => z.karten.find((x) => x.id === id)!;
const mitte = (x: KarteL) => x.x + x.breite / 2;

describe("Einsatz 22.02.2026 wie in der Vorlage", () => {
  const z = zeichne(plan("beispiel-einsatz-2026-02-22"), "a4-quer");
  it("Leitstelle über EL, beide auf einer senkrechten Achse; EL mittig über ihren Abschnitten", () => {
    expect(k(z, "lts").y).toBeLessThan(k(z, "el").y);
    expect(mitte(k(z, "lts"))).toBeCloseTo(mitte(k(z, "el")), 6);
    const sp = z.spannen.find((s) => s.stelleId === "el")!;
    expect(mitte(k(z, "el"))).toBeCloseTo((sp.links + sp.rechts) / 2, 6);
  });
  it("R_UE_2 und R_UE_3 sind getrennte Busse mit eigenem Sechseck; EA 5 steht rechts daneben", () => {
    const hex = (netz: string) => z.sechsecke.find((s) => s.netz === netz)!;
    expect(hex("el>r-ue-2").beschriftung.text).toBe("R_UE_2");
    expect(hex("el>r-ue-3").beschriftung.text).toBe("R_UE_3");
    expect(hex("el>r-ue-3").x).toBeGreaterThan(hex("el>r-ue-2").x);
    expect(k(z, "ea5").x).toBeGreaterThanOrEqual(k(z, "ea3").x + k(z, "ea3").breite + ABSTAND.gruppen - 1e-6);
  });
  it("EA 5: neun Fahrzeuge als eine Spalte", () => {
    const e = z.einheiten.filter((x) => x.stelleId === "ea5");
    expect(e).toHaveLength(9);
    expect(new Set(e.map((x) => x.x)).size).toBe(1);
    for (let i = 1; i < e.length; i++) expect(e[i].y - e[i - 1].y).toBeCloseTo(EINHEIT.takt, 6);
  });
  it("Reserve K_UE_2 steht in der Legende", () => {
    expect(z.legende).toContainEqual({ art: "tmo", text: "Reserve K_UE_2", reserve: true });
  });
});

describe("OpenR 01.07.2022 wie in der Vorlage", () => {
  const z = zeichne(plan("beispiel-openr-2022-07-01"), "a4-quer");
  it("EL steht links neben FüKW auf Kopfhöhe, verbunden über BOS_NI_RES_09", () => {
    const el = k(z, "el"), fk = k(z, "fuekw");
    expect(el.x + el.breite).toBeLessThan(fk.x);
    const linie = z.linien.find((l) => l.netz === "fuekw<links" && l.y1 === l.y2)!;
    expect(linie.y1).toBeGreaterThan(fk.y);
    expect(linie.y1).toBeLessThan(fk.y + fk.kopfHoehe);
    expect(linie.y1).toBeLessThan(el.y + el.kopfHoehe);
    expect(z.sechsecke.find((s) => s.netz === "fuekw<links")?.beschriftung.text).toBe("BOS_NI_RES_09");
    expect(z.einheiten.find((e) => e.stelleId === "el")?.zeilen.map((x) => x.text)).toEqual(["KdoW 40-10-1"]);
    // Die Excel-Vorlage zeigt die Rufnummer ganz (Review Phase 1: früher „GW Betreuung RK LG 45-7…")
    expect(z.einheiten.find((e) => e.voll === "GW Betreuung RK LG 45-74-10")?.zeilen.map((x) => x.text)).toEqual(["GW Betreuung", "RK LG 45-74-10"]);
  });
  it("drei Gruppen unter FüKW, jede mit eigenem Stiel ab der Kartenunterkante", () => {
    const fk = k(z, "fuekw");
    for (const netz of ["fuekw>bos-res-09", "fuekw>r-ue-2", "fuekw>r-ue-3"]) {
      expect(z.linien.some((l) => l.netz === netz && l.x1 === l.x2 && Math.abs(l.y1 - (fk.y + fk.hoehe)) < 1e-6), netz).toBe(true);
    }
  });
  it("die Kanäle der Abschnitte hängen als Sechsecke unter ihnen; Reserve ist nur der lose Kanal", () => {
    const kanaele = (id: string) => z.sechsecke.filter((s) => s.netz === `${id}#kanal`).map((s) => s.beschriftung.text);
    expect(kanaele("ea1")).toEqual(["DMO 608", "R_UE_2"]);
    expect(kanaele("ea2")).toEqual(["DMO 609", "R_UE_2"]);
    expect(kanaele("ea3")).toEqual(["R_UE_2"]);
    expect(kanaele("ea4")).toEqual(["R_UE_2"]);
    const ea1 = k(z, "ea1");
    for (const s of z.sechsecke.filter((x) => x.netz === "ea1#kanal")) {
      expect(s.y).toBeGreaterThan(ea1.y + ea1.hoehe);
      expect(s.y).toBeLessThan(Math.min(...z.einheiten.filter((e) => e.stelleId === "ea1").map((e) => e.y)));
    }
    expect(z.legende.filter((e) => e.reserve).map((e) => e.text)).toEqual(["Reserve UE_K_1"]);
    expect(z.legende.some((e) => e.text === "Digitalfunk DMO" && !e.reserve)).toBe(true);
  });
});

describe("Label und Fernmeldeskizze", () => {
  it("Label: drei EAL oben bündig, Bereitstellungsraum hervorgehoben", () => {
    const z = zeichne(plan("vorlage-kommunikationsplan-label"), "a4-quer");
    expect(new Set(["patientenablage", "transport", "bereitstellungsraum"].map((id) => k(z, id).y)).size).toBe(1);
    expect(k(z, "bereitstellungsraum").hervorheben).toBe(true);
  });
  it("Fernmeldeskizze: KatSL links in Leitungsform, Leitstelle rechts in Funkform", () => {
    const z = zeichne(plan("vorlage-fernmeldeskizze-stab"), "a4-quer");
    expect(k(z, "katsl").x).toBeLessThan(k(z, "stab").x);
    expect(k(z, "lts").x).toBeGreaterThan(k(z, "stab").x + k(z, "stab").breite);
    expect(z.sechsecke.find((s) => s.netz === "stab<links")?.form).toBe("leitung");
    expect(z.sechsecke.find((s) => s.netz === "stab<rechts")?.form).toBe("funk");
  });
});

describe("Große Stab-Lage", () => {
  it("Blatt 1 mit Verweiskarten, Folgeblätter mit Anker; der größte Abschnitt bricht als Kamm um", () => {
    const b = teileAuf(plan("beispiel-grosse-stabslage"), "a4-quer");
    expect(b[0].zeichnung.karten.some((x) => x.art === "verweis")).toBe(true);
    for (const blatt of b.slice(1)) expect(blatt.zeichnung.karten[0].art).toBe("anker");
    const mitEal4 = b.find((blatt) => blatt.zeichnung.karten.some((x) => x.id === "ea-4-1" && x.art === "normal"))!;
    const ys = new Set(mitEal4.zeichnung.karten.filter((x) => x.id.startsWith("ea-4-")).map((x) => x.y));
    expect(ys.size).toBeGreaterThanOrEqual(2);
  });
});
