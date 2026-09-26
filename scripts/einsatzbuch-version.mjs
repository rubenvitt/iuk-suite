#!/usr/bin/env node
/**
 * Löst dieser Stand ein Release der Einsatzbuch-Desktop-App aus, und mit welcher Version?
 *
 * Gerufen vom Job `release-version` in `.github/workflows/einsatzbuch.yml`, und von Hand genauso:
 *
 *   node scripts/einsatzbuch-version.mjs                 # Entscheidung für HEAD, mit Herleitung
 *   node scripts/einsatzbuch-version.mjs <commit>        # für einen anderen Stand
 *   node scripts/einsatzbuch-version.mjs --tag <tag>     # manueller Tag (Notfall-Release)
 *
 * Runbook: docs/runbooks/einsatzbuch-release.md, Abschnitt „Wann ein Merge ein Release auslöst“.
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * DIE REGEL
 *
 *  1. BASIS ist der höchste Tag `einsatzbuch-vX.Y.Z`, der von `ziel` aus erreichbar ist.
 *     Der höchste, nicht der nächste: Der Updater installiert nur eine höhere Version als
 *     die installierte, eine Basis unterhalb eines schon ausgelieferten Tags ergäbe eine
 *     Nummer, die nie ankommt. Andere Tags (`v1.2.3` der Suite, `einsatzbuch-updater`,
 *     `einsatzbuch-v1.2`) zählen nicht.
 *
 *  2. GEZÄHLT werden die Commits seit der Basis ohne Merge-Commits, die etwas unter `PFADE`
 *     ändern (`git log --no-merges --full-history`: jeder Commit gegen seinen einzigen
 *     Elternteil, ohne die Vereinfachung, die sonst ganze Seitenzweige überspringt).
 *
 *  3. EIN RELEASE entsteht, wenn mindestens einer davon `loestReleaseAus`: Kopfzeile vom Typ
 *     `feat`, `fix` oder `perf` (Bereich beliebig), oder ein Major nach `sprungAusNachricht`
 *     (`typ!:` bei jedem Typ, Fußzeile `BREAKING CHANGE:`). `test`, `docs`, `chore`, `ci`,
 *     `build`, `refactor`, `style`, `revert` und Nachrichten ohne Präfix lösen keins aus.
 *     `perf` gehört dazu, weil eine Beschleunigung nur mit einem Release bei den Rechnern
 *     ankommt; sonst läge sie bis zum nächsten `fix` still auf `main`. Ein Major bei einem
 *     anderen Typ (etwa `refactor!:`) gehört dazu, weil eine als brechend markierte Änderung
 *     nicht unausgeliefert liegen bleiben soll.
 *
 *  4. DIE VERSION ist die Basis plus der größte Sprung über die auslösenden Commits, nach
 *     denselben Regeln wie die Suite (`scripts/version.mjs`: Major, `feat` Minor, sonst
 *     Patch). Gibt es noch keinen Einsatzbuch-Tag, ist es `1.0.0`.
 *
 * ANDERS ALS DIE SUITE rechnet dieses Skript nicht Schritt für Schritt über die
 * First-Parent-Kette, sondern einmal über alle Commits seit dem Tag. Zwei gleichzeitige Läufe
 * sähen deshalb dieselbe Basis und rechneten dieselbe Nummer. Das verhindert nicht dieses
 * Skript, sondern der Workflow: Läufe auf `main` stehen in einer festen `concurrency`-Gruppe
 * und laufen nacheinander (Kommentar dort). Das Skript sichert nur ab, dass eine schon
 * vergebene Nummer laut scheitert, statt ein zweites Mal gebaut zu werden.
 *
 * TRÄGT `ziel` SELBST SCHON DEN BASIS-TAG, entsteht kein Release (`schonGetaggt`): Das ist ein
 * wiederholter Lauf nach einem Release („Re-run all jobs“) oder ein Stand, den jemand von Hand
 * getaggt hat, während dieser Lauf rechnete. Ein Neubau ersetzte sonst die Dateien am
 * bestehenden Release durch andere Bytes.
 *
 * Wie `scripts/version.mjs` ohne Abhängigkeiten: Der Job braucht kein `pnpm install`. Die
 * Regeln für Sprung und Erhöhung kommen von dort, damit Suite und App gleich zählen.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { erhoehe, formatVersion, groessterSprung, sprungAusNachricht } from "./version.mjs";

/** @typedef {import("./version.mjs").Version} Version */

/** Die Pfade, deren Änderungen in die App eingehen. Deckungsgleich mit Regel 2 im Kopf. */
export const PFADE = ["apps/einsatzbuch", "src/app/m/einsatzbuch/_lib/kern"];

const TAG_MUSTER = /^einsatzbuch-v(\d+)\.(\d+)\.(\d+)$/;
const AUSLOESENDE_TYPEN = new Set(["feat", "fix", "perf"]);

/**
 * @param {string} tag
 * @returns {Version}
 */
export function parseEinsatzbuchTag(tag) {
  const m = TAG_MUSTER.exec(tag);
  if (!m) throw new Error(`Kein Einsatzbuch-Versionstag: „${tag}“ (erwartet einsatzbuch-vX.Y.Z).`);
  return { major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3]) };
}

/**
 * Löst diese Commit-Nachricht ein Release aus? Regel 3 im Kopf. Die Kopfzeile wird wie in
 * `sprungAusNachricht` gelesen: `typ(bereich)!: betreff`.
 *
 * @param {string} nachricht Kopfzeile und Rumpf
 */
export function loestReleaseAus(nachricht) {
  const kopf = nachricht.split("\n", 1)[0] ?? "";
  const typ = /^(\w+)(\([^)]*\))?(!)?:\s/.exec(kopf)?.[1];
  return (typ !== undefined && AUSLOESENDE_TYPEN.has(typ)) || sprungAusNachricht(nachricht) === "major";
}

/**
 * Der reine Kern ohne git: Entscheidung und Version aus Basis und Nachrichten.
 *
 * @param {Version | null} basis `null`, wenn es noch keinen Einsatzbuch-Tag gibt
 * @param {readonly string[]} nachrichten die gezählten Commits seit der Basis
 * @returns {{ release: boolean; version: string | null }}
 */
export function entscheide(basis, nachrichten) {
  const ausloesend = nachrichten.filter(loestReleaseAus);
  if (ausloesend.length === 0) return { release: false, version: null };
  if (basis === null) return { release: true, version: "1.0.0" };
  return { release: true, version: formatVersion(erhoehe(basis, groessterSprung(ausloesend))) };
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
}

/** @param {Version} a @param {Version} b */
function vergleiche(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * @typedef {{
 *   release: boolean;
 *   version: string | null;
 *   tag: string | null;
 *   basis: string | null;
 *   schonGetaggt: boolean;
 *   grund: string;
 *   commits: { commit: string; betreff: string; loestAus: boolean }[];
 * }} Ergebnis
 */

/**
 * Entscheidung für einen Stand in einem Repo. Wirft, wenn die Nummer schon vergeben ist oder
 * `cwd` kein Repo ist.
 *
 * @param {string} cwd Arbeitsverzeichnis im Repo
 * @param {string} ziel Commit, für den entschieden wird
 * @returns {Ergebnis}
 */
export function berechneEinsatzbuchVersion(cwd, ziel = "HEAD") {
  const zielCommit = git(["rev-parse", "--verify", `${ziel}^{commit}`], cwd).trim();

  /** @type {{ tag: string; version: Version } | null} */
  let basis = null;
  for (const tag of git(["tag", "--list", "einsatzbuch-v*", "--merged", zielCommit], cwd).split("\n")) {
    const t = tag.trim();
    if (!TAG_MUSTER.test(t)) continue;
    const version = parseEinsatzbuchTag(t);
    if (basis === null || vergleiche(version, basis.version) > 0) basis = { tag: t, version };
  }

  if (basis !== null && git(["rev-parse", `${basis.tag}^{commit}`], cwd).trim() === zielCommit) {
    return {
      release: false,
      version: null,
      tag: null,
      basis: basis.tag,
      schonGetaggt: true,
      grund: `Dieser Stand trägt schon ${basis.tag}; es entsteht kein zweites Release.`,
      commits: [],
    };
  }

  const bereich = basis === null ? zielCommit : `${basis.tag}..${zielCommit}`;
  // `%x1f` trennt Hash und Nachricht, `%x00` die Commits: ein Rumpf darf Leerzeilen enthalten.
  const commits = git(["log", "--no-merges", "--full-history", "--format=%H%x1f%B%x00", bereich, "--", ...PFADE], cwd)
    .split("\0")
    .map((eintrag) => eintrag.replace(/^\n+/, ""))
    .filter(Boolean)
    .map((eintrag) => {
      const [commit = "", nachricht = ""] = eintrag.split("\x1f");
      return { commit, nachricht: nachricht.trim() };
    });

  const { release, version } = entscheide(
    basis?.version ?? null,
    commits.map((c) => c.nachricht),
  );
  const liste = commits.map((c) => ({
    commit: c.commit,
    betreff: c.nachricht.split("\n", 1)[0] ?? "",
    loestAus: loestReleaseAus(c.nachricht),
  }));
  const seit = basis === null ? "seit Beginn der Historie (noch kein Einsatzbuch-Tag)" : `seit ${basis.tag}`;

  if (!release || version === null) {
    return {
      release: false,
      version: null,
      tag: null,
      basis: basis?.tag ?? null,
      schonGetaggt: false,
      grund:
        commits.length === 0
          ? `Kein Commit ${seit} ändert die App.`
          : `${commits.length} Commit(s) ${seit} ändern die App, aber keiner ist feat, fix, perf oder brechend.`,
      commits: liste,
    };
  }

  const tag = `einsatzbuch-v${version}`;
  /*
   * IST DIE NUMMER SCHON VERGEBEN? Ein Tag auf `ziel` selbst ist oben schon behandelt, ein
   * erreichbarer Tag dieser Nummer wäre Basis gewesen. Übrig bleibt ein Tag abseits der
   * Historie von `ziel`: ein neuerer Lauf hat die Nummer schon vergeben (dieser Lauf ist eine
   * Wiederholung eines älteren Standes), oder jemand hat einen Seitenzweig getaggt. Beides soll
   * vor dem Bau scheitern, nicht erst beim Anlegen des Releases.
   */
  if (git(["tag", "--list", tag], cwd).trim() === tag) {
    const tagCommit = git(["rev-parse", `${tag}^{commit}`], cwd).trim();
    throw new Error(
      `Die errechnete Version ${version} ist schon vergeben: ${tag} zeigt auf ${tagCommit.slice(0, 7)}, ` +
        `nicht auf ${zielCommit.slice(0, 7)}. Siehe docs/runbooks/einsatzbuch-release.md, Abschnitt „Scheitert der Lauf“.`,
    );
  }

  return {
    release: true,
    version,
    tag,
    basis: basis?.tag ?? null,
    schonGetaggt: false,
    grund:
      basis === null
        ? "Erstes Release: noch kein Einsatzbuch-Tag, die App hat auslösende Commits."
        : `Auslösende Commits ${seit}.`,
    commits: liste,
  };
}

/**
 * Ein von Hand gepushter Tag (Notfall-Release): Der Tag ist die Version, gerechnet wird nichts.
 *
 * @param {string} tag
 * @returns {Ergebnis}
 */
export function ausManuellemTag(tag) {
  const version = formatVersion(parseEinsatzbuchTag(tag));
  return {
    release: true,
    version,
    tag,
    basis: null,
    schonGetaggt: false,
    grund: `Manueller Tag ${tag}: Die Version kommt aus dem Tag.`,
    commits: [],
  };
}

/**
 * Menschenlesbare Herleitung fürs Protokoll und die Zusammenfassung des Laufs.
 *
 * @param {Ergebnis} e
 */
export function bericht(e) {
  const zeilen = [`Basis: ${e.basis ?? "(keine)"}`];
  for (const c of e.commits) {
    zeilen.push(`  ${c.commit.slice(0, 7)}  ${c.loestAus ? "löst aus" : "zählt nicht"}  ${c.betreff}`);
  }
  zeilen.push(e.grund);
  zeilen.push(e.release ? `Release: ja, Version ${e.version} (Tag ${e.tag})` : "Release: nein");
  return zeilen.join("\n");
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const { values, positionals } = parseArgs({
    args: process.argv.slice(2),
    options: { tag: { type: "string" } },
    allowPositionals: true,
  });
  let ergebnis;
  try {
    ergebnis = values.tag ? ausManuellemTag(values.tag) : berechneEinsatzbuchVersion(process.cwd(), positionals[0] ?? "HEAD");
  } catch (e) {
    // `::error::` zeigt GitHub als Anmerkung am Lauf; lokal ist es eine lesbare Zeile.
    console.log(`::error::${/** @type {Error} */ (e).message}`);
    process.exit(1);
  }
  console.log(bericht(ergebnis));
  if (ergebnis.schonGetaggt) {
    console.log(
      `::warning::${ergebnis.grund} Fehlt am Release etwas oder latest.json ist nicht ersetzt, ` +
        "den ursprünglichen Lauf per „Re-run failed jobs“ wiederholen (docs/runbooks/einsatzbuch-release.md).",
    );
  }
  /*
   * In der CI landen Entscheidung, Version und Tag als Job-Ausgaben. Bewusst hier und nicht per
   * `$(node …)` im Workflow: eine Hilfsausgabe auf stdout wäre dort still Teil der Version.
   */
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(
      process.env.GITHUB_OUTPUT,
      `release=${ergebnis.release}\nversion=${ergebnis.version ?? ""}\ntag=${ergebnis.tag ?? ""}\n`,
    );
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    const titel = ergebnis.release ? `Einsatzbuch-Release ${ergebnis.version}` : "Kein Einsatzbuch-Release";
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### ${titel}\n\n\`\`\`\n${bericht(ergebnis)}\n\`\`\`\n`);
  }
}
