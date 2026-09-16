// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { ReactNode } from "react";

/**
 * DIE EINRAEUMFLAECHE — DRK-381.
 *
 * ⚠️ WAS HIER HAENGT, IST DER RIEGEL UND DIE DREI ZUSTAENDE, NICHT DAS
 * AUSSEHEN. Der Riegel steht an dieser Datei EINZELN, obwohl
 * `auffuellen/layout.tsx` ihn ebenfalls traegt: eine Route-Group-Grenze ist
 * keine Sicherheitsgrenze (Falle 17), und ein Layout kann einer Seite keine
 * Props reichen. Die tragende Zusage ist ohnehin der Riegel der ACTION —
 * `_actions/entnahmebox.test.ts` prueft sie dort.
 *
 * ⚠️ EIN KAERTCHEN KOMMT AUF DIESER STRECKE NICHT VOR. `requireHelferSitzung`
 * wird gar nicht erst gemockt: taucht es je in dieser Datei auf, bricht der
 * Import mit einem unaufgeloesten Modulzugriff, statt still eine zweite Tuer
 * zu oeffnen. Dieselbe Bauform wie in `auffuellen/page.test.tsx`.
 */
const { riegel } = vi.hoisted(() => ({ riegel: vi.fn<() => Promise<unknown>>() }));

vi.mock("../../_lib/zugang", () => ({ requireLagerbuchAdmin: () => riegel() }));

vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

vi.mock("../../_db/client", () => ({ getDb: () => ({ marke: "test-db" }) }));

const box = vi.fn<() => unknown>(() => ({ id: "entnahmebox", name: "Entnahmebox", aktiv: true }));
const inhalt = vi.fn<() => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/entnahmebox", () => ({
  boxOrt: () => box(),
  /*
   * ⚠️ `einraeumPosten`, NICHT `boxInhalt`. Die Attrappe traegt den anderen
   * Namen, und das ist die Stelle, an der ein Rueckfall auf den schlanken
   * Lesepfad auffaellt: der Import liefe sonst ins Leere. Ohne `fach` und
   * `artikelAktiv` fehlten der Insel genau die beiden Angaben, an denen sich
   * entscheidet, wohin ein Posten gehoert und ob er ueberhaupt zurueck soll.
   */
  einraeumPosten: () => inhalt(),
}));

const ziele = vi.fn(() => [{ id: "handlager", name: "Handlager (ohne Schrank)", zugangshinweis: null }]);
vi.mock("../../_lib/lesepfade/orte", () => ({ zugangsZiele: () => ziele() }));

vi.mock("../../_actions/entnahmebox", () => ({ raeumeAusEntnahmebox: vi.fn() }));

vi.mock("../../_ui/AuffuellRahmen", () => ({
  AuffuellRahmen: (p: { etikett: string; children: ReactNode }) => (
    <div data-rolle="rahmen" data-etikett={p.etikett}>{p.children}</div>
  ),
}));
vi.mock("../../_ui/BoxEinraeumen", () => ({
  BoxEinraeumen: (p: { boxName: string; posten: unknown[]; ziele: unknown[] }) => (
    <div
      data-rolle="insel"
      data-box={p.boxName}
      data-posten={String(p.posten.length)}
      data-ziele={String(p.ziele.length)}
    />
  ),
}));

import EinraeumenSeite, { dynamic as seiteDynamic } from "./page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";

const VIEWER = { sub: "u-gf", groups: ["lagerbuch_nutzer"], name: "G. Führer", email: null };

const POSTEN = [{ artikelId: "art-1", artikelName: "Kühlkompresse", fach: "A-01", artikelAktiv: true }];

beforeEach(() => {
  riegel.mockResolvedValue(VIEWER);
  box.mockReturnValue({ id: "entnahmebox", name: "Entnahmebox", aktiv: true });
  inhalt.mockReturnValue([]);
});
afterEach(async () => { await unmount(); vi.clearAllMocks(); });

describe("auffuellen/box — der Riegel", () => {
  it("ruft `requireLagerbuchAdmin` SELBST", async () => {
    await EinraeumenSeite();
    expect(riegel).toHaveBeenCalledTimes(1);
  });

  it("ohne Sitzung kommt die Seite nicht durch", async () => {
    riegel.mockRejectedValue(new Error("NEXT_REDIRECT:/login"));
    await expect(EinraeumenSeite()).rejects.toThrow("NEXT_REDIRECT:/login");
  });

  it("angemeldet OHNE die Lagerbuch-Gruppe endet in 404 — und liest nichts", async () => {
    riegel.mockRejectedValue(new Error("NEXT_NOT_FOUND"));
    await expect(EinraeumenSeite()).rejects.toThrow("NEXT_NOT_FOUND");
    expect(box).not.toHaveBeenCalled();
    expect(inhalt).not.toHaveBeenCalled();
  });

  it("ist dynamisch — eine zwischengespeicherte Ansicht waere eine ohne Riegel", () => {
    expect(seiteDynamic).toBe("force-dynamic");
  });
});

describe("auffuellen/box — drei Zustaende, drei Auskuenfte", () => {
  it("sagt „es gibt sie nicht“, wenn die Kiste fehlt", async () => {
    /*
     * ⚠️ NICHT DASSELBE WIE „LEER". Migration 0012 legt die Zeile an; `null`
     * heisst hier „jemand hat sie geloescht oder umbenannt". Mit einer leeren
     * Liste zu antworten hiesse zu behaupten, die Kiste sei leer.
     */
    box.mockReturnValue(null);
    await mount(await EinraeumenSeite());
    expect(query("[data-rolle='leer-titel']").textContent).toContain("Keine Entnahmebox");
    expect(exists("[data-rolle='insel']")).toBe(false);
  });

  it("sagt „leer“, wenn nichts drin liegt — mit dem NAMEN aus der Datenbank", async () => {
    // Der Name kommt aus `lagerorte.name`, nicht aus der Konstante: die Zeile
    // ist eine gewoehnliche und damit umbenennbar.
    box.mockReturnValue({ id: "entnahmebox", name: "Kiste Halle", aktiv: true });
    await mount(await EinraeumenSeite());
    expect(query("[data-rolle='leer-titel']").textContent).toBe("Kiste Halle ist leer");
    expect(exists("[data-rolle='insel']")).toBe(false);
  });

  it("zeigt die Insel, sobald etwas drin liegt", async () => {
    inhalt.mockReturnValue(POSTEN);
    await mount(await EinraeumenSeite());
    expect(query("[data-rolle='insel']").dataset.posten).toBe("1");
    expect(query("[data-rolle='insel']").dataset.ziele).toBe("1");
  });

  it("raeumt auch eine STILLGELEGTE Kiste aus", async () => {
    /*
     * ⚠️ DIE GEGENRICHTUNG SPERRT HIER, DIESE NICHT. Eine stillgelegte Kiste
     * nimmt nichts mehr AUF — `helfer/box` zeigt deshalb einen Leerzustand.
     * Sie auszuraeumen muss gerade dann gehen, sonst strandet alles, was beim
     * Stilllegen darin lag. Die Action prueft `aktiv` aus demselben Grund
     * nicht.
     */
    box.mockReturnValue({ id: "entnahmebox", name: "Entnahmebox", aktiv: false });
    inhalt.mockReturnValue(POSTEN);
    await mount(await EinraeumenSeite());
    expect(query("[data-rolle='insel']").dataset.posten).toBe("1");
  });
});

describe("auffuellen/box — was die Seite weiterreicht", () => {
  it("traegt das Etikett der angemeldeten Person, nicht ein Kaertchen-Label", async () => {
    inhalt.mockReturnValue(POSTEN);
    await mount(await EinraeumenSeite());
    expect(query("[data-rolle='rahmen']").dataset.etikett).toBe("Angemeldet: G. Führer");
  });

  it("loest die Ziele bei JEDEM Aufruf neu auf", async () => {
    // Die Verwaltung kann in der Zwischenzeit einen Schrank stilllegen; die
    // Action prueft dieselbe Liste noch einmal. Die Seite zeigt damit nichts
    // an, was die Buchung danach verwirft.
    inhalt.mockReturnValue(POSTEN);
    await mount(await EinraeumenSeite());
    expect(ziele).toHaveBeenCalledTimes(1);
  });

  it("laedt die Ziele NICHT, wenn es nichts einzuraeumen gibt", async () => {
    // Kein Payload fuer eine Auswahl, die auf keinem Schirm steht.
    await mount(await EinraeumenSeite());
    expect(ziele).not.toHaveBeenCalled();
  });
});
