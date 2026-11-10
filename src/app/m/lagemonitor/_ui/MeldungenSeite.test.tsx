// @vitest-environment jsdom
import { App } from "antd";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mount, query, unmount } from "@/app/m/qr/_lib/test-dom";
import { vergissFluechtig } from "@/core/entwurf/ablage";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("../_actions/verwaltung", () => ({ meldungAnlegenAction: vi.fn(), meldungBeendenAction: vi.fn() }));

import { VORGABE } from "../_lib/konfiguration";
import { MeldungenSeite } from "./MeldungenSeite";

/** IDA-396 — die Startseite gehört den Meldungen, die Einrichtung ist einen Schritt entfernt. */
beforeEach(() => { localStorage.clear(); vergissFluechtig(); });
afterEach(async () => { await unmount(); });

const ansicht = () =>
  mount(<App><MeldungenSeite konfiguration={VORGABE} meldungen={[]} kategorien={[]} online={null} zugaenge={[]} standorte={{}} lagekarte={[]} /></App>);

describe("MeldungenSeite", () => {
  it("„Meldung anlegen“ ist die Hauptaktion und steht vor der Liste", async () => {
    await ansicht();
    expect(query("h1").textContent).toBe("Meldungen");
    const knopf = query<HTMLButtonElement>('form[aria-label="Neue Meldung"] button[type="submit"]');
    expect(knopf.textContent).toBe("Meldung anlegen");
    expect(knopf.className).toContain("ant-btn-primary");
    const leer = [...document.querySelectorAll("span")].find((s) => s.textContent === "Gerade läuft keine Meldung.")!;
    expect(knopf.compareDocumentPosition(leer) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it("führt mit einem Schritt in die Einrichtung", async () => {
    await ansicht();
    expect(query<HTMLAnchorElement>('[data-testid="zur-einrichtung"]').getAttribute("href")).toBe("/einrichtung");
  });

  it("die Einstellungen der Anzeige stehen nicht auf dieser Seite", async () => {
    await ansicht();
    expect(document.querySelector('form[aria-label="Einstellungen des Lagemonitors"]')).toBeNull();
    expect(document.querySelector('aside[aria-label="Vorschau"]')).not.toBeNull();
  });
});
