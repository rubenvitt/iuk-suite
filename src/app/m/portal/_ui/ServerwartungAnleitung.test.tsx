// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";

import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import { ServerwartungAnleitung } from "@/app/m/portal/_ui/ServerwartungAnleitung";
import { wartungsAbo } from "@/app/m/portal/_lib/serverwartung";

/* Ausgedachte Themen — das echte gehoert nie ins Repo (`_lib/serverwartung.ts`). */
const NTFY_SH = wartungsAbo({ SUITE_WARTUNG_NTFY_URL: "https://ntfy.sh/beispielthema" })!;
const EIGENER = wartungsAbo({ SUITE_WARTUNG_NTFY_URL: "https://ntfy.example.org/beispielthema" })!;

describe("ServerwartungAnleitung", () => {
  afterEach(async () => {
    await unmount();
    vi.unstubAllGlobals();
  });

  it("zeigt das Thema und verlinkt App und Browser", async () => {
    await mount(<ServerwartungAnleitung abo={NTFY_SH} />);
    expect(query("[data-testid=wartung-thema]").textContent).toBe("beispielthema");
    expect(query("[data-testid=wartung-app-link]").getAttribute("href")).toBe(NTFY_SH.appLink);
    expect(query("[data-testid=wartung-abo]").textContent).toContain("Im Browser ansehen");
    expect(exists("[data-testid=wartung-hinweis]")).toBe(true);
  });

  it("fuehrt Schritt fuer Schritt: App installieren, abonnieren, Mitteilungen erlauben", async () => {
    await mount(<ServerwartungAnleitung abo={NTFY_SH} />);
    const text = document.body.textContent ?? "";
    expect(text.indexOf("1. App installieren")).toBeLessThan(text.indexOf("2. Thema abonnieren"));
    expect(text.indexOf("2. Thema abonnieren")).toBeLessThan(text.indexOf("3. Mitteilungen erlauben"));
    const hosts = queryAll("a").flatMap((a) => {
      try {
        return [new URL(a.getAttribute("href") ?? "").hostname];
      } catch {
        return [];
      }
    });
    expect(hosts).toContain("play.google.com");
    expect(hosts).toContain("apps.apple.com");
  });

  it("verlinkt Status und Datenvolumen vor dem Abo", async () => {
    await mount(<ServerwartungAnleitung abo={NTFY_SH} />);
    const links = queryAll("[data-testid=wartung-links] a").map((a) => new URL(a.getAttribute("href") ?? "").hostname);
    expect(links).toEqual(["status.iuk-ue.de", "volumen.iuk-ue.de"]);
    const text = document.body.textContent ?? "";
    expect(text.indexOf("Status und Datenvolumen")).toBeLessThan(text.indexOf("Dein Abo"));
  });

  it("nennt den Server nur, wenn es nicht ntfy.sh ist", async () => {
    await mount(<ServerwartungAnleitung abo={NTFY_SH} />);
    expect(query("[data-testid=wartung-schritte]").textContent).not.toContain("Anderen Server");
    await unmount();
    await mount(<ServerwartungAnleitung abo={EIGENER} />);
    expect(query("[data-testid=wartung-schritte]").textContent).toContain("https://ntfy.example.org");
  });

  it("kopiert das Thema und bestaetigt am Knopf", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    vi.stubGlobal("navigator", { ...navigator, clipboard: { writeText } });
    await mount(<ServerwartungAnleitung abo={NTFY_SH} />);
    await clickElement(query("[data-testid=wartung-kopieren]"));
    expect(writeText).toHaveBeenCalledWith("beispielthema");
    expect(query("[data-testid=wartung-kopieren]").textContent).toContain("Kopiert");
  });
});
