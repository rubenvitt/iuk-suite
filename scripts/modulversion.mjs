#!/usr/bin/env node
/**
 * Welche Version hat jedes Modul in diesem Stand?
 *
 * Gerufen vom Job `version` in `.github/workflows/ci.yml` (nach `version.mjs`), und von
 * Hand genauso:
 *
 *   node scripts/modulversion.mjs            # Modulversionen von HEAD, mit Herleitung
 *   node scripts/modulversion.mjs <commit>   # eines anderen Standes
 *
 * Runbook: `docs/runbooks/versionierung.md`, Abschnitt „Modulversionen".
 *
 * ─────────────────────────────────────────────────────────────────────────────────────
 * DIE SUITE-VERSION ZÄHLT JEDEN SCHRITT, DIE MODULVERSION NUR DIE DES MODULS. Sonst
 * dieselbe Idee wie `version.mjs`: die Nummer folgt aus der First-Parent-Kette von
 * `main`, nicht aus einer Datei, und braucht weder Tag noch Bot-Commit.
 *
 * EIN SCHRITT ZÄHLT FÜR MODUL X, wenn mindestens ein Commit darin
 *   - eine Datei unter `src/app/m/X/` ändert, die ausgeliefert wird (kein `*.test.ts(x)`,
 *     keine Release-Notiz unter `portal/_lib/neuigkeiten/` — die gehört zum Modul, über
 *     das sie berichtet, und das zählt schon über seinen eigenen Code), oder
 *   - den Scope `X` trägt (`fix(lagerbuch): …`, auch `feat(lagerbuch,helfer): …`). So
 *     zählt eine Änderung in `core`, die gezielt ein Modul betrifft, für dieses Modul.
 * Commits vom Typ `test`, `docs`, `ci` und `style` zählen nie — sie ändern nichts, was
 * jemand im Modul sieht. Eine `core`-Änderung ohne Modul-Scope zählt für kein Modul.
 *
 * DER SPRUNG ist der größte über die zählenden Commits des Schritts, mit derselben
 * Regel wie die Suite (`sprungAusNachricht`): `feat` Minor, `!`/`BREAKING CHANGE` Major,
 * sonst Patch.
 *
 * DER START IST DIE EINFÜHRUNG DIESES SKRIPTS: der älteste Schritt der Kette, der
 * `scripts/modulversion.mjs` anlegt. Dort steht jedes vorhandene Modul auf 1.0.0
 * (Entscheidung 2026-11-02: nicht die ganze Historie nachrechnen). Ein Modul, das
 * später entsteht, beginnt mit dem Schritt, der es anlegt, ebenfalls bei 1.0.0. Liegt
 * die Einführung nicht auf der Kette (ein PR-Lauf vor dem Merge), ist `ziel` selbst der
 * Start: alle Module 1.0.0. DESHALB DIESE DATEI NIE UMBENENNEN ODER LÖSCHEN UND NEU
 * ANLEGEN — der Start wanderte mit, und jede Nummer fiele zurück.
 *
 * AUSGABE für das Image: `SUITE_MODULVERSIONEN=aufgaben=1.0.0,lagerbuch=1.2.0,…`
 * (`core/version.ts`, `modulVersion()`). Kein JSON, weil der Wert als Build-Arg durch
 * YAML und Dockerfile geht und dort keine Anführungszeichen braucht.
 * ─────────────────────────────────────────────────────────────────────────────────────
 */
import { execFileSync } from "node:child_process";
import { appendFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

import { erhoehe, formatVersion, sprungAusNachricht } from "./version.mjs";

/** @typedef {import("./version.mjs").Sprung} Sprung */
/** @typedef {{ nachricht: string; dateien: readonly string[] }} Commit */

const RANG = { patch: 0, minor: 1, major: 2 };
export const SELBST = "scripts/modulversion.mjs";
const MODUL_WURZEL = "src/app/m/";
const NIE_ZAEHLEN = new Set(["test", "docs", "ci", "style"]);

/** @param {string} nachricht */
function kopfteile(nachricht) {
  const kopf = nachricht.split("\n", 1)[0] ?? "";
  const m = /^(\w+)(?:\(([^)]*)\))?!?:\s/.exec(kopf);
  return {
    typ: m?.[1] ?? null,
    scopes: m?.[2] ? m[2].split(/[,\s]+/).filter(Boolean) : [],
  };
}

/**
 * Ändert diese Datei ausgelieferten Code von `modul`?
 *
 * @param {string} datei
 * @param {string} modul
 */
export function istModulDatei(datei, modul) {
  if (!datei.startsWith(`${MODUL_WURZEL}${modul}/`)) return false;
  if (/\.test\.tsx?$/.test(datei)) return false;
  if (datei.startsWith(`${MODUL_WURZEL}portal/_lib/neuigkeiten/`)) return false;
  return true;
}

/**
 * Zählt dieser Commit für `modul`?
 *
 * @param {Commit} commit
 * @param {string} modul
 */
export function zaehltFuer(commit, modul) {
  const { typ, scopes } = kopfteile(commit.nachricht);
  if (typ !== null && NIE_ZAEHLEN.has(typ)) return false;
  return scopes.includes(modul) || commit.dateien.some((d) => istModulDatei(d, modul));
}

/**
 * Der reine Kern ohne git: die Versionen nach einer Folge von Schritten.
 *
 * @param {readonly string[]} startModule Module, die am Start existieren (je 1.0.0)
 * @param {readonly { module: readonly string[]; commits: readonly Commit[] }[]} schritte
 *   je Schritt die Module, die NACH ihm existieren, und seine Commits
 * @returns {Record<string, string>}
 */
export function spieleModuleNach(startModule, schritte) {
  /** @type {Map<string, import("./version.mjs").Version>} */
  const stand = new Map(startModule.map((m) => [m, { major: 1, minor: 0, patch: 0 }]));
  for (const schritt of schritte) {
    for (const modul of schritt.module) {
      const bisher = stand.get(modul);
      if (!bisher) {
        // Neu in diesem Schritt: beginnt bei 1.0.0, der anlegende Schritt zählt nicht.
        stand.set(modul, { major: 1, minor: 0, patch: 0 });
        continue;
      }
      const zaehlend = schritt.commits.filter((c) => zaehltFuer(c, modul));
      if (zaehlend.length === 0) continue;
      /** @type {Sprung} */
      let sprung = "patch";
      for (const c of zaehlend) {
        const s = sprungAusNachricht(c.nachricht);
        if (RANG[s] > RANG[sprung]) sprung = s;
      }
      stand.set(modul, erhoehe(bisher, sprung));
    }
  }
  return Object.fromEntries([...stand].sort(([a], [b]) => a.localeCompare(b)).map(([m, v]) => [m, formatVersion(v)]));
}

/** `aufgaben=1.0.0,lagerbuch=1.2.0` — die Form für Build-Arg und ENV. */
/** @param {Record<string, string>} versionen */
export function alsUmgebung(versionen) {
  return Object.entries(versionen)
    .map(([m, v]) => `${m}=${v}`)
    .join(",");
}

/**
 * @param {string[]} args
 * @param {string} cwd
 */
function git(args, cwd) {
  return execFileSync("git", args, { cwd, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"], maxBuffer: 1 << 28 });
}

/** @param {string} cwd @param {string} commit */
function moduleIn(cwd, commit) {
  return git(["ls-tree", "-d", "--name-only", commit, MODUL_WURZEL], cwd)
    .split("\n")
    .filter(Boolean)
    .map((p) => p.slice(MODUL_WURZEL.length));
}

/**
 * Der Start: der älteste Schritt der First-Parent-Kette von `ziel`, der diese Datei
 * anlegt — oder `ziel` selbst, wenn sie dort noch nicht angelegt wurde.
 *
 * @param {string} cwd
 * @param {string} ziel
 */
function startVon(cwd, ziel) {
  const treffer = git(
    // `--name-only` und ein Präfix: `--diff-merges=first-parent` druckt sonst bei einem
    // Merge den Patch mit, und dessen Zeilen sähen aus wie Hashes.
    [
      "log",
      "--first-parent",
      "--diff-merges=first-parent",
      "--diff-filter=A",
      "--name-only",
      "--format=@%H",
      ziel,
      "--",
      SELBST,
    ],
    cwd,
  )
    .split("\n")
    .filter((z) => z.startsWith("@"))
    .map((z) => z.slice(1));
  return treffer.at(-1) ?? git(["rev-parse", `${ziel}^{commit}`], cwd).trim();
}

/**
 * @param {string} cwd
 * @param {string} ziel
 */
export function berechneModulversionen(cwd, ziel = "HEAD") {
  const start = startVon(cwd, ziel);
  const kette = git(["rev-list", "--first-parent", "--reverse", "--parents", `${start}..${ziel}`], cwd)
    .split("\n")
    .filter(Boolean)
    .map((z) => z.split(" "));
  /** @param {string} h @returns {Commit} */
  const lies = (h) => ({
    nachricht: git(["log", "-1", "--format=%B", h], cwd).trim(),
    // `--cc`: ein Merge-Commit liefert so nur, was er SELBST ändert — eine
    // Konfliktauflösung. Alles andere steckt in den Commits des Zweigs, die einzeln
    // gelesen werden; ein First-Parent-Diff zählte sie ein zweites Mal.
    dateien: git(["diff-tree", "--cc", "--no-commit-id", "--name-only", "-r", h], cwd).split("\n").filter(Boolean),
  });
  const schritte = kette.map(([commit, erster, zweiter]) => {
    const hashes = zweiter
      ? git(["rev-list", `${erster}..${commit}`], cwd).split("\n").filter(Boolean)
      : [commit];
    return { commit, module: moduleIn(cwd, commit), commits: hashes.map(lies) };
  });
  const versionen = spieleModuleNach(moduleIn(cwd, start), schritte);
  return { start, schritte: schritte.length, versionen };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const ziel = process.argv[2] ?? "HEAD";
  const e = berechneModulversionen(process.cwd(), ziel);
  const zeilen = [
    `Start: ${e.start.slice(0, 7)} (alle Module 1.0.0), ${e.schritte} Schritte seitdem`,
    ...Object.entries(e.versionen).map(([m, v]) => `  ${m.padEnd(14)} ${v}`),
  ];
  console.log(zeilen.join("\n"));
  if (process.env.GITHUB_OUTPUT) {
    appendFileSync(process.env.GITHUB_OUTPUT, `modulversionen=${alsUmgebung(e.versionen)}\n`);
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Modulversionen\n\n\`\`\`\n${zeilen.join("\n")}\n\`\`\`\n`);
  }
}
