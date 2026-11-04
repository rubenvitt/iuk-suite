// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ladeEntwurf, vergissFluechtig } from "@/core/entwurf/ablage";
import { clickElement, exists, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

const ausgeben = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("./Kamera", () => ({ Kamera: () => null }));
vi.mock("../../_actions/telefon", () => ({
  ausgebenAction: (...a: unknown[]) => ausgeben(...a),
  einbuchenAction: vi.fn(),
  aussondernAmTelefonAction: vi.fn(),
  nachschlagenAmTelefonAction: vi.fn(async () => null),
  vorlaeufigAnlegenAction: vi.fn(),
}));

import { Telefon, type TelefonDaten } from "./Telefon";

/**
 * IDA-358 — eine Buchung am Telefon übersteht ein gescheitertes Absenden und ein Neuladen: Reiter, Artikelseite und
 * Eingaben kommen wieder, und die liegende Buchung geht mit derselben Sendungs-ID von selbst noch einmal raus.
 */
const ORT = { id: "ort-1", name: "Regal A", kurz: "A", gekuehlt: false, aktiv: true };
const DOSE = {
  id: "art-1", name: "Erbsensuppe", ean: null, kategorie: "Konserven", einheit: "Dose", mhdArt: "mhd" as const, rotTage: 7, gelbTage: 30,
  mindest: null, vorlaeufig: false, aktiv: true,
};
const D: TelefonDaten = {
  zugang: { art: "link", wer: "Helfer-Link", laeuftAb: null },
  orte: [ORT],
  artikel: [DOSE],
  chargen: [{
    id: "ch-1", artikelId: DOSE.id, ortId: ORT.id, mhd: "2027-03-01", menge: 5, eingang: "2026-11-01",
    status: { ampel: "ok", tage: 117, abgelaufen: false, gesperrt: false },
    artikelName: DOSE.name, einheit: "Dose", mhdArt: "mhd", kategorie: "Konserven", ortName: ORT.name, ortKurz: ORT.kurz,
  }],
  heute: "2026-11-04",
  startOrt: null,
};

const knopf = (text: string) => {
  const b = queryAll<HTMLButtonElement>("button").find((x) => x.textContent?.trim() === text || x.textContent?.includes(text));
  if (!b) throw new Error(`Kein Knopf „${text}"`);
  return b;
};

beforeEach(() => {
  localStorage.clear();
  vergissFluechtig();
  ausgeben.mockReset();
  // jsdom kennt `scrollTo` an Elementen nicht; `Reiter` scrollt bei jedem Seitenwechsel nach oben.
  Element.prototype.scrollTo = () => undefined;
});
afterEach(async () => { await unmount(); });

describe("Telefon — Buchung (IDA-358)", () => {
  it("stellt die Eingaben der Artikelseite nach dem Neuladen wieder her", async () => {
    await mount(<Telefon d={D} />);
    await clickElement(query("[data-rolle='artikel-zeile']"));
    await clickElement(knopf("Einsatz"));
    await unmount();
    await mount(<Telefon d={D} />);
    expect(knopf("Einsatz").getAttribute("aria-pressed")).toBe("true");
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toContain("Eingaben wiederhergestellt.");
  });

  it("hält eine gescheiterte Ausgabe fest und sendet sie nach dem Neuladen mit derselben Sendung", async () => {
    ausgeben.mockRejectedValue(new Error("offline"));
    await mount(<Telefon d={D} />);
    await clickElement(query("[data-rolle='artikel-zeile']"));
    await clickElement(knopf("ausgeben"));
    expect(ausgeben).toHaveBeenCalledTimes(1);
    const erste = (ausgeben.mock.calls[0][0] as { sendung: string }).sendung;
    expect(erste).toMatch(/^[0-9a-f-]{36}$/);
    expect(query("[data-rolle='entwurf-hinweis']").textContent).toMatch(/^Nicht gesendet\./);
    expect(exists("[role='alert']")).toBe(false);
    await unmount();

    ausgeben.mockReset();
    ausgeben.mockResolvedValue({ ok: true, text: "1 Dose Erbsensuppe ausgegeben" });
    await mount(<Telefon d={D} />);
    expect(ausgeben).toHaveBeenCalledTimes(1);
    expect(ausgeben.mock.calls[0][0]).toEqual({ chargeId: "ch-1", menge: 1, ziel: "Dienstabend", sendung: erste });
    expect(query("[role='status']").textContent).toContain("1 Dose Erbsensuppe ausgegeben");
    expect(ladeEntwurf(`verpflegung:ausgeben:${DOSE.id}`)).toBeNull();
  });

  it("eine Ablehnung zeigt den Satz des Servers und wird nicht wiederholt", async () => {
    ausgeben.mockResolvedValue({ ok: false, fehler: "Es liegen nur 0 Dosen da." });
    await mount(<Telefon d={D} />);
    await clickElement(query("[data-rolle='artikel-zeile']"));
    await clickElement(knopf("ausgeben"));
    expect(query("[role='alert']").textContent).toBe("Es liegen nur 0 Dosen da.");
    await unmount();
    await mount(<Telefon d={D} />);
    expect(ausgeben).toHaveBeenCalledTimes(1);
  });
});
