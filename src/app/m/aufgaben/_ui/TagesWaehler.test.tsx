// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

/*
 * MOCK VON `next/navigation` — dieselbe Form wie `QrView.test.tsx`: `useRouter`/`usePathname`/
 * `useSearchParams` brauchen einen echten App-Router-Kontext, den jsdom+`mount()` nicht stellt.
 */
const pushMock = vi.fn();
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock }),
  usePathname: () => "/",
  useSearchParams: () => new URLSearchParams("woche=2026-08-10"),
}));

const { TagesWaehler } = await import("./TagesWaehler");

afterEach(async () => {
  await unmount();
  pushMock.mockClear();
});

const TAGE = ["2026-08-10", "2026-08-11", "2026-08-12", "2026-08-13", "2026-08-14"];

describe("TagesWaehler — eine echte Radiogruppe, keine Knopfreihe (Spec §9.6)", () => {
  it("ist ein fieldset mit legend und fünf input[type=radio] desselben name", async () => {
    await mount(<TagesWaehler tage={TAGE} ausgewaehlterTag="2026-08-10" />);
    expect(query("fieldset")).toBeTruthy();
    expect(query("legend")).toBeTruthy();
    const radios = queryAll<HTMLInputElement>('input[type="radio"]');
    expect(radios).toHaveLength(5);
    const namen = new Set(radios.map((r) => r.name));
    expect(namen.size).toBe(1);
  });

  it("traegt keinen einzigen button — keine Knopfreihe", async () => {
    await mount(<TagesWaehler tage={TAGE} ausgewaehlterTag="2026-08-10" />);
    expect(queryAll("button")).toHaveLength(0);
  });

  it("markiert genau den ausgewaehlten Tag als checked", async () => {
    await mount(<TagesWaehler tage={TAGE} ausgewaehlterTag="2026-08-12" />);
    const radios = queryAll<HTMLInputElement>('input[type="radio"]');
    expect(radios.map((r) => r.checked)).toEqual([false, false, true, false, false]);
  });

  it("zeigt die fünf Tage lesbar (nicht die ISO-Form)", async () => {
    await mount(<TagesWaehler tage={TAGE} ausgewaehlterTag="2026-08-10" />);
    expect(document.body.textContent).toContain("Mo, 10.08.");
    expect(document.body.textContent).toContain("Fr, 14.08.");
    expect(document.body.textContent).not.toContain("2026-08-10");
  });

  it("ein Klick auf den dritten Radio ruft router.push mit tag=<dessen ISO> und dem erhaltenen woche-Parameter", async () => {
    await mount(<TagesWaehler tage={TAGE} ausgewaehlterTag="2026-08-10" />);
    const radios = queryAll<HTMLInputElement>('input[type="radio"]');
    radios[2]!.click();
    expect(pushMock).toHaveBeenCalledTimes(1);
    const ziel = pushMock.mock.calls[0]![0] as string;
    expect(ziel).toContain("tag=2026-08-12");
    expect(ziel).toContain("woche=2026-08-10");
  });
});
