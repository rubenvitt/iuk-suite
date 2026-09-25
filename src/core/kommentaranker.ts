/**
 * DIE ANKER-MASCHINERIE — GETEILT VON ZWEI VERBRAUCHERN, DESHALB EIN MODUL.
 *
 * Bis DRK-204 stand alles hier Stehende in `kommentaranker.test.ts` und war
 * damit nur einem Verbraucher zugaenglich: dem Riegel, der prueft, ob ein Anker
 * hinter das ENDE seiner Datei zeigt. Der zweite Verbraucher ist
 * `scripts/anker-drift.ts` — der Melder fuer Drift INNERHALB der Datei, also
 * genau die Klasse, die der Riegel in seinem eigenen Kopf als blinden Fleck
 * ausschreibt.
 *
 * ⚠️ WARUM NICHT EINFACH EINE ZWEITE REGEX IM SKRIPT: weil `ZIEL` unten
 * sieben Review-Runden gekostet hat und jede davon als Warnung daneben steht —
 * Route-Gruppen in Klammern, die Spalte einer Compilermeldung, die
 * Vorbelegungsliste hinter einem Anker, der Schraegstrich als Trenner. Eine
 * zweite Fassung waere am ersten Tag gleich und am dreissigsten still anders,
 * und dann meldete das eine Werkzeug Anker, die das andere nie sieht. Das ist
 * dieselbe Fehlerklasse, gegen die dieses Modul ueberhaupt antritt.
 *
 * ⚠️ HIER STEHT KEIN `vitest`-IMPORT, und das ist keine Formalie: ein Skript,
 * das diese Datei laedt, zoege den Testlaeufer mit — `describe` ausserhalb
 * eines Laufs wirft. Die Zusicherungen bleiben in `kommentaranker.test.ts`.
 */
import { execFileSync } from "node:child_process";
import { readFileSync, statSync } from "node:fs";
import { basename, dirname, extname, relative, resolve } from "node:path";

/**
 * DIESE MASCHINERIE TRAEGT EINE MESSUNG, KEINE VERMUTUNG (DRK-192, 2026-09-16,
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
export const NICHT_GELESENE_PFADE = [/^docs\//, /^patches\//];

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
 *
 * `rs` und `toml` kommen von der Desktop-App unter `apps/einsatzbuch`: ihr
 * Rust-Kern (`src-tauri/kern`) trägt Kommentaranker wie jede andere
 * Quelldatei, ebenso die Cargo-Manifeste. `html` und `js` gehören zum
 * selben Modul (Tauri-Einstiegsseite, Lint-Konfiguration) — siehe Spec
 * Einsatzbuch §2.2.
 */
export const ENDUNGEN =
  /\.(ts|tsx|css|sql|mjs|md|sh|json|txt|ndjson|ya?ml|conf|example|dockerignore|gitattributes|gitignore|rs|toml|html|js)$/;

/** Dateien ohne Endung, die trotzdem Quelltext sind. */
export const OHNE_ENDUNG = /^(Dockerfile|Makefile|CODEOWNERS|LICENSE)$/;

/**
 * Was kein Text ist, generiert wird oder keinen eigenen Kommentar trägt. `icns` ist das
 * gebündelte Tauri-Anwendungssymbol der Desktop-App (binär, siehe Spec Einsatzbuch §2.2).
 */
export const NICHT_GELESEN =
  /(\.(ttf|woff2?|png|jpe?g|webp|gif|ico|svg|pdf|xlsx|zip|db|sqlite3?|lock|tsbuildinfo|icns)|(^|\/)\.gitkeep)$/;

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
 * ohne passende Endung (Codex-Review zu PR #183): der Anker auf Zeile 38-39
 * des `Dockerfile` in `src/proxy.ts` und der auf `.env.example` in mehreren
 * radio-Dateien wurden NIE zu einem Anker. Der Filter ist jetzt `aufloesen` — was sich nicht gegen
 * eine Datei dieses Repos aufloesen laesst, faellt dort heraus. Das ist die
 * belastbarere Reihenfolge: die Regex darf grosszuegig sein, die VERSIONIERTE
 * Dateiliste entscheidet. Gemessen: 18 zusaetzlich erfasste Anker, kein
 * einziger Fehlalarm.
 *
 * Die EINE Einschraenkung, die bleibt: ein Ziel aus lauter Ziffern ist keines.
 * Sonst waere `12:30` in einer Messnotiz ein Ankerkandidat.
 */
const SEGMENT = "(?:[A-Za-z0-9_@.\\[\\]-]+|\\([A-Za-z0-9_-]+\\))";

/**
 * Die FORTSETZUNGEN hinter dem ersten Bereich: `portal.ts:48-49 und :51`,
 * `globals.css:265,266`, `bauform.test.ts:181, :201-203`.
 *
 * ⚠️ OHNE DIESEN TEIL WIRD NUR DIE ERSTE ZAHL GEPRUEFT und der Rest still
 * uebergangen (Codex-Review zu PR #183) — bei `48-49 und :51` also gerade die
 * Zahl, die als einzige allein steht und damit am ehesten verrutscht.
 * Gemessen deckt der Zusatz 24 weitere Zeilenangaben ab, keine davon rot.
 *
 * Der Doppelpunkt darf fehlen (`:265,266` ist die Hausform), der TRENNER nicht:
 * nur direkt an den Anker angehaengte Fortsetzungen zaehlen. Als Trenner zaehlt
 * auch der SCHRAEGSTRICH — `files-hosts.spec.ts:413/423/437` ist die Form, die
 * `e2e/lagerbuch-hosts.spec.ts` schreibt (Codex-Review zu PR #183); ohne ihn
 * blieben dort zwei von drei Zeilen ungeprueft.
 *
 * ⚠️ OHNE DOPPELPUNKT MUSS DIE ZAHL DIREKT ANSCHLIESSEN, und das ist kein
 * Feinschliff: mit einem Leerzeichen dazwischen frisst die Fortsetzung jede
 * Zahlenliste hinter einem Anker. Gemessen an `m/radio/_lib/gateSchranke.ts`
 * (Codex-Review zu PR #183): dort steht „(`./grenzen.ts:76-91`, 12/5/30/300)" —
 * das sind VORBELEGUNGEN, keine Zeilen. Die lose Fassung las daraus vier
 * weitere Zeilenangaben bis 300 und war nur deshalb gruen, weil `grenzen.ts`
 * heute 366 Zeilen hat; ein Kuerzen der Datei haette den Riegel ueber
 * Konfigurationswerte rot gefaerbt. Ein Riegel, der Falsches meldet, wird
 * abgeschaltet statt gelesen.
 *
 * ⚠️ UND DIE BACKTICKS DAZWISCHEN duerfen stehen: die Suite setzt jede
 * Fortsetzung gern in eigene Anfuehrungszeichen. Das ist keine Formalie — genau
 * diese Form deckte den bisher letzten echten Fund auf: eine radio-Zusage
 * zitierte zwei Bereiche einer 85-zeiligen Datei, und der zweite reichte bis
 * Zeile 86. Ohne die Backticks im Muster blieb er ungeprueft. Ein `:266`, das
 * ZEILEN SPAETER im selben Kommentar auf denselben Anker zurueckverweist,
 * bleibt ungeprueft — das zu binden hiesse, einen Kommentarblock zustandsbehaftet
 * zu lesen, und ein nacktes `: 51` steht auch in jedem Ternaer. Als eigener
 * Posten notiert statt still gelassen.
 *
 * ⚠️ DER DOPPELPUNKT-ZWEIG VERLANGT EINEN BACKTICK ODER EIN LEERZEICHEN davor,
 * und zwar wegen `datei:zeile:spalte` — der Form jeder Compiler- und
 * Stapelmeldung. Ohne die Forderung las er die SPALTE als zweite Zeilenangabe;
 * 13 solcher Stellen stehen im Repo, und sie waren nur zufaellig gruen (Spalte
 * 46 gegen 129 Zeilen in `lagerbuch/_lib/boot.test.ts`, Spalte 54 gegen 307 in
 * `lesepfade/artikel.ts`). Ein Kuerzen einer dieser Dateien haette CI rot
 * gefaerbt wegen einer Zahl, die gar keine Zeile ist. Eine echte Fortsetzung
 * traegt Backtick oder Leerzeichen, eine Diagnose keines von beidem — derselbe
 * Gedanke wie beim Trenner eine Ebene darueber (Codex-Review zu PR #183).
 */
const ZAHL = "\\d+(?:\\s*[-–]\\s*\\d+)?";
const FORTSETZUNG =
  // mit TRENNER und Doppelpunkt: `…:181, :201-203`
  `(?:\`?\\s*(?:,|;|und|\\/)\\s*\`?:${ZAHL}`
  // mit TRENNER, ohne Doppelpunkt — dann aber DIREKT anschliessend: `:265,266`
  + `|[,;\\/]${ZAHL}`
  // ohne Trenner, dann traegt der Doppelpunkt die Last: `…:18-20` `:82-86`
  + `|(?:\`\\s*\`?|\\s+\`?):${ZAHL})`;

export const ZIEL = new RegExp(
  `(${SEGMENT}(?:\\/${SEGMENT})*):(\\d+)(?:\\s*[-–]\\s*(\\d+))?(${FORTSETZUNG}+)?`,
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
  const anker: Anker[] = [];
  for (const [, ziel, von, bis, schwanz] of text.matchAll(ZIEL)) {
    if (/^\d+$/.test(ziel)) continue;
    anker.push({ ziel, von: Number(von), bis: Number(bis ?? von) });
    // Im Schwanz stehen nur noch Trenner, Backticks, Doppelpunkte und Zahlen —
    // ein schlichter Zahlen-Scan reicht und kann nichts anderes aufgreifen.
    for (const [, v, b] of (schwanz ?? "").matchAll(/(\d+)(?:\s*[-–]\s*(\d+))?/g)) {
      anker.push({ ziel, von: Number(v), bis: Number(b ?? v) });
    }
  }
  return anker;
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

export const VERFOLGT = new Set(verfolgteDateien());

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
/**
 * Die Schreibweisen desselben Ziels, in der Reihenfolge, in der die Suite sie
 * schreibt: wie dagestanden, mit aufgeloestem `@`-Alias, und — wenn die Endung
 * fehlt — mit der, die ein `import` weglaesst.
 *
 * ⚠️ NUR DER EIGENE REPONAME WIRD ABGESTREIFT, kein anderer: drei Anker
 * schreiben `iuk-suite/Dockerfile` bzw. `iuk-suite/src/core/routing.ts` und
 * meinen damit DIESES Repo (Codex-Review zu PR #183) — ungestrippt galten sie
 * als aeusserer Verweis. `lagerbuch/…` und `radio-inventar/…` bleiben stehen:
 * das sind die ALT-ANWENDUNGEN, und genau ihr Praefix ist die Auskunft, die
 * Regel 2 in `CLAUDE.md` verlangt. Wer hier pauschal das erste Segment
 * abschneidet, macht aus jeder Herkunftsmarke einen Anker in dieses Repo.
 *
 * ⚠️ BEIDE FORMEN STEHEN IM BESTAND und blieben bis hierher ungeprueft
 * (Codex-Review zu PR #183): zwei radio-Tests verankern auf Zeile 174-186 des
 * DOM-Harnesses und nennen es ueber den tsconfig-Alias `@/…` UND ohne `.tsx` —
 * so, wie der `import` zwei Zeilen weiter unten es auch nennt. (Der Anker
 * steht hier ohne `datei:zeile`-Schreibweise, siehe `zeilenzahlVon`.) Wer nur den
 * rohen Text aufloest, haelt eine hausuebliche Schreibweise fuer einen
 * aeusseren Verweis.
 */
const EIGENES_REPO = "iuk-suite/";

/**
 * Die AUSLASSUNGSFORM — ein Pfad, dem die Suite die oberen Segmente abkuerzt,
 * geschrieben als drei Punkte und ein Schraegstrich vor dem Rest. 31 Anker im
 * Bestand (Codex-Review zu PR #183).
 * `...` ist kein gueltiges Pfadsegment, das Abstreifen also eindeutig; `..`
 * bleibt unangetastet, das ist ein echter relativer Schritt.
 *
 * ⚠️ DAS ABSTREIFEN ALLEIN WAERE DER AUSGANGSFEHLER VON DRK-192: die 31
 * zerfallen in lokale Verweise UND in Alt-Anwendung bzw. Fremdpakete
 * (`.../request-cookies.js` ist Next.js, `.../es/Select.js` antd,
 * `.../routes/admin/login.tsx` die Alt-Anwendung). Deshalb entsteht hier nur
 * eine VARIANTE; ob sie etwas bedeutet, entscheidet weiterhin die verfolgte
 * Dateiliste. Was dort kein Suffix hat, bleibt `null` — und genau das trennt
 * die beiden Gruppen, ohne dass jemand eine Liste pflegen muesste.
 */
const AUSLASSUNG = /^(?:\.\.\.|…)\//;

function zielVarianten(ziel: string): string[] {
  const roh = [ziel];
  if (ziel.startsWith("@/")) roh.push(`src/${ziel.slice(2)}`);
  if (ziel.startsWith(EIGENES_REPO)) roh.push(ziel.slice(EIGENES_REPO.length));
  const ohneAuslassung = ziel.replace(AUSLASSUNG, "");
  if (ohneAuslassung !== ziel) roh.push(ohneAuslassung);
  const ohneEndung = roh.filter((z) => extname(basename(z)) === "");
  return [...roh, ...ohneEndung.flatMap((z) => [`${z}.ts`, `${z}.tsx`])];
}

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

  for (const variante of zielVarianten(ziel)) {
    for (const basis of basen) {
      const pfad = resolve(basis, variante);
      if (!pfad.startsWith(`${wurzel}/`)) continue;
      if (!VERFOLGT.has(relative(wurzel, pfad))) continue;
      if (zeilen(pfad) !== null) return pfad;
    }

    const eindeutig = EINDEUTIGES_SUFFIX.get(variante);
    if (eindeutig !== undefined) return resolve(wurzel, eindeutig);
  }
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
export const EINDEUTIGES_SUFFIX = ((): Map<string, string> => {
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

/**
 * MEHRDEUTIGE Suffixe — und die OBERGRENZE ihrer Kandidaten.
 *
 * `t/[code]/route.ts` gibt es in `m/radio` UND in `m/lagerbuch`; `_db/schema.ts`
 * elfmal. `aufloesen` gibt solche Ziele bewusst auf: welche Datei gemeint ist,
 * kann es nicht wissen, und die falsche zu waehlen hiesse, eine Zusage an ein
 * fremdes Modul zu binden (siehe `EINDEUTIGES_SUFFIX`).
 *
 * ⚠️ EINE AUSSAGE BLEIBT TROTZDEM BEWEISBAR, und sie kostet nichts: liegt die
 * Zeile ueber der laengsten aller Kandidatendateien, gibt es sie in KEINER von
 * ihnen — der Anker ist veraltet, gleichgueltig welche gemeint war. Ein
 * Fehlalarm ist damit ausgeschlossen, nicht bloss unwahrscheinlich.
 *
 * Gemessen (Codex-Review zu PR #183): 92 Anker ueber 22 Ziele fielen bis hierher
 * still heraus, verteilt auf rund zwanzig Dateien — `_db/schema.ts` allein in
 * acht, `CLAUDE.md` und `AGENTS.md` eingeschlossen. Mit der Obergrenze werden
 * alle 92 geprueft, keiner davon rot.
 *
 * ⚠️ REPO-RELATIVE PFADE ERZWINGEN ist ENTSCHIEDEN ABGELEHNT (DRK-403): es
 * poliert die Form, die Regel 1 in `CLAUDE.md` gar nicht will, und braucht eine
 * Bestandsliste. Ein Namensanker hat keine Zeile — dort gehen diese Grenze und
 * die an `FORTSETZUNG` und `EINDEUTIGES_SUFFIX` von selbst zu. Offen ist
 * Regel 1 selbst, 81 neue Zeilenanker in acht Tagen: DRK-474.
 */
const MEHRDEUTIGE_OBERGRENZE = ((): Map<string, number> => {
  const kandidaten = new Map<string, string[]>();
  for (const pfad of VERFOLGT) {
    const teile = pfad.split("/");
    for (let i = 0; i < teile.length - 1; i++) {
      const suffix = teile.slice(i).join("/");
      (kandidaten.get(suffix) ?? kandidaten.set(suffix, []).get(suffix)!).push(pfad);
    }
  }
  const obergrenze = new Map<string, number>();
  for (const [suffix, pfade] of kandidaten) {
    if (pfade.length < 2) continue;
    const laengste = Math.max(...pfade.map((p) => zeilen(resolve(p)) ?? 0));
    if (laengste > 0) obergrenze.set(suffix, laengste);
  }
  return obergrenze;
})();

/**
 * Die Obergrenze fuer ein Ziel, das sich NICHT eindeutig aufloesen laesst —
 * oder `null`, wenn es auch mehrdeutig nicht in diesem Repo liegt (dann ist es
 * Alt-Anwendung oder Fremdpaket, und dazu sagt der Riegel nichts).
 */
export function obergrenzeVon(ziel: string): number | null {
  for (const variante of zielVarianten(ziel)) {
    const grenze = MEHRDEUTIGE_OBERGRENZE.get(variante);
    if (grenze !== undefined) return grenze;
  }
  return null;
}

/**
 * Eine verfolgte Datei, die es im Arbeitsbaum GERADE NICHT GIBT.
 *
 * ⚠️ DER GEWOEHNLICHE FALL, nicht der seltene: wer eine Datei loescht oder
 * umbenennt und noch nicht `git add` gesagt hat, hat genau diesen Zustand —
 * `git ls-files` nennt den alten Pfad weiter. Ohne diese Probe warf der Scan
 * dort `ENOENT`, und zwar nicht als roten Fall, sondern als ABBRUCH der ganzen
 * Datei: gemessen „Tests: no tests" statt einer Meldung. Ein Riegel, der beim
 * Umbenennen die Suite reisst, wird abgeschaltet statt gelesen — dieselbe Lehre
 * wie beim Verzeichnislauf, der `.env.local` einsammelte (Codex-Review zu
 * PR #183, zwei Runden zuvor).
 *
 * Geprueft wird ueber `zeilen`, nicht ueber ein zweites `existsSync`: die
 * Funktion faengt den Fehler ohnehin ab und merkt sich das Ergebnis, und zwei
 * Wege zur selben Frage laufen irgendwann auseinander.
 */
export function liegtImArbeitsbaum(pfad: string): boolean {
  return zeilen(resolve(pfad)) !== null;
}

export function sammleDateien(): string[] {
  return [...VERFOLGT]
    .filter((p) => !NICHT_GELESENE_PFADE.some((r) => r.test(p)))
    .filter(liegtImArbeitsbaum);
}

export function istQuelle(pfad: string): boolean {
  const name = basename(pfad);
  return ENDUNGEN.test(name) || OHNE_ENDUNG.test(name);
}

export function sammleQuellen(): string[] {
  return sammleDateien().filter(istQuelle);
}

export type Befund = { quelle: string; zeile: number; anker: string; ziel: string; grund: string };

export function veralteteAnker(): { befunde: Befund[]; gepruefte: number } {
  const befunde: Befund[] = [];
  let gepruefte = 0;

  for (const quelle of sammleQuellen()) {
    const inhalt = readFileSync(quelle, "utf8").split("\n");
    inhalt.forEach((text, i) => {
      for (const anker of ankerAusText(text)) {
        const pfad = aufloesen(quelle, anker.ziel);
        // Mehrdeutiges Suffix: die laengste Kandidatendatei ist die Obergrenze —
        // was darueber liegt, gibt es in KEINER von ihnen.
        const hat = pfad !== null ? (zeilen(pfad) ?? 0) : obergrenzeVon(anker.ziel);
        if (hat === null) continue; // Alt-Anwendung, Fremdpaket — nicht pruefbar.
        gepruefte++;
        const fehler = spannenFehler(anker, hat);
        if (fehler !== null) {
          const spanne = anker.bis === anker.von ? `${anker.von}` : `${anker.von}-${anker.bis}`;
          befunde.push({
            quelle,
            zeile: i + 1,
            anker: `${anker.ziel}:${spanne}`,
            ziel: pfad !== null ? relative(".", pfad) : `${anker.ziel} (mehrdeutig, laengster Kandidat)`,
            grund: fehler,
          });
        }
      }
    });
  }
  return { befunde, gepruefte };
}
