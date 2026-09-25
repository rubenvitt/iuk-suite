/**
 * Der Export-Dialog nach der Vorlage (`exportOffen` in `Einsatzbuch v2.dc.html`). `baueExport`
 * ist hier ersetzt: Der Test hält die CEK-Map fest, die der Dialog übergibt, und prüft nach
 * jedem Ausgang, dass jedes Byte darin überschrieben ist (Review Focus 5). Den echten
 * Kryptorundlauf prüft `logik/export.test.ts`.
 */
import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clickElement, fill, mount, queryAll, unmount } from "../../../../src/app/m/qr/_lib/test-dom";
import type { Status } from "../typen";
import { BLOECKE, CEKS, EINSAETZE } from "./testvektoren";

const befehle = vi.hoisted(() => ({
  schluesselFreigeben: vi.fn(),
  status: vi.fn(),
  exportSpeichern: vi.fn(),
  readerOeffnen: vi.fn(),
}));
vi.mock("../befehle", () => ({ befehle }));

const gebaut = vi.hoisted(() => ({ ceks: [] as Uint8Array[] }));
const baueExport = vi.hoisted(() => vi.fn());
vi.mock("../logik/export", () => ({ baueExport }));

import { ExportDialog } from "./ExportDialog";

const ANKER = { block: 3, hash: BLOECKE[2].hash, gemeldetAm: "2026-09-25T10:00:00+02:00" };
const DATEI = { format: "einsatzbuch-export", version: 2 };

function status(teil: Partial<Status> = {}): Partial<Status> {
  return {
    jetzt: "2026-09-25T10:15:00+02:00",
    zeitzone: "Europe/Berlin",
    bereitschaft: "DRK-Bereitschaft Uelzen",
    anker: ANKER,
    sitzung: { name: "Ruben Vitt", ablaufMs: Date.now() + 3_600_000 },
    ...teil,
  };
}

const EINZELN = { block: 2, nummer: EINSAETZE[1].nummer, stichwort: EINSAETZE[1].stichwort };

async function oeffne(p: { umfang?: "alle" | "einzeln"; beiSchliessen?: () => void } = {}): Promise<void> {
  await mount(
    <ExportDialog bloecke={BLOECKE} einzeln={EINZELN} umfang={p.umfang ?? "alle"} zeitzone="Europe/Berlin" beiSchliessen={p.beiSchliessen ?? (() => {})} />,
  );
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
const felder = () => queryAll<HTMLInputElement>('input[type="password"]');

async function kennwort(eins: string, zwei = eins): Promise<void> {
  await fill('input[name="kennwort"]', eins);
  await fill('input[name="kennwort-wiederholen"]', zwei);
}

beforeEach(() => {
  vi.clearAllMocks();
  gebaut.ceks = [];
  befehle.schluesselFreigeben.mockResolvedValue(CEKS);
  befehle.status.mockResolvedValue(status());
  befehle.exportSpeichern.mockResolvedValue("einsatzbuch_2026-09-25_block-1-3.einsatzbuch");
  befehle.readerOeffnen.mockResolvedValue(undefined);
  baueExport.mockImplementation(async (e: { ceks: ReadonlyMap<number, Uint8Array> }) => {
    gebaut.ceks = [...e.ceks.values()];
    // Beim Aufruf sind die Schlüssel noch echt — erst danach überschreibt der Dialog sie.
    expect(gebaut.ceks.every((c) => c.some((b) => b !== 0))).toBe(true);
    return { datei: DATEI, dateiname: "einsatzbuch_2026-09-25_block-1-3.einsatzbuch" };
  });
});

afterEach(async () => {
  await unmount();
});

function alleGenullt(): boolean {
  return gebaut.ceks.length > 0 && gebaut.ceks.every((c) => c.every((b) => b === 0));
}

describe("ExportDialog", () => {
  it("zeigt Titel, beide Umfänge, die Kennwortfelder und die Hinweise der Vorlage", async () => {
    await oeffne();
    expect(queryAll('[role="dialog"]')).toHaveLength(1);
    expect(queryAll("h2").map((h) => h.textContent)).toContain("Einsätze als Datei speichern");
    const umfaenge = queryAll<HTMLButtonElement>("button[aria-pressed]");
    expect(umfaenge.map((u) => u.textContent)).toEqual([
      "Alle 3 EinsätzeBlock 1–3 · der Reader kann die ganze Kette prüfen",
      `Nur ${EINZELN.nummer} · ${EINZELN.stichwort}Block 2 · Fingerabdruck und Vorgänger werden mitgegeben`,
    ]);
    expect(umfaenge.map((u) => u.getAttribute("aria-pressed"))).toEqual(["true", "false"]);
    expect(text()).toContain("Kennwort für die Datei");
    expect(text()).toContain("Mindestens 10 Zeichen. Ohne Kennwort lässt sich die Datei nicht öffnen — es wird nirgends gespeichert.");
    expect(text()).toContain("Kennwort wiederholen");
    expect(text()).toContain("AES-256-GCM, Schlüssel aus deinem Kennwort abgeleitet (PBKDF2, 600.000 Runden).");
    expect(text()).toContain("Fingerabdrücke bleiben erhalten — der Reader prüft die Kette beim Öffnen.");
    expect(felder()).toHaveLength(2);
    expect(knopf("Datei speichern")?.disabled).toBe(true);
    expect(knopf("Abbrechen")).toBeDefined();
  });

  it("meldet ein zu kurzes und ein ungleiches Kennwort, der Knopf bleibt gesperrt", async () => {
    await oeffne();
    await kennwort("kurz");
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain("Das Kennwort braucht mindestens 10 Zeichen.");
    expect(knopf("Datei speichern")?.disabled).toBe(true);
    await kennwort("lang-genug-1", "lang-genug-2");
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain("Die Kennwörter stimmen nicht überein.");
    expect(knopf("Datei speichern")?.disabled).toBe(true);
    await kennwort("lang-genug-1");
    expect(queryAll('[role="alert"]')).toHaveLength(0);
    expect(knopf("Datei speichern")?.disabled).toBe(false);
  });

  it("„alle“: frische Schlüssel für alle Blöcke, Status frisch, gespeichert, CEKs überschrieben, Felder leer", async () => {
    await oeffne();
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();

    expect(befehle.schluesselFreigeben).toHaveBeenCalledWith([1, 2, 3]);
    expect(befehle.status).toHaveBeenCalledTimes(1);
    expect(baueExport).toHaveBeenCalledTimes(1);
    const [auftrag, kw] = baueExport.mock.calls[0];
    expect(kw).toBe("korrekt-pferd-batterie");
    expect(auftrag).toMatchObject({
      bloecke: BLOECKE,
      umfang: "alle",
      anker: ANKER,
      exportiertVon: "Ruben Vitt",
      quelle: "DRK-Bereitschaft Uelzen",
      erstellt: "2026-09-25T10:15:00+02:00",
      zeitzone: "Europe/Berlin",
    });
    expect(befehle.exportSpeichern).toHaveBeenCalledWith(JSON.stringify(DATEI), "einsatzbuch_2026-09-25_block-1-3.einsatzbuch");
    expect(alleGenullt()).toBe(true);
    expect(felder().map((f) => f.value)).toEqual(["", ""]);
    expect(text()).toContain("Gespeichert als einsatzbuch_2026-09-25_block-1-3.einsatzbuch");
    expect(knopf("Fertig")).toBeDefined();

    await clickElement(knopf("Im Reader öffnen")!);
    expect(befehle.readerOeffnen).toHaveBeenCalledTimes(1);
  });

  it("zeigt den Namen, den der Speichern-Dialog zurückgab, nicht den Vorschlag", async () => {
    befehle.exportSpeichern.mockResolvedValue("umbenannt.einsatzbuch");
    await oeffne();
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();
    expect(text()).toContain("Gespeichert als umbenannt.einsatzbuch");
  });

  it("„einzeln“ gibt nur den gewählten Block frei und nennt seine Nummer", async () => {
    await oeffne();
    await clickElement(queryAll<HTMLButtonElement>("button[aria-pressed]")[1]);
    expect(queryAll<HTMLButtonElement>("button[aria-pressed]").map((u) => u.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();
    expect(befehle.schluesselFreigeben).toHaveBeenCalledWith([2]);
    expect(baueExport.mock.calls[0][0]).toMatchObject({ umfang: "einzeln", gewaehlt: 2, nummer: EINZELN.nummer });
  });

  it("öffnet mit „einzeln“, wenn der Aufrufer es so will", async () => {
    await oeffne({ umfang: "einzeln" });
    expect(queryAll<HTMLButtonElement>("button[aria-pressed]").map((u) => u.getAttribute("aria-pressed"))).toEqual(["false", "true"]);
  });

  it("abgebrochener Speichern-Dialog: weder Erfolg noch Fehler, CEKs trotzdem überschrieben", async () => {
    befehle.exportSpeichern.mockResolvedValue(null);
    await oeffne();
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();
    expect(text()).not.toContain("Gespeichert als");
    expect(queryAll('[role="alert"]')).toHaveLength(0);
    expect(alleGenullt()).toBe(true);
    expect(felder().map((f) => f.value)).toEqual(["", ""]);
  });

  it("scheitert die Freigabe, steht die Meldung aus Rust wörtlich da und nichts wird gebaut", async () => {
    befehle.schluesselFreigeben.mockRejectedValue("Lesen braucht Verbindung zur Suite.");
    await oeffne();
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain("Lesen braucht Verbindung zur Suite.");
    expect(baueExport).not.toHaveBeenCalled();
    expect(befehle.exportSpeichern).not.toHaveBeenCalled();
  });

  it("scheitert das Speichern, sind die CEKs trotzdem überschrieben", async () => {
    befehle.exportSpeichern.mockRejectedValue("Die Datei ließ sich nicht schreiben.");
    await oeffne();
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain("Die Datei ließ sich nicht schreiben.");
    expect(alleGenullt()).toBe(true);
  });

  it("scheitert das Verschlüsseln, steht der Satz der Vorlage da und die CEKs sind überschrieben", async () => {
    baueExport.mockImplementation(async (e: { ceks: ReadonlyMap<number, Uint8Array> }) => {
      gebaut.ceks = [...e.ceks.values()];
      throw new Error("OperationError");
    });
    await oeffne();
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();
    expect(queryAll('[role="alert"]').map((a) => a.textContent)).toContain("Die Datei konnte nicht erzeugt werden. Versuch es noch einmal.");
    expect(alleGenullt()).toBe(true);
    expect(befehle.exportSpeichern).not.toHaveBeenCalled();
  });

  it("sperrt Speichern, Umfang und Schließen, solange es läuft", async () => {
    let loese: (w: unknown) => void = () => {};
    befehle.schluesselFreigeben.mockReturnValue(new Promise((l) => (loese = l)));
    const beiSchliessen = vi.fn();
    await oeffne({ beiSchliessen });
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    expect(knopf("Verschlüssele …")?.disabled).toBe(true);
    expect(knopf("Abbrechen")?.disabled).toBe(true);
    expect(queryAll<HTMLButtonElement>("button[aria-pressed]").every((u) => u.disabled)).toBe(true);
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    expect(beiSchliessen).not.toHaveBeenCalled();
    loese(CEKS);
    await warte();
    expect(knopf("Datei speichern")).toBeDefined();
  });

  it("wird der Dialog mitten im Lauf entfernt (Sperre), baut und speichert er nichts mehr", async () => {
    let loese: (w: unknown) => void = () => {};
    befehle.status.mockReturnValue(new Promise((l) => (loese = l)));
    await oeffne();
    await kennwort("korrekt-pferd-batterie");
    await clickElement(knopf("Datei speichern")!);
    await warte();
    expect(befehle.schluesselFreigeben).toHaveBeenCalledTimes(1);
    await unmount();
    loese(status());
    await warte();
    expect(baueExport).not.toHaveBeenCalled();
    expect(befehle.exportSpeichern).not.toHaveBeenCalled();
  });

  it("Escape und „Abbrechen“ schließen", async () => {
    const beiSchliessen = vi.fn();
    await oeffne({ beiSchliessen });
    await act(async () => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    });
    await clickElement(knopf("Abbrechen")!);
    expect(beiSchliessen).toHaveBeenCalledTimes(2);
  });
});
