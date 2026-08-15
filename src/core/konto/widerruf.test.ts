import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { rmSync } from "node:fs";
import { migrateAllModules } from "@/core/bootstrap";
import { istWiderrufen, widerrufeAlleSitzungen } from "@/core/konto/widerruf";

const TEST_DATA_DIR = "./.data/konto-widerruf-test";

// Wie in `qr/_db/migrations.test.ts`: aufraeumen und migrieren gehoert in
// beforeAll, weil `getModuleDb` die Verbindung global cacht — ein Loeschen
// zwischen den Tests liesze sie auf eine geloeschte Datei zeigen. Deshalb je
// Test ein eigener `sub`.
beforeAll(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
  process.env.DATA_DIR = TEST_DATA_DIR;
  migrateAllModules();
});

afterAll(() => {
  rmSync(TEST_DATA_DIR, { recursive: true, force: true });
});

describe("Widerrufs-Epoche", () => {
  it("ohne Zeile ist nichts widerrufen", () => {
    expect(istWiderrufen("sub-unbekannt", 1_000)).toBe(false);
  });

  it("widerruft, was vor der Epoche angemeldet wurde", () => {
    widerrufeAlleSitzungen("sub-alt", 5_000);
    expect(istWiderrufen("sub-alt", 4_999)).toBe(true);
  });

  it("laesst gelten, was nach der Epoche angemeldet wurde", () => {
    widerrufeAlleSitzungen("sub-neu", 5_000);
    expect(istWiderrufen("sub-neu", 5_001)).toBe(false);
  });

  /*
   * DER GRENZFALL, UND WARUM ER SO HERUM ENTSCHIEDEN IST.
   *
   * Wer den Knopf drueckt, meldet sich unmittelbar danach neu an — in
   * derselben Sekunde, wenn es schnell geht. Wuerde Gleichstand als widerrufen
   * gelten, waere die frische Anmeldung sofort wieder tot und die Person kaeme
   * in eine Schleife. Der Preis ist ein Fenster von unter einer Sekunde, in dem
   * eine alte Sitzung ueberlebt.
   */
  it("laesst Gleichstand gelten", () => {
    widerrufeAlleSitzungen("sub-gleich", 5_000);
    expect(istWiderrufen("sub-gleich", 5_000)).toBe(false);
  });

  it("ohne angemeldetSeit gilt 0 — mit Epoche also widerrufen", () => {
    widerrufeAlleSitzungen("sub-ohne", 5_000);
    expect(istWiderrufen("sub-ohne", undefined)).toBe(true);
  });

  it("ohne sub wird nichts widerrufen", () => {
    expect(istWiderrufen(undefined, 1)).toBe(false);
  });

  it("ein zweiter Widerruf schiebt die Grenze weiter", () => {
    widerrufeAlleSitzungen("sub-zweimal", 5_000);
    widerrufeAlleSitzungen("sub-zweimal", 9_000);
    expect(istWiderrufen("sub-zweimal", 6_000)).toBe(true);
  });

  it("nimmt ohne Zeitangabe die Gegenwart", () => {
    const vorher = Math.floor(Date.now() / 1000);
    widerrufeAlleSitzungen("sub-jetzt");
    expect(istWiderrufen("sub-jetzt", vorher - 1)).toBe(true);
    expect(istWiderrufen("sub-jetzt", vorher + 60)).toBe(false);
  });
});
