// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  exists,
  fill,
  mount,
  query,
  submitForm,
  unmount,
} from "@/app/m/qr/_lib/test-dom";

const mocks = vi.hoisted(() => ({
  erfassen: vi.fn(),
}));

vi.mock("../../../../_actions/sauerstoff", () => ({
  messungErfassen: (...args: unknown[]) => mocks.erfassen(...args),
}));

import { MessungForm } from "./MessungForm";

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 50; versuch++) {
    if (pruefen()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Zeitüberschreitung: ${beschreibung}`);
}

beforeEach(() => {
  mocks.erfassen.mockReset();
  mocks.erfassen.mockResolvedValue({ ok: true, wert: { id: "messung-1" } });
});

afterEach(async () => {
  await unmount();
});

describe("MessungForm", () => {
  it("sendet 0 bar als gültigen Messwert aus einem echten Formular", async () => {
    await mount(<MessungForm flascheId="flasche-1" />);

    expect(exists("form")).toBe(true);
    expect(exists("button[type='submit']")).toBe(true);
    await fill("input[aria-label='Druck (bar)']", "0");
    await submitForm();
    await warte();

    expect(mocks.erfassen).toHaveBeenCalledWith({
      flascheId: "flasche-1",
      druckBar: 0,
      kommentar: undefined,
    });
  });

  it("erlaubt keinen negativen Druck, setzt aber keine erfundene Obergrenze", async () => {
    await mount(<MessungForm flascheId="flasche-1" />);
    const druck = query<HTMLInputElement>("input[aria-label='Druck (bar)']");

    expect(druck.getAttribute("aria-valuemin")).toBe("0");
    expect(druck.hasAttribute("aria-valuemax")).toBe(false);
  });

  it("trimmt den Kommentar und sendet den vollständigen Payload", async () => {
    await mount(<MessungForm flascheId="flasche-1" />);
    await fill("input[aria-label='Druck (bar)']", "187");
    await fill("input[aria-label='Kommentar']", "  nach Tausch  ");
    await submitForm();
    await warte();

    expect(mocks.erfassen).toHaveBeenCalledWith({
      flascheId: "flasche-1",
      druckBar: 187,
      kommentar: "nach Tausch",
    });
  });

  it("bindet Feldfehler ans Druckfeld und zeigt den festen Warning-Titel", async () => {
    mocks.erfassen.mockResolvedValueOnce({
      ok: false,
      fehler: "interne Einzelheit",
      feldFehler: { druckBar: "Druck darf nicht negativ sein" },
    });
    await mount(<MessungForm flascheId="flasche-1" />);
    await fill("input[aria-label='Druck (bar)']", "10");
    await submitForm();
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Druck darf nicht negativ sein"),
      "gebundener Druck-Feldfehler",
    );

    expect(document.body.textContent).toContain("Druck darf nicht negativ sein");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Messung konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("interne Einzelheit");
  });

  it("hält auch abgelehnte Actions geheim und sichtbar fest", async () => {
    mocks.erfassen.mockRejectedValueOnce(new Error("Datenbank-Pfad geheim"));
    await mount(<MessungForm flascheId="flasche-1" />);
    await fill("input[aria-label='Druck (bar)']", "10");
    await submitForm();
    await warte();

    expect(query(".ant-alert-warning").textContent)
      .toContain("Messung konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("Datenbank-Pfad geheim");
  });

  it("entfernt einen alten Feldfehler vor dem nächsten Submit", async () => {
    mocks.erfassen
      .mockResolvedValueOnce({
        ok: false,
        fehler: "erste Einzelheit",
        feldFehler: { druckBar: "Alter Druckfehler" },
      })
      .mockResolvedValueOnce({ ok: false, fehler: "zweite Einzelheit" });
    await mount(<MessungForm flascheId="flasche-1" />);
    await fill("input[aria-label='Druck (bar)']", "10");
    await submitForm();
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Alter Druckfehler"),
      "erster Feldfehler",
    );

    await submitForm();
    await warteAuf(
      () => mocks.erfassen.mock.calls.length === 2
        && !(document.body.textContent ?? "").includes("Alter Druckfehler"),
      "geräumter Feldfehler nach zweitem Action-Aufruf",
    );

    expect(document.body.textContent).not.toContain("Alter Druckfehler");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Messung konnte nicht gespeichert werden.");
  });

  it("blockiert einen synchronen Doppel-Submit während die erste Action läuft", async () => {
    let fertig!: (wert: { ok: true; wert: { id: string } }) => void;
    mocks.erfassen.mockReturnValueOnce(new Promise((resolve) => { fertig = resolve; }));
    await mount(<MessungForm flascheId="flasche-1" />);
    await fill("input[aria-label='Druck (bar)']", "100");

    await submitForm();
    await submitForm();
    expect(mocks.erfassen).toHaveBeenCalledTimes(1);

    await act(async () => { fertig({ ok: true, wert: { id: "messung-1" } }); });
    await warte();
  });
});
