import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { alsUmgebung, berechneModulversionen, istModulDatei, spieleModuleNach, zaehltFuer } from "./modulversion.mjs";

/*
 * Die Zusage aus dem Kopf von `modulversion.mjs`: eine Modulversion steigt nur, wenn
 * sich am Modul etwas ändert, und alle beginnen mit der Einführung bei 1.0.0.
 */

const c = (nachricht: string, ...dateien: string[]) => ({ nachricht, dateien });

describe("was für ein Modul zählt", () => {
  it("ausgelieferter Code unter src/app/m/<modul>/ zählt, Tests und Release-Notizen nicht", () => {
    expect(istModulDatei("src/app/m/lagerbuch/page.tsx", "lagerbuch")).toBe(true);
    expect(istModulDatei("src/app/m/lagerbuch/page.test.tsx", "lagerbuch")).toBe(false);
    expect(istModulDatei("src/app/m/lagerbuchx/page.tsx", "lagerbuch")).toBe(false);
    expect(istModulDatei("src/app/m/portal/_lib/neuigkeiten/notizen/lagerbuch/x.ts", "portal")).toBe(false);
    expect(istModulDatei("src/app/m/portal/page.tsx", "portal")).toBe(true);
  });

  it("der Scope zählt auch ohne Datei im Modul — eine core-Änderung für genau dieses Modul", () => {
    expect(zaehltFuer(c("fix(lagerbuch): Tabelle", "src/core/tabelle/x.ts"), "lagerbuch")).toBe(true);
    expect(zaehltFuer(c("feat(lagerbuch,helfer): beides", "src/core/x.ts"), "helfer")).toBe(true);
    expect(zaehltFuer(c("fix: allgemein", "src/core/x.ts"), "lagerbuch")).toBe(false);
  });

  it("test, docs, ci und style zählen nie, auch nicht mit Modul-Datei oder Scope", () => {
    expect(zaehltFuer(c("test(lagerbuch): mehr", "src/app/m/lagerbuch/x.tsx"), "lagerbuch")).toBe(false);
    expect(zaehltFuer(c("docs(lagerbuch): Kommentar", "src/app/m/lagerbuch/x.tsx"), "lagerbuch")).toBe(false);
    expect(zaehltFuer(c("chore: aufgeräumt", "src/app/m/lagerbuch/x.tsx"), "lagerbuch")).toBe(true);
  });
});

describe("spieleModuleNach", () => {
  it("nur betroffene Module steigen, mit dem größten Sprung des Schritts", () => {
    const v = spieleModuleNach(
      ["helfer", "lagerbuch"],
      [
        {
          module: ["helfer", "lagerbuch"],
          commits: [c("feat(lagerbuch): neu", "src/app/m/lagerbuch/a.tsx"), c("fix(lagerbuch): nach")],
        },
        { module: ["helfer", "lagerbuch"], commits: [c("fix: core", "src/core/a.ts")] },
        { module: ["helfer", "lagerbuch"], commits: [c("fix(helfer)!: anders", "src/app/m/helfer/a.ts")] },
      ],
    );
    expect(v).toEqual({ helfer: "2.0.0", lagerbuch: "1.1.0" });
  });

  it("ein neues Modul beginnt mit dem anlegenden Schritt bei 1.0.0", () => {
    const v = spieleModuleNach(
      ["portal"],
      [
        { module: ["neu", "portal"], commits: [c("feat(neu): da", "src/app/m/neu/page.tsx")] },
        { module: ["neu", "portal"], commits: [c("fix(neu): eins", "src/app/m/neu/page.tsx")] },
      ],
    );
    expect(v).toEqual({ neu: "1.0.1", portal: "1.0.0" });
  });

  it("alsUmgebung ergibt die Form für Build-Arg und ENV", () => {
    expect(alsUmgebung({ helfer: "1.0.0", lagerbuch: "1.2.3" })).toBe("helfer=1.0.0,lagerbuch=1.2.3");
  });
});

describe("berechneModulversionen — an einer echten Historie", () => {
  let repo: string;
  const git = (...args: string[]) =>
    execFileSync("git", args, { cwd: repo, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const datei = (pfad: string, inhalt = String(Math.random())) => {
    mkdirSync(path.dirname(path.join(repo, pfad)), { recursive: true });
    writeFileSync(path.join(repo, pfad), inhalt);
    git("add", pfad);
  };
  const pr = (zweig: string, schritte: [string, string][], titel: string) => {
    git("checkout", "-q", "-b", zweig);
    for (const [nachricht, pfad] of schritte) {
      datei(pfad);
      git("commit", "-q", "-m", nachricht);
    }
    git("checkout", "-q", "main");
    git("merge", "-q", "--no-ff", zweig, "-m", titel);
  };

  beforeAll(() => {
    repo = mkdtempSync(path.join(tmpdir(), "iuk-modulversion-"));
    git("init", "-q", "-b", "main");
    git("config", "user.email", "test@example.org");
    git("config", "user.name", "Test");
    git("config", "commit.gpgsign", "false");
    datei("src/app/m/lagerbuch/page.tsx");
    datei("src/app/m/helfer/page.tsx");
    git("commit", "-q", "-m", "feat(lagerbuch): vor der Einführung");
  });

  afterAll(() => {
    rmSync(repo, { recursive: true, force: true });
  });

  it("vor der Einführung: alle Module 1.0.0, ab HEAD gerechnet", () => {
    expect(berechneModulversionen(repo).versionen).toEqual({ helfer: "1.0.0", lagerbuch: "1.0.0" });
  });

  it("die Einführung ist der Start, nicht die Historie davor", () => {
    pr("einfuehrung", [["feat: Modulversionen", "scripts/modulversion.mjs"]], "Merge pull request #1");
    expect(berechneModulversionen(repo).versionen).toEqual({ helfer: "1.0.0", lagerbuch: "1.0.0" });
  });

  it("ein Merge zählt nur für das Modul, das er ändert", () => {
    pr(
      "lager",
      [
        ["feat(lagerbuch): neu", "src/app/m/lagerbuch/neu.tsx"],
        ["test(helfer): nur Test", "src/app/m/helfer/page.test.tsx"],
      ],
      "Merge pull request #2",
    );
    expect(berechneModulversionen(repo).versionen).toEqual({ helfer: "1.0.0", lagerbuch: "1.1.0" });
  });

  it("ein direkter Push zählt ebenso, und ein neues Modul beginnt bei 1.0.0", () => {
    datei("src/app/m/helfer/page.tsx");
    git("commit", "-q", "-m", "fix(helfer): Kleinigkeit");
    datei("src/app/m/neu/page.tsx");
    git("commit", "-q", "-m", "feat(neu): angelegt");
    expect(berechneModulversionen(repo).versionen).toEqual({
      helfer: "1.0.1",
      lagerbuch: "1.1.0",
      neu: "1.0.0",
    });
  });
});
