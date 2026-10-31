import { describe, expect, it } from "vitest";
import { VORGABE } from "./konfiguration";
import { countdownText, vorschau, type VorschauEingabe } from "./vorschau";

const basis: VorschauEingabe = {
  standortName: "Uelzen",
  regionName: "Landkreis Uelzen",
  warnschwelle: "Severe",
  module: { ...VORGABE.module, suchlage: true },
  suchlage: { ...VORGABE.suchlage },
  mitmachen: { ...VORGABE.mitmachen },
  verkehr: { ...VORGABE.verkehr },
  tomtom: false,
};

describe("Vorschau", () => {
  it("nennt die Zoomstufe der Karte, im Einsatz nicht", () => {
    expect(vorschau({ ...basis, kartenZoom: 11.5 }, "ruhe").sichtbar).toContainEqual(expect.stringMatching(/^Karte um Uelzen in Zoomstufe 11,5 /));
    expect(vorschau({ ...basis, kartenZoom: 11.5 }, "einsatz").sichtbar.join(" ")).not.toContain("Zoomstufe");
  });

  it("die Schwelle teilt Band und Liste wie im Monitor", () => {
    const v = vorschau(basis, "unwetter");
    expect(v.band.map((w) => w.id)).toEqual(["starkregen"]);
    expect(v.liste.map((w) => w.id)).toEqual(["sturm"]);
    expect(v.status).toEqual({ text: "1 WARNUNG · Unwetterwarnung", ton: "alarm" });

    const streng = vorschau({ ...basis, warnschwelle: "Extreme" }, "unwetter");
    expect(streng.band).toEqual([]);
    expect(streng.status.text).toBe("RUHE · 2 Warnungen unter Schwelle");

    const locker = vorschau({ ...basis, warnschwelle: "Minor" }, "ruhe");
    expect(locker.band.map((w) => w.id)).toEqual(["frost"]);
  });

  it("ohne Warnliste fehlen die Warnungen unter der Schwelle, ohne Wetter dann auch die Spalte", () => {
    const v = vorschau({ ...basis, module: { ...basis.module, warnliste: false, wetter: false } }, "unwetter");
    expect(v.liste).toEqual([]);
    expect(v.seitenspalte).toBe(false);
    expect(v.aus).toEqual(expect.arrayContaining(["Wetter", "Warnungen unter der Schwelle"]));
  });

  it("im Einsatz: Name in der Kopfzeile, Spuren, Gebiete und Drohnenbild", () => {
    const v = vorschau(basis, "einsatz");
    expect(v.status).toEqual({ text: "SUCHLAGE · Vermisste Person Oldenstadt", ton: "einsatz" });
    expect(v.karte).toMatchObject({ suchgebiete: true, flugspuren: true, drohne: true });
    expect(v.drohnenbild).toBe(true);
    expect(v.sichtbar.join(" ")).toContain("Flugspuren aller Flüge im Einsatz");
  });

  it("ausgeschaltete Teile des Einsatzes fehlen", () => {
    const v = vorschau({ ...basis, suchlage: { flugspuren: false, gebiete: true, drohnenbild: false } }, "einsatz");
    expect(v.karte.flugspuren).toBe(false);
    expect(v.drohnenbild).toBe(false);
    expect(v.aus).toEqual(expect.arrayContaining(["Flugspuren", "Drohnenbild"]));
  });

  it("ohne Suchlage sieht ein Einsatz aus wie ein ruhiger Tag", () => {
    const aus = { ...basis, module: { ...basis.module, suchlage: false } };
    const v = vorschau(aus, "einsatz");
    expect(v.status.ton).toBe("normal");
    expect(v.drohnenbild).toBe(false);
    expect(v.karte.drohne).toBe(false);
  });

  it("eine Warnung im Band geht dem Einsatz in der Kopfzeile vor", () => {
    const v = vorschau({ ...basis, warnschwelle: "Minor" }, "einsatz");
    expect(v.status.ton).toBe("alarm");
    expect(v.drohnenbild).toBe(true);
  });
});

describe("Meldungsband in der Vorschau", () => {
  it("steht nach dem Warnband in der Erklärung, mit Countdown", () => {
    const b = vorschau(basis, "ruhe", [{ text: "Nächste Lagebesprechung", countdown: "in 42 min" }, { text: "Funkkanal 34", countdown: null, entwurf: true }]);
    expect(b.meldungen).toHaveLength(2);
    expect(b.sichtbar).toContain("Meldungsband Meldung: „Nächste Lagebesprechung“, in 42 min.");
    expect(b.sichtbar).toContain("Meldungsband Meldung (noch nicht angelegt): „Funkkanal 34“.");
  });

  it("nennt die Kategorie und ob die Meldung blinkt", () => {
    const kategorie = { name: "Besprechung", zeichen: "meeting", farbe: "violett" } as const;
    const b = vorschau(basis, "ruhe", [{ text: "Lage im FüKw", countdown: "in 4 min", kategorie, faellig: true }]);
    expect(b.sichtbar).toContain("Meldungsband Besprechung: „Lage im FüKw“, in 4 min, blinkt.");
  });

  it("zählt in Minuten und Stunden, auf die volle Minute aufgerundet", () => {
    const t = Date.parse("2026-10-27T13:00:00Z");
    expect(countdownText(t + 42 * 60_000, t)).toBe("in 42 min");
    expect(countdownText(t + 30_000, t)).toBe("in 1 min");
    expect(countdownText(t + 65 * 60_000, t)).toBe("in 1 h 5 min");
    expect(countdownText(t + 120 * 60_000, t)).toBe("in 2 h");
    expect(countdownText(t - 20_000, t)).toBe("jetzt");
    expect(countdownText(t - 3 * 60_000, t)).toBe("seit 3 min");
  });
});

describe("QR-Code fürs Ehrenamt in der Vorschau", () => {
  const an = { ...basis, mitmachen: { an: true, adresse: "https://drk-uelzen.de/mitmachen", text: "Lust mitzuhelfen?" } };
  it("ist aus, bis jemand ihn einschaltet", () => {
    expect(vorschau(basis, "ruhe").mitmachen).toBeNull();
    expect(vorschau(basis, "ruhe").aus).toContain("QR-Code fürs Ehrenamt");
  });
  it("steht nur in ruhiger Lage, nicht bei Band oder Einsatz", () => {
    expect(vorschau(an, "ruhe").mitmachen).toEqual({ adresse: "https://drk-uelzen.de/mitmachen", text: "Lust mitzuhelfen?" });
    expect(vorschau(an, "ruhe").sichtbar).toContain("QR-Code unten rechts auf der Karte: „Lust mitzuhelfen?“ führt zu https://drk-uelzen.de/mitmachen.");
    expect(vorschau(an, "unwetter").mitmachen).toBeNull();
    expect(vorschau(an, "einsatz").mitmachen).toBeNull();
    expect(vorschau({ ...an, module: { ...an.module, suchlage: false } }, "einsatz").mitmachen).not.toBeNull();
  });

  it("Verkehr: Fluss und Baustellen nur mit TomTom-Schlüssel, Blitzer nur online", () => {
    const an = { fluss: true, baustellen: true, blitzer: true };
    const ohne = vorschau({ ...basis, verkehr: an }, "ruhe");
    expect(ohne.karte).toMatchObject({ verkehr: false, baustellen: false, blitzer: true });
    expect(ohne.sichtbar.join(" ")).toContain("ohne Schlüssel");
    const mit = vorschau({ ...basis, verkehr: an, tomtom: true }, "ruhe");
    expect(mit.karte).toMatchObject({ verkehr: true, baustellen: true });
    expect(mit.sichtbar.join(" ")).toMatch(/Verkehrsfluss.*Baustellen und Sperrungen/);
    expect(mit.sichtbar.join(" ")).toContain("nur am Online-Monitor");
    expect(vorschau(basis, "ruhe").aus).toEqual(expect.arrayContaining(["Verkehrsfluss", "Baustellen", "Blitzer"]));
  });
});
