import { describe, expect, it } from "vitest";
import { fefo, istKalendertag, mengeText, mhdStatus, plusTage, restText, runde, tageBis, vorschlag } from "./mhd";

const A = { rotTage: 7, gelbTage: 30, mhdArt: "mhd" as const };
const V = { ...A, mhdArt: "verbrauch" as const };

describe("MHD tagesgenau", () => {
  it("rechnet Kalendertage über Monats- und Jahresgrenzen", () => {
    expect(tageBis("2026-11-04", "2026-11-04")).toBe(0);
    expect(tageBis("2027-01-01", "2026-12-31")).toBe(1);
    expect(tageBis("2026-03-29", "2026-03-28")).toBe(1); // Zeitumstellung zählt nicht
    expect(plusTage("2026-02-27", 2)).toBe("2026-03-01");
  });

  it("erkennt nur echte Kalendertage", () => {
    expect(istKalendertag("2026-02-28")).toBe(true);
    expect(istKalendertag("2026-02-30")).toBe(false);
    expect(istKalendertag("2026-2-3")).toBe(false);
  });

  it("setzt die Ampel nach den Schwellen des Artikels", () => {
    expect(mhdStatus("2026-12-31", A, "2026-11-04").ampel).toBe("ok");
    expect(mhdStatus("2026-11-30", A, "2026-11-04").ampel).toBe("gelb");
    expect(mhdStatus("2026-11-11", A, "2026-11-04").ampel).toBe("rot");
    expect(mhdStatus("2026-11-04", A, "2026-11-04")).toMatchObject({ ampel: "rot", abgelaufen: false, gesperrt: false });
    expect(mhdStatus("2026-11-03", A, "2026-11-04")).toMatchObject({ ampel: "rot", abgelaufen: true, gesperrt: false });
  });

  it("sperrt nur das überschrittene Verbrauchsdatum", () => {
    expect(mhdStatus("2026-11-03", V, "2026-11-04").gesperrt).toBe(true);
    expect(mhdStatus("2026-11-04", V, "2026-11-04").gesperrt).toBe(false);
  });
});

describe("FEFO", () => {
  const c = (id: string, mhd: string, eingang: string, tage: number, gesperrt = false) => ({
    id, mhd, eingang, status: { ampel: "ok" as const, tage, abgelaufen: tage < 0, gesperrt },
  });

  it("sortiert nach MHD, bei Gleichstand nach Eingang", () => {
    expect(fefo([c("b", "2026-12-01", "2026-10-02", 27), c("a", "2026-12-01", "2026-10-01", 27), c("x", "2026-11-20", "2026-10-05", 16)]).map((x) => x.id))
      .toEqual(["x", "a", "b"]);
  });

  it("schlägt die früheste gültige Packung vor, abgelaufene erst danach, gesperrte nie", () => {
    expect(vorschlag([c("alt", "2026-11-01", "2026-09-01", -3), c("gut", "2026-11-20", "2026-10-01", 16)])?.id).toBe("gut");
    expect(vorschlag([c("alt", "2026-11-01", "2026-09-01", -3)])?.id).toBe("alt");
    expect(vorschlag([c("weg", "2026-11-01", "2026-09-01", -3, true)])).toBeUndefined();
  });
});

describe("Texte", () => {
  it("spricht Mengen und Restzeiten deutsch", () => {
    expect(mengeText(1, "Dose")).toBe("1 Dose");
    expect(mengeText(4, "Dose")).toBe("4 Dosen");
    expect(mengeText(1.5, "kg")).toBe("1,5 kg");
    expect(restText(0)).toBe("läuft heute ab");
    expect(restText(-1)).toBe("seit gestern abgelaufen");
    expect(restText(12)).toBe("läuft in 12 Tagen ab");
    expect(runde(0.1 + 0.2)).toBe(0.3);
  });
});
