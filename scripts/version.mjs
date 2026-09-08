#!/usr/bin/env node
/**
 * Welche Version ist dieser Commit?
 *
 * Gerufen vom Job `version` in `.github/workflows/ci.yml`, und von Hand genauso:
 *
 *   node scripts/version.mjs            # Version von HEAD, mit Herleitung
 *   node scripts/version.mjs <commit>   # Version eines anderen Standes
 *
 * Runbook mit Regeln, Rollback über Versionstag und Fehlerbildern:
 *   docs/runbooks/versionierung.md
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * DIE VERSION FOLGT AUS DER HISTORIE, NICHT AUS EINER DATEI — und das ist der ganze
 * Entwurf. Drei Eigenschaften hängen daran:
 *
 *  1. KEIN BOT-COMMIT. Eine Version in `package.json` müsste bei jedem Merge von einem
 *     Bot nachgezogen werden; das verdoppelte die Historie auf `main` und stieße jedes
 *     Mal die CI neu an. `package.json` bleibt deshalb unangetastet und ist NICHT die
 *     Quelle der Wahrheit — der Tag `vX.Y.Z` auf `main` ist es.
 *
 *  2. ZWEI GLEICHZEITIGE LÄUFE KOLLIDIEREN NICHT. Zwei Merges kurz nacheinander starten
 *     zwei Läufe, und beide sehen denselben letzten Tag. Rechnete man „letzter Tag plus
 *     größter Sprung seitdem", bekämen beide dieselbe Nummer und der zweite Tag-Push
 *     schlüge fehl. Deshalb wird die First-Parent-Kette seit dem Tag SCHRITT FÜR SCHRITT
 *     nachgespielt: jeder Schritt auf `main` (ein Merge-Commit oder ein direkter Push)
 *     ist ein Sprung. Der zweite Lauf hat einen Schritt mehr in seiner Historie und
 *     rechnet damit zwangsläufig eine andere Nummer aus — unabhängig davon, ob der erste
 *     Lauf seinen Tag schon gesetzt hat.
 *
 *  3. JEDER STAND AUF `main` HAT EINE NUMMER, auch ein reiner Doku- oder
 *     Dependabot-Merge: er ergibt ein ausgeliefertes Image, und ein Image ohne Nummer
 *     wäre wieder nur ein SHA. Der kleinste Sprung ist deshalb Patch, nie „kein Sprung".
 *
 * DER SPRUNG JE SCHRITT ist der größte über alle Commits, die der Schritt mitbringt
 * (bei einem Merge-Commit: die Commits des PRs), nach Conventional Commits:
 *   `feat!:` / `fix!:` / Fußzeile `BREAKING CHANGE:`  → Major
 *   `feat:` / `feat(modul):`                           → Minor
 *   alles andere                                        → Patch
 *
 * GIBT ES NOCH KEINEN TAG, ist dieser Commit `1.0.0`. Das ist der einmalige Anfang und
 * bewusst keine Rechnung über die ganze Historie: die zählte Dutzende `feat`-Commits
 * und ergäbe eine Nummer ohne Aussage.
 *
 * LÜCKEN IN DER ZÄHLUNG SIND EHRLICH. Scheitert ein Lauf vor dem Tag (roter Build,
 * roter Smoke), bleibt seine Nummer unbesetzt — der nächste Schritt rechnet sie mit,
 * bekommt also die übernächste. Eine fehlende Nummer heißt: dieses Image gab es nie.
 *
 * WARUM `.mjs` UND NICHT `.ts`: der Job `version` soll ohne `pnpm install` auskommen —
 * ein Skript ohne Abhängigkeiten, das Node direkt ausführt. `scripts/fake-clamd.mjs`
 * geht denselben Weg. Geprüft wird es trotzdem von Vitest (`scripts/version.test.ts`),
 * das ESM aus einem Test heraus lädt wie jedes andere Modul.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

/** @typedef {"major" | "minor" | "patch"} Sprung */
/** @typedef {{ major: number; minor: number; patch: number }} Version */

const RANG = { patch: 0, minor: 1, major: 2 };

/**
 * Nur Tags dieser Form zählen als Version. `--match` in `git describe` nimmt ein
 * Glob, kein Regex — deshalb steht das Muster dort etwas gröber (`v[0-9]*`), und
 * hier wird nachgeprüft.
 */
const TAG_MUSTER = /^v(\d+)\.(\d+)\.(\d+)$/;

/**
 * @param {string} tag
 * @returns {Version}
 */
export function parseTag(tag) {
  const m = TAG_MUSTER.exec(tag);
  if (!m) throw new Error(`Kein Versionstag: "${tag}" (erwartet vX.Y.Z)`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/** @param {Version} v */
export function formatVersion(v) {
  return `${v.major}.${v.minor}.${v.patch}`;
}

/**
 * Der Sprung, den EINE Commit-Nachricht verlangt.
 *
 * Kopfzeile nach Conventional Commits: `typ(bereich)!: betreff`. Bereich und `!`
 * sind optional. Eine Nachricht ohne diese Form (etwa „Umbenennung in IDA: …") ist
 * kein Fehler, sondern Patch — sie beschreibt eine Änderung, die ausgeliefert wird,
 * nur eben keine neue Fähigkeit.
 *
 * `BREAKING CHANGE:` bzw. `BREAKING-CHANGE:` am Zeilenanfang im Rumpf zählt als
 * Major, wie in der Spezifikation. `revert:` bleibt Patch: was zurückgenommen wird,
 * ist ausgeliefert worden und wird wieder ausgeliefert.
 *
 * @param {string} nachricht Kopfzeile und Rumpf, wie `git log --format=%B` sie liefert
 * @returns {Sprung}
 */
export function sprungAusNachricht(nachricht) {
  const [kopf = "", ...rumpf] = nachricht.split("\n");
  const m = /^(\w+)(\([^)]*\))?(!)?:\s/.exec(kopf);
  if (m?.[3] === "!") return "major";
  if (rumpf.some((z) => /^BREAKING[ -]CHANGE:/.test(z))) return "major";
  if (m?.[1] === "feat") return "minor";
  return "patch";
}

/**
 * Der größte Sprung über mehrere Nachrichten — mindestens Patch, siehe Kopf (3).
 *
 * @param {readonly string[]} nachrichten
 * @returns {Sprung}
 */
export function groessterSprung(nachrichten) {
  /** @type {Sprung} */
  let ergebnis = "patch";
  for (const n of nachrichten) {
    const s = sprungAusNachricht(n);
    if (RANG[s] > RANG[ergebnis]) ergebnis = s;
  }
  return ergebnis;
}

/**
 * @param {Version} v
 * @param {Sprung} sprung
 * @returns {Version}
 */
export function erhoehe(v, sprung) {
  if (sprung === "major") return { major: v.major + 1, minor: 0, patch: 0 };
  if (sprung === "minor") return { major: v.major, minor: v.minor + 1, patch: 0 };
  return { major: v.major, minor: v.minor, patch: v.patch + 1 };
}

/**
 * Die Version, die aus einer Basis und einer Folge von Schritten wird — der reine
 * Kern ohne git, damit `version.test.ts` ihn ohne Repo befragen kann.
 *
 * @param {Version} basis
 * @param {readonly (readonly string[])[]} schritte je Schritt die Nachrichten seiner Commits
 * @returns {Version}
 */
export function spieleNach(basis, schritte) {
  let v = basis;
  for (const nachrichten of schritte) v = erhoehe(v, groessterSprung(nachrichten));
  return v;
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/**
 * Die Herleitung für einen Commit in einem Repo. `null` als `basis` heißt: es gibt
 * noch keinen Versionstag, und dieser Commit wird 1.0.0.
 *
 * @param {string} cwd Arbeitsverzeichnis im Repo
 * @param {string} ziel Commit, dessen Version gesucht ist
 * @returns {{ version: string; basis: string | null; schritte: { commit: string; sprung: Sprung; betreff: string }[] }}
 */
export function berechneVersion(cwd, ziel = "HEAD") {
  let basis = null;
  try {
    /*
     * `--first-parent`: nur Tags auf der `main`-Kette zählen. Ein Tag auf einem
     * PR-Zweig gäbe es nicht, aber wenn doch, verschöbe er sonst still die Basis.
     * `--abbrev=0`: nur der Tagname, ohne `-3-gabc1234`.
     * `--exclude "*-*"`: ein `v2.0.0-rc1` passt auf das Glob `v[0-9]*` und wäre sonst
     * die Basis — und `parseTag` würfe. Vorabversionen gibt es hier nicht; wer eine
     * anlegt, hält sie so aus der Rechnung heraus.
     */
    basis = git(
      ["describe", "--tags", "--match", "v[0-9]*", "--exclude", "*-*", "--abbrev=0", "--first-parent", ziel],
      cwd,
    ).trim();
  } catch (fehler) {
    const text = String(/** @type {{ stderr?: string }} */ (fehler).stderr ?? fehler);
    if (!/No names found|No tags can describe|cannot describe/i.test(text)) throw fehler;
  }
  if (basis === null) {
    return { version: "1.0.0", basis: null, schritte: [] };
  }

  const kette = git(["rev-list", "--first-parent", "--reverse", `${basis}..${ziel}`], cwd)
    .split("\n")
    .filter(Boolean);

  const schritte = kette.map((commit) => {
    /*
     * Alles, was dieser Schritt mitbringt: bei einem Merge-Commit die Commits des
     * PRs (erreichbar vom Merge, nicht vom ersten Elternteil), bei einem direkten
     * Push er selbst. `--format=%B%x00` trennt die Nachrichten mit NUL, weil ein
     * Rumpf selbst Leerzeilen enthalten darf.
     */
    const nachrichten = git(["log", "--format=%B%x00", `${commit}^1..${commit}`], cwd)
      .split("\0")
      .map((n) => n.trim())
      .filter(Boolean);
    const betreff = git(["log", "-1", "--format=%s", commit], cwd).trim();
    return { commit, sprung: groessterSprung(nachrichten), betreff };
  });

  let version = parseTag(basis);
  for (const s of schritte) version = erhoehe(version, s.sprung);
  return { version: formatVersion(version), basis, schritte };
}

/**
 * Menschenlesbare Herleitung fürs Protokoll und die Zusammenfassung des Laufs.
 *
 * @param {ReturnType<typeof berechneVersion>} ergebnis
 */
export function bericht(ergebnis) {
  const zeilen = [];
  if (ergebnis.basis === null) {
    zeilen.push("Kein Versionstag in der Historie — dieser Stand wird 1.0.0.");
  } else {
    zeilen.push(`Basis: ${ergebnis.basis}`);
    for (const s of ergebnis.schritte) {
      zeilen.push(`  ${s.commit.slice(0, 7)}  ${s.sprung.padEnd(5)}  ${s.betreff}`);
    }
    if (ergebnis.schritte.length === 0) {
      zeilen.push("  (keine Schritte seit dem Tag — dieser Commit IST der getaggte)");
    }
  }
  zeilen.push(`Version: ${ergebnis.version}`);
  return zeilen.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ziel = process.argv[2] ?? "HEAD";
  const ergebnis = berechneVersion(process.cwd(), ziel);
  console.log(bericht(ergebnis));
  /*
   * In der CI landet die Nummer als Job-Ausgabe und die Herleitung in der
   * Zusammenfassung. Bewusst hier und nicht per `$(node …)` im Workflow: eine
   * Hilfsausgabe auf stdout wäre dort still Teil der Versionsnummer.
   */
  if (process.env.GITHUB_OUTPUT) {
    // `basis` leer heißt: erster Tag. Der Job `release` lässt dann die PR-Liste weg.
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `version=${ergebnis.version}\nbasis=${ergebnis.basis ?? ""}\n`,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(
      process.env.GITHUB_STEP_SUMMARY,
      `### Version ${ergebnis.version}\n\n\`\`\`\n${bericht(ergebnis)}\n\`\`\`\n`,
    );
  }
}
