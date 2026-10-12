// @vitest-environment jsdom
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const senden = vi.hoisted(() => vi.fn());
vi.mock("@/core/rueckmeldung/senden", () => ({ sendeRueckmeldung: senden }));

import { RueckmeldungFlyin } from "@/core/rueckmeldung/RueckmeldungFlyin";
import { liesFlyinStand, oeffneRueckmeldung, schliesseRueckmeldung } from "@/core/rueckmeldung/flyinZustand";
import { clickElement, existsPortal, fillElement, mount, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

/**
 * DAS FLYIN IM DOM (IDA-214). Was jsdom hier NICHT sieht: die Breite der
 * Schublade (Falle 13) und den zeitversetzten Fokusraub (Falle 24) — beides
 * misst `e2e/rueckmeldung.spec.ts` im echten Browser.
 */

async function oeffne() {
  await mount(<RueckmeldungFlyin modulKey="portal" />);
  await act(async () => oeffneRueckmeldung());
}

const titel = () => queryPortal<HTMLInputElement>('[data-testid="rueckmeldung-titel"]');
const text = () => queryPortal<HTMLTextAreaElement>('[data-testid="rueckmeldung-text"]');
const waehle = (name: string) =>
  clickElement(
    [...document.body.querySelectorAll<HTMLElement>("label")].find((l) => l.textContent === name) as HTMLElement,
  );
async function absenden() {
  const form = queryPortal<HTMLFormElement>('[data-testid="rueckmeldung-formular"]');
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

beforeEach(() => {
  senden.mockReset();
  sessionStorage.clear();
});

afterEach(async () => {
  await act(async () => schliesseRueckmeldung());
  await unmount();
});

describe("RueckmeldungFlyin", () => {
  it("ist zu, bis jemand es öffnet", async () => {
    await mount(<RueckmeldungFlyin modulKey="portal" />);
    expect(existsPortal('[data-testid="rueckmeldung-formular"]')).toBe(false);
    await act(async () => oeffneRueckmeldung());
    expect(existsPortal('[data-testid="rueckmeldung-formular"]')).toBe(true);
  });

  it("schickt Art, Titel, Text und Kontext und zeigt die Nummer", async () => {
    senden.mockResolvedValue({ ok: true, kennung: "IDAE-12" });
    await oeffne();
    await waehle("Idee oder Wunsch");
    await fillElement(titel(), "Sortierung merken");
    await fillElement(text(), "Bitte die Sortierung der Liste merken.");
    await absenden();

    expect(senden).toHaveBeenCalledOnce();
    expect(senden.mock.calls[0]?.[0]).toMatchObject({
      art: "idee",
      titel: "Sortierung merken",
      text: "Bitte die Sortierung der Liste merken.",
      modulKey: "portal",
      seite: window.location.href,
    });
    expect(queryPortal('[data-testid="rueckmeldung-kennung"]').textContent).toBe("IDAE-12");
  });

  it("schickt ohne Art und Titel gar nicht erst los", async () => {
    await oeffne();
    await absenden();
    expect(senden).not.toHaveBeenCalled();
    expect(queryPortal('[data-testid="rueckmeldung-fehler"]').textContent).toContain("Wähle aus");
  });

  /** Ein Fehlschlag darf nichts kosten: Text stehen lassen, Meldung zeigen. */
  it("behält den Text, wenn Zunder nicht annimmt", async () => {
    senden.mockResolvedValue({ ok: false, grund: "Gerade nicht erreichbar." });
    await oeffne();
    await waehle("Etwas klappt nicht");
    await fillElement(titel(), "Speichern hängt");
    await absenden();
    expect(queryPortal('[data-testid="rueckmeldung-fehler"]').textContent).toContain("Gerade nicht erreichbar.");
    expect(titel().value).toBe("Speichern hängt");
  });

  it("schickt beim zweiten Versuch dieselbe ID — Zunder legt dann nichts doppelt an", async () => {
    senden.mockResolvedValueOnce({ ok: false, grund: "weg" }).mockResolvedValueOnce({ ok: true, kennung: "IDAE-3" });
    await oeffne();
    await waehle("Sonstiges");
    await fillElement(titel(), "Danke für die Suite");
    await absenden();
    await absenden();
    const [erste, zweite] = senden.mock.calls.map(([e]) => (e as { id: string }).id);
    expect(erste).toBe(zweite);
  });

  it("übersteht einen Wurf der Action", async () => {
    senden.mockRejectedValue(new Error("Netz weg"));
    await oeffne();
    await waehle("Sonstiges");
    await fillElement(titel(), "Danke für die Suite");
    await absenden();
    expect(existsPortal('[data-testid="rueckmeldung-fehler"]')).toBe(true);
  });

  it("hält den Entwurf über ein Schließen hinweg und räumt ihn nach dem Erfolg weg", async () => {
    await oeffne();
    await fillElement(titel(), "Halb geschrieben");
    await act(async () => schliesseRueckmeldung());
    await act(async () => oeffneRueckmeldung());
    expect(titel().value).toBe("Halb geschrieben");

    senden.mockResolvedValue({ ok: true, kennung: "IDAE-4" });
    await waehle("Sonstiges");
    await absenden();
    expect(sessionStorage.getItem("iuk-rueckmeldung-entwurf")).toBeNull();
  });

  it("schließt über „Schließen“ nach dem Dank", async () => {
    senden.mockResolvedValue({ ok: true, kennung: "IDAE-5" });
    await oeffne();
    await waehle("Sonstiges");
    await fillElement(titel(), "Alles gut");
    await absenden();
    const schliessen = [...document.body.querySelectorAll<HTMLElement>("button")].find(
      (b) => b.textContent === "Schließen",
    ) as HTMLElement;
    await clickElement(schliessen);
    expect(liesFlyinStand()).toBe("zu");
  });
});
