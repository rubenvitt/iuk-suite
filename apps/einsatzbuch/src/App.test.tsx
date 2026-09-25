import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { versiegele } from "@kern/block";
import { zuBase64 } from "@kern/bytes";
import type { Block } from "@kern/format";
import { beispielEinsatz, GENESIS, kopf as blockkopf } from "@kern/testhilfe";
import { erzeugeSchluesselpaar, schluesselIdVon } from "@kern/umschlag";

import { clickElement, fill, mount, queryAll, unmount } from "../../../src/app/m/qr/_lib/test-dom";
import type { Ausstehend, Entwurf, Schluesselposten, Stammdatenpaket, Status, Versiegelung } from "./typen";
import { BLOECKE, CEKS } from "./verwaltung/testvektoren";

const befehle = vi.hoisted(() => ({
  status: vi.fn(),
  stammdaten: vi.fn(),
  entwurfSpeichern: vi.fn(),
  entwurfVerwerfen: vi.fn(),
  absenden: vi.fn(),
  jetztVersiegeln: vi.fn(),
  fristPruefen: vi.fn(),
  versiegelungQuittieren: vi.fn(),
  testbetriebBeenden: vi.fn(),
  entwicklungEinrichten: vi.fn(),
  einrichten: vi.fn(),
  anmelden: vi.fn(),
  neuEinrichten: vi.fn(),
  anmeldungAbbrechen: vi.fn(),
  abmelden: vi.fn(),
  bloecke: vi.fn(),
  schluesselFreigeben: vi.fn(),
  ankerAbgleichen: vi.fn(),
  stammdatenAbgleichen: vi.fn(),
  exportSpeichern: vi.fn(),
  drucken: vi.fn(),
  readerOeffnen: vi.fn(),
  sicherungsordnerWaehlen: vi.fn(),
  wiederherstellen: vi.fn(),
  autostartStatus: vi.fn(),
  autostartSetzen: vi.fn(),
}));
vi.mock("./befehle", () => ({ befehle }));
vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

import { App } from "./App";
import { Willkommen } from "./seiten/Willkommen";

const BAND = "TESTBETRIEB — nichts hiervon ist ein echter Einsatz";
const VERFALLEN =
  "Deine letzten Änderungen wurden nicht übernommen — die Frist war abgelaufen. Versiegelt ist der zuletzt abgesendete Stand.";

function status(teil: Partial<Status> = {}): Status {
  return {
    betrieb: "echt",
    eingerichtet: true,
    entwicklung: false,
    startfehler: null,
    bereitschaft: "DRK-Bereitschaft Uelzen",
    zeitzone: "Europe/Berlin",
    fristMinuten: 15,
    besatzung: false,
    jetzt: "2026-09-24T10:00:00+02:00",
    jetztMs: Date.now(),
    entwurf: null,
    ausstehend: null,
    kette: { anzahl: 3, letzter: { block: 3, hash: "c".repeat(64) } },
    versiegelung: null,
    suiteUrl: "https://einsatzbuch.iuk-ue.de",
    suiteVorgabe: "https://einsatzbuch.iuk-ue.de",
    rechnerName: "Einsatzleitwagen 1",
    eingerichtetAm: "2026-09-01T09:00:00+02:00",
    eingerichtetVon: "Ruben Vitt",
    schluesselId: "s1",
    stammdatenVom: "2026-09-25T10:00:00+02:00",
    ankerBestaetigtBis: 3,
    ankerAbweichung: null,
    anker: null,
    sicherung: null,
    widerrufen: false,
    sitzung: null,
    anmeldungLaeuft: false,
    ...teil,
  };
}

function entwurf(teil: Partial<Entwurf> = {}): Entwurf {
  return {
    stichwort: "RD 1",
    beginnDatum: "2026-09-24",
    beginnZeit: "10:00",
    endeDatum: "",
    endeZeit: "",
    strasse: "Lindenstraße 8",
    ort: "29525 Uelzen",
    objekt: "",
    fahrzeuge: ["11-83-1"],
    personal: [],
    vorOrt: 1,
    transport: 0,
    notizen: "",
    ...teil,
  };
}

function ausstehend(e: Entwurf = entwurf(), fristBisMs = Date.now() + 10 * 60_000): Ausstehend {
  return { entwurf: e, abgesendetAm: "2026-09-24T10:05:00+02:00", fristBis: "2026-09-24T10:20:00+02:00", fristBisMs };
}

function versiegelung(teil: Partial<Versiegelung> = {}): Versiegelung {
  return {
    block: 4,
    hash: "abcdef0123456789".repeat(4),
    prev: "c".repeat(64),
    versiegelt: "2026-09-24T10:20:00+02:00",
    nummer: "T-2026-004",
    verfallen: false,
    ...teil,
  };
}

const PAKET: Stammdatenpaket = {
  version: 1,
  stammdaten: {
    fahrzeuge: [{ id: "11-83-1", typ: "RTW", kennung: "11-83-1", ruf: "Rotkreuz Uelzen 11-83-1", standort: "Uelzen" }],
    personal: [{ id: "p1", name: "Albers, Jana", quali: "RS", ov: "Uelzen" }],
    stichworte: [{ name: "Rettungsdienst", items: ["RD 1", "RD 2"] }],
  },
  fristMinuten: 15,
  besatzung: false,
  zeitzone: "Europe/Berlin",
  bereitschaft: "DRK-Bereitschaft Uelzen",
};

/** Lässt die Promise-Ketten der Befehlsnaht (Status → Stammdaten → setState) auslaufen. */
async function warte(): Promise<void> {
  for (let i = 0; i < 5; i++) {
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
  }
}

function text(): string {
  return document.body.textContent ?? "";
}

/** Knopf nach seinem zugänglichen Namen: `aria-label`, sonst der sichtbare Text. */
function knopf(name: string): HTMLButtonElement | undefined {
  return queryAll<HTMLButtonElement>("button").find((b) => (b.getAttribute("aria-label") ?? b.textContent ?? "").trim() === name);
}

/** Eingabefeld über das umschließende `<label>` — so, wie `getByLabel` es findet. */
function feld(label: string): HTMLInputElement | undefined {
  const l = queryAll<HTMLLabelElement>("label").find((x) => (x.textContent ?? "").trim() === label);
  return l?.querySelector("input") ?? undefined;
}

function band(): HTMLElement | undefined {
  return queryAll('[role="status"]').find((el) => (el.textContent ?? "").trim() === BAND);
}

async function starte(s: Status): Promise<void> {
  befehle.status.mockResolvedValue(s);
  await mount(<App />);
  await warte();
}

beforeEach(() => {
  for (const f of Object.values(befehle)) f.mockReset();
  befehle.stammdaten.mockResolvedValue(PAKET);
  befehle.entwurfSpeichern.mockResolvedValue(undefined);
  befehle.entwurfVerwerfen.mockResolvedValue(undefined);
  befehle.fristPruefen.mockResolvedValue(null);
  befehle.versiegelungQuittieren.mockResolvedValue(undefined);
  befehle.abmelden.mockResolvedValue(undefined);
  befehle.bloecke.mockResolvedValue(BLOECKE);
  befehle.schluesselFreigeben.mockResolvedValue(CEKS);
  befehle.autostartStatus.mockResolvedValue(true);
  befehle.autostartSetzen.mockResolvedValue(undefined);
  befehle.ankerAbgleichen.mockResolvedValue({
    bestaetigtBis: 3, hash: BLOECKE[2].hash, gemeldetAm: "2026-09-25T10:00:00+02:00", abweichung: null, offline: false, widerrufen: false,
  });
});

afterEach(async () => {
  await unmount();
});

describe("Testband", () => {
  it("steht im Testbetrieb über der Startseite, mit „Testbetrieb beenden“ im Fuß", async () => {
    await starte(status({ betrieb: "test" }));
    expect(band()).toBeDefined();
    expect(knopf("Einsatz öffnen")).toBeDefined();
    expect(knopf("Testbetrieb beenden")).toBeDefined();
    expect(text()).toContain("DRK-Bereitschaft Uelzen");
  });

  it("fehlt im echten Betrieb, samt „Testbetrieb beenden“", async () => {
    await starte(status({ betrieb: "echt" }));
    expect(knopf("Einsatz öffnen")).toBeDefined();
    expect(band()).toBeUndefined();
    expect(knopf("Testbetrieb beenden")).toBeUndefined();
  });

  it("„Testbetrieb beenden“ fragt erst nach und steht danach bei „nicht eingerichtet“", async () => {
    await starte(status({ betrieb: "test" }));
    await clickElement(knopf("Testbetrieb beenden")!);
    const dialog = queryAll('[role="dialog"]')[0];
    expect(dialog?.textContent).toContain(
      "Die lokale Testdatenbank mit allen Testeinsätzen wird gelöscht. Das lässt sich nicht rückgängig machen.",
    );
    expect(befehle.testbetriebBeenden).not.toHaveBeenCalled();

    befehle.testbetriebBeenden.mockResolvedValue(undefined);
    befehle.status.mockResolvedValue(status({ betrieb: null, eingerichtet: false }));
    await clickElement(knopf("Testdatenbank löschen")!);
    await warte();
    expect(befehle.testbetriebBeenden).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Diesen Rechner einrichten");
    expect(queryAll('[role="dialog"]')).toHaveLength(0);
  });
});

describe("Einrichtungsfrage", () => {
  it("zeigt ohne Entwicklungs-Build keinen Entwicklerweg", async () => {
    await starte(status({ betrieb: null, eingerichtet: false, entwicklung: false }));
    expect(text()).toContain("Diesen Rechner einrichten");
    expect(text()).not.toContain("Entwickler-Einrichtung");
    expect(knopf("Mit Testvektor-Schlüssel einrichten")).toBeUndefined();
    expect(knopf("Schlüssel aus Datei …")).toBeUndefined();
    expect(befehle.stammdaten).not.toHaveBeenCalled();
  });

  it("die Suite-Adresse ist bei „Echter Einsatzbuch-Rechner“ schreibgeschützt und bei „Testrechner“ änderbar", async () => {
    await starte(status({ betrieb: null, eingerichtet: false }));
    expect(feld("Suite-Adresse")?.readOnly).toBe(true);
    expect(feld("Suite-Adresse")?.value).toBe("https://einsatzbuch.iuk-ue.de");

    const testKarte = queryAll<HTMLLabelElement>("label.radiokarte").find((l) => l.textContent?.includes("Testrechner"));
    await clickElement(testKarte!.querySelector("input")!);
    expect(feld("Suite-Adresse")?.readOnly).toBe(false);
  });

  it("sendet einrichten mit Art, Name und URL", async () => {
    await starte(status({ betrieb: null, eingerichtet: false }));
    befehle.einrichten.mockReturnValue(new Promise(() => {}));
    await fill('input[placeholder="z. B. Einsatzleitwagen 1"]', "Einsatzleitwagen 1");
    await clickElement(knopf("Mit Pocket ID anmelden und einrichten")!);
    expect(befehle.einrichten).toHaveBeenCalledWith({ art: "echt", name: "Einsatzleitwagen 1", suiteUrl: "https://einsatzbuch.iuk-ue.de" });
  });

  it("zeigt im Entwicklungs-Build die Entwickler-Einrichtung mit Frist 15", async () => {
    await starte(status({ betrieb: null, eingerichtet: false, entwicklung: true }));
    expect(text()).toContain("Entwickler-Einrichtung (nur Debug-Build)");
    expect(knopf("Mit Testvektor-Schlüssel einrichten")).toBeDefined();
    expect(knopf("Schlüssel aus Datei …")).toBeDefined();
    expect(feld("Frist in Minuten")?.value).toBe("15");
  });
});

describe("Kopf: Verwaltung · Anmelden", () => {
  it("fehlt ohne Einrichtung", async () => {
    await starte(status({ eingerichtet: false, betrieb: null }));
    expect(knopf("Verwaltung · Anmelden")).toBeUndefined();
  });

  it("steht eingerichtet und ohne Sitzung", async () => {
    await starte(status({ ausstehend: ausstehend() }));
    expect(knopf("Verwaltung · Anmelden")).toBeDefined();
  });

  it("weicht mit Sitzung dem Namen und „Sitzung sperren“", async () => {
    await starte(status({ ausstehend: ausstehend(), sitzung: { name: "Ruben Vitt", ablaufMs: Date.now() + 3_600_000 } }));
    expect(knopf("Verwaltung · Anmelden")).toBeUndefined();
    expect(text()).toContain("Ruben Vitt");
    expect(knopf("Sitzung sperren")).toBeDefined();
  });
});

describe("Willkommen: Verwaltung · Anmelden im Fuß (Vorlage: Ansicht `istStart`, Knopf `zumLogin`)", () => {
  it("ist auf der reinen Startseite sichtbar, eingerichtet und ohne Sitzung; ein Klick zeigt die Anmeldekarte", async () => {
    await starte(status());
    const knopfEl = knopf("Verwaltung · Anmelden");
    expect(knopfEl).toBeDefined();
    await clickElement(knopfEl!);
    expect(text()).toContain("Anmelden, um Einsätze zu lesen");
  });

  it("fehlt ohne Einrichtung", async () => {
    await mount(
      <Willkommen
        bereitschaft={null}
        test={false}
        eingerichtet={false}
        sitzung={null}
        beiOeffnen={() => {}}
        beiTestEnde={() => {}}
        beiAnmeldenKlick={() => {}}
        beiVerwaltungKlick={() => {}}
      />,
    );
    expect(knopf("Verwaltung · Anmelden")).toBeUndefined();
  });

  it("mit Sitzung: kein Anmelden-Knopf, sondern der Name als Weg zur Verwaltung", async () => {
    await starte(status({ sitzung: { name: "Ruben Vitt", ablaufMs: Date.now() + 3_600_000 } }));
    expect(knopf("Verwaltung · Anmelden")).toBeUndefined();
    expect(text()).toContain("Ruben Vitt");
  });
});

describe("Anmeldung der Verwaltung", () => {
  it("zeigt die Anmeldekarte, meldet mit Pocket ID an und zeigt währenddessen den Wartetext; Abbrechen ruft anmeldung_abbrechen", async () => {
    await starte(status({ ausstehend: ausstehend() }));
    await clickElement(knopf("Verwaltung · Anmelden")!);
    expect(text()).toContain("Anmelden, um Einsätze zu lesen");

    befehle.anmelden.mockReturnValue(new Promise(() => {}));
    await clickElement(knopf("Mit Pocket ID anmelden")!);
    await warte();
    expect(befehle.anmelden).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Anmeldung läuft — der Browser ist geöffnet. Melde dich dort an; danach geht es hier weiter.");

    await clickElement(knopf("Abbrechen")!);
    expect(befehle.anmeldungAbbrechen).toHaveBeenCalledTimes(1);
  });

  it("„Zurück zur Erfassung“ verlässt die Anmeldekarte wieder", async () => {
    await starte(status({ ausstehend: ausstehend() }));
    await clickElement(knopf("Verwaltung · Anmelden")!);
    await clickElement(knopf("Zurück zur Erfassung")!);
    expect(text()).toContain("Abgesendet · noch änderbar");
  });
});

describe("Widerruf", () => {
  it("zeigt „Rechner muss neu eingerichtet werden.“ mit „Neu einrichten“ bei echt", async () => {
    await starte(status({ widerrufen: true }));
    expect(text()).toContain("Rechner muss neu eingerichtet werden.");
    expect(knopf("Neu einrichten")).toBeDefined();
    expect(knopf("Testbetrieb beenden und neu einrichten")).toBeUndefined();
  });

  it("zeigt „Testbetrieb beenden und neu einrichten“ bei test", async () => {
    await starte(status({ widerrufen: true, betrieb: "test" }));
    expect(knopf("Testbetrieb beenden und neu einrichten")).toBeDefined();
    expect(knopf("Neu einrichten")).toBeUndefined();
  });
});

const SITZUNG = { name: "Ruben Vitt", ablaufMs: Date.now() + 3_600_000 };
const GESPERRT = "Sitzung gesperrt. Die Einsätze liegen nur noch verschlüsselt vor.";

/** Von der Startseite über die Anmeldekarte in die Verwaltung. */
async function meldeAnUndOeffneVerwaltung(s: Status = status()): Promise<void> {
  await starte(s);
  await clickElement(knopf("Verwaltung · Anmelden")!);
  befehle.anmelden.mockResolvedValue(SITZUNG);
  befehle.status.mockResolvedValue({ ...s, sitzung: SITZUNG });
  await clickElement(knopf("Mit Pocket ID anmelden")!);
  await warte();
  await warte();
}

describe("Verwaltung", () => {
  it("erscheint nach `anmelden` mit Kette, Detail des neuesten Einsatzes, Kennzahlen und Verteilung", async () => {
    await meldeAnUndOeffneVerwaltung();
    expect(queryAll("h1").map((h) => h.textContent)).toContain("Versiegelte Einsätze");
    expect(befehle.bloecke).toHaveBeenCalled();
    expect(befehle.schluesselFreigeben).toHaveBeenCalledTimes(1);
    // Kettenliste: drei Blöcke, neueste oben; das Detail zeigt Block 3.
    const zeilen = queryAll<HTMLButtonElement>("button[data-block]");
    expect(zeilen.map((z) => z.dataset.block)).toEqual(["3", "2", "1"]);
    expect(zeilen[0].getAttribute("aria-pressed")).toBe("true");
    expect(queryAll('section[aria-label="Block 3"] h2').map((h) => h.textContent)).toEqual(["MANV 10"]);
    expect(text()).toContain("Sitzung von Ruben Vitt, endet");
    expect(text()).toContain("Nur auf diesem Rechner");
    expect(text()).toContain("Einsätze versiegelt");
    expect(text()).toContain("Alarmstichworte");
    expect(text()).toContain("Block 0 · Anfang der Kette · angelegt am 1.9.2026 von Ruben Vitt");
    expect(text()).toContain("Stammdaten vom 25.9.2026, 10:00");
    expect(text()).toContain("Anker bestätigt bis Block 3");
    expect(text()).toContain("Kette intakt");
    expect(knopf("Herunterladen")?.disabled).toBe(false);
  });

  it("wählt ein Einsatz per Klick in der Kette", async () => {
    await meldeAnUndOeffneVerwaltung();
    await clickElement(queryAll<HTMLButtonElement>('button[data-block="1"]')[0]);
    expect(queryAll('section[aria-label="Block 1"] h2').map((h) => h.textContent)).toEqual(["RD 2"]);
  });

  it("„Sitzung sperren“ ruft `abmelden`, der Stichworttext ist aus dem DOM verschwunden", async () => {
    await meldeAnUndOeffneVerwaltung();
    expect(text()).toContain("MANV 10");
    befehle.abmelden.mockResolvedValue(undefined);
    befehle.status.mockResolvedValue(status());
    await clickElement(knopf("Sitzung sperren")!);
    await warte();
    expect(befehle.abmelden).toHaveBeenCalledTimes(1);
    for (const e of ["MANV 10", "RD 2", "SanD", "2026-043", "Lindenstraße 8"]) expect(text()).not.toContain(e);
    expect(text()).toContain(GESPERRT);
    await clickElement(knopf("Entsperren")!);
    expect(text()).toContain("Anmelden, um Einsätze zu lesen");
  });

  it("hält Rust nach „Kette prüfen“ keine Sitzung mehr, gilt die Verwaltung als gesperrt", async () => {
    await meldeAnUndOeffneVerwaltung();
    befehle.status.mockResolvedValue(status());
    await clickElement(knopf("Kette prüfen")!);
    await warte();
    expect(text()).not.toContain("MANV 10");
    expect(text()).toContain(GESPERRT);
  });

  it("sperrt aus der Verwaltung zur laufenden Frist, ohne den Startseiten-Hinweis vorzumerken", async () => {
    const s = status({ ausstehend: ausstehend() });
    await meldeAnUndOeffneVerwaltung(s);
    expect(text()).toContain("MANV 10");
    befehle.status.mockResolvedValue(s);
    await clickElement(knopf("Sitzung sperren")!);
    await warte();
    expect(text()).toContain("Abgesendet · noch änderbar");
    expect(text()).not.toContain("MANV 10");
    befehle.jetztVersiegeln.mockResolvedValue(versiegelung());
    befehle.status.mockResolvedValue(status({ versiegelung: versiegelung() }));
    await clickElement(knopf("Jetzt versiegeln")!);
    await warte();
    befehle.status.mockResolvedValue(status());
    await clickElement(knopf("Neuen Einsatz erfassen")!);
    await warte();
    expect(text()).not.toContain(GESPERRT);
  });

  it("zeigt einen Freigabe-Fehler aus Rust wörtlich, die Blöcke nur als Chiffre", async () => {
    befehle.schluesselFreigeben.mockRejectedValue("Lesen braucht Verbindung zur Suite.");
    await meldeAnUndOeffneVerwaltung();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain("Lesen braucht Verbindung zur Suite.");
    const zeilen = queryAll<HTMLButtonElement>("button[data-block]");
    expect(zeilen.map((z) => z.getAttribute("aria-label"))).toEqual(["Block 3, verschlüsselt", "Block 2, verschlüsselt", "Block 1, verschlüsselt"]);
    expect(text()).not.toContain("MANV 10");
  });

  it("ohne Freigabe ist „Herunterladen“ gesperrt", async () => {
    befehle.schluesselFreigeben.mockRejectedValue("Lesen braucht Verbindung zur Suite.");
    await meldeAnUndOeffneVerwaltung();
    expect(knopf("Herunterladen")?.disabled).toBe(true);
  });

  it("ohne Freigabe meldet ein Klick auf eine Zeile keinen kaputten Block", async () => {
    befehle.schluesselFreigeben.mockRejectedValue("Lesen braucht Verbindung zur Suite.");
    await meldeAnUndOeffneVerwaltung();
    await clickElement(queryAll<HTMLButtonElement>('button[data-block="2"]')[0]);
    expect(text()).not.toContain("lässt sich nicht öffnen");
    expect(text()).toContain("Die Einsätze liegen nur verschlüsselt vor");
  });

  it("zeigt eine 422-Meldung der Suite mit beiden IDs wörtlich als Warnung", async () => {
    const meldung = "Der Schlüssel 8cedd95d94246a4d passt nicht zum Rechner (erwartet 1a2b3c4d5e6f7a8b).";
    befehle.schluesselFreigeben.mockRejectedValue(meldung);
    await meldeAnUndOeffneVerwaltung();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain(meldung);
  });

  it("„Kette prüfen“ prüft lokal und gegen den Anker, getrennt angezeigt", async () => {
    befehle.ankerAbgleichen.mockResolvedValue({
      bestaetigtBis: 2, hash: "b".repeat(64), gemeldetAm: "2026-09-25T10:00:00+02:00", abweichung: null, offline: false, widerrufen: false,
    });
    await meldeAnUndOeffneVerwaltung(status({ ankerBestaetigtBis: 1 }));
    expect(text()).toContain("Anker bestätigt bis Block 1");
    await clickElement(knopf("Kette prüfen")!);
    await warte();
    expect(befehle.ankerAbgleichen).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Kette intakt");
    expect(text()).toContain("Anker bestätigt bis Block 2");
  });

  it("„Kette prüfen“ ohne Suite: lokal intakt, Anker nicht geprüft", async () => {
    befehle.ankerAbgleichen.mockResolvedValue({ bestaetigtBis: 3, hash: null, gemeldetAm: null, abweichung: null, offline: true, widerrufen: false });
    await meldeAnUndOeffneVerwaltung();
    await clickElement(knopf("Kette prüfen")!);
    await warte();
    expect(text()).toContain("Kette intakt");
    expect(text()).toContain("Anker nicht geprüft — die Suite ist nicht erreichbar.");
  });

  it("zeigt eine Anker-Abweichung rot", async () => {
    befehle.ankerAbgleichen.mockResolvedValue({
      bestaetigtBis: 4, hash: null, gemeldetAm: null, abweichung: { block: 5, erwartet: "1a2b3c4d".repeat(8), gemeldet: "99887766".repeat(8) }, offline: false, widerrufen: false,
    });
    await meldeAnUndOeffneVerwaltung();
    await clickElement(knopf("Kette prüfen")!);
    await warte();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain("Anker weicht ab bei Block 5: erwartet #1a2b3c4d, hier #99887766");
  });
});

/** Knöpfe im ganzen Dokument, auch in der Überlagerung (Portal an `body`). */
function knopfImDokument(name: string): HTMLButtonElement | undefined {
  return Array.from(document.body.querySelectorAll<HTMLButtonElement>("button")).find((b) => (b.textContent ?? "").trim() === name);
}

describe("Export und Berichtsblatt in der Verwaltung", () => {
  it("„Herunterladen“ öffnet den Dialog mit „alle“, „Diesen Einsatz herunterladen“ mit dem gewählten Einsatz", async () => {
    await meldeAnUndOeffneVerwaltung();
    await clickElement(knopf("Herunterladen")!);
    expect(queryAll("h2").map((h) => h.textContent)).toContain("Einsätze als Datei speichern");
    expect(queryAll<HTMLButtonElement>("button.umfang").map((u) => u.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(text()).toContain("Nur 2026-043 · MANV 10");
    await clickElement(knopf("Abbrechen")!);
    expect(text()).not.toContain("Einsätze als Datei speichern");

    await clickElement(queryAll<HTMLButtonElement>('button[data-block="1"]')[0]);
    await clickElement(knopf("Diesen Einsatz herunterladen")!);
    expect(text()).toContain("Nur 2026-041 · RD 2");
    expect(queryAll<HTMLButtonElement>("button.umfang").map((u) => u.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("„Sitzung sperren“ nimmt den offenen Dialog mit", async () => {
    await meldeAnUndOeffneVerwaltung();
    await clickElement(knopf("Herunterladen")!);
    befehle.status.mockResolvedValue(status());
    await clickElement(knopf("Sitzung sperren")!);
    await warte();
    expect(text()).not.toContain("Einsätze als Datei speichern");
  });

  it("„PDF erzeugen“ zeigt das Berichtsblatt des gewählten Einsatzes, erzeugt zum frischen Zeitpunkt aus Rust", async () => {
    await meldeAnUndOeffneVerwaltung();
    befehle.status.mockResolvedValue(status({ sitzung: SITZUNG, jetzt: "2026-09-25T11:42:00+02:00" }));
    await clickElement(knopf("PDF erzeugen")!);
    await warte();
    const huelle = document.body.querySelector(".bericht-ueberlagerung");
    expect(huelle?.getAttribute("aria-label")).toBe("Einsatzbericht · 2026-043");
    expect(huelle?.textContent).toContain("Unverändert seit der Versiegelung");
    expect(huelle?.textContent).toContain("Erzeugt 25.9.2026, 11:42 Uhr · Einsatzbuch Verwaltung, Ruben Vitt");
    befehle.drucken.mockResolvedValue(undefined);
    await clickElement(knopfImDokument("Als PDF speichern")!);
    expect(befehle.drucken).toHaveBeenCalledTimes(1);
    await clickElement(knopfImDokument("Schließen")!);
    expect(document.body.querySelector(".bericht-ueberlagerung")).toBeNull();
  });

  it("„Sitzung sperren“ nimmt das Berichtsblatt mit", async () => {
    await meldeAnUndOeffneVerwaltung();
    await clickElement(knopf("PDF erzeugen")!);
    await warte();
    expect(document.body.querySelector(".bericht-ueberlagerung")).not.toBeNull();
    befehle.status.mockResolvedValue(status());
    await clickElement(knopfImDokument("Sitzung sperren")!);
    await warte();
    expect(document.body.querySelector(".bericht-ueberlagerung")).toBeNull();
    expect(text()).not.toContain("MANV 10");
  });
});

/** Ein Versprechen, das der Test selbst einlöst — für Antworten in vertauschter Reihenfolge. */
function offenesVersprechen<T>(): { promise: Promise<T>; loese: (wert: T) => void } {
  let loese: (wert: T) => void = () => {};
  const promise = new Promise<T>((l) => (loese = l));
  return { promise, loese };
}

describe("Statusreihenfolge", () => {
  it("übernimmt von zwei vertauscht ankommenden Antworten nur die jüngere", async () => {
    await meldeAnUndOeffneVerwaltung();
    const alt = offenesVersprechen<Status>();
    const neu = offenesVersprechen<Status>();
    befehle.status.mockReset();
    befehle.status.mockReturnValueOnce(alt.promise).mockReturnValueOnce(neu.promise);
    // Erste Anfrage: „Kette prüfen“ liest den Status danach neu. Die Antwort hängt.
    await clickElement(knopf("Kette prüfen")!);
    for (let i = 0; i < 20 && befehle.status.mock.calls.length < 1; i++) await warte();
    expect(befehle.status).toHaveBeenCalledTimes(1);
    // Zweite, jüngere Anfrage: „Sitzung sperren“ meldet ab und liest neu.
    await clickElement(knopf("Sitzung sperren")!);
    await warte();
    expect(befehle.status).toHaveBeenCalledTimes(2);
    // Die jüngere kommt zuerst an, die ältere (noch mit Sitzung) danach.
    await act(async () => neu.loese(status({ bereitschaft: "DRK-Bereitschaft Neu" })));
    await warte();
    await act(async () => alt.loese(status({ bereitschaft: "DRK-Bereitschaft Alt", sitzung: SITZUNG })));
    await warte();
    expect(text()).toContain("DRK-Bereitschaft Neu");
    expect(text()).not.toContain("DRK-Bereitschaft Alt");
    // Die veraltete Antwort bringt die verworfene Sitzung nicht zurück.
    expect(text()).not.toContain("Ruben Vitt");
    expect(knopf("Verwaltung · Anmelden")).toBeDefined();
  });
});

describe("Neustart", () => {
  it("zeigt den Verfall aus dem ersten Status nach dem Start („Deine letzten Änderungen wurden nicht übernommen …“)", async () => {
    await starte(status({ versiegelung: versiegelung({ verfallen: true }), ausstehend: null, entwurf: null }));
    expect(queryAll("h1").map((h) => h.textContent)).toContain("Einsatz versiegelt");
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toEqual([VERFALLEN]);
  });
});

/**
 * Ein Block mit einem Datum, das es nicht gibt (31. Februar): Er besteht die Formprüfung von
 * `oeffneBlock` (Zeichenkette), scheitert aber an den Formatierern der Verwaltung.
 */
async function blockMitUngueltigemDatum(): Promise<{ block: Block; posten: Schluesselposten }> {
  const suite = await erzeugeSchluesselpaar();
  const cek = new Uint8Array(32).fill(7);
  const einsatz = { ...beispielEinsatz("2026-044"), beginnDatum: "2026-02-31" };
  const block = await versiegele(einsatz, blockkopf(1, GENESIS, await schluesselIdVon(suite.publicKey)), suite.publicKey, {
    cek,
    iv: new Uint8Array(12).fill(1),
    umschlag: { ephemer: await erzeugeSchluesselpaar(), iv: new Uint8Array(12).fill(2) },
  });
  return { block, posten: { block: 1, cek: zuBase64(cek) } };
}

describe("Fehlergrenze um die Verwaltung", () => {
  it("ein ungültiges Datum im Klartext: Hinweis mit „Sitzung sperren“ statt weißer Seite, Kopf und Erfassung bleiben bedienbar", async () => {
    const konsole = vi.spyOn(console, "error").mockImplementation(() => {});
    try {
      const { block, posten } = await blockMitUngueltigemDatum();
      befehle.bloecke.mockResolvedValue([block]);
      befehle.schluesselFreigeben.mockResolvedValue([posten]);
      await meldeAnUndOeffneVerwaltung(status({ kette: { anzahl: 1, letzter: { block: 1, hash: block.hash } } }));
      expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain(
        "Diese Ansicht ließ sich nicht anzeigen. Sperr die Sitzung und melde dich neu an.",
      );
      expect(text()).not.toContain("2026-02-31");
      // Der Kopf liegt außerhalb der Grenze und bleibt bedienbar.
      const thema = queryAll<HTMLButtonElement>("button.rundknopf")[0];
      const vorher = thema.getAttribute("aria-label");
      await clickElement(thema);
      expect(queryAll<HTMLButtonElement>("button.rundknopf")[0].getAttribute("aria-label")).not.toBe(vorher);
      // „Sitzung sperren“ führt zur Startseite, die Erfassung geht.
      befehle.status.mockResolvedValue(status());
      await clickElement(knopf("Sitzung sperren")!);
      await warte();
      expect(befehle.abmelden).toHaveBeenCalledTimes(1);
      expect(text()).toContain(GESPERRT);
      await clickElement(knopf("Einsatz öffnen")!);
      expect(knopf("Einsatz absenden")).toBeDefined();
    } finally {
      konsole.mockRestore();
    }
  });
});

describe("Einstellungen in der Verwaltung", () => {
  const OHNE_ORDNER = { ordner: null, letzte: null, fehler: null, stufe: "gelb" as const };
  const MIT_ORDNER = { ordner: "/Volumes/Sicherung", letzte: "2026-09-25T10:05:00+02:00", fehler: null, stufe: "ok" as const };

  it("„Ordner wählen“: danach liest die App den Status neu und zeigt den neuen Stand", async () => {
    await meldeAnUndOeffneVerwaltung(status({ sicherung: OHNE_ORDNER }));
    expect(text()).toContain("Noch kein Sicherungsordner gewählt");
    befehle.sicherungsordnerWaehlen.mockResolvedValue("/Volumes/Sicherung");
    befehle.status.mockResolvedValue(status({ sicherung: MIT_ORDNER, sitzung: SITZUNG }));
    const vorher = befehle.status.mock.calls.length;
    await clickElement(knopf("Ordner wählen")!);
    await warte();
    expect(befehle.status.mock.calls.length).toBe(vorher + 1);
    expect(befehle.status.mock.invocationCallOrder.at(-1)).toBeGreaterThan(befehle.sicherungsordnerWaehlen.mock.invocationCallOrder[0]);
    expect(text()).toContain("Letzte Sicherung: 25.09.2026, 10:05 Uhr");
    // Die Verwaltung bleibt dabei offen und wird nicht neu geladen.
    expect(befehle.bloecke).toHaveBeenCalledTimes(1);
    expect(text()).toContain("MANV 10");
  });

  it("„Aus Sicherung wiederherstellen“ bei leerer Kette: danach Status und Kette neu, die Meldung bleibt", async () => {
    befehle.bloecke.mockResolvedValue([]);
    befehle.schluesselFreigeben.mockResolvedValue([]);
    await meldeAnUndOeffneVerwaltung(status({ kette: { anzahl: 0, letzter: null }, sicherung: MIT_ORDNER }));
    befehle.wiederherstellen.mockResolvedValue({ bloecke: 3 });
    befehle.bloecke.mockResolvedValue(BLOECKE);
    befehle.schluesselFreigeben.mockResolvedValue(CEKS);
    befehle.status.mockResolvedValue(status({ sicherung: MIT_ORDNER, sitzung: SITZUNG }));
    await clickElement(knopf("Aus Sicherung wiederherstellen")!);
    await clickElement(knopf("Datei wählen")!);
    await warte();
    await warte();
    expect(befehle.wiederherstellen).toHaveBeenCalledTimes(1);
    expect(text()).toContain("3 Blöcke wiederhergestellt");
    expect(knopf("Aus Sicherung wiederherstellen")).toBeUndefined();
    expect(befehle.bloecke).toHaveBeenCalledTimes(2);
    expect(queryAll<HTMLButtonElement>("button[data-block]").map((z) => z.dataset.block)).toEqual(["3", "2", "1"]);
  });

  it("Autostart-Schalter nur im Echtbetrieb", async () => {
    await meldeAnUndOeffneVerwaltung();
    expect(queryAll('input[role="switch"]')).toHaveLength(1);
    await unmount();
    await meldeAnUndOeffneVerwaltung(status({ betrieb: "test", sicherung: { ordner: null, letzte: null, fehler: null, stufe: "aus" } }));
    expect(queryAll('input[role="switch"]')).toHaveLength(0);
    expect(text()).toContain("Im Testbetrieb ist die automatische Sicherung aus.");
  });
});

describe("Startfehler", () => {
  it("zeigt die Fehlerseite ohne Einrichtungsweg und ohne schreibende Knöpfe", async () => {
    await starte(status({ betrieb: "test", eingerichtet: false, entwicklung: true, startfehler: "Datei ist keine Datenbank" }));
    expect(text()).toContain("Die Datenbank dieses Rechners lässt sich nicht öffnen");
    expect(text()).toContain("Datei ist keine Datenbank");
    expect(text()).toContain("Bitte wende dich an die Verwaltung. Es wird nichts versiegelt, bis das behoben ist.");
    expect(band()).toBeDefined();
    for (const name of ["Einsatz öffnen", "Testbetrieb beenden", "Mit Testvektor-Schlüssel einrichten", "Schlüssel aus Datei …"]) {
      expect(knopf(name)).toBeUndefined();
    }
    expect(befehle.stammdaten).not.toHaveBeenCalled();
  });
});

describe("Frist", () => {
  it("öffnet bei einem ausstehenden Einsatz direkt die Frist-Seite", async () => {
    await starte(status({ ausstehend: ausstehend() }));
    expect(text()).toContain("Abgesendet · noch änderbar");
    expect(knopf("Jetzt versiegeln")).toBeDefined();
    expect(knopf("Angaben ändern")).toBeDefined();
    expect(knopf("Einsatz öffnen")).toBeUndefined();
    expect(text()).toContain("Lindenstraße 8, 29525 Uelzen");
  });

  it("öffnet nach einem Neustart mit ausstehendem Einsatz und Entwurf die Bearbeitung mit dem Entwurf", async () => {
    const bearbeitet = entwurf({ strasse: "Hauptstraße 30" });
    await starte(status({ ausstehend: ausstehend(), entwurf: bearbeitet }));
    const h1 = queryAll("h1").map((h) => h.textContent);
    expect(h1).toContain("Angaben ändern");
    expect(feld("Straße, Hausnummer")?.value).toBe("Hauptstraße 30");
    expect(knopf("Änderungen übernehmen")).toBeDefined();
    expect(knopf("Änderungen verwerfen")).toBeDefined();
    expect(knopf("Zurück zur Frist")).toBeDefined();
    expect(befehle.entwurfSpeichern).not.toHaveBeenCalled();
  });
});

describe("Versiegelt", () => {
  it("meldet eine verfallene Bearbeitung", async () => {
    await starte(status({ versiegelung: versiegelung({ verfallen: true }) }));
    expect(queryAll("h1").map((h) => h.textContent)).toContain("Einsatz versiegelt");
    expect(text()).toContain(VERFALLEN);
    expect(text()).toContain("Block 3");
    expect(text()).toContain("Block 4 · neu");
    expect(text()).toContain("#abcdef01");
    expect(text()).toContain("#cccccccc");
    expect(text()).toContain("Versiegelt am 24.9.2026, 10:20 Uhr");
  });

  it("ohne Verfall kein Hinweis", async () => {
    await starte(status({ versiegelung: versiegelung({ verfallen: false }) }));
    expect(text()).toContain("Einsatz versiegelt");
    expect(text()).not.toContain(VERFALLEN);
  });

  it("„Neuen Einsatz erfassen“ verwirft einen Entwurf, der nach dem Quittieren ohne Ausstehendes übrig ist", async () => {
    await starte(status({ versiegelung: versiegelung() }));
    befehle.status.mockResolvedValue(status({ entwurf: entwurf({ notizen: "versiegelter Stand" }) }));
    await clickElement(knopf("Neuen Einsatz erfassen")!);
    await warte();
    expect(befehle.entwurfVerwerfen).toHaveBeenCalledTimes(1);
    expect(befehle.entwurfVerwerfen.mock.invocationCallOrder[0]).toBeGreaterThan(befehle.versiegelungQuittieren.mock.invocationCallOrder[0]);
    await clickElement(knopf("Einsatz öffnen")!);
    expect(queryAll<HTMLTextAreaElement>("textarea")[0]?.value).toBe("");
  });

  it("„Neuen Einsatz erfassen“ quittiert zuerst und fragt erst dann den Status ab", async () => {
    await starte(status({ versiegelung: versiegelung() }));
    befehle.status.mockResolvedValue(status());
    await clickElement(knopf("Neuen Einsatz erfassen")!);
    await warte();
    expect(befehle.versiegelungQuittieren).toHaveBeenCalledTimes(1);
    const quittiert = befehle.versiegelungQuittieren.mock.invocationCallOrder[0];
    const statusAufrufe = befehle.status.mock.invocationCallOrder;
    expect(statusAufrufe[statusAufrufe.length - 1]).toBeGreaterThan(quittiert);
    expect(knopf("Einsatz öffnen")).toBeDefined();
  });
});

describe("Formular", () => {
  it("begrenzt die Textfelder wie der Reader", async () => {
    await starte(status());
    await clickElement(knopf("Einsatz öffnen")!);
    expect(feld("Straße, Hausnummer")?.maxLength).toBe(200);
    expect(feld("PLZ, Ort")?.maxLength).toBe(200);
    expect(feld("Objekt, Lage vor Ort")?.maxLength).toBe(500);
    expect(queryAll<HTMLTextAreaElement>("textarea")[0]?.maxLength).toBe(20_000);
  });

  it("sperrt das Absenden bei einem Ende nur mit Datum", async () => {
    await starte(status({ entwurf: entwurf({ endeDatum: "2026-09-24" }) }));
    await clickElement(knopf("Einsatz öffnen")!);
    expect(text()).toContain("Ende nur mit Datum und Uhrzeit angeben.");
    expect(knopf("Einsatz absenden")?.disabled).toBe(true);
  });
});

describe("Fehler der Befehlsnaht", () => {
  it("landen als Hinweis über dem Inhalt, nicht als alert()", async () => {
    const alarm = vi.spyOn(window, "alert").mockImplementation(() => {});
    befehle.status.mockRejectedValue("Status nicht lesbar");
    await mount(<App />);
    await warte();
    const hinweis = queryAll('[role="alert"]')[0];
    expect(hinweis?.textContent).toContain("Status nicht lesbar");
    expect(alarm).not.toHaveBeenCalled();
    alarm.mockRestore();
  });
});

/** Stellt die Versiegelung bereit, die `frist_pruefen` meldet, und lässt den nächsten Status sie tragen. */
function fristVersiegelt(v: Versiegelung): void {
  befehle.fristPruefen.mockImplementation(async () => {
    befehle.status.mockResolvedValue(status({ versiegelung: v }));
    return v;
  });
}

describe("Bearbeiten nach Fristende", () => {
  it("sendet nicht ab, wenn die Frist nach Rusts Uhr schon um ist, und meldet den Verfall", async () => {
    await starte(status({ ausstehend: ausstehend(), entwurf: entwurf() }));
    const jetzt = Date.now();
    befehle.status.mockResolvedValue(status({ jetztMs: jetzt, ausstehend: ausstehend(entwurf(), jetzt - 1), entwurf: entwurf() }));
    fristVersiegelt(versiegelung({ verfallen: false }));
    await clickElement(knopf("Änderungen übernehmen")!);
    await warte();
    expect(befehle.absenden).not.toHaveBeenCalled();
    expect(befehle.fristPruefen).toHaveBeenCalled();
    expect(queryAll("h1").map((h) => h.textContent)).toContain("Einsatz versiegelt");
    expect(text()).toContain(VERFALLEN);
  });

  it("zeigt nach abgelehntem Absenden (Frist abgelaufen) die Versiegelung mit Verfall", async () => {
    await starte(status({ ausstehend: ausstehend(), entwurf: entwurf() }));
    befehle.absenden.mockRejectedValue("Die Frist ist abgelaufen. Versiegelt wird der zuletzt abgesendete Stand.");
    fristVersiegelt(versiegelung({ verfallen: false }));
    await clickElement(knopf("Änderungen übernehmen")!);
    await warte();
    expect(befehle.absenden).toHaveBeenCalledWith(expect.objectContaining({ strasse: "Lindenstraße 8" }), true);
    expect(queryAll("h1").map((h) => h.textContent)).toContain("Einsatz versiegelt");
    expect(text()).toContain(VERFALLEN);
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toEqual([VERFALLEN]);
  });
});

describe("Bestätigungsdialog", () => {
  it("hält den Fokus: Tab kreist, Escape schließt auch von außerhalb", async () => {
    await starte(status({ betrieb: "test" }));
    await clickElement(knopf("Testbetrieb beenden")!);
    const abbrechen = knopf("Abbrechen")!;
    const loeschen = knopf("Testdatenbank löschen")!;
    expect(document.activeElement).toBe(abbrechen);

    loeschen.focus();
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", bubbles: true }));
    });
    expect(document.activeElement).toBe(abbrechen);
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true }));
    });
    expect(document.activeElement).toBe(loeschen);

    (document.activeElement as HTMLElement).blur();
    await act(async () => {
      document.body.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(queryAll('[role="dialog"]')).toHaveLength(0);
    expect(befehle.testbetriebBeenden).not.toHaveBeenCalled();
  });
});

describe("mit gestellter Uhr", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(async () => {
    await unmount();
    vi.useRealTimers();
  });

  /** Uhr vorstellen und die dabei fälligen Promise-Ketten auslaufen lassen. */
  async function laufe(ms: number): Promise<void> {
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ms);
    });
  }

  async function starteMitUhr(s: Status): Promise<void> {
    befehle.status.mockResolvedValue(s);
    await mount(<App />);
    await laufe(0);
    await laufe(0);
  }

  const STRASSE = 'input[placeholder="z. B. Bahnhofstraße 12"]';

  it("speichert den Entwurf erst 500 ms nach der letzten Änderung", async () => {
    await starteMitUhr(status());
    await clickElement(knopf("Einsatz öffnen")!);
    await fill(STRASSE, "Bahnhofstraße 1");
    await laufe(300);
    await fill(STRASSE, "Bahnhofstraße 12");
    await laufe(499);
    expect(befehle.entwurfSpeichern).not.toHaveBeenCalled();
    await laufe(1);
    expect(befehle.entwurfSpeichern).toHaveBeenCalledTimes(1);
    expect(befehle.entwurfSpeichern).toHaveBeenCalledWith(expect.objectContaining({ strasse: "Bahnhofstraße 12" }), false);
  });

  it("fragt bei Restzeit 0 sofort frist_pruefen, vorher nicht", async () => {
    await starteMitUhr(status({ ausstehend: ausstehend(entwurf(), Date.now() + 1500) }));
    expect(text()).toContain("Abgesendet · noch änderbar");
    await laufe(1000);
    expect(befehle.fristPruefen).not.toHaveBeenCalled();
    await laufe(750);
    expect(befehle.fristPruefen).toHaveBeenCalledTimes(1);
  });

  it("läuft die Frist mitten in einer Bearbeitung ab: kein Speichern mehr, Verfall aus der ungespeicherten Änderung", async () => {
    await starteMitUhr(status({ ausstehend: ausstehend(entwurf(), Date.now() + 200), entwurf: entwurf() }));
    fristVersiegelt(versiegelung({ verfallen: false }));
    await fill(STRASSE, "Hauptstraße 30");
    await laufe(250);
    await laufe(0);
    expect(befehle.fristPruefen).toHaveBeenCalled();
    await laufe(2000);
    expect(befehle.entwurfSpeichern).not.toHaveBeenCalled();
    expect(queryAll("h1").map((h) => h.textContent)).toContain("Einsatz versiegelt");
    // Rust meldet `verfallen: false`, die ungespeicherte Änderung macht es trotzdem zum Verfall.
    expect(text()).toContain(VERFALLEN);
  });

  it("löscht einen Fehler der Abfrage nach der nächsten gelungenen Abfrage", async () => {
    const s = status({ ausstehend: ausstehend() });
    await starteMitUhr(s);
    befehle.status.mockRejectedValueOnce("Status gerade nicht lesbar");
    await laufe(5000);
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toEqual(["Status gerade nicht lesbar"]);
    await laufe(5000);
    expect(queryAll('[role="alert"]')).toHaveLength(0);
  });

  it("löscht einen Fehler der Abfrage auch nach einer gelungenen Frist-Prüfung", async () => {
    await starteMitUhr(status({ ausstehend: ausstehend(entwurf(), Date.now() + 6000) }));
    befehle.status.mockRejectedValueOnce("Status gerade nicht lesbar");
    await laufe(5000);
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toEqual(["Status gerade nicht lesbar"]);
    // Bei Restzeit 0 fragt die Uhr `frist_pruefen`; das gelingt (noch nichts versiegelt), lange
    // bevor die nächste Status-Abfrage bei 10 s käme.
    await laufe(1500);
    expect(befehle.fristPruefen).toHaveBeenCalled();
    expect(befehle.status.mock.calls.length).toBe(2);
    expect(queryAll('[role="alert"]')).toHaveLength(0);
  });

  it("sperrt app-weit nach 10 min ohne Eingabe, auch mitten in der Erfassung, und bleibt dort", async () => {
    const offen = ausstehend(entwurf(), Date.now() + 60 * 60_000);
    const sitzung = { name: "Ruben Vitt", ablaufMs: Date.now() + 3_600_000 };
    // Rust hält die Sitzung, bis `abmelden` kommt — auch über die Status-Abfragen der Frist hinweg.
    befehle.status.mockImplementation(async () => status({ ausstehend: offen, sitzung: befehle.abmelden.mock.calls.length > 0 ? null : sitzung }));
    await mount(<App />);
    await laufe(0);
    await laufe(0);
    expect(text()).toContain("Abgesendet · noch änderbar");
    expect(knopf("Sitzung sperren")).toBeDefined();
    await laufe(10 * 60_000 - 1);
    expect(befehle.abmelden).not.toHaveBeenCalled();
    await laufe(1);
    await laufe(0);
    expect(befehle.abmelden).toHaveBeenCalledTimes(1);
    expect(text()).toContain("Abgesendet · noch änderbar");
    expect(knopf("Sitzung sperren")).toBeUndefined();
  });

  it("sperrt beim Ablauf des Tokens: Verwaltung verworfen, Startseite mit Hinweis", async () => {
    const ablauf = Date.now() + 2 * 60_000;
    befehle.anmelden.mockResolvedValue({ name: "Ruben Vitt", ablaufMs: ablauf });
    await starteMitUhr(status());
    await clickElement(knopf("Verwaltung · Anmelden")!);
    befehle.status.mockResolvedValue(status({ sitzung: { name: "Ruben Vitt", ablaufMs: ablauf } }));
    await clickElement(knopf("Mit Pocket ID anmelden")!);
    for (let i = 0; i < 10; i++) await laufe(0);
    expect(text()).toContain("MANV 10");
    befehle.status.mockResolvedValue(status());
    await laufe(2 * 60_000);
    await laufe(0);
    expect(befehle.abmelden).toHaveBeenCalledTimes(1);
    expect(text()).not.toContain("MANV 10");
    expect(text()).toContain(GESPERRT);
  });

  it("startet keine zweite Abfrage, solange eine hängt", async () => {
    await starteMitUhr(status({ ausstehend: ausstehend() }));
    const vorher = befehle.status.mock.calls.length;
    befehle.status.mockReturnValue(new Promise(() => {}));
    await laufe(20_000);
    expect(befehle.status.mock.calls.length).toBe(vorher + 1);
  });
});
