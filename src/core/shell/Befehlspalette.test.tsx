// @vitest-environment jsdom
import { act } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { click, existsPortal, mount, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";
import { Befehlspalette } from "./Befehlspalette";
import type { LauncherEintrag, SuiteNavItem } from "./types";

const NAV: SuiteNavItem[] = [
  { key: "start", title: "Übersicht", href: "/" },
  { key: "suche", title: "Suche", href: "/suche" },
];
const APPS: LauncherEintrag[] = [
  { key: "radio", title: "Funkgeräte", href: "https://radio.example", abschnitt: "Apps", extern: false },
];

async function drueckeStrgK() {
  await act(async () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  });
}

async function tippe(text: string) {
  const feld = queryPortal<HTMLInputElement>('[data-testid="befehlspalette-eingabe"]');
  await act(async () => {
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value")!.set!;
    setter.call(feld, text);
    feld.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function taste(key: string) {
  const feld = queryPortal<HTMLInputElement>('[data-testid="befehlspalette-eingabe"]');
  await act(async () => {
    feld.dispatchEvent(new KeyboardEvent("keydown", { key, bubbles: true }));
  });
}

const echteLocation = Object.getOwnPropertyDescriptor(window, "location")!;

afterEach(async () => {
  await unmount();
  Object.defineProperty(window, "location", echteLocation);
});

describe("Befehlspalette", () => {
  it("öffnet mit Strg+K", async () => {
    await mount(<Befehlspalette nav={NAV} eintraege={APPS} suchHref="https://portal.example/suche" />);
    expect(existsPortal('[data-testid="befehlspalette"]')).toBe(false);
    await drueckeStrgK();
    expect(existsPortal('[data-testid="befehlspalette"]')).toBe(true);
  });

  it("zeigt Seiten und Apps, filtert und bietet die Suite-Suche an", async () => {
    await mount(<Befehlspalette nav={NAV} eintraege={APPS} suchHref="https://portal.example/suche" />);
    await click('[data-testid="befehlspalette-knopf"]');
    const titel = () => Array.from(document.querySelectorAll('[data-testid="befehl"]')).map((e) => e.textContent);
    expect(titel()).toEqual(["Übersicht", "Suche", "FunkgeräteApps"]);
    await tippe("UE-RK");
    expect(titel()).toEqual(["In allen Modulen nach „UE-RK“ suchen"]);
  });

  it("Pfeil und Enter führen zum gewählten Ziel", async () => {
    const assign = vi.fn();
    // Wie `components/login-form.test.tsx`: jsdom navigiert nicht, `location` wird ersetzt.
    Object.defineProperty(window, "location", { configurable: true, value: { assign, href: "http://portal.example/" } });
    await mount(<Befehlspalette nav={NAV} eintraege={APPS} suchHref="https://portal.example/suche" />);
    await drueckeStrgK();
    await taste("ArrowDown");
    await taste("ArrowDown");
    expect(queryPortal('[data-aktiv]').textContent).toContain("Funkgeräte");
    await taste("Enter");
    expect(assign).toHaveBeenCalledWith("https://radio.example");
  });
});
