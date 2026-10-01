// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
const aktion = vi.hoisted(() => ({ wiederher: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../../_actions/verwaltung", () => ({ stelleWiederHerAction: aktion.wiederher }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { Wiederherstellen } from "./Wiederherstellen";

const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const knopf = () => query<HTMLButtonElement>("button");

afterEach(async () => { await unmount(); vi.clearAllMocks(); });

describe("Wiederherstellen am archivierten Plan (Entscheidung 10; Review Phase 4)", () => {
  it("stellt diesen Plan wieder her und lädt die Seite neu (dann als Editor)", async () => {
    aktion.wiederher.mockResolvedValue({ ok: true });
    await mount(<Wiederherstellen id="p1" />);
    await clickElement(knopf());
    await abwarten();
    expect(aktion.wiederher).toHaveBeenCalledWith("p1");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("ein zweiter Klick vor der Antwort schickt nichts — der Knopf lädt", async () => {
    let fertig!: (r: unknown) => void;
    aktion.wiederher.mockReturnValue(new Promise((r) => { fertig = r; }));
    await mount(<Wiederherstellen id="p1" />);
    await clickElement(knopf());
    await clickElement(knopf());
    expect(knopf().className).toContain("ant-btn-loading");
    await act(async () => { fertig({ ok: true }); });
    await abwarten();
    expect(aktion.wiederher).toHaveBeenCalledTimes(1);
    expect(document.body.textContent).not.toContain("gibt es nicht mehr");
  });
  it("Fehler und Netzfehler werden gemeldet; danach geht ein neuer Versuch", async () => {
    aktion.wiederher.mockResolvedValueOnce({ ok: false, fehler: "Diesen Plan gibt es nicht mehr." });
    await mount(<Wiederherstellen id="p1" />);
    await clickElement(knopf());
    await abwarten();
    expect(query('[role="status"]').textContent).toBe("Diesen Plan gibt es nicht mehr.");
    aktion.wiederher.mockRejectedValueOnce(new Error("offline"));
    await clickElement(knopf());
    await abwarten();
    expect(query('[role="status"]').textContent).toContain("Das ging nicht durch.");
    expect(router.refresh).not.toHaveBeenCalled();
  });
});
