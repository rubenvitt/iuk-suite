import { describe, expect, it } from "vitest";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

/**
 * DIE BAUFORM DES ZUGANGSSCHUTZES. kommplan steht mit `requiresAuth: false` in der Registry (die
 * Token-Ansicht aus Phase 5 ist anonym), der Proxy schützt also nichts. Der ganze Schutz hängt
 * daran, dass jede Seite und jedes Layout unter `(intern)` selbst `requireKommplanHost` und
 * `requireKommplanZugang` aufruft — eine Seite, die das vergisst, bliebe typecheck-, lint-,
 * build- und vitest-grün (Review Phase 1; Vorbild `radio/riegel.test.ts`, Klauseln a, e, f).
 *
 * Belegt wird eine BAUFORM, keine Wirkung; die Wirkung misst `e2e/kommplan.spec.ts` (404 ohne
 * Gruppe). Gegenproben beim Anlegen: ohne die Zugangszeile in der Druckseite rot, eine neue Seite
 * außerhalb von `(intern)` rot.
 */
const MODUL = "src/app/m/kommplan";
/** Next-Dateien, die eine Route ausliefern oder umschließen. */
const ROUTENDATEI = /^(page|layout|template|default|route)\.tsx?$/;

function dateien(ordner: string): string[] {
  if (!existsSync(ordner)) return [];
  return readdirSync(ordner).flatMap((name) => {
    const pfad = join(ordner, name);
    return statSync(pfad).isDirectory() ? dateien(pfad) : [pfad];
  });
}
/** Private Ordner (`_lib`, `_ui`, `_db` …) sind in Next keine Routen. */
const routen = dateien(MODUL).map((p) => relative(MODUL, p))
  .filter((p) => ROUTENDATEI.test(p.split("/").at(-1)!) && !p.split("/").some((teil) => teil.startsWith("_"))).sort();
const ohneKommentare = (q: string) => q.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const code = (datei: string) => ohneKommentare(readFileSync(join(MODUL, datei), "utf8"));
const zaehle = (q: string, muster: RegExp) => (q.match(new RegExp(muster.source, "g")) ?? []).length;

/**
 * Routendateien AUSSERHALB von `(intern)` — jede mit Begründung. Eine neue Fläche an der
 * Modulwurzel (etwa `t/[token]` in Phase 5) trägt sich hier bewusst ein, mit ihrem eigenen Riegel.
 */
const AUSSERHALB: Record<string, string> = {
  "layout.tsx": "Modulwurzel, bewusst ohne Riegel: die Token-Ansicht ist anonym",
  "logo/route.ts": "Route Handler für den Logo-Upload (Server Actions nehmen höchstens 1 MB): eigener Riegel und Herkunftsprüfung, Antwort statt notFound",
};

describe("kommplan: jede Fläche trägt ihren Riegel", () => {
  const intern = routen.filter((p) => p.startsWith("(intern)/"));
  it("die Menge ist nicht leer (sonst wäre alles unten leer-grün)", () => {
    expect(intern.length).toBeGreaterThanOrEqual(5);
  });
  it.each(intern)("%s ruft requireKommplanHost(await headers()) und await requireKommplanZugang() je genau einmal", (datei) => {
    const q = code(datei);
    expect(zaehle(q, /requireKommplanHost\(await headers\(\)\)/), "Host-Riegel").toBe(1);
    expect(zaehle(q, /await requireKommplanZugang\(\)/), "Zugangsriegel").toBe(1);
  });
  it("außerhalb von (intern) liegen nur eingetragene Dateien", () => {
    expect(routen.filter((p) => !p.startsWith("(intern)/"))).toEqual(Object.keys(AUSSERHALB).sort());
  });
  it("die Modulwurzel reicht nur durch: kein Datenbankzugriff, kein Planinhalt ohne Riegel", () => {
    const q = code("layout.tsx");
    expect(q).not.toMatch(/_db|getDb|ladePlan|plaene/);
    expect(q).toMatch(/return children;/);
  });
  it("logo/route.ts trägt seinen Riegel selbst: Bearbeiten-Riegel und Herkunft je genau einmal, kein Datenbankzugriff davor", () => {
    const q = code("logo/route.ts");
    expect(zaehle(q, /await requireKommplanBearbeitenAktion\(\)/)).toBe(1);
    expect(zaehle(q, /gleicheHerkunft\(request\.headers\)/)).toBe(1);
    expect(q.indexOf("requireKommplanBearbeitenAktion()")).toBeLessThan(q.indexOf("getDb()"));
  });
  it.each(routen.filter((p) => p.startsWith("(intern)/(verwaltung)/")))("%s prüft zusätzlich das Bearbeitungsrecht (pruefeKommplanBearbeiten(viewer))", (datei) => {
    expect(zaehle(code(datei), /pruefeKommplanBearbeiten\(viewer\)/)).toBe(1);
  });
  it("die Verwaltungsgruppe gibt es und sie ist nicht leer (sonst wäre der Fall darüber leer-grün)", () => {
    expect(routen.filter((p) => p.startsWith("(intern)/(verwaltung)/")).length).toBeGreaterThanOrEqual(1);
  });
});
