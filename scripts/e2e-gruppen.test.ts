import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * DIE E2E-GRUPPEN — und der Waechter, ohne den sie still verrutschen.
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 *
 * Bis DRK-358 teilte die CI die e2e-Suite mit `playwright test --shard=n/5`
 * auf. Playwright teilt dabei nach FALLZAHL, nicht nach Modul: welche
 * Spec-Dateien zusammen in einem Shard landen, ergibt sich aus Dateireihenfolge
 * und Testzahl — also aus etwas, das jeder neue Test verschiebt.
 *
 * Das ist nicht egal, weil EIN `next dev` den ganzen Shard bedient und sein
 * Speicher mit der Zahl der uebersetzten Routen waechst, ohne je zurueckzufallen
 * (so auch in `node_modules/next/dist/docs/01-app/02-guides/memory-usage.md`
 * ausgeschrieben). Die Aufteilung wurde am 2026-08-28 einmal richtig gewaehlt —
 * bei damals 211 Faellen trennte `n/5` die Module sauber, der schwerste Shard
 * trug NUR lagerbuch. Bei 356 Faellen trug Shard 4 dann acht Dateien aus vier
 * Modulen, und der Runner starb.
 *
 * GEMESSEN (DRK-358), gleicher Commit, gleicher kalter `.next`:
 *
 *   `radio-hosts` + `radio-kiosk` ALLEIN   ->  4 258 MB Spitze, alle 12 gruen
 *   dieselben Faelle als Teil von Shard 4  -> 12 768 MB Spitze, der Shard stirbt
 *
 * Faktor 3, und der Fall, der im Verbund rot war, ist allein gruen. Der
 * Speicher haengt an der SUMME der Modulflaechen im Shard, nicht an einem Fall.
 *
 * ⛔ ZWEI NAHELIEGENDE ABHILFEN SIND GEMESSEN UND VERWORFEN:
 *   * `turbopackMemoryEviction: "full"` — die Spitze blieb (12 203 MB gegen
 *     12 074 MB). Eviction gibt frei, was schon auf der Platte liegt; sie
 *     verhindert die Allokation WAEHREND der Uebersetzung nicht.
 *   * `turbopackFileSystemCacheForDev: false` — schon frueher probiert
 *     (`fb9fe44e`, zurueckgenommen in `63b5b820`): ohne Platte bleibt alles im
 *     Speicher, der Shard starb dann frueher statt spaeter.
 *
 * Bleibt die Routenflaeche je Server. Sie schrumpft nur ueber die Aufteilung —
 * und die ist seit DRK-358 EXPLIZIT (`e2e/gruppen.json`) statt aus der Fallzahl
 * abgeleitet. Eine Gruppe je Modul heisst: eine Zusage, keine Nebenwirkung.
 *
 * ── WARUM LAGERBUCH DREI GRUPPEN HAT (DRK-407) ────────────────────────────
 *
 * „Eine Gruppe je Modul" war die Regel von DRK-358, nicht ihr Zweck. Der Zweck
 * ist die Routenflaeche je Server — und ein Modul darf dafuer auch MEHRERE
 * Gruppen haben, solange keine Gruppe zwei Module mischt. Genau das war noetig:
 *
 *   Lauf 35187192289, dieselbe CI, Gruppe fuer Gruppe gemessen:
 *     lagerbuch        14:17   (185 Faelle, 32 Dateien)   ← 65 % des Laufs
 *     aufgaben          9:10
 *     files-feedback    5:03
 *     suite-huelle      4:18
 *     suite-verwaltung  4:04
 *     radio             3:22
 *     uav-zeichen       1:22
 *
 * Sechs Runner standen neun bis dreizehn Minuten still, waehrend lagerbuch
 * seriell durchlief. Die Aufteilung ist nach FALLZAHL je Datei ausbalanciert
 * (66/66/64) — grob, aber der einzige Massstab, den ein Dot-Reporter hergibt.
 *
 * ⚠️ DIE NUMMERN SIND EIMER, KEINE BEDEUTUNG. `lagerbuch-2` ist nicht „die
 * Verwaltung", sondern „der zweite Eimer". Wer eine neue lagerbuch-Spec
 * anlegt, traegt sie in den KLEINSTEN ein; welcher das ist, sagt die Fallzahl,
 * nicht der Name. Der Waechter unten wird rot, solange sie in keinem steht —
 * still verschwinden kann sie nicht.
 *
 * ⛔ UND NICHT ZURUECK ZU `--shard`: das teilt wieder nach Fallzahl ueber ALLE
 * Module und bringt genau den Speicherausfall zurueck, den DRK-358 oben misst.
 * Die letzte Zusicherung dieser Datei haelt das fest.
 *
 * `aufgaben` bleibt mit 9:10 ungeteilt und ist damit der neue Engpass. Das ist
 * kein Versehen: die 43 seiner 48 Faelle stehen in EINER Datei, und die traegt
 * Zustand ueber Testgrenzen hinweg (der Nachweis-Pfad aus dem Upload-Fall wird
 * von spaeteren Faellen gelesen). Sie zu zerlegen ist echte Arbeit mit echtem
 * Flakiness-Risiko und steht als eigenes Ticket auf dem Board.
 *
 * ── WAS DIESER TEST HAELT ─────────────────────────────────────────────────
 *
 * Der Preis der expliziten Liste ist die vergessene Zeile: eine neue
 * Spec-Datei, die in keiner Gruppe steht, liefe in der CI NIE — und zwar
 * still, denn ein nicht ausgefuehrter Test ist gruen wie ein bestandener.
 * Genau das faengt dieser Waechter, in derselben Bauform, mit der
 * `bootstrap.test.ts` das Migrations-Dreieck und `register.test.ts` das
 * Notizregister absichern: Verzeichnis lesen, gegen die Liste halten.
 */

const WURZEL = process.cwd();
const E2E = join(WURZEL, "e2e");

type Gruppe = { name: string; specs: string };

const gruppen = JSON.parse(
  readFileSync(join(E2E, "gruppen.json"), "utf8"),
) as Gruppe[];

/**
 * Das `testIgnore`-Muster aus `playwright.config.ts`, WOERTLICH uebernommen.
 *
 * Dateien, die es trifft, laesst Playwright ohnehin aus; sie duerfen in KEINER
 * Gruppe stehen — ein Job, der sie nennt, liefe gegen eine leere Auswahl und
 * meldete das nicht.
 *
 * Die Quelle ist die Konfiguration selbst, nicht eine zweite Liste hier:
 * sonst laufen die beiden auseinander, sobald jemand dort etwas ergaenzt.
 */
const ausgelassenRx = (() => {
  const cfg = readFileSync(join(WURZEL, "playwright.config.ts"), "utf8");
  const zeile = /testIgnore:\s*\/((?:[^/\\]|\\.)+)\/([gimsuy]*)/.exec(cfg);
  if (!zeile) throw new Error("testIgnore in playwright.config.ts nicht gefunden");
  return new RegExp(zeile[1], zeile[2]);
})();

/**
 * ⚠️ GEPRUEFT WIRD DER GANZE PFAD, nicht der blosse Dateiname. Das
 * `testIgnore`-Muster ist UNVERANKERT und trifft damit auch
 * `legacy/pwa-spike.spec.ts`. Wer es auf Basisnamen herunterrechnet, dreht die
 * Wirkung um: Playwright liesse die verschachtelte Datei aus, der Waechter
 * verlangte sie aber in einer Gruppe — und sobald jemand sie dort eintraegt,
 * ist der Waechter gruen, waehrend der Job sie nie faehrt.
 */
const wirdAusgelassen = (datei: string) => ausgelassenRx.test(datei);

/**
 * `foo-*.spec.ts` -> ein Regex, das genau diese Namen trifft.
 *
 * ⚠️ JEDES Sonderzeichen wird escaped, nicht nur der Punkt. Ein `.replace(/[.]/…)`
 * allein liesse `\`, `+`, `(`, `[` … als Regex-Bedeutung stehen: aus einem
 * Dateinamen wuerde ein Muster, das zu viel oder gar nichts trifft, und bei einer
 * unpaarigen Klammer wirft `new RegExp` erst zur Laufzeit. CodeQL nennt das
 * „Incomplete string escaping or encoding" (Alarm 7 auf diesem Zweig).
 *
 * Geteilt wird deshalb AM STERN, jedes Stueck einzeln escaped, dann wieder
 * zusammengesetzt — so kann kein escapetes Zeichen nachtraeglich wieder zur
 * Bedeutung werden (was ein zweites `.replace` auf dem fertigen Muster taete).
 */
function globZuRegex(datei: string): RegExp {
  const stuecke = datei.split("*").map((s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
  // `[^/]*` und nicht `.*`: ein Stern steht fuer einen Namensteil, nicht fuer
  // einen Pfad. Sonst zoege `lagerbuch-*.spec.ts` eine Datei aus einem
  // Unterverzeichnis mit ein, ohne dass jemand das so gemeint hat.
  return new RegExp(`^${stuecke.join("[^/]*")}$`);
}

/**
 * Playwrights Vorgabe fuer `testMatch`, nachgebaut:
 * `**\/*.@(spec|test).?(c|m)[jt]s?(x)`.
 *
 * ⚠️ NICHT `.endsWith(".spec.ts")`. `playwright.config.ts` setzt kein
 * `testMatch`, es gilt also die Vorgabe — und die nimmt auch `foo.test.ts`,
 * `foo.spec.js`, `foo.spec.tsx`, `foo.test.mjs`. Gemessen: eine
 * `e2e/probe.test.ts` hebt den vollen Lauf von 47 auf 48 Dateien.
 * Wer hier enger filtert als Playwright, baut genau die Luecke ein, die dieser
 * Waechter schliessen soll.
 */
const SPEC_MUSTER = /\.(spec|test)\.[cm]?[jt]sx?$/;

/**
 * Alle Testdateien unter `e2e/`, REKURSIV und mit `/` als Trenner.
 *
 * ⚠️ `readdirSync` ohne `recursive` liest nur die direkten Kinder — Playwright
 * durchsucht `testDir` aber rekursiv. Die Luecke waere genau der Ausfall, den
 * dieser Waechter verhindern soll: eine Datei in einem Unterverzeichnis
 * stuende in keiner Gruppe, faende sich aber auch nicht in der Sollmenge, und
 * der Test bliebe GRUEN, waehrend die CI sie nie faehrt. `e2e/helpers/`
 * gibt es bereits, es fehlt also nur die erste Testdatei darin.
 */
function alleSpecs(): string[] {
  return readdirSync(E2E, { recursive: true })
    .map((d) => String(d).split(sep).join("/"))
    .filter((d) => SPEC_MUSTER.test(d));
}

/** `e2e/foo-*.spec.ts` -> die Dateinamen, die das Muster trifft. */
function loese(muster: string, vorhanden: string[]): string[] {
  return muster
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((m) => {
      const datei = m.replace(/^e2e\//, "");
      if (!datei.includes("*")) return [datei];
      const rx = globZuRegex(datei);
      return vorhanden.filter((d) => rx.test(d));
    });
}

/**
 * Die BEFEHLSZEILEN eines Workflows: YAML-Kommentare entfernt,
 * Zeilenfortsetzungen verbunden, Leeres weg.
 *
 * ⚠️ HIER STAND EIN MINI-YAML-PARSER, UND ER WAR DAS PROBLEM, NICHT DIE LOESUNG.
 *
 * Erst zerlegte der Waechter zeilenweise und uebersah die Zeilenfortsetzung
 * (`pnpm e2e \` / `--shard=1/5`). Dann zerlegte er `run:`-Bloecke — und uebersah
 * drei gueltige Blockskalar-Koepfe, gemessen: `| # Erklaerung`, `|2-`, `>2-`
 * liefen alle als „Wert in derselben Zeile" durch, womit der Blockinhalt nie
 * gelesen wurde. Zwei Runden, drei Luecken, beide Male von Codex gefunden.
 *
 * Die Lehre ist nicht „den Parser besser machen": jede Kopfform, die YAML
 * erlaubt und dieser Parser nicht kennt, ist eine weitere stille Luecke. Die
 * Klasse verschwindet erst, wenn gar kein Blockskalar mehr erkannt werden muss
 * — und das geht, weil `--shard` IMMER auf einer Befehlszeile steht, gleich in
 * welcher YAML-Verpackung sie steckt. Gefragt wird deshalb nur noch: traegt
 * diese Zeile `--shard`, und ruft sie `vitest`?
 *
 * Zwei Vorbereitungen braucht das, und beide sind noetig:
 *   * KOMMENTARE WEG, sonst faellt der Waechter ueber die eigene Begruendung —
 *     `ci.yml` erklaert an mehreren Stellen, warum `--shard` bei e2e verboten
 *     ist, und diese Saetze enthalten die Zeichenkette.
 *   * FORTSETZUNGEN VERBINDEN, sonst steht `--shard` auf einer Zeile ohne den
 *     Befehl, zu dem es gehoert — die erste der drei Luecken.
 *
 * Ein gefalteter Skalar (`>`), dessen Befehl ueber mehrere Zeilen OHNE
 * Rueckstrich laeuft, faellt damit auf; das ist Absicht (fail closed): die
 * Zusicherung wird laut, statt still durchzulassen.
 */
export function befehlszeilen(yaml: string): string[] {
  return yaml
    .split("\n")
    // ganze Kommentarzeile raus, Kommentar am Zeilenende abschneiden
    .map((z) => (/^\s*#/.test(z) ? "" : z.replace(/\s#.*$/, "")))
    .join("\n")
    // Zeilenfortsetzung: der Befehl geht auf der naechsten Zeile weiter
    .replace(/\\\n\s*/g, " ")
    .split("\n")
    /*
     * ⚠️ UND AN DEN SHELL-OPERATOREN TRENNEN — sonst haengt die Erlaubnis wieder
     * an der UMGEBUNG statt am Befehl. Dritter Codex-Befund derselben Familie,
     * nachgestellt: `pnpm vitest run && pnpm e2e --shard=1/5` steht auf EINER
     * Zeile, die Zeile enthaelt `vitest`, und der shardende e2e-Aufruf daneben
     * lief durch. `&&`, `||`, `;`, `|` und `&` trennen hier, was die Shell auch
     * trennt. `\|\|` steht VOR `\|`, sonst zerfiele es in zwei leere Stuecke.
     */
    .flatMap((z) => z.split(/\s*(?:&&|\|\||;|\||&)\s*/))
    .map((z) => z.trim())
    .filter(Boolean);
}

describe("e2e-Gruppen — die Aufteilung, an der ein stiller CI-Ausfall haengt", () => {
  const alle = alleSpecs();
  const erwartet = alle.filter((d) => !wirdAusgelassen(d));
  const aufgeloest = gruppen.flatMap((g) => loese(g.specs, alle));

  it("kennt ueberhaupt Gruppen, und jede hat einen Namen und ein Muster", () => {
    expect(gruppen.length).toBeGreaterThan(0);
    for (const g of gruppen) {
      expect(g.name, JSON.stringify(g)).toMatch(/^[a-z0-9-]+$/);
      expect(g.specs.trim(), g.name).not.toBe("");
    }
  });

  it("die Gruppennamen sind eindeutig — `upload-artifact` weist den zweiten gleichen Namen mit HTTP 409 ab", () => {
    expect([...new Set(gruppen.map((g) => g.name))]).toHaveLength(gruppen.length);
  });

  it("JEDE Spec-Datei steht in genau einer Gruppe", () => {
    // Die eigentliche Zusicherung. Eine fehlende Datei laeuft in der CI nie und
    // ist trotzdem gruen; eine doppelte laeuft zweimal und kostet nur Zeit.
    expect([...aufgeloest].sort()).toEqual([...erwartet].sort());
  });

  it("das Sternchen-Muster nimmt jedes Sonderzeichen woertlich", () => {
    // Die Gegenprobe zum CodeQL-Fund: nur den Punkt zu escapen liess `\`, `+`,
    // `(` … ihre Regex-Bedeutung behalten. Heute gaebe es im Verzeichnis keinen
    // solchen Namen — aber der Waechter soll nicht davon abhaengen, dass das so
    // bleibt, und bei einer unpaarigen Klammer wuerfe `new RegExp` erst zur
    // Laufzeit.
    expect(globZuRegex("a+b.spec.ts").test("a+b.spec.ts")).toBe(true);
    expect(globZuRegex("a+b.spec.ts").test("aab.spec.ts")).toBe(false);
    expect(globZuRegex("a.b.spec.ts").test("axb.spec.ts")).toBe(false);
    expect(globZuRegex("x(y).spec.ts").test("x(y).spec.ts")).toBe(true);
    expect(() => globZuRegex("x(y.spec.ts")).not.toThrow();
    expect(globZuRegex("a\\b.spec.ts").test("a\\b.spec.ts")).toBe(true);
    // und der Stern tut weiter, wozu er da ist
    expect(globZuRegex("lagerbuch-*.spec.ts").test("lagerbuch-mobil.spec.ts")).toBe(true);
    expect(globZuRegex("lagerbuch-*.spec.ts").test("radio-mobil.spec.ts")).toBe(false);
    // aber er ueberschreitet KEINE Verzeichnisgrenze
    expect(globZuRegex("lagerbuch-*.spec.ts").test("lagerbuch-a/b.spec.ts")).toBe(false);
  });

  it("die Sollmenge wird REKURSIV gelesen — wie Playwright `testDir` durchsucht", () => {
    // Playwright durchsucht `testDir` rekursiv. Liest der Waechter nur die
    // direkten Kinder, faellt eine Spec-Datei aus einem Unterverzeichnis aus
    // BEIDEN Mengen — sie steht in keiner Gruppe, fehlt aber auch in der
    // Sollmenge, und der Test bleibt gruen, waehrend die CI sie nie faehrt.
    // `e2e/helpers/` gibt es schon; es fehlt nur die erste Datei darin.
    //
    // ⛔ HIER STAND EINE FESTE ZAHL (`toHaveLength(47)`), UND DAS WAR FALSCH.
    // Sie sollte den Verlust einer Datei zu einer benannten Groesse machen,
    // riss aber bei JEDEM PR, der eine Spec ERGAENZT — zuerst bei DRK-297, wo
    // die Gruppierung nachweislich stimmte und nur die Zahl nicht mehr passte.
    // Ein Tor, das bei richtiger Arbeit rot wird, erzieht zum Hochzaehlen ohne
    // Hinsehen — und genau dieser Griff laesst die echte Abweichung durch.
    // Was wirklich traegt, ist die Mengengleichheit oben; die braucht keine
    // zweite Zahl daneben.
    const flach = readdirSync(E2E).filter((d) => SPEC_MUSTER.test(String(d)));
    expect(alleSpecs()).toEqual(expect.arrayContaining(flach));
    expect(alleSpecs().length).toBeGreaterThanOrEqual(flach.length);
  });

  it("`testIgnore` wird auf den GANZEN Pfad angewandt, nicht auf den Basisnamen", () => {
    // Das Muster in `playwright.config.ts` ist unverankert und trifft deshalb
    // auch eine verschachtelte Datei. Wer es auf Basisnamen herunterrechnet,
    // dreht die Wirkung um: Playwright liesse `legacy/pwa-spike.spec.ts` aus,
    // der Waechter verlangte sie aber in einer Gruppe — und sobald jemand sie
    // dort eintraegt, ist der Waechter gruen, waehrend der Job sie nie faehrt.
    expect(wirdAusgelassen("pwa-spike.spec.ts")).toBe(true);
    expect(wirdAusgelassen("legacy/pwa-spike.spec.ts")).toBe(true);
    expect(wirdAusgelassen("zeichen-pwa.spec.ts")).toBe(true);
    expect(wirdAusgelassen("tief/verschachtelt/zeichen-pwa.spec.ts")).toBe(true);
    expect(wirdAusgelassen("lagerbuch-mobil.spec.ts")).toBe(false);
    expect(wirdAusgelassen("radio-kiosk.spec.ts")).toBe(false);
  });

  it("die Sollmenge folgt Playwrights `testMatch`, nicht nur `.spec.ts`", () => {
    // `playwright.config.ts` setzt kein `testMatch`, es gilt die Vorgabe
    // `**/*.@(spec|test).?(c|m)[jt]s?(x)`. Ein enger Filter hier hiesse: eine
    // `foo.test.ts` liefe in der CI nie und fehlte zugleich in der Sollmenge —
    // der Waechter bliebe gruen. Gemessen: eine `e2e/probe.test.ts` hebt den
    // vollen Lauf von 47 auf 48 Dateien.
    for (const d of [
      "a.spec.ts", "a.test.ts", "a.spec.tsx", "a.test.tsx",
      "a.spec.js", "a.test.js", "a.spec.mjs", "a.spec.cts",
      "unter/b.test.ts",
    ]) {
      expect(SPEC_MUSTER.test(d), d).toBe(true);
    }
    for (const d of ["helpers/lagerbuch.ts", "gruppen.json", "a.spec.txt", "spec.ts", "fixtures.ts"]) {
      expect(SPEC_MUSTER.test(d), d).toBe(false);
    }
  });

  it("kein Muster trifft ins Leere", () => {
    // Ein Tippfehler (`e2e/radio.spec.ts` statt `e2e/radio-*.spec.ts`) faellt
    // sonst erst auf, wenn jemand die Trefferzahl im CI-Protokoll nachzaehlt.
    for (const g of gruppen) {
      expect(loese(g.specs, alle), `Gruppe ${g.name} trifft keine Datei`).not.toHaveLength(0);
    }
  });

  it("keine Gruppe nennt eine Datei, die `testIgnore` ohnehin auslaesst", () => {
    for (const g of gruppen) {
      for (const d of loese(g.specs, alle)) {
        expect(wirdAusgelassen(d), `${g.name} nennt die ausgelassene ${d}`).toBe(false);
      }
    }
  });

  it("die CI faehrt die Gruppen aus DIESER Datei — nicht aus einer zweiten Liste", () => {
    // Das dritte Glied des Dreiecks: gruppen.json <-> Waechter <-> Workflow.
    // Ohne diese Zusicherung koennte die Datei richtig sein und die CI trotzdem
    // nach Fallzahl teilen.
    const ci = readFileSync(join(WURZEL, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("e2e/gruppen.json");

    /*
     * ⚠️ NUR `vitest` DARF SHARDEN — die Frage ist bewusst UMGEDREHT.
     *
     * Bis DRK-412 stand hier `expect(ci).not.toMatch(/--shard=\$\{\{\s*matrix/)`:
     * ein Verbot der Matrix-Form irgendwo in der Datei. Das traf auch den
     * Vitest-Job, der zu Recht shardet — dort gibt es keinen Dev-Server, dessen
     * Speicher mit der Routenflaeche waechst, und jeder Shard ist ein eigener
     * Runner. Die Begruendung von DRK-358 gilt fuer e2e, nicht fuer jeden Aufruf
     * mit demselben Flag.
     *
     * ⛔ DER ERSTE ERSATZ WAR EINE ZEILENPRUEFUNG AUF `pnpm e2e`, UND DER WAR
     * LOECHRIG — Codex-Befund P2 auf diesem PR, nachgestellt und bestaetigt.
     * Bei einer Zeilenfortsetzung im `run: |`-Block
     *
     *     - run: |
     *         pnpm e2e \
     *           --shard=1/5
     *
     * traegt die Zeile mit `pnpm e2e` kein `--shard`, und die Zeile mit
     * `--shard` kein `pnpm e2e`. Der Waechter blieb gruen, waehrend e2e wieder
     * shardete. Bitter daran: GENAU DIESE FORM HAETTE DER ALTE GEFANGEN, weil er
     * die ganze Datei las. Eine Verschaerfung in einer Richtung war eine
     * Schwaechung in der anderen.
     *
     * ⛔ DER ZWEITE VERSUCH (`run`-Bloecke statt Zeilen) WAR EBENFALLS LOECHRIG,
     * und zwar doppelt — beide Male Codex, beide Male nachgemessen:
     *   * drei gueltige Blockskalar-Koepfe (`| # Erklaerung`, `|2-`, `>2-`)
     *     hielt er fuer einen Wert in derselben Zeile und las den Inhalt nie;
     *   * `block.includes("vitest")` liess jeden Block durch, in dem das Wort
     *     IRGENDWO stand — ein Kommentar „der vitest-Job macht das anders" ueber
     *     einem shardenden e2e-Aufruf reichte.
     * Die Begruendung, warum daraus `befehlszeilen()` wurde statt eines dritten
     * Parser-Anlaufs, steht an jener Funktion.
     *
     * Umgedreht wird die Frage, weil die Positivliste den kuenftigen Fall
     * miterschlaegt: nicht „e2e darf nicht sharden" (dann muss jeder neue
     * Sharder einzeln verboten werden), sondern „wer shardet, muss `vitest`
     * sein". Ein dritter Job, der es morgen versucht, faellt damit auf, ohne
     * dass jemand diesen Test anfasst.
     *
     * ⚠️ GEFRAGT WIRD DIE ZEILE MIT DEM FLAG, nicht ihre Umgebung: `--shard`
     * gehoert zu dem Befehl, auf dem es steht, und nur der muss `vitest` rufen.
     */
    const zeilen = befehlszeilen(ci);

    expect(
      zeilen.some((z) => z.includes("pnpm e2e") || z.includes("playwright test")),
      "kein e2e-Aufruf im Workflow gefunden",
    ).toBe(true);

    for (const zeile of zeilen) {
      if (!zeile.includes("--shard")) continue;
      expect(
        /\bvitest\b/.test(zeile),
        `nur vitest darf sharden, diese Befehlszeile tut es auch: ${zeile}`,
      ).toBe(true);
    }
  });

  it("die Zerlegung haelt JEDE Form fest, die uns schon einmal gekostet hat", () => {
    // Drei Luecken in zwei Runden, alle von Codex gefunden. Ohne diese Faelle
    // faellt die Zerlegung still auf ein Verhalten zurueck, das eine davon hatte.
    const shardet = (yaml: string) => befehlszeilen(yaml).filter((z) => z.includes("--shard"));
    const erlaubt = (yaml: string) => shardet(yaml).every((z) => /\bvitest\b/.test(z));

    // 1. Runde: die Zeilenfortsetzung, an der die Zeilenpruefung scheiterte.
    expect(erlaubt("      - run: |\n          pnpm e2e \\\n            --shard=1/5")).toBe(false);

    // 2. Runde, Teil a: Blockskalar-Koepfe, die der Mini-Parser nicht kannte.
    for (const kopf of ["| # warum auch immer", "|2-", ">2-", "|-2", "|"]) {
      expect(
        erlaubt(`      - run: ${kopf}\n          pnpm e2e \\\n            --shard=1/5`),
        `Kopf ${kopf} laesst e2e sharden`,
      ).toBe(false);
    }

    // 2. Runde, Teil b: `vitest` im Kommentar ueber einem shardenden e2e-Aufruf.
    expect(erlaubt("      - run: |\n          # der vitest-Job macht das anders\n          pnpm e2e --shard=1/5")).toBe(false);

    // 3. Runde: zwei Befehle auf EINER Zeile — `vitest` links, das Verbotene rechts.
    expect(erlaubt("      - run: pnpm vitest run && pnpm e2e --shard=1/5")).toBe(false);
    expect(erlaubt("      - run: pnpm vitest run ; pnpm e2e --shard=1/5")).toBe(false);
    expect(erlaubt("      - run: pnpm vitest run || pnpm e2e --shard=1/5")).toBe(false);
    expect(erlaubt("      - run: pnpm e2e --shard=1/5 | tee lauf.log")).toBe(false);

    // Gegenprobe nach oben: der echte Vitest-Aufruf bleibt erlaubt …
    expect(erlaubt("      - run: pnpm vitest run --shard=${{ matrix.shard }}/3")).toBe(true);
    // … und die eigene Begruendung in `ci.yml` faellt nicht ueber sich selbst.
    expect(erlaubt("  # ⚠️ `--shard` ist hier richtig und bei e2e verboten")).toBe(true);
    expect(befehlszeilen("  # nur ein Kommentar")).toEqual([]);
  });
});
