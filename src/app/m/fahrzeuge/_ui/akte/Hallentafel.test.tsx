// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

const refresh = vi.hoisted(() => vi.fn());
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import { HALLE_TAKT_MS } from "./HallenUhr";
import { Hallentafel } from "./Hallentafel";
import { leereAkte, ruhigeAkte, volleAkte } from "./fixtures";

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  refresh.mockReset();
});

describe("Hallentafel", () => {
  it("stellt das schlimmste Fahrzeug nach oben und zeigt Termine, Reifen und was als Nächstes kommt", async () => {
    await mount(<Hallentafel liste={[ruhigeAkte(), volleAkte()]} />);
    const zeilen = queryAll("tbody tr");
    expect(zeilen.map((z) => z.getAttribute("data-stufe"))).toEqual(["ueberfaellig", "ok"]);
    expect(zeilen[0]!.textContent).toContain("RTW 11-83-1");
    expect(zeilen[0]!.textContent).toContain("seit 7 Tagen fällig");
    expect(zeilen[0]!.textContent).toContain("Winter drauf");
    expect(zeilen[0]!.textContent).toContain("HU (TÜV)05.11.2026");
    expect(zeilen[1]!.textContent).toContain("nicht erfasst");
    expect(queryAll("th").map((th) => th.textContent)).toEqual(["Fahrzeug", "HU", "UVV", "Service", "Reifen", "Als Nächstes"]);
    expect(query("a").getAttribute("href")).toBe("/tafel");
  });

  it("ohne Fahrzeuge steht ein Satz da, keine leere Tabelle", async () => {
    await mount(<Hallentafel liste={[]} />);
    expect(queryAll("table")).toEqual([]);
    expect(document.body.textContent).toContain("Noch keine Fahrzeuge.");
  });

  it("holt sich etwa jede Minute frisch und zeigt die Uhr", async () => {
    vi.useFakeTimers();
    await mount(<Hallentafel liste={[leereAkte()]} />);
    expect(query('[data-rolle="hallen-uhr"]').textContent).toMatch(/\d{2}:\d{2}/);
    expect(refresh).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(HALLE_TAKT_MS); });
    expect(refresh).toHaveBeenCalledTimes(1);
  });
});
