import { execFileSync } from "node:child_process";
import { existsSync, readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * DIESE DATEI BEWACHT EINE MESSUNG, KEINE VERMUTUNG (DRK-192, 2026-09-16,
 * Quelltext-Scan ueber alle von git verfolgten Dateien, Stand `e79dc8b`).
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
 *   2. **Anker in die Alt-Anwendung und in Fremdpakete.** Beide sind nicht
 *      VERSIONIERT; es gibt nichts, wogegen man sie halten koennte. Sie werden
 *      hier bewusst NICHT gemeldet — ein Riegel, der Unpruefbares anmahnt,
 *      erzieht dazu, ihn zu ueberlesen. ⚠️ „Nicht versioniert" und „liegt nicht
 *      da" sind dabei ZWEIERLEI: ein installiertes `node_modules/…` liegt da,
 *      gehoert aber nicht zum Repo — siehe `aufloesen`.
 *   3. **Prosa in `docs/`.** Berichte und Plaene halten einen VERGANGENEN Stand
 *      fest; ihre Anker sollen mit dem Repo gerade NICHT mitwandern. Deshalb
 *      steht `docs` in `NICHT_GELESENE_PFADE` (dort stehen 24 Anker ueber EOF,
 *      alle korrekt als historisch). Als ZIEL bleibt `docs` erlaubt.
 */

/**
 * GELESEN WIRD DAS GANZE REPO, und zwar das, was GIT dafuer haelt.
 *
 * ⚠️ DIE RICHTUNG IST DER GANZE PUNKT, und die erste Fassung hatte sie falsch
 * herum (`["src", "e2e", "scripts"]`, Codex-Review zu PR #183): eine Wurzel-
 * ALLOWLIST laesst alles Neue STILL heraus. Gemessen an dem, was dadurch
 * fehlte: `playwright.config.ts` verankert auf `src/core/bootstrap.ts`, dazu
 * `compose.yaml`, `.env.example`, `Dockerfile`, `AGENTS.md` und
 * `clamd.files.conf` — zusammen ueber 90 Anker in Dateien, die kein
 * Verzeichnis unter sich haben. Ein Riegel, der sich „repo-weit" nennt und die
 * Repowurzel auslaesst, ist keiner.
 *
 * ⚠️ DIE DATEILISTE KOMMT AUS `git ls-files` UND NICHT AUS `readdirSync`, und
 * auch das ist ein Befund derselben Review: ein Lauf ueber das Dateisystem
 * sammelt alles ein, was in einem BENUTZTEN Arbeitsbaum herumliegt —
 * `.env.local`, `playwright-report/index.html`, `test-results/`. Der
 * Einsortier-Fall unten haette dann `.local` und `.html` gemeldet und `pnpm
 * vitest run` waere bei jedem ausser einem frisch geklonten Baum rot gewesen.
 * Eine weitere Ausschlussliste waere genau der Defekt, den dieser Riegel
 * bewacht; `git` fuehrt die Liste ohnehin und fuehrt sie richtig.
 *
 * Bleiben zwei bewusste Ausnahmen unter dem, was git kennt: `docs` und
 * `patches` halten vergangenen oder fremden Stand fest (Kopf, Punkt 3).
 */
const NICHT_GELESENE_PFADE = [/^docs\//, /^patches\//];

/**
 * ⚠️ GELESEN WIRD JEDES TEXTFORMAT IM REPO, nicht nur `ts|tsx|css`.
 * Die erste Fassung las genau diese drei und uebersah damit still 40 `.sql`
 * und zwei `.mjs` (Codex-Review zu PR #183). Das ist nicht hypothetisch:
 * `scripts/import/fixtures/radio-quelle-ddl.sql` traegt heute einen Anker auf
 * `_db/herkunft/README.md`, und die Datei endet auf Zeile 12 — schruempfte sie,
 * bliebe ein „repo-weiter" Riegel gruen, weil er die SQL-Datei nie aufschlaegt.
 *
 * ⚠️ DIE SCHIEFLAGE WAR DIE EIGENTLICHE URSACHE, und sie kehrt ohne Not
 * zurueck: `ZIEL` unten erlaubt `sql`, `mjs`, `md`, `json` … als ZIEL eines
 * Ankers, `ENDUNGEN` liess dieselben Formate aber nicht als QUELLE zu. Deshalb
 * steht daneben `NICHT_GELESEN` und ein Fall, der ROT wird, sobald im Repo
 * eine Endung auftaucht, die in keiner der beiden Listen steht. Eine
 * Allowlist, die niemand nachfuehrt, ist genau der Defekt, den dieser Riegel
 * bewacht.
 */
const ENDUNGEN =
  /\.(ts|tsx|css|sql|mjs|md|sh|json|txt|ndjson|ya?ml|conf|example|dockerignore|gitattributes|gitignore)$/;

/** Dateien ohne Endung, die trotzdem Quelltext sind. */
const OHNE_ENDUNG = /^(Dockerfile|Makefile|CODEOWNERS|LICENSE)$/;

/** Was kein Text ist, generiert wird oder keinen eigenen Kommentar traegt. */
const NICHT_GELESEN =
  /(\.(ttf|woff2?|png|jpe?g|webp|gif|ico|svg|pdf|xlsx|zip|db|sqlite3?|lock|tsbuildinfo)|(^|\/)\.gitkeep)$/;

/**
 * Ein Pfad, wie er in einem Kommentar steht, gefolgt von `:zeile` oder
 * `:von-bis`.
 *
 * ⚠️ `\([A-Za-z0-9_-]+\)` ALS GANZES SEGMENT ist der Teil, der teuer war (Kopf,
 * zweite Warnung): Next.js schreibt Route-Gruppen als `(druck)`, und ohne
 * diesen Zweig beginnt der Treffer erst HINTER der Klammer. Klammern als
 * gewoehnliche Pfadzeichen zuzulassen geht nicht — dann frisst `(datei.ts:12)`
 * aus der Prosa die oeffnende Klammer mit.
 *
 * ⚠️ HIER STEHT ABSICHTLICH KEINE ENDUNGSLISTE MEHR. Die erste Fassung
 * verlangte `\.(ts|tsx|css|…)` am Ende und uebersah damit still jedes Ziel
 * ohne passende Endung (Codex-Review zu PR #183): `Dockerfile:38-39` in
 * `src/proxy.ts` und `.env.example:107-110` in mehreren radio-Dateien wurden
 * NIE zu einem Anker. Der Filter ist jetzt `aufloesen` — was sich nicht gegen
 * eine Datei dieses Repos aufloesen laesst, faellt dort heraus. Das ist die
 * belastbarere Reihenfolge: die Regex darf grosszuegig sein, die VERSIONIERTE
 * Dateiliste entscheidet. Gemessen: 18 zusaetzlich erfasste Anker, kein
 * einziger Fehlalarm.
 *
 * Die EINE Einschraenkung, die bleibt: ein Ziel aus lauter Ziffern ist keines.
 * Sonst waere `12:30` in einer Messnotiz ein Ankerkandidat.
 */
const SEGMENT = "(?:[A-Za-z0-9_@.\\[\\]-]+|\\([A-Za-z0-9_-]+\\))";
const ZIEL = new RegExp(
  `(${SEGMENT}(?:\\/${SEGMENT})*):(\\d+)(?:\\s*[-–]\\s*(\\d+))?`,
  "g",
);

/**
 * ⚠️ BEIDE ENDEN WERDEN GEFUEHRT, NICHT NUR `bis`. Die erste Fassung reduzierte
 * eine Spanne auf ihre letzte Zahl und pruefte allein `bis > hat` — damit kamen
 * zwei Formen durch (Codex-Review zu PR #183): ein Anker auf Zeile 0 (`0 > hat`
 * ist falsch, und eine Zeile 0 gibt es in keiner Datei) und eine VERDREHTE
 * Spanne, deren Anfang hinter dem Dateiende liegt und deren Ende auf Zeile 1
 * zeigt — gruen, solange es eine Zeile 1 gibt. Ein Anker verspricht, dass JEDE
 * genannte Zeile existiert; dann muss auch jede geprueft werden.
 *
 * (Die Beispiele stehen ohne `datei:zeile`-Schreibweise, siehe `zeilenzahlVon`:
 * der Scan liest auch diese Datei.)
 */
export type Anker = { ziel: string; von: number; bis: number };

export function ankerAusText(text: string): Anker[] {
  return [...text.matchAll(ZIEL)]
    .filter(([, ziel]) => !/^\d+$/.test(ziel))
    .map(([, ziel, von, bis]) => ({
      ziel,
      von: Number(von),
      bis: Number(bis ?? von),
    }));
}

/** Was an einer Spanne nicht stimmt — `null`, wenn sie in Ordnung ist. */
export function spannenFehler(anker: Anker, hat: number): string | null {
  if (anker.von < 1) return `Zeile ${anker.von} gibt es in keiner Datei`;
  if (anker.bis < anker.von) return `die Spanne laeuft rueckwaerts`;
  if (anker.bis > hat) return `die Datei hat ${hat} Zeilen`;
  return null;
}

const zeilenzahl = new Map<string, number | null>();

/**
 * ⚠️ `split("\n").length` IST UM EINS ZU GROSS, sobald die Datei mit einem
 * Zeilenumbruch endet — und das tut in diesem Repo praktisch jede. Hinter dem
 * letzten `\n` steht eine leere Zeichenkette, die `split` mitzaehlt; der Riegel
 * liesse damit genau den Grenzfall durch, den er fangen soll. Gemessen an der
 * ersten Fassung (Codex-Review zu PR #183): ein Anker auf Zeile 100 von
 * `core/hosts.ts` und zwei auf Zeile 14 von `core/auth/devLogin.ts` kamen
 * durch, obwohl die Ziele auf 99 bzw. 13 enden. Ein Editor zaehlt wie `wc -l`,
 * und danach muss sich ein Anker richten. (Die Beispiele stehen hier ohne
 * `datei:zeile`-Schreibweise — der Scan liest auch diese Datei.)
 */
export function zeilenzahlVon(text: string): number {
  const teile = text.split("\n");
  // Eine Datei OHNE abschliessenden Umbruch hat in `teile` keine Leerzeile am
  // Ende — dort zaehlt das letzte Stueck mit.
  return teile.at(-1) === "" ? teile.length - 1 : teile.length;
}

function zeilen(pfad: string): number | null {
  if (!zeilenzahl.has(pfad)) {
    let n: number | null = null;
    try {
      if (statSync(pfad).isFile()) n = zeilenzahlVon(readFileSync(pfad, "utf8"));
    } catch {
      n = null;
    }
    zeilenzahl.set(pfad, n);
  }
  return zeilenzahl.get(pfad) ?? null;
}

/** Jede von git verfolgte Datei, relativ zur Repowurzel. */
function verfolgteDateien(): string[] {
  const roh = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8", maxBuffer: 64 << 20 });
  return roh.split("\0").filter((p) => p !== "");
}

const VERFOLGT = new Set(verfolgteDateien());

/**
 * Die Basen, gegen die ein Anker aufgeloest wird, in der Reihenfolge, in der
 * die Suite sie tatsaechlich schreibt: das eigene Verzeichnis (`./nachbar.ts`),
 * jeder Vorfahre (`_db/schema.ts` aus `_lib/schreibpfade/` heraus), die
 * Modulwurzel (`lagerbuch/verwaltung/(druck)/druck.css`), `src`
 * (`core/theme/theme.ts`) und die Repowurzel (`src/proxy.ts`, `CLAUDE.md`).
 *
 * Der ERSTE Treffer gewinnt. Das ist dieselbe Reihenfolge, in der ein Mensch
 * sucht, und damit die Datei, in der er landet.
 *
 * ⚠️ AUFGELOEST WIRD NUR GEGEN `VERFOLGT`, nicht gegen das Dateisystem, und das
 * ist der Unterschied zwischen „liegt da" und „gehoert zum Repo" (Codex-Review
 * zu PR #183). Mit `existsSync` traf `node_modules/drizzle-orm/sqlite-core/
 * db.d.ts:16-17` aus `scripts/import/radio.ts` eine INSTALLIERTE Fremddatei —
 * ein Paket-Update haette den Riegel rot gefaerbt, und zwar wegen Inhalten, die
 * dieses Repo weder kennt noch versioniert. Genau das Gegenteil dessen, was der
 * Kopf zusagt („Anker in Fremdpakete kann er nicht pruefen"). Ein ignoriertes
 * lokales `foo.ts` haette umgekehrt einen aeusseren Anker beschattet.
 *
 * `docs` und `patches` bleiben als ZIEL erlaubt, obwohl sie als QUELLE
 * ausgeschlossen sind: ein Anker DORTHIN zeigt in eine Datei dieses Repos und
 * kann veralten wie jede andere. Ausgeschlossen ist nur, ihre eigene Prosa als
 * Anker zu lesen.
 */
export function aufloesen(quelle: string, ziel: string): string | null {
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
    if (!VERFOLGT.has(relative(wurzel, pfad))) continue;
    if (zeilen(pfad) !== null) return pfad;
  }

  const eindeutig = EINDEUTIGES_SUFFIX.get(ziel);
  if (eindeutig !== undefined) return resolve(wurzel, eindeutig);
  return null;
}

/**
 * Pfade, die GENAU EINE verfolgte Datei als Suffix bezeichnen —
 * `_lib/ausleihZugang.ts` → `src/app/m/radio/_lib/ausleihZugang.ts`.
 *
 * ⚠️ NUR MEHRSEGMENTIGE PFADE, und die Einschraenkung ist GEMESSEN, nicht
 * vorsichtshalber (Codex-Review zu PR #183 schlug auch nackte Dateinamen vor).
 * Ueber alle Suffixe, Dateinamen eingeschlossen, loesen 417 Anker zusaetzlich
 * auf — und NEUN davon werden rot, von denen mindestens SIEBEN falsch sind.
 * Fuenf davon sind ausgerechnet `globals.css:277`, also die ALT-ANWENDUNG, um
 * die es in DRK-192 geht: der Riegel beginge damit genau den Fehlschluss, den
 * er verhindern soll, und zwar gegen die Stellen, die ihn beschreiben. Zwei
 * weitere binden `export.ts:69-78` aus `m/radio` an `m/uav/_lib/export.ts` —
 * ein fremdes Modul, nur weil der Name dort einmalig ist.
 *
 * Mit der Einschraenkung auf Pfade (mindestens ein `/`) bleiben +98 Anker und
 * **ein** roter — und der ist echt: `files/_lib/ip.ts` zeigte auf Zeile 414 der
 * Freigabe-Detailseite, die seit `97860eb` auf 412 endet. Er stand hier vorher
 * in `datei:zeile`-Form und faerbte den Riegel an seiner eigenen Begruendung
 * rot; die Beispiele stehen deshalb ohne sie, siehe `zeilenzahlVon`.
 *
 * Das ist dieselbe Trennlinie wie Regel 2 in `CLAUDE.md`: ein PFAD nennt sein
 * Repository mit, ein nackter DATEINAME ist zwischen Repos mehrdeutig.
 */
const EINDEUTIGES_SUFFIX = ((): Map<string, string> => {
  const zaehler = new Map<string, string | null>();
  for (const pfad of VERFOLGT) {
    const teile = pfad.split("/");
    // Bei `i = teile.length - 1` steht der nackte Dateiname — bewusst ausgelassen.
    for (let i = 0; i < teile.length - 1; i++) {
      const suffix = teile.slice(i).join("/");
      zaehler.set(suffix, zaehler.has(suffix) ? null : pfad);
    }
  }
  const eindeutig = new Map<string, string>();
  for (const [suffix, pfad] of zaehler) if (pfad !== null) eindeutig.set(suffix, pfad);
  return eindeutig;
})();

function sammleDateien(): string[] {
  return [...VERFOLGT].filter((p) => !NICHT_GELESENE_PFADE.some((r) => r.test(p)));
}

function istQuelle(pfad: string): boolean {
  const name = basename(pfad);
  return ENDUNGEN.test(name) || OHNE_ENDUNG.test(name);
}

function sammleQuellen(): string[] {
  return sammleDateien().filter(istQuelle);
}

type Befund = { quelle: string; zeile: number; anker: string; ziel: string; grund: string };

function veralteteAnker(): { befunde: Befund[]; gepruefte: number } {
  const befunde: Befund[] = [];
  let gepruefte = 0;

  for (const quelle of sammleQuellen()) {
    const inhalt = readFileSync(quelle, "utf8").split("\n");
    inhalt.forEach((text, i) => {
      for (const anker of ankerAusText(text)) {
        const pfad = aufloesen(quelle, anker.ziel);
        if (pfad === null) continue; // Alt-Anwendung, Fremdpaket — nicht pruefbar.
        gepruefte++;
        const hat = zeilen(pfad) ?? 0;
        const fehler = spannenFehler(anker, hat);
        if (fehler !== null) {
          const spanne = anker.bis === anker.von ? `${anker.von}` : `${anker.von}-${anker.bis}`;
          befunde.push({
            quelle,
            zeile: i + 1,
            anker: `${anker.ziel}:${spanne}`,
            ziel: relative(".", pfad),
            grund: fehler,
          });
        }
      }
    });
  }
  return { befunde, gepruefte };
}

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
  });

  /**
   * DIE BEIDEN SPANNEN-FORMEN, DIE DER ERSTE WURF DURCHLIESS: eine Zeile 0 und
   * eine rueckwaerts laufende Spanne. Beide sind keine Spitzfindigkeit — sie
   * entstehen beim Tippen, und beide behaupten eine Zeile, die es nicht gibt.
   */
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
   */
  it("die Regex liest Route-Gruppen mit und faellt nicht auf Prosa herein", () => {
    const ziele = (text: string) => ankerAusText(text).map((a) => `${a.ziel}:${a.bis}`);

    expect(ziele("(`lagerbuch/verwaltung/(druck)/druck.css:480-497`)"))
      .toEqual(["lagerbuch/verwaltung/(druck)/druck.css:497"]);
    expect(ziele("siehe (druck.css:12) nebenan")).toEqual(["druck.css:12"]);
    expect(ziele("`a/[artikelId]/page.tsx:26`")).toEqual(["a/[artikelId]/page.tsx:26"]);
    expect(ziele("`core/theme/theme.ts:32-33`")).toEqual(["core/theme/theme.ts:33"]);

    // Ohne Endung und mit unbekannter Endung — beide kamen frueher gar nicht an.
    expect(ziele("`Dockerfile:38-39`")).toEqual(["Dockerfile:39"]);
    expect(ziele("`.env.example:107-110`")).toEqual([".env.example:110"]);

    // Kein Anker: eine Datei ohne Zeile, und eine Zeit (nur Ziffern vor dem
    // Doppelpunkt — die eine Einschraenkung, die die Regex noch selbst trifft).
    expect(ziele("`core/theme/theme.ts` traegt die Dichten")).toEqual([]);
    expect(ziele("um 12:30 gemessen")).toEqual([]);
  });
});
