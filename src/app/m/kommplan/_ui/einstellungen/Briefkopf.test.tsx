// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";
import { clickElement, exists, fill, mount, query, submitForm, unmount } from "@/app/m/qr/_lib/test-dom";

const aktion = vi.hoisted(() => ({ name: vi.fn(), entferne: vi.fn() }));
const router = vi.hoisted(() => ({ refresh: vi.fn() }));
vi.mock("../../_actions/briefkopf", () => ({ speichereOrganisationAction: aktion.name, entferneLogoAction: aktion.entferne }));
vi.mock("next/navigation", () => ({ useRouter: () => router }));
import { BriefkopfFormular } from "./Briefkopf";

const abwarten = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
/** Knopf oder Menüeintrag nach sichtbarem Text — auch in Portalen (Popconfirm, Dropdown hängen am body). */
const knopf = (text: string) => [...document.querySelectorAll<HTMLElement>("button, [role='menuitem']")].find((b) => b.textContent?.trim() === text)!;
beforeEach(() => {
  aktion.name.mockReset().mockResolvedValue({ ok: true });
  aktion.entferne.mockReset().mockResolvedValue({ ok: true });
  router.refresh.mockReset();
});
afterEach(async () => { await unmount(); vi.unstubAllGlobals(); });

describe("BriefkopfFormular", () => {
  it("ohne Logo: Hinweis, „Logo hochladen“, kein „Logo entfernen“", async () => {
    await mount(<BriefkopfFormular organisation={null} logo={null} />);
    expect(query('[aria-label="Logo"]').textContent).toContain("Kein Logo hinterlegt.");
    expect(query('[aria-label="Logo"]').textContent).toContain("Logo hochladen");
    expect(query('[aria-label="Logo"]').textContent).not.toContain("Logo entfernen");
    expect(query('input[type="file"][name="logo"]').getAttribute("accept")).toContain("image/svg+xml");
  });
  it("Organisation speichern: Action, Meldung, Seite neu", async () => {
    await mount(<BriefkopfFormular organisation="Alt" logo={null} />);
    await fill('input[name="organisation"]', "Kreisverband Muster");
    await submitForm('form[aria-label="Organisation"]');
    await abwarten();
    expect(aktion.name).toHaveBeenCalledWith({ organisation: "Kreisverband Muster" });
    expect(query('[role="status"]').textContent).toBe("Organisation gespeichert.");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("Logo hochladen: POST /logo mit Feld „logo“; Ablehnung steht als Warnung da, ohne Neuladen", async () => {
    const abruf = vi.fn()
      .mockResolvedValueOnce({ json: async () => ({ ok: false, fehler: "Erlaubt sind PNG, JPEG, WebP und SVG." }) })
      .mockResolvedValueOnce({ json: async () => ({ ok: true, typ: "image/svg+xml" }) });
    vi.stubGlobal("fetch", abruf);
    await mount(<BriefkopfFormular organisation={null} logo={null} />);
    const feld = query<HTMLInputElement>('input[type="file"][name="logo"]');
    const waehle = async (datei: File) => act(async () => {
      Object.defineProperty(feld, "files", { value: [datei], configurable: true });
      feld.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await waehle(new File(["GIF89a"], "logo.gif"));
    await abwarten();
    expect(abruf.mock.calls[0][0]).toBe("/logo");
    expect((abruf.mock.calls[0][1].body as FormData).get("logo")).toBeInstanceOf(File);
    expect(query('[role="status"]').textContent).toBe("Erlaubt sind PNG, JPEG, WebP und SVG.");
    expect(router.refresh).not.toHaveBeenCalled();
    await waehle(new File(["<svg/>"], "logo.svg"));
    await abwarten();
    expect(query('[role="status"]').textContent).toBe("Logo übernommen (SVG).");
    expect(router.refresh).toHaveBeenCalledTimes(1);
  });
  it("mit Logo: Typ und Größe, „Logo ersetzen“; „Logo entfernen“ fragt nach und entfernt", async () => {
    await mount(<BriefkopfFormular organisation="Muster" logo={{ typ: "image/png", bytes: 12_800 }} />);
    expect(query('[aria-label="Logo"]').textContent).toContain("Logo: PNG, 13 KB");
    expect(query('[aria-label="Logo"]').textContent).toContain("Logo ersetzen");
    await clickElement(knopf("Logo entfernen"));
    await clickElement(knopf("Entfernen"));
    await abwarten();
    expect(aktion.entferne).toHaveBeenCalledTimes(1);
    expect(query('[role="status"]').textContent).toBe("Logo entfernt.");
    expect(exists('[role="status"]')).toBe(true);
  });
});
