import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { cssFunde, inlineFunde, zentrierteSeiten } from "./zentrierung";

/*
 * UNTER `FullShell` STEHT KEINE SEITE MITTIG (Betreiberentscheidung 2026-11-04, Seitentypen in
 * `docs/design/README.md`). Der Scan liest jede `page.tsx` unter `src/app/m`, die Bausteine, die sie
 * direkt relativ importiert (Seitenhüllen in `_ui/` und daneben), und die CSS-Klassen, die diese Dateien tatsächlich lesen.
 *
 * DIE AUSNAHMEN liegen außerhalb von `FullShell` und sind dort mittig gewollt: Telefon-, Kiosk- und
 * öffentliche Flächen ohne Menü daneben, und Druckflächen auf einem Blatt. Jede mit Grund; ein
 * Eintrag, der nichts mehr findet, ist veraltet und macht den Test ebenfalls rot.
 */
const AUSNAHMEN: { praefix: string; grund: string }[] = [
  { praefix: "src/app/m/feedback/f/", grund: "öffentlicher Abendzettel, ohne Shell" },
  { praefix: "src/app/m/feedback/k/", grund: "öffentlicher Kioskzugang zum Abendzettel, ohne Shell" },
  { praefix: "src/app/m/lagerbuch/page.tsx", grund: "Helfer-Startseite am Telefon, ohne Shell" },
  { praefix: "src/app/m/lagerbuch/a/", grund: "Helferweg am Telefon, ohne Shell" },
  { praefix: "src/app/m/lagerbuch/auffuellen/", grund: "Helferweg am Telefon, ohne Shell" },
  { praefix: "src/app/m/lagerbuch/helfer/", grund: "Helferweg am Telefon, ohne Shell" },
  { praefix: "src/app/m/radio/page.tsx", grund: "Ausleih-Eingang, ohne Shell (radio/layout.tsx)" },
  { praefix: "src/app/m/uav/(teilnehmer)/", grund: "Teilnehmerflächen im Kiosk, ohne Shell" },
  { praefix: "src/app/m/verpflegung/h/", grund: "Helferweg am Telefon, ohne Shell" },
  { praefix: "src/app/m/wartung/(geraet)/", grund: "am Gerät per Telefon, MinimalShell" },
  { praefix: "src/app/m/unterkunft/druck/", grund: "Druckfläche, ein Blatt" },
];

const REPO = join(__dirname, "..", "..", "..");

describe("Seiten unter FullShell stehen links", () => {
  const funde = zentrierteSeiten(REPO, join(REPO, "src/app/m"));
  const ausnahme = (seite: string) => AUSNAHMEN.find((a) => seite.startsWith(a.praefix));

  it("keine Seite stellt sich mit Höchstbreite und automatischem Rand in die Mitte", () => {
    const verboten = funde
      .filter((f) => !ausnahme(f.seite))
      .map((f) => `${f.seite} — ${f.datei}: ${f.auszug}`);
    expect([...new Set(verboten)], "Seitentyp aus core/seite nehmen statt zu zentrieren").toEqual([]);
  });

  it("jede Ausnahme findet noch etwas", () => {
    const leer = AUSNAHMEN.filter((a) => !funde.some((f) => f.seite.startsWith(a.praefix))).map((a) => a.praefix);
    expect(leer).toEqual([]);
  });

  it("die fünf Seiten von feedback/(admin) und der Update-Modus von radio sind darunter", () => {
    expect(funde.filter((f) => f.seite.includes("feedback/(admin)") || f.seite.includes("radio/admin"))).toEqual([]);
  });
});

describe("Der Scan selbst", () => {
  it("findet Inline-Zentrierung, ein- und mehrzeilig, und lässt eine linke Höchstbreite stehen", () => {
    expect(inlineFunde(`<div style={{ maxWidth: 1120, margin: "0 auto" }}>`)).toHaveLength(1);
    expect(inlineFunde(`<div style={{\n  maxWidth: 760,\n  marginInline: "auto",\n}}>`)).toHaveLength(1);
    expect(inlineFunde(`<div style={{ maxWidth: 720, marginBlockStart: 20 }}>`)).toEqual([]);
    expect(inlineFunde(`<div style={{ width: 224, margin: "0 auto" }}>`)).toEqual([]);
  });

  it("findet eine zentrierende Klasse nur, wenn die Datei sie liest", () => {
    const css = ".flaeche { max-width: 40rem; margin-inline: auto; }\n.blatt { max-width: 210mm; margin: 0 auto; }";
    expect(cssFunde(css, new Set(["flaeche"]))).toEqual([".flaeche { max-width: 40rem; margin-inline: auto }"]);
    expect(cssFunde(css, new Set(["anderes"]))).toEqual([]);
    expect(cssFunde(".a { max-width: 40rem; min-inline-size: 0; }", new Set(["a"]))).toEqual([]);
  });
});
