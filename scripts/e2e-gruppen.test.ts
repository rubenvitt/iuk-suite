import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join, sep } from "node:path";

/**
 * DIE E2E-GRUPPEN — und der Waechter, ohne den sie still verrutschen.
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 *
 * Bis DRK-358 teilte die CI die e2e-Suite mit `playwright test --shard=n/5`
 * auf. Playwright teilt dabei nach FALLZAHL, nicht nach Laufzeit und nicht
 * nach Modul: welche Spec-Dateien zusammen in einem Shard landen, ergibt sich
 * aus Dateireihenfolge und Testzahl — also aus etwas, das jeder neue Test
 * verschiebt, und zwar still. Seit DRK-358 ist die Aufteilung deshalb EXPLIZIT
 * (`e2e/gruppen.json`): eine Zusage, keine Nebenwirkung.
 *
 * ── DER STAND: NACH LAUFZEIT GESCHNITTEN (DRK-484) ────────────────────────
 *
 * Bis DRK-415 fuhr jede Gruppe gegen ein eigenes `next dev`, und dessen
 * Speicher wuchs mit jeder uebersetzten Route (Geschichte unten). Das war der
 * EINZIGE Grund fuer „eine Gruppe je Modul". Seit DRK-415 laedt jede Gruppe
 * einen vorgebauten Stand und faehrt `next start`; gemessen (lokal, 4 Kerne,
 * RSS des `next-server` alle 5 s) lief die GANZE Suite am Stueck auf EINEM
 * Server mit 485 MB Spitze, 520 Faelle. Der Speichergrund ist damit weg.
 *
 * ⚠️ GEBLIEBEN IST DER GETEILTE ZUSTAND JE RUNNER: `workers: 1`, ein Fake-clamd,
 * ein `.data/e2e` je Gruppe (Kommentar am Job `e2e` in `ci.yml`). Eine Datei
 * liegt deshalb immer GANZ in einer Gruppe, und innerhalb der Gruppe faehrt
 * Playwright die Dateien nach NAMEN sortiert (`localeCompare`, also
 * `aufgaben-anleitung` vor `aufgaben`) — gleich, in welcher Reihenfolge `specs`
 * sie nennt. Die Listen stehen in dieser Sortierung. Ausnahme: eine Datei, die
 * per `test.use` einen eigenen Worker verlangt (`einsatzbuch-reader`, Kanal und
 * Startoptionen), laeuft NACH den anderen ihrer Gruppe (Lauf 1417).
 *
 * DER SCHNITT VOM 2026-09-27: acht Eimer zu je rund 170 s Testzeit statt elf
 * Modulgruppen mit 24 bis 182 s. Gemessen an sieben gruenen main-Laeufen gegen
 * `next start` (1393 bis 1417), je Datei die Zeit von Protokollzeile zu
 * Protokollzeile des `list`-Reporters, gemittelt. Acht ist die kleinste Zahl,
 * bei der die langsamste Gruppe nicht laenger laeuft als vorher (sieben
 * hiessen ~193 s); jeder Runner weniger spart ~50 s Einrichtung. Die
 * Rechnung steht am Job `e2e` in `.github/workflows/ci.yml`.
 *
 * ⚠️ DIE NAMEN SIND EIMER, KEINE BEDEUTUNG. `eimer-3` ist nicht „files",
 * sondern der dritte Eimer. Wer eine neue Spec anlegt, traegt sie in den mit
 * der KLEINSTEN Testzeit im letzten gruenen Lauf ein — nicht nach Fallzahl
 * (eine Datei braucht 0,4 s, eine andere 127 s), nicht nach Name, nicht nach
 * Modul. Der Waechter unten wird rot, solange sie in keinem steht; still
 * verschwinden kann sie nicht.
 *
 * ⚠️ UNTER `next start` DARF MAN DATEIZEITEN ADDIEREN, unter `next dev` durfte
 * man es nicht (DRK-408, unten): dort gehoerte die Erstuebersetzung einer
 * Route dem ersten Fall der GRUPPE, der sie traf, und dieselbe unveraenderte
 * Gruppe streute ueber drei Laeufe um 78 s. Gegen `next start` liegt die
 * Spanne je Gruppe ueber sieben Laeufe bei 3 bis 32 s (ein Ausreisser 62 s) —
 * einen Kandidaten-Schnitt MEHRFACH zu fahren, bevor man ihm glaubt, bleibt
 * trotzdem die billigere Wahl.
 *
 * ⛔ UND NICHT ZURUECK ZU `--shard`, auch ohne Speichergrund: es teilte wieder
 * nach Fallzahl und nach einer Zuordnung, die jeder neue Test verschiebt. Die
 * letzte Zusicherung dieser Datei haelt das fest.
 *
 * ── GESCHICHTE: WARUM ES UNTER `next dev` JE MODUL SEIN MUSSTE ────────────
 *
 * Nur noch Geschichte fuer die CI — lokal faehrt `pnpm e2e` weiterhin gegen
 * `next dev`, und wer dort die ganze Suite am Stueck faehrt, trifft auf
 * dasselbe.
 *
 * DRK-358: EIN `next dev` bediente den ganzen Shard, und sein Speicher wuchs
 * mit der Zahl der uebersetzten Routen, ohne je zurueckzufallen
 * (`node_modules/next/dist/docs/01-app/02-guides/memory-usage.md`). Bei 211
 * Faellen trennte `n/5` die Module noch sauber, bei 356 trug Shard 4 acht
 * Dateien aus vier Modulen, und der Runner starb. Gleicher Commit, gleicher
 * kalter `.next`:
 *
 *   `radio-hosts` + `radio-kiosk` ALLEIN   ->  4 258 MB Spitze, alle 12 gruen
 *   dieselben Faelle als Teil von Shard 4  -> 12 768 MB Spitze, der Shard stirbt
 *
 * ⛔ GEMESSEN UND VERWORFEN, falls es lokal wieder auftaucht:
 *   * `turbopackMemoryEviction: "full"` — die Spitze blieb (12 203 MB gegen
 *     12 074 MB). Eviction gibt frei, was schon auf der Platte liegt; sie
 *     verhindert die Allokation WAEHREND der Uebersetzung nicht.
 *   * `turbopackFileSystemCacheForDev: false` — zweimal probiert (`fb9fe44e`,
 *     zurueckgenommen in `63b5b820`; noch einmal am 2026-09-22): es nahm die
 *     Turbopack-Panik beim Zurueckholen aus dem Plattencache weg, aber der
 *     Runner starb trotzdem, einmal frueher. Die Panik war ein Symptom des
 *     Speichers, nicht seine Ursache.
 *
 * DRK-407, DRK-408, 2026-09-22: aus demselben Grund bekamen lagerbuch (erst
 * drei, dann vier) und aufgaben (zwei) mehrere Gruppen, geschnitten nach
 * ROUTENFLAECHE und nie modulgemischt. Die Lehre, die davon bleibt: ein Schnitt
 * nach Fallzahl ist keiner (DRK-407 balancierte 66/66/64 Faelle und bekam
 * 4:42 / 8:15 / 4:59), und seit DRK-408 laeuft die CI mit `reporter: "list"`,
 * damit jede Zeile die Dauer ihres Falls nennt.
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
 * DER e2e-AUFRUF, WOERTLICH. Jede Abweichung ist ein roter Test.
 *
 * ⚠️ HIER STAND VIER RUNDEN LANG EIN TEXTSCANNER, UND DAS WAR DER FEHLER.
 *
 * Die Aufgabe klingt einfach: „e2e darf nicht `--shard` tragen". Sie gegen den
 * TEXT des Workflows zu pruefen, hat vier echte Luecken gekostet, alle von
 * einem Review gefunden und keine von einem Tor:
 *
 *   1. zeilenweise  -> Zeilenfortsetzung (`pnpm e2e \` / `--shard=1/5`)
 *   2. `run`-Bloecke -> drei gueltige Blockskalar-Koepfe (`| # …`, `|2-`, `>2-`)
 *   3.               -> `vitest` irgendwo im Block reichte als Erlaubnis
 *   4. Befehlszeilen -> `#` in Shell-Anfuehrungszeichen ist DATEN, kein Kommentar
 *
 * Jede Fassung war lesbar und plausibel; jede war luecken­haft. Der Grund ist
 * strukturell: YAML und Shell haben zusammen mehr Schreibweisen, als ein Test
 * nachbauen kann, und jede nicht nachgebaute ist eine STILLE Luecke — der
 * Waechter bleibt gruen, waehrend e2e shardet.
 *
 * Deshalb wird nicht mehr interpretiert, sondern VERGLICHEN. Es gibt genau
 * einen e2e-Aufruf in diesem Workflow; er steht hier woertlich. Jede Aenderung
 * daran — `--shard` in jeder Verpackung, ein zweiter Aufruf, ein Umbau der
 * Zeile — macht den Test rot, ohne dass er YAML oder Shell verstehen muesste.
 *
 * ⚠️ DAS IST ABSICHTLICH STRENG: auch eine harmlose Aenderung (ein Reporter,
 * ein Flag) faellt auf. Wer sie vornimmt, zieht diese Zeile mit nach — und
 * entscheidet dabei bewusst, dass kein `--shard` dabei ist. Genau diese
 * bewusste Entscheidung ist der Zweck.
 *
 * ⛔ WAS HIER NICHT MEHR STEHT, und warum das kein Verlust ist: die Regel „nur
 * `vitest` darf sharden" war eleganter und loeste ein Problem, das es nicht
 * gibt. Falsch ist Sharding allein bei e2e, weil es dort die explizite, nach
 * Laufzeit geschnittene Zuordnung ersetzte (oben). Ein anderer Job, der
 * shardet, ist harmlos; ihn mitzuverbieten hat den Waechter angreifbar
 * gemacht, ohne etwas zu schuetzen.
 */
const E2E_AUFRUF = "      - run: pnpm e2e ${{ matrix.gruppe.specs }}";

/**
 * Die EINZIGE Zeile, auf der `--shard` ueberhaupt stehen darf.
 *
 * ⚠️ DER ZWEITE PIN, UND ER TRAEGT MEHR ALS DER ERSTE. Der Vergleich oben haelt
 * den e2e-Aufruf fest, kennt aber nur dessen Schreibweise — ein FUENFTER
 * Codex-Befund hat gezeigt, dass `pnpm run e2e --shard=1/5` als zusaetzlicher
 * Schritt daneben durchginge, weil dort weder `pnpm e2e` noch `playwright test`
 * woertlich vorkommt. Und `npx playwright test`, `pnpm exec playwright test`,
 * `npm run e2e` … waeren die naechsten.
 *
 * Diese Zusicherung modelliert deshalb GAR KEINE Befehle mehr. Sie fragt nur:
 * steht `--shard` irgendwo ausserhalb von Kommentarzeilen und ausserhalb dieser
 * einen Zeile? Damit ist es gleichgueltig, WIE jemand e2e aufruft — kein
 * Aufruf, in welcher Schreibweise auch immer, kann das Flag tragen, ohne dass
 * der Test rot wird.
 *
 * Gestrichen werden nur Zeilen, deren erstes Zeichen `#` ist (nach Einrueckung)
 * — das trifft YAML-Kommentare und ganze Shell-Kommentarzeilen gleichermassen,
 * und beides eindeutig. Ein Kommentar am ZEILENENDE wird bewusst NICHT
 * abgeschnitten: dort war die vierte Luecke (`#` in Anfuehrungszeichen ist
 * Daten). Faellt jemand darueber, wird der Test rot statt still gruen — fail
 * closed, und die Meldung sagt, was zu tun ist.
 */
const VITEST_AUFRUF = "      - run: pnpm vitest run --shard=${{ matrix.shard }}/3";

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
    expect(wirdAusgelassen("rueckmeldung.spec.ts")).toBe(true);
    expect(wirdAusgelassen("tief/verschachtelt/rueckmeldung.spec.ts")).toBe(true);
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
     * ⚠️ VERGLICHEN, NICHT INTERPRETIERT — die Begruendung steht an `E2E_AUFRUF`.
     * Kurz: vier Anlaeufe, den Text zu verstehen, hatten vier stille Luecken;
     * ein woertlicher Vergleich hat keine, weil er nichts verstehen muss.
     *
     * Gefiltert wird ueber ALLE Zeilen, damit auch ein ZWEITER e2e-Aufruf
     * auffaellt — der koennte sonst irgendwo shardend danebenstehen, waehrend
     * der erste unveraendert bleibt.
     */
    const aufrufe = ci
      .split("\n")
      .filter((zeile) => zeile.includes("pnpm e2e") || zeile.includes("playwright test"));

    expect(
      aufrufe,
      "der e2e-Aufruf in ci.yml weicht vom erwarteten Wortlaut ab — wenn das Absicht ist, " +
        "ziehe E2E_AUFRUF mit nach UND pruefe dabei, dass kein --shard dazugekommen ist",
    ).toEqual([E2E_AUFRUF]);

    // Der zweite Pin, unabhaengig vom ersten: `--shard` steht NUR dort, wo es
    // hingehoert. Begruendung an `VITEST_AUFRUF` — diese Zusicherung ist es,
    // die jede Schreibweise eines e2e-Aufrufs miterschlaegt.
    const mitShard = ci
      .split("\n")
      .filter((zeile) => !/^\s*#/.test(zeile))
      .filter((zeile) => zeile.includes("--shard"));

    expect(
      mitShard,
      "ausserhalb des vitest-Jobs shardet etwas — bei e2e hiesse das: Aufteilung nach Fallzahl " +
        "statt der Eimer aus e2e/gruppen.json, und jeder neue Test verschiebt sie still",
    ).toEqual([VITEST_AUFRUF]);
  });
});
