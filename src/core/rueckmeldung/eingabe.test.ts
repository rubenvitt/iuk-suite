import { describe, expect, it } from "vitest";

import { TEXT_MAX, TITEL_MAX, pruefeEingabe } from "@/core/rueckmeldung/eingabe";

const GUELTIG = {
  id: "tz4a98xxat96iws9zmbrgj3a",
  art: "fehler",
  titel: "Inventur speichert nicht",
  text: "Nach dem Klick auf Speichern passiert nichts.",
  modulKey: "lagerbuch",
  seite: "https://lagerbuch.example.test/m/lagerbuch/inventur?ort=3",
  browser: "Mozilla/5.0 (X11; Linux x86_64; rv:141.0) Gecko/20100101 Firefox/141.0",
  fenster: "1280×800",
  thema: "dark",
};

describe("pruefeEingabe", () => {
  it("nimmt eine vollständige Eingabe an und trimmt Titel und Text", () => {
    const r = pruefeEingabe({ ...GUELTIG, titel: "  Inventur speichert nicht  " });
    expect(r.ok && r.eingabe.titel).toBe("Inventur speichert nicht");
  });

  it.each([
    ["ohne ID", { id: "" }],
    ["mit fremden Zeichen in der ID", { id: "../../etc/passwd" }],
    ["mit unbekannter Art", { art: "lob" }],
    ["mit zu kurzem Titel", { titel: "ab" }],
    ["mit zu langem Titel", { titel: "x".repeat(TITEL_MAX + 1) }],
    ["mit zu langem Text", { text: "x".repeat(TEXT_MAX + 1) }],
    ["mit javascript:-Seite", { seite: "javascript:alert(1)" }],
    ["ohne Seite", { seite: "" }],
  ])("lehnt ab %s", (_fall, aenderung) => {
    const r = pruefeEingabe({ ...GUELTIG, ...aenderung });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.grund.length).toBeGreaterThan(0);
  });

  it("lässt den Text leer zu — ein Titel kann genügen", () => {
    expect(pruefeEingabe({ ...GUELTIG, text: "" }).ok).toBe(true);
  });

  it("glättet seltsamen Kontext still, statt die Rückmeldung zu verlieren", () => {
    const r = pruefeEingabe({ ...GUELTIG, fenster: "<script>", thema: "auto", browser: 42, modulKey: undefined });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.eingabe).toMatchObject({ fenster: "", thema: "", browser: "", modulKey: "" });
  });

  it("verträgt `null` und Unsinn als Eingabe", () => {
    expect(pruefeEingabe(null).ok).toBe(false);
    expect(pruefeEingabe("hallo").ok).toBe(false);
  });
});
