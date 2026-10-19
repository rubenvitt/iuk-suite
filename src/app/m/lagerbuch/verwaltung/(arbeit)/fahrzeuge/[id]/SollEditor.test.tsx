// @vitest-environment jsdom

import { act } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import type { SollZeile } from "../../../../_lib/lesepfade/fahrzeuge";
import {
  fachFilter,
  faecherJeArtikelZaehlen,
  OFFEN_BIS_POSITIONEN,
  sollNachFach,
  sollTrifft,
  SollEditor,
} from "./SollEditor";

/**
 * DER RAHMEN UM DIE BREITE DARSTELLUNG (DRK-451).
 *
 * ⚠️ SEIT DIESE TABELLE EINE `Kartentabelle` IST, STEHT JEDE ZEILE ZWEIMAL IM
 * BAUM — einmal als Tabellenzeile, einmal als Karte. jsdom wertet die Media
 * Query nicht aus, dort sind also BEIDE „da", und ein Greifer ueber eine
 * Klasse oder eine `data-rolle` findet jeden Wert doppelt.
 *
 * ⚠️ `thead`- UND `tbody`-GREIFER BRAUCHEN IHN NICHT — eine Karte hat weder
 * das eine noch das andere. Eingerahmt wird nur, was ohne sie greift.
 */
const BREIT = '[data-rolle="breitansicht"]';


const mocks = vi.hoisted(() => ({
  setzen: vi.fn(),
  entfernen: vi.fn(),
  wiederherstellen: vi.fn(),
}));

vi.mock("../../../../_actions/fahrzeuge", () => ({
  sollPositionSetzen: (...args: unknown[]) => mocks.setzen(...args),
  sollPositionEntfernen: (...args: unknown[]) => mocks.entfernen(...args),
  sollPositionWiederherstellen: (...args: unknown[]) => mocks.wiederherstellen(...args),
}));

const POSITIONEN: SollZeile[] = [
  {
    id: "p-b1",
    fachLabel: "Fach B",
    sort: 1,
    artikelId: "a-b1",
    artikelName: "Beatmungsbeutel",
    einheit: "Stk",
    handlagerFach: "H2",
    soll: 1,
    fahrzeugBestand: 1,
    handlagerBestand: 4,
    herkunft: "manuell",
    entfernt: false,
    immerZaehlen: false,
    sollMax: null,
  },
  {
    id: "p-a2",
    fachLabel: "Fach A",
    sort: 2,
    artikelId: "a-a2",
    artikelName: "Kompressen",
    einheit: "Pck",
    handlagerFach: "C3",
    soll: 2,
    fahrzeugBestand: 0,
    handlagerBestand: 7,
    herkunft: "vorlage",
    entfernt: true,
    immerZaehlen: false,
    sollMax: null,
  },
  {
    id: "p-c1",
    fachLabel: "Fach C",
    sort: 0,
    artikelId: "a-c1",
    artikelName: "Dreiecktuch",
    einheit: "Stk",
    handlagerFach: "D1",
    soll: 3,
    fahrzeugBestand: 2,
    handlagerBestand: 8,
    herkunft: "ueberschrieben",
    entfernt: false,
    immerZaehlen: false,
    sollMax: null,
  },
  {
    id: "p-a1",
    fachLabel: "Fach A",
    sort: 1,
    artikelId: "a-a1",
    artikelName: "Mullbinde",
    einheit: "Rol",
    handlagerFach: "C2",
    soll: 3,
    fahrzeugBestand: 2,
    handlagerBestand: 9,
    herkunft: "vorlage",
    entfernt: false,
    immerZaehlen: false,
    sollMax: null,
  },
];

const ARTIKEL = [
  { id: "a-neu", name: "Pflaster", fach: "C3" },
  { id: "a-anderer", name: "Schere", fach: "A1" },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function waehleOption(label: string, text: string): Promise<void> {
  const input = query<HTMLInputElement>(`[aria-label='${label}']`);
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(
    ".ant-select-item-option",
  )).find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Option nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

/**
 * IDA-232: das Soll ist ein Lesemodus. Mengenfeld, Kästchen und Entfernen
 * gibt es erst nach dem Schalter „Bearbeiten".
 */
async function bearbeiten(): Promise<void> {
  const schalter = query<HTMLButtonElement>("button[role='switch']");
  if (schalter.getAttribute("aria-checked") !== "true") await clickElement(schalter);
  await warte();
}

async function mountSoll(positionen: SollZeile[] = POSITIONEN): Promise<void> {
  await mount(<SollEditor fahrzeugId="fz-1" positionen={positionen} artikel={ARTIKEL} />);
}

/** Öffnet oben die Zeile für eine neue Position. */
async function neuePositionOeffnen(): Promise<void> {
  await clickElement(knopf("Position hinzufügen"));
  await warte();
}

function knopf(text: string): HTMLButtonElement {
  const treffer = queryAll<HTMLButtonElement>("button")
    .find((button) => (button.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Knopf nicht gefunden: ${text}`);
  return treffer;
}

async function entfernenBestaetigen(
  ariaLabel = "Beatmungsbeutel aus Fach Fach B entfernen",
): Promise<void> {
  await clickElement(query<HTMLButtonElement>(
    `button[aria-label='${ariaLabel}']`,
  ));
  await warte();
  const bestaetigen = Array.from(document.body.querySelectorAll<HTMLButtonElement>(
    ".ant-popconfirm-buttons button",
  )).find((button) => (button.textContent ?? "").includes("Entfernen"));
  if (!bestaetigen) throw new Error("Entfernen-Bestaetigung fehlt");
  await clickElement(bestaetigen);
  await warte();
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.setzen.mockResolvedValue({ ok: true, wert: { id: "p-neu" } });
  mocks.entfernen.mockResolvedValue({ ok: true });
  mocks.wiederherstellen.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("SollEditor — Fachgruppen (IDA-232)", () => {
  it("gruppiert eine Kopie nach Fach, innerhalb nach Sortierung", () => {
    const gruppen = sollNachFach(POSITIONEN);
    expect(gruppen.map((gruppe) => ({
      fach: gruppe.fach,
      ids: gruppe.positionen.map((position) => position.id),
      aktiv: gruppe.aktiv,
      entfernt: gruppe.entfernt,
    }))).toEqual([
      { fach: "Fach A", ids: ["p-a1", "p-a2"], aktiv: 1, entfernt: 1 },
      { fach: "Fach B", ids: ["p-b1"], aktiv: 1, entfernt: 0 },
      { fach: "Fach C", ids: ["p-c1"], aktiv: 1, entfernt: 0 },
    ]);
    expect(POSITIONEN.map((position) => position.id)).toEqual([
      "p-b1",
      "p-a2",
      "p-c1",
      "p-a1",
    ]);
  });

  it("sucht über Artikel, Fach der Einheit und Handlager-Fach", () => {
    expect(sollTrifft(POSITIONEN[0]!, "beatmung")).toBe(true);
    expect(sollTrifft(POSITIONEN[0]!, "fach b")).toBe(true);
    expect(sollTrifft(POSITIONEN[0]!, "h2")).toBe(true);
    expect(sollTrifft(POSITIONEN[0]!, "mullbinde")).toBe(false);
    expect(sollTrifft(POSITIONEN[0]!, "  ")).toBe(true);
  });

  /**
   * ⚠️ DIE FACHÜBERSCHRIFT STEHT ÜBER IHRER GRUPPE — der Befund war ein
   * `rowSpan`-Fach, senkrecht mittig über bis zu 21 Zeilen und beim Scrollen
   * meist unsichtbar.
   */
  it("setzt je Fach eine Überschrift mit Zähler und eine eigene Tabelle", async () => {
    await mountSoll();

    expect(queryAll("[data-rolle='fachkopf']").map((kopf) => kopf.textContent))
      .toEqual(["Fach A", "Fach B", "Fach C"]);
    expect(document.body.textContent).toContain("1 Position · 1 entfernt");
    expect(queryAll("table").map((tabelle) => tabelle.getAttribute("aria-label")))
      .toEqual(["Soll-Bestückung Fach A", "Soll-Bestückung Fach B", "Soll-Bestückung Fach C"]);
    expect(queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key")))
      .toEqual(["p-a1", "p-a2", "p-b1", "p-c1"]);
    // Keine zusammengefasste Zelle mehr, die falsch werden könnte.
    expect(queryAll("td[rowspan]")).toHaveLength(0);
  });

  it("liest im Lesemodus nur und zeigt „immer zählen“ als Kennzeichen", async () => {
    await mountSoll([{ ...POSITIONEN[3]!, immerZaehlen: true }, POSITIONEN[0]!]);

    expect(queryAll("table")[0]!.querySelectorAll("thead th")).toHaveLength(4);
    expect(Array.from(queryAll("table")[0]!.querySelectorAll("thead th")).map((th) => th.textContent))
      .toEqual(["Artikel", "Ist", "Soll", "Herkunft"]);
    expect(queryAll(`${BREIT} .ant-input-number`)).toHaveLength(0);
    expect(queryAll(`${BREIT} .ant-checkbox`)).toHaveLength(0);
    expect(queryAll(`${BREIT} button[aria-label$='entfernen']`)).toHaveLength(0);
    expect(query(`${BREIT} tr[data-row-key='p-a1'] [data-rolle='soll']`).textContent).toBe("3 Rol");
    expect(query(`${BREIT} tr[data-row-key='p-a1']`).textContent).toContain("immer zählen");
    expect(query(`${BREIT} tr[data-row-key='p-b1']`).textContent).not.toContain("immer zählen");
  });

  it("schaltet mit „Bearbeiten“ Mengenfeld, Kästchen und Entfernen frei", async () => {
    await mountSoll();
    await bearbeiten();

    expect(Array.from(queryAll("table")[0]!.querySelectorAll("thead th")).map((th) => th.textContent))
      .toEqual(["Artikel", "Ist", "Soll", "OK bis", "Immer zählen", "Herkunft", "Aktion"]);
    // KEIN size="small" (Arbeitsdichte, WCAG 2.5.5) -- die vier Soll- und
    // vier „OK bis“-Felder tragen die volle 44px-Bedienhoehe, keine
    // `-sm`-Modifikatorklasse.
    expect(queryAll("tbody .ant-input-number")).toHaveLength(8);
    expect(queryAll("tbody .ant-input-number-sm")).toHaveLength(0);
    // Rot ist fachlich belegt (Falle 3) — der Entfernen-Knopf ist neutral.
    expect(queryAll(`${BREIT} .ant-btn-dangerous`)).toHaveLength(0);
  });

  it("beginnt ein großes Soll zugeklappt und klappt Suchtreffer auf", async () => {
    const viele: SollZeile[] = Array.from({ length: OFFEN_BIS_POSITIONEN + 1 }, (_, i) => ({
      ...POSITIONEN[0]!,
      id: `p-${i}`,
      artikelId: `a-${i}`,
      artikelName: i === 7 ? "Pflaster gross" : `Artikel ${i}`,
      fachLabel: `Fach ${i % 3}`,
      sort: i,
    }));
    await mountSoll(viele);

    expect(queryAll("[data-rolle='fachkopf']")).toHaveLength(3);
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(0);

    await fill("input[aria-label='Artikel oder Fach suchen…']", "pflaster");
    await act(async () => { await vi.advanceTimersByTimeAsync(250); });
    await warte();

    // Nur das Fach mit dem Treffer bleibt, und es steht offen.
    expect(queryAll("[data-rolle='fachkopf']").map((kopf) => kopf.textContent)).toEqual(["Fach 1"]);
    expect(queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key")))
      .toEqual(["p-7"]);
  });

  /**
   * DRK-315. Die Groesse selbst sieht jsdom nicht (kein Layout) — hier steht
   * nur, dass der Ist in eigener Zelle mit der Zahlrolle steht und nicht mehr
   * im Nebentext. Die gerenderte Groesse misst `e2e/lagerbuch-ist-bestand.spec.ts`.
   */
  it("setzt den Ist als grosse Zahl in eigene Spalte, getrennt vom Handlager", async () => {
    await mountSoll();

    const ist = queryAll(`${BREIT} [data-rolle='ist']`);
    expect(ist.map((zelle) => zelle.textContent)).toEqual([
      "2 Rol",
      "0 Pck",
      "1 Stk",
      "2 Stk",
    ]);
    const zahl = ist[0].querySelector("span span") as HTMLElement;
    expect(zahl.style.fontSize).toBe("24px");
    expect(zahl.style.fontVariantNumeric).toBe("tabular-nums");
    // Der Grabstein zeigt den echten Bestand, aber gedaempft.
    expect(ist[1].getAttribute("style")).toContain("opacity: 0.6");
    expect(ist[0].getAttribute("style")).not.toContain("opacity");

    const artikelZeile = queryAll("tbody tr[data-row-key]")[0];
    expect(artikelZeile.textContent).toContain("Handlager 9 Rol");
    expect(artikelZeile.textContent).not.toContain("Fahrzeug 2");
  });

  it("sagt dazu, wenn derselbe Bestand fuer mehrere Faecher gilt", async () => {
    const geteilt: SollZeile[] = [
      { ...POSITIONEN[3], id: "p-x1", fachLabel: "Fach A" },
      { ...POSITIONEN[3], id: "p-x2", fachLabel: "Fach B" },
      { ...POSITIONEN[3], id: "p-x3", fachLabel: "Fach C", entfernt: true },
      { ...POSITIONEN[0] },
    ];
    expect(faecherJeArtikelZaehlen(geteilt)).toEqual(new Map([
      ["a-a1", 2],
      ["a-b1", 1],
    ]));

    await mountSoll(geteilt);
    // Reihenfolge nach `sollNachFach`: Fach A · Fach B (p-b1 vor p-x2) · Fach C.
    // Auch der Grabstein in Fach C traegt den Hinweis — er zeigt denselben Bestand.
    expect(queryAll(`${BREIT} [data-rolle='ist']`).map((zelle) => zelle.textContent)).toEqual([
      "2 Rolgesamt für 2 Fächer",
      "1 Stk",
      "2 Rolgesamt für 2 Fächer",
      "2 Rolgesamt für 2 Fächer",
    ]);
  });

  it("zeigt Grabsteine durchgestrichen mit Chip und — beim Bearbeiten — Restore-Weg", async () => {
    await mountSoll();

    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(4);
    const grabstein = query("[data-rolle='grabstein']");
    expect(grabstein.textContent).toContain("Kompressen");
    expect(grabstein.textContent).toContain("entfernt");
    expect(grabstein.getAttribute("style")).toContain("line-through");
    expect(queryAll("[data-rolle='wiederherstellen']")).toHaveLength(0);

    await bearbeiten();
    expect(query("[data-rolle='wiederherstellen']").textContent).toContain("zurücksetzen");
  });

  it("filtert den typed Artikel-Select ueber Name und Handlager-Fach", () => {
    expect(fachFilter("pflast", { value: "a-neu", label: "Pflaster", keywords: "C3" }))
      .toBe(true);
    expect(fachFilter("c3", { value: "a-neu", label: "Pflaster", keywords: "C3" }))
      .toBe(true);
    expect(fachFilter("z9", { value: "a-neu", label: "Pflaster", keywords: "C3" }))
      .toBe(false);
  });
});

describe("SollEditor — auto-committende Sollmenge", () => {
  it("committet bei 399 ms noch nicht und bei 400 ms den vollstaendigen Payload", async () => {
    await mountSoll();
    await bearbeiten();
    await fill("input[aria-label='Soll für Mullbinde']", "5");

    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(mocks.setzen).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith({
      id: "p-a1",
      fahrzeugId: "fz-1",
      fachLabel: "Fach A",
      artikelId: "a-a1",
      soll: 5,
      sollMax: null,
      sort: 1,
    });
  });

  it("speichert „OK bis“ entprellt mit dem Soll und zeigt den Bereich im Lesemodus (IDA-247)", async () => {
    await mountSoll();
    await bearbeiten();

    await fill("input[aria-label='OK bis für Mullbinde']", "6");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith(expect.objectContaining({
      id: "p-a1", soll: 3, sollMax: 6,
    }));

    // Zurueck in den Lesemodus.
    await clickElement(query<HTMLButtonElement>("button[role='switch']"));
    await warte();
    const zeile = Array.from(queryAll("tr")).find((tr) => tr.textContent?.includes("Mullbinde"))!;
    expect(zeile.querySelector("[data-rolle='soll']")!.textContent).toContain("3–6");
  });

  it("ersetzt einen schnellen Entwurf und sendet nur den neuesten Wert", async () => {
    await mountSoll();
    await bearbeiten();
    await fill("input[aria-label='Soll für Mullbinde']", "5");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await fill("input[aria-label='Soll für Mullbinde']", "7");
    await act(async () => { await vi.advanceTimersByTimeAsync(399); });
    expect(mocks.setzen).not.toHaveBeenCalled();
    await act(async () => { await vi.advanceTimersByTimeAsync(1); });
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith(expect.objectContaining({
      id: "p-a1",
      soll: 7,
    }));
  });

  /**
   * IDA-232: beim Zurückschalten in den Lesemodus verschwinden die Felder samt
   * `onBlur` — der entprellte Wert wird deshalb SOFORT geschrieben, nicht
   * verworfen und nicht erst nach Ablauf der Frist.
   */
  it("zieht beim Verlassen des Bearbeitens den ausstehenden Wert vor", async () => {
    await mountSoll();
    await bearbeiten();
    await fill("input[aria-label='Soll für Mullbinde']", "6");
    await clickElement(query("button[role='switch']"));
    await warte();

    expect(mocks.setzen).toHaveBeenCalledTimes(1);
    expect(mocks.setzen).toHaveBeenCalledWith(expect.objectContaining({ id: "p-a1", soll: 6 }));
    // Und der Lesemodus zeigt den neuen Wert, nicht den alten.
    expect(query(`${BREIT} tr[data-row-key='p-a1'] [data-rolle='soll']`).textContent).toBe("6 Rol");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mocks.setzen).toHaveBeenCalledTimes(1);
  });

  it("raeumt beim Unmount alle ausstehenden Timer auf", async () => {
    await mountSoll();
    await bearbeiten();
    await fill("input[aria-label='Soll für Mullbinde']", "9");
    await unmount();
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    expect(mocks.setzen).not.toHaveBeenCalled();
  });

  it("cancelt ein ausstehendes Soll-Edit, bevor dieselbe Vorlagenposition entfernt wird", async () => {
    await mountSoll();
    await bearbeiten();
    await fill("input[aria-label='Soll für Mullbinde']", "9");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });

    await entfernenBestaetigen("Mullbinde aus Fach Fach A entfernen");
    await act(async () => { await vi.advanceTimersByTimeAsync(200); });
    await warte();

    expect(mocks.entfernen).toHaveBeenCalledWith({ id: "p-a1" });
    expect(mocks.setzen).not.toHaveBeenCalled();
  });

  /**
   * ZWEI GETRENNTE ZUSAGEN: der lokale Wert bleibt in BEIDEN Faellen stehen,
   * der TEXT unterscheidet sich. Bei `ok:false` steht der Satz aus der Action
   * da — `sollPositionSetzen` unterscheidet „Einheit nicht gefunden." von
   * „Soll-Position nicht gefunden." von einem Schreibfehler, und nur dieser
   * Satz sagt der Person, ob neu laden oder etwas anderes eintragen hilft. Im
   * Wurf bleibt die Modulkonstante: dort ist `e.message` in Produktion
   * Framework-Englisch (siehe `_lib/actionErgebnis`).
   */
  it.each([
    [
      "ok:false",
      async () => ({ ok: false as const, fehler: "Soll-Position nicht gefunden." }),
      "Soll-Position nicht gefunden.",
    ],
    [
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht gespeichert werden.",
    ],
  ] as const)("behaelt bei Edit-%s den lokalen Wert und zeigt eine Warning", async (
    _fall,
    antwort,
    text,
  ) => {
    mocks.setzen.mockImplementationOnce(antwort);
    await mountSoll();
    await bearbeiten();
    await fill("input[aria-label='Soll für Mullbinde']", "8");
    await act(async () => { await vi.advanceTimersByTimeAsync(400); });
    await warte();

    expect(query<HTMLInputElement>("input[aria-label='Soll für Mullbinde']").value).toBe("8");
    expect(query(".ant-alert-warning").textContent).toContain(text);
    expect(document.body.textContent).not.toContain("Framework-Text");
  });
});

describe("SollEditor — immer zaehlen (IDA-223)", () => {
  it("speichert den Schalter sofort, mit dem noch entprellten Soll", async () => {
    await mountSoll();
    await bearbeiten();
    await fill("input[aria-label='Soll für Mullbinde']", "5");
    await clickElement(query(
      `${BREIT} input[aria-label='Mullbinde in jedem Kurzcheck zählen']`));
    await warte();

    expect(mocks.setzen).toHaveBeenCalledWith({
      id: "p-a1", fahrzeugId: "fz-1", fachLabel: "Fach A", artikelId: "a-a1",
      soll: 5, sort: 1, immerZaehlen: true,
    });
  });

  it("sperrt den Schalter an einem Grabstein", async () => {
    await mountSoll();
    await bearbeiten();
    expect(query<HTMLInputElement>(
      `${BREIT} input[aria-label='Kompressen in jedem Kurzcheck zählen']`).disabled).toBe(true);
  });
});

describe("SollEditor — Hinzufuegen, Entfernen und Wiederherstellen", () => {
  it("bietet das Hinzufügen oben an, ohne erst bearbeiten zu müssen", async () => {
    await mountSoll();
    expect(queryAll("[data-rolle='neue-position']")).toHaveLength(0);
    await neuePositionOeffnen();
    expect(queryAll("[data-rolle='neue-position']")).toHaveLength(1);
    // Die Zeile steht VOR den Fächern, nicht unter einer langen Liste.
    const zeile = query("[data-rolle='neue-position']");
    const erstesFach = query("[data-rolle='fachkopf']");
    expect(zeile.compareDocumentPosition(erstesFach) & Node.DOCUMENT_POSITION_FOLLOWING)
      .toBeTruthy();
  });

  it("sendet beim Hinzufuegen den exakten Payload und leert nur nach Erfolg", async () => {
    await mountSoll();
    await neuePositionOeffnen();
    await fill("input[aria-label='Fach']", " Fach Neu ");
    await waehleOption("Artikel", "Pflaster");
    await fill("input[aria-label='Soll']", "4");
    await clickElement(knopf("Hinzufügen"));
    await warte();

    expect(mocks.setzen).toHaveBeenCalledWith({
      fahrzeugId: "fz-1",
      fachLabel: "Fach Neu",
      artikelId: "a-neu",
      soll: 4,
    });
    expect(query<HTMLInputElement>("input[aria-label='Fach']").value).toBe(" Fach Neu ");
    expect(query<HTMLInputElement>("input[aria-label='Soll']").value).toBe("1");
    expect(query("[aria-label='Artikel']").getAttribute("value") ?? "").toBe("");
  });

  it.each([
    [
      "ok:false",
      async () => ({ ok: false as const, fehler: "Einheit nicht gefunden." }),
      "Einheit nicht gefunden.",
    ],
    [
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht gespeichert werden.",
    ],
  ] as const)("behaelt Add-Felder bei %s und zeigt den Fehler", async (
    _fall,
    antwort,
    text,
  ) => {
    mocks.setzen.mockImplementationOnce(antwort);
    await mountSoll();
    await neuePositionOeffnen();
    await fill("input[aria-label='Fach']", "Fach X");
    await waehleOption("Artikel", "Pflaster");
    await fill("input[aria-label='Soll']", "6");
    await clickElement(knopf("Hinzufügen"));
    await warte();

    expect(query<HTMLInputElement>("input[aria-label='Fach']").value).toBe("Fach X");
    expect(query<HTMLInputElement>("input[aria-label='Soll']").value).toBe("6");
    expect(query("[data-rolle='neue-position']").textContent).toContain("Pflaster");
    expect(query(".ant-alert-warning").textContent).toContain(text);
    expect(document.body.textContent).not.toContain("Framework-Text");
  });

  it("wertet Entfernen und Wiederherstellen mit ihren echten IDs aus", async () => {
    await mountSoll();
    await bearbeiten();
    await entfernenBestaetigen();
    await clickElement(query("[data-rolle='wiederherstellen']"));
    await warte();

    expect(mocks.entfernen).toHaveBeenCalledWith({ id: "p-b1" });
    expect(mocks.wiederherstellen).toHaveBeenCalledWith({ id: "p-a2" });
  });

  it.each([
    [
      "Entfernen",
      "entfernen",
      "ok:false",
      async () => ({ ok: false as const, fehler: "Soll-Position nicht gefunden." }),
      "Soll-Position nicht gefunden.",
    ],
    [
      "Entfernen",
      "entfernen",
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht entfernt werden.",
    ],
    [
      "Wiederherstellen",
      "wiederherstellen",
      "ok:false",
      async () => ({ ok: false as const, fehler: "Soll-Position nicht gefunden." }),
      "Soll-Position nicht gefunden.",
    ],
    [
      "Wiederherstellen",
      "wiederherstellen",
      "Reject",
      async () => { throw new Error("Framework-Text"); },
      "Soll-Position konnte nicht wiederhergestellt werden.",
    ],
    // Bei `ok:false` der Satz aus der Action, im Wurf die Modulkonstante.
  ] as const)("zeigt bei fehlgeschlagenem %s (%s) den passenden Warning-Text", async (
    _name,
    aktion,
    _fall,
    antwort,
    text,
  ) => {
    mocks[aktion].mockImplementationOnce(antwort);
    await mountSoll();
    await bearbeiten();
    if (aktion === "entfernen") await entfernenBestaetigen();
    else {
      await clickElement(query("[data-rolle='wiederherstellen']"));
      await warte();
    }
    expect(query(".ant-alert-warning").textContent).toContain(text);
    expect(queryAll("tbody tr[data-row-key]")).toHaveLength(4);
  });

  /**
   * ⚠️ KEIN SPALTENFILTER UND KEIN SORTIERER MEHR. Gefiltert wird über die
   * Suche oben, gruppiert nach Fach — und die Reihenfolge innerhalb eines
   * Fachs ist die gepflegte (`sort`), keine, die ein Klick umwirft.
   */
  it("trägt an keiner Spalte Filter oder Sortierer", async () => {
    await mountSoll();
    await bearbeiten();
    expect(queryAll(`${BREIT} .ant-table-filter-trigger`)).toHaveLength(0);
    expect(queryAll(`${BREIT} .ant-table-column-sorters`)).toHaveLength(0);
  });
});
