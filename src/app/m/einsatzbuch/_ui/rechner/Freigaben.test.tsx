// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { FreigabeZeile } from "../../_lib/anbindung/status";
import { Freigaben } from "./Freigaben";

afterEach(unmount);

const ZEILE: FreigabeZeile = {
  id: "f1",
  zeitpunkt: "25.09.2026, 10:00",
  name: "Jana Albers",
  art: "echt",
  rechnerName: "Einsatzleitung",
  bloecke: "1–3",
  anzahl: 3,
};

describe("Freigaben — Zeilenschlüssel", () => {
  /*
   * REGRESSION (Review I3): Der Schlüssel setzte sich aus den angezeigten Feldern zusammen. Zwei
   * Freigaben derselben Person in derselben Minute über dieselben Blöcke ergaben denselben
   * Schlüssel — React verwarf eine Zeile oder verwechselte sie. Die ID der Freigabe ist eindeutig.
   */
  it("zwei Freigaben mit gleichen Anzeigefeldern ergeben zwei Zeilen mit ihrer ID als Schlüssel", async () => {
    await mount(<Freigaben liste={[ZEILE, { ...ZEILE, id: "f2" }]} />);
    const schluessel = queryAll("[data-row-key]").map((el) => el.getAttribute("data-row-key"));
    expect(schluessel).toEqual(["f1", "f2"]);
  });
});
