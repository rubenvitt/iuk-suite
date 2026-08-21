// src/app/m/radio/_db/append.test.ts
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const WURZEL = "src/app/m/radio";

/** Alle `.ts`/`.tsx`-Dateien unter `src/app/m/radio`, rekursiv. Dieselbe Bauform, mit der
 *  src/core/shell/icons.test.ts:54-63 den Quellbaum abgeht. */
function sammleQuellen(verzeichnis: string, treffer: string[] = []): string[] {
  for (const eintrag of readdirSync(verzeichnis)) {
    const pfad = join(verzeichnis, eintrag);
    if (statSync(pfad).isDirectory()) {
      if (eintrag === "migrations") continue; // SQL und Snapshots, kein TypeScript
      sammleQuellen(pfad, treffer);
    } else if (eintrag.endsWith(".ts") || eintrag.endsWith(".tsx")) {
      treffer.push(pfad);
    }
  }
  return treffer;
}

describe("radio: zugangscodes sind nicht loeschbar", () => {
  it("kein Loeschweg auf zugangscodes", () => {
    /*
     * "NICHT LOESCHBAR" BRAUCHT EINEN MECHANISMUS, KEINEN SATZ. radio-admin hat null
     * Trigger, und lagerbuch erzwingt es ebenfalls nicht in SQL. Die Durchsetzung ist
     * dreiteilig (§2.4): es gibt keinen Loeschweg, DIESER Scan haelt das fest, und der
     * Grund steht als Kommentar in der Spalte selbst.
     *
     * DER SCHADEN, den er verhindert: ein geloeschter Code kann an ein spaeter
     * ausgestelltes Kaertchen zurueckfallen, und danach erscheinen HISTORISCHE Journal-
     * und Verwaltungszeilen unter dem neuen Label. Der Import hat keinen zweiten Versuch.
     *
     * ⚠️ ER HAENGT AM TABELLENNAMEN. Hiesse die Tabelle anders als `zugangscodes`, waere
     * dieser Test STILL GRUEN — er suchte nach einer Zeichenkette, die nirgends steht
     * (Spec 1 B6 nennt genau das als Grund, warum der Name gesetzt ist).
     *
     * Er faengt die naheliegende Verdrahtung, nicht jede denkbare. Das ist bekannt und
     * akzeptiert — dasselbe Mittel und dieselbe Einschraenkung wie in
     * scripts/seed-lokal.test.ts:56.
     */
    const treffer = sammleQuellen(WURZEL)
      .filter((p) => !p.endsWith("append.test.ts"))
      .filter((p) => /delete\(\s*zugangscodes\s*\)/.test(readFileSync(p, "utf8")));
    expect(treffer, `Loeschweg auf zugangscodes gefunden in: ${treffer.join(", ")}`).toEqual([]);
  });
});

describe("radio: vor dem Host-Riegel entsteht keine Flaeche", () => {
  it("kein page/layout/route/_actions unter src/app/m/radio", () => {
    /*
     * DER HOST-RIEGEL STEHT ERST IN PLANTEIL 2 (Spec 1 Kapitel 1, `_lib/host.ts`). Bis
     * dahin waere JEDE Flaeche dieses Moduls von JEDEM Suite-Host erreichbar — Falle 61,
     * und `pnpm typecheck`, `pnpm lint` und `pnpm build` sind dabei alle drei gruen. Das
     * ist die Gegenauflage zu der Entscheidung, Kapitel 2 VOR Kapitel 1 zu bauen
     * (2026-08-21-radio-modul-leitplan.md, Abschnitt "Die Abweichung").
     *
     * ⚠️ DIESER FALL IST ZUM LOESCHEN BESTIMMT. Planteil 2 legt Seiten an; wer ihn dann
     * rot findet, entfernt ihn MIT der Aufgabe, die den Riegel baut — nicht vorher, und
     * nicht "weil er stoert". Er ist ein Termin, kein Verbot.
     */
    const flaechen = sammleQuellen(WURZEL).filter((p) => {
      const name = p.split("/").pop() ?? "";
      return (
        name === "page.tsx" ||
        name === "layout.tsx" ||
        name === "route.ts" ||
        p.includes("/_actions/")
      );
    });
    expect(
      flaechen,
      `Flaeche vor dem Host-Riegel: ${flaechen.join(", ")} — siehe Planteil 2`,
    ).toEqual([]);
  });
});
