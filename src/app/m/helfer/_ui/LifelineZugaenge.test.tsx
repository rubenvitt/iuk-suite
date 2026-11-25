// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, clickPortal, fill, mount, query, queryAll, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

const anlegen = vi.fn();
const widerrufen = vi.fn();
vi.mock("../_actions/verwaltung", () => ({
  zugangAnlegenAction: (...a: unknown[]) => anlegen(...a),
  zugangWiderrufenAction: (...a: unknown[]) => widerrufen(...a),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

import { LifelineZugaenge } from "./LifelineZugaenge";

const ZUGANG = { id: "z1", bezeichnung: "Lifeline Hub", angelegtAm: "2026-11-25T08:00:00.000Z", angelegtVon: "Vera", zuletztAbgeholtAm: null };

afterEach(async () => {
  await unmount();
  anlegen.mockReset();
  widerrufen.mockReset();
});

describe("Zugang für Lifeline Hub", () => {
  it("zeigt nach dem Anlegen Adresse und Schlüssel genau einmal", async () => {
    anlegen.mockResolvedValue({ ok: true, wert: { schluessel: "s".repeat(43) } });
    await mount(<App><LifelineZugaenge liste={[]} /></App>);
    expect(query("[data-testid='keine-zugaenge']").textContent).toContain("Noch kein Zugang");
    await fill("input", "Lifeline Hub");
    await submitForm("form");
    expect(anlegen).toHaveBeenCalledWith("Lifeline Hub");
    const neu = query("[data-testid='neuer-zugang']").textContent ?? "";
    expect(neu).toContain(`${window.location.origin}/api/stammdaten`);
    expect(neu).toContain("s".repeat(43));
    await click("[data-testid='neuer-zugang-fertig']");
    expect(queryAll("[data-testid='neuer-zugang']")).toHaveLength(0);
  });

  it("listet Zugänge und widerruft nach Rückfrage", async () => {
    widerrufen.mockResolvedValue({ ok: true });
    await mount(<App><LifelineZugaenge liste={[ZUGANG]} /></App>);
    expect(query("ul[aria-label='Zugänge']").textContent).toContain("noch nie abgeholt");
    await click("button[aria-label='Zugang widerrufen: Lifeline Hub']");
    await clickPortal(".ant-popconfirm-buttons .ant-btn-primary");
    expect(widerrufen).toHaveBeenCalledWith("z1");
  });
});
