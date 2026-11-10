// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { act } from "react";

/**
 * DIE RUECKFRAGE VOR „Jetzt aufräumen" (IDA-388). Vorher loeschte der Knopf
 * sofort. Die Actions selbst prueft `AblageKachel.test.tsx` gegen eine echte
 * Datenbank; hier geht es um den Ablauf: erst fragen, dann loeschen.
 */

const { vorschauMock, aufraeumenMock } = vi.hoisted(() => ({
  vorschauMock: vi.fn(),
  aufraeumenMock: vi.fn(async () => {}),
}));

vi.mock("../(verwaltung)/ablage-actions", () => ({
  aufraeumVorschauAction: vorschauMock,
  aufraeumenAction: aufraeumenMock,
}));

import { AufraeumenKnoepfe } from "./AufraeumenKnoepfe";
import { click, clickPortal, exists, existsPortal, mount, queryPortal, unmount } from "@/app/m/qr/_lib/test-dom";

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

beforeEach(() => {
  vorschauMock.mockReset();
  aufraeumenMock.mockClear();
});

afterEach(async () => {
  await unmount();
  document.body.innerHTML = "";
});

describe("„Jetzt aufräumen“ fragt mit den Zahlen nach", () => {
  it("löscht beim Klick nichts, sondern nennt, was gelöscht würde", async () => {
    vorschauMock.mockResolvedValue({
      satz: "Löscht 2 abgelaufene Freigaben und 3 Dateien (14,0 MiB).",
      trockenlaufErzwungen: false,
    });
    await mount(<AufraeumenKnoepfe />);
    await click('[data-testid="files-ablage-aufraeumen"]');
    await warte();

    expect(aufraeumenMock).not.toHaveBeenCalled();
    expect(queryPortal('[data-testid="files-ablage-rueckfrage-satz"]').textContent).toBe(
      "Löscht 2 abgelaufene Freigaben und 3 Dateien (14,0 MiB).",
    );
  });

  it("löscht erst nach der Bestätigung, mit `modus=echt`", async () => {
    vorschauMock.mockResolvedValue({ satz: "Löscht 1 abgelaufene Freigabe.", trockenlaufErzwungen: false });
    await mount(<AufraeumenKnoepfe />);
    await click('[data-testid="files-ablage-aufraeumen"]');
    await warte();
    await clickPortal('[data-testid="files-ablage-aufraeumen-bestaetigen"]');
    await warte();

    expect(aufraeumenMock).toHaveBeenCalledTimes(1);
    const daten = (aufraeumenMock.mock.calls[0] as unknown as [FormData])[0];
    expect(daten.get("modus")).toBe("echt");
  });

  it("bietet ohne Löschbares keinen Aufräumknopf an", async () => {
    vorschauMock.mockResolvedValue({ satz: null, trockenlaufErzwungen: false });
    await mount(<AufraeumenKnoepfe />);
    await click('[data-testid="files-ablage-aufraeumen"]');
    await warte();

    expect(queryPortal('[data-testid="files-ablage-rueckfrage-satz"]').textContent).toBe(
      "Es gibt gerade nichts, was gelöscht würde.",
    );
    expect(existsPortal('[data-testid="files-ablage-aufraeumen-bestaetigen"]')).toBe(false);
  });

  it("sagt, wenn der Trockenlauf fest eingeschaltet ist", async () => {
    vorschauMock.mockResolvedValue({ satz: "Löscht 1 abgelaufene Freigabe.", trockenlaufErzwungen: true });
    await mount(<AufraeumenKnoepfe />);
    await click('[data-testid="files-ablage-aufraeumen"]');
    await warte();

    expect(queryPortal('[data-testid="files-ablage-rueckfrage"]').textContent).toContain(
      "auch dieser Lauf löscht nichts",
    );
  });

  it("schickt das Formular mit „Jetzt aufräumen“ nicht ab", async () => {
    vorschauMock.mockResolvedValue({ satz: "Löscht 1 abgelaufene Freigabe.", trockenlaufErzwungen: false });
    await mount(<AufraeumenKnoepfe />);
    const knopf = document.querySelector('[data-testid="files-ablage-aufraeumen"]');
    expect(knopf?.getAttribute("type")).toBe("button");
  });

  it("meldet einen gescheiterten Lauf", async () => {
    vorschauMock.mockResolvedValue({ satz: "Löscht 1 abgelaufene Freigabe.", trockenlaufErzwungen: false });
    aufraeumenMock.mockRejectedValueOnce(new Error("kaputt"));
    await mount(<AufraeumenKnoepfe />);
    await click('[data-testid="files-ablage-aufraeumen"]');
    await warte();
    await clickPortal('[data-testid="files-ablage-aufraeumen-bestaetigen"]');
    await warte();

    expect(exists('[data-testid="files-ablage-aufraeumen-fehler"]')).toBe(true);
  });
});
