import { describe, it, expect, afterEach } from "vitest";
import { laufendeRevision, laufendeVersion } from "@/core/version";

const vorher = process.env.SUITE_REVISION;
const vorherVersion = process.env.SUITE_VERSION;

afterEach(() => {
  if (vorher === undefined) delete process.env.SUITE_REVISION;
  else process.env.SUITE_REVISION = vorher;
  if (vorherVersion === undefined) delete process.env.SUITE_VERSION;
  else process.env.SUITE_VERSION = vorherVersion;
});

describe("laufendeVersion", () => {
  it("gibt die gestempelte Nummer zurück und liest bei jedem Aufruf neu", () => {
    process.env.SUITE_VERSION = "1.4.2";
    expect(laufendeVersion()).toBe("1.4.2");
    process.env.SUITE_VERSION = "1.5.0";
    expect(laufendeVersion()).toBe("1.5.0");
  });

  it("meldet `unbekannt` statt eines leeren Strings — wie die Revision", () => {
    process.env.SUITE_VERSION = "  ";
    expect(laufendeVersion()).toBe("unbekannt");
    delete process.env.SUITE_VERSION;
    expect(laufendeVersion()).toBe("unbekannt");
  });
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
