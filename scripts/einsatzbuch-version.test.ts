import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import {
  ausManuellemTag,
  berechneEinsatzbuchVersion,
  bericht,
  entscheide,
  loestReleaseAus,
  parseEinsatzbuchTag,
} from "./einsatzbuch-version.mjs";
import { berechneVersion } from "./version.mjs";

/*
 * Wann die Desktop-App ein Release bekommt und mit welcher Nummer (Kopf von
 * `einsatzbuch-version.mjs`). Der reine Kern ohne Repo, die Herleitung aus der Historie an einem
 * Wegwerf-Repo unter `tmpdir`, wie in `version.test.ts`.
 */

describe("loestReleaseAus", () => {
  it("feat, fix und perf lösen aus, mit und ohne Bereich", () => {
    for (const kopf of ["feat: a", "feat(einsatzbuch): a", "fix: b", "fix(einsatzbuch): b", "perf(einsatzbuch): c"]) {
      expect(loestReleaseAus(kopf), kopf).toBe(true);
    }
  });

  it("test, docs, chore, ci, build, refactor, revert und Nachrichten ohne Präfix lösen nicht aus", () => {
    for (const kopf of [
      "test(einsatzbuch): x",
      "docs(einsatzbuch): x",
      "chore(einsatzbuch): Lockfile",
      "ci(einsatzbuch): x",
      "build(deps): bump tauri",
      "refactor(einsatzbuch): x",
      "revert: feat(einsatzbuch): x",
      'Revert "feat(einsatzbuch): x"',
      "Merge branch 'main' into x",
      "",
    ]) {
      expect(loestReleaseAus(kopf), kopf).toBe(false);
    }
  });

  it("brechend löst aus, auch bei einem sonst stillen Typ", () => {
    expect(loestReleaseAus("feat!: a")).toBe(true);
    expect(loestReleaseAus("fix(einsatzbuch)!: a")).toBe(true);
    expect(loestReleaseAus("refactor(einsatzbuch)!: a")).toBe(true);
    expect(loestReleaseAus("chore: a\n\nBREAKING CHANGE: Datenbank neu")).toBe(true);
  });

  it("nur die Kopfzeile trägt den Typ", () => {
    expect(loestReleaseAus("docs: a\n\nfeat: nur Prosa im Rumpf")).toBe(false);
    expect(loestReleaseAus("chore: a\n\nkein BREAKING CHANGE: nur erwähnt")).toBe(false);
  });
});

describe("entscheide — Basis plus größter Sprung", () => {
  const basis = parseEinsatzbuchTag("einsatzbuch-v1.4.2");

  it("ohne auslösenden Commit kein Release", () => {
    expect(entscheide(basis, [])).toEqual({ release: false, version: null });
    expect(entscheide(basis, ["docs: a", "test: b", "chore: c"])).toEqual({ release: false, version: null });
    expect(entscheide(null, ["docs: a"])).toEqual({ release: false, version: null });
  });

  it("der größte Sprung über die auslösenden Commits, einmal", () => {
    expect(entscheide(basis, ["fix: a", "perf: b", "docs: c"]).version).toBe("1.4.3");
    expect(entscheide(basis, ["fix: a", "feat: b", "feat: c"]).version).toBe("1.5.0");
    expect(entscheide(basis, ["feat: a", "fix!: b"]).version).toBe("2.0.0");
    expect(entscheide(basis, ["test: a\n\nBREAKING CHANGE: x"]).version).toBe("2.0.0");
  });

  it("ohne Einsatzbuch-Tag wird es 1.0.0, egal welcher Sprung", () => {
    expect(entscheide(null, ["fix: a"])).toEqual({ release: true, version: "1.0.0" });
    expect(entscheide(null, ["feat!: a"])).toEqual({ release: true, version: "1.0.0" });
  });

  it("parseEinsatzbuchTag nimmt nur einsatzbuch-vX.Y.Z", () => {
    expect(parseEinsatzbuchTag("einsatzbuch-v12.0.7")).toEqual({ major: 12, minor: 0, patch: 7 });
    for (const tag of ["v1.0.0", "einsatzbuch-v1.0", "einsatzbuch-v1.0.0-rc1", "einsatzbuch-updater"]) {
      expect(() => parseEinsatzbuchTag(tag), tag).toThrow(/einsatzbuch-vX\.Y\.Z/);
    }
  });

  it("ein manueller Tag ist die Version, ohne Rechnung", () => {
    expect(ausManuellemTag("einsatzbuch-v3.1.4")).toMatchObject({ release: true, version: "3.1.4", tag: "einsatzbuch-v3.1.4" });
    expect(() => ausManuellemTag("einsatzbuch-v3.1")).toThrow(/einsatzbuch-vX\.Y\.Z/);
  });
});

/*
 * Das Wegwerf-Repo. Die Commits ändern echte Dateien, weil der Pfadfilter zählt; `--no-ff`
 * erzwingt den Merge-Commit, den ein GitHub-Merge ebenfalls legt.
 */
describe("berechneEinsatzbuchVersion — an einer echten Historie", () => {
  let repo: string;
  let zaehler = 0;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  /** Ein Commit, der `datei` ändert. */
  const commit = (nachricht: string, datei: string) => {
    const voll = path.join(repo, datei);
    mkdirSync(path.dirname(voll), { recursive: true });
    writeFileSync(voll, `${++zaehler}\n`);
    git("add", "--", datei);
    git("commit", "-q", "-m", nachricht);
  };
  const APP = "apps/einsatzbuch/src/App.tsx";
  const KERN = "src/app/m/einsatzbuch/_lib/kern/zeit.ts";
  const SUITE = "src/app/m/portal/page.tsx";
  const pr = (zweig: string, schritte: [string, string][], titel: string) => {
    git("checkout", "-q", "-b", zweig);
    for (const [nachricht, datei] of schritte) commit(nachricht, datei);
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", zweig, "-m", titel);
  };

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "iuk-einsatzbuch-version-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.org");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    git("config", "tag.gpgsign", "false");
    commit("chore: Anfang", "README.md");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("ohne App-Commits kein Release, auch ohne Tag", () => {
    commit("feat(portal): etwas in der Suite", SUITE);
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: false, version: null, basis: null, commits: [] });
  });

  it("nur Test- und Doku-Commits an der App: kein Release, aber gelistet", () => {
    pr("pr-doku", [["test(einsatzbuch): Abdeckung", APP], ["docs(einsatzbuch): Kommentar", KERN]], "Merge pull request #1");
    const e = berechneEinsatzbuchVersion(repo);
    expect(e).toMatchObject({ release: false, version: null });
    expect(e.commits.map((c) => c.loestAus)).toEqual([false, false]);
    expect(e.grund).toMatch(/keiner ist feat, fix, perf oder brechend/);
  });

  it("das erste auslösende Commit ohne Tag ergibt 1.0.0", () => {
    pr("pr-1", [["feat(einsatzbuch): erste Fähigkeit", APP]], "Merge pull request #2");
    const e = berechneEinsatzbuchVersion(repo);
    expect(e).toMatchObject({ release: true, version: "1.0.0", tag: "einsatzbuch-v1.0.0", basis: null });
    // Merge-Commits zählen nicht, die Suite-Änderung auch nicht. Sortiert, weil Commits aus
    // derselben Sekunde keine feste Reihenfolge im Log haben.
    expect(e.commits.map((c) => c.betreff).sort()).toEqual([
      "docs(einsatzbuch): Kommentar",
      "feat(einsatzbuch): erste Fähigkeit",
      "test(einsatzbuch): Abdeckung",
    ]);
    expect(bericht(e)).toContain("Release: ja, Version 1.0.0");
  });

  it("ein Tag auf dem Stand selbst: kein zweites Release (Wiederholung, Handtag)", () => {
    git("tag", "einsatzbuch-v1.0.0");
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({
      release: false,
      schonGetaggt: true,
      basis: "einsatzbuch-v1.0.0",
    });
  });

  it("feat im Kern nach dem Tag ist Minor, fix an der App Patch", () => {
    commit("fix(einsatzbuch): Kleinigkeit", APP);
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: true, version: "1.0.1", basis: "einsatzbuch-v1.0.0" });
    pr("pr-2", [["feat(einsatzbuch): Kern kann mehr", KERN], ["test(einsatzbuch): dazu", KERN]], "Merge pull request #3");
    const e = berechneEinsatzbuchVersion(repo);
    expect(e.version).toBe("1.1.0");
    expect(e.commits).toHaveLength(3);
  });

  it("feat außerhalb der App-Pfade zählt nicht", () => {
    git("tag", "einsatzbuch-v1.1.0");
    pr("pr-3", [["feat(portal): Suite-Fähigkeit", SUITE], ["chore(einsatzbuch): Lockfile", "apps/einsatzbuch/src-tauri/Cargo.lock"]], "Merge pull request #4");
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: false, basis: "einsatzbuch-v1.1.0" });
  });

  it("die Basis ist der HÖCHSTE erreichbare Tag, nicht der nächste", () => {
    // Ein Notfall-Tag mit höherer Nummer auf einem älteren Stand: Von der näheren, kleineren
    // Nummer aus gerechnet käme eine Version heraus, die der Updater nie installierte. Gezählt
    // wird dann ab dem Stand des höheren Tags, also auch das `feat` aus #3.
    git("tag", "einsatzbuch-v1.5.0", "einsatzbuch-v1.0.0");
    commit("fix(einsatzbuch): danach", APP);
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: true, version: "1.6.0", basis: "einsatzbuch-v1.5.0" });
    git("tag", "-d", "einsatzbuch-v1.5.0");
  });

  it("fremde Tags zählen nicht: Suite, Dauer-Release, unvollständige Nummern", () => {
    git("tag", "v9.0.0");
    git("tag", "einsatzbuch-updater");
    git("tag", "einsatzbuch-v7");
    git("tag", "einsatzbuch-v8.1");
    git("tag", "einsatzbuch-v9.0.0-rc1");
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: true, version: "1.1.1", basis: "einsatzbuch-v1.1.0" });
  });

  it("ein annotierter Tag zählt wie ein leichter", () => {
    git("tag", "-a", "einsatzbuch-v1.1.1", "-m", "annotiert");
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: false, schonGetaggt: true });
    commit("perf(einsatzbuch): schneller", APP);
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: true, version: "1.1.2", basis: "einsatzbuch-v1.1.1" });
  });

  it("eine schon vergebene Nummer abseits der Historie scheitert laut, vor dem Bau", () => {
    // Ein älterer Lauf wird wiederholt, nachdem ein neuerer dieselbe Nummer schon vergeben hat:
    // Der neuere Stand ist vom älteren aus nicht erreichbar.
    const aelter = git("rev-parse", "HEAD");
    commit("fix(einsatzbuch): noch einer", APP);
    git("tag", "einsatzbuch-v1.1.2");
    expect(() => berechneEinsatzbuchVersion(repo, aelter)).toThrow(/1\.1\.2 ist schon vergeben: einsatzbuch-v1\.1\.2 zeigt auf/);
    // Vom getaggten Stand aus ist es kein Fehler, sondern „schon getaggt“.
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: false, schonGetaggt: true });
  });

  it("ein Major setzt Minor und Patch zurück", () => {
    pr("pr-4", [["fix(einsatzbuch): x", APP], ["refactor(einsatzbuch)!: Datenbank neu", KERN]], "Merge pull request #5");
    expect(berechneEinsatzbuchVersion(repo)).toMatchObject({ release: true, version: "2.0.0" });
  });

  it("die Suite-Version sieht keinen Einsatzbuch-Tag", () => {
    // Die Suite rechnet von ihrem eigenen `v9.0.0` aus weiter; die näheren Einsatzbuch-Tags
    // (auf demselben und auf späteren Ständen) ändern daran nichts.
    expect(berechneVersion(repo).basis).toBe("v9.0.0");
  });

  it("wirft außerhalb eines Repos, statt still kein Release zu melden", () => {
    const leer = mkdtempSync(path.join(tmpdir(), "iuk-kein-repo-"));
    try {
      expect(() => berechneEinsatzbuchVersion(leer)).toThrow();
    } finally {
      rmSync(leer, { recursive: true, force: true });
    }
  });

  it("als Programm schreibt es release, version und tag für die Job-Ausgaben", () => {
    const skript = fileURLToPath(new URL("./einsatzbuch-version.mjs", import.meta.url));
    const ausgabe = path.join(repo, "..", `ausgabe-${path.basename(repo)}`);
    try {
      const lauf = spawnSync(process.execPath, [skript], {
        cwd: repo,
        encoding: "utf8",
        env: { ...process.env, GITHUB_OUTPUT: ausgabe, GITHUB_STEP_SUMMARY: "" },
      });
      expect(lauf.status).toBe(0);
      expect(readFileSync(ausgabe, "utf8")).toBe("release=true\nversion=2.0.0\ntag=einsatzbuch-v2.0.0\n");
      const falsch = spawnSync(process.execPath, [skript, "--tag", "einsatzbuch-v2"], { cwd: repo, encoding: "utf8" });
      expect(falsch.status).toBe(1);
      expect(falsch.stdout).toMatch(/^::error::Kein Einsatzbuch-Versionstag/);
    } finally {
      rmSync(ausgabe, { force: true });
    }
  });
});
