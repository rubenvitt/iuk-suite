// @vitest-environment jsdom

import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
import { existsSync, readFileSync } from "node:fs";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import {
  clickElement,
  exists,
  fill,
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  TokenTable,
  sucheTrifft,
  zielVon,
  type TokenAnzeigeZeile,
} from "./TokenTable";
import { NeuToken, zielFilter } from "./NeuToken";
import { SeitenKopf } from "../../../_ui/SeitenKopf";
import TokensSeite, { dynamic, tokenAnzeigeZeilen } from "./page";

/**
 * ⚠️ ENTSCHEIDUNG 8-F (T160): Hier standen bis T160 eine `LoeschProbeProps`,
 * ein Mock fuer `_ui/LoeschButton` und drei Mocks fuer `_actions/loeschen`.
 * Sie sind mit dem `LoeschButton`-AUFRUF entfallen — diese Seite kennt keinen
 * Loeschweg mehr. `_ui/LoeschDialog.tsx` und `_ui/LoeschButton.tsx` selbst
 * bleiben unangetastet; fuenf andere Verwaltungsseiten benutzen sie weiter.
 */
const mocks = vi.hoisted(() => ({
  setTokenAktiv: vi.fn(),
  createToken: vi.fn(),
  refresh: vi.fn(),
  getDb: vi.fn(),
  tokenListe: vi.fn(),
  tokenZiele: vi.fn(),
}));

vi.mock("../../../_actions/tokens", () => ({
  setTokenAktiv: (...args: unknown[]) => mocks.setTokenAktiv(...args),
  createToken: (...args: unknown[]) => mocks.createToken(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("../../../_db/client", () => ({
  getDb: (...args: unknown[]) => mocks.getDb(...args),
}));

vi.mock("../../../_lib/lesepfade/tokens", () => ({
  tokenListe: (...args: unknown[]) => mocks.tokenListe(...args),
  tokenZiele: (...args: unknown[]) => mocks.tokenZiele(...args),
}));

/**
 * Kopie von `ohneKommentare()` aus `_lib/bauform.test.ts` (K-4), Vorbild
 * `_lib/pwaIcons.test.ts:19-39`. Der 8-F-Scan weiter unten waere sonst rot an
 * seiner eigenen Begruendung: `TokenTable.tsx` erklaert im Kopfkommentar der
 * Komponente woertlich, dass der `LoeschButton`-Aufruf samt `pruefeLoeschbar`
 * und `loescheElement` entfallen ist — und genau diese Woerter sucht der Scan.
 * Der Kommentar wird NICHT umformuliert, um einen Test gruen zu machen.
 * `bauform.test.ts` exportiert die Funktion nicht, deshalb die lokale Kopie.
 */
function ohneKommentare(quelle: string): string {
  let imBlock = false;
  return quelle
    .split("\n")
    .map((zeile) => {
      if (imBlock) {
        const zu = zeile.indexOf("*/");
        if (zu === -1) return "";
        imBlock = false;
        return " ".repeat(zu + 2) + zeile.slice(zu + 2);
      }
      const auf = zeile.indexOf("/*");
      if (auf !== -1 && !zeile.slice(0, auf).includes("*/")) {
        const zu = zeile.indexOf("*/", auf + 2);
        if (zu === -1) { imBlock = true; return zeile.slice(0, auf); }
        return zeile.slice(0, auf) + " ".repeat(zu + 2 - auf) + zeile.slice(zu + 2);
      }
      return zeile.trimStart().startsWith("//") ? "" : zeile;
    })
    .join("\n");
}

const FAHRZEUG = {
  id: "t1",
  code: "111-111",
  label: "RTW 1 Kärtchen",
  aktiv: true,
  lastUsedText: "30.07.2026, 12:00:00",
  zielTyp: "fahrzeug" as const,
  zielId: "rtw-1",
  zielName: "RTW 1",
} satisfies TokenAnzeigeZeile;

const ARTIKEL = {
  id: "t2",
  code: "222-222",
  label: "Verband direkt",
  aktiv: false,
  lastUsedText: "nie benutzt",
  zielTyp: "artikel" as const,
  zielId: "a1",
  zielName: "Ärzte-Verband",
} satisfies TokenAnzeigeZeile;

const LISTE = {
  id: "t3",
  code: "333-333",
  label: "Regalrunde",
  aktiv: true,
  lastUsedText: "nie benutzt",
  zielTyp: null,
  zielId: null,
  zielName: null,
} satisfies TokenAnzeigeZeile;

const ZEILEN = [FAHRZEUG, ARTIKEL, LISTE];
const ZIELE = {
  fahrzeuge: [
    { id: "rtw-1", name: "RTW Alpha", kennung: "UE-RK 1234" },
    { id: "rtw-2", name: "RTW Beta", kennung: null },
  ],
  artikel: [
    { id: "a1", name: "Mullbinde", fach: "A1" },
    { id: "a2", name: "Kompresse", fach: "Notfallfach" },
  ],
};
const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.setTokenAktiv.mockResolvedValue({ ok: true });
  mocks.createToken.mockResolvedValue({ ok: true, wert: { id: "neu", code: "999-999" } });
  mocks.getDb.mockReturnValue({ kennung: "token-test-db" });
  mocks.tokenListe.mockReturnValue([]);
  mocks.tokenZiele.mockReturnValue(ZIELE);
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

function checkboxMitText(text: string): HTMLElement {
  const checkbox = queryAll<HTMLElement>(".ant-checkbox-wrapper")
    .find((element) => (element.textContent ?? "").includes(text));
  if (!checkbox) throw new Error(`Checkbox fehlt: ${text}`);
  return checkbox;
}

function sichtbareIds(): Array<string | null> {
  return queryAll("tbody tr[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key"));
}

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

function knopfMitText(text: string): HTMLElement {
  const knopf = Array.from(document.body.querySelectorAll<HTMLElement>("button"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!knopf) throw new Error(`Knopf fehlt: ${text}`);
  return knopf;
}

async function oeffneNeuToken(): Promise<void> {
  await clickElement(knopfMitText("Neuen Code anlegen"));
  await warte();
  expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
}

async function portalFeldSetzen(ariaLabel: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(`[aria-label='${ariaLabel}']`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter für ${ariaLabel}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

async function zielartWaehlen(text: string): Promise<void> {
  const label = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-radio-wrapper"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!label) throw new Error(`Zielart fehlt: ${text}`);
  await clickElement(label);
  await warte();
}

async function zielWaehlen(text: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>("[aria-label='Ziel auswählen']");
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Zieloption fehlt: ${text}`);
  await clickElement(option);
  await warte();
}

async function tokenFormAbsenden(): Promise<void> {
  const form = queryPortal<HTMLFormElement>("[data-rolle='neu-token-form']");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await warte();
}

function elementeVomTyp(
  wert: ReactNode,
  typ: unknown,
): ReactElement<Record<string, unknown>>[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ
    ? [wert as ReactElement<Record<string, unknown>>]
    : [];
  const kinder = (wert.props as { children?: ReactNode }).children;
  return [...treffer, ...elementeVomTyp(kinder, typ)];
}

function enthaeltDate(wert: unknown): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some(enthaeltDate);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltDate);
  return false;
}

describe("TokenTable — Suche, Filter und Tabelle", () => {
  it("sucht über Code, Label und Zielname und ordnet das Nullziel der Liste zu", () => {
    expect(sucheTrifft(FAHRZEUG, "111-111")).toBe(true);
    expect(sucheTrifft(FAHRZEUG, "kärtchen")).toBe(true);
    expect(sucheTrifft(ARTIKEL, "ÄRZTE-VERBAND")).toBe(true);
    expect(sucheTrifft(FAHRZEUG, "regal")).toBe(false);
    expect(zielVon(FAHRZEUG)).toBe("fahrzeug");
    expect(zielVon(ARTIKEL)).toBe("artikel");
    expect(zielVon(LISTE)).toBe("liste");
  });

  it("trägt sechs Spalten, stabile IDs und die vollständigen sichtbaren Werte", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Code",
      "Bezeichnung",
      "Ziel",
      "Status",
      "Zuletzt benutzt",
      "",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Zugangs-Codes");
    expect(sichtbareIds()).toEqual(["t1", "t2", "t3"]);
    expect(exists(".ant-pagination")).toBe(false);
    const erste = query("tr[data-row-key='t1']");
    expect(erste.textContent).toContain("111-111");
    expect(erste.textContent).toContain("RTW 1 Kärtchen");
    expect(erste.textContent).toContain("RTW 1");
    expect(erste.textContent).toContain("aktiv");
    expect(erste.textContent).toContain("30.07.2026, 12:00:00");
    const zweite = query("tr[data-row-key='t2']");
    expect(zweite.textContent).toContain("Ärzte-Verband");
    expect(zweite.textContent).toContain("gesperrt");
    expect(zweite.textContent).toContain("nie benutzt");
    expect(query("tr[data-row-key='t3']").textContent).toContain("Artikel-Liste");
  });

  it("addiert Zielfilter, entfernt genau einen und kombiniert alle Filterregime", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    await clickElement(checkboxMitText("Fahrzeug"));
    expect(sichtbareIds()).toEqual(["t1"]);
    expect(document.querySelector("[data-testid='trefferanzeige']")?.textContent).toBe("1 von 3");

    await clickElement(checkboxMitText("Artikel"));
    expect(sichtbareIds()).toEqual(["t1", "t2"]);

    await clickElement(checkboxMitText("Fahrzeug"));
    expect(sichtbareIds()).toEqual(["t2"]);

    await clickElement(checkboxMitText("gesperrt"));
    expect(sichtbareIds()).toEqual(["t2"]);
    await fill("input[type='search']", "rtw");
    expect(sichtbareIds()).toEqual([]);
    expect(document.body.textContent).toContain("Kein Code passt zu Suche und Filter.");
    expect(document.querySelector("[data-testid='trefferanzeige']")?.textContent).toBe("0 von 3");
  });

  it("unterscheidet leeren Bestand von einer leeren Filtermenge", async () => {
    await mount(<TokenTable zeilen={[]} />);
    expect(document.body.textContent).toContain("Noch keine Codes. Lege oben den ersten an.");
    await unmount();
    await mount(<TokenTable zeilen={ZEILEN} />);
    await fill("input[type='search']", "ohne Treffer");
    expect(document.body.textContent).toContain("Kein Code passt zu Suche und Filter.");
    expect(document.body.textContent).not.toContain("Noch keine Codes");
  });

  it("verdrahtet Checkbox.Group nur an den Optionen und hält die Tabellenprops fest", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.tsx",
      "utf8",
    );
    expect(quelle).not.toMatch(/<Checkbox\.Group[^>]*\bonChange=/);
    expect(quelle.match(/onChange:\s*zielUmschalten/g)).toHaveLength(3);
    expect(quelle).toMatch(/rowKey=["']id["']/);
    expect(quelle).toMatch(/pagination=\{false\}/);
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*["']max-content["']\s*\}\}/);
  });
});

describe("TokenTable — Aktionen (8-F: nur noch Sperren)", () => {
  it("beobachtet beide Statusrichtungen ohne optimistischen Zustand", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);
    const sperren = Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
      .find((knopf) => knopf.textContent === "Sperren");
    const reaktivieren = Array.from(query("tr[data-row-key='t2']").querySelectorAll("button"))
      .find((knopf) => knopf.textContent === "Reaktivieren");
    if (!sperren || !reaktivieren) throw new Error("Statusknöpfe fehlen");
    await clickElement(sperren);
    await warte();
    await clickElement(reaktivieren);
    await warte();

    expect(mocks.setTokenAktiv.mock.calls).toEqual([
      [{ id: "t1", aktiv: false }],
      [{ id: "t2", aktiv: true }],
    ]);
    expect(sperren.textContent).toBe("Sperren");
    expect(reaktivieren.textContent).toBe("Reaktivieren");
  });

  it.each([
    ["fachlich", { ok: false, fehler: "SQL intern" }],
    ["Runtime", new Error("SQLITE geheim")],
  ] as const)("zeigt bei %s fehlgeschlagenem Statuswechsel nur den festen Warntext", async (
    _art,
    ausgang,
  ) => {
    if (ausgang instanceof Error) mocks.setTokenAktiv.mockRejectedValueOnce(ausgang);
    else mocks.setTokenAktiv.mockResolvedValueOnce(ausgang);
    await mount(<TokenTable zeilen={ZEILEN} />);
    const sperren = Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
      .find((knopf) => knopf.textContent === "Sperren");
    if (!sperren) throw new Error("Sperrknopf fehlt");
    await clickElement(sperren);
    await warte();

    const warnung = query(".ant-alert-warning").textContent ?? "";
    expect(warnung).toContain("Zugangs-Code-Status konnte nicht geändert werden.");
    expect(warnung).not.toContain("SQL");
    expect(sperren.textContent).toBe("Sperren");
  });

  /**
   * ENTSCHEIDUNG 8-F (§8.3): Der Namensraum der Zugangs-Codes ist gesperrt —
   * ein Code kann nur noch gesperrt, nie mehr gelöscht werden. Auf dieser Seite
   * entfällt damit der `LoeschButton`-AUFRUF, und die Zeile behält genau eine
   * Aktion.
   *
   * ⚠️ NICHT der Dialog. `_ui/LoeschDialog.tsx` und `_ui/LoeschButton.tsx`
   * gehören Teil 5 und bleiben unangetastet: Artikel, Fahrzeuge, BZ-Geräte,
   * O₂-Flaschen, Geräte und Vorlagen benutzen sie weiter. Wer sie beim
   * Aufräumen mitnimmt, reißt fünf andere Seiten ein.
   *
   * ⚠️ ANKÜNDIGUNGSPFLICHT (Runbook R34): Verwaltende, die heute einen
   * versehentlich angelegten Code löschen, finden den Knopf nicht mehr. Der
   * Weg heißt jetzt „Sperren", und `pruefeLoeschbar("token", …)` erklärt das
   * serverseitig weiterhin in Worten (`_lib/tokenForm.ts`, TOKEN_LOESCHGRUND).
   */
  it("bietet je Zeile genau eine Aktion an — Sperren, keinen Löschweg", async () => {
    await mount(<TokenTable zeilen={ZEILEN} />);

    expect(
      Array.from(query("tr[data-row-key='t1']").querySelectorAll("button"))
        .map((knopf) => knopf.textContent),
    ).toEqual(["Sperren"]);
    expect(
      Array.from(query("tr[data-row-key='t2']").querySelectorAll("button"))
        .map((knopf) => knopf.textContent),
    ).toEqual(["Reaktivieren"]);
    expect(document.body.textContent).not.toContain("Löschen");
  });

  it("kennt in der Quelle weder den Löschknopf noch die generische Löschaction", () => {
    // K-4: über ohneKommentare(), nicht über den Rohtext — der Kopfkommentar
    // der Komponente nennt alle drei gesuchten Namen in seiner Begründung.
    const quelle = ohneKommentare(readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/TokenTable.tsx",
      "utf8",
    ));

    expect(quelle, "8-F: der LoeschButton-Aufruf entfällt").not.toContain("LoeschButton");
    expect(quelle).not.toContain("loescheElement");
    expect(quelle).not.toContain("pruefeLoeschbar");
    expect(quelle, "gesperrt wird über setTokenAktiv").toContain("setTokenAktiv");

    // Der Dialog bleibt: er gehört Teil 5 und trägt die übrigen Seiten.
    expect(existsSync("src/app/m/lagerbuch/_ui/LoeschDialog.tsx")).toBe(true);
    expect(existsSync("src/app/m/lagerbuch/_ui/LoeschButton.tsx")).toBe(true);
  });
});

describe("NeuToken", () => {
  it("filtert Fahrzeug und Artikel explizit über Label plus Kennung oder Fach", () => {
    expect(zielFilter("alpha", {
      value: "rtw-1",
      label: "RTW Alpha",
      keywords: "RTW Alpha UE-RK 1234",
    })).toBe(true);
    expect(zielFilter("1234", {
      value: "rtw-1",
      label: "RTW Alpha",
      keywords: "RTW Alpha UE-RK 1234",
    })).toBe(true);
    expect(zielFilter("notfallfach", {
      value: "a2",
      label: "Kompresse",
      keywords: "Kompresse Notfallfach",
    })).toBe(true);
    expect(zielFilter("fremd", {
      value: "a2",
      label: "Kompresse",
      keywords: "Kompresse Notfallfach",
    })).toBe(false);
  });

  it("sendet die Artikel-Liste ohne erfundene Zielart und zeigt den Code im offenen Modal", async () => {
    await mount(<NeuToken ziele={ZIELE} />);
    await oeffneNeuToken();
    await portalFeldSetzen("Bezeichnung", "  Helferliste  ");
    await tokenFormAbsenden();

    expect(mocks.createToken).toHaveBeenCalledWith({ label: "Helferliste" });
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(document.body.textContent).toContain("999-999");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("sendet Fahrzeug und Artikel vollständig und löscht beim Artwechsel das alte Ziel", async () => {
    await mount(<NeuToken ziele={ZIELE} />);
    await oeffneNeuToken();
    await portalFeldSetzen("Bezeichnung", "Direktcode");
    await zielartWaehlen("Fahrzeug");
    await zielWaehlen("RTW Alpha");
    await zielartWaehlen("Artikel");
    await tokenFormAbsenden();
    expect(mocks.createToken).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain("Ziel auswählen");

    await zielWaehlen("Kompresse");
    await tokenFormAbsenden();
    expect(mocks.createToken).toHaveBeenCalledWith({
      label: "Direktcode",
      zielTyp: "artikel",
      zielId: "a2",
    });
  });

  it("bindet Feldfehler ans Ziel und zeigt allgemeine Fehler als Warning mit title", async () => {
    mocks.createToken.mockResolvedValueOnce({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { zielId: "Fahrzeug nicht gefunden oder inaktiv." },
    });
    await mount(<NeuToken ziele={ZIELE} />);
    await oeffneNeuToken();
    await portalFeldSetzen("Bezeichnung", "Fahrzeugcode");
    await zielartWaehlen("Fahrzeug");
    await zielWaehlen("RTW Alpha");
    await tokenFormAbsenden();

    await vi.waitFor(() => {
      expect(document.body.textContent).toContain("Fahrzeug nicht gefunden oder inaktiv.");
    });
    expect(queryPortal(".ant-alert-warning").textContent).toContain(
      "Bitte die markierten Felder prüfen.",
    );
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/NeuToken.tsx",
      "utf8",
    );
    expect(quelle).toMatch(/<Alert[\s\S]*?title=\{fehler\}/);
    expect(quelle).not.toMatch(/<Alert[\s\S]*?message=\{fehler\}/);
  });

  it("hält bei Runtimefehler Form und Modal offen und verrät keine Interna", async () => {
    mocks.createToken.mockRejectedValueOnce(new Error("SQLITE geheim"));
    await mount(<NeuToken ziele={ZIELE} />);
    await oeffneNeuToken();
    await portalFeldSetzen("Bezeichnung", "Fehlercode");
    await tokenFormAbsenden();

    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(queryPortal(".ant-alert-warning").textContent).toContain(
      "Zugangs-Code konnte nicht angelegt werden.",
    );
    expect(document.body.textContent).not.toContain("SQLITE geheim");
    expect(queryPortal<HTMLInputElement>("[aria-label='Bezeichnung']").value).toBe("Fehlercode");
  });

  it("setzt Code und Formular erst beim bewussten Schließen für die nächste Öffnung zurück", async () => {
    await mount(<NeuToken ziele={ZIELE} />);
    await oeffneNeuToken();
    await portalFeldSetzen("Bezeichnung", "Einmalcode");
    await tokenFormAbsenden();
    expect(document.body.textContent).toContain("999-999");

    await clickElement(queryPortal<HTMLElement>("button[aria-label='Close']"));
    await warte();
    await oeffneNeuToken();
    expect(document.body.textContent).not.toContain("999-999");
    expect(queryPortal<HTMLInputElement>("[aria-label='Bezeichnung']").value).toBe("");
  });

  it("friert nach Erfolg das Formular ein und behält den Code bis zum bewussten Schließen", async () => {
    await mount(<NeuToken ziele={ZIELE} />);
    await oeffneNeuToken();
    await portalFeldSetzen("Bezeichnung", "Nicht verlieren");
    await tokenFormAbsenden();

    expect(document.body.textContent).toContain("999-999");
    const fahrzeug = Array.from(
      document.body.querySelectorAll<HTMLElement>(".ant-radio-wrapper"),
    ).find((element) => (element.textContent ?? "").includes("Fahrzeug"));
    const radio = fahrzeug?.querySelector<HTMLInputElement>("input[type='radio']");
    if (!fahrzeug || !radio) throw new Error("Fahrzeug-Zielart fehlt");
    expect(radio.disabled).toBe(true);

    await clickElement(fahrzeug);
    await warte();
    expect(document.body.textContent).toContain("999-999");
    expect(mocks.createToken).toHaveBeenCalledOnce();

    const fertig = queryPortal<HTMLElement>(".ant-modal-footer .ant-btn-primary");
    expect(fertig.textContent).toContain("Schließen");
    await clickElement(fertig);
    await warte();
    expect(document.body.querySelector("[role='dialog']")).toBeNull();
  });
});

describe("TokensSeite", () => {
  const ROHZEILE = {
    id: "t-nacht",
    code: "444-444",
    label: "Nachtschicht",
    aktiv: true,
    lastUsedAt: new Date("2026-01-01T23:30:00Z"),
    createdAt: new Date("2026-01-01T22:00:00Z"),
    zielTyp: "fahrzeug" as const,
    zielId: "rtw-1",
    zielName: "RTW Alpha",
  };

  it("formatiert Zeitstempel serverseitig in Europe/Berlin und reicht keine Dates durch", () => {
    const [zeile] = tokenAnzeigeZeilen([ROHZEILE]);

    expect(zeile).toEqual({
      id: "t-nacht",
      code: "444-444",
      label: "Nachtschicht",
      aktiv: true,
      lastUsedText: "2.1.2026, 00:30:00",
      zielTyp: "fahrzeug",
      zielId: "rtw-1",
      zielName: "RTW Alpha",
    });
    expect(enthaeltDate(zeile)).toBe(false);
    expect(Object.hasOwn(zeile, "createdAt")).toBe(false);
    expect(tokenAnzeigeZeilen([{ ...ROHZEILE, lastUsedAt: null }])[0].lastUsedText)
      .toBe("nie benutzt");
  });

  it("verdrahtet Lesepfade, Seitenkopf und beide Client-Inseln ohne inneren Verwaltungspfad", () => {
    mocks.tokenListe.mockReturnValue([ROHZEILE]);
    const seite = TokensSeite();

    expect(dynamic).toBe("force-dynamic");
    expect(mocks.getDb).toHaveBeenCalledOnce();
    expect(mocks.tokenListe).toHaveBeenCalledWith({ kennung: "token-test-db" });
    expect(mocks.tokenZiele).toHaveBeenCalledWith({ kennung: "token-test-db" });

    const kopf = elementeVomTyp(seite, SeitenKopf)[0];
    expect(kopf.props.titel).toBe("Zugangs-Codes");
    expect(elementeVomTyp(kopf.props.aktionen as ReactNode, NeuToken)[0].props.ziele)
      .toEqual(ZIELE);

    const tabelle = elementeVomTyp(seite, TokenTable)[0];
    expect(tabelle.props.zeilen).toEqual(tokenAnzeigeZeilen([ROHZEILE]));
    expect(enthaeltDate(tabelle.props.zeilen)).toBe(false);

    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/tokens/page.tsx",
      "utf8",
    );
    expect(quelle).not.toMatch(/\/m\/lagerbuch\/verwaltung\//);
    expect(quelle).not.toMatch(/columns\s*=|\brender\s*:|rowKey=\{/);
  });
});
