import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

/**
 * DIE E2E-GRUPPEN — und der Waechter, ohne den sie still verrutschen.
 *
 * ── WARUM ES DIESE DATEI GIBT ─────────────────────────────────────────────
 *
 * Bis DRK-358 teilte die CI die e2e-Suite mit `playwright test --shard=n/5`
 * auf. Playwright teilt dabei nach FALLZAHL, nicht nach Modul: welche
 * Spec-Dateien zusammen in einem Shard landen, ergibt sich aus Dateireihenfolge
 * und Testzahl — also aus etwas, das jeder neue Test verschiebt.
 *
 * Das ist nicht egal, weil EIN `next dev` den ganzen Shard bedient und sein
 * Speicher mit der Zahl der uebersetzten Routen waechst, ohne je zurueckzufallen
 * (so auch in `node_modules/next/dist/docs/01-app/02-guides/memory-usage.md`
 * ausgeschrieben). Die Aufteilung wurde am 2026-08-28 einmal richtig gewaehlt —
 * bei damals 211 Faellen trennte `n/5` die Module sauber, der schwerste Shard
 * trug NUR lagerbuch. Bei 356 Faellen trug Shard 4 dann acht Dateien aus vier
 * Modulen, und der Runner starb.
 *
 * GEMESSEN (DRK-358), gleicher Commit, gleicher kalter `.next`:
 *
 *   `radio-hosts` + `radio-kiosk` ALLEIN   ->  4 258 MB Spitze, alle 12 gruen
 *   dieselben Faelle als Teil von Shard 4  -> 12 768 MB Spitze, der Shard stirbt
 *
 * Faktor 3, und der Fall, der im Verbund rot war, ist allein gruen. Der
 * Speicher haengt an der SUMME der Modulflaechen im Shard, nicht an einem Fall.
 *
 * ⛔ ZWEI NAHELIEGENDE ABHILFEN SIND GEMESSEN UND VERWORFEN:
 *   * `turbopackMemoryEviction: "full"` — die Spitze blieb (12 203 MB gegen
 *     12 074 MB). Eviction gibt frei, was schon auf der Platte liegt; sie
 *     verhindert die Allokation WAEHREND der Uebersetzung nicht.
 *   * `turbopackFileSystemCacheForDev: false` — schon frueher probiert
 *     (`fb9fe44e`, zurueckgenommen in `63b5b820`): ohne Platte bleibt alles im
 *     Speicher, der Shard starb dann frueher statt spaeter.
 *
 * Bleibt die Routenflaeche je Server. Sie schrumpft nur ueber die Aufteilung —
 * und die ist seit DRK-358 EXPLIZIT (`e2e/gruppen.json`) statt aus der Fallzahl
 * abgeleitet. Eine Gruppe je Modul heisst: eine Zusage, keine Nebenwirkung.
 *
 * ── WAS DIESER TEST HAELT ─────────────────────────────────────────────────
 *
 * Der Preis der expliziten Liste ist die vergessene Zeile: eine neue
 * Spec-Datei, die in keiner Gruppe steht, liefe in der CI NIE — und zwar
 * still, denn ein nicht ausgefuehrter Test ist gruen wie ein bestandener.
 * Genau das faengt dieser Waechter, in derselben Bauform, mit der
 * `bootstrap.test.ts` das Migrations-Dreieck und `register.test.ts` das
 * Notizregister absichern: Verzeichnis lesen, gegen die Liste halten.
 */

const WURZEL = process.cwd();
const E2E = join(WURZEL, "e2e");

type Gruppe = { name: string; specs: string };

const gruppen = JSON.parse(
  readFileSync(join(E2E, "gruppen.json"), "utf8"),
) as Gruppe[];

/**
 * Die Dateien, die `playwright.config.ts` per `testIgnore` ohnehin auslaesst.
 * Sie duerfen in KEINER Gruppe stehen — ein Job, der sie nennt, liefe gegen
 * eine leere Auswahl und meldete das nicht.
 *
 * Die Quelle ist die Konfiguration selbst, nicht eine zweite Liste hier:
 * sonst laufen die beiden auseinander, sobald jemand dort etwas ergaenzt.
 */
const ausgelassen = (() => {
  const cfg = readFileSync(join(WURZEL, "playwright.config.ts"), "utf8");
  const zeile = /testIgnore:\s*\/\((.*?)\)\\\.spec\\\.ts\//.exec(cfg);
  if (!zeile) throw new Error("testIgnore in playwright.config.ts nicht gefunden");
  return zeile[1].split("|").map((n) => `${n}.spec.ts`);
})();

/** `e2e/foo-*.spec.ts` -> die Dateinamen, die das Muster trifft. */
function loese(muster: string, vorhanden: string[]): string[] {
  return muster
    .split(/\s+/)
    .filter(Boolean)
    .flatMap((m) => {
      const datei = m.replace(/^e2e\//, "");
      if (!datei.includes("*")) return [datei];
      const rx = new RegExp(`^${datei.replace(/[.]/g, "\\.").replace(/\*/g, ".*")}$`);
      return vorhanden.filter((d) => rx.test(d));
    });
}

describe("e2e-Gruppen — die Aufteilung, an der ein stiller CI-Ausfall haengt", () => {
  const alle = readdirSync(E2E).filter((d) => d.endsWith(".spec.ts"));
  const erwartet = alle.filter((d) => !ausgelassen.includes(d));
  const aufgeloest = gruppen.flatMap((g) => loese(g.specs, alle));

  it("kennt ueberhaupt Gruppen, und jede hat einen Namen und ein Muster", () => {
    expect(gruppen.length).toBeGreaterThan(0);
    for (const g of gruppen) {
      expect(g.name, JSON.stringify(g)).toMatch(/^[a-z0-9-]+$/);
      expect(g.specs.trim(), g.name).not.toBe("");
    }
  });

  it("die Gruppennamen sind eindeutig — `upload-artifact` weist den zweiten gleichen Namen mit HTTP 409 ab", () => {
    expect([...new Set(gruppen.map((g) => g.name))]).toHaveLength(gruppen.length);
  });

  it("JEDE Spec-Datei steht in genau einer Gruppe", () => {
    // Die eigentliche Zusicherung. Eine fehlende Datei laeuft in der CI nie und
    // ist trotzdem gruen; eine doppelte laeuft zweimal und kostet nur Zeit.
    expect([...aufgeloest].sort()).toEqual([...erwartet].sort());
  });

  it("kein Muster trifft ins Leere", () => {
    // Ein Tippfehler (`e2e/radio.spec.ts` statt `e2e/radio-*.spec.ts`) faellt
    // sonst erst auf, wenn jemand die Trefferzahl im CI-Protokoll nachzaehlt.
    for (const g of gruppen) {
      expect(loese(g.specs, alle), `Gruppe ${g.name} trifft keine Datei`).not.toHaveLength(0);
    }
  });

  it("keine Gruppe nennt eine Datei, die `testIgnore` ohnehin auslaesst", () => {
    for (const g of gruppen) {
      for (const d of loese(g.specs, alle)) {
        expect(ausgelassen, `${g.name} nennt die ausgelassene ${d}`).not.toContain(d);
      }
    }
  });

  it("die CI faehrt die Gruppen aus DIESER Datei — nicht aus einer zweiten Liste", () => {
    // Das dritte Glied des Dreiecks: gruppen.json <-> Waechter <-> Workflow.
    // Ohne diese Zusicherung koennte die Datei richtig sein und die CI trotzdem
    // nach Fallzahl teilen.
    const ci = readFileSync(join(WURZEL, ".github/workflows/ci.yml"), "utf8");
    expect(ci).toContain("e2e/gruppen.json");
    expect(ci).not.toMatch(/--shard=\$\{\{\s*matrix/);
  });
});
