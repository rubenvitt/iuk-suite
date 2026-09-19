/**
 * DER MELDER FUER DRIFT INNERHALB DER DATEI (DRK-204).
 *
 * `core/kommentaranker.test.ts` prueft, ob ein Anker hinter das ENDE seiner
 * Datei zeigt. Das ist ein Boden, keine Decke, und der Riegel schreibt seinen
 * blinden Fleck selbst aus: waechst eine Datei UEBER der zitierten Stelle,
 * zeigt der Anker auf eine andere Zeile, die es weiterhin gibt. Kein EOF, kein
 * Treffer — und die Zusicherung haengt ab sofort an einer fremden Aussage.
 *
 * ⚠️ DAS IST DIE TEURERE HAELFTE, gemessen an DRK-204: ein einziger Bau hat 25
 * Belege in 16 verfolgten Dateien totgelegt, allein indem er drei Dateien
 * verlaengert hat. Sieben Stellen nannten denselben Falle-4-Scan an einer
 * Zeile, an der heute der Kopf eines ganz anderen `describe` steht — bei einer
 * Regel, deren einziger Beleg dieser Verweis ist. Wer der Zahl folgt, findet
 * den falschen Waechter und haelt die Regel fuer ungedeckt.
 *
 * WAS DAS WERKZEUG TUT — es ist der Prueflauf von Hand aus DRK-204, nur
 * ausgefuehrt statt beschrieben:
 *
 *   1. die Anker einsammeln (dieselbe Maschinerie wie der Riegel),
 *   2. ueber `git blame` den Commit finden, der die ANKERZEILE schrieb,
 *   3. die zitierte Spanne der ZIELdatei bei jenem Commit lesen,
 *   4. sie gegen dieselbe Spanne bei HEAD halten.
 *
 * Stimmen beide ueberein, hat der Anker die Einfuegungen seither ueberlebt.
 * Stimmen sie nicht, zeigt er heute auf etwas anderes als damals.
 *
 * ⚠️ DAS ERGEBNIS IST EIN VERDACHT, KEIN URTEIL, und das ist keine Bescheidenheit:
 * ein Anker darf mitwandern, wenn die Aussage mitgewandert ist — jemand hat die
 * zitierte Stelle umformuliert und den Anker korrekt nachgezogen. Der Melder
 * kann Umformulierung nicht von Verrutschen unterscheiden. Er zeigt die beiden
 * Spannen nebeneinander; entscheiden muss ein Mensch.
 *
 * ⚠️ UND DESHALB IST ER KEIN TOR. Gemessen am 19.09.2026 stehen 4214
 * Zeilenanker in `m/radio` und 595 in `m/lagerbuch`. Ein hartes Tor waere am
 * ersten Tag rot und wuerde abgeschaltet statt gelesen — genau die Fehlerklasse,
 * die `kommentaranker.test.ts` in seinem eigenen Kopf beschreibt („Ein Riegel,
 * der Falsches meldet, wird abgeschaltet statt gelesen"). Der Melder laeuft von
 * Hand, wenn jemand ein Modul aufraeumt.
 *
 * ⚠️ DIE ABHILFE IST NIE „DIE ZAHL NACHZIEHEN", sondern die NAMENSFORM:
 * `_db/schema.ts`, Feld `lastUsedAt` statt `_db/schema.ts:538-540`. Ein Name
 * ueberlebt jede Einfuegung; eine Zahl verrottet beim naechsten Bau wieder.
 * Das ist die Regel in `CLAUDE.md`, und dieser Melder ist ihr Messgeraet, nicht
 * ihre Umgehung.
 *
 * AUFRUF:
 *   pnpm anker:drift                     — das ganze Repo
 *   pnpm anker:drift src/app/m/radio     — nur Anker, die DORT stehen
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { relative, resolve } from "node:path";

import { ankerAusText, aufloesen, sammleQuellen } from "../src/core/kommentaranker";

const WURZEL = resolve(".");

/**
 * ⚠️ `maxBuffer` STEHT HIER NICHT VORSICHTSHALBER: `git blame --porcelain` gibt
 * fuer eine grosse Datei ein Vielfaches ihres Inhalts aus (je Zeile ein Kopf
 * mit Commit, Autor, Zeitstempel). Mit der Node-Vorgabe von 1 MB reisst der
 * Aufruf mitten im Lauf ab, und zwar als Ausnahme ueber die ganze Datei statt
 * als Befund — dieselbe Lehre wie beim `ls-files` der Maschinerie.
 */
function git(...argumente: string[]): string | null {
  try {
    return execFileSync("git", argumente, {
      encoding: "utf8",
      maxBuffer: 256 << 20,
      stdio: ["ignore", "pipe", "ignore"],
    });
  } catch {
    return null;
  }
}

/**
 * Je Zeile einer Datei der Commit, der sie zuletzt geschrieben hat.
 *
 * ⚠️ EIN BLAME JE DATEI, NICHT JE ANKER. Der naheliegende Weg (`blame -L n,n`
 * pro Treffer) ist derselbe Befund mal tausend Prozessstarts; `--porcelain`
 * liefert alle Zeilen in einem Lauf. Bei 4214 Ankern in `m/radio` ist das der
 * Unterschied zwischen einem Werkzeug, das jemand benutzt, und einem, das
 * niemand abwartet.
 */
function blameJeZeile(pfad: string): Map<number, string> {
  const roh = git("blame", "--porcelain", "--", pfad);
  return roh === null ? new Map() : blameZeilen(roh);
}

/**
 * Die reine Haelfte davon: aus der `--porcelain`-Ausgabe die Zuordnung
 * Zeile → Commit. Ausgelagert, weil nur sie pruefbar ist — der Aufruf daneben
 * startet `git`.
 */
export function blameZeilen(roh: string): Map<number, string> {
  const zuordnung = new Map<number, string>();
  for (const zeile of roh.split("\n")) {
    // Kopfzeile einer Gruppe: `<sha> <alt> <neu> [<anzahl>]`.
    const treffer = /^([0-9a-f]{40}) \d+ (\d+)(?: \d+)?$/.exec(zeile);
    if (treffer === null) continue;
    /*
     * ⛔ VIERZIG NULLEN SIND KEIN COMMIT, SONDERN „NOCH NICHT EINGECHECKT"
     * (Codex-Review zu PR #210). `git blame` setzt sie fuer jede Zeile, die im
     * Arbeitsbaum steht und noch nirgends festgeschrieben ist.
     *
     * ⚠️ DER MELDER WAR DAMIT BLIND, GENAU WENN MAN IHN BRAUCHT: die Regex nahm
     * die Nullen als echten Commit, `git show 0000…:<pfad>` scheiterte, und der
     * Anker fiel STILL heraus — nicht einmal unter `ohneBlame` gezaehlt. Wer
     * nach einem Aufraeumen prueft, ob seine frisch geaenderten Anker sitzen,
     * bekam also einen Bericht, der ausgerechnet DIESE ausliess. Ein Werkzeug,
     * das im Regelfall seiner Benutzung schweigt, ist schlimmer als keines.
     */
    if (/^0{40}$/.test(treffer[1])) continue;
    zuordnung.set(Number(treffer[2]), treffer[1]);
  }
  return zuordnung;
}

/** Der Inhalt einer Datei bei einem Commit — `null`, wenn es sie dort nicht gab. */
const beiCommit = new Map<string, string[] | null>();
function inhaltBei(sha: string, pfad: string): string[] | null {
  const schluessel = `${sha}:${pfad}`;
  if (!beiCommit.has(schluessel)) {
    const roh = git("show", `${sha}:${pfad}`);
    beiCommit.set(schluessel, roh === null ? null : roh.split("\n"));
  }
  return beiCommit.get(schluessel) ?? null;
}

const imArbeitsbaum = new Map<string, string[]>();
function inhaltHeute(pfad: string): string[] {
  if (!imArbeitsbaum.has(pfad)) imArbeitsbaum.set(pfad, readFileSync(pfad, "utf8").split("\n"));
  return imArbeitsbaum.get(pfad) ?? [];
}

/**
 * Die zitierte Spanne, auf das Wesentliche normalisiert.
 *
 * ⚠️ OHNE NORMALISIERUNG MELDET DER MELDER EINRUECKUNG. Ein `prettier`-Lauf
 * oder ein Block, der eine Ebene tiefer rutscht, aendert jede Zeile der Spanne,
 * ohne dass die Aussage sich bewegt haette — das waeren tausende Befunde, die
 * alle nichts bedeuten, und der Melder waere nach dem ersten Lauf erledigt.
 * Verglichen wird deshalb der Text ohne fuehrenden und folgenden Leerraum, und
 * leere Zeilen fallen ganz heraus.
 */
export function spanne(zeilen: string[], von: number, bis: number): string {
  return zeilen
    .slice(von - 1, bis)
    .map((z) => z.trim())
    .filter((z) => z !== "")
    .join("\n");
}

type Verdacht = {
  quelle: string;
  zeile: number;
  anker: string;
  ziel: string;
  sha: string;
  damals: string;
  heute: string;
};

export function kuerzen(text: string, zeilen = 3): string {
  const teile = text.split("\n");
  // 95 + das Auslassungszeichen = 96, also genau die Schwelle darueber. Ein
  // Ergebnis, das kuerzer ausfaellt als die Grenze, die es nennt, liest sich
  // beim naechsten Mal wie ein Rechenfehler.
  const kopf = teile.slice(0, zeilen).map((z) => (z.length > 96 ? `${z.slice(0, 95)}…` : z));
  return teile.length > zeilen ? [...kopf, `  … (${teile.length - zeilen} weitere)`].join("\n") : kopf.join("\n");
}

function main(): void {
  const bereich = process.argv[2];
  const quellen = sammleQuellen().filter((p) => bereich === undefined || p.startsWith(bereich));

  if (quellen.length === 0) {
    console.error(`Keine Quelldatei unter „${bereich ?? "."}" — Pfad relativ zur Repowurzel angeben.`);
    process.exitCode = 1;
    return;
  }

  const verdachte: Verdacht[] = [];
  let geprueft = 0;
  let ohneBlame = 0;

  for (const quelle of quellen) {
    const zeilen = inhaltHeute(quelle);
    // Erst sehen, ob die Datei ueberhaupt einen Anker traegt — ein `blame` auf
    // jede Quelldatei des Repos kostet Minuten und beantwortet meist nichts.
    const treffer = zeilen.flatMap((text, i) => ankerAusText(text).map((a) => ({ anker: a, zeile: i + 1 })));
    if (treffer.length === 0) continue;

    const blame = blameJeZeile(quelle);

    for (const { anker, zeile } of treffer) {
      const pfad = aufloesen(quelle, anker.ziel);
      // Nicht aufloesbar heisst Alt-Anwendung oder Fremdpaket — dazu sagt der
      // Melder so wenig wie der Riegel (`kommentaranker.ts`, Kopf, Punkt 2).
      if (pfad === null) continue;
      const ziel = relative(WURZEL, pfad);
      /*
       * ⛔ EIN ANKER AUF DIE EIGENE DATEI WIRD MITGEPRUEFT, und hier stand
       * ein `continue` mit der Begruendung, er „bewege sich mit ihr" (Codex-
       * Review zu PR #210, P2). Das war ein Denkfehler: der Anker nennt eine
       * ZAHL, keine Entfernung. Wer zehn Zeilen über dem Ziel einfügt,
       * verschiebt das Ziel und laesst die Zahl stehen — genau die Drift, die
       * dieser Melder sucht. Und `git blame` traegt den Commit der
       * KOMMENTARZEILE auch dann richtig, wenn die Zeile selbst gewandert ist;
       * an die Spanne von damals kommt der Vergleich also heran.
       *
       * ⚠️ DAS IST KEIN RANDFALL. Ein Kommentar verweist am haeufigsten auf
       * seinen eigenen Nachbarn, und die Ausnahme nahm diese Haelfte still aus
       * der Zaehlung — der Bericht sah vollstaendig aus und war es nicht.
       */
      const sha = blame.get(zeile);
      if (sha === undefined) {
        ohneBlame++;
        continue;
      }

      const damalsDatei = inhaltBei(sha, ziel);
      // Gab es die Zieldatei bei jenem Commit noch nicht (oder unter anderem
      // Namen), ist nichts zu vergleichen — kein Befund, keine Falschmeldung.
      if (damalsDatei === null) continue;

      const damals = spanne(damalsDatei, anker.von, anker.bis);
      const heute = spanne(inhaltHeute(pfad), anker.von, anker.bis);
      // Eine leere Spanne bei HEAD faengt bereits der Riegel als EOF-Fall.
      if (damals === "") continue;

      geprueft++;
      if (damals !== heute) {
        const bereich = anker.bis === anker.von ? `${anker.von}` : `${anker.von}-${anker.bis}`;
        verdachte.push({ quelle, zeile, anker: `${anker.ziel}:${bereich}`, ziel, sha, damals, heute });
      }
    }
  }

  const nachDatei = new Map<string, Verdacht[]>();
  for (const v of verdachte) nachDatei.set(v.quelle, [...(nachDatei.get(v.quelle) ?? []), v]);

  for (const [quelle, liste] of [...nachDatei].sort((a, b) => b[1].length - a[1].length)) {
    console.log(`\n\x1b[1m${quelle}\x1b[0m — ${liste.length} Verdacht${liste.length === 1 ? "" : "e"}`);
    for (const v of liste) {
      console.log(`\n  Zeile ${v.zeile}: \x1b[36m${v.anker}\x1b[0m → ${v.ziel}`);
      console.log(`  geschrieben in ${v.sha.slice(0, 8)}, dort stand dort:`);
      console.log(`\x1b[32m${kuerzen(v.damals).replace(/^/gm, "    ")}\x1b[0m`);
      console.log(`  heute steht dort:`);
      console.log(`\x1b[31m${kuerzen(v.heute).replace(/^/gm, "    ")}\x1b[0m`);
    }
  }

  const umfang = bereich === undefined ? "im Repo" : `unter „${bereich}"`;
  console.log(
    `\n${verdachte.length} Verdacht${verdachte.length === 1 ? "" : "e"} aus ${geprueft} vergleichbaren `
    + `Ankern ${umfang} (${quellen.length} Quelldateien gelesen).`,
  );
  if (ohneBlame > 0) {
    console.log(`${ohneBlame} Anker ohne blame — ungetrackte oder frisch geaenderte Zeilen.`);
  }
  console.log(
    "\nEin Verdacht ist KEIN Urteil: der Anker darf mitgewandert sein, wenn jemand ihn "
    + "nachgezogen hat.\nIst er es nicht, lautet die Abhilfe NAMENSFORM statt neuer Zahl "
    + "— sonst verrottet er beim naechsten Bau erneut.",
  );
}

// Nur beim direkten Aufruf ausführen, nicht beim Import aus einem Test —
// dieselbe Form wie `seed-lokal.ts`. Ohne die Probe zöge ein `import` den
// ganzen Repo-Scan mit, und der Test dauerte Minuten statt Millisekunden.
if (process.argv[1]?.endsWith("anker-drift.ts")) main();
