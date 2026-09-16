import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DIESE DATEI BEWACHT EINE MESSUNG, KEINE VERMUTUNG (DRK-192, 2026-09-16,
 * Quelltext-Scan ueber `src`, `e2e` und `scripts`, Stand `e79dc8b`).
 *
 * DER BEFUND: die Suite schreibt ihre Begruendungen in Kommentare und verankert
 * sie mit `datei:zeile`. Gemessen stehen davon **6027** im Repo — allein
 * `m/lagerbuch` traegt 640 in 178 Dateien, `m/radio` 4253. Ein Anker, der nicht
 * mehr auf die zitierte Aussage zeigt, kostet doppelt: erst sucht jemand an der
 * falschen Stelle, dann haelt er die Zusicherung fuer ungedeckt und „repariert"
 * sie, indem er sie streicht.
 *
 * ⚠️ DAS IST NICHT HYPOTHETISCH, ES IST IM REPO PASSIERT. In
 * `m/radio/admin/(druck)/druck.css` und im Nachbartest stand bis zu diesem
 * Riegel woertlich, die `lagerbuch`-Anker auf `globals.css:277` seien
 * „veraltete Anker (`globals.css` hat 231 Zeilen)". Sie sind es nicht: sie
 * zeigen auf `lagerbuch/src/app/globals.css`, also in die ALT-ANWENDUNG, die in
 * diesem Repo gar nicht liegt. Der nackte Anker liess sich gegen die
 * GLEICHNAMIGE Datei DIESES Repos aufloesen — und aus einer richtigen Herkunfts-
 * marke wurde eine falsche Fehlmeldung. Gegenprobe dazu: `git log -S"body *" --
 * src/app/globals.css` ist leer, die Regel hat hier nie gestanden.
 *
 * ⚠️ DIESELBE FALLE IST DEM ERSTEN WURF DIESES RIEGELS SELBST PASSIERT, und
 * deshalb steht sie unten in `ZIEL` ausgeschrieben: eine Regex ohne Klammern im
 * Pfad matcht von `(druck)/druck.css:480-497` nur das `druck.css:480-497`,
 * loest das gegen das NACHBARverzeichnis auf und meldet einen Treffer, den es
 * nicht gibt. Wer die Klammern wieder herausnimmt, baut die Falle nach.
 *
 * WAS DER RIEGEL PRUEFT: ein Anker, der sich gegen eine Datei DIESES Repos
 * aufloesen laesst, muss auf eine Zeile zeigen, die es dort gibt. Mehr nicht —
 * und das ist Absicht, siehe „WAS ER NICHT SIEHT".
 *
 * ⚠️ KEIN TOR SIEHT DAS SONST: es steht in einem KOMMENTAR. `typecheck` liest
 * ihn nicht, `lint` hat keine Regel dafuer, `build` serialisiert ihn mit, und
 * kein Verhaltenstest kann eine Behauptung ueber eine Zeilennummer pruefen. Nur
 * ein Scan sieht es. Dieselbe Bauform wie `core/shell/icons.test.ts` und
 * `core/tabelle/spaltenkopf.test.ts`.
 *
 * WAS ER NICHT SIEHT, ausgeschrieben statt verschwiegen — der Riegel ist ein
 * BODEN, keine Decke:
 *
 *   1. **Drift INNERHALB der Datei.** Waechst eine Datei ueber der zitierten
 *      Stelle, zeigt der Anker auf eine andere Zeile, die es weiterhin gibt.
 *      Gemessen an genau so einem Fall: `_lib/schreibpfade/tokenEinloesung.ts`
 *      zitierte `_db/schema.ts:412-413` fuer eine Aussage ueber `lastUsedAt` —
 *      das Feld steht heute auf `:538-540`, und auf `:412` steht eine
 *      Trigger-Begruendung. Kein EOF, kein Treffer. Dagegen hilft nur die
 *      NAMENSFORM (Symbol- oder Zusicherungsname statt Zeilennummer), und
 *      genau deshalb steht sie als Regel in `CLAUDE.md`.
 *   2. **Anker in die Alt-Anwendung und in Fremdpakete.** Beide liegen nicht in
 *      diesem Repo; es gibt nichts, wogegen man sie halten koennte. Sie werden
 *      hier bewusst NICHT gemeldet — ein Riegel, der Unpruefbares anmahnt,
 *      erzieht dazu, ihn zu ueberlesen.
 *   3. **Prosa in `docs/`.** Berichte und Plaene halten einen VERGANGENEN Stand
 *      fest; ihre Anker sollen mit dem Repo gerade NICHT mitwandern. Deshalb
 *      liegt `docs/` nicht in `WURZELN` (dort stehen 24 Anker ueber EOF, alle
 *      korrekt als historisch).
 */

/** Gelesen wird lebender Quelltext — `docs/` bewusst nicht, siehe Kopf, Punkt 3. */
const WURZELN = ["src", "e2e", "scripts"];

const ENDUNGEN = /\.(ts|tsx|css)$/;

/**
 * Ein Pfad, wie er in einem Kommentar steht, gefolgt von `:zeile` oder
 * `:von-bis`.
 *
 * ⚠️ `\([A-Za-z0-9_-]+\)` ALS GANZES SEGMENT ist der Teil, der teuer war (Kopf,
 * zweite Warnung): Next.js schreibt Route-Gruppen als `(druck)`, und ohne
 * diesen Zweig beginnt der Treffer erst HINTER der Klammer. Klammern als
 * gewoehnliche Pfadzeichen zuzulassen geht nicht — dann frisst `(datei.ts:12)`
 * aus der Prosa die oeffnende Klammer mit.
 */
const SEGMENT = "(?:[A-Za-z0-9_@.\\[\\]-]+|\\([A-Za-z0-9_-]+\\))";
const ZIEL = new RegExp(
  `(${SEGMENT}(?:\\/${SEGMENT})*\\.(?:ts|tsx|js|jsx|mjs|css|json|md|sql|yml|yaml))`
    + ":(\\d+)(?:\\s*[-–]\\s*(\\d+))?",
  "g",
);

export type Anker = { ziel: string; bis: number };

export function ankerAusText(text: string): Anker[] {
  return [...text.matchAll(ZIEL)].map(([, ziel, von, bis]) => ({
    ziel,
    bis: Number(bis ?? von),
  }));
}

const zeilenzahl = new Map<string, number | null>();

function zeilen(pfad: string): number | null {
  if (!zeilenzahl.has(pfad)) {
    let n: number | null = null;
    try {
      if (statSync(pfad).isFile()) n = readFileSync(pfad, "utf8").split("\n").length;
    } catch {
      n = null;
    }
    zeilenzahl.set(pfad, n);
  }
  return zeilenzahl.get(pfad) ?? null;
}

/**
 * Die Basen, gegen die ein Anker aufgeloest wird, in der Reihenfolge, in der
 * die Suite sie tatsaechlich schreibt: das eigene Verzeichnis (`./nachbar.ts`),
 * jeder Vorfahre (`_db/schema.ts` aus `_lib/schreibpfade/` heraus), die
 * Modulwurzel (`lagerbuch/verwaltung/(druck)/druck.css`), `src`
 * (`core/theme/theme.ts`) und die Repowurzel (`src/proxy.ts`, `CLAUDE.md`).
 *
 * Der ERSTE Treffer gewinnt. Das ist dieselbe Reihenfolge, in der ein Mensch
 * sucht, und damit die Datei, in der er landet.
 */
function aufloesen(quelle: string, ziel: string): string | null {
  const basen: string[] = [];
  let verzeichnis = resolve(dirname(quelle));
  const wurzel = resolve(".");
  basen.push(verzeichnis);
  while (verzeichnis.startsWith(`${wurzel}/`)) {
    verzeichnis = dirname(verzeichnis);
    basen.push(verzeichnis);
  }
  basen.push(resolve("src/app/m"), resolve("src"), wurzel);

  for (const basis of basen) {
    const pfad = resolve(basis, ziel);
    if (!pfad.startsWith(`${wurzel}/`)) continue;
    if (!existsSync(pfad)) continue;
    if (zeilen(pfad) !== null) return pfad;
  }
  return null;
}

function sammleQuellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === ".next" || eintrag === "node_modules") continue;
      sammleQuellen(pfad, treffer);
      continue;
    }
    if (ENDUNGEN.test(eintrag)) treffer.push(pfad);
  }
  return treffer;
}

type Befund = { quelle: string; zeile: number; anker: string; ziel: string; hat: number };

function veralteteAnker(): { befunde: Befund[]; gepruefte: number } {
  const befunde: Befund[] = [];
  let gepruefte = 0;

  for (const wurzel of WURZELN) {
    for (const quelle of sammleQuellen(wurzel)) {
      const inhalt = readFileSync(quelle, "utf8").split("\n");
      inhalt.forEach((text, i) => {
        for (const { ziel, bis } of ankerAusText(text)) {
          const pfad = aufloesen(quelle, ziel);
          if (pfad === null) continue; // Alt-Anwendung, Fremdpaket — nicht pruefbar.
          gepruefte++;
          const hat = zeilen(pfad) ?? 0;
          if (bis > hat) {
            befunde.push({
              quelle,
              zeile: i + 1,
              anker: `${ziel}:${bis}`,
              ziel: relative(".", pfad),
              hat,
            });
          }
        }
      });
    }
  }
  return { befunde, gepruefte };
}

describe("Kommentaranker zeigen in eine Zeile, die es gibt", () => {
  const { befunde, gepruefte } = veralteteAnker();

  it("kein `datei:zeile` im Repo zeigt hinter das Ende seiner Datei", () => {
    expect(
      befunde.map((b) => `${b.quelle}:${b.zeile} → ${b.anker} (${b.ziel} hat ${b.hat} Zeilen)`),
      "Diese Kommentare verankern eine Aussage an einer Zeile, die es in der "
        + "genannten Datei NICHT GIBT. Zwei Ursachen, und die zweite ist die "
        + "haeufigere: (a) die Zieldatei ist geschrumpft — dann gehoert der Anker "
        + "auf die NAMENSFORM (Symbol- oder Zusicherungsname statt Zeilennummer); "
        + "(b) der Anker meint gar nicht dieses Repo, sondern die ALT-ANWENDUNG, "
        + "und wurde nur gegen eine gleichnamige Datei hier aufgeloest — dann "
        + "gehoert der Alt-Pfad in den Anker (`lagerbuch/src/app/globals.css:277` "
        + "statt `globals.css:277`). Streiche NIE die Zusicherung, an der ein "
        + "solcher Anker haengt: der Anker ist veraltet, nicht die Aussage "
        + "(DRK-192).",
    ).toEqual([]);
  });

  /**
   * DIE GEGENPROBE ZUM SCAN SELBST: er muss ueberhaupt etwas sehen koennen.
   * Ohne sie bliebe der Riegel auch dann gruen, wenn die Suche ins Leere liefe —
   * und das faellt erst auf, wenn er gebraucht wird. Die Untergrenze steht
   * bewusst weit unter dem gemessenen Stand (3125 aufgeloeste Anker am
   * 16.09.2026); sie soll einen ABGERISSENEN Scan fangen, nicht jede
   * Aufraeumarbeit rot faerben.
   */
  it("der Scan loest ueberhaupt Anker auf", () => {
    expect(gepruefte).toBeGreaterThan(500);
  });

  /**
   * Und die Gegenprobe zur Regex — die beiden ersten Faelle sind die, an denen
   * der erste Wurf scheiterte.
   */
  it("die Regex liest Route-Gruppen mit und faellt nicht auf Prosa herein", () => {
    const ziele = (text: string) => ankerAusText(text).map((a) => `${a.ziel}:${a.bis}`);

    expect(ziele("(`lagerbuch/verwaltung/(druck)/druck.css:480-497`)"))
      .toEqual(["lagerbuch/verwaltung/(druck)/druck.css:497"]);
    expect(ziele("siehe (druck.css:12) nebenan")).toEqual(["druck.css:12"]);
    expect(ziele("`a/[artikelId]/page.tsx:26`")).toEqual(["a/[artikelId]/page.tsx:26"]);
    expect(ziele("`core/theme/theme.ts:32-33`")).toEqual(["core/theme/theme.ts:33"]);

    // Kein Anker: eine Datei ohne Zeile, und eine Zeit.
    expect(ziele("`core/theme/theme.ts` traegt die Dichten")).toEqual([]);
    expect(ziele("um 12:30 gemessen")).toEqual([]);
  });
});
