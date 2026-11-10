// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderToStaticMarkup } from "react-dom/server";
import { click, mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import Fehlergrenze from "./error";
import GlobalerFehler from "./global-error";

/**
 * IDA-392: ein Serverfehler in einem beliebigen Modul zeigt eine deutsche Seite mit Rueckweg, nicht die
 * englische Seite von Next. Die Grenze an der Wurzel faengt jedes Modul ohne eigene.
 */
afterEach(async () => {
  await unmount();
  delete document.documentElement.dataset.portal;
});

const FEHLER = Object.assign(new Error("egal"), { digest: "1" });

describe("Fehlergrenze an der Wurzel", () => {
  it("deutsch, mit Ueberschrift, „Nochmal versuchen“ und dem Weg ins Portal aus `data-portal`", async () => {
    document.documentElement.dataset.portal = "https://suite.example.org/";
    const retry = vi.fn();
    await mount(<Fehlergrenze error={FEHLER} retry={retry} />);

    expect(query("h1").textContent).toBe("Da ist etwas schiefgegangen.");
    expect(query('[data-testid="fehler-portal"]').getAttribute("href")).toBe("https://suite.example.org/");
    await click('[data-testid="fehler-erneut"]');
    expect(retry).toHaveBeenCalledTimes(1);
  });

  it("ohne `data-portal` bleibt `/`, und der Fehlertext erscheint nie", async () => {
    await mount(<Fehlergrenze error={FEHLER} retry={() => {}} />);
    expect(query('[data-testid="fehler-portal"]').getAttribute("href")).toBe("/");
    expect(document.body.textContent).not.toContain("egal");
  });

  it("rendert auch auf dem Server (Serverfehler werden dort zuerst gezeigt)", () => {
    const markup = renderToStaticMarkup(<Fehlergrenze error={FEHLER} retry={() => {}} />);
    expect(markup).toContain("Da ist etwas schiefgegangen.");
    expect(markup).toContain('href="/"');
  });
});

describe("globaler Rueckfall fuer Fehler im Root-Layout", () => {
  it("eigenes Dokument, deutsch, mit Rueckweg", () => {
    const markup = renderToStaticMarkup(<GlobalerFehler error={FEHLER} retry={() => {}} />);
    expect(markup).toMatch(/^<html lang="de"/);
    expect(markup).toContain("Da ist etwas schiefgegangen.");
    expect(markup).toContain("Nochmal versuchen");
    expect(markup).toContain('href="/"');
  });
});
