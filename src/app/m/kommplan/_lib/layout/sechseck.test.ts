import { describe, expect, it } from "vitest";
import { PIKTOGRAMME } from "../zeichen/grundlagen";
import { SCHRIFT, SECHSECK } from "./masse";
import { sechseckForm, sechseckMass } from "./sechseck";
import { textBreite } from "./text";

describe("Sechseck", () => {
  it("Breite zwischen 26 und 44 mm, wächst mit der Beschriftung", () => {
    const kurz = sechseckMass({ id: "v", art: "tmo", bezeichnung: "R_UE_2" });
    const lang = sechseckMass({ id: "v", art: "tmo", bezeichnung: "BOS_NI_RES_09" });
    expect(kurz.breite).toBeGreaterThanOrEqual(SECHSECK.minBreite);
    expect(lang.breite).toBeGreaterThan(kurz.breite);
    expect(lang.breite).toBeLessThanOrEqual(SECHSECK.maxBreite);
  });
  it("eine überlange Bezeichnung wird mit … gekürzt und passt hinein", () => {
    const s = sechseckMass({ id: "v", art: "dmo", bezeichnung: "Stabsfunk Kreisverwaltung Uelzen Ausweichkanal" });
    expect(s.breite).toBe(SECHSECK.maxBreite);
    expect(s.beschriftung.text.endsWith("…")).toBe(true);
    expect(textBreite(s.beschriftung.text, SCHRIFT.sechseck, true)).toBeLessThan(SECHSECK.maxBreite - 16 + 1e-9);
    expect(s.voll).toBe("Stabsfunk Kreisverwaltung Uelzen Ausweichkanal");
  });
  it("Form je Art: Funk, Leitung, Mobil", () => {
    expect(["tmo", "dmo", "analogfunk"].map((a) => sechseckForm(a as never))).toEqual(["funk", "funk", "funk"]);
    expect(["draht", "telefon", "fax", "daten"].map((a) => sechseckForm(a as never))).toEqual(["leitung", "leitung", "leitung", "leitung"]);
    expect(sechseckForm("mobil")).toBe("mobil");
  });
  it("ein Piktogramm mit Schrift (TMO, DMO, Fax, C) steht auf der Grundlinie der Beschriftung; eines ohne mittig", () => {
    for (const art of ["tmo", "dmo", "fax", "telefon"] as const) {
      const s = sechseckMass({ id: "v", art, bezeichnung: "R_UE_1" });
      const q = PIKTOGRAMME[s.piktogramm];
      const [, vy, vw, vh] = q.viewBox.split(/\s+/).map(Number);
      const f = Math.min(s.pikto.breite / vw, s.pikto.hoehe / vh);
      const textY = Number(/<text\b[^>]*\by="([\d.]+)"/.exec(q.inhalt)![1]);
      // preserveAspectRatio xMidYMid meet: der Inhalt steht senkrecht mittig im Platz
      const grundlinie = s.pikto.y + (s.pikto.hoehe - vh * f) / 2 + (textY - vy) * f;
      // Fax: die Zickzacklinie unter „Fax" stieße unten an den Rand; dort hält der Rand (0,04 mm).
      expect(Math.abs(grundlinie - s.beschriftung.y), art).toBeLessThan(art === "fax" ? 0.05 : 1e-6);
      // und bleibt im Sechseck
      expect(s.pikto.y + (s.pikto.hoehe - vh * f) / 2).toBeGreaterThanOrEqual(0);
      expect(s.pikto.y + (s.pikto.hoehe + vh * f) / 2).toBeLessThanOrEqual(SECHSECK.hoehe);
    }
    const draht = sechseckMass({ id: "v", art: "draht", bezeichnung: "Standleitung" });
    expect(draht.pikto).toEqual({ x: SECHSECK.spitze, y: (SECHSECK.hoehe - SECHSECK.piktoHoehe) / 2, breite: SECHSECK.piktoBreite, hoehe: SECHSECK.piktoHoehe });
  });
  it("trägt das Piktogramm seiner Art", () => {
    expect(sechseckMass({ id: "v", art: "draht", bezeichnung: "" }).piktogramm).toBe("comms.cable-construction");
  });
});
