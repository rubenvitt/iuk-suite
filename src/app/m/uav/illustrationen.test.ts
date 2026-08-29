import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { decideRoute } from "@/core/routing";
import { LOKALE_TASKS } from "./_lib/seedLokal";

describe("Illustrationen — Übernahme aus der Alt-Anwendung", () => {
  it("jede Seed-Aufgabe hat eine Datei unter public/m/uav/illustrations/", () => {
    for (const t of LOKALE_TASKS) {
      const pfad = join(process.cwd(), "public", t.bild);
      expect(existsSync(pfad), `fehlt: ${pfad}`).toBe(true);
    }
  });

  // SUITE_HOST_UAV ist hier NICHT tragend: /m/uav/… ist ein bereits interner Pfad
  // (routing.ts:78, der `internal`-Zweig) und entscheidet allein über das URL-Segment,
  // nicht über den Host — moduleForHost() wird auf diesem Pfad gar nicht erst gerufen.
  // Die Umgebungsvariable steht trotzdem hier, weil sie den Prod-Fall nachstellt
  // (Betreiber ruft über uav-training.iuk-ue.de auf); sie beweist nur nicht, dass DER
  // Host es ist, der die Freigabe erteilt — das übernimmt bereits routing.test.ts
  // ("Magic-Link-Brücke uav").
  describe("mit gesetztem SUITE_HOST_UAV", () => {
    const vorher = process.env.SUITE_HOST_UAV;
    beforeAll(() => {
      process.env.SUITE_HOST_UAV = "uav-training.iuk-ue.de";
    });
    afterAll(() => {
      if (vorher === undefined) delete process.env.SUITE_HOST_UAV;
      else process.env.SUITE_HOST_UAV = vorher;
    });

    it("eine Illustrations-URL auf dem uav-Host ist ein interner, öffentlicher Pfad (kein 404/Login)", () => {
      expect(
        decideRoute({ host: "uav-training.iuk-ue.de", pathname: "/m/uav/illustrations/1-1.webp", groups: null }),
      ).toEqual({ action: "next" });
    });
  });
});
