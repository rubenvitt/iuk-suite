import { describe, expect, it } from "vitest";
import { demoAntwort, DEMO_ANZAHL } from "../demo/antwort";
import { datumAlsIso, lesePersonal } from "./person";
// Die Beispielperson der HiOrg-Spezifikation (https://api.hiorg-server.de/docs, Schema `user_get`),
// wörtlich aus den `example`-Werten zusammengesetzt — mit allen Feldern, die HiOrg liefert.
import beispiel from "./spezifikationsbeispiel.json";

/** Werte aus dem Beispiel, die nie hinter `lesePersonal` auftauchen dürfen. */
const NIE = [
  "DE12345678901234567800", "MALEDIC", "Sparkasse", "1985-02-07", "Hauptstr", "12345", "Musterhausen",
  "+4917685214785", "+4963014618", "admin@example.com", "7B9205K0C65", "laktose", "halal", "Spinat",
  "Ehefrau", "Zahnarzt", "Klinik", "Beispielbemerkung", "Führungszeugnis", "Fachberater", "admin", "abiE",
];

describe("lesePersonal — die Allowlist ist der Datenschutz", () => {
  it("liest die Beispielperson der Spezifikation auf genau die erlaubten Felder", () => {
    const s = lesePersonal(beispiel);
    expect(s.ok).toBe(true);
    if (!s.ok) return;
    expect(s.unlesbar).toBe(0);
    expect(s.personen).toEqual([{
      quellId: "9aabc46f91700bf0d97f625b7c5eeacf",
      vorname: "Max",
      nachname: "Muster",
      status: "aktiv",
      gesperrt: false,
      austritt: "2000-01-01",
      gruppen: ["Bereitschaft", "Jugend", "Aktive", "Senioren"],
      qualifikationen: [{ liste: "med. Qualifikation", name: "Ersthelfer", kurz: "EH" }],
    }]);
  });

  it("trägt keinen einzigen sensiblen Wert weiter, auch nicht verschachtelt", () => {
    const text = JSON.stringify(lesePersonal(beispiel));
    for (const wert of NIE) expect(text, wert).not.toContain(wert);
  });

  it("die Demo-Antwort läuft durch denselben Weg und verliert dieselben Felder", () => {
    const s = lesePersonal(demoAntwort());
    expect(s.ok && s.personen).toHaveLength(DEMO_ANZAHL);
    const text = JSON.stringify(s);
    for (const wert of ["DE02120300000000202051", "Demo-Allergie", "@demo.invalid", "Demo-Bank", "DEMO0000000", "Musterstraße", "1990-01-01"]) {
      expect(text, wert).not.toContain(wert);
    }
  });

  it("zählt kaputte Einträge als unlesbar, statt abzubrechen", () => {
    const s = lesePersonal({ data: [{ type: "user", id: "a", attributes: { vorname: "", nachname: "X" } }, { type: "orga", id: "b" }, 42, beispiel.data[0]] });
    expect(s.ok && s.unlesbar).toBe(3);
    expect(s.ok && s.personen).toHaveLength(1);
  });

  it("eine Antwort ohne data-Liste ist ein Fehler", () => {
    expect(lesePersonal({ errors: [{ status: "401" }] }).ok).toBe(false);
    expect(lesePersonal(null).ok).toBe(false);
  });

  it("nimmt links.next mit, falls HiOrg seitenweise ausliefert", () => {
    const s = lesePersonal({ data: [], links: { next: "https://api.hiorg-server.de/core/v1/personal?page=2" } });
    expect(s.ok && s.weiter).toBe("https://api.hiorg-server.de/core/v1/personal?page=2");
  });
});

describe("datumAlsIso", () => {
  it("liest beide Schreibweisen, die HiOrg mischt", () => {
    expect(datumAlsIso("01.01.2000")).toBe("2000-01-01");
    expect(datumAlsIso("1.2.2026")).toBe("2026-02-01");
    expect(datumAlsIso("2026-06-30")).toBe("2026-06-30");
    expect(datumAlsIso("2026-06-30T00:00:00+02:00")).toBe("2026-06-30");
  });
  it("leer oder unlesbar heißt: kein Austritt", () => {
    expect(datumAlsIso("")).toBeNull();
    expect(datumAlsIso(null)).toBeNull();
    expect(datumAlsIso("bald")).toBeNull();
  });
});
