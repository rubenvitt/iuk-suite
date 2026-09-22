import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { statSync } from "node:fs";
import path from "node:path";

/**
 * DIE PORTS DER DREI PLAYWRIGHT-PROFILE — EINE QUELLE, JE ARBEITSKOPIE EIN BLOCK
 * (DRK-346).
 *
 * Bis hierhin standen 3100/3101/3102/3310 als Literale in der Konfiguration und
 * in rund 140 Stellen der Specs. Zwei Worktrees konnten deshalb nicht
 * gleichzeitig End-to-End fahren: der zweite Lauf scheiterte an Playwrights
 * „is already used", und die Meldung verschweigt, WEM der Port gehört. An einem
 * einzigen Tag wurden so mindestens vier fremde Läufe beendet, jedes Mal in der
 * Annahme, es sei ein verwaister eigener Rest.
 *
 * DIE VERGABE, in dieser Reihenfolge:
 *
 * 1. `E2E_PORT` gesetzt → das ist der Web-Port; die drei anderen liegen direkt
 *    dahinter (+1 PWA, +2 Rückmeldung, +3 Fake-clamd). Der Ausweg, wenn zwei
 *    Worktree-Pfade zufällig im selben Block landen.
 *
 *    ⚠️ +2 HIESS BIS DRK-453 `umfragen` (Formbricks). Die Einbindung ist weg,
 *    der Slot nicht: an seiner Stelle steht jetzt das Profil des externen
 *    Rückmeldeformulars, das aus demselben Grund ein eigenes braucht — eine
 *    Umgebungsvariable, die die normale Suite nicht haben darf. Wer in älteren
 *    Notizen `playwright.umfragen.config.ts` sucht, findet
 *    `playwright.rueckmeldung.config.ts`.
 * 2. Hauptcheckout (`.git` ist ein VERZEICHNIS) → die alten Zahlen, unverändert.
 *    Das ist auch die CI (`actions/checkout` legt ein echtes `.git` an); jede
 *    Doku, die 3100 nennt, bleibt dort richtig.
 * 3. Worktree (`.git` ist eine DATEI) → ein fester Block aus dem Pfad:
 *    Web-Port 4100–4990 in Zehnerschritten. Zehnerschritte, damit der Block
 *    eines Worktrees nie in den eines anderen hineinragt.
 *
 * ⚠️ BEWUSST ABGELEITET UND NICHT DYNAMISCH VERGEBEN: diese Datei wird in
 * mehreren Prozessen ausgewertet — Playwrights Hauptprozess, jeder
 * Test-Arbeiter, und die Vitest-Tore, die `playwright.config.ts` importieren.
 * Ein „nimm den nächsten freien Port" ergäbe in jedem Prozess eine andere Zahl,
 * und der Test riefe einen Server auf, den es nicht gibt. Ein Hash des Pfades
 * ist in allen Prozessen derselbe.
 *
 * NUR `node:*` — kein `@playwright/test`. Diese Datei wird von der Konfiguration
 * importiert und damit mittelbar auch von Vitest (dieselbe Regel wie
 * `avModus.ts`).
 */

export interface E2EPorts {
  /** `next dev` des Haupt-Profils (`playwright.config.ts`). */
  readonly web: number;
  /** `next start` des PWA-Profils (`playwright.pwa.config.ts`). */
  readonly pwa: number;
  /** `next dev` des Rückmeldungs-Profils (`playwright.rueckmeldung.config.ts`). */
  readonly rueckmeldung: number;
  /** Der Fake-clamd aus `scripts/fake-clamd.mjs`, Haupt-Profil. */
  readonly clamd: number;
}

/** Die Zahlen des Hauptcheckouts — so, wie sie vor DRK-346 überall standen. */
export const HAUPTCHECKOUT_PORTS: E2EPorts = { web: 3100, pwa: 3101, rueckmeldung: 3102, clamd: 3310 };

/** Erster Web-Port eines Worktree-Blocks. */
export const WORKTREE_BASIS = 4100;
/** Anzahl der Blöcke; der letzte beginnt bei 4990. */
export const WORKTREE_BLOECKE = 90;

function blockAb(web: number): E2EPorts {
  return { web, pwa: web + 1, rueckmeldung: web + 2, clamd: web + 3 };
}

/** Der Block eines Worktrees — stabil für denselben Pfad, gestreut über alle. */
export function worktreeBlock(wurzel: string): number {
  const hash = createHash("sha256").update(wurzel).digest().readUInt32BE(0);
  return WORKTREE_BASIS + 10 * (hash % WORKTREE_BLOECKE);
}

/**
 * Die reine Entscheidung, ohne Dateisystem — damit sie sich prüfen lässt, ohne
 * einen Worktree anzulegen.
 */
export function ermittlePorts(eingabe: {
  readonly wurzel: string;
  readonly istWorktree: boolean;
  readonly vorgabe?: string;
}): E2EPorts {
  const roh = eingabe.vorgabe?.trim();
  if (roh) {
    const web = Number(roh);
    // Laut statt still: ein Tippfehler hier ergäbe sonst `NaN` in jeder URL,
    // und jeder Test scheiterte an einer Meldung, die nach DNS klingt.
    if (!Number.isInteger(web) || web < 1024 || web > 65532) {
      throw new Error(`E2E_PORT="${roh}" ist kein Port zwischen 1024 und 65532.`);
    }
    return web === HAUPTCHECKOUT_PORTS.web ? HAUPTCHECKOUT_PORTS : blockAb(web);
  }
  if (!eingabe.istWorktree) return HAUPTCHECKOUT_PORTS;
  return blockAb(worktreeBlock(eingabe.wurzel));
}

/** Die Wurzel dieser Arbeitskopie — `e2e/helpers/` liegt zwei Ebenen darunter. */
const WURZEL = path.resolve(__dirname, "..", "..");

function istWorktree(wurzel: string): boolean {
  try {
    return statSync(path.join(wurzel, ".git")).isFile();
  } catch {
    // Kein `.git` (entpacktes Archiv, Docker-Kontext): wie der Hauptcheckout.
    return false;
  }
}

export const E2E_PORTS: E2EPorts = ermittlePorts({
  wurzel: WURZEL,
  istWorktree: istWorktree(WURZEL),
  vorgabe: process.env.E2E_PORT,
});

/** Kurzform für die Specs: der Web-Port des Haupt-Profils. */
export const E2E_PORT = E2E_PORTS.web;

// ---------------------------------------------------------------------------
// Belegte Ports: WER hält sie?
// ---------------------------------------------------------------------------

export interface Halter {
  readonly port: number;
  readonly pid: string;
  readonly kommando: string;
  readonly verzeichnis: string;
}

function lsof(argumente: string[]): string | null {
  try {
    return execFileSync("lsof", argumente, { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
  } catch {
    // Exit 1 heißt bei lsof „nichts gefunden"; ein fehlendes lsof landet hier
    // ebenso. Beides: keine Aussage, Playwrights eigene Prüfung bleibt.
    return null;
  }
}

/** Liest `-F`-Ausgabe von lsof: je Zeile ein Kennbuchstabe plus Wert. */
function feld(ausgabe: string | null, kenner: string): string | undefined {
  return ausgabe
    ?.split("\n")
    .find((zeile) => zeile.startsWith(kenner))
    ?.slice(1);
}

/** Wer lauscht auf diesem Port — mit Arbeitsverzeichnis, oder `null`, wenn keiner. */
export function halterVon(port: number): Halter | null {
  const pid = lsof(["-nP", `-iTCP:${port}`, "-sTCP:LISTEN", "-t"])?.split("\n")[0]?.trim();
  if (!pid) return null;
  // `-a -d cwd`: nur der Eintrag des Arbeitsverzeichnisses; `ps` gibt es nicht her.
  const angaben = lsof(["-a", "-p", pid, "-d", "cwd", "-Fcn"]);
  return {
    port,
    pid,
    kommando: feld(angaben, "c") ?? "?",
    verzeichnis: feld(angaben, "n") ?? "(unbekannt)",
  };
}

/** Die Meldung für belegte Ports — rein, damit ihr Wortlaut prüfbar ist. */
export function belegtMeldung(halter: readonly Halter[], eigeneWurzel: string): string {
  const zeilen = halter.map((h) => {
    // Gleichheit, kein Präfix: die Worktrees liegen UNTER dem Hauptcheckout
    // (`.claude/worktrees/…`), ein Präfixvergleich hielte sie für eigene.
    const eigen = h.verzeichnis === eigeneWurzel;
    return `  Port ${h.port}: PID ${h.pid} (${h.kommando}) in ${h.verzeichnis}${eigen ? "  ← DIESE Arbeitskopie" : "  ← FREMDE Arbeitskopie"}`;
  });
  return [
    "E2E-Ports sind belegt (DRK-346):",
    ...zeilen,
    "",
    `Diese Arbeitskopie: ${eigeneWurzel}`,
    "Gehört der Halter einer FREMDEN Arbeitskopie, läuft dort gerade ein Test — nicht beenden,",
    "sondern warten oder mit E2E_PORT=<web-port> einen anderen Block wählen (+1..+3 werden mitbelegt).",
    "Gehört er DIESER Arbeitskopie, ist es ein Rest eines eigenen Laufs (oder ein `pnpm dev`).",
  ].join("\n");
}

/**
 * Bricht mit Namen und Arbeitsverzeichnis des Halters ab, wenn einer der Ports
 * belegt ist. Aufgerufen beim Laden der Konfiguration, weil Playwright seine
 * `webServer`-Probe VOR `globalSetup` und vor jedem `command` fährt — ein
 * Vorspann im `command` käme nie zum Zug.
 */
export function pruefePortsFrei(ports: readonly number[]): void {
  // Nur im Hauptprozess eines echten Laufs: ein Test-Arbeiter sieht die Ports
  // zu Recht belegt (von den eigenen Servern), und Vitest importiert die
  // Konfiguration nur, um sie zu lesen.
  if (process.env.TEST_WORKER_INDEX !== undefined || process.env.VITEST) return;
  if (!process.argv.includes("test") || process.argv.includes("--list")) return;
  const halter = ports.map(halterVon).filter((h): h is Halter => h !== null);
  if (halter.length === 0) return;
  const fehler = new Error(belegtMeldung(halter, WURZEL));
  // Ohne Stapel: zwanzig Zeilen Playwright-Lader darunter drückten die Meldung
  // aus dem Blick, und die Stelle ist ohnehin immer dieselbe.
  fehler.stack = fehler.message;
  throw fehler;
}
