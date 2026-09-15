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
import { HANDLAGER_ID } from "../_lib/konstanten";

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

const mocks = vi.hoisted(() => ({
  getDetail: vi.fn(),
  updateArtikel: vi.fn(),
  setArtikelAktiv: vi.fn(),
  bucheZugang: vi.fn(),
  bucheEntnahme: vi.fn(),
  bucheUmlagerung: vi.fn(),
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
  bucheUmlagerung: (...args: unknown[]) => mocks.bucheUmlagerung(...args),
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
      // DRK-297, Aufgabe 11: `restGesamt` und `orte` liegen ausschliesslich
      // im Handlager-Bereich — dieselbe Zahl wie `rest`.
      restGesamt: 4,
      orte: [{ id: HANDLAGER_ID, name: "Handlager", menge: 4, zugangshinweis: null }],
      ampel: "gelb" as const,
      text: "fällig 12/26",
    },
    {
      id: "c-fefo-2",
      chargenNr: "AAA-NEU",
      verfall: "2027-03",
      rest: 3,
      restGesamt: 3,
      orte: [{ id: HANDLAGER_ID, name: "Handlager", menge: 3, zugangshinweis: null }],
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
      ortName: "Handlager",
    },
  ],
  mehrVorhanden: true,
  // DRK-297 — nur die Wurzel: die Zugangsform bekommt hier ihr Ziel
  // vorbelegt (`detail.zielOrte.length === 1`), sonst muesste jeder Test in
  // dieser Datei erst einen Schrank waehlen.
  zielOrte: [
    { id: HANDLAGER_ID, name: "Handlager (ohne Schrank)", zugangshinweis: null },
  ],
  // DRK-338 — hier nur die Wurzel: das Umlagern braucht ZWEI Orte und zeigt
  // in dieser Vorrichtung deshalb bloss seinen Hinweis. Die eigene Vorrichtung
  // mit Schraenken steht unten bei den DRK-338-Faellen.
  handlagerOrtIds: [HANDLAGER_ID],
};

const DETAIL_NACH_ZUGANG = {
  ...DETAIL,
  artikel: { ...DETAIL.artikel, bestand: 12 },
  chargen: [
    {
      ...DETAIL.chargen[0],
      rest: 9,
      restGesamt: 9,
      orte: [{ id: HANDLAGER_ID, name: "Handlager", menge: 9, zugangshinweis: null }],
    },
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
  mocks.bucheUmlagerung.mockResolvedValue({ ok: true, wert: { umgelagert: 1 } });
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

describe("ArtikelDrawer: drei suchbare Auswahlfelder", () => {
  it("rendert genau Fahrzeug-, Charge- und Zielort-Select und filtert jeweils label plus keywords", async () => {
    await drawerMounten();

    // Das Kategoriefeld (DRK-294) ist ein `AutoComplete` und damit technisch
    // ebenfalls ein `.ant-select` — gezaehlt werden hier die AUSWAHLfelder.
    // DRK-297 fuegt "Wohin" als drittes hinzu (Charge, Wohin, Ziel-Fahrzeug).
    expect(queryPortal(".ant-drawer-body")
      .querySelectorAll(".ant-select:not(.ant-select-auto-complete)")).toHaveLength(3);
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
      "ZZZ-ALT · 12/26 · Rest gesamt 4",
      "AAA-NEU · 03/27 · Rest gesamt 3",
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

/**
 * DRK-294. Die Kategorie speichert wie Fach und Einheit beim Verlassen des
 * Feldes — mit einem Unterschied, an dem der Filter haengt: sie DARF leer
 * werden, und leer heisst `null`, nie ein Leerstring.
 */
describe("ArtikelDrawer: Kategorie", () => {
  async function kategorieVerlassen(): Promise<void> {
    const input = queryPortal<HTMLInputElement>("[aria-label='Kategorie']");
    await act(async () => {
      input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
    });
    await warte();
  }

  it("zeigt die gespeicherte Kategorie, speichert eine getrimmte Aenderung und leert auf null", async () => {
    mocks.getDetail.mockResolvedValue({
      ok: true, wert: { ...DETAIL, artikel: { ...DETAIL.artikel, kategorie: "Hygiene" } },
    });
    await mount(
      <ArtikelDrawer
        id="a1" onSchliessen={() => {}} fahrzeuge={FAHRZEUGE} kategorien={["Hygiene", "Technik"]}
      />,
    );
    await warteAuf(
      () => queryPortal<HTMLInputElement>("[aria-label='Kategorie']").value === "Hygiene",
      "gespeicherte Kategorie",
    );

    await kategorieVerlassen();
    expect(mocks.updateArtikel, "unveraendert → kein Schreibvorgang").not.toHaveBeenCalled();

    await fillPortal("[aria-label='Kategorie']", "  Technik ");
    await kategorieVerlassen();
    await warteAuf(() => mocks.updateArtikel.mock.calls.length === 1, "gespeicherte Aenderung");
    expect(mocks.updateArtikel).toHaveBeenCalledWith("a1", { kategorie: "Technik" });

    await fillPortal("[aria-label='Kategorie']", "   ");
    await kategorieVerlassen();
    await warteAuf(() => mocks.updateArtikel.mock.calls.length === 2, "geleerte Kategorie");
    expect(mocks.updateArtikel).toHaveBeenLastCalledWith("a1", { kategorie: null });
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
      // Einzige Auswahl (nur die Wurzel) -> vorbelegt, s. DETAIL.zielOrte oben.
      zielLagerortId: HANDLAGER_ID,
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
      zielLagerortId: HANDLAGER_ID,
    });
  });

  /**
   * DRK-297 — sobald es einen Schrank gibt, ist die Wurzel keine geratene
   * Vorbelegung mehr: das Feld bleibt LEER, bis jemand waehlt.
   */
  it("bietet bei mehreren Zielen keine Vorbelegung und sendet den gewaehlten Schrank", async () => {
    mocks.getDetail.mockResolvedValue({
      ok: true,
      wert: {
        ...DETAIL,
        zielOrte: [
          { id: HANDLAGER_ID, name: "Handlager (ohne Schrank)", zugangshinweis: null },
          { id: "schrank-1", name: "Schrank 1", zugangshinweis: null },
        ],
      },
    });
    await drawerMounten();
    expect(queryPortal<HTMLInputElement>("[aria-label='Wohin']").value).toBe("");

    await selectOption("Charge", "ZZZ-ALT");
    await selectOption("Wohin", "Schrank 1");
    await fillPortal("[aria-label='Zugangsmenge']", "3");

    await submitPortalForm("[data-rolle='zugang-form']");
    await warte();

    expect(mocks.bucheZugang).toHaveBeenCalledWith({
      artikelId: "a1",
      menge: 3,
      chargeId: "c-fefo-1",
      zielLagerortId: "schrank-1",
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

  /**
   * ⚠️ DER BEWEIS, DASS DIE REST-SPALTE UEBER DIE ZAHL SORTIERT.
   * Gezeigt wird „4 Stk"; als Zeichenkette stuende „3 Stk" vor „4 Stk" — hier
   * zufaellig richtig, bei zweistelligen Mengen nicht mehr. Ohne Klick bleibt
   * die FEFO-Reihenfolge des Servers stehen.
   */
  it("hält FEFO und sortiert den Rest auf Klick über die Zahl", async () => {
    await drawerMounten();
    const chargen = queryPortal("table[aria-label='Chargen']");
    const schluessel = () => Array.from(
      chargen.querySelectorAll("tbody tr[data-row-key]"),
      (zeile) => zeile.getAttribute("data-row-key"),
    );
    expect(schluessel()).toEqual(["c-fefo-1", "c-fefo-2"]);

    const kopf = Array.from(chargen.querySelectorAll<HTMLElement>("thead th"))
      .find((th) => (th.textContent ?? "").includes("Rest"));
    await clickElement(kopf!.querySelector<HTMLElement>(".ant-table-column-sorters")!);
    expect(schluessel()).toEqual(["c-fefo-2", "c-fefo-1"]);
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

/**
 * DRK-297, Aufgabe 11, Schritt 6 — `detail.chargen` enthaelt ab jetzt auch
 * Chargen, die NUR im Fahrzeug liegen. Die Ablauf-Plakette am Artikel bleibt
 * trotzdem auf den Handlager-Bereich gescopet: der Mindestbestand, die
 * Verfallsliste und die Kacheln beziehen sich auf ihn, und Fahrzeug-Chargen
 * werden ueber den naechsten Fahrzeug-Check bereinigt (§5.2.1).
 */
describe("ArtikelDrawer: Ablauf-Plakette am Artikel (DRK-297, Aufgabe 11)", () => {
  it("zeigt die Plakette weiterhin fuer eine faellige Charge mit Handlager-Rest", async () => {
    await drawerMounten();
    expect(queryPortal(".ant-drawer-body").textContent).toContain("Charge fällig 12/26");
  });

  it("die Ablauf-Plakette springt nicht auf reinen Fahrzeugbestand an", async () => {
    // CHARGE_NUR_RTW ist abgelaufen und liegt ausschliesslich im RTW.
    mocks.getDetail.mockResolvedValue({
      ok: true,
      wert: {
        ...DETAIL,
        chargen: [
          {
            id: "c-nur-rtw",
            chargenNr: "NUR-RTW",
            verfall: "2026-01",
            rest: 0,
            restGesamt: 5,
            orte: [{ id: "f1", name: "RTW 1", menge: 5, zugangshinweis: null }],
            ampel: "rot" as const,
            text: "abgelaufen",
          },
        ],
      },
    });

    await drawerMounten();

    expect(queryPortal(".ant-drawer-body").textContent).not.toContain("Charge abgelaufen");
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

/**
 * DRK-338 — DAS UMLAGERN IM HANDLAGER.
 *
 * Was diese Faelle tragen:
 *
 *   - „Von" fuehrt NUR die Orte des Handlagers, an denen die GEWAEHLTE Charge
 *     wirklich liegt. Der Traeger ist eine Charge, die in Schrank 1 UND im
 *     RTW liegt: das Fahrzeug darf dort nicht auftauchen (es waere ein Ziel,
 *     das der Server danach ablehnen MUSS), und ein Schrank ohne Bestand
 *     dieser Charge ebenso wenig.
 *   - Der Chargenwechsel SETZT die Quelle zurueck. Ohne das bliebe ein
 *     Schrank stehen, an dem die neue Charge gar nicht liegt.
 *   - Die Nutzlast traegt Charge, Quelle, Ziel und Menge — und zwar genau die
 *     gewaehlten.
 *   - Der Fehlersatz der Action steht AM Formular, nicht 900px darueber
 *     (dieselbe Zusage wie fuer Zugang und Entnahme).
 *   - Bei nur EINEM Ort im Handlager gibt es kein Formular, sondern einen
 *     Satz, der sagt warum.
 */
describe("ArtikelDrawer: Umlagern im Handlager (DRK-338)", () => {
  const DETAIL_MIT_SCHRAENKEN = {
    ...DETAIL,
    chargen: [
      {
        ...DETAIL.chargen[0],
        restGesamt: 11,
        // DIESELBE Charge an drei Orten — zwei davon im Handlager, einer ein
        // Fahrzeug. Genau daran haengt der Filter.
        orte: [
          { id: "schrank-1", name: "Schrank 1", menge: 4, zugangshinweis: null },
          { id: "schrank-gf", name: "GF-Schrank", menge: 2, zugangshinweis: "LvD anrufen" },
          { id: "f1", name: "RTW 1", menge: 5, zugangshinweis: null },
        ],
      },
      {
        ...DETAIL.chargen[1],
        restGesamt: 3,
        orte: [{ id: "schrank-gf", name: "GF-Schrank", menge: 3, zugangshinweis: null }],
      },
    ],
    zielOrte: [
      { id: HANDLAGER_ID, name: "Handlager (ohne Schrank)", zugangshinweis: null },
      { id: "schrank-1", name: "Schrank 1", zugangshinweis: null },
      { id: "schrank-gf", name: "GF-Schrank", zugangshinweis: "LvD anrufen" },
    ],
    handlagerOrtIds: [HANDLAGER_ID, "schrank-1", "schrank-gf"],
  };

  async function mitSchraenken(): Promise<void> {
    mocks.getDetail.mockResolvedValue({ ok: true, wert: DETAIL_MIT_SCHRAENKEN });
    await drawerMounten();
  }

  /**
   * ⚠️ GESUCHT WIRD IN DER SICHTBAREN LISTE, nicht im ganzen Body.
   *
   * Zwei Fallen liegen hier dicht beieinander, und beide machen den Test
   * GRUEN, ohne zu pruefen, was er behauptet:
   *
   * 1. antd laesst ein einmal geoeffnetes Auswahlfeld samt Liste im DOM
   *    stehen und markiert sie nur mit `ant-select-dropdown-hidden`. Ein
   *    Suchlauf ueber `document.body` trifft deshalb auch die Optionen der
   *    zuvor geoeffneten Felder — und die Zugangsform fuehrt unter „Wohin"
   *    dieselben Ortsnamen.
   * 2. `aria-controls` zeigt NICHT auf die sichtbare Liste, sondern auf die
   *    versteckte Hilfsliste von rc-select, die die ROHEN WERTE traegt
   *    (gemessen: `schrank-gf` statt „GF-Schrank · 3 Stk"). Ein Greifer
   *    darauf findet die Beschriftungen nie.
   *
   * Es kann immer nur EIN Feld offen sein — das Oeffnen des naechsten
   * schliesst das vorige. Die sichtbare Liste ist damit eindeutig.
   */
  function offeneListe(): HTMLElement {
    const listen = document.body
      .querySelectorAll<HTMLElement>(".ant-select-dropdown:not(.ant-select-dropdown-hidden)");
    if (listen.length !== 1) {
      throw new Error(`Genau eine offene Auswahlliste erwartet, ${listen.length} gefunden`);
    }
    return listen[0]!;
  }

  async function oeffne(ariaLabel: string): Promise<void> {
    const input = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
    if (input.disabled) throw new Error(`Auswahlfeld ist gesperrt: ${ariaLabel}`);
    await act(async () => {
      input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
    });
    await warte();
  }

  /** Die Beschriftungen der Optionen GENAU dieses Auswahlfelds. */
  async function optionenVon(ariaLabel: string): Promise<string[]> {
    await oeffne(ariaLabel);
    return Array.from(offeneListe().querySelectorAll<HTMLElement>(".ant-select-item-option"))
      .map((element) => element.textContent ?? "");
  }

  /**
   * Was in einem Auswahlfeld GEWAEHLT dasteht — leer, wenn nichts gewaehlt ist.
   *
   * ⚠️ Es gibt keinen Weg an die Form-Instanz der Insel; geprueft wird also
   * das, was auch die Bedienende sieht. Das ist hier sogar die schaerfere
   * Probe: ein stehengebliebener Wert ohne passende Option zeigt antd als
   * NACKTE KENNUNG an, und genau das soll nicht passieren.
   */
  function auswahlText(ariaLabel: string): string {
    const feld = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`).closest(".ant-select");
    // ⚠️ `.ant-select-content-has-value` UND NICHT `.ant-select-selection-item`.
    // antd 6 rendert die gewaehlte Beschriftung in `.ant-select-content` und
    // setzt die zweite Klasse nur, wenn wirklich etwas gewaehlt ist; der aus
    // aelteren Fassungen bekannte Greifer findet HIER GAR NICHTS — und ein
    // Test, der auf „leer" zusichert, waere damit gruen, ohne je etwas
    // gemessen zu haben. Gemessen am offenen Drawer, nicht vermutet.
    return feld?.querySelector(".ant-select-content-has-value")?.textContent ?? "";
  }

  /** Wie `selectOption`, aber auf die sichtbare Liste eingegrenzt. */
  async function waehle(ariaLabel: string, text: string): Promise<void> {
    await oeffne(ariaLabel);
    const option = Array
      .from(offeneListe().querySelectorAll<HTMLElement>(".ant-select-item-option"))
      .find((element) => (element.textContent ?? "").includes(text));
    if (!option) throw new Error(`Option nicht gefunden an ${ariaLabel}: ${text}`);
    await clickElement(option);
    await warte();
  }

  it("sagt bei nur einem Ort im Handlager, warum es nichts zu tun gibt", async () => {
    await drawerMounten();
    expect(existsPortal("[data-rolle='umlager-form']")).toBe(false);
    expect(queryPortal(".ant-drawer-body").textContent).toContain("nur einen Ort im Handlager");
  });

  it("bietet als Quelle nur die Handlager-Orte DIESER Charge — kein Fahrzeug", async () => {
    await mitSchraenken();
    await waehle("Umlagerung Charge", "ZZZ-ALT");

    const quellen = await optionenVon("Von");
    expect(quellen.some((text) => text.includes("Schrank 1"))).toBe(true);
    expect(quellen.some((text) => text.includes("GF-Schrank"))).toBe(true);
    // ⚠️ DER KERN DES FILTERS: das Fahrzeug traegt 5 Stueck derselben Charge
    // und steht trotzdem nicht zur Wahl.
    expect(quellen.some((text) => text.includes("RTW 1"))).toBe(false);
    // Die Menge am Ort steht dabei — sonst muesste man sie aus der Tabelle
    // darunter abschreiben.
    expect(quellen.some((text) => text.includes("4 Stk"))).toBe(true);
  });

  it("bietet als Quelle nichts an, was zur anderen Charge nicht passt", async () => {
    await mitSchraenken();
    await waehle("Umlagerung Charge", "AAA-NEU");

    const quellen = await optionenVon("Von");
    expect(quellen.some((text) => text.includes("GF-Schrank"))).toBe(true);
    expect(quellen.some((text) => text.includes("Schrank 1"))).toBe(false);
  });

  it("schickt Charge, Quelle, Ziel und Menge genau so, wie sie gewaehlt wurden", async () => {
    await mitSchraenken();
    await waehle("Umlagerung Charge", "ZZZ-ALT");
    await waehle("Von", "Schrank 1");
    await waehle("Nach", "GF-Schrank");
    await fillPortal("[aria-label='Umlagerungsmenge']", "3");

    await submitPortalForm("[data-rolle='umlager-form']");
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

    expect(mocks.bucheUmlagerung).toHaveBeenCalledTimes(1);
    expect(mocks.bucheUmlagerung.mock.calls[0]![0]).toMatchObject({
      artikelId: "a1",
      chargeId: "c-fefo-1",
      vonLagerortId: "schrank-1",
      nachLagerortId: "schrank-gf",
      menge: 3,
    });
  });

  it("setzt die Quelle zurueck, wenn die Charge wechselt", async () => {
    await mitSchraenken();
    await waehle("Umlagerung Charge", "ZZZ-ALT");
    await waehle("Von", "Schrank 1");
    expect(queryPortal<HTMLInputElement>("[aria-label='Von']")
      .closest(".ant-select")?.textContent).toContain("Schrank 1");

    await waehle("Umlagerung Charge", "AAA-NEU");
    // ⚠️ „Schrank 1" fuehrt von der neuen Charge nichts — bliebe die Wahl
    // stehen, waere sie eine Quelle, die der Server ablehnen MUSS.
    expect(queryPortal<HTMLInputElement>("[aria-label='Von']")
      .closest(".ant-select")?.textContent).not.toContain("Schrank 1");
  });

  /**
   * ⚠️ EIN FELD AUS DER AUSWAHL ZU NEHMEN LOESCHT SEINEN WERT NICHT
   * (Review-Befund Codex P2 zu PR #161). „Nach" filtert den gewaehlten
   * Quellort heraus — das hilft aber nur, wenn die Quelle ZUERST gewaehlt
   * wird. Wer umgekehrt erst das Ziel waehlt und dann denselben Ort als
   * Quelle, behaelt ihn als Formularwert: die Auswahl zeigt die nackte
   * Kennung, und das Absenden laeuft in „Quelle und Ziel muessen verschieden
   * sein" — an einer Bedienfolge, die nichts Falsches tut.
   */
  it("leert das Ziel, wenn es zur neu gewaehlten Quelle wird", async () => {
    await mitSchraenken();
    await waehle("Umlagerung Charge", "ZZZ-ALT");
    // ZIEL ZUERST — in dieser Reihenfolge steht „GF-Schrank" noch zur Wahl.
    await waehle("Nach", "GF-Schrank");
    await waehle("Von", "GF-Schrank");

    expect(auswahlText("Nach"), "das Ziel muss leer sein").toBe("");

    // Und das Absenden laeuft in die FELDpruefung, nicht in die Action: ein
    // stehengebliebenes Ziel haette `bucheUmlagerung` mit von === nach
    // gerufen.
    await submitPortalForm("[data-rolle='umlager-form']");
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });
    expect(mocks.bucheUmlagerung).not.toHaveBeenCalled();
  });

  /** Die Gegenprobe: ein Ziel, das NICHT die neue Quelle ist, bleibt stehen. */
  it("laesst ein Ziel stehen, das nicht die neue Quelle ist", async () => {
    await mitSchraenken();
    await waehle("Umlagerung Charge", "ZZZ-ALT");
    await waehle("Nach", "Handlager (ohne Schrank)");
    await waehle("Von", "GF-Schrank");

    expect(auswahlText("Nach")).toBe("Handlager (ohne Schrank)");
  });

  it("zeigt den Fehlersatz der Action AM Umlagerungsformular", async () => {
    mocks.bucheUmlagerung.mockResolvedValue({
      ok: false,
      fehler: "In „Schrank 1“ liegen nur 4 Stück dieser Charge.",
    });
    await mitSchraenken();
    await waehle("Umlagerung Charge", "ZZZ-ALT");
    await waehle("Von", "Schrank 1");
    await waehle("Nach", "GF-Schrank");

    await submitPortalForm("[data-rolle='umlager-form']");
    await act(async () => { for (let i = 0; i < 10; i++) await Promise.resolve(); });

    const formular = queryPortal("[data-rolle='umlager-form']");
    expect(formular.textContent).toContain("liegen nur 4 Stück");
  });
});
