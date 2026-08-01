import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { starteAvArbeiterMock } = vi.hoisted(() => ({ starteAvArbeiterMock: vi.fn() }));
vi.mock("./av", () => ({ starteAvArbeiter: starteAvArbeiterMock }));

import { starteFilesHintergrund } from "./boot";

/**
 * DIE WACHE VOR DEM HINTERGRUNDSTART.
 *
 * Sie fehlte, und der Befund kam nicht aus einem Test, sondern aus einem
 * 75-Sekunden-Dev-Lauf mit leerem `SUITE_HOST_FILES` und ohne `FILES_`-Variablen:
 * 16 von 22 Logzeilen waren `console.error` — vier Zeilen „uebersprungen, die
 * Zahlen sind ungueltig: …" pro Runde und pro Takt, und der Rueckfall-Takt
 * wiederholt das alle 60 Sekunden ohne Ende. Kein `NODE_ENV`-Zweig davor, es
 * traefe also die Produktion, und zwar genau die Instanzen, auf denen `files`
 * (noch) keinen Host hat.
 *
 * Der Zustand ist NICHT hypothetisch: bis zum Cutover ist er der Normalfall.
 * `filesBootFehler()` bricht den Start nur ab, wenn ein Host GESETZT und die
 * Konfiguration trotzdem kaputt ist — ohne Host laeuft die Suite absichtlich
 * weiter, und dann darf das Modul nicht in eine Fehlerschleife laufen.
 */
const PFLICHT = {
  FILES_MAX_DATEI_BYTES: "524288000",
  FILES_AV_MAX_BYTES: "524288000",
  FILES_MAX_ABLAUF_TAGE: "7",
};

let ursprung: NodeJS.ProcessEnv;
let infoSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  ursprung = process.env;
  process.env = { ...process.env };
  for (const name of Object.keys(PFLICHT)) delete process.env[name];
  starteAvArbeiterMock.mockClear();
  infoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
});

afterEach(() => {
  process.env = ursprung;
  infoSpy.mockRestore();
});

describe("starteFilesHintergrund", () => {
  it("startet den AV-Arbeiter NICHT, wenn die Zahlen fehlen", () => {
    starteFilesHintergrund();
    expect(starteAvArbeiterMock).not.toHaveBeenCalled();
  });

  it("sagt EINMAL, warum es nichts tut — und zwar als Information, nicht als Fehler", () => {
    /*
     * `console.info` und nicht `console.error`: ein Modul ohne Host ist kein
     * Stoerfall, sondern der Zustand vor seinem Cutover. Eine Fehlerzeile dort
     * stumpft genau die Aufmerksamkeit ab, die spaeter eine echte braucht.
     */
    starteFilesHintergrund();
    expect(infoSpy).toHaveBeenCalledTimes(1);
    const meldung = String(infoSpy.mock.calls[0]?.[0]);
    expect(meldung).toContain("[files]");
    // Die Meldung muss den Grund NENNEN, sonst sucht der Betreiber im Falschen.
    expect(meldung).toContain("FILES_MAX_DATEI_BYTES");
  });

  it("startet ihn, sobald die Zahlen vollstaendig sind", () => {
    // Die Gegenprobe gehoert dazu: eine Wache, die IMMER haelt, waere derselbe
    // Fehler in die andere Richtung — die Warteschlange bliebe unbearbeitet,
    // jeder Upload stuende dauerhaft auf `scanning`, und kein Test wuerde rot.
    Object.assign(process.env, PFLICHT);
    starteFilesHintergrund();
    expect(starteAvArbeiterMock).toHaveBeenCalledTimes(1);
    expect(infoSpy).not.toHaveBeenCalled();
  });
});
