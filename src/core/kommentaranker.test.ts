import { existsSync, readFileSync } from "node:fs";
import { basename, extname } from "node:path";
import { describe, expect, it } from "vitest";

import {
  NICHT_GELESEN,
  VERFOLGT,
  ankerAusText,
  aufloesen,
  istQuelle,
  liegtImArbeitsbaum,
  obergrenzeVon,
  sammleDateien,
  sammleQuellen,
  spannenFehler,
  veralteteAnker,
  zeilenzahlVon,
} from "./kommentaranker";

/**
 * DIE ZUSICHERUNGEN ZUR ANKER-MASCHINERIE. Sie selbst steht seit DRK-204 in
 * `kommentaranker.ts` daneben, weil `scripts/anker-drift.ts` sie als zweiter
 * Verbraucher braucht; die Begruendung des Schnitts steht dort im Kopf.
 *
 * ⚠️ DER RIEGEL HIER PRUEFT EIN ENDE, KEINE BEDEUTUNG: ein Anker, der sich
 * gegen eine Datei DIESES Repos aufloesen laesst, muss auf eine Zeile zeigen,
 * die es dort gibt. Drift INNERHALB der Datei sieht er ausdruecklich nicht —
 * dafuer gibt es den Melder, und der ist bewusst KEIN Tor (DRK-204).
 */

describe("Kommentaranker zeigen in eine Zeile, die es gibt", () => {
  const { befunde, gepruefte } = veralteteAnker();

  it("kein `datei:zeile` im Repo zeigt hinter das Ende seiner Datei", () => {
    expect(
      befunde.map((b) => `${b.quelle}:${b.zeile} → ${b.anker} (${b.ziel}: ${b.grund})`),
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
   * bewusst weit unter dem gemessenen Stand (3225 aufgeloeste Anker aus 1860
   * Dateien am 16.09.2026); sie soll einen ABGERISSENEN Scan fangen, nicht jede
   * Aufraeumarbeit rot faerben.
   */
  it("der Scan loest ueberhaupt Anker auf", () => {
    expect(gepruefte).toBeGreaterThan(500);
  });

  /**
   * DIE LUECKE, DIE SICH SONST STILL WIEDER AUFTUT: eine neue Endung im Repo,
   * die niemand einsortiert. Der erste Wurf las `ts|tsx|css` und
   * uebersah 40 `.sql` und zwei `.mjs` — ein „repo-weiter" Riegel mit einem
   * blinden Fleck, den nur eine Gegenprobe sichtbar macht.
   */
  it("jede Endung im Repo ist einsortiert — gelesen oder nicht", () => {
    const unsortiert = new Set<string>();
    for (const pfad of sammleDateien()) {
      if (istQuelle(pfad) || NICHT_GELESEN.test(pfad)) continue;
      unsortiert.add(extname(pfad) || basename(pfad));
    }
    expect(
      [...unsortiert].sort(),
      "Diese Endungen stehen weder in `ENDUNGEN` noch in `NICHT_GELESEN`. "
        + "Traegt das Format Kommentare, gehoert es in `ENDUNGEN` — sonst liest "
        + "der Riegel es nie und bleibt gruen, waehrend dort ein veralteter "
        + "Anker steht. Ist es binaer, gehoert es in `NICHT_GELESEN`.",
    ).toEqual([]);
  });

  /**
   * DIE GEGENPROBE ZUR VERSIONIERTEN DATEILISTE: eine INSTALLIERTE Fremddatei
   * liegt da, gehoert aber nicht zum Repo. Mit `existsSync` als Filter traf
   * `node_modules/drizzle-orm/sqlite-core/db.d.ts:16-17` aus
   * `scripts/import/radio.ts` eine echte Paketdatei — ein Paket-Update haette
   * den Riegel rot gefaerbt wegen Inhalten, die dieses Repo nicht versioniert.
   * Gemessen fielen durch die Umstellung 32 Anker heraus, ALLE nach
   * `node_modules`; kein einziger zeigte auf eine Datei des Repos.
   *
   * Das Ziel steht bewusst auf `vitest`: das Paket laeuft gerade, ist also
   * installiert — die Gegenprobe kann nicht still ins Leere greifen.
   */
  it("loest ein Ziel in node_modules NICHT auf, auch wenn die Datei daliegt", () => {
    const fremd = "node_modules/vitest/package.json";
    expect(existsSync(fremd), "die Gegenprobe braucht ein installiertes Paket").toBe(true);
    expect(aufloesen("src/core/kommentaranker.test.ts", fremd)).toBeNull();
    // Und die Gegenrichtung: eine versionierte Datei loest weiterhin auf.
    expect(aufloesen("src/core/kommentaranker.test.ts", "core/registry.ts")).not.toBeNull();
  });

  /**
   * DER RUECKFALL UEBER EINDEUTIGE PFAD-SUFFIXE, und vor allem SEINE GRENZE.
   * Die festen Basen erreichen nicht jedes Ziel: `e2e/files-hosts.spec.ts`
   * schreibt `_lib/ausleihZugang.ts`, und das liegt unter `src/app/m/radio/`.
   *
   * ⚠️ EIN NACKTER DATEINAME BLEIBT AUSSEN VOR, auch wenn er im Repo einmalig
   * ist — die Begruendung steht an `EINDEUTIGES_SUFFIX`, gemessen an
   * `globals.css`: der Riegel wuerde sonst die ALT-ANWENDUNG mit der
   * gleichnamigen Datei hier verwechseln, also genau den Fehlschluss begehen,
   * gegen den es ihn gibt.
   */
  it("loest einen eindeutigen PFAD auf, einen nackten Dateinamen nicht", () => {
    const von = "e2e/files-hosts.spec.ts";

    expect(aufloesen(von, "_lib/ausleihZugang.ts"))
      .toMatch(/src\/app\/m\/radio\/_lib\/ausleihZugang\.ts$/);

    // `globals.css` gibt es im Repo genau einmal — und bleibt trotzdem stumm.
    expect(VERFOLGT.has("src/app/globals.css")).toBe(true);
    expect(aufloesen(von, "globals.css")).toBeNull();

    // Mehrdeutig heisst ebenfalls stumm: `_db/schema.ts` gibt es in jedem Modul.
    expect(aufloesen(von, "_db/schema.ts")).toBeNull();

    // Der tsconfig-Alias und die weggelassene Endung — beide Hausformen.
    expect(aufloesen(von, "@/app/m/qr/_lib/test-dom"))
      .toMatch(/src\/app\/m\/qr\/_lib\/test-dom\.tsx$/);
    expect(aufloesen(von, "app/m/qr/_lib/test-dom"))
      .toMatch(/src\/app\/m\/qr\/_lib\/test-dom\.tsx$/);

    // Der EIGENE Reponame wird abgestreift …
    expect(aufloesen(von, "iuk-suite/src/core/routing.ts"))
      .toMatch(/src\/core\/routing\.ts$/);
    // … ein FREMDER nicht: `lagerbuch/src/app/globals.css` ist die
    // Alt-Anwendung und darf gerade NICHT auf die Datei hier zeigen.
    expect(aufloesen(von, "lagerbuch/src/app/globals.css")).toBeNull();
  });

  /**
   * DIE BEIDEN SPANNEN-FORMEN, DIE DER ERSTE WURF DURCHLIESS: eine Zeile 0 und
   * eine rueckwaerts laufende Spanne. Beide sind keine Spitzfindigkeit — sie
   * entstehen beim Tippen, und beide behaupten eine Zeile, die es nicht gibt.
   */
  /**
   * MEHRDEUTIG heisst nicht ungeprueft: die laengste Kandidatendatei ist eine
   * Obergrenze, und was darueber liegt, gibt es in KEINER von ihnen.
   *
   * ⚠️ Der Fall nennt bewusst ECHTE Suffixe — hier ist die Mehrdeutigkeit der
   * Gegenstand, und ein erfundener Name waere schlicht unbekannt. Ohne
   * Zeilennummer sind sie fuer den Scan keine Anker (siehe den Riegel unten).
   */
  it("gibt ein mehrdeutiges Suffix nicht auf, sondern deckelt es", () => {
    // `_db/schema.ts` gibt es elfmal, `t/[code]/route.ts` zweimal — `aufloesen`
    // waehlt bewusst keine davon aus.
    expect(aufloesen("e2e/radio-hosts.spec.ts", "_db/schema.ts")).toBeNull();
    expect(aufloesen("e2e/radio-hosts.spec.ts", "t/[code]/route.ts")).toBeNull();

    // Eine Obergrenze gibt es trotzdem, und sie ist groesser als jede einzelne
    // Kandidatendatei sein kann.
    const grenze = obergrenzeVon("_db/schema.ts");
    expect(grenze).not.toBeNull();
    expect(grenze!).toBeGreaterThan(0);

    // Und die Gegenrichtung: was gar nicht im Repo liegt, hat auch keine
    // Obergrenze — sonst faerbte der Riegel Anker in die Alt-Anwendung rot.
    expect(obergrenzeVon("lagerbuch/src/app/globals.css")).toBeNull();
    expect(obergrenzeVon("node_modules/vitest/package.json")).toBeNull();
  });

  /**
   * DIE AUSLASSUNGSFORM wird abgestreift — aber sie macht aus einem fremden
   * Pfad keinen eigenen. Beide Richtungen stehen hier, weil nur ihr Zusammenspiel
   * die Zusage traegt.
   */
  it("streift die Auslassung ab, ohne Fremdes einzugemeinden", () => {
    const quelle = "src/app/m/radio/admin/(arbeit)/page.test.tsx";

    // Lokal und eindeutig — der Pfad hat ein Suffix in der verfolgten Liste.
    expect(aufloesen(quelle, ".../artikel/ArtikelTable.test.tsx"))
      .toMatch(/lagerbuch\/verwaltung\/\(arbeit\)\/artikel\/ArtikelTable\.test\.tsx$/);
    expect(aufloesen(quelle, ".../versionen/page.tsx"))
      .toMatch(/radio\/admin\/\(arbeit\)\/versionen\/page\.tsx$/);

    // Fremdpaket und Alt-Anwendung bleiben draussen — genau der Fehlschluss,
    // gegen den es DRK-192 gibt. Kein Eintrag in der verfolgten Liste, kein Ziel.
    expect(aufloesen(quelle, ".../request-cookies.js")).toBeNull();
    expect(aufloesen(quelle, ".../es/Select.js")).toBeNull();
    expect(aufloesen(quelle, ".../routes/admin/login.tsx")).toBeNull();
    expect(aufloesen(quelle, ".../components/features/admin/AppQRCode.tsx")).toBeNull();

    // `..` ist ein echter relativer Schritt und wird NICHT abgestreift.
    expect(aufloesen(quelle, "../nichtVorhanden/probeDatei.ts")).toBeNull();
  });

  /**
   * ⚠️ DER ZUSTAND IST ALLTAEGLICH: Datei geloescht oder umbenannt, noch kein
   * `git add`. `git ls-files` nennt den alten Pfad weiter. Ohne die Probe warf
   * der Scan `ENOENT` und riss die GANZE Datei mit — gemessen „Tests: no tests"
   * statt einer Meldung, also gar kein Signal mehr.
   */
  it("uebergeht eine verfolgte Datei, die es im Arbeitsbaum nicht gibt", () => {
    // Die Probe selbst, in beide Richtungen.
    expect(liegtImArbeitsbaum("src/core/kommentaranker.test.ts")).toBe(true);
    expect(liegtImArbeitsbaum("src/core/dieseDateiGibtEsNicht.ts")).toBe(false);

    // Und die Folge: was der Scan liest, laesst sich auch lesen. Ein Pfad aus
    // `git ls-files`, der im Arbeitsbaum fehlt, kommt hier nicht mehr an.
    const quellen = sammleQuellen();
    expect(quellen.length).toBeGreaterThan(500);
    expect(quellen.filter((p) => !liegtImArbeitsbaum(p))).toEqual([]);
  });

  it("prueft beide Enden einer Spanne, nicht nur das letzte", () => {
    const anker = (von: number, bis = von) => ({ ziel: "egal.ts", von, bis });

    expect(spannenFehler(anker(1, 10), 99)).toBeNull();
    expect(spannenFehler(anker(99), 99)).toBeNull();

    expect(spannenFehler(anker(0), 99)).toMatch(/Zeile 0/);
    expect(spannenFehler(anker(999, 1), 99)).toMatch(/rueckwaerts/);
    expect(spannenFehler(anker(100), 99)).toMatch(/99 Zeilen/);
    expect(spannenFehler(anker(90, 120), 99)).toMatch(/99 Zeilen/);
  });

  /**
   * DER GRENZFALL, AN DEM DER ERSTE WURF VORBEILIEF (Codex-Review zu PR #183):
   * `split("\n").length` zaehlt die leere Zeichenkette hinter dem letzten
   * Umbruch mit. Damit kam GENAU der Anker durch, der um eine Zeile zu weit
   * zeigt — also der haeufigste Fall ueberhaupt, weil eine Datei beim
   * Schrumpfen meist ihre letzte Zeile verliert und nicht ihre letzten zehn.
   */
  it("zaehlt Zeilen wie `wc -l`, mit und ohne abschliessenden Umbruch", () => {
    expect(zeilenzahlVon("a\nb\nc\n")).toBe(3);
    expect(zeilenzahlVon("a\nb\nc")).toBe(3);
    expect(zeilenzahlVon("a\n")).toBe(1);
    expect(zeilenzahlVon("a")).toBe(1);
    expect(zeilenzahlVon("")).toBe(0);
    // Eine Leerzeile am Ende ist eine Zeile — zwei Umbrueche, ein leerer Rest.
    expect(zeilenzahlVon("a\n\n")).toBe(2);
  });

  /**
   * Und die Gegenprobe zur Regex. Die Faelle stehen in der Reihenfolge, in der
   * sie schiefgingen: Route-Gruppe und Ternaer-Prosa im ersten Wurf, Ziele ohne
   * passende Endung in der zweiten Runde (Codex-Review zu PR #183).
   *
   * ⚠️ JEDES BEISPIEL NENNT EINEN ERFUNDENEN PFAD (`probe…`), und das ist kein
   * Geschmack: der Scan liest AUCH DIESE DATEI. Standen hier echte Namen mit
   * erfundenen Zeilennummern — der Etikettenbogen war so einer —, dann faerbte
   * jedes Kuerzen jener Datei den Riegel rot, obwohl das Beispiel ueber ihren
   * Inhalt nichts behauptet. Dieselbe Falle hat in diesem PR schon dreimal
   * zugeschlagen, jedes Mal an einer Begruendung im Kommentar. Geprueft wird die
   * FORM des Ankers, nicht sein Ziel; ein erfundener Pfad taugt dafuer genauso.
   *
   * Die Faelle in `aufloesen` nebenan nennen absichtlich ECHTE Pfade — dort ist
   * die Aufloesung der Gegenstand —, aber ohne Zeilennummer, und damit sind sie
   * fuer den Scan kein Anker.
   */
  it("die Regex liest Route-Gruppen mit und faellt nicht auf Prosa herein", () => {
    const ziele = (text: string) => ankerAusText(text).map((a) => `${a.ziel}:${a.bis}`);

    expect(ziele("(`probe/verwaltung/(druck)/probeDruck.css:480-497`)"))
      .toEqual(["probe/verwaltung/(druck)/probeDruck.css:497"]);
    expect(ziele("siehe (probeDruck.css:12) nebenan")).toEqual(["probeDruck.css:12"]);
    expect(ziele("`probe/[artikelId]/probeSeite.tsx:26`"))
      .toEqual(["probe/[artikelId]/probeSeite.tsx:26"]);
    expect(ziele("`probe/theme/probeTheme.ts:32-33`"))
      .toEqual(["probe/theme/probeTheme.ts:33"]);

    // Ohne Endung und mit unbekannter Endung — beide kamen frueher gar nicht an.
    expect(ziele("`Probedatei:38-39`")).toEqual(["Probedatei:39"]);
    expect(ziele("`.probe.example:107-110`")).toEqual([".probe.example:110"]);

    // Fortsetzungen zaehlen als eigene Anker — sonst bliebe die letzte Zahl
    // ungeprueft, und die steht am ehesten allein da.
    expect(ziele("`probePortal.ts:48-49 und :51`"))
      .toEqual(["probePortal.ts:49", "probePortal.ts:51"]);
    expect(ziele("`probeGlobals.css:265,266`"))
      .toEqual(["probeGlobals.css:265", "probeGlobals.css:266"]);
    expect(ziele("`probeBauform.test.ts:181, :201-203`"))
      .toEqual(["probeBauform.test.ts:181", "probeBauform.test.ts:203"]);
    // Backticks zwischen den Fortsetzungen — die Form, die den letzten echten
    // Fund aufdeckte (eine 85-zeilige Datei, zitiert bis Zeile 86).
    expect(ziele("(`probeNotiz.ts:18-20`, `:82-86`)"))
      .toEqual(["probeNotiz.ts:20", "probeNotiz.ts:86"]);
    expect(ziele("`probeBootstrap.ts:103` und `:138`"))
      .toEqual(["probeBootstrap.ts:103", "probeBootstrap.ts:138"]);

    // ⚠️ OHNE Doppelpunkt muss die Zahl DIREKT anschliessen: eine Zahlenliste
    // hinter dem Anker ist keine Fortsetzung, sondern sind Vorbelegungen.
    expect(ziele("(`probeGrenzen.ts:76-91`, 12/5/30/300)"))
      .toEqual(["probeGrenzen.ts:91"]);

    // Der Schraegstrich zaehlt ebenfalls als Trenner — `:413/423/437`.
    expect(ziele("`probeHosts.spec.ts:413/423/437`"))
      .toEqual(["probeHosts.spec.ts:413", "probeHosts.spec.ts:423", "probeHosts.spec.ts:437"]);

    // ⚠️ UND EINE SPALTE IST KEINE ZEILE. `datei:zeile:spalte` ist die Form
    // jeder Compiler- und Stapelmeldung, und 13 davon stehen im Repo — bis
    // hierher las der Doppelpunkt-Zweig die SPALTE als zweite Zeilenangabe.
    // Gruen war das rein zufaellig (Spalte 46 gegen 129 Zeilen in `boot.test.ts`);
    // ein Kuerzen der Datei haette den Riegel ueber eine Spaltennummer rot
    // gefaerbt. Deshalb verlangt der Zweig jetzt einen Backtick oder ein
    // Leerzeichen vor dem Doppelpunkt — eine echte Fortsetzung hat beides, eine
    // Diagnose keines von beidem (Codex-Review zu PR #183).
    expect(ziele("at module evaluation (probe/probeIcons.ts:1:1)"))
      .toEqual(["probe/probeIcons.ts:1"]);
    expect(ziele("probe/probeBoot.test.ts:60:9999 meldet tsc"))
      .toEqual(["probe/probeBoot.test.ts:60"]);

    // Kein Anker: eine Datei ohne Zeile, und eine Zeit (nur Ziffern vor dem
    // Doppelpunkt — die eine Einschraenkung, die die Regex noch selbst trifft).
    expect(ziele("`probe/theme/probeTheme.ts` traegt die Dichten")).toEqual([]);
    expect(ziele("um 12:30 gemessen")).toEqual([]);
  });

  /**
   * UND DER RIEGEL DAGEGEN, dass jemand die Beispiele wieder auf echte Namen
   * umschreibt: kein Ziel aus dieser Datei darf sich aufloesen lassen. Die drei
   * absichtlichen echten Pfade in den `aufloesen`-Faellen tragen keine
   * Zeilennummer und sind damit gar keine Anker.
   *
   * ⚠️ DER FALL HAT SICH BEIM EINBAU SOFORT BEZAHLT GEMACHT: er fand zwei
   * weitere Stellen derselben Art, beide in einem BEGRUENDUNGSTEXT weiter oben.
   */
  /**
   * ⚠️ GEPRUEFT WERDEN BEIDE DATEIEN DES PAARES, und das ist seit DRK-204 der
   * ganze Punkt: der Schnitt hat die Haelfte der Beispiele nach
   * `kommentaranker.ts` mitgenommen. Bliebe hier nur die Testdatei stehen,
   * faenge der Fall ab sofort die kleinere Haelfte — still, denn gruen ist er
   * so oder so. Genau die Bauform, gegen die dieses Paar antritt.
   */
  it("kein Beispiel in diesem Paar zeigt auf eine echte Datei", () => {
    const paar = ["src/core/kommentaranker.ts", "src/core/kommentaranker.test.ts"];
    const treffer = paar.flatMap((eigen) =>
      readFileSync(eigen, "utf8")
        .split("\n")
        .flatMap((zeile, i) =>
          ankerAusText(zeile)
            .filter((a) => aufloesen(eigen, a.ziel) !== null)
            .map((a) => `${eigen}:${i + 1} → ${a.ziel}:${a.bis}`)));

    expect(
      treffer,
      "Ein Beispiel in dieser Datei nennt einen ECHTEN Pfad mit einer erfundenen "
        + "Zeilennummer. Der Scan liest beide Dateien mit — sobald jenes Ziel "
        + "kuerzer wird, faerbt das Beispiel den Riegel rot, ohne ueber den "
        + "Inhalt der Datei etwas zu behaupten. Erfundene Pfade nehmen "
        + "(`probe…`), siehe den Fall darueber.",
    ).toEqual([]);
  });
});
