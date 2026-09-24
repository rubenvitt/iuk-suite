/**
 * DAS TOR FUER REGEL 1: KEIN NEUER ZEILENANKER INS EIGENE REPO (DRK-474).
 *
 * `CLAUDE.md` sagt seit DRK-192: ein Anker in dieses Repo nennt einen NAMEN,
 * keine Zeile. Gemessen am 24.09.2026 kamen in den acht Tagen danach trotzdem
 * 81 neue Zeilenanker dazu, fast alle in `m/radio` — die Regel stand da, und
 * nichts bemerkte, dass sie nicht befolgt wurde. Der Riegel in
 * `core/kommentaranker.test.ts` prueft nur, ob die Zeile EXISTIERT; der Melder
 * `anker-drift.ts` laeuft bewusst von Hand.
 *
 * ⚠️ „NEU" OHNE BESTANDSLISTE — das war die offene Frage im Ticket, und die
 * Antwort ist der DIFF DES PRS SELBST, nicht ein Zaehler und nicht eine Liste:
 *
 *   - Rund 3200 Zeilenanker stehen im Bestand. Eine Liste davon, die nur
 *     schrumpfen darf, ist genau die Bauform, die DRK-192 „eine Liste, die
 *     niemand nachfuehrt" nennt; ein Zaehler ist dieselbe Liste ohne Namen.
 *   - Der CI-Checkout eines `pull_request` IST ein Merge-Commit: Eltern 1 ist
 *     `main`, Eltern 2 der Zweig. Mit `fetch-depth: 2` liegen beide da, und
 *     `git diff HEAD^1` ist exakt das, was der PR hinzufuegt. Unzuverlaessig
 *     ist nur der Tiefe-1-Klon der `vitest`-Shards — deshalb ist das hier ein
 *     Skript im `lint`-Job und KEIN Vitest-Fall.
 *
 * WAS ALS NEU ZAEHLT: ein Anker auf einer hinzugefuegten Zeile, der sich gegen
 * dieses Repo aufloesen laesst (eindeutig ODER als mehrdeutiges Suffix — also
 * genau das, was der Riegel „geprueft" nennt) und der NICHT auf einer im selben
 * Diff entfernten Zeile schon stand. Die letzte Bedingung ist der Unterschied
 * zwischen einem Tor und einer Strafe fuers Anfassen: wer einen Kommentar
 * umformuliert oder verschiebt, bringt keinen neuen Anker in die Welt.
 *
 * WAS BEWUSST DURCHGEHT:
 *
 *   - Anker in die Alt-Anwendung und in Fremdpakete (Regel 2) — sie loesen
 *     nicht auf, dieselbe Grenze wie im Riegel.
 *   - Der nackte Dateiname (`routing.ts` mit Zeile): zwischen Repos
 *     mehrdeutig, siehe `EINDEUTIGES_SUFFIX`. Ein Tor, das Falsches meldet,
 *     wird abgeschaltet statt gelesen.
 *   - STAPEL- UND COMPILERMELDUNGEN, erkennbar an der Spalte hinter der Zeile.
 *     Sie zitieren, was ein Werkzeug gesagt hat; eine Namensform gibt es dafuer
 *     nicht.
 *
 * ⚠️ TESTS SIND NICHT AUSGENOMMEN. Ein Test, der eine Zeile festhalten will,
 * nennt einen erfundenen Pfad (`probe…`) — die Form, die
 * `core/kommentaranker.test.ts` fuer seine eigenen Beispiele vorschreibt.
 *
 * ⚠️ DIE ABHILFE IST DIE NAMENSFORM, NIE EINE AUSNAHME: `_db/schema.ts`, Feld
 * `lastUsedAt` statt einer Zeilenspanne. Ein Anker, der ohnehin nachgezogen
 * werden muss (Regel 3), wird dabei zum Namen, nicht zur neuen Zahl.
 *
 * AUFRUF:
 *   pnpm anker:neu                    — gegen die Merge-Basis mit `origin/main`,
 *                                        Arbeitsbaum und ungetrackte Dateien inklusive
 *   pnpm anker:neu --basis HEAD^1     — so ruft ihn CI auf dem PR-Merge-Commit
 */
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

import {
  NICHT_GELESENE_PFADE,
  ZIEL,
  ankerAusText,
  aufloesen,
  istQuelle,
  obergrenzeVon,
} from "../src/core/kommentaranker";

export type NeuerAnker = { quelle: string; zeile: number; anker: string };

/** Liest der Riegel diese Datei als Quelle? Dieselbe Auswahl, sonst meldeten beide Verschiedenes. */
export function zaehltAlsQuelle(pfad: string): boolean {
  return istQuelle(pfad) && !NICHT_GELESENE_PFADE.some((r) => r.test(pfad));
}

/**
 * Die Anker einer Zeile OHNE Stapel- und Compilermeldungen.
 *
 * ⚠️ DIE SPALTE STEHT DIREKT HINTER DER ZEILE, ohne Backtick oder Leerzeichen —
 * und `ZIEL` liest sie deshalb schon heute nicht als Fortsetzung (siehe dort,
 * Warnung zum Doppelpunkt-Zweig). Ein Treffer, hinter dem unmittelbar ein
 * Doppelpunkt mit Ziffer folgt, ist also eine Diagnose, kein Anker.
 */
export function ankerOhneMeldungen(text: string): ReturnType<typeof ankerAusText> {
  const bereinigt = text.replace(ZIEL, (treffer: string, ...rest: unknown[]) => {
    const stelle = rest.at(-2) as number;
    const ganz = rest.at(-1) as string;
    return /^:\d/.test(ganz.slice(stelle + treffer.length)) ? " ".repeat(treffer.length) : treffer;
  });
  return ankerAusText(bereinigt);
}

function schluessel(a: { ziel: string; von: number; bis: number }): string {
  return `${a.ziel}:${a.von === a.bis ? a.von : `${a.von}-${a.bis}`}`;
}

/**
 * Die reine Rechnung: aus einem `git diff --unified=0` die neuen Zeilenanker.
 * `insRepo` entscheidet, ob ein Ziel in DIESES Repo zeigt — im Lauf ist das
 * die Aufloesung des Riegels, im Test eine Attrappe.
 *
 * ⚠️ HINZUGEFUEGT HEISST: eine `+`-Zeile INNERHALB eines Hunks. Der Kopf eines
 * Dateiblocks traegt ebenfalls eine `+++`-Zeile, und eine Quelltextzeile, die
 * selbst mit `++` beginnt, sieht im Diff genauso aus. Unterschieden wird
 * deshalb am Zustand (Kopf bis zum ersten `@@`), nicht am Praefix.
 */
export function neueAnker(
  diff: string,
  insRepo: (quelle: string, ziel: string) => boolean,
): NeuerAnker[] {
  const entfernt = new Map<string, number>();
  const hinzu: (NeuerAnker & { schluessel: string })[] = [];

  let quelle: string | null = null;
  let imHunk = false;
  let zeile = 0;

  for (const roh of diff.split("\n")) {
    if (roh.startsWith("diff --git ")) {
      quelle = null;
      imHunk = false;
      continue;
    }
    if (!imHunk) {
      if (roh.startsWith("+++ ")) {
        const pfad = roh.slice(4);
        quelle = pfad.startsWith("b/") ? pfad.slice(2) : null; // `/dev/null` = geloescht
      }
    }
    const kopf = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(roh);
    if (kopf !== null) {
      imHunk = true;
      zeile = Number(kopf[1]);
      continue;
    }
    if (!imHunk) continue;

    if (roh.startsWith("-")) {
      for (const a of ankerOhneMeldungen(roh.slice(1))) {
        const s = schluessel(a);
        entfernt.set(s, (entfernt.get(s) ?? 0) + 1);
      }
    } else if (roh.startsWith("+")) {
      if (quelle !== null && zaehltAlsQuelle(quelle)) {
        for (const a of ankerOhneMeldungen(roh.slice(1))) {
          const s = schluessel(a);
          if (insRepo(quelle, a.ziel)) hinzu.push({ quelle, zeile, anker: s, schluessel: s });
        }
      }
      zeile++;
    } else if (roh.startsWith(" ")) {
      zeile++;
    }
  }

  // Verschoben oder umformuliert ist nicht neu: jeder entfernte Anker gleicht
  // genau EINEN hinzugefuegten aus, gleich in welcher Datei.
  const neu: NeuerAnker[] = [];
  for (const { schluessel: s, ...rest } of hinzu) {
    const offen = entfernt.get(s) ?? 0;
    if (offen > 0) entfernt.set(s, offen - 1);
    else neu.push(rest);
  }
  return neu;
}

/** Eine ungetrackte Datei als Diff, in dem jede Zeile hinzugefuegt ist. */
export function alsNeueDatei(pfad: string, inhalt: string): string {
  const zeilen = inhalt.split("\n");
  if (zeilen.at(-1) === "") zeilen.pop();
  return [`diff --git a/${pfad} b/${pfad}`, "--- /dev/null", `+++ b/${pfad}`, `@@ -0,0 +1,${zeilen.length} @@`,
    ...zeilen.map((z) => `+${z}`)].join("\n");
}

function git(...argumente: string[]): string {
  return execFileSync("git", argumente, {
    encoding: "utf8",
    maxBuffer: 256 << 20,
    stdio: ["ignore", "pipe", "pipe"],
  });
}

function main(): void {
  const i = process.argv.indexOf("--basis");
  const lokal = i === -1;
  const angegeben = lokal ? "origin/main" : (process.argv[i + 1] ?? "");

  /*
   * ⚠️ OHNE BASIS KEIN GRUEN. Scheitert die Aufloesung — flacher Klon, fehlendes
   * `origin/main` —, bricht das Skript ROT ab. Ein Tor, das bei fehlender
   * Grundlage still „0 neue Anker" meldet, sieht genau dann gruen aus, wenn es
   * nichts geprueft hat.
   */
  let basis: string;
  try {
    basis = lokal
      ? git("merge-base", "HEAD", angegeben).trim()
      : git("rev-parse", "--verify", `${angegeben}^{commit}`).trim();
  } catch (fehler) {
    console.error(
      `Keine Basis fuer den Vergleich: „${angegeben}" liess sich nicht aufloesen. `
        + "In CI braucht der Checkout `fetch-depth: 2`; lokal hilft "
        + "`git fetch origin main`.\n"
        + String((fehler as { stderr?: string }).stderr ?? fehler),
    );
    process.exitCode = 1;
    return;
  }

  // Gegen den ARBEITSBAUM, nicht gegen HEAD: in CI ist beides dasselbe, lokal
  // sieht man so auch, was noch nicht festgeschrieben ist.
  let diff = git(
    "-c", "core.quotePath=false",
    "diff", "--no-color", "--no-ext-diff", "--unified=0", "-M",
    "--src-prefix=a/", "--dst-prefix=b/", basis,
  );
  if (lokal) {
    const ungetrackt = git("ls-files", "--others", "--exclude-standard", "-z").split("\0").filter((p) => p !== "");
    for (const pfad of ungetrackt.filter(zaehltAlsQuelle)) {
      diff += `\n${alsNeueDatei(pfad, readFileSync(pfad, "utf8"))}`;
    }
  }

  const neu = neueAnker(diff, (quelle, ziel) => aufloesen(quelle, ziel) !== null || obergrenzeVon(ziel) !== null);

  if (neu.length === 0) {
    console.log(`Kein neuer Zeilenanker ins eigene Repo seit ${basis.slice(0, 8)}.`);
    return;
  }

  for (const n of neu) console.log(`${n.quelle}:${n.zeile} → ${n.anker}`);
  console.error(
    `\n${neu.length} neue${neu.length === 1 ? "r" : ""} Zeilenanker ins eigene Repo seit ${basis.slice(0, 8)}.\n\n`
      + "Regel 1 in CLAUDE.md: ein Anker in dieses Repo nennt einen NAMEN, keine Zeile —\n"
      + "`_db/schema.ts`, Feld `lastUsedAt` statt einer Zeilenspanne. Eine Zeilennummer zeigt nach\n"
      + "dem naechsten Bau still auf eine andere Aussage (DRK-204: ein Bau, 25 tote Belege).\n"
      + "Anker in die Alt-Anwendung nennen deren Repo mit (Regel 2) und sind hier nicht gemeint.",
  );
  process.exitCode = 1;
}

// Nur beim direkten Aufruf ausfuehren, nicht beim Import aus einem Test —
// dieselbe Form wie `anker-drift.ts`.
if (process.argv[1]?.endsWith("anker-neu.ts")) main();
