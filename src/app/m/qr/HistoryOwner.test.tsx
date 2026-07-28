// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("next-auth/react", () => ({ useSession: vi.fn() }));

import { unmount, mount, rerender } from "@/app/m/qr/_lib/test-dom";

/**
 * Die Naht zwischen der clientseitig geholten Sitzung und dem Verlaufs-Store.
 *
 * Sie ist der Ort, an dem „weiss ich noch nicht" in „anonym" umschlug: solange
 * `useSession()` laedt, ist `session?.user?.id ?? null` genau derselbe Wert wie
 * bei einem abgemeldeten Betrachter. Wer in dieser Luecke einen Schnellzugriff
 * antippte, bekam einen Eintrag mit `owner: null` — und die naechste Person am
 * geteilten Einsatz-Tablet sah ihn nach dem Logout weiter. `e2e/qr.spec.ts`
 * faellt darueber, aber nur, wenn die CI langsam genug ist; diese Tests
 * brauchen kein Timing.
 *
 * `vi.resetModules()` je Fall, weil der Eigentuemer-Zustand in `history.ts`
 * Modulzustand ist: einmal aufgeloest, bleibt er aufgeloest, und der erste Fall
 * hier braucht gerade den Zustand davor. Beide Module muessen deshalb frisch
 * importiert werden — und `useSession` mit, sonst haelt der Test einen anderen
 * Spion in der Hand als den, den `HistoryOwner` aufruft.
 */
async function frischesModul() {
  vi.resetModules();
  const { useSession } = await import("next-auth/react");
  const history = await import("@/app/m/qr/_lib/history");
  const { HistoryOwner } = await import("@/app/m/qr/HistoryOwner");
  return { useSession: vi.mocked(useSession), history, HistoryOwner };
}

type Modul = Awaited<ReturnType<typeof frischesModul>>;

/** Nur die zwei Felder, die `HistoryOwner` liest — der volle Session-Typ traegt
 *  `expires` und den Provider-Zuschnitt mit, die hier nichts entscheiden. */
function sitzung(m: Modul, s: unknown) {
  m.useSession.mockReturnValue(s as ReturnType<Modul["useSession"]>);
}

beforeEach(() => {
  localStorage.clear();
  delete window.__historyOwner;
});

afterEach(async () => {
  await unmount();
});

describe("HistoryOwner", () => {
  it("meldet gar nichts, solange die Sitzung laedt", async () => {
    const m = await frischesModul();
    sitzung(m, { data: null, status: "loading" });
    await mount(<m.HistoryOwner />);

    // Kein Eigentuemer gemeldet heisst: `history.ts` haelt zurueck. Der Beleg
    // ist der Store selbst, nicht ein Spion auf `setHistoryOwner` — der zeigte
    // nur, dass nicht gerufen wurde, nicht, dass es die richtige Wirkung hat.
    m.history.recordEntry("Waehrend des Ladens getippt", { kind: "url", value: "https://a" });
    expect(m.history.loadHistory()).toEqual([]);
    expect("__historyOwner" in window).toBe(false);
  });

  it("zieht den waehrend des Ladens getippten Eintrag dem Angemeldeten zu", async () => {
    const m = await frischesModul();
    sitzung(m, { data: null, status: "loading" });
    await mount(<m.HistoryOwner />);
    m.history.recordEntry("WLAN Wache 3", { kind: "url", value: "https://a" });

    // Dieselbe Instanz, nur mit aufgeloester Sitzung — genau der Uebergang, den
    // `useSession()` im Browser durchlaeuft.
    sitzung(m, { data: { user: { id: "u1" } }, status: "authenticated" });
    await rerender(<m.HistoryOwner />);

    expect(m.history.loadHistory().map((e) => e.label)).toEqual(["WLAN Wache 3"]);
    expect(window.__historyOwner).toBe("u1");

    // Und nach dem Logout ist er weg — die Zusage, um die es ueberhaupt geht.
    sitzung(m, { data: null, status: "unauthenticated" });
    await rerender(<m.HistoryOwner />);
    expect(m.history.loadHistory()).toEqual([]);
  });

  it("meldet den abgemeldeten Betrachter als anonym", async () => {
    const m = await frischesModul();
    sitzung(m, { data: null, status: "unauthenticated" });
    await mount(<m.HistoryOwner />);

    expect(window.__historyOwner).toBeNull();
    m.history.recordEntry("Anonym getippt", { kind: "url", value: "https://a" });
    expect(m.history.loadHistory().map((e) => e.label)).toEqual(["Anonym getippt"]);
  });
});
