// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  exists,
  fill,
  mount,
  query,
  queryAll,
  rerender,
  unmount,
} from "@/app/m/qr/_lib/test-dom";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/verwaltung/journal",
}));

import {
  JournalFilter,
  TYPEN,
  deckelText,
  mitGetipptem,
} from "./JournalFilter";

async function zeit(ms: number): Promise<void> {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(ms);
  });
}

async function waehleVorgang(text: string): Promise<void> {
  const input = query<HTMLInputElement>("[aria-label='Vorgang']");
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  const option = Array.from(
    document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"),
  ).find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Vorgang nicht gefunden: ${text}`);
  await clickElement(option);
}

async function waehleTag(ariaLabel: string, tag: string): Promise<void> {
  await clickElement(query<HTMLInputElement>(`[aria-label='${ariaLabel}']`));
  const zelle = Array.from(
    document.body.querySelectorAll<HTMLElement>(".ant-picker-cell"),
  ).find((element) => element.getAttribute("title") === tag);
  if (!zelle) throw new Error(`Tag nicht gefunden: ${tag}`);
  await clickElement(zelle);
}

function letzterPfad(): URL {
  const pfad = mocks.replace.mock.calls.at(-1)?.[0];
  if (typeof pfad !== "string") throw new Error("Keine URL geschrieben");
  return new URL(pfad, "http://lagerbuch.localtest.me");
}

function knopf(text: string): HTMLElement {
  const element = Array.from(document.querySelectorAll<HTMLElement>("button"))
    .find((kandidat) => (kandidat.textContent ?? "").includes(text));
  if (!element) throw new Error(`Knopf nicht gefunden: ${text}`);
  return element;
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  mocks.replace.mockReset();
  window.history.replaceState(null, "", "/verwaltung/journal");
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
});

describe("JournalFilter", () => {
  it("exportiert den planweiten Helfervertrag aus dem directive-freien Modul", () => {
    expect([...TYPEN]).toEqual([
      "zugang",
      "entnahme",
      "korrektur",
      "umlagerung",
    ]);
    expect(deckelText(3, false)).toBe("3 Treffer");
    expect(mitGetipptem(
      { q: "", typ: "", von: "", bis: "" },
      " Mull ",
      { typ: "zugang" },
    ).q).toBe("Mull");
  });

  it("debounced 300 ms ab der letzten Eingabe und ist kein Throttle", async () => {
    await mount(<JournalFilter q="" typ="" von="" bis="" hinweise={[]} />);

    await fill("input[type='search']", "mu");
    await zeit(200);
    await fill("input[type='search']", "mull");
    await zeit(100);
    expect(mocks.replace).not.toHaveBeenCalled();
    await zeit(199);
    expect(mocks.replace).not.toHaveBeenCalled();
    await zeit(1);

    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(letzterPfad().pathname).toBe("/verwaltung/journal");
    expect(letzterPfad().searchParams.get("q")).toBe("mull");
  });

  it("zieht externe q-Aenderungen nach, ohne sie erneut in die URL zu schreiben", async () => {
    await mount(<JournalFilter q="" typ="" von="" bis="" hinweise={[]} />);
    await rerender(<JournalFilter q="geteilt" typ="" von="" bis="" hinweise={[]} />);
    await zeit(600);

    expect(query<HTMLInputElement>("input[type='search']").value).toBe("geteilt");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("erkennt die eigene q-Schreibung und navigiert beim RSC-Rerender nicht doppelt", async () => {
    await mount(<JournalFilter q="" typ="" von="" bis="" hinweise={[]} />);
    await fill("input[type='search']", "mull");
    await zeit(300);
    expect(mocks.replace).toHaveBeenCalledTimes(1);

    mocks.replace.mockClear();
    await rerender(<JournalFilter q="mull" typ="" von="" bis="" hinweise={[]} />);
    await zeit(600);

    expect(query<HTMLInputElement>("input[type='search']").value).toBe("mull");
    expect(mocks.replace).not.toHaveBeenCalled();
  });

  it("flusht bereits Getipptes beim Typklick und verwirft den alten Timer", async () => {
    await mount(<JournalFilter q="" typ="" von="" bis="" hinweise={[]} />);
    await fill("input[type='search']", "  mull  ");
    await zeit(100);
    await waehleVorgang("Wareneingang");

    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(letzterPfad().searchParams.get("q")).toBe("mull");
    expect(letzterPfad().searchParams.get("typ")).toBe("zugang");
    await zeit(400);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("flusht bereits Getipptes auch beim Datumsklick", async () => {
    window.history.replaceState(null, "", "/verwaltung/journal?von=2026-08-01");
    await mount(
      <JournalFilter q="" typ="" von="2026-08-01" bis="" hinweise={[]} />,
    );
    await fill("input[type='search']", "  naht  ");
    await zeit(100);
    await waehleTag("Zeitraum von", "2026-08-15");

    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(letzterPfad().searchParams.get("q")).toBe("naht");
    expect(letzterPfad().searchParams.get("von")).toBe("2026-08-15");
    await zeit(400);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("setzt alle vier Parameter zurueck und laesst keinen Debounce nachlaufen", async () => {
    window.history.replaceState(
      null,
      "",
      "/verwaltung/journal?q=alt&typ=entnahme&von=2026-08-01&bis=2026-08-31",
    );
    await mount(
      <JournalFilter
        q="alt"
        typ="entnahme"
        von="2026-08-01"
        bis="2026-08-31"
        hinweise={[]}
      />,
    );
    await fill("input[type='search']", "wartet");
    await zeit(100);
    await clickElement(knopf("Zurücksetzen"));

    expect(mocks.replace).toHaveBeenCalledTimes(1);
    expect(letzterPfad().pathname).toBe("/verwaltung/journal");
    expect(letzterPfad().search).toBe("");
    expect(query<HTMLInputElement>("input[type='search']").value).toBe("");
    await zeit(400);
    expect(mocks.replace).toHaveBeenCalledTimes(1);
  });

  it("benutzt zwei einzelne DatePicker und reicht ungueltige Tage nirgends hinein", async () => {
    await mount(
      <JournalFilter
        q=""
        typ=""
        von="2026-02-31"
        bis="gestern"
        hinweise={["Das Datum in der Adresse ist ungültig und wurde ignoriert."]}
      />,
    );

    expect(exists(".ant-picker-range")).toBe(false);
    const inputs = queryAll<HTMLInputElement>(".ant-picker input");
    expect(inputs).toHaveLength(2);
    expect(inputs.map((input) => input.value)).toEqual(["", ""]);
    expect(document.body.textContent).toContain("ungültig und wurde ignoriert");
    expect(exists(".ant-alert-error")).toBe(false);

    await clickElement(inputs[0]);
    expect(
      document.body.querySelectorAll(
        ".ant-picker-cell-in-view:not(.ant-picker-cell-disabled)",
      ).length,
    ).toBeGreaterThan(0);
  });
});
