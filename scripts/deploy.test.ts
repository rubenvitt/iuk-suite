import { describe, it, expect } from "vitest";
import { readFileSync, statSync } from "node:fs";
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

  it("liest die .env NIE als Ganzes — sie trägt Geheimnisse", () => {
    // Ein `cat .env` oder `docker compose config` mit sichtbarer Ausgabe landete im
    // Protokoll des Laufs. GitHub maskiert nur, was es als Secret kennt; AUTH_SECRET aus
    // einer Server-Datei kennt es nicht.
    expect(deploySh).not.toMatch(/cat\s+"?\$ENV_DATEI/);
    expect(deploySh).not.toMatch(/cat\s+\.env/);
    expect(deploySh).toMatch(/docker compose config >\/dev\/null/);
  });
});
