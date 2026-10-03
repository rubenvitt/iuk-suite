import { describe, it, expect } from "vitest";
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  chmodSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import os from "node:os";
import path from "node:path";

/**
 * Der automatische Rollout ist eine Kette aus fünf Dateien, die NUR ZUSAMMEN trägt:
 *
 *   ci.yml (build-arg) → Dockerfile (ENV) → version.ts → health-Route → deploy.sh
 *
 * Reisst ein Glied, meldet KEIN anderes Tor etwas. `pnpm build` liest keine Workflows,
 * `typecheck` kein Bash, E2E kein Compose, und der Rollout selbst läuft erst NACH dem
 * Merge — der Fehlschlag stünde also am Ende der Kette, in Produktion, mit einer
 * Meldung über eine Revision statt über die Zeile, die fehlt. Beispiele, die dieser
 * Test je einzeln abfängt:
 *
 *   * `build-args` im ci.yml gelöscht → Image ohne SUITE_REVISION → jeder Rollout
 *     bricht in Schritt 2 ab, und zwar mit dem Verdacht auf einen kaputten Server.
 *   * `ARG` im Dockerfile vor die COPY-Zeilen gerutscht → alles grün, nur der
 *     Layer-Cache ist bei jedem Commit kalt (Minuten, jeden Lauf, unbemerkt).
 *   * `if:` am deploy-Job gelockert → ein selbst gehosteter Runner führt fremden
 *     PR-Code auf der Maschine mit dem Docker-Socket aus. Das ist der teuerste
 *     denkbare Fehler dieser Datei, und er sieht harmlos aus.
 *
 * WARUM DER YAML-BAUM PER EINRÜCKUNG ZERLEGT WIRD: ein `yaml`-Paket steht als DIREKTE
 * Abhängigkeit nicht zur Verfügung — dieselbe Lage und dieselbe Antwort wie in
 * `src/app/m/files/_lib/compose.test.ts`, deren Vorgehen hier übernommen ist.
 */

const WURZEL = path.resolve(__dirname, "..");
const lies = (p: string) => readFileSync(path.join(WURZEL, p), "utf8");

const ciZeilen = lies(".github/workflows/ci.yml").split("\n");
const dockerfile = lies("Dockerfile");
const composeText = lies("compose.yaml");
const deploySh = lies("scripts/deploy.sh");
const healthRoute = lies("src/app/api/health/[modul]/route.ts");

function tiefe(zeile: string): number {
  if (zeile.trim() === "") return -1;
  return zeile.length - zeile.trimStart().length;
}

/** Rumpf eines Schlüssels: alle folgenden Zeilen, die TIEFER eingerückt sind. */
function rumpf(zeilen: string[], name: string, ebene: number): string[] {
  const praefix = " ".repeat(ebene) + name + ":";
  const kopf = zeilen.find((z) => z === praefix || z.startsWith(praefix + " "));
  if (kopf === undefined) return [];
  const raus: string[] = [];
  for (let i = zeilen.indexOf(kopf) + 1; i < zeilen.length; i++) {
    const t = tiefe(zeilen[i]);
    if (t === -1) continue;
    if (t <= ebene) break;
    raus.push(zeilen[i]);
  }
  return raus;
}

const jobs = rumpf(ciZeilen, "jobs", 0);
const deployJob = rumpf(jobs, "deploy", 2).join("\n");
const buildJob = rumpf(jobs, "build", 2).join("\n");

describe("ci.yml — der deploy-Job hängt hinter der ganzen Pipeline", () => {
  it("es gibt ihn überhaupt, und er wartet auf `merge`", () => {
    expect(deployJob, "Job `deploy` steht in ci.yml").not.toBe("");
    // `merge` und nicht `build`: erst die Manifest-Liste macht `:latest` zu dem Stand,
    // den der Server zieht. Nach `build` gibt es nur Digests ohne Tag.
    expect(deployJob).toMatch(/needs:\s*merge/);
  });

  it("er läuft NUR auf main — der Riegel vor fremdem Code auf dem eigenen Server", () => {
    const bedingung = /if:\s*(.+)/.exec(deployJob)?.[1] ?? "";
    expect(bedingung).toContain("refs/heads/main");
    // Und er ist abschaltbar, ohne diese Datei anzufassen: fehlt die Repo-Variable,
    // wird der Job übersprungen statt an einem nicht vorhandenen Runner zu hängen.
    expect(bedingung).toContain("vars.SUITE_STACK_DIR");
  });

  it("er ist der EINZIGE Job auf einem selbst gehosteten Runner", () => {
    expect(deployJob).toMatch(/runs-on:\s*\[self-hosted/);
    const selbstGehostet = jobs
      // Kommentarzeilen zählen nicht mit — sie erwähnen `runs-on: [self-hosted, …]`
      // ausdrücklich, weil dort die Sicherheitsbegründung steht.
      .filter((z) => !z.trimStart().startsWith("#"))
      .filter((z) => z.includes("runs-on:"))
      .filter((z) => !z.includes("matrix.runner"))
      .filter((z) => z.includes("self-hosted"));
    expect(selbstGehostet, "genau ein `runs-on: self-hosted` im ganzen Workflow").toHaveLength(1);
  });

  it("er hängt am Environment `produktion` — das ist das Freigabe-Gate", () => {
    // Der Reviewer-Zwang selbst steht in den Repo-Einstellungen und ist von hier aus
    // nicht prüfbar; ohne DIESEN Eintrag kann er aber gar nicht greifen.
    expect(rumpf(deployJob.split("\n"), "environment", 4).join("\n")).toMatch(/name:\s*produktion/);
  });

  it("zwei Rollouts überholen sich nicht, und ein laufender wird nicht abgebrochen", () => {
    const nebenlauf = rumpf(deployJob.split("\n"), "concurrency", 4).join("\n");
    expect(nebenlauf).toMatch(/group:/);
    // Ein Abbruch zwischen `.env`-Pin und `docker compose up -d` liesse den Server in
    // einem Zustand zurück, den niemand angeordnet hat.
    expect(nebenlauf).toMatch(/cancel-in-progress:\s*false/);
  });

  it("er ruft das Rollout-Skript des Repos auf, statt Befehle zu duplizieren", () => {
    expect(deployJob).toMatch(/scripts\/deploy\.sh/);
    expect(deployJob).toMatch(/SUITE_REVISION_ERWARTET:\s*\$\{\{\s*github\.sha\s*\}\}/);
  });

  it("und er räumt die ghcr-Zugangsdaten wieder ab", () => {
    // Auf einem GitHub-Runner erledigt das die verschwindende Maschine. Hier nicht.
    expect(deployJob).toMatch(/docker logout/);
  });
});

describe("ci.yml → Dockerfile — der Commit kommt als ENV ins Image", () => {
  it("BEIDE build-push-Schritte reichen SUITE_REVISION durch", () => {
    // Nur im pushenden Schritt gesetzt, prüfte der image-smoke ein anderes Image als
    // das veröffentlichte — ausgerechnet in der Eigenschaft, an der der Rollout hängt.
    const treffer = buildJob.match(/SUITE_REVISION=\$\{\{\s*github\.sha\s*\}\}/g) ?? [];
    expect(treffer.length, "einmal im lokalen Build, einmal im Push").toBeGreaterThanOrEqual(2);
  });

  it("das Dockerfile nimmt sie als ARG entgegen und stempelt sie als ENV", () => {
    expect(dockerfile).toMatch(/^ARG SUITE_REVISION=/m);
    expect(dockerfile).toMatch(/^ENV SUITE_REVISION=\$\{SUITE_REVISION\}/m);
  });

  it("und zwar in der RUNNER-Stage, hinter den COPY-Zeilen", () => {
    const argPos = dockerfile.indexOf("ARG SUITE_REVISION");
    const runnerPos = dockerfile.indexOf("AS runner");
    const letzteCopy = dockerfile.lastIndexOf("COPY --from=builder");
    expect(argPos, "ARG steht in der Runner-Stage").toBeGreaterThan(runnerPos);
    // In der Builder-Stage oder vor den COPYs änderte jeder Commit den Kontext des
    // teuersten Layers — der Cache wäre bei jedem Lauf kalt, ohne dass es auffällt.
    expect(argPos, "ARG steht hinter der letzten COPY-Zeile").toBeGreaterThan(letzteCopy);
  });
});

/*
 * Die Versionsnummer geht denselben Weg wie die Revision und reißt an denselben
 * Stellen still: ein vergessenes Build-Arg ergibt ein Image, dessen Profilseite
 * „Entwicklungsstand" zeigt — in Produktion, ohne rotes Tor. Dazu zwei Riegel, die
 * es nur hier gibt: `release` ist der EINZIGE Job mit `contents: write`, und der Tag
 * entsteht erst hinter `merge`, nie vor dem Build (docs/runbooks/versionierung.md).
 */
describe("ci.yml → Dockerfile → version.ts — die Versionsnummer geht denselben Weg", () => {
  const versionJob = rumpf(jobs, "version", 2).join("\n");
  const releaseJob = rumpf(jobs, "release", 2).join("\n");
  const mergeJob = rumpf(jobs, "merge", 2).join("\n");

  it("der Job `version` rechnet mit VOLLER Historie und ohne pnpm", () => {
    expect(versionJob, "Job `version` steht in ci.yml").not.toBe("");
    // `git describe` und die First-Parent-Kette brauchen Tags und Zwischencommits —
    // eine Tiefe-1-Kopie hat beides nicht, und das Skript würfe bei jedem Lauf.
    expect(versionJob).toMatch(/fetch-depth:\s*0/);
    expect(versionJob).toMatch(/node scripts\/version\.mjs/);
    expect(versionJob).not.toMatch(/pnpm install/);
  });

  it("der Pflicht-Check `test` wartet auf `version` und prüft sein Ergebnis", () => {
    // Ein rotes `version` ließe `build` nur ÜBERSPRINGEN, und übersprungen ist für das
    // Ruleset kein Fehlschlag: der PR wäre mergebar, und der Fehler träfe erst den
    // main-Lauf samt Rollout. Nur über `test` wird er zum Merge-Blocker.
    const testJob = rumpf(jobs, "test", 2).join("\n");
    expect(testJob).toMatch(/needs:\s*\[[^\]]*\bversion\b/);
    expect(testJob).toMatch(/needs\.version\.result\s*\}\}"\s*=\s*"success"/);
  });

  it("`test` schweigt nur bei einem ÜBERHOLTEN Lauf, nicht bei jedem abgebrochenen (DRK-410)", () => {
    // Ein per `if` übersprungener Pflicht-Check gilt als bestanden. `!cancelled()` am
    // Gate ließe deshalb auch einen von Hand abgebrochenen Lauf am aktuellen PR-Kopf
    // mergebar zurück. Stillgestellt werden darf `test` allein über `ueberholt`, und der
    // entscheidet über den Vergleich mit dem PR-Kopf, nicht über `cancelled()` allein.
    const testJob = rumpf(jobs, "test", 2).join("\n");
    const ueberholtJob = rumpf(jobs, "ueberholt", 2).join("\n");
    expect(ueberholtJob, "Job `ueberholt` steht in ci.yml").not.toBe("");
    expect(testJob).toMatch(/if:\s*\$\{\{\s*always\(\)\s*&&\s*needs\.ueberholt\.outputs\.ueberholt\s*!=\s*'true'\s*\}\}/);
    expect(testJob).not.toMatch(/cancelled\(\)/);
    expect(testJob).toMatch(/needs:\s*\[[^\]]*\bueberholt\b/);
    expect(ueberholtJob).toMatch(/if:\s*\$\{\{\s*cancelled\(\)\s*&&\s*github\.event_name\s*==\s*'pull_request'\s*\}\}/);
    expect(ueberholtJob).toMatch(/pulls\/\$PR"\s*--jq \.head\.sha/);
    expect(ueberholtJob).toMatch(/"\$kopf"\s*!=\s*"\$LAUF_SHA"/);
  });

  it("kein Job hinter `ueberholt` verlässt sich auf das implizite `success()`", () => {
    // Ein `if` ohne Statusfunktion bekommt von GitHub ein implizites `success()`, und das
    // prüft ALLE Vorfahren transitiv. `ueberholt` ist außerhalb eines abgebrochenen
    // PR-Laufs immer `skipped` — jeder Job dahinter, der das nicht selbst abfängt, fällt
    // auf JEDEM grünen main-Lauf still aus. So ist es `merge`, `release` und `deploy`
    // nach DRK-410 ergangen: grüne Pipeline, kein Image, kein Tag, kein Rollout.
    const namen = jobs
      .map((z) => /^ {2}([A-Za-z0-9_-]+):\s*$/.exec(z)?.[1])
      .filter((n): n is string => n !== undefined);
    const needsVon = new Map(
      namen.map((n) => {
        const zeile = rumpf(jobs, n, 2).find((z) => /^ {4}needs:/.test(z)) ?? "";
        const wert = zeile.replace(/^ {4}needs:\s*/, "").replace(/[[\]]/g, "");
        return [n, wert.split(",").map((s) => s.trim()).filter(Boolean)];
      }),
    );
    const vorfahren = (n: string, gesehen = new Set<string>()): Set<string> => {
      for (const v of needsVon.get(n) ?? []) {
        if (!gesehen.has(v)) {
          gesehen.add(v);
          vorfahren(v, gesehen);
        }
      }
      return gesehen;
    };
    const dahinter = namen.filter((n) => vorfahren(n).has("ueberholt"));
    expect(dahinter).toEqual(expect.arrayContaining(["test", "merge", "release", "deploy"]));
    for (const n of dahinter) {
      const bedingung = rumpf(jobs, n, 2).find((z) => /^ {4}if:/.test(z)) ?? "";
      expect(bedingung, `\`${n}\` braucht eine Statusfunktion im if`).toMatch(/always\(\)|!cancelled\(\)/);
      // `test` wertet die Ergebnisse im Schritt selbst aus (und muss dafür laufen);
      // alle anderen prüfen jeden direkten Bedarf im `if`.
      if (n === "test") continue;
      for (const v of needsVon.get(n) ?? []) {
        expect(bedingung, `\`${n}\` prüft needs.${v}.result`).toContain(`needs.${v}.result == 'success'`);
      }
    }
  });

  it("`build` und `merge` warten auf `version` — sonst ist die Ausgabe leer", () => {
    // Ein `needs.version.outputs.version` ohne `needs: version` ist in GitHub Actions
    // kein Fehler, sondern ein leerer String: `SUITE_VERSION=` im Image, `:` als Tag.
    expect(buildJob).toMatch(/needs:\s*\[[^\]]*\bversion\b/);
    expect(mergeJob).toMatch(/needs:\s*\[[^\]]*\bversion\b/);
  });

  it("BEIDE build-push-Schritte reichen SUITE_VERSION durch — wie die Revision", () => {
    const treffer = buildJob.match(/SUITE_VERSION=\$\{\{\s*needs\.version\.outputs\.version\s*\}\}/g) ?? [];
    expect(treffer.length, "einmal im lokalen Build, einmal im Push").toBeGreaterThanOrEqual(2);
  });

  it("das Dockerfile stempelt sie als ENV, an derselben Stelle wie die Revision", () => {
    expect(dockerfile).toMatch(/^ARG SUITE_VERSION=/m);
    expect(dockerfile).toMatch(/^ENV SUITE_VERSION=\$\{SUITE_VERSION\}/m);
    expect(dockerfile.indexOf("ARG SUITE_VERSION")).toBeGreaterThan(
      dockerfile.lastIndexOf("COPY --from=builder"),
    );
  });

  it("die Manifest-Liste trägt die Nummer als Tag, nur auf main", () => {
    expect(mergeJob).toMatch(
      /type=raw,value=\$\{\{\s*needs\.version\.outputs\.version\s*\}\},enable=\{\{is_default_branch\}\}/,
    );
  });

  it("ein Versions-Tag, das in der Registry schon existiert, bleibt auf seinem Digest", () => {
    // Ein wiederholter Lauf oder zwei sich überholende Läufe desselben Commits bauen ein
    // Image mit anderem Digest; `:X.Y.Z` wanderte sonst still weg von dem Stand, den
    // Git-Tag und Release nennen. Geprüft wird im Moment der Veröffentlichung gegen die
    // Registry — eine Momentaufnahme aus dem Job `version` wäre bei zwei parallelen
    // Läufen schon wieder alt. Deshalb: `inspect` VOR `create`, im selben Schritt.
    const create = mergeJob.indexOf("docker buildx imagetools create");
    const inspect = mergeJob.indexOf("docker buildx imagetools inspect \"$VERSIONSTAG\"");
    expect(inspect, "die Registry wird nach dem Versions-Tag gefragt").toBeGreaterThan(-1);
    expect(inspect, "… und zwar VOR dem Erzeugen der Manifest-Liste").toBeLessThan(create);
    expect(mergeJob).not.toMatch(/needs\.version\.outputs\.getaggt/);
  });

  it("`merge` und `release` laufen je Commit nacheinander, nie gleichzeitig", () => {
    // Prüfen-dann-Anlegen bleibt ein Rennen, wenn zwei Läufe DESSELBEN Commits
    // gleichzeitig darin stehen. Die Gruppe hängt am SHA — nicht am Workflow —, damit
    // Läufe verschiedener Commits sich weiter überholen dürfen und GitHubs Abbruch
    // wartender Läufe nie einen Merge dazwischen trifft.
    for (const [name, job] of [
      ["merge", mergeJob],
      ["release", releaseJob],
    ] as const) {
      const nebenlauf = rumpf(job.split("\n"), "concurrency", 4).join("\n");
      expect(nebenlauf, `${name}: concurrency steht`).toMatch(/group:.*\$\{\{\s*github\.sha\s*\}\}/);
      expect(nebenlauf, `${name}: kein Abbruch`).toMatch(/cancel-in-progress:\s*false/);
    }
  });

  it("die Health-Route gibt sie neben der Revision aus, die Profilseite zeigt sie", () => {
    expect(healthRoute).toMatch(/laufendeVersion\(\)/);
    expect(healthRoute).toMatch(/version:/);
    expect(lies("src/app/m/portal/profil/page.tsx")).toMatch(/laufendeVersion\(\)/);
  });

  it("`release` hängt hinter `merge`, läuft nur auf main und ist der EINZIGE mit contents: write", () => {
    expect(releaseJob, "Job `release` steht in ci.yml").not.toBe("");
    expect(releaseJob).toMatch(/needs:\s*\[[^\]]*\bmerge\b/);
    expect(/if:\s*(.+)/.exec(releaseJob)?.[1] ?? "").toContain("refs/heads/main");
    expect(releaseJob).toMatch(/gh release create/);
    // Der Tag darf nie einen bestehenden überschreiben — ein gleichzeitiger Lauf eines
    // ANDEREN Commits war dann schneller, und das soll rot sein, nicht still umgebogen.
    expect(releaseJob).toMatch(/git ls-remote --exit-code --tags/);
    // Ein gleichzeitiger Lauf DESSELBEN Commits dagegen ist kein Fehler: schlägt das
    // Anlegen fehl, wird nachgeprüft, ob Tag und Release inzwischen für GITHUB_SHA
    // existieren — dann grün. Die Prüfung ist eine Funktion und läuft vor und nach dem
    // Anlegen, sonst bliebe die Lücke zwischen Prüfung und `gh release create`.
    expect(releaseJob).toMatch(/tag_gehoert_uns\(\)\s*\{/);
    expect(releaseJob).toMatch(/if ! gh release create/);
    expect((releaseJob.match(/tag_gehoert_uns && gh release view/g) ?? []).length).toBe(2);
    // Die Basis der Release-Notizen wird HIER frisch gerechnet, mit voller Historie:
    // aus `version` käme bei zwei sich überholenden Läufen dieselbe alte Basis, und der
    // spätere listete die PRs des früheren noch einmal.
    expect(releaseJob).toMatch(/fetch-depth:\s*0/);
    expect(releaseJob).toMatch(/node scripts\/version\.mjs/);
    // … und die Tags werden unmittelbar davor nachgeholt, nicht nur beim Checkout.
    expect(releaseJob).toMatch(/git fetch --tags[^\n]*\n\s*node scripts\/version\.mjs/);
    expect(releaseJob).not.toMatch(/needs\.version\.outputs\.basis/);
    const schreibend = jobs
      .filter((z) => !z.trimStart().startsWith("#"))
      .filter((z) => /^\s*contents:\s*write\b/.test(z));
    expect(schreibend, "genau ein `contents: write` im ganzen Workflow").toHaveLength(1);
  });

  it("`deploy` wartet NICHT auf `release` — ein Tag-Fehler hält den Rollout nicht auf", () => {
    expect(deployJob).not.toMatch(/needs:.*\brelease\b/);
  });
});

describe("die Kette bis zur Antwort", () => {
  it("die Health-Route eines Moduls gibt die Revision aus", () => {
    expect(healthRoute).toMatch(/laufendeRevision\(\)/);
    expect(healthRoute).toMatch(/revision:/);
  });

  it("`/api/health` (ohne Modul) bleibt bewusst ohne sie", () => {
    // Diese Route hat weder Parameter noch Request-Zugriff und kann von Next prerendert
    // werden — dort stünde der BAUZEIT-Wert `unbekannt` in einer Antwort, die zur
    // Laufzeit nie wieder entsteht. Der Rollout prüft ohnehin `/api/health/portal`.
    expect(lies("src/app/api/health/route.ts")).not.toMatch(/revision/);
  });

  it("compose.yaml lässt das Image pinnen — mit `:-`, sonst scheitert `compose config`", () => {
    // Wörtlich samt Doppelpunkt: `${VAR-vorgabe}` griffe nur bei „gar nicht gesetzt",
    // nicht bei „leer gesetzt" — und leer ist genau das, was Compose aus einer
    // fehlenden Variablen macht (dieselbe Falle wie beim clamav-Image).
    expect(composeText).toContain("${SUITE_IMAGE:-ghcr.io/rubenvitt/iuk-suite:latest}");
  });
});

describe("scripts/deploy.sh", () => {
  it("ist ausführbar — sonst scheitert der Job an der letzten Zeile", () => {
    expect(statSync(path.join(WURZEL, "scripts/deploy.sh")).mode & 0o111).toBeGreaterThan(0);
  });

  it("bricht bei jedem Fehler ab, auch in einer Pipe", () => {
    expect(deploySh).toMatch(/^set -euo pipefail$/m);
  });

  it("prüft die Revision VOR dem Austausch und nach dem Austausch", () => {
    // Vorher (Registry-Stand) verhindert einen Austausch gegen den falschen Commit;
    // nachher (laufende Instanz) ist der Beweis, dass der neue Stand wirklich antwortet.
    expect(deploySh).toMatch(/org\.opencontainers\.image\.revision/);
    expect(deploySh).toMatch(/api\/health\/portal/);
  });

  it("hat einen Rückweg und benutzt ihn bei jedem Fehlschlag nach dem Austausch", () => {
    expect(deploySh).toMatch(/zurueck_und_raus/);
  });

  it("ein überholter Lauf endet grün — mit Beweis, nicht mit Vermutung", () => {
    /*
     * Der deploy-Job wartet auf seine Freigabe; überschreibt währenddessen ein neuerer
     * main-Merge das Tag, war die Freigabe des älteren Laufs bisher IMMER rot (gemessen
     * am 2026-08-28, Lauf 33179101270) — ein Fehlerbild ohne Fehler, das echte Abbrüche
     * unglaubwürdig macht. Grün wird der Fall aber nur mit Beweis: der Stand auf dem
     * Tag muss in der Historie ein NACHFOLGER des erwarteten Commits sein.
     */
    expect(deploySh).toMatch(/merge-base --is-ancestor/);
    expect(deploySh).toMatch(/ÜBERHOLT/);
    // Der Beweis braucht die Historie zwischen beiden Commits — eine Tiefe-1-Kopie
    // hat sie nicht, und der überholte Lauf bliebe still wieder rot.
    expect(deployJob).toMatch(/fetch-depth:\s*0/);
  });

  it("hat in ausführbaren Zeilen keinen unescapten Backtick", () => {
    /*
     * Gemessen am 16.08.2026 beim Probelauf gegen eine Docker-Attrappe, nicht vermutet:
     * `docker compose ps clamav` in einer Fehlermeldung ist für bash in einer doppelt
     * gequoteten Zeichenkette eine KOMMANDOSUBSTITUTION. Die Meldung des schlimmsten
     * Falls („weder der neue noch der alte Stand läuft") enthielt danach die Ausgabe
     * dieses Befehls statt seines Namens — unlesbar genau dann, wenn man sie braucht.
     * `bash -n` sieht das nicht, es ist gültige Syntax.
     */
    const verdaechtig = deploySh
      .split("\n")
      .map((zeile, i) => [i + 1, zeile] as const)
      .filter(([, z]) => !z.trimStart().startsWith("#"))
      .filter(([, z]) => /(^|[^\\])`/.test(z));
    expect(verdaechtig.map(([n, z]) => `${n}: ${z.trim()}`)).toEqual([]);
  });

  it("zeigt vor dem Rollback, WARUM die Suite nicht hochkam — geschwärzt (DRK-467)", () => {
    /*
     * Ohne Auszug stand im Lauf nur „nicht healthy geworden", die Ursache („Ungültige
     * Host-Konfiguration") lag allein im Container-Log auf dem Server (Lauf 35843699990).
     * Der Auszug muss VOR dem Rollback stehen: `up -d` ersetzt den Container, und mit
     * ihm verschwindet sein Log.
     */
    const schritt6 = deploySh.slice(deploySh.indexOf("# ══ Schritt 6"), deploySh.indexOf("# ══ Schritt 7"));
    expect(schritt6.indexOf("zeige_suite_log")).toBeGreaterThan(-1);
    expect(schritt6.indexOf("zeige_suite_log")).toBeLessThan(schritt6.indexOf("zurueck_und_raus"));
    // Nach Schritt 7 war der Container healthy und öffentlich erreichbar — sein Log kann
    // Nutzerdaten tragen und gehört nicht in ein öffentliches Protokoll.
    const schritt7 = deploySh.slice(deploySh.indexOf("# ══ Schritt 7"), deploySh.indexOf("# ══ Schritt 8 "));
    expect(schritt7).not.toMatch(/zeige_suite_log|compose logs/);
  });

  it("der Auszug trägt keinen Wert aus der .env — auch keinen ohne „geheim“ im Namen", () => {
    const funktion = (name: string) => {
      const ab = deploySh.indexOf(`${name}() {`);
      expect(ab, `${name} steht in scripts/deploy.sh`).toBeGreaterThan(-1);
      return deploySh.slice(ab, deploySh.indexOf("\n}\n", ab) + 3);
    };
    const kladde = mkdtempSync(path.join(os.tmpdir(), "deploy-log-"));
    const env = path.join(kladde, ".env");
    writeFileSync(
      env,
      [
        "# Kommentar",
        "AUTH_SECRET=abcdefghijklmnopqrstuvwxyz012345",
        'POCKET_ID_CLIENT_SECRET="doppelt-gequotet"',
        "export POCKET_ID_API_KEY='einfach-gequotet'",
        // Der Fall, den eine Namensliste übersähe: das Token steckt in einer URL.
        "BACKUP_PING_URL=https://hc.example/ping/0f1e2d3c # Kommentar",
        "SUITE_HOST_QR=qr.iuk-ue.de",
        "KURZ=true",
        "SUITE_IMAGE=ghcr.io/rubenvitt/iuk-suite@sha256:0123456789abcdef",
        "TEIL=abcdefghij",
        "CRLF=crlf-geheimnis\r",
        "",
      ].join("\n"),
    );
    const log = [
      "Ungültige Host-Konfiguration: SUITE_HOST_FOO passt zu keinem Modul. Bekannt: SUITE_HOST_QR",
      "abcdefghijklmnopqrstuvwxyz012345 doppelt-gequotet einfach-gequotet crlf-geheimnis",
      "https://hc.example/ping/0f1e2d3c qr.iuk-ue.de true",
      "postgres://nutzer:passwort@db:5432/x",
    ].join("\n");
    writeFileSync(path.join(kladde, "log"), log + "\n");
    writeFileSync(
      path.join(kladde, "docker"),
      [
        "#!/bin/bash",
        `if [ "$2" = "logs" ]; then cat ${JSON.stringify(path.join(kladde, "log"))}; exit 0; fi`,
        'if [ "$2" = "ps" ]; then echo "suite-1 ghcr.io/rubenvitt/iuk-suite@sha256:0123456789abcdef Up (unhealthy)"; exit 0; fi',
        "exit 1",
      ].join("\n"),
    );
    chmodSync(path.join(kladde, "docker"), 0o755);
    const fahre = (envDatei: string) => {
      const p = spawnSync(
        "bash",
        [
          "-c",
          `set -euo pipefail\nmelde() { echo "== $*"; }\nENV_DATEI=${JSON.stringify(envDatei)}\nLOG_ZEILEN=80\n${funktion("schwaerze")}\n${funktion("zeige_suite_log")}\nzeige_suite_log test\necho WEITER`,
        ],
        { encoding: "utf8", timeout: 20_000, env: { ...process.env, PATH: `${kladde}:${process.env.PATH}` } },
      );
      return { code: p.status, aus: `${p.stdout}${p.stderr}` };
    };
    try {
      const lauf = fahre(env);
      expect(lauf.code).toBe(0);
      expect(lauf.aus).toContain("WEITER");
      for (const geheim of [
        "abcdefghij",
        "doppelt-gequotet",
        "einfach-gequotet",
        "crlf-geheimnis",
        "0f1e2d3c",
        "qr.iuk-ue.de",
        "passwort",
      ]) {
        expect(lauf.aus, `„${geheim}" ist geschwärzt`).not.toContain(geheim);
      }
      // Die Gegenprobe ist die Hälfte der Messung: die Ursache muss lesbar bleiben.
      expect(lauf.aus).toContain("SUITE_HOST_FOO passt zu keinem Modul");
      expect(lauf.aus).toContain("Up (unhealthy)");
      expect(lauf.aus).toContain("sha256:0123456789abcdef");
      expect(lauf.aus).toMatch(/\btrue$/m);
      // Ist die .env nicht lesbar, kommt NICHTS durch — und der Rollback läuft trotzdem.
      const blind = fahre(path.join(kladde, "fehlt"));
      expect(blind.code).toBe(0);
      expect(blind.aus).toContain("WEITER");
      expect(blind.aus).not.toContain("abcdefghijklmnopqrstuvwxyz012345");
      expect(blind.aus).not.toContain("Host-Konfiguration");
    } finally {
      rmSync(kladde, { recursive: true, force: true });
    }
  }, 20_000);

  it("liest die .env NIE als Ganzes — sie trägt Geheimnisse", () => {
    // Ein `cat .env` oder `docker compose config` mit sichtbarer Ausgabe landete im
    // Protokoll des Laufs. GitHub maskiert nur, was es als Secret kennt; AUTH_SECRET aus
    // einer Server-Datei kennt es nicht.
    expect(deploySh).not.toMatch(/cat\s+"?\$ENV_DATEI/);
    expect(deploySh).not.toMatch(/cat\s+\.env/);
    expect(deploySh).toMatch(/docker compose config >\/dev\/null/);
  });
});

/*
 * DRK-509: der Rollout tauscht die Stack-Dateien selbst aus — aber nur, wenn die
 * Server-Datei noch der Stand ist, den ein früherer Rollout dort abgelegt hat. Geprüft
 * am GANZEN Skript gegen eine Docker-Attrappe, nicht an Zeichenketten: die Eigenschaft,
 * um die es geht, ist eine Reihenfolge (erst prüfen, dann beiseitelegen, dann ablegen,
 * im Fehlerfall zurücklegen), und die sieht man nur im Lauf.
 */
describe("scripts/deploy.sh — Stack-Dateien ausrollen (DRK-509)", () => {
  const ERWARTET = "a".repeat(40);
  const BASIS = "ghcr.io/rubenvitt/iuk-suite";
  const STACK = ["compose.yaml", "clamd.files.conf", "scripts/backup.sh", "scripts/backup-sidecar.sh"];
  const sha = (t: string) => createHash("sha256").update(t).digest("hex");

  /*
   * Die Attrappe beantwortet genau die Aufrufe, die deploy.sh macht. Gesund ist der
   * Stack nur, solange in der .env NICHT der neue Digest steht und GESUND=nein gesetzt
   * ist — so lässt sich ein Rollout erzwingen, der zurückrollen muss. `compose config`
   * ahmt die beiden Meldungen nach, die Compose v5.3 wirklich ausgibt (gemessen):
   * `level=warning msg="The \"X\" variable is not set. …"` (Exit 0) und
   * `required variable X is missing a value` (Exit 1). Gesteuert über Marken in der
   * compose-Datei: `# braucht: X` und `# pflicht: X`.
   */
  const ATTRAPPE = String.raw`#!/bin/bash
echo "$*" >>"$KLADDE/docker.log"
neu_gepinnt() { grep -q '^SUITE_IMAGE=.*@sha256:neu' .env 2>/dev/null; }
case "$1" in
  pull) exit 0 ;;
  logout) exit 0 ;;
  image)
    case "$*" in
      *revision*) echo "$ERWARTET" ;;
      *Config.Env*) echo "SUITE_REVISION=$ERWARTET" ;;
      *RepoDigests*) echo "$BASIS@sha256:neu" ;;
    esac
    exit 0 ;;
  inspect)
    case "$*" in
      *Health*)
        if neu_gepinnt && [ "$GESUND" = "nein" ]; then echo unhealthy; else echo healthy; fi ;;
      *StartedAt*) echo "2000-01-01T00:00:00Z" ;;
      *State.Status*) echo running ;;
      *) echo bild ;;
    esac
    exit 0 ;;
  compose)
    shift
    datei=compose.yaml
    if [ "$1" = "-f" ]; then datei="$2"; shift 2; fi
    case "$1" in
      version) exit 0 ;;
      config)
        for v in $(sed -n 's/^# braucht: //p' "$datei"); do
          grep -q "^$v=" .env || echo "time=\"x\" level=warning msg=\"The \\\"$v\\\" variable is not set. Defaulting to a blank string.\"" >&2
        done
        for v in $(sed -n 's/^# pflicht: //p' "$datei"); do
          # Dahinter ein Wert aus der .env: Compose zitiert in Validierungsmeldungen
          # aufgelöste Werte, und das Protokoll ist öffentlich.
          grep -q "^$v=" .env || { echo "required variable $v is missing a value: $v must be set" >&2; echo "user: geheim-geheim" >&2; exit 1; }
        done
        exit 0 ;;
      ps) echo cid ;;
      up) echo "up $*" >>"$KLADDE/up.log"; exit 0 ;;
      exec)
        if neu_gepinnt; then r="$ERWARTET"; else r=alt; fi
        echo "{\"status\":\"ok\",\"revision\":\"$r\"}" ;;
      logs) echo "log" ;;
    esac
    exit 0 ;;
esac
exit 0
`;

  type Lage = {
    repo?: Record<string, string>;
    server?: Record<string, string | null>;
    merkliste?: Record<string, string> | null;
    env?: string;
    gesund?: boolean;
  };

  function fahre(lage: Lage) {
    const kladde = mkdtempSync(path.join(os.tmpdir(), "deploy-stack-"));
    const repo = path.join(kladde, "repo");
    const stack = path.join(kladde, "stack");
    const bin = path.join(kladde, "bin");
    for (const d of [path.join(repo, "scripts"), path.join(stack, "scripts"), bin]) mkdirSync(d, { recursive: true });
    writeFileSync(path.join(repo, "scripts/deploy.sh"), deploySh);
    const repoDateien: Record<string, string> = {};
    for (const d of STACK) repoDateien[d] = lage.repo?.[d] ?? `${d} v1\n`;
    for (const [d, t] of Object.entries(repoDateien)) writeFileSync(path.join(repo, d), t);
    const server: Record<string, string | null> = {};
    for (const d of STACK) server[d] = lage.server && d in lage.server ? lage.server[d] : `${d} v1\n`;
    for (const [d, t] of Object.entries(server)) if (t !== null) writeFileSync(path.join(stack, d), t);
    if (lage.merkliste !== null) {
      const liste = lage.merkliste ?? Object.fromEntries(STACK.map((d) => [d, `${d} v1\n`]));
      writeFileSync(
        path.join(stack, ".rollout-stack.sha256"),
        Object.entries(liste)
          .map(([d, t]) => `${sha(t)}  ${d}\n`)
          .join(""),
      );
    }
    writeFileSync(path.join(stack, ".env"), lage.env ?? `AUTH_SECRET=geheim-geheim\nSUITE_IMAGE=${BASIS}@sha256:alt\n`);
    writeFileSync(path.join(bin, "docker"), ATTRAPPE);
    chmodSync(path.join(bin, "docker"), 0o755);
    const p = spawnSync("bash", [path.join(repo, "scripts/deploy.sh")], {
      encoding: "utf8",
      timeout: 60_000,
      env: {
        ...process.env,
        PATH: `${bin}:${process.env.PATH}`,
        KLADDE: kladde,
        ERWARTET,
        BASIS,
        GESUND: lage.gesund === false ? "nein" : "ja",
        SUITE_STACK_DIR: stack,
        SUITE_REVISION_ERWARTET: ERWARTET,
        SUITE_HEALTH_URL: "aus",
        SUITE_BACKUP_CMD: "",
        SUITE_BACKUP_GESUND_FRIST: "0",
        GITHUB_STEP_SUMMARY: "",
      },
    });
    const lies = (d: string) => (existsSync(path.join(stack, d)) ? readFileSync(path.join(stack, d), "utf8") : null);
    const up = existsSync(path.join(kladde, "up.log")) ? readFileSync(path.join(kladde, "up.log"), "utf8") : "";
    return { code: p.status, aus: `${p.stdout}${p.stderr}`, lies, up, stack, aufraeumen: () => rmSync(kladde, { recursive: true, force: true }) };
  }

  it("alles gleich: Rollout läuft, und die erste Merkliste entsteht", () => {
    const l = fahre({ merkliste: null });
    try {
      expect(l.code, l.aus).toBe(0);
      expect(l.lies(".rollout-stack.sha256")).toContain(`${sha("compose.yaml v1\n")}  compose.yaml`);
      expect(l.up).not.toContain("force-recreate clamav");
    } finally {
      l.aufraeumen();
    }
  });

  it("nur das Repo hat sich bewegt: die Datei wird ausgetauscht, der alte Stand beiseitegelegt", () => {
    const l = fahre({ repo: { "compose.yaml": "compose v2\n", "clamd.files.conf": "clamd v2\n" } });
    try {
      expect(l.code, l.aus).toBe(0);
      expect(l.lies("compose.yaml")).toBe("compose v2\n");
      expect(l.lies("clamd.files.conf")).toBe("clamd v2\n");
      expect(l.lies(".rollout-vorher/compose.yaml")).toBe("compose.yaml v1\n");
      expect(l.lies(".rollout-stack.sha256")).toContain(`${sha("compose v2\n")}  compose.yaml`);
      // clamd liest seine Konfiguration nur beim Start — und zwar VOR dem `up -d` der Suite.
      expect(l.up).toMatch(/--force-recreate clamav[\s\S]*\bup -d\s*$/m);
      // Was in den Container kommt, muss clamd lesen können, nicht nur der Runner-Nutzer.
      expect(statSync(path.join(l.stack, "clamd.files.conf")).mode & 0o777).toBe(0o644);
    } finally {
      l.aufraeumen();
    }
  });

  it("von Hand geändert: Abbruch, und die Server-Datei bleibt, wie sie ist", () => {
    const l = fahre({
      repo: { "compose.yaml": "compose v2\n" },
      server: { "compose.yaml": "compose.yaml v1\n      - ADMIN_GROUP=nur-hier\n" },
    });
    try {
      expect(l.code).not.toBe(0);
      expect(l.aus).toMatch(/VON HAND geändert/);
      expect(l.lies("compose.yaml")).toContain("ADMIN_GROUP=nur-hier");
      expect(l.up, "kein Container angefasst").toBe("");
      expect(l.lies(".env")).toContain("@sha256:alt");
    } finally {
      l.aufraeumen();
    }
  });

  it("ohne Merkliste und abweichend: Abbruch wie vor DRK-509", () => {
    const l = fahre({ repo: { "compose.yaml": "compose v2\n" }, merkliste: null });
    try {
      expect(l.code).not.toBe(0);
      expect(l.aus).toMatch(/noch keine Merkliste/);
      expect(l.lies("compose.yaml")).toBe("compose.yaml v1\n");
      expect(l.up).toBe("");
    } finally {
      l.aufraeumen();
    }
  });

  it("die neue compose.yaml braucht eine Variable, die die .env nicht hat: Abbruch vorher", () => {
    for (const marke of ["braucht", "pflicht"]) {
      const l = fahre({ repo: { "compose.yaml": `compose v2\n# ${marke}: NEUE_VARIABLE\n` } });
      try {
        expect(l.code, marke).not.toBe(0);
        expect(l.aus, marke).toContain("NEUE_VARIABLE");
        expect(l.aus, marke).toContain("Nichts angefasst");
        expect(l.aus, marke).not.toContain("geheim-geheim");
        expect(l.lies("compose.yaml"), marke).toBe("compose.yaml v1\n");
        expect(l.up, marke).toBe("");
      } finally {
        l.aufraeumen();
      }
    }
  });

  it("… steht sie in der .env, läuft der Rollout", () => {
    const l = fahre({
      repo: { "compose.yaml": "compose v2\n# braucht: NEUE_VARIABLE\n" },
      env: `AUTH_SECRET=geheim-geheim\nNEUE_VARIABLE=x\nSUITE_IMAGE=${BASIS}@sha256:alt\n`,
    });
    try {
      expect(l.code, l.aus).toBe(0);
      expect(l.lies("compose.yaml")).toBe("compose v2\n# braucht: NEUE_VARIABLE\n");
    } finally {
      l.aufraeumen();
    }
  });

  it("wird der neue Stand nicht gesund, kommen Image UND Stack-Dateien zurück", () => {
    const l = fahre({
      repo: { "compose.yaml": "compose v2\n", "clamd.files.conf": "clamd v2\n", "scripts/backup.sh": "backup v2\n" },
      gesund: false,
    });
    try {
      expect(l.code).not.toBe(0);
      expect(l.aus).toMatch(/ROLLBACK/);
      expect(l.aus).toMatch(/wieder healthy/);
      expect(l.lies("compose.yaml")).toBe("compose.yaml v1\n");
      expect(l.lies("clamd.files.conf")).toBe("clamd.files.conf v1\n");
      expect(l.lies("scripts/backup.sh")).toBe("scripts/backup.sh v1\n");
      expect(l.lies(".rollout-stack.sha256")).toContain(`${sha("compose.yaml v1\n")}  compose.yaml`);
      expect(l.lies(".env")).toContain("@sha256:alt");
      // Der zurückgelegte clamd-Stand und das alte Backup-Skript erreichen die Prozesse nur
      // über einen neuen Container.
      expect((l.up.match(/--force-recreate clamav/g) ?? []).length).toBe(2);
      expect(l.up).toMatch(/--force-recreate backup/);
    } finally {
      l.aufraeumen();
    }
  });
});
