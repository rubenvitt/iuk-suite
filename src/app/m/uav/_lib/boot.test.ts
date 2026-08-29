import { it, expect } from "vitest";
import { uavBootFehler, swModus } from "./boot";
it("ohne SUITE_HOST_UAV: nichts zu prüfen", async () => expect(await uavBootFehler({})).toEqual([]));
it("mit Host, ohne Modus → Fehlertext, kein Wurf", async () => {
  const f = await uavBootFehler({ SUITE_HOST_UAV: "uav-training.iuk-ue.de" });
  expect(f).toHaveLength(1); expect(f[0]).toContain("UAV_SW_MODUS");
});
it("fremder Wert → Fehler; gültige Werte → keiner", async () => {
  expect(await uavBootFehler({ SUITE_HOST_UAV: "x", UAV_SW_MODUS: "aus" })).toHaveLength(1);
  expect(await uavBootFehler({ SUITE_HOST_UAV: "x", UAV_SW_MODUS: "abraeumen" })).toEqual([]);
  expect(swModus({ UAV_SW_MODUS: "cachen" })).toBe("cachen");
  expect(swModus({})).toBe("abraeumen");   // Vorgabe: die sichere Seite
});
