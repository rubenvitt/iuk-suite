// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { WochenWaehler } from "./WochenWaehler";

afterEach(async () => {
  await unmount();
});

describe("WochenWaehler — die Woche steht in der URL, nicht in useState", () => {
  it("„zurück“ zeigt auf den Montag sieben Tage frueher", async () => {
    await mount(<WochenWaehler montag="2026-08-10" heute="2026-08-10" />);
    const links = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(links).toContain("?woche=2026-08-03");
  });

  it("„vor“ zeigt auf den Montag sieben Tage spaeter", async () => {
    await mount(<WochenWaehler montag="2026-08-10" heute="2026-08-10" />);
    const links = queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"));
    expect(links).toContain("?woche=2026-08-17");
  });

  it("zeigt den Datumsbereich Montag bis Freitag der angezeigten Woche", async () => {
    await mount(<WochenWaehler montag="2026-08-10" heute="2026-08-10" />);
    expect(document.body.textContent).toContain("Mo, 10.08.");
    expect(document.body.textContent).toContain("Fr, 14.08.");
  });

  it("zeigt keinen „Aktuelle Woche“-Verweis, wenn die angezeigte Woche die aktuelle ist", async () => {
    await mount(<WochenWaehler montag="2026-08-10" heute="2026-08-12" />);
    const knoepfe = queryAll("a").map((a) => a.textContent);
    expect(knoepfe.some((t) => t?.includes("Aktuelle Woche"))).toBe(false);
  });

  it("zeigt einen „Aktuelle Woche“-Verweis, sobald eine andere Woche angezeigt wird, und er fuehrt zur Woche von heute", async () => {
    await mount(<WochenWaehler montag="2026-08-17" heute="2026-08-12" />);
    const verweis = queryAll<HTMLAnchorElement>("a").find((a) => a.textContent?.includes("Aktuelle Woche"));
    expect(verweis, "Aktuelle-Woche-Verweis fehlt").toBeTruthy();
    expect(verweis!.getAttribute("href")).toBe("?woche=2026-08-10");
  });

  it("ein Wochenwechsel traegt keinen tag-Parameter — die neue Woche hat andere fünf Tage", async () => {
    await mount(<WochenWaehler montag="2026-08-10" heute="2026-08-10" />);
    for (const href of queryAll<HTMLAnchorElement>("a").map((a) => a.getAttribute("href"))) {
      expect(href).not.toContain("tag=");
    }
  });

  it("„zurück“ und „vor“ tragen ein aria-label, das die Richtung nennt", async () => {
    await mount(<WochenWaehler montag="2026-08-10" heute="2026-08-10" />);
    expect(query('a[aria-label="Vorherige Woche"]')).toBeTruthy();
    expect(query('a[aria-label="Nächste Woche"]')).toBeTruthy();
  });
});
