import { describe, it, expect } from "vitest";
import { zeichenBootFehler, zeichenSwAn } from "./boot";

describe("Boot-Riegel zeichen", () => {
  /*
   * ⛔ ABWEICHUNG VON SPEC §7.1, BEWUSST UND BEGRUENDET. Die Spec will einen
   * Riegel, der bei NODE_ENV === "production" und fehlendem SUITE_HOST_ZEICHEN
   * laut wird. Das braeche JEDEN Produktiv-Deploy im Fenster zwischen Merge und
   * Cutover ab — auch auf Instanzen, die dieses Modul nie einschalten wollen.
   * `uav/_lib/boot.ts:24-27` schreibt genau diesen Fehler aus. Das Schutzziel
   * (kein STILLER PWA-Ausfall) bleibt: ZEICHEN_SW=1 ist die bewusste
   * Einschaltung, und DANN ist der fehlende Host ein lauter Startfehler.
   */
  it("ohne ZEICHEN_SW ist nichts zu pruefen", async () => {
    expect(await zeichenBootFehler({})).toEqual([]);
    expect(await zeichenBootFehler({ SUITE_HOST_ZEICHEN: "zeichen.iuk-ue.de" })).toEqual([]);
  });

  it("mit ZEICHEN_SW=1 und ohne Host: eine Meldung, kein Wurf", async () => {
    const fehler = await zeichenBootFehler({ ZEICHEN_SW: "1" });
    expect(fehler).toHaveLength(1);
    expect(fehler[0]).toContain("SUITE_HOST_ZEICHEN");
    expect(fehler[0]).toContain("ZEICHEN_SW");
  });

  it("mit ZEICHEN_SW=1 und Host: keine Meldung", async () => {
    expect(
      await zeichenBootFehler({ ZEICHEN_SW: "1", SUITE_HOST_ZEICHEN: "zeichen.iuk-ue.de" }),
    ).toEqual([]);
  });

  /*
   * Die sichere Seite ist AUS: ein Tippfehler ("true", "ja", "on") schaltet die
   * PWA NICHT ein. Waere es umgekehrt, registrierte eine verschriebene Variable
   * einen Worker auf einer Instanz ohne eigenen Host — und der cachte dort
   * Login-HTML.
   */
  it("nur die Zeichenkette 1 schaltet ein", () => {
    expect(zeichenSwAn({ ZEICHEN_SW: "1" })).toBe(true);
    expect(zeichenSwAn({ ZEICHEN_SW: "true" })).toBe(false);
    expect(zeichenSwAn({})).toBe(false);
  });

  /*
   * WIRFT NIE — nicht einmal bei absurder Eingabe. assertHostConfig() sammelt
   * die Meldungen ALLER Module ein und entscheidet einmal; ein Wurf hier naehme
   * den ganzen Prozess mit, samt aller anderen Module.
   */
  it("wirft auch bei unsinnigen Werten nicht", async () => {
    await expect(
      zeichenBootFehler({ ZEICHEN_SW: "1", SUITE_HOST_ZEICHEN: "" }),
    ).resolves.toHaveLength(1);
  });
});
