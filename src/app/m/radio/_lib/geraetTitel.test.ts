// src/app/m/radio/_lib/geraetTitel.test.ts
import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { geraetTitel } from "./geraetTitel";

describe("radio-geraetTitel: Rufname → OPTA → ISSI, die ISSI nie doppelt", () => {
  it("nimmt den Rufname und stellt die ISSI daneben", () => {
    expect(
      geraetTitel({ issi: "1000001", rufname: "Rotkreuz 1", opta: "OPTA-1" }),
    ).toEqual({
      titel: "Rotkreuz 1",
      issiNeben: "1000001",
    });
  });

  it("faellt bei leerem Rufname auf die OPTA", () => {
    expect(
      geraetTitel({ issi: "1000002", rufname: "", opta: "OPTA-2" }),
    ).toEqual({
      titel: "OPTA-2",
      issiNeben: "1000002",
    });
  });

  it("fuehrt die ISSI nur einmal, wenn Rufname und OPTA fehlen (DRK-455)", () => {
    expect(geraetTitel({ issi: "1000008", rufname: null, opta: "" })).toEqual({
      titel: "1000008",
      issiNeben: null,
    });
  });
});

describe("radio-geraetTitel: Akte und Historie fuehren die Kette nicht selbst", () => {
  /*
   * ⛔ DER GRUND FUER DRK-455 WAR DIE ZWEITE STELLE: die Akte hatte die Doppelung mit DRK-462
   * verloren, die Historie fuehrte die Kette selbst und behielt sie. Wer sie auf einer der
   * beiden Seiten wieder ausschreibt, macht diesen Fall rot.
   */
  const SEITEN = [
    "src/app/m/radio/admin/(arbeit)/geraete/[id]/page.tsx",
    "src/app/m/radio/admin/(arbeit)/geraete/[id]/ereignisse/page.tsx",
  ];
  it.each(SEITEN)("%s zieht den Titel aus geraetTitel", (seite) => {
    const quelle = readFileSync(join(process.cwd(), seite), "utf8");
    expect(quelle).toMatch(/= geraetTitel\(akte\)/);
    expect(quelle).not.toMatch(/akte\.rufname \|\|/);
  });
});
