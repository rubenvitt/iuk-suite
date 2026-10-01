// src/app/m/kommplan/_ui/druck/SvgHerunterladen.test.tsx
// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { SvgHerunterladen } from "./SvgHerunterladen";

vi.mock("../../_lib/zeichen/schrift.generiert.json", () => ({ default: { stand: {}, arimoVariable: "QUJD" } }));
afterEach(async () => { await unmount(); vi.restoreAllMocks(); document.body.querySelectorAll("svg").forEach((s) => s.remove()); });

describe("SvgHerunterladen", () => {
  it("lädt die Schrift erst beim Klick, baut die Datei und lädt sie unter dem übergebenen Namen herunter", async () => {
    document.body.insertAdjacentHTML("beforeend", '<svg class="kp-symbole"><defs><symbol id="kp-x"></symbol></defs></svg><svg class="kp-blatt" data-blatt="2"><use href="#kp-x"></use></svg>');
    let blob: Blob | null = null;
    const url = vi.fn((b: Blob) => { blob = b; return "blob:x"; });
    Object.assign(URL, { createObjectURL: url, revokeObjectURL: vi.fn() });
    // Nur festhalten, nicht im Stub prüfen: ein Wurf dort landete im try/catch der Komponente, und der Test bliebe grün.
    const gesehen: { download: string; href: string }[] = [];
    const klick = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(function (this: HTMLAnchorElement) {
      gesehen.push({ download: this.download, href: this.href });
    });
    await mount(<SvgHerunterladen nummer={2} von={3} dateiname="Plan_2026-10-01_blatt-2-von-3_a4.svg" />);
    expect(query("button").textContent).toBe("SVG herunterladen (Blatt 2 von 3)");
    await clickElement(query("button"));
    // Der dynamische import() der Schrift braucht mehr als eine Runde der Ereignisschleife (unter Last mehr).
    await act(async () => { await vi.waitFor(() => expect(klick).toHaveBeenCalled(), { timeout: 5_000 }); });
    expect(klick).toHaveBeenCalledTimes(1);
    expect(gesehen).toEqual([{ download: "Plan_2026-10-01_blatt-2-von-3_a4.svg", href: "blob:x" }]);
    expect(document.querySelector('[role="status"]')).toBeNull(); // keine Fehlermeldung
    expect(blob!.type).toBe("image/svg+xml");
    const text = await blob!.text();
    expect(text).toContain('id="kp-x"');
    expect(text).toContain("@font-face");
  });
  it("fehlt das Blatt: eine Meldung, kein Wurf", async () => {
    await mount(<SvgHerunterladen nummer={9} von={9} dateiname="x.svg" />);
    await clickElement(query("button"));
    await act(async () => { await vi.waitFor(() => expect(document.querySelector('[role="status"]')).not.toBeNull(), { timeout: 5_000 }); });
    expect(query('[role="status"]').textContent).toContain("ließ sich nicht erstellen");
  });
});
