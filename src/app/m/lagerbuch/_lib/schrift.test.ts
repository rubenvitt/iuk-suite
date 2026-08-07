import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { SCHRIFT } from "./schrift";

/** antds Leiter (docs/design/README.md:149-152). Eine dritte Skala waere der Fehler. */
const LEITER = [12, 14, 16, 20, 24, 30];

describe("SCHRIFT: sieben Rollen auf antds Leiter", () => {
  it("fuehrt genau die sieben benannten Rollen", () => {
    expect(Object.keys(SCHRIFT).sort()).toEqual(
      ["abschnitt", "feldname", "mono", "neben", "text", "titel", "zahl"],
    );
  });

  it("jede fontSize liegt auf der Leiter — keine Halbpixelwerte", () => {
    for (const [rolle, stil] of Object.entries(SCHRIFT)) {
      expect(LEITER, `${rolle}: ${stil.fontSize}`).toContain(stil.fontSize);
    }
  });

  it("Zahlenrollen tragen tabular-nums", () => {
    expect(SCHRIFT.zahl.fontVariantNumeric).toBe("tabular-nums");
    expect(SCHRIFT.mono.fontVariantNumeric).toBe("tabular-nums");
  });

  it("die Strukturrollen tragen Versalien plus Laufweite statt einer zweiten Familie", () => {
    for (const rolle of ["abschnitt", "feldname"] as const) {
      expect(SCHRIFT[rolle].textTransform, rolle).toBe("uppercase");
      expect(SCHRIFT[rolle].letterSpacing, rolle).toBeTruthy();
      expect(SCHRIFT[rolle].fontWeight, rolle).toBe(600);
    }
  });

  it("nur die Mono-Rolle nennt eine Schriftfamilie, und es ist die der Suite", () => {
    for (const [rolle, stil] of Object.entries(SCHRIFT)) {
      if (rolle === "mono") expect(stil.fontFamily).toBe("var(--font-geist-mono)");
      else expect(stil.fontFamily, rolle).toBeUndefined();
    }
  });

  it("keine Rolle setzt eine Farbe", () => {
    for (const [rolle, stil] of Object.entries(SCHRIFT)) {
      expect(stil.color, rolle).toBeUndefined();
      expect(stil.background, rolle).toBeUndefined();
    }
  });
});

/** Kommentare und unvollstaendige Bloecke duerfen den Guard nicht leer-gruen machen. */
function cssRegeln(quelle: string): { regeln: { selektor: string; koerper: string }[]; fehler?: string } {
  let css = "";
  for (let i = 0; i < quelle.length; i += 1) {
    if (quelle.startsWith("/*", i)) {
      const ende = quelle.indexOf("*/", i + 2);
      if (ende === -1) return { regeln: [], fehler: "nicht geschlossener CSS-Kommentar" };
      i = ende + 1;
    } else {
      css += quelle[i];
    }
  }

  const regeln: { selektor: string; koerper: string }[] = [];
  function liesBloecke(inhalt: string): string | undefined {
    let position = 0;
    while (position < inhalt.length) {
      while (/\s/.test(inhalt[position] ?? "")) position += 1;
      if (position === inhalt.length) break;
      const auf = inhalt.indexOf("{", position);
      if (auf === -1) return "CSS-Regel ohne oeffnende Klammer";
      const kopf = inhalt.slice(position, auf).trim();
      let tiefe = 1;
      let zu = auf + 1;
      while (zu < inhalt.length && tiefe > 0) {
        if (inhalt[zu] === "{") tiefe += 1;
        if (inhalt[zu] === "}") tiefe -= 1;
        zu += 1;
      }
      if (tiefe !== 0) return `nicht geschlossener CSS-Block bei ${kopf}`;
      const koerper = inhalt.slice(auf + 1, zu - 1);
      if (kopf.startsWith("@")) {
        const fehler = liesBloecke(koerper);
        if (fehler) return fehler;
      } else if (kopf) {
        regeln.push({ selektor: kopf, koerper });
      }
      position = zu;
    }
    return undefined;
  }

  return { regeln, fehler: liesBloecke(css) };
}

function alleCss(verzeichnis: string): string[] {
  const treffer: string[] = [];
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) treffer.push(...alleCss(pfad));
    else if (pfad.endsWith(".css")) treffer.push(pfad);
  }
  return treffer;
}

describe("Kein Eingabefeld unter 16px im ganzen Modul", () => {
  it("kein Selektor unter m/lagerbuch setzt <16px auf ein Eingabeelement", () => {
    const verstoesze: string[] = [];
    for (const datei of alleCss("src/app/m/lagerbuch")) {
      const { regeln, fehler } = cssRegeln(readFileSync(datei, "utf8"));
      if (fehler) {
        verstoesze.push(`${relative("src/app/m/lagerbuch", datei)}: ${fehler}`);
        continue;
      }
      for (const { selektor, koerper } of regeln) {
        if (!/\b(input|textarea|select)\b|\.ant-select-selector/.test(selektor)) continue;
        for (const treffer of [
          ...koerper.matchAll(/(?:^|;)\s*font-size\s*:\s*([\d.]+)px\b/gi),
          ...koerper.matchAll(/(?:^|;)\s*font\s*:\s*[^;{}]*?\b([\d.]+)px\b/gi),
        ]) {
          if (Number(treffer[1]) < 16) {
            verstoesze.push(`${relative("src/app/m/lagerbuch", datei)}: ${selektor} → ${treffer[1]}px`);
          }
        }
      }
    }
    expect(verstoesze).toEqual([]);
  });
});
