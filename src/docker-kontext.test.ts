import { describe, it, expect } from "vitest";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join, posix, resolve } from "node:path";

/**
 * Der Wächter für eine Naht, die KEIN anderes Tor sieht.
 *
 * `tsconfig.json` zieht mit `"include": ["**\/*.ts", "**\/*.tsx", "**\/*.mts"]`
 * jede Datei in den Typecheck, die im Build-Kontext liegt — und im Container ist
 * das nicht der Arbeitsbaum, sondern der Arbeitsbaum MINUS `.dockerignore`.
 * Importiert eine verbleibende Datei etwas Ausgeschlossenes, bricht `pnpm build`
 * erst dort, wo es teuer ist: in der CI, nach `pnpm install`, mit
 * „Cannot find module".
 *
 * Lokal ist das strukturell unsichtbar. `pnpm typecheck`, `pnpm build` und
 * Vitest laufen alle drei in einem Baum, in dem `e2e/` existiert — sie sind
 * gruen, waehrend der Container rot ist. Genau so passiert (02.08.2026):
 * `playwright.config.ts` bekam einen Import aus `e2e/helpers/avModus`, weil der
 * Pfad der AV-Modusdatei nicht als zweites Literal auseinanderlaufen sollte —
 * eine richtige Entscheidung, die den Docker-Build zerlegte, ohne dass ein
 * lokales Tor auch nur gezuckt haette.
 *
 * Was hier NICHT geprueft wird: ob die Datei zur Laufzeit gebraucht wird. Der
 * Test kennt nur die Frage „liegt das Importziel im Kontext?".
 */

const WURZEL = resolve(__dirname, "..");

/** Endungen, die `tsconfig.json` in den Typecheck zieht. */
const GEPRUEFT = [".ts", ".tsx", ".mts"];

/** Reihenfolge wie bei der Modulauflösung von TypeScript/Turbopack. */
const KANDIDATEN_ENDUNGEN = ["", ".ts", ".tsx", ".mts", ".d.ts", ".js", ".jsx", ".mjs", ".json"];

/**
 * `.dockerignore` folgt Gos `filepath.Match` plus `**`. Zwei Eigenschaften
 * entscheiden hier alles, und beide sind leicht falsch im Kopf:
 *
 * 1. Muster sind an der Kontextwurzel VERANKERT. `e2e` schliesst `e2e/` aus,
 *    aber NICHT `.claude/worktrees/x/e2e/` — nur `**\/*.test.ts` greift in jeder
 *    Tiefe. Ein Matcher, der das verwechselt, meldet Ausgeschlossenes als
 *    vorhanden und ist damit still gruen.
 * 2. Trifft ein Muster ein Verzeichnis, faellt dessen ganzer Inhalt mit.
 */
function musterZuRegex(muster: string): RegExp {
  const segmente = muster.split("/");
  let quelle = "^";
  segmente.forEach((segment, i) => {
    const letztes = i === segmente.length - 1;
    if (segment === "**") {
      quelle += letztes ? ".*" : "(?:[^/]*/)*";
      return;
    }
    for (const zeichen of segment) {
      if (zeichen === "*") quelle += "[^/]*";
      else if (zeichen === "?") quelle += "[^/]";
      else quelle += zeichen.replace(/[.+^${}()|[\]\\]/g, "\\$&");
    }
    if (!letztes) quelle += "/";
  });
  // Ein Treffer auf ein Verzeichnis nimmt alles darunter mit.
  quelle += "(?:/.*)?$";
  return new RegExp(quelle);
}

function ignorierMuster(): RegExp[] {
  const datei = join(WURZEL, ".dockerignore");
  expect(existsSync(datei), ".dockerignore fehlt — ohne sie prueft dieser Test nichts").toBe(true);
  return readFileSync(datei, "utf8")
    .split("\n")
    .map((zeile) => zeile.trim())
    .filter((zeile) => zeile !== "" && !zeile.startsWith("#"))
    .map((zeile) => {
      /*
       * Laut statt still: `!`-Ausnahmen und `\`-Pfade bildet dieser Matcher
       * nicht ab. Wer sie einfuehrt, soll hier stehenbleiben statt eine
       * Zusicherung zu erben, die der Test nicht mehr geben kann.
       */
      if (zeile.startsWith("!") || zeile.includes("\\")) {
        throw new Error(
          `.dockerignore-Muster "${zeile}" bildet dieser Wächter nicht ab — ` +
            `entweder das Muster anders schreiben oder musterZuRegex() erweitern.`,
        );
      }
      return musterZuRegex(zeile.replace(/^\.\//, "").replace(/\/$/, ""));
    });
}

/** Die Dateien, die der Container sieht: getrackt und von keinem Muster getroffen. */
function kontextDateien(muster: RegExp[]): Set<string> {
  const getrackt = execFileSync("git", ["ls-files", "-z"], { cwd: WURZEL, encoding: "utf8" })
    .split("\0")
    .filter(Boolean);
  return new Set(getrackt.filter((pfad) => !muster.some((m) => m.test(pfad))));
}

/**
 * String-Literale zuerst, Kommentare danach — die Reihenfolge in der Alternative
 * ist die ganze Logik: so verschluckt ein `//` in einer URL nicht den Rest der
 * Zeile, und ein Kommentar, der wie Code aussieht, zaehlt nicht als Import.
 * Ohne das meldet der Test `icons.ts` an, weil dort `export * from './lib/index.js'`
 * als ZITAT in einer Erklaerung steht.
 */
const STRING_ODER_KOMMENTAR = /"(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\/\*[\s\S]*?\*\/|\/\/[^\n]*/g;

const IMPORT_MUSTER = /(?:from|import)\s*\(?\s*["']((?:\.\.?)\/[^"']*)["']/g;

function relativeImporte(inhalt: string): string[] {
  const ohneKommentare = inhalt.replace(STRING_ODER_KOMMENTAR, (treffer) =>
    treffer.startsWith("/") ? " " : treffer,
  );
  return [...ohneKommentare.matchAll(IMPORT_MUSTER)].map((treffer) => treffer[1]);
}

describe("Docker-Build-Kontext", () => {
  const muster = ignorierMuster();
  const kontext = kontextDateien(muster);

  it("kennt die heutigen Ausschlüsse (sonst prüft der Rest ins Leere)", () => {
    // Verankert: greift an der Wurzel …
    expect(kontext.has("playwright.config.ts")).toBe(false);
    expect([...kontext].some((p) => p.startsWith("e2e/"))).toBe(false);
    // … und rekursive Muster in jeder Tiefe.
    expect([...kontext].some((p) => p.endsWith(".test.ts") || p.endsWith(".test.tsx"))).toBe(false);
    // Gegenprobe: der Produktivcode ist noch da.
    expect(kontext.has("src/app/layout.tsx")).toBe(true);
    expect(kontext.has("tsconfig.json")).toBe(true);
  });

  it("keine Datei im Kontext importiert etwas, das der Container nicht hat", () => {
    const brueche: string[] = [];

    for (const pfad of kontext) {
      if (!GEPRUEFT.some((endung) => pfad.endsWith(endung))) continue;
      const inhalt = readFileSync(join(WURZEL, pfad), "utf8");

      for (const spezifizierer of relativeImporte(inhalt)) {
        const ziel = posix.normalize(posix.join(posix.dirname(pfad), spezifizierer));

        /*
         * `.next/` ist zu Recht ausgeschlossen und entsteht erst IM Container:
         * `next-env.d.ts` zeigt auf `.next/dev/types/routes.d.ts`, das `next build`
         * selbst schreibt. Ein Treffer hier waere immer falsch.
         */
        if (ziel.startsWith(".next/")) continue;
        const kandidaten = KANDIDATEN_ENDUNGEN.flatMap((endung) => [
          `${ziel}${endung}`,
          `${ziel}/index${endung}`,
        ]);

        if (kandidaten.some((k) => kontext.has(k))) continue;

        const aussenAufDerPlatte = kandidaten.find(
          (k) => k !== ziel && existsSync(join(WURZEL, k)),
        );
        brueche.push(
          aussenAufDerPlatte
            ? `${pfad} importiert "${spezifizierer}" → ${aussenAufDerPlatte} ist per .dockerignore ausgeschlossen`
            : `${pfad} importiert "${spezifizierer}" → kein Ziel gefunden`,
        );
      }
    }

    expect(brueche, `Der Docker-Build bricht an ${brueche.length} Stelle(n):\n${brueche.join("\n")}`).toEqual(
      [],
    );
  });
});

/*
 * DAS VIERECK EINES pnpm-PATCHES — die vierte Ecke des Dreiecks aus `CLAUDE.md`.
 *
 * Ein Patch braucht DREI zusammenpassende Dinge, und keins davon ist heute sonst
 * abgesichert: die Datei unter `patches/`, den Eintrag in `pnpm-workspace.yaml`
 * und eine `COPY`-Zeile im `Dockerfile`, BEVOR `pnpm install --frozen-lockfile`
 * laeuft.
 *
 * ⛔ GEMESSEN, NICHT VERMUTET (Review Aufgabe 7, Befund K1): die deps-Stage
 * kopierte `package.json pnpm-lock.yaml pnpm-workspace.yaml` und sonst nichts. Der
 * Eintrag zeigte damit im Container auf eine Datei, die es dort nicht gibt —
 * `pnpm install` bricht mit ENOENT ab, und weil die builder-Stage `node_modules`
 * fertig aus deps uebernimmt, gibt es keine zweite Gelegenheit. Das Image war
 * nicht baubar, waehrend `typecheck`, `lint`, Vitest und `pnpm build` alle vier
 * gruen blieben: lokal liegt `patches/` im Arbeitsbaum.
 *
 * Der Test ist BEDINGT formuliert — ohne Patches verlangt er keine COPY-Zeile.
 * Wer den Patch zurueckzieht (`git revert`), soll nicht an einem Waechter
 * haengenbleiben, dessen Gegenstand verschwunden ist.
 */
const PNPM_WORKSPACE = join(WURZEL, "pnpm-workspace.yaml");

/**
 * Der `patchedDependencies`-Block aus `pnpm-workspace.yaml`.
 *
 * Handgelesen statt mit einem YAML-Parser: das Repo fuehrt keinen als
 * Abhaengigkeit, und der Block hat eine feste, flache Form (`'name@version':
 * pfad`). Trifft der Leser eine Zeile, die er nicht versteht, WIRFT er — ein
 * stillschweigend uebersprungener Eintrag waere genau der Ausfall, den dieser
 * Test verhindern soll.
 */
function patchEintraege(): { paket: string; pfad: string }[] {
  const zeilen = readFileSync(PNPM_WORKSPACE, "utf8").split("\n");
  const start = zeilen.findIndex((z) => z.trimEnd() === "patchedDependencies:");
  if (start === -1) return [];
  const eintraege: { paket: string; pfad: string }[] = [];
  for (const zeile of zeilen.slice(start + 1)) {
    if (zeile.trim() === "" || zeile.trimStart().startsWith("#")) continue;
    if (!/^\s+\S/.test(zeile)) break; // Ende des Blocks: neue Wurzel-Ebene
    const treffer = zeile.match(/^\s+'?([^':]+)'?\s*:\s*(\S+)\s*$/);
    if (!treffer) throw new Error(`patchedDependencies-Zeile nicht lesbar: ${zeile}`);
    eintraege.push({ paket: treffer[1], pfad: treffer[2] });
  }
  return eintraege;
}

/** Die deps-Stage des Dockerfiles — nur sie installiert. */
function depsStage(): string {
  const dockerfile = readFileSync(join(WURZEL, "Dockerfile"), "utf8");
  const stufen = dockerfile.split(/^FROM /m);
  const deps = stufen.find((s) => s.startsWith("node:") && / AS deps/.test(s.split("\n")[0]));
  expect(deps, "keine deps-Stage im Dockerfile gefunden").toBeDefined();
  return deps as string;
}

describe("pnpm-Patches im Docker-Build", () => {
  // Eigene Kontextberechnung: die des ersten Blocks liegt in dessen Geltungsbereich.
  const kontextMitPatches = kontextDateien(ignorierMuster());

  it("jeder Eintrag zeigt auf eine vorhandene Datei", () => {
    for (const { paket, pfad } of patchEintraege()) {
      expect(existsSync(join(WURZEL, pfad)), `${paket}: ${pfad} fehlt`).toBe(true);
    }
  });

  it("kopiert patches/ in die deps-Stage, bevor installiert wird", () => {
    const eintraege = patchEintraege();
    if (eintraege.length === 0) return; // ohne Patch keine Pflicht

    const stage = depsStage();
    const copyIndex = stage.search(/^COPY\b[^\n]*\bpatches\b/m);
    const installIndex = stage.search(/^RUN\s+pnpm\s+install\b/m);

    expect(installIndex, "die deps-Stage installiert gar nicht mehr").toBeGreaterThan(-1);
    expect(
      copyIndex,
      "Der Dockerfile kopiert `patches/` nicht — `pnpm install --frozen-lockfile` bricht im " +
        "Container mit ENOENT ab, und die builder-Stage installiert nie nach.",
    ).toBeGreaterThan(-1);
    expect(copyIndex, "`COPY patches` steht NACH dem Install und kommt damit zu spät").toBeLessThan(
      installIndex,
    );
  });

  /*
   * Der Kontext muss die Dateien auch hergeben: eine `.dockerignore`-Zeile ueber
   * `patches/` machte die COPY-Zeile wirkungslos, und der Ausfall saehe genauso
   * aus wie die fehlende Zeile selbst.
   */
  it("schliesst patches/ nicht per .dockerignore aus", () => {
    for (const { pfad } of patchEintraege()) {
      expect(kontextMitPatches.has(pfad), `${pfad} liegt nicht im Docker-Kontext`).toBe(true);
    }
  });
});
