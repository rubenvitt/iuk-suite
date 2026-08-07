// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  exists,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";

const mocks = vi.hoisted(() => ({ replace: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ replace: mocks.replace }),
  usePathname: () => "/verwaltung/checks",
}));

import { ChecksFilter, fahrzeugFilter } from "./ChecksFilter";

const FAHRZEUGE = [
  { id: "rtw-1", name: "RTW 1", kennung: "UE-RK 1234" },
  { id: "mtw-1", name: "MTW 1", kennung: "UE-MT 9" },
];

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

function knopfMitText(text: string): HTMLElement {
  const knopf = queryAll<HTMLElement>("button")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf nicht gefunden: ${text}`);
  return knopf;
}

beforeEach(() => {
  vi.clearAllMocks();
  window.history.replaceState({}, "", "/verwaltung/checks");
});

afterEach(async () => {
  await unmount();
});

describe("ChecksFilter", () => {
  it("ist eine Client-Insel mit zwei unabhängigen DatePickern und keinem RangePicker", async () => {
    await mount(
      <ChecksFilter fz="" von="" bis="" fahrzeuge={FAHRZEUGE} hinweise={[]} />,
    );

    expect(queryAll(".ant-picker")).toHaveLength(2);
    expect(exists(".ant-picker-range")).toBe(false);
    expect(query<HTMLInputElement>("[aria-label='Zeitraum von']")).toBeTruthy();
    expect(query<HTMLInputElement>("[aria-label='Zeitraum bis']")).toBeTruthy();

    const pfad = "src/app/m/lagerbuch/verwaltung/(arbeit)/checks/ChecksFilter.tsx";
    const source = ts.createSourceFile(
      pfad,
      readFileSync(pfad, "utf8"),
      ts.ScriptTarget.Latest,
      true,
      ts.ScriptKind.TSX,
    );
    const erste = source.statements[0];
    expect(ts.isExpressionStatement(erste)
      && ts.isStringLiteral(erste.expression)
      && erste.expression.text).toBe("use client");
  });

  it("filtert das Fahrzeug-Select über Name und Kennzeichen", async () => {
    expect(fahrzeugFilter("rtw", {
      value: "rtw-1", label: "RTW 1", keywords: "UE-RK 1234",
    })).toBe(true);
    expect(fahrzeugFilter("ue-rk", {
      value: "rtw-1", label: "RTW 1", keywords: "UE-RK 1234",
    })).toBe(true);
    expect(fahrzeugFilter("mtw", {
      value: "rtw-1", label: "RTW 1", keywords: "UE-RK 1234",
    })).toBe(false);

    await mount(
      <ChecksFilter fz="" von="" bis="" fahrzeuge={FAHRZEUGE} hinweise={[]} />,
    );
    const auswahl = query<HTMLInputElement>("[aria-label='Fahrzeug']");
    await act(async () => {
      auswahl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await fill("[aria-label='Fahrzeug']", "UE-RK");
    await warte();

    const optionen = Array.from(
      document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"),
    ).map((option) => option.textContent);
    expect(optionen).toEqual(["RTW 1"]);
  });

  it("zeigt verworfene Datumsgrenzen als gekanteten Text und nicht als Fehler-Alert", async () => {
    await mount(
      <ChecksFilter
        fz=""
        von=""
        bis=""
        fahrzeuge={[]}
        hinweise={["Das Datum in der Adresse ist ungültig und wurde ignoriert."]}
      />,
    );

    expect(document.body.textContent).toContain("ungültig und wurde ignoriert");
    expect(exists(".ant-alert-error")).toBe(false);
    expect(exists("[data-rolle='filterhinweis']")).toBe(true);
  });

  it("bietet auch für einen verworfenen URL-Wert einen sichtbaren Reset an", async () => {
    window.history.replaceState({}, "", "/verwaltung/checks?von=unsinn");
    await mount(
      <ChecksFilter
        fz=""
        von=""
        bis=""
        fahrzeuge={[]}
        hinweise={["Das Datum in der Adresse ist ungültig und wurde ignoriert."]}
      />,
    );

    await clickElement(knopfMitText("Zurücksetzen"));

    expect(mocks.replace).toHaveBeenCalledWith(
      "/verwaltung/checks",
      { scroll: false },
    );
  });

  it("schreibt eine Fahrzeugauswahl mit den übrigen Filterwerten in die URL", async () => {
    await mount(
      <ChecksFilter fz="" von="2026-08-01" bis="" fahrzeuge={FAHRZEUGE} hinweise={[]} />,
    );
    const auswahl = query<HTMLInputElement>("[aria-label='Fahrzeug']");
    await act(async () => {
      auswahl.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await warte();
    const option = Array.from(
      document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"),
    ).find((element) => (element.textContent ?? "").includes("RTW 1"));
    if (!option) throw new Error("Fahrzeugoption RTW 1 fehlt");
    await clickElement(option);

    expect(mocks.replace).toHaveBeenCalledWith(
      "/verwaltung/checks?fz=rtw-1&von=2026-08-01",
      { scroll: false },
    );
  });

  it("setzt alle URL-Filter über einen echten sichtbaren Button zurück", async () => {
    window.history.replaceState(
      {},
      "",
      "/verwaltung/checks?fz=rtw-1&von=2026-08-01&bis=2026-08-07",
    );
    await mount(
      <ChecksFilter
        fz="rtw-1"
        von="2026-08-01"
        bis="2026-08-07"
        fahrzeuge={FAHRZEUGE}
        hinweise={[]}
      />,
    );

    await clickElement(knopfMitText("Zurücksetzen"));

    expect(mocks.replace).toHaveBeenCalledWith(
      "/verwaltung/checks",
      { scroll: false },
    );
  });

  it("blendet den Reset ohne wirksamen Filter aus", async () => {
    await mount(
      <ChecksFilter fz="" von="" bis="" fahrzeuge={FAHRZEUGE} hinweise={[]} />,
    );

    expect(queryAll("button").some((button) => button.textContent === "Zurücksetzen"))
      .toBe(false);
  });
});
