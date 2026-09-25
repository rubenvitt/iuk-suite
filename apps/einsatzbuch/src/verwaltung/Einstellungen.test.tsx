/**
 * Die Karte „Einstellungen“ der Verwaltung (Spec §4.5, §4.7; Stufe 6, Entscheidungen 3, 6 und
 * 12): Sicherungsstand samt „Ordner wählen“, „Aus Sicherung wiederherstellen“ und der
 * Autostart-Schalter. Den Status liest die Karte nie selbst: Sie meldet eine Änderung an die App
 * (`beiGeaendert`), die ihn über `laden()` mit Sequenznummer holt.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clickElement, mount, queryAll, rerender, unmount } from "../../../../src/app/m/qr/_lib/test-dom";
import type { Sicherungsstand } from "../typen";

const befehle = vi.hoisted(() => ({
  status: vi.fn(),
  sicherungsordnerWaehlen: vi.fn(),
  wiederherstellen: vi.fn(),
  autostartStatus: vi.fn(),
  autostartSetzen: vi.fn(),
}));
vi.mock("../befehle", () => ({ befehle }));

import { Einstellungen, type EinstellungenProps } from "./Einstellungen";

const ORDNER = "/Volumes/Sicherung/Einsatzbuch";
const OK: Sicherungsstand = { ordner: ORDNER, letzte: "2026-09-24T18:42:00+02:00", fehler: null, stufe: "ok" };
const OHNE_ORDNER: Sicherungsstand = { ordner: null, letzte: null, fehler: null, stufe: "gelb" };

function props(teil: Partial<EinstellungenProps> = {}): EinstellungenProps {
  return {
    betrieb: "echt",
    sicherung: OK,
    ketteLeer: false,
    mitSitzung: true,
    zeitzone: "Europe/Berlin",
    update: null,
    updateFehler: null,
    beiGeaendert: vi.fn(async () => {}),
    ...teil,
  };
}

async function warte(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
  }
}

const text = () => document.body.textContent ?? "";
const knopf = (name: string) => queryAll<HTMLButtonElement>("button").find((b) => b.textContent?.trim() === name);
const schalter = () => queryAll<HTMLInputElement>('input[role="switch"]')[0];

async function zeige(p: EinstellungenProps): Promise<void> {
  await mount(<Einstellungen {...p} />);
  await warte();
}

beforeEach(() => {
  for (const f of Object.values(befehle)) f.mockReset();
  befehle.autostartStatus.mockResolvedValue(true);
  befehle.autostartSetzen.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("Sicherung", () => {
  it("zeigt Stand und Ordner", async () => {
    await zeige(props());
    expect(queryAll("h2").map((h) => h.textContent)).toContain("Einstellungen");
    expect(text()).toContain("Letzte Sicherung: 24.09.2026, 18:42 Uhr");
    expect(text()).toContain(ORDNER);
  });

  it("gelb ohne Ordner, mit „Ordner wählen“", async () => {
    await zeige(props({ sicherung: OHNE_ORDNER }));
    expect(queryAll(".hinweis-info").map((h) => h.textContent)).toEqual(["Noch kein Sicherungsordner gewählt"]);
    expect(knopf("Ordner wählen")).toBeDefined();
  });

  it("gelb nach einem Fehlschlag: Hauptzeile und der Text aus Rust wörtlich", async () => {
    const fehler = "Im Sicherungsordner liegt eine längere Kette (3 Blöcke) als auf diesem Rechner (0). Nichts überschrieben.";
    await zeige(props({ sicherung: { ...OK, stufe: "gelb", fehler } }));
    expect(text()).toContain("Letzte Sicherung: 24.09.2026, 18:42 Uhr — Ordner nicht erreichbar");
    expect(text()).toContain(fehler);
  });

  it("rot ab 7 Tagen", async () => {
    await zeige(props({ sicherung: { ...OK, letzte: "2026-09-10T08:00:00+02:00", stufe: "rot" } }));
    expect(queryAll(".hinweis-warn").map((h) => h.textContent)).toEqual([
      "Letzte Sicherung: 10.09.2026, 08:00 Uhr" + "Seit 7 Tagen oder länger keine gelungene Sicherung.",
    ]);
  });

  it("„Ordner wählen“ ruft `sicherungsordnerWaehlen`, danach wird der Status neu gelesen", async () => {
    const p = props({ sicherung: OHNE_ORDNER });
    befehle.sicherungsordnerWaehlen.mockResolvedValue(ORDNER);
    await zeige(p);
    await clickElement(knopf("Ordner wählen")!);
    await warte();
    expect(befehle.sicherungsordnerWaehlen).toHaveBeenCalledTimes(1);
    expect(p.beiGeaendert).toHaveBeenCalledWith(false);
    expect(vi.mocked(p.beiGeaendert).mock.invocationCallOrder[0]).toBeGreaterThan(
      befehle.sicherungsordnerWaehlen.mock.invocationCallOrder[0],
    );
    // Den Status holt die App, nicht die Karte.
    expect(befehle.status).not.toHaveBeenCalled();
  });

  it("im Dialog abgebrochen: nichts neu zu lesen", async () => {
    const p = props();
    befehle.sicherungsordnerWaehlen.mockResolvedValue(null);
    await zeige(p);
    await clickElement(knopf("Ordner wählen")!);
    await warte();
    expect(p.beiGeaendert).not.toHaveBeenCalled();
  });

  it("zeigt einen Fehler beim Setzen des Ordners wörtlich", async () => {
    befehle.sicherungsordnerWaehlen.mockRejectedValue("Der Sicherungsordner muss ein vorhandenes Verzeichnis sein.");
    await zeige(props());
    await clickElement(knopf("Ordner wählen")!);
    await warte();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toEqual(["Der Sicherungsordner muss ein vorhandenes Verzeichnis sein."]);
  });

  it("im Testbetrieb: Sicherung aus, kein „Ordner wählen“", async () => {
    await zeige(props({ betrieb: "test", sicherung: { ordner: null, letzte: null, fehler: null, stufe: "aus" } }));
    expect(text()).toContain("Im Testbetrieb ist die automatische Sicherung aus.");
    expect(knopf("Ordner wählen")).toBeUndefined();
  });
});

describe("Aus Sicherung wiederherstellen", () => {
  it("erscheint nur im Echtbetrieb, bei leerer Kette und mit Sitzung", async () => {
    await zeige(props({ ketteLeer: true }));
    expect(knopf("Aus Sicherung wiederherstellen")).toBeDefined();
    for (const p of [props({ ketteLeer: false }), props({ ketteLeer: true, mitSitzung: false }), props({ ketteLeer: true, betrieb: "test" })]) {
      await rerender(<Einstellungen {...p} />);
      expect(knopf("Aus Sicherung wiederherstellen")).toBeUndefined();
    }
  });

  it("fragt erst nach; „Abbrechen“ stellt nichts wieder her", async () => {
    await zeige(props({ ketteLeer: true }));
    await clickElement(knopf("Aus Sicherung wiederherstellen")!);
    expect(queryAll('[role="dialog"] h2').map((h) => h.textContent)).toEqual(["Aus Sicherung wiederherstellen?"]);
    expect(befehle.wiederherstellen).not.toHaveBeenCalled();
    await clickElement(knopf("Abbrechen")!);
    expect(queryAll('[role="dialog"]')).toHaveLength(0);
    expect(befehle.wiederherstellen).not.toHaveBeenCalled();
  });

  it("nach der Bestätigung: „3 Blöcke wiederhergestellt“, Status und Verwaltung werden neu gelesen", async () => {
    const p = props({ ketteLeer: true });
    befehle.wiederherstellen.mockResolvedValue({ bloecke: 3 });
    await zeige(p);
    await clickElement(knopf("Aus Sicherung wiederherstellen")!);
    await clickElement(knopf("Datei wählen")!);
    await warte();
    expect(befehle.wiederherstellen).toHaveBeenCalledTimes(1);
    expect(p.beiGeaendert).toHaveBeenCalledWith(true);
    // Nach dem Neulesen ist die Kette nicht mehr leer; die Meldung bleibt trotzdem stehen.
    await rerender(<Einstellungen {...p} ketteLeer={false} />);
    expect(knopf("Aus Sicherung wiederherstellen")).toBeUndefined();
    expect(text()).toContain("3 Blöcke wiederhergestellt");
  });

  it("ein einzelner Block heißt „1 Block wiederhergestellt“", async () => {
    befehle.wiederherstellen.mockResolvedValue({ bloecke: 1 });
    await zeige(props({ ketteLeer: true }));
    await clickElement(knopf("Aus Sicherung wiederherstellen")!);
    await clickElement(knopf("Datei wählen")!);
    await warte();
    expect(text()).toContain("1 Block wiederhergestellt");
  });

  it("der Fehlertext aus Rust steht wörtlich da, nichts wird neu gelesen", async () => {
    const p = props({ ketteLeer: true });
    const meldung = "Die Sicherung endet bei Block 2, die Suite kennt die Kette bis Block 3. Diese Sicherung ist veraltet.";
    befehle.wiederherstellen.mockRejectedValue(meldung);
    await zeige(p);
    await clickElement(knopf("Aus Sicherung wiederherstellen")!);
    await clickElement(knopf("Datei wählen")!);
    await warte();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toEqual([meldung]);
    expect(p.beiGeaendert).not.toHaveBeenCalled();
  });

  it("im Dateidialog abgebrochen: keine Meldung", async () => {
    const p = props({ ketteLeer: true });
    befehle.wiederherstellen.mockResolvedValue(null);
    await zeige(p);
    await clickElement(knopf("Aus Sicherung wiederherstellen")!);
    await clickElement(knopf("Datei wählen")!);
    await warte();
    expect(text()).not.toContain("wiederhergestellt");
    expect(queryAll('[role="alert"]')).toHaveLength(0);
    expect(p.beiGeaendert).not.toHaveBeenCalled();
  });

  it("sperrt die Knöpfe, solange das Wiederherstellen läuft", async () => {
    let fertig: (w: { bloecke: number }) => void = () => {};
    befehle.wiederherstellen.mockReturnValue(new Promise((l) => (fertig = l)));
    await zeige(props({ ketteLeer: true }));
    await clickElement(knopf("Aus Sicherung wiederherstellen")!);
    await clickElement(knopf("Datei wählen")!);
    expect(knopf("Aus Sicherung wiederherstellen")?.disabled).toBe(true);
    expect(knopf("Ordner wählen")?.disabled).toBe(true);
    await act(async () => fertig({ bloecke: 2 }));
    await warte();
    expect(knopf("Ordner wählen")?.disabled).toBe(false);
  });
});

describe("Autostart", () => {
  it("nur im Echtbetrieb, mit dem Stand aus Rust", async () => {
    await zeige(props());
    expect(befehle.autostartStatus).toHaveBeenCalledTimes(1);
    expect(schalter()?.checked).toBe(true);
    expect(schalter()?.closest("label")?.textContent).toContain("Beim Anmelden am Rechner starten");
    await unmount();
    befehle.autostartStatus.mockClear();
    await zeige(props({ betrieb: "test", sicherung: { ordner: null, letzte: null, fehler: null, stufe: "aus" } }));
    expect(schalter()).toBeUndefined();
    expect(befehle.autostartStatus).not.toHaveBeenCalled();
  });

  it("schaltet über `autostartSetzen` und liest den Stand danach neu", async () => {
    await zeige(props());
    befehle.autostartStatus.mockResolvedValue(false);
    await clickElement(schalter()!);
    await warte();
    expect(befehle.autostartSetzen).toHaveBeenCalledWith(false);
    expect(befehle.autostartStatus).toHaveBeenCalledTimes(2);
    expect(schalter()?.checked).toBe(false);
  });

  it("zeigt einen Fehler aus Rust wörtlich und behält den alten Stand", async () => {
    await zeige(props());
    befehle.autostartSetzen.mockRejectedValue("Autostart ließ sich nicht umschalten: verweigert");
    await clickElement(schalter()!);
    await warte();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toEqual(["Autostart ließ sich nicht umschalten: verweigert"]);
    expect(schalter()?.checked).toBe(true);
  });
});

describe("Update", () => {
  const HINWEIS =
    "Update auf 0.2.0 ist vorgemerkt. Es wird installiert, sobald kein Einsatz aussteht, niemand angemeldet ist und 15 Minuten lang kein Entwurf geändert wurde.";
  const FEHLER = "Update auf 0.2.0 nicht installiert: Die Signatur des Updates passt nicht zum Schlüssel dieser App.";
  const NOCHMAL = "Die App versucht es in etwa 15 Minuten erneut.";

  it("ohne vorgemerktes Update und ohne Fehler kein Hinweis", async () => {
    await zeige(props());
    expect(text()).not.toContain("vorgemerkt");
    expect(text()).not.toContain("Update");
  });

  /** Ein gescheitertes Installieren verwirft die Vormerkung: Der Fehler steht dann allein da. */
  it("zeigt den letzten Fehler auch ohne Vormerkung", async () => {
    await zeige(props({ updateFehler: FEHLER }));
    expect(text()).toContain("Update");
    expect(text()).not.toContain("vorgemerkt");
    const hinweise = queryAll('[role="status"]').map((h) => h.textContent);
    expect(hinweise).toContain(FEHLER + NOCHMAL);
    expect(queryAll('[role="alert"]')).toEqual([]);
  });

  it("zeigt Vormerkung und Fehler nebeneinander", async () => {
    await zeige(props({ update: "0.2.0", updateFehler: "Suche nach Updates gescheitert: Der Update-Server war nicht erreichbar oder lieferte kein Update-Verzeichnis." }));
    const hinweise = queryAll('[role="status"]').map((h) => h.textContent);
    expect(hinweise).toContain(HINWEIS);
    expect(hinweise).toContain(
      "Suche nach Updates gescheitert: Der Update-Server war nicht erreichbar oder lieferte kein Update-Verzeichnis." + NOCHMAL,
    );
  });

  it("nennt die vorgemerkte Version und wann sie installiert wird", async () => {
    await zeige(props({ update: "0.2.0" }));
    expect(queryAll('[role="status"]').map((h) => h.textContent)).toContain(HINWEIS);
  });

  it("auch im Testbetrieb", async () => {
    await zeige(props({ betrieb: "test", sicherung: { ordner: null, letzte: null, fehler: null, stufe: "aus" }, update: "0.2.0" }));
    expect(text()).toContain(HINWEIS);
  });
});
