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
 * GIBT ES NOCH KEINEN TAG, rechnet das Skript vom ANKER aus: einem fest eingetragenen
 * Commit, der als `1.0.0` gilt (`ANKER` unten — der `main`-Stand, auf dem die
 * Versionierung eingeführt wurde). Das ist dasselbe wie ein Tag `v1.0.0` auf diesem
 * Commit, nur ohne einen Push, den die Einführung nicht leisten konnte. Der Anker ist
 * KEIN „dieser Commit wird 1.0.0": das gäbe zwei gleichzeitigen Läufen vor dem ersten
 * Tag dieselbe Nummer (Befund aus dem Review von #109) — mit dem Anker hat auch der
 * allererste Lauf eine Historie, aus der er rechnet. Sobald ein echter Tag existiert,
 * ist der Anker toter Ballast; er darf dann entfernt werden. Fehlt beides — kein Tag,
 * Anker nicht in der Historie (fremder Klon, umgeschriebene Historie) — bricht das
 * Skript laut ab, statt still zu raten.
 *
 * NUR EXAKTE `vX.Y.Z`-TAGS ZÄHLEN. Ein `v2`, `v1.2` oder `v1.2.3+build` in der Historie
 * wird übergangen, nicht als Basis genommen (zweiter Befund aus demselben Review): die
 * Basis ist der nächstgelegene passende Tag auf der First-Parent-Kette, bei gleichem
 * Abstand der höchste.
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
 * Nur Tags GENAU dieser Form zählen als Version — `v2`, `v1.2`, `v1.2.3+build` oder
 * `v2.0.0-rc1` nicht. `naechsterVersionstag` filtert damit, bevor es wählt.
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
 * Der Stand, der ohne echten Tag als `1.0.0` gilt — siehe Kopf. Der Commit ist der
 * `main`-Stand vom 2026-09-08, auf dem die Versionierung gemergt wurde (#109).
 * Überschreibbar (`berechneVersion(cwd, ziel, { anker })`), damit der Test den Fall
 * an einem Wegwerf-Repo prüfen kann.
 */
export const ANKER = { commit: "4e303b90685e827b9dcac27b6f1756bfb8603c5a", version: "1.0.0" };

/** @param {Version} a @param {Version} b */
function vergleiche(a, b) {
  return a.major - b.major || a.minor - b.minor || a.patch - b.patch;
}

/**
 * Der nächstgelegene exakte Versionstag in der Historie von `ziel`, oder `null`.
 *
 * `git tag --merged` statt `git describe`: `describe` nimmt ein Glob, und jedes Glob,
 * das `v1.2.3` trifft, trifft auch `v1.2` oder `v1.2.3+build` — `parseTag` würfe dann
 * an einem Tag, der laut Regel gar nicht zählt. Hier wird zuerst nach der Regel
 * gefiltert und erst dann der nächste gewählt.
 *
 * NUR TAGS AUF DER FIRST-PARENT-KETTE. `--merged` liefert alles, was von `ziel` aus
 * erreichbar ist — auch einen Tag auf der Spitze eines gemergten Zweigs, der nie auf
 * `main` lag (dritter Befund aus dem Review von #109). Von dort aus gerechnet käme eine
 * alte oder fremde Nummer heraus. Deshalb wird die Kette einmal gelesen und jeder
 * Kandidat muss darin vorkommen; sein Index in der Kette ist zugleich der Abstand.
 * „Nächster" heißt: der kleinste Abstand; bei gleichem Abstand (zwei Versionstags auf
 * einem Commit) gewinnt die höhere Nummer, weil sie die spätere Aussage ist.
 *
 * @param {string} cwd
 * @param {string} ziel
 * @returns {string | null}
 */
function naechsterVersionstag(cwd, ziel) {
  // Neuester zuerst: Index 0 ist `ziel` selbst, Index n liegt n Schritte davor.
  const kette = git(["rev-list", "--first-parent", ziel], cwd).split("\n").filter(Boolean);
  const abstandVon = new Map(kette.map((commit, i) => [commit, i]));
  const kandidaten = git(["tag", "--list", "v*", "--merged", ziel], cwd)
    .split("\n")
    .map((t) => t.trim())
    .filter((t) => TAG_MUSTER.test(t));
  /** @type {{ tag: string; abstand: number } | null} */
  let bester = null;
  for (const tag of kandidaten) {
    // `^{commit}`: ein annotierter Tag zeigt auf ein Tag-Objekt, nicht auf den Commit.
    const commit = git(["rev-parse", `${tag}^{commit}`], cwd).trim();
    const abstand = abstandVon.get(commit);
    if (abstand === undefined) continue;
    if (
      bester === null ||
      abstand < bester.abstand ||
      (abstand === bester.abstand && vergleiche(parseTag(tag), parseTag(bester.tag)) > 0)
    ) {
      bester = { tag, abstand };
    }
  }
  return bester?.tag ?? null;
}

/**
 * Die Herleitung für einen Commit in einem Repo.
 *
 * `basis` ist der echte Tag, von dem aus gerechnet wurde — oder `null`, wenn es noch
 * keinen gibt und der Anker die Basis war (`ankerBenutzt`). Der Job `release` lässt
 * dann die PR-Liste weg, weil es kein „seit" gibt.
 *
 * @param {string} cwd Arbeitsverzeichnis im Repo
 * @param {string} ziel Commit, dessen Version gesucht ist
 * @param {{ anker?: { commit: string; version: string } }} [optionen]
 * @returns {{ version: string; basis: string | null; ankerBenutzt: boolean; schritte: { commit: string; sprung: Sprung; betreff: string }[] }}
 */
export function berechneVersion(cwd, ziel = "HEAD", optionen = {}) {
  const anker = optionen.anker ?? ANKER;
  const basis = naechsterVersionstag(cwd, ziel);
  let start;
  let von;
  if (basis !== null) {
    start = parseTag(basis);
    von = basis;
  } else {
    let istVorfahr = false;
    try {
      git(["merge-base", "--is-ancestor", anker.commit, ziel], cwd);
      istVorfahr = true;
    } catch {
      istVorfahr = false;
    }
    if (!istVorfahr) {
      throw new Error(
        `Kein Versionstag (vX.Y.Z) in der Historie, und der Anker ${anker.commit.slice(0, 7)} ` +
          `ist kein Vorfahr von ${ziel}. Entweder fehlt die Historie (flacher Klon — ` +
          `fetch-depth: 0) oder sie wurde umgeschrieben. Abhilfe: docs/runbooks/versionierung.md, F1.`,
      );
    }
    start = parseTag(`v${anker.version}`);
    von = anker.commit;
  }

  const kette = git(["rev-list", "--first-parent", "--reverse", `${von}..${ziel}`], cwd)
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

  let version = start;
  for (const s of schritte) version = erhoehe(version, s.sprung);
  const nummer = formatVersion(version);

  /*
   * IST DIE NUMMER SCHON VERGEBEN? Ein Tag `vX.Y.Z` auf einem Commit ABSEITS der Kette
   * (von Hand auf einen Zweig gesetzt) zählt oben zu Recht nicht als Basis — belegt den
   * Namen aber trotzdem (vierter Befund aus dem Review von #109). Ohne diese Prüfung
   * bekäme das Image `:X.Y.Z`, und erst `release` scheiterte am Git-Tag; Image und Tag
   * zeigten dann auf verschiedene Commits. Deshalb hier, VOR dem Build, laut. Zeigt der
   * Tag auf `ziel` selbst, ist es ein wiederholter Lauf und in Ordnung.
   */
  const belegt = git(["tag", "--list", `v${nummer}`], cwd).trim();
  if (belegt) {
    const zielCommit = git(["rev-parse", `${ziel}^{commit}`], cwd).trim();
    const tagCommit = git(["rev-parse", `${belegt}^{commit}`], cwd).trim();
    if (tagCommit !== zielCommit) {
      throw new Error(
        `Die errechnete Nummer ${nummer} ist schon vergeben: Tag ${belegt} zeigt auf ` +
          `${tagCommit.slice(0, 7)}, nicht auf ${zielCommit.slice(0, 7)} — ein Tag abseits der ` +
          `main-Kette. Abhilfe: docs/runbooks/versionierung.md, F2.`,
      );
    }
    /*
     * Der Tag zeigt auf `ziel` selbst: ein wiederholter Lauf eines schon
     * veröffentlichten Standes — in Ordnung. Ob das Image-Tag `:X.Y.Z` dabei stehen
     * bleibt, entscheidet NICHT dieses Skript, sondern der Job `merge` gegen die
     * Registry im Moment der Veröffentlichung: eine Momentaufnahme von hier wäre bei
     * zwei sich überholenden Läufen desselben Commits schon wieder alt.
     */
  }

  return { version: nummer, basis, ankerBenutzt: basis === null, schritte };
}

/**
 * Menschenlesbare Herleitung fürs Protokoll und die Zusammenfassung des Laufs.
 *
 * @param {ReturnType<typeof berechneVersion>} ergebnis
 */
export function bericht(ergebnis) {
  const zeilen = [];
  zeilen.push(
    ergebnis.basis === null
      ? `Basis: Anker ${ANKER.commit.slice(0, 7)} als ${ANKER.version} (noch kein Versionstag)`
      : `Basis: ${ergebnis.basis}`,
  );
  for (const s of ergebnis.schritte) {
    zeilen.push(`  ${s.commit.slice(0, 7)}  ${s.sprung.padEnd(5)}  ${s.betreff}`);
  }
  if (ergebnis.schritte.length === 0) {
    zeilen.push("  (keine Schritte seit der Basis — dieser Commit IST die Basis)");
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
