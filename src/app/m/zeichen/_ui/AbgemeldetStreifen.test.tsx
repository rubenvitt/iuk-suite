// @vitest-environment jsdom
import { describe, it, expect, afterEach, vi } from "vitest";
import { mount, unmount, exists, query } from "@/app/m/qr/_lib/test-dom";
import { AbgemeldetStreifen } from "./AbgemeldetStreifen";

/**
 * ⛔ DER FALL, DER DIESEN TEST NOETIG MACHT (Fix-Runde 1, W2): `start_url` ist
 * `/offline`. Das ist die Adresse, unter der die INSTALLIERTE App STARTET —
 * ein angemeldeter Mensch mit Netz bekommt die Seite dort frisch vom Netz.
 * Eine Fassung, die allein `navigator.onLine` liest, schriebe ihm auf den
 * Startbildschirm seiner App, er sei abgemeldet, waehrend daneben in der
 * Kopfzeile „Anmelden" steht. Reparatur 1 und die Praemisse des Streifens
 * widersprachen einander; die Praemisse war falsch.
 *
 * Gemessen wird deshalb die EINE Frage, die der Streifen behauptet zu
 * beantworten: „gibt es gerade eine Sitzung?" — und die dritte Antwort
 * „ich weiss es nicht" (kein Netz) fuehrt zu SCHWEIGEN, nicht zu einer
 * Behauptung.
 */

function antworteMit(daten: unknown): void {
  vi.stubGlobal(
    "fetch",
    vi.fn(async () => new Response(JSON.stringify(daten), { status: 200 })),
  );
}

afterEach(async () => {
  await unmount();
  vi.unstubAllGlobals();
});

describe("AbgemeldetStreifen", () => {
  it("schweigt bei einer gueltigen Sitzung", async () => {
    // DER START-FALL: installierte App, angemeldet, mit Netz.
    antworteMit({ user: { name: "Ruben" }, expires: "2030-01-01T00:00:00.000Z" });
    await mount(<AbgemeldetStreifen />);
    expect(exists('[data-testid="zeichen-abgemeldet"]')).toBe(false);
  });

  it("meldet sich bei leerer Sitzung", async () => {
    // Der Fall, fuer den er gebaut ist: mit Netz auf der gecachten Flaeche
    // gelandet, weil der Redirect-Riegel des Workers den Login abgefangen hat.
    antworteMit({});
    await mount(<AbgemeldetStreifen />);
    expect(exists('[data-testid="zeichen-abgemeldet"]')).toBe(true);
    expect(query('[data-testid="zeichen-abgemeldet"]').textContent).toContain("abgemeldet");
  });

  it("schweigt, wenn die Antwort gar nicht ankommt", async () => {
    // OHNE NETZ WEISS ER ES NICHT — und dann sagt er nichts. Eine gescheiterte
    // Anfrage als „abgemeldet" zu lesen waere genau derselbe Fehler wie vorher,
    // nur mit einem anderen Messwert.
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    );
    await mount(<AbgemeldetStreifen />);
    expect(exists('[data-testid="zeichen-abgemeldet"]')).toBe(false);
  });

  it("schweigt, wenn der Server die Frage nicht beantwortet", async () => {
    // 500 heisst „unbekannt", nicht „abgemeldet".
    vi.stubGlobal("fetch", vi.fn(async () => new Response("kaputt", { status: 500 })));
    await mount(<AbgemeldetStreifen />);
    expect(exists('[data-testid="zeichen-abgemeldet"]')).toBe(false);
  });
});
