// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  existsPortal,
  mount,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { ArtikelDrawer, zielFilter } from "./ArtikelDrawer";

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  updateArtikel: vi.fn(),
  setArtikelAktiv: vi.fn(),
  bucheZugang: vi.fn(),
  bucheEntnahme: vi.fn(),
  pruefeLoeschbar: vi.fn(),
  loescheElement: vi.fn(),
  deaktiviereElement: vi.fn(),
}));

vi.mock("../_actions/detail", () => ({
  getDetail: (...args: unknown[]) => mocks.getDetail(...args),
}));

vi.mock("../_actions/artikel", () => ({
  updateArtikel: (...args: unknown[]) => mocks.updateArtikel(...args),
  setArtikelAktiv: (...args: unknown[]) => mocks.setArtikelAktiv(...args),
}));

vi.mock("../_actions/buchung", () => ({
  bucheZugang: (...args: unknown[]) => mocks.bucheZugang(...args),
  bucheEntnahme: (...args: unknown[]) => mocks.bucheEntnahme(...args),
}));

vi.mock("../_actions/loeschen", () => ({
  pruefeLoeschbar: (...args: unknown[]) => mocks.pruefeLoeschbar(...args),
  loescheElement: (...args: unknown[]) => mocks.loescheElement(...args),
  deaktiviereElement: (...args: unknown[]) => mocks.deaktiviereElement(...args),
}));

const DETAIL = {
  artikel: {
    id: "a1",
    name: "Kompressen steril",
    einheit: "Stk",
    fach: "A1",
    mindestbestand: 20,
    aktiv: true,
    bestand: 7,
  },
  // Absichtlich NICHT alphabetisch: diese Reihenfolge kommt bereits als FEFO
  // vom Server und darf in der Insel nicht erneut sortiert werden.
  chargen: [
    {
      id: "c-fefo-1",
      chargenNr: "ZZZ-ALT",
      verfall: "2026-12",
      rest: 4,
      ampel: "gelb" as const,
      text: "fällig 12/26",
    },
    {
      id: "c-fefo-2",
      chargenNr: "AAA-NEU",
      verfall: "2027-03",
      rest: 3,
      ampel: "gruen" as const,
      text: "bis 03/27",
    },
  ],
  historie: [
    {
      id: "b1",
      ts: new Date("2026-08-01T10:00:00Z"),
      typ: "entnahme",
      menge: -3,
      kommentar: null,
      quelleName: "RTW 1 Karte",
    },
  ],
  mehrVorhanden: true,
};

const DETAIL_NACH_ZUGANG = {
  ...DETAIL,
  artikel: { ...DETAIL.artikel, bestand: 12 },
  chargen: [
    { ...DETAIL.chargen[0], rest: 9 },
    DETAIL.chargen[1],
  ],
};

const FAHRZEUGE = [
  { id: "f1", name: "RTW 1", kennung: "UE-RK 1234" },
  { id: "f2", name: "MTW Bereitschaft", kennung: null },
];

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 20; versuch++) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

async function fillPortal(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement | HTMLTextAreaElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter am Prototyp von ${input.tagName}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function submitPortalForm(selector: string): Promise<void> {
  const form = queryPortal<HTMLFormElement>(selector);
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
}

async function selectOption(ariaLabel: string, text: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
  if (!input.closest(".ant-select")) throw new Error(`Select nicht gefunden: ${ariaLabel}`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function waehleVerfallsmonat(monat: string): Promise<void> {
  await clickElement(queryPortal("[aria-label='Verfallsmonat']"));
  await warte();
  const zelle = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-picker-cell"))
    .find((element) => element.getAttribute("title") === monat);
  if (!zelle) throw new Error(`Monat nicht gefunden: ${monat}`);
  await clickElement(zelle);
  await warte();
}

async function drawerMounten(): Promise<void> {
  await mount(
    <ArtikelDrawer id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} />,
  );
  await warteAuf(
    () => (document.body.textContent ?? "").includes("Kompressen steril"),
    "geladener Artikel",
  );
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.setSystemTime(new Date("2027-01-15T10:00:00Z"));
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.getDetail.mockResolvedValue({ ok: true, wert: DETAIL });
  mocks.updateArtikel.mockResolvedValue({ ok: true });
  mocks.setArtikelAktiv.mockResolvedValue({ ok: true });
  mocks.bucheZugang.mockResolvedValue({ ok: true });
  mocks.bucheEntnahme.mockResolvedValue({ ok: true, wert: { gebucht: 1 } });
  mocks.pruefeLoeschbar.mockResolvedValue({ ok: true, wert: { loeschbar: true } });
  mocks.loescheElement.mockResolvedValue({ ok: true });
  mocks.deaktiviereElement.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("ArtikelDrawer: Dialog und lokale Stammdaten-Spiegel", () => {
  it("benennt den Dialog ueber seinen Drawer-Titel mit dem Artikelnamen", async () => {
    await drawerMounten();

    const dialog = queryPortal("[role='dialog']");
    const titelId = dialog.getAttribute("aria-labelledby");
    expect(titelId).toBeTruthy();
    expect(document.getElementById(titelId ?? "")?.textContent).toBe("Kompressen steril");
  });

  it("haelt den Mindestbestand ausserhalb von Form und committet den letzten Spiegelwert einmal nach 400 ms", async () => {
    await drawerMounten();
    // Ab hier darf die Uhr nicht automatisch mit der realen Laufzeit
    // fortschreiten: geprüft werden exakt 399 ms bzw. 400 ms nach Eingabe.
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const input = queryPortal<HTMLInputElement>("[data-rolle='mindestbestand'] input");

    expect(input.closest(".ant-form-item")).toBeNull();
    await fillPortal("[data-rolle='mindestbestand'] input", "3");
    await fillPortal("[data-rolle='mindestbestand'] input", "37");

    expect(input.value).toBe("37");
    expect(mocks.updateArtikel).not.toHaveBeenCalled();
    await act(async () => { vi.advanceTimersByTime(399); });
    expect(mocks.updateArtikel).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.updateArtikel).toHaveBeenCalledTimes(1);
    expect(mocks.updateArtikel).toHaveBeenCalledWith("a1", { mindestbestand: 37 });
  });

  it("laesst den lokalen Spiegel leer und verwirft beim Leeren einen ausstehenden Commit", async () => {
    await drawerMounten();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const input = queryPortal<HTMLInputElement>("[data-rolle='mindestbestand'] input");

    await fillPortal("[data-rolle='mindestbestand'] input", "37");
    await fillPortal("[data-rolle='mindestbestand'] input", "");

    expect(input.value).toBe("");
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.updateArtikel).not.toHaveBeenCalled();
  });

  it("ueberschreibt eine neuere Eingabe nicht mit dem Reload eines laufenden Commits", async () => {
    const serverNachCommit = {
      ...DETAIL,
      artikel: { ...DETAIL.artikel, mindestbestand: 37 },
    };
    mocks.getDetail
      .mockResolvedValueOnce({ ok: true, wert: DETAIL })
      .mockResolvedValueOnce({ ok: true, wert: serverNachCommit });
    let commitBeenden!: (ergebnis: { ok: true }) => void;
    const laufenderCommit = new Promise<{ ok: true }>((fertig) => {
      commitBeenden = fertig;
    });
    mocks.updateArtikel.mockReturnValueOnce(laufenderCommit);

    await drawerMounten();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    const input = queryPortal<HTMLInputElement>("[data-rolle='mindestbestand'] input");
    await fillPortal("[data-rolle='mindestbestand'] input", "37");
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(mocks.updateArtikel).toHaveBeenCalledTimes(1);

    await fillPortal("[data-rolle='mindestbestand'] input", "38");
    await act(async () => {
      commitBeenden({ ok: true });
      await laufenderCommit;
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.getDetail).toHaveBeenCalledTimes(2);
    expect(input.value).toBe("38");
  });

  it("serialisiert parallele Mutationen und behaelt den Fehler der spaeteren Aktion", async () => {
    let commitBeenden!: (ergebnis: { ok: true }) => void;
    const laufenderCommit = new Promise<{ ok: true }>((fertig) => {
      commitBeenden = fertig;
    });
    mocks.updateArtikel.mockReturnValueOnce(laufenderCommit);
    mocks.bucheEntnahme.mockResolvedValueOnce({
      ok: false,
      fehler: "Der Bestand reicht für diese Entnahme nicht aus.",
    });

    await drawerMounten();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await fillPortal("[data-rolle='mindestbestand'] input", "37");
    await act(async () => {
      vi.advanceTimersByTime(400);
      await Promise.resolve();
    });
    expect(mocks.updateArtikel).toHaveBeenCalledTimes(1);

    await submitPortalForm("[data-rolle='entnahme-form']");
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    expect(mocks.bucheEntnahme).not.toHaveBeenCalled();
    expect(
      queryPortal("[data-rolle='entnahme-form'] button")
        .classList.contains("ant-btn-loading"),
    ).toBe(true);

    await act(async () => {
      commitBeenden({ ok: true });
      await laufenderCommit;
      for (let i = 0; i < 10; i++) await Promise.resolve();
    });

    expect(mocks.bucheEntnahme).toHaveBeenCalledTimes(1);
    expect(queryPortal(".ant-drawer-body").textContent)
      .toContain("Der Bestand reicht für diese Entnahme nicht aus.");
    expect(
      queryPortal("[data-rolle='entnahme-form'] button")
        .classList.contains("ant-btn-loading"),
    ).toBe(false);
  });
});

describe("ArtikelDrawer: zwei suchbare Auswahlfelder", () => {
  it("rendert genau Fahrzeug- und Charge-Select und filtert jeweils label plus keywords", async () => {
    await drawerMounten();

    expect(queryPortal(".ant-drawer-body").querySelectorAll(".ant-select")).toHaveLength(2);
    expect(zielFilter("UE-RK", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(true);
    expect(zielFilter("ZZZ", { label: "Charge 12/26", keywords: "ZZZ-ALT" })).toBe(true);
    expect(zielFilter("MTW", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(false);
  });

  it("bewahrt NEUE_CHARGE plus die serverseitige FEFO-Reihenfolge und blendet Neufelder bei Bestandscharge aus", async () => {
    await drawerMounten();
    expect(existsPortal("[aria-label='Chargennummer']")).toBe(true);
    expect(existsPortal("[aria-label='Verfallsmonat']")).toBe(true);

    const chargeInput = queryPortal<HTMLInputElement>("[aria-label='Charge']");
    if (!chargeInput.closest(".ant-select")) throw new Error("Charge-Select fehlt");
    await act(async () => {
      chargeInput.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await warte();

    const optionen = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
      .map((element) => element.textContent ?? "");
    expect(optionen).toEqual([
      "+ Neue Charge",
      "ZZZ-ALT · 12/26 · Rest 4",
      "AAA-NEU · 03/27 · Rest 3",
    ]);

    const bestand = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
      .find((element) => (element.textContent ?? "").includes("ZZZ-ALT"));
    if (!bestand) throw new Error("Bestandscharge fehlt");
    await clickElement(bestand);
    await warte();
    expect(existsPortal("[aria-label='Chargennummer']")).toBe(false);
    expect(existsPortal("[aria-label='Verfallsmonat']")).toBe(false);
  });
});

describe("ArtikelDrawer: Zugang mit exklusiver Charge", () => {
  it("deaktiviert die Zugangsform waehrend einer laufenden Buchung und gibt sie danach wieder frei", async () => {
    let zugangBeenden!: (ergebnis: { ok: true }) => void;
    const laufenderZugang = new Promise<{ ok: true }>((fertig) => {
      zugangBeenden = fertig;
    });
    mocks.bucheZugang.mockReturnValueOnce(laufenderZugang);

    await drawerMounten();
    await selectOption("Charge", "ZZZ-ALT");
    await fillPortal("[aria-label='Zugangsmenge']", "5");
    await submitPortalForm("[data-rolle='zugang-form']");
    await warteAuf(() => mocks.bucheZugang.mock.calls.length === 1, "laufender Zugang");

    expect(queryPortal<HTMLInputElement>("[aria-label='Zugangsmenge']").disabled)
      .toBe(true);
    expect(queryPortal<HTMLInputElement>("[aria-label='Charge']").disabled)
      .toBe(true);

    await act(async () => {
      zugangBeenden({ ok: true });
      await laufenderZugang;
    });
    await warteAuf(
      () => !queryPortal<HTMLInputElement>("[aria-label='Zugangsmenge']").disabled,
      "wieder freigegebene Zugangsform",
    );

    expect(queryPortal<HTMLInputElement>("[aria-label='Zugangsmenge']").value)
      .toBe("1");
  });

  it("sendet bei einer Bestandscharge nur chargeId und laedt den sichtbaren Bestand neu", async () => {
    mocks.getDetail
      .mockResolvedValueOnce({ ok: true, wert: DETAIL })
      .mockResolvedValueOnce({ ok: true, wert: DETAIL_NACH_ZUGANG });
    await drawerMounten();
    await selectOption("Charge", "ZZZ-ALT");
    await fillPortal("[aria-label='Zugangsmenge']", "5");

    await submitPortalForm("[data-rolle='zugang-form']");
    await warteAuf(
      () => (queryPortal(".ant-drawer-body").textContent ?? "").includes("Bestand 12 Stk"),
      "neu geladener Bestand",
    );

    expect(mocks.bucheZugang).toHaveBeenCalledWith({
      artikelId: "a1",
      menge: 5,
      chargeId: "c-fefo-1",
    });
  });

  it("bindet den DatePicker an Form und sendet bei NEUE_CHARGE nur neueCharge mit YYYY-MM", async () => {
    await drawerMounten();
    await fillPortal("[aria-label='Zugangsmenge']", "4");
    await fillPortal("[aria-label='Chargennummer']", "NEU-42");
    await waehleVerfallsmonat("2027-03");
    expect(queryPortal<HTMLInputElement>("[aria-label='Verfallsmonat']").value)
      .toBe("2027-03");

    await submitPortalForm("[data-rolle='zugang-form']");
    await warte();

    expect(mocks.bucheZugang).toHaveBeenCalledWith({
      artikelId: "a1",
      menge: 4,
      neueCharge: { chargenNr: "NEU-42", verfall: "2027-03" },
    });
  });

  it("zeigt erwartete Actionfehler unveraendert und laedt nach dem Fehlschlag nicht neu", async () => {
    mocks.bucheZugang.mockResolvedValueOnce({
      ok: false,
      fehler: "Die gewählte Charge ist nicht mehr verfügbar.",
    });
    await drawerMounten();
    await selectOption("Charge", "ZZZ-ALT");
    await fillPortal("[aria-label='Zugangsmenge']", "2");

    await submitPortalForm("[data-rolle='zugang-form']");
    await warte();

    expect(queryPortal(".ant-drawer-body").textContent)
      .toContain("Die gewählte Charge ist nicht mehr verfügbar.");
    expect(mocks.getDetail).toHaveBeenCalledTimes(1);
  });
});

describe("ArtikelDrawer: Entnahme und Fahrzeugziel", () => {
  it("deaktiviert die Entnahmeform waehrend einer laufenden Buchung und gibt sie danach wieder frei", async () => {
    let entnahmeBeenden!: (ergebnis: { ok: true; wert: { gebucht: number } }) => void;
    const laufendeEntnahme = new Promise<{ ok: true; wert: { gebucht: number } }>((fertig) => {
      entnahmeBeenden = fertig;
    });
    mocks.bucheEntnahme.mockReturnValueOnce(laufendeEntnahme);

    await drawerMounten();
    await submitPortalForm("[data-rolle='entnahme-form']");
    await warteAuf(() => mocks.bucheEntnahme.mock.calls.length === 1, "laufende Entnahme");

    expect(queryPortal<HTMLInputElement>("[aria-label='Entnahmemenge']").disabled)
      .toBe(true);
    expect(queryPortal<HTMLInputElement>("[aria-label='Ziel-Fahrzeug']").disabled)
      .toBe(true);
    expect(queryPortal<HTMLTextAreaElement>("[aria-label='Entnahmekommentar']").disabled)
      .toBe(true);

    await act(async () => {
      entnahmeBeenden({ ok: true, wert: { gebucht: 1 } });
      await laufendeEntnahme;
    });
    await warteAuf(
      () => !queryPortal<HTMLInputElement>("[aria-label='Entnahmemenge']").disabled,
      "wieder freigegebene Entnahmeform",
    );

    expect(queryPortal<HTMLInputElement>("[aria-label='Entnahmemenge']").value)
      .toBe("1");
  });

  it("sendet das ausgewaehlte Fahrzeug mit Menge und Kommentar", async () => {
    await drawerMounten();
    await selectOption("Ziel-Fahrzeug", "RTW 1");
    await fillPortal("[aria-label='Entnahmemenge']", "2");
    await fillPortal("[aria-label='Entnahmekommentar']", "Nachfüllung RTW");

    await submitPortalForm("[data-rolle='entnahme-form']");
    await warte();

    expect(mocks.bucheEntnahme).toHaveBeenCalledWith({
      artikelId: "a1",
      menge: 2,
      zielLagerortId: "f1",
      kommentar: "Nachfüllung RTW",
    });
  });

  it("verbirgt unerwartete Runtime-Texte hinter einem festen deutschen Fallback", async () => {
    mocks.bucheEntnahme.mockRejectedValueOnce(new Error("SQLITE intern und geheim"));
    await drawerMounten();
    await fillPortal("[aria-label='Entnahmemenge']", "1");

    await submitPortalForm("[data-rolle='entnahme-form']");
    await warte();

    const text = queryPortal(".ant-drawer-body").textContent ?? "";
    expect(text).toContain("Entnahme konnte nicht gebucht werden.");
    expect(text).not.toContain("SQLITE intern und geheim");
    expect(mocks.getDetail).toHaveBeenCalledTimes(1);
  });
});

describe("ArtikelDrawer: Loeschen und Deaktivieren", () => {
  it("zeigt einen Actionfehler beim Loeschen unveraendert im Drawer", async () => {
    mocks.loescheElement.mockResolvedValueOnce({
      ok: false,
      fehler: "Der Artikel ist inzwischen mit einer Buchung verknüpft.",
    });
    await drawerMounten();

    const loeschButton = Array.from(
      queryPortal(".ant-drawer-body").querySelectorAll<HTMLButtonElement>("button"),
    ).find((button) => button.textContent?.includes("Artikel löschen"));
    if (!loeschButton) throw new Error("Artikel-loeschen-Button fehlt");
    await clickElement(loeschButton);
    await warteAuf(
      () => existsPortal("[aria-label='Namen zur Bestätigung eingeben']"),
      "geoeffneter Loeschdialog",
    );
    await fillPortal(
      "[aria-label='Namen zur Bestätigung eingeben']",
      DETAIL.artikel.name,
    );
    await clickElement(queryPortal("[data-rolle='loeschen']"));
    await warte();

    expect(mocks.loescheElement).toHaveBeenCalledWith("artikel", "a1");
    expect(queryPortal(".ant-drawer-body").textContent)
      .toContain("Der Artikel ist inzwischen mit einer Buchung verknüpft.");
  });
});

describe("ArtikelDrawer: Chargen und begrenzte Historie", () => {
  it("zeigt die Chargen in FEFO-Reihenfolge mit Plakette, Rest und Status", async () => {
    await drawerMounten();
    const zeilen = Array.from(
      queryPortal("table[aria-label='Chargen']")
        .querySelectorAll<HTMLElement>("tbody tr[data-row-key]"),
    ).map((zeile) => zeile.textContent ?? "");

    expect(zeilen[0]).toContain("ZZZ-ALT");
    expect(zeilen[0]).toContain("4");
    expect(zeilen[0]).toContain("fällig 12/26");
    expect(zeilen[1]).toContain("AAA-NEU");
    expect(queryPortal("table[aria-label='Chargen'] svg[role='img']")).toBeTruthy();
  });

  it("zeigt den festen Begrenzungshinweis nur wenn mehrVorhanden wahr ist", async () => {
    await drawerMounten();
    expect(queryPortal("table[aria-label='Buchungshistorie des Artikels']"))
      .toBeTruthy();
    expect(queryPortal(".ant-drawer-body").textContent)
      .toContain("Es werden nur die neuesten Buchungen angezeigt.");

    await unmount();
    mocks.getDetail.mockResolvedValueOnce({
      ok: true,
      wert: { ...DETAIL, mehrVorhanden: false },
    });
    await drawerMounten();
    expect(queryPortal(".ant-drawer-body").textContent)
      .not.toContain("Es werden nur die neuesten Buchungen angezeigt.");
  });
});

describe("monatAusPicker: die directive-freie Dayjs-Grenze", () => {
  it("liefert YYYY-MM und fuer null undefined", async () => {
    const { monatAusPicker } = await import("./monat");
    const dayjs = (await import("dayjs")).default;

    expect(monatAusPicker(dayjs("2027-03-15"))).toBe("2027-03");
    expect(monatAusPicker(null)).toBeUndefined();
  });
});
