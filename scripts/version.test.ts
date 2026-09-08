import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  berechneVersion,
  bericht,
  erhoehe,
  formatVersion,
  groessterSprung,
  parseTag,
  spieleNach,
  sprungAusNachricht,
} from "./version.mjs";

/*
 * Der reine Kern (Sprung aus Nachricht, Nachspielen der Schritte) wird ohne Repo
 * geprüft; die Herleitung aus der Historie an einem Wegwerf-Repo unter `tmpdir`.
 * Beides zusammen ist die Zusage aus dem Kopf von `version.mjs`: die Nummer folgt
 * aus der Historie, jeder Schritt ist ein Sprung, zwei Läufe kollidieren nicht.
 */

describe("sprungAusNachricht — Conventional Commits", () => {
  it("feat ist Minor, mit und ohne Bereich", () => {
    expect(sprungAusNachricht("feat: Lernbereich")).toBe("minor");
    expect(sprungAusNachricht("feat(zeichen): Lernbereich mit Leitner-Wiederholung")).toBe("minor");
  });

  it("fix, docs, test, build, chore sind Patch", () => {
    for (const kopf of [
      "fix(portal): Systemeinträge ausblenden",
      "docs: plan suite-wide audit log",
      "test(zeichen): Export-Audit aussetzen",
      "build(deps): bump antd from 6.5.3 to 6.6.1",
      "chore: aufräumen",
    ]) {
      expect(sprungAusNachricht(kopf), kopf).toBe("patch");
    }
  });

  it("eine Nachricht ohne Präfix ist Patch, kein Fehler", () => {
    // „Umbenennung in IDA: Wortzeichen, Login-Kopf und Release-Notiz" steht so in
    // der Historie. Sie beschreibt eine ausgelieferte Änderung — nur keine neue
    // Fähigkeit. Ein Wurf hier machte die ganze Pipeline rot für einen Stil.
    expect(sprungAusNachricht("Umbenennung in IDA: Wortzeichen, Login-Kopf")).toBe("patch");
    expect(sprungAusNachricht("Merge pull request #108 from rubenvitt/codex/x")).toBe("patch");
    expect(sprungAusNachricht("")).toBe("patch");
  });

  it("das Ausrufezeichen ist Major, bei jedem Typ", () => {
    expect(sprungAusNachricht("feat!: neue Datenbank")).toBe("major");
    expect(sprungAusNachricht("fix(core)!: Cookie-Name geändert")).toBe("major");
  });

  it("BREAKING CHANGE in der Fußzeile ist Major — auch mit Bindestrich", () => {
    expect(sprungAusNachricht("fix: x\n\nBREAKING CHANGE: Sitzungen enden")).toBe("major");
    expect(sprungAusNachricht("fix: x\n\nBREAKING-CHANGE: Sitzungen enden")).toBe("major");
    // Nur am Zeilenanfang: ein Satz, der die Wörter erwähnt, ist keine Fußzeile.
    expect(sprungAusNachricht("fix: x\n\nkein BREAKING CHANGE: nur erwähnt")).toBe("patch");
  });

  it("feat im Rumpf zählt nicht — nur die Kopfzeile trägt den Typ", () => {
    expect(sprungAusNachricht("fix: x\n\nfeat: das hier ist Prosa")).toBe("patch");
  });
});

describe("groessterSprung und Nachspielen", () => {
  it("der größte Sprung gewinnt, mindestens Patch", () => {
    expect(groessterSprung([])).toBe("patch");
    expect(groessterSprung(["docs: a", "fix: b"])).toBe("patch");
    expect(groessterSprung(["fix: a", "feat: b", "test: c"])).toBe("minor");
    expect(groessterSprung(["feat: a", "fix!: b"])).toBe("major");
  });

  it("erhöht semantisch — Minor setzt Patch zurück, Major beides", () => {
    const v = parseTag("v1.4.2");
    expect(formatVersion(erhoehe(v, "patch"))).toBe("1.4.3");
    expect(formatVersion(erhoehe(v, "minor"))).toBe("1.5.0");
    expect(formatVersion(erhoehe(v, "major"))).toBe("2.0.0");
  });

  it("ein Schritt ist ein Sprung — drei Merges sind drei Nummern, nicht eine", () => {
    // Das ist die Eigenschaft, die zwei gleichzeitige Läufe auseinanderhält: der
    // spätere hat einen Schritt mehr und rechnet zwangsläufig anders.
    const basis = parseTag("v1.0.0");
    expect(formatVersion(spieleNach(basis, [["feat: a"], ["fix: b"], ["docs: c"]]))).toBe("1.1.2");
    expect(formatVersion(spieleNach(basis, [["feat: a", "fix: b", "docs: c"]]))).toBe("1.1.0");
  });

  it("parseTag nimmt nur vX.Y.Z", () => {
    expect(parseTag("v12.0.7")).toEqual({ major: 12, minor: 0, patch: 7 });
    expect(() => parseTag("1.0.0")).toThrow(/vX\.Y\.Z/);
    expect(() => parseTag("v1.0")).toThrow(/vX\.Y\.Z/);
    expect(() => parseTag("v1.0.0-rc1")).toThrow(/vX\.Y\.Z/);
  });
});

/*
 * Das Wegwerf-Repo. `--allow-empty`, weil es hier nur um Nachrichten und Kanten
 * geht; `--no-ff` erzwingt den Merge-Commit, den ein GitHub-Merge ebenfalls legt.
 */
describe("berechneVersion — an einer echten Historie", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const commit = (nachricht: string) => git("commit", "-q", "--allow-empty", "-m", nachricht);
  const pr = (zweig: string, nachrichten: string[], titel: string) => {
    git("checkout", "-q", "-b", zweig);
    for (const n of nachrichten) commit(n);
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", zweig, "-m", titel);
  };

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "iuk-version-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.org");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    commit("chore: Anfang");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("ohne Tag und ohne Anker in der Historie bricht es laut ab, statt zu raten", () => {
    // Der eingebaute Anker ist ein Commit der Suite, den dieses Wegwerf-Repo nicht
    // kennt. Eine stille 1.0.0 gäbe zwei gleichzeitigen Läufen dieselbe Nummer
    // (Befund aus dem Review von #109).
    expect(() => berechneVersion(repo)).toThrow(/Anker .* kein Vorfahr/);
  });

  it("ohne Tag rechnet es vom Anker aus — je Schritt eine Nummer, wie mit Tag", () => {
    const wurzel = git("rev-list", "--max-parents=0", "HEAD");
    const anker = { commit: wurzel, version: "1.0.0" };
    const e = berechneVersion(repo, "HEAD", { anker });
    expect(e).toMatchObject({ version: "1.0.0", basis: null, ankerBenutzt: true, schritte: [] });
    expect(bericht(e)).toContain("Anker");
    commit("fix: erster Schritt nach dem Anker");
    expect(berechneVersion(repo, "HEAD", { anker }).version).toBe("1.0.1");
    commit("feat: zweiter");
    expect(berechneVersion(repo, "HEAD", { anker }).version).toBe("1.1.0");
    // Zwei Läufe vor dem ersten Tag: verschiedene Stände, verschiedene Nummern.
    expect(berechneVersion(repo, "HEAD~1", { anker }).version).not.toBe(
      berechneVersion(repo, "HEAD", { anker }).version,
    );
    // Aufräumen für die folgenden Fälle: zurück auf die Wurzel.
    git("reset", "-q", "--hard", wurzel);
  });

  it("ein Tag ohne Schritte danach ist genau diese Version", () => {
    git("tag", "v1.0.0");
    expect(berechneVersion(repo)).toMatchObject({ version: "1.0.0", basis: "v1.0.0", schritte: [] });
  });

  it("ein Merge mit feat und fix ist EIN Minor-Schritt", () => {
    pr("pr-1", ["feat(x): neu", "fix(x): nachgezogen"], "Merge pull request #1");
    const e = berechneVersion(repo);
    expect(e.version).toBe("1.1.0");
    expect(e.schritte.map((s) => s.sprung)).toEqual(["minor"]);
    expect(e.schritte[0].betreff).toBe("Merge pull request #1");
  });

  it("ein direkter Doku-Push ist ein Patch-Schritt, kein Nicht-Schritt", () => {
    commit("docs: nur Doku");
    expect(berechneVersion(repo).version).toBe("1.1.1");
  });

  it("ein Merge von main in den PR-Zweig zählt die main-Commits nicht doppelt", () => {
    // Der PR-Zweig holt sich main (Merge-Commit auf dem Zweig). `commit^1..commit`
    // sieht davon nur, was main noch nicht hatte — die main-Commits sind vom ersten
    // Elternteil aus erreichbar und fallen heraus.
    git("checkout", "-q", "-b", "pr-2");
    commit("fix(y): eins");
    git("checkout", "-q", "main");
    commit("feat(z): auf main zwischendurch"); // 1.2.0
    git("checkout", "-q", "pr-2");
    git("merge", "-q", "--no-ff", "main", "-m", "Merge branch 'main' into pr-2");
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "pr-2", "-m", "Merge pull request #2");
    const e = berechneVersion(repo);
    expect(e.version).toBe("1.2.1");
    expect(e.schritte.map((s) => s.sprung)).toEqual(["minor", "patch", "minor", "patch"]);
  });

  it("die Nummer hängt nur an der Historie — mit oder ohne Zwischentag dasselbe", () => {
    /*
     * Zwei Läufe: A für den vorletzten Stand, B für den letzten. B rechnet dieselbe
     * Nummer, egal ob A seinen Tag schon gesetzt hat. Genau das erlaubt, die Version
     * VOR dem Build zu bestimmen und den Tag erst NACH dem Build zu setzen.
     */
    const vorletzter = git("rev-parse", "HEAD~1");
    const ohneZwischentag = berechneVersion(repo).version;
    const versionA = berechneVersion(repo, vorletzter).version;
    git("tag", `v${versionA}`, vorletzter);
    const mitZwischentag = berechneVersion(repo);
    expect(mitZwischentag.version).toBe(ohneZwischentag);
    expect(mitZwischentag.basis).toBe(`v${versionA}`);
    expect(mitZwischentag.schritte).toHaveLength(1);
  });

  it("ein Major-Sprung im PR setzt Minor und Patch zurück", () => {
    pr("pr-3", ["fix(core)!: Cookie umbenannt"], "Merge pull request #3");
    expect(berechneVersion(repo).version).toBe("2.0.0");
  });

  it("Tags, die keine exakte Version sind, werden übergangen — auch NÄHERE", () => {
    // Zweiter Befund aus dem Review von #109: `v2`, `v1.2`, `v1.2.3+build` passen auf
    // jedes Glob, das `v1.2.3` trifft. Nähme `git describe` sie als Basis, würfe
    // `parseTag` und jeder folgende Build wäre rot. Deshalb wird erst gefiltert und
    // dann der nächste gewählt — die schiefen Tags liegen hier bewusst NÄHER an HEAD.
    git("tag", "v2.0.0");
    commit("fix: danach");
    git("tag", "deploy-2026-09-08");
    git("tag", "v2.0.0-rc1");
    git("tag", "v2");
    git("tag", "v2.1");
    git("tag", "v2.0.1+build");
    expect(berechneVersion(repo)).toMatchObject({ version: "2.0.1", basis: "v2.0.0" });
  });

  it("zwei Versionstags auf einem Commit: der höhere ist die Basis", () => {
    // Ein von Hand nachgesetzter `v2.0.5` auf dem Commit von `v2.0.0` ist die spätere
    // Aussage; von `v2.0.0` aus weiterzuzählen ergäbe eine schon vergebene Nummer.
    git("tag", "v2.0.5", "v2.0.0^{commit}");
    expect(berechneVersion(repo)).toMatchObject({ version: "2.0.6", basis: "v2.0.5" });
  });

  it("ein Versionstag auf einem gemergten Zweig-Commit ist KEINE Basis", () => {
    // Dritter Befund aus dem Review von #109: `git tag --merged` liefert auch ein
    // `v0.1.0` auf der Spitze eines Zweigs, der gerade gemergt wurde — erreichbar,
    // aber nie auf `main`. Von dort aus gerechnet käme 0.1.1 heraus, und `:0.1.1`
    // überschriebe womöglich ein altes Image. Nur die First-Parent-Kette zählt.
    git("checkout", "-q", "-b", "pr-4");
    commit("fix(w): auf dem Zweig");
    git("tag", "v0.1.0");
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", "pr-4", "-m", "Merge pull request #4");
    const e = berechneVersion(repo);
    expect(e.basis).toBe("v2.0.5");
    expect(e.version).toBe("2.0.7");
  });

  it("ein annotierter Tag zählt wie ein leichter", () => {
    // `rev-parse tag^{commit}` löst das Tag-Objekt auf; ohne das Suffix zeigte ein
    // annotierter Tag auf sich selbst und fiele still aus der Kette.
    git("tag", "-a", "v2.1.0", "-m", "annotiert");
    commit("docs: nach dem annotierten Tag");
    expect(berechneVersion(repo)).toMatchObject({ version: "2.1.1", basis: "v2.1.0" });
  });

  it("wirft außerhalb eines Repos, statt still 1.0.0 zu liefern", () => {
    const leer = mkdtempSync(path.join(tmpdir(), "iuk-kein-repo-"));
    try {
      expect(() => berechneVersion(leer)).toThrow();
    } finally {
      rmSync(leer, { recursive: true, force: true });
    }
  });
});
