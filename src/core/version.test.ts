import { describe, it, expect, afterEach } from "vitest";
import { laufendeRevision } from "@/core/version";

const vorher = process.env.SUITE_REVISION;

afterEach(() => {
  if (vorher === undefined) delete process.env.SUITE_REVISION;
  else process.env.SUITE_REVISION = vorher;
});

describe("laufendeRevision", () => {
  it("gibt den gestempelten Commit zurück", () => {
    process.env.SUITE_REVISION = "abc1234";
    expect(laufendeRevision()).toBe("abc1234");
  });

  it("meldet `unbekannt` statt eines leeren Strings", () => {
    // Der Unterschied trägt: `scripts/deploy.sh` vergleicht diesen Wert mit dem
    // erwarteten Commit. Ein leerer String verglichen mit einem leeren Wert wäre eine
    // ERFOLGREICHE Prüfung gegen nichts — das Wort kann nie zufällig gleich sein.
    process.env.SUITE_REVISION = "";
    expect(laufendeRevision()).toBe("unbekannt");
    delete process.env.SUITE_REVISION;
    expect(laufendeRevision()).toBe("unbekannt");
  });

  it("liest bei JEDEM Aufruf neu — kein auf Modulebene eingefrorener Wert", () => {
    process.env.SUITE_REVISION = "eins";
    expect(laufendeRevision()).toBe("eins");
    process.env.SUITE_REVISION = "zwei";
    expect(laufendeRevision()).toBe("zwei");
  });
});
