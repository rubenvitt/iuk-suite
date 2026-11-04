// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";
import { clickElement, fillElement, mount, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

const anlegen = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../_actions/verwaltung", () => ({
  artikelAnlegenAction: (...a: unknown[]) => anlegen(...a),
  artikelAendernAction: vi.fn(),
  artikelAktivAction: vi.fn(),
  nachschlagenAction: vi.fn(),
}));

import { ArtikelVerwaltung } from "./ArtikelVerwaltung";

/** IDA-358 — der Artikeldialog: Getipptes übersteht Neuladen und kommt beim nächsten Öffnen wieder. */
beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  anlegen.mockReset();
});
afterEach(async () => { await unmount(); });

const ansicht = () => mount(<App><ArtikelVerwaltung artikel={[]} bestand={{}} /></App>);
const knopf = (text: string, wo: ParentNode = document) =>
  Array.from(wo.querySelectorAll<HTMLButtonElement>("button")).find((b) => b.textContent?.includes(text))!;

describe("ArtikelVerwaltung (Modus 2)", () => {
  it("Öffnen allein legt nichts ab; Getipptes kommt nach dem Neuladen wieder", async () => {
    await ansicht();
    await clickElement(knopf("Artikel anlegen"));
    expect(ladeEntwurf("verpflegung:artikel:neu")).toBeNull();
    await fillElement(queryPortal<HTMLInputElement>("#name"), "Erbsensuppe");
    expect(ladeEntwurf<{ name: string }>("verpflegung:artikel:neu")?.stand.name).toBe("Erbsensuppe");
    await unmount();

    await ansicht();
    await clickElement(knopf("Artikel anlegen"));
    expect(queryPortal<HTMLInputElement>("#name").value).toBe("Erbsensuppe");
    expect(queryPortal("[data-rolle='entwurf-hinweis']").textContent).toContain("Eingaben wiederhergestellt.");
  });
});
