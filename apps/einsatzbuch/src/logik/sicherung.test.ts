import { describe, expect, it } from "vitest";

import type { Sicherungsstand } from "../typen";
import { sicherungsanzeige, sicherungszeitText } from "./sicherung";

const ZONE = "Europe/Berlin";

function stand(teil: Partial<Sicherungsstand> = {}): Sicherungsstand {
  return { ordner: "/Volumes/Sicherung", letzte: "2026-09-24T18:42:00+02:00", fehler: null, stufe: "ok", ...teil };
}

describe("sicherungszeitText", () => {
  it("formatiert mit zweistelligem Tag und Monat und „Uhr“", () => {
    expect(sicherungszeitText("2026-09-24T18:42:00+02:00", ZONE)).toBe("24.09.2026, 18:42 Uhr");
  });

  it("rechnet in der übergebenen Zone, nicht in UTC", () => {
    expect(sicherungszeitText("2026-09-24T22:30:00Z", ZONE)).toBe("25.09.2026, 00:30 Uhr");
    expect(sicherungszeitText("2026-09-24T22:30:00Z", "UTC")).toBe("24.09.2026, 22:30 Uhr");
  });

  it("wirft bei einem unlesbaren Zeitpunkt nicht, sondern zeigt ihn wie geliefert", () => {
    expect(sicherungszeitText("gestern", ZONE)).toBe("gestern");
  });
});

describe("sicherungsanzeige", () => {
  it("ok: nennt die letzte Sicherung", () => {
    expect(sicherungsanzeige(stand(), ZONE)).toEqual({ ton: "ok", text: "Letzte Sicherung: 24.09.2026, 18:42 Uhr", zusatz: null });
  });

  it("gelb nach einem Fehlschlag: „— Ordner nicht erreichbar“, der Text aus Rust wörtlich als Zusatz", () => {
    const fehler = "Die Sicherungsdatei ließ sich nicht lesen oder schreiben: No such file or directory (os error 2)";
    expect(sicherungsanzeige(stand({ stufe: "gelb", fehler }), ZONE)).toEqual({
      ton: "gelb",
      text: "Letzte Sicherung: 24.09.2026, 18:42 Uhr — Ordner nicht erreichbar",
      zusatz: fehler,
    });
  });

  it("gelb ohne Ordner: „Noch kein Sicherungsordner gewählt“", () => {
    expect(sicherungsanzeige(stand({ ordner: null, letzte: null, stufe: "gelb" }), ZONE)).toEqual({
      ton: "gelb",
      text: "Noch kein Sicherungsordner gewählt",
      zusatz: null,
    });
  });

  it("gelb nach einem Fehlschlag ohne je eine gelungene Sicherung", () => {
    expect(sicherungsanzeige(stand({ letzte: null, stufe: "gelb", fehler: "kaputt" }), ZONE).text).toBe(
      "Noch keine Sicherung — Ordner nicht erreichbar",
    );
  });

  it("rot ab 7 Tagen: dieselbe Zeile, dazu der Grund", () => {
    const a = sicherungsanzeige(stand({ letzte: "2026-09-17T18:42:00+02:00", stufe: "rot" }), ZONE);
    expect(a).toEqual({
      ton: "rot",
      text: "Letzte Sicherung: 17.09.2026, 18:42 Uhr",
      zusatz: "Seit 7 Tagen oder länger keine gelungene Sicherung.",
    });
  });

  it("rot mit Fehlschlag: der Text aus Rust geht dem Grund vor", () => {
    const a = sicherungsanzeige(stand({ letzte: "2026-09-10T08:00:00+02:00", stufe: "rot", fehler: "Ordner weg" }), ZONE);
    expect(a).toEqual({ ton: "rot", text: "Letzte Sicherung: 10.09.2026, 08:00 Uhr — Ordner nicht erreichbar", zusatz: "Ordner weg" });
  });

  it("rot ohne Ordner, eingerichtet vor 7 Tagen", () => {
    expect(sicherungsanzeige(stand({ ordner: null, letzte: null, stufe: "rot" }), ZONE)).toEqual({
      ton: "rot",
      text: "Noch kein Sicherungsordner gewählt",
      zusatz: "Seit 7 Tagen oder länger keine gelungene Sicherung.",
    });
  });

  it("die Stufe kommt aus Rust: ein alter Zeitpunkt bei „ok“ bleibt ok", () => {
    expect(sicherungsanzeige(stand({ letzte: "2020-01-01T00:00:00+01:00" }), ZONE).ton).toBe("ok");
  });

  it("aus im Testbetrieb", () => {
    expect(sicherungsanzeige(stand({ ordner: null, letzte: null, stufe: "aus" }), ZONE)).toEqual({
      ton: "aus",
      text: "Im Testbetrieb ist die automatische Sicherung aus.",
      zusatz: null,
    });
  });

  it("ok mit Ordner, aber noch ohne Zeitpunkt (Sicherung angestoßen, noch nicht zurück)", () => {
    expect(sicherungsanzeige(stand({ letzte: null }), ZONE).text).toBe("Noch keine Sicherung");
  });
});
