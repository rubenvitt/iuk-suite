/**
 * Die Fehlergrenze um die Verwaltung: Ein Kind, das beim Rendern wirft, lässt statt einer weißen
 * Seite einen Hinweis mit „Sitzung sperren“ stehen. Die Meldung des Fehlers erscheint nicht, denn
 * sie kann entschlüsselten Klartext zitieren (etwa „Kein gültiger Zeitpunkt: …“). Die
 * Einbettung in die App (Kopf und Erfassung bleiben bedienbar) prüft `App.test.tsx`.
 */
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";

import { clickElement, mount, queryAll, unmount } from "../../../../src/app/m/qr/_lib/test-dom";
import { Fehlergrenze } from "./Fehlergrenze";

const GEHEIM = "Lindenstraße 8, 2026-02-31";

function Kaputt(): never {
  throw new Error(`Kein gültiges Datum: ${GEHEIM}`);
}

const text = () => document.body.textContent ?? "";
const knopf = (name: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === name);

let konsole: MockInstance;

beforeEach(() => {
  // React meldet einen gefangenen Renderfehler zusätzlich auf der Konsole.
  konsole = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(async () => {
  await unmount();
  konsole.mockRestore();
});

describe("Fehlergrenze", () => {
  it("zeigt die Kinder, solange nichts wirft", async () => {
    await mount(
      <Fehlergrenze beiSperren={() => {}}>
        <p>Versiegelte Einsätze</p>
      </Fehlergrenze>,
    );
    expect(text()).toBe("Versiegelte Einsätze");
  });

  it("wirft ein Kind, steht ein Hinweis mit „Sitzung sperren“ da, ohne die Meldung", async () => {
    const beiSperren = vi.fn();
    await mount(
      <div>
        <header>Kopf</header>
        <Fehlergrenze beiSperren={beiSperren}>
          <Kaputt />
        </Fehlergrenze>
      </div>,
    );
    expect(text()).toContain("Kopf");
    const hinweis = queryAll('[role="alert"]')[0];
    expect(hinweis?.textContent).toBe("Diese Ansicht ließ sich nicht anzeigen. Sperr die Sitzung und melde dich neu an.");
    expect(text()).not.toContain(GEHEIM);
    await clickElement(knopf("Sitzung sperren")!);
    expect(beiSperren).toHaveBeenCalledTimes(1);
  });
});
