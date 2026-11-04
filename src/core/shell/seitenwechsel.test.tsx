// @vitest-environment jsdom
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { act, useState } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { mount, rerender, unmount } from "@/app/m/qr/_lib/test-dom";
import { SEITENWECHSEL } from "@/core/shell/seitenwechselKlassen";

let pfad = "/a";
vi.mock("next/navigation", () => ({ usePathname: () => pfad }));

const { Seitenwechsel } = await import("@/core/shell/Seitenwechsel");

const ohneKommentare = (css: string) => css.replace(/\/\*[\s\S]*?\*\//g, "");
const GLOBAL = ohneKommentare(readFileSync("src/app/globals.css", "utf8"));
const QUELLE = (datei: string) => readFileSync(join(__dirname, datei), "utf8");
const MENUE = ohneKommentare(readFileSync(join(__dirname, "menue.module.css"), "utf8"));

function Zaehler() {
  const [n, setN] = useState(0);
  return (
    <button type="button" onClick={() => setN(n + 1)}>
      {n}
    </button>
  );
}

afterEach(() => unmount());

describe("Seitenwechsel", () => {
  it("behält den Inhalt bei gleichem Pfad und beginnt ihn bei neuem Pfad neu", async () => {
    // Je Aufruf ein neues Element, sonst überspränge React das Neurendern.
    const baum = () => (
      <Seitenwechsel>
        <Zaehler />
      </Seitenwechsel>
    );
    const knopf = () => document.querySelector("button")!;
    pfad = "/a";
    await mount(baum());
    await act(async () => knopf().click());
    // Gleicher Pfad (etwa nur `?filter=` geändert): kein Wechsel, der Zustand bleibt.
    await rerender(baum());
    expect(knopf().textContent).toBe("1");
    pfad = "/b";
    await rerender(baum());
    expect(knopf().textContent).toBe("0");
  });
});

describe("Regeln des Seitenwechsels", () => {
  it("führt in globals.css die Klassen, die Seitenwechsel.tsx vergibt", () => {
    expect(GLOBAL).toMatch(new RegExp(`::view-transition-new\\(\\.${SEITENWECHSEL.ein}\\)\\s*\\{[^}]*animation: 180ms`));
    expect(GLOBAL).toMatch(new RegExp(`::view-transition-old\\(\\.${SEITENWECHSEL.aus}\\)\\s*\\{[^}]*animation: 90ms`));
    expect(GLOBAL).toContain(`@keyframes ${SEITENWECHSEL.ein}`);
    expect(GLOBAL).toContain(`@keyframes ${SEITENWECHSEL.aus}`);
  });

  it("lässt die ausgeblendete Wurzel nicht 250ms nachlaufen", () => {
    expect(GLOBAL).toMatch(/::view-transition-old\(root\),\s*::view-transition-new\(root\)\s*\{\s*animation: none;/);
  });

  it("lässt Klicks durch die Überlagerung", () => {
    expect(GLOBAL).toMatch(/::view-transition\s*\{\s*pointer-events: none;/);
  });

  it("hält das Menü und das Blatt still und über dem Inhalt", () => {
    // Inline gesetzt: ein CSS-Modul hasht auch `view-transition-name`, der Name träfe die Regeln nicht.
    expect(MENUE).not.toContain("view-transition-name");
    expect(QUELLE("MenueRahmen.tsx")).toContain("style={{ viewTransitionName: SEITENWECHSEL.menue }}");
    expect(QUELLE("Navigator.tsx")).toContain("style={{ viewTransitionName: SEITENWECHSEL.blatt }}");
    for (const name of [SEITENWECHSEL.menue, SEITENWECHSEL.blatt]) {
      expect(GLOBAL).toMatch(new RegExp(`::view-transition-old\\(${name}\\)[^{]*\\{\\s*display: none;`));
      expect(GLOBAL).toMatch(new RegExp(`::view-transition-new\\(${name}\\)[^{]*\\{\\s*animation: none;`));
      expect(GLOBAL).toMatch(new RegExp(`::view-transition-group\\(${name}\\)[^{]*\\{[^}]*z-index: 10[01];`));
    }
  });

  it("schaltet bei reduzierter Bewegung jeden Übergang ab", () => {
    const bloecke = [...GLOBAL.matchAll(/@media \(prefers-reduced-motion: reduce\)\s*\{([\s\S]*?)\n\}/g)].map((t) => t[1]);
    const vt = bloecke.find((b) => b.includes("::view-transition"));
    expect(vt).toBeDefined();
    for (const teil of ["group", "old", "new"]) expect(vt).toContain(`::view-transition-${teil}(*)`);
    expect(vt).toMatch(/animation: none !important/);
  });
});
