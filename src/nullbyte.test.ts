import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { join, resolve } from "node:path";

/**
 * Der Wächter für eine Naht, die KEIN anderes Tor sieht — Geschwister von
 * `src/lfs-medien.test.ts` und `src/docker-kontext.test.ts`, dieselbe Frage
 * noch einmal anders: dort „ist die Datei im Kontext auch die Datei, für die
 * man sie hält?", hier „ist die Textdatei für git überhaupt noch Text?".
 *
 * Ein echtes Nullbyte im Quelltext (kein Escape, das BYTE) stuft git als
 * binär ein. Folge: keine Zeilendifferenz, keine Zusammenführung, und ein
 * Review sieht von einer Änderung an dieser Datei NICHTS.
 *
 * DAS IST AUF JEDER STUFE STILL. Die Datei kompiliert, `pnpm typecheck` ist
 * grün, `pnpm lint` schweigt, die Tests der Datei laufen — kaputt ist nicht
 * der Code, sondern das Werkzeug drumherum. Fünf Fälle lagen so im Baum
 * (DRK-331, DRK-332), teils seit Monaten.
 *
 * ⚠️ Warum die Prüfung die BYTES liest und nicht `git diff` fragt: git stuft
 * erst um, wenn das NUL in den ersten 8000 Bytes liegt. Vier der fünf Fälle
 * lagen JENSEITS davon — `git diff` zeigte sie klaglos als Text, während
 * `file -b` schon „data" meldete. Die Umstufung wäre still nachgekommen,
 * sobald oben in der Datei ein paar Zeilen dazukommen. Ein Wächter, der nur
 * die heutige Einstufung prüft, ist genau so lange grün, bis die Datei
 * wächst.
 *
 * Wird dieser Test rot, ist der Ausweg immer derselbe und kostet nichts: die
 * Escape-Schreibweise `\0` (bzw. `\u0000`) statt des Bytes — identischer
 * Laufzeitwert, Datei wieder Text.
 */

const WURZEL = resolve(__dirname, "..");

/**
 * Bewusst eine DENYLISTE und keine Allowlist der Textendungen: eine Allowlist
 * ist an dem Tag still lückenhaft, an dem eine neue Textendung dazukommt —
 * und dieser Wächter existiert gerade gegen stille Lücken. Hier steht also,
 * was echt binär ist; alles andere wird gelesen. Die Bildformate stehen so
 * auch in `.gitattributes` (`filter=lfs`, `-text`).
 */
export const ECHT_BINAER = [
  ".webp",
  ".jpg",
  ".jpeg",
  ".png",
  ".gif",
  ".ico",
  ".ttf",
  ".woff",
  ".woff2",
];

export function istZuPruefen(pfad: string): boolean {
  const klein = pfad.toLowerCase();
  return !ECHT_BINAER.some((endung) => klein.endsWith(endung));
}

/**
 * Zeilennummer des ersten NUL-Bytes, oder `null`. Zeile statt Byte-Offset,
 * damit ein Fund ohne Hexdump auffindbar ist.
 */
export function ersteNulZeile(inhalt: Buffer): number | null {
  const byte = inhalt.indexOf(0);
  if (byte < 0) return null;
  return inhalt.subarray(0, byte).toString("utf8").split("\n").length;
}

function verfolgteTextdateien(): string[] {
  return execFileSync("git", ["ls-files", "-z"], {
    cwd: WURZEL,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  })
    .split("\0")
    .filter(Boolean)
    .filter(istZuPruefen);
}

describe("Quelltext ohne Nullbyte", () => {
  it("keine verfolgte Textdatei enthält ein echtes NUL-Byte", () => {
    const fundstellen: string[] = [];

    for (const pfad of verfolgteTextdateien()) {
      let inhalt: Buffer;
      try {
        inhalt = readFileSync(join(WURZEL, pfad));
      } catch {
        // Ein verfolgter, lokal fehlender Pfad (gerade gelöscht, sparse
        // checkout) ist nicht Sache dieses Wächters.
        continue;
      }
      const zeile = ersteNulZeile(inhalt);
      if (zeile !== null) fundstellen.push(`${pfad}:${zeile}`);
    }

    // Die Fundstellen stehen IN der Zusicherung, nicht in einer Konsolenzeile:
    // Vitest zeigt bei einem Fehlschlag den Vergleichswert, nicht das Protokoll.
    expect(fundstellen).toEqual([]);
  });
});

describe("Nullbyte-Wächter: die Prüfung selbst", () => {
  it("findet ein NUL jenseits von gits 8000-Byte-Fenster", () => {
    // Genau die Lage der vier Fälle aus DRK-332. Ohne diesen Fall wäre nicht
    // belegt, dass der Wächter mehr sieht, als git von sich aus anmerkt.
    const spaet = Buffer.concat([Buffer.from("a\n".repeat(4500), "utf8"), Buffer.from([0x00])]);
    expect(ersteNulZeile(spaet)).toBe(4501);
  });

  it("hält die Escape-Schreibweise für sauber — sie ist der Ausweg, nicht der Fund", () => {
    expect(ersteNulZeile(Buffer.from('const trenner = "\\0";\n', "utf8"))).toBeNull();
  });

  it("nimmt echte Binärdateien aus, aber keine Quell- oder Textdatei", () => {
    expect(istZuPruefen("src/app/fonts/Arimo[wght].ttf")).toBe(false);
    expect(istZuPruefen("public/login-bg.JPG")).toBe(false);
    expect(istZuPruefen("scripts/import/uav.ts")).toBe(true);
    expect(istZuPruefen("docs/design/README.md")).toBe(true);
  });
});
