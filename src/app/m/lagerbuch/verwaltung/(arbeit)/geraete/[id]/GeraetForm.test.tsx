// @vitest-environment jsdom

import { readFileSync } from "node:fs";
import {
  act,
  isValidElement,
  type ReactElement,
  type ReactNode,
} from "react";
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
  click,
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  queryPortal,
  submitForm,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { geraete, lagerorte } from "../../../../_db/schema";
import { migrierteTestDb } from "../../../../_db/testdb";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import {
  GeraetForm,
  lagerortFilter,
  type GeraetInitial,
} from "./GeraetForm";
import { GeraetAktivToggle } from "./GeraetAktivToggle";

const mocks = vi.hoisted(() => ({
  geraetSpeichern: vi.fn(),
  setGeraetAktiv: vi.fn(),
  pruefeLoeschbar: vi.fn(),
  loescheElement: vi.fn(),
  deaktiviereElement: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
  notFound: vi.fn(() => { throw new Error("NEXT_NOT_FOUND"); }),
}));

vi.mock("../../../../_actions/geraete", () => ({
  geraetSpeichern: (...args: unknown[]) => mocks.geraetSpeichern(...args),
  setGeraetAktiv: (...args: unknown[]) => mocks.setGeraetAktiv(...args),
}));

vi.mock("../../../../_actions/loeschen", () => ({
  pruefeLoeschbar: (...args: unknown[]) => mocks.pruefeLoeschbar(...args),
  loescheElement: (...args: unknown[]) => mocks.loescheElement(...args),
  deaktiviereElement: (...args: unknown[]) => mocks.deaktiviereElement(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
  notFound: () => mocks.notFound(),
}));

const MEDIZIN: GeraetInitial = {
  id: "g-med",
  typ: "medizin",
  name: "Corpuls C3",
  barcode: "SN-1",
  lagerortId: "handlager",
  anmerkung: "Prüfkoffer",
  mtkFaellig: "2027-03-01",
  beschreibung: null,
  ablaufdatum: null,
};

const OBJEKT: GeraetInitial = {
  id: "g-obj",
  typ: "objekt",
  name: "Spineboard",
  barcode: null,
  lagerortId: "rtw-1",
  anmerkung: null,
  mtkFaellig: null,
  beschreibung: "Mit Gurtspinne",
  ablaufdatum: "2028-04-05",
};

const ORTE = [
  { id: "handlager", name: "Handlager", typ: "lager" as const },
  { id: "rtw-1", name: "RTW Nord", typ: "fahrzeug" as const },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) => (
    getComputedStyleOhnePseudo(element)
  ));
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.geraetSpeichern.mockResolvedValue({ ok: true, wert: { id: "g-med" } });
  mocks.setGeraetAktiv.mockResolvedValue({ ok: true });
  mocks.pruefeLoeschbar.mockResolvedValue({ ok: true, wert: { loeschbar: true } });
  mocks.loescheElement.mockResolvedValue({ ok: true });
  mocks.deaktiviereElement.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
});

afterAll(() => vi.restoreAllMocks());

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 40; versuch += 1) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

async function portalFuellen(ariaLabel: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(`input[aria-label='${ariaLabel}']`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter für ${ariaLabel}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  return [
    ...treffer,
    ...Object.values(wert.props as Record<string, ReactNode>)
      .flatMap((prop) => elementeVomTyp(prop, typ)),
  ];
}

function istRekursivJsonSicher(wert: unknown): boolean {
  if (wert === null || typeof wert === "string" || typeof wert === "boolean") return true;
  if (typeof wert === "number") return Number.isFinite(wert);
  if (Array.isArray(wert)) return wert.every(istRekursivJsonSicher);
  if (
    typeof wert !== "object"
    || wert instanceof Date
    || isValidElement(wert)
    || Object.getPrototypeOf(wert) !== Object.prototype
  ) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

describe("GeraetForm — Felder und Typtrennung", () => {
  it("rendert eine echte Radio.Group und ein benanntes Standort-Combobox-Control", async () => {
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);

    expect(queryAll(".ant-radio-group input[type='radio']")).toHaveLength(2);
    expect(queryAll("button[aria-pressed]")).toHaveLength(0);
    expect(query("input[role='combobox']").getAttribute("aria-label")).toBe("Standort");
  });

  it("sucht Standorte explizit nach ihrem sichtbaren Namen", () => {
    expect(lagerortFilter("rtw nord", { value: "rtw-1", label: "RTW Nord" }))
      .toBe(true);
    expect(lagerortFilter("hand", { value: "rtw-1", label: "RTW Nord" }))
      .toBe(false);
  });

  it("zeigt für Medizin nur MTK und nach Typwechsel nur die Objektfelder", async () => {
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);
    expect(queryAll("input[aria-label='Nächste MTK']")).toHaveLength(1);
    expect(queryAll("input[aria-label='Ablaufdatum']")).toHaveLength(0);
    expect(queryAll("input[aria-label='Beschreibung']")).toHaveLength(0);

    await click(".ant-radio-group input[value='objekt']");
    expect(queryAll("input[aria-label='Nächste MTK']")).toHaveLength(0);
    expect(queryAll("input[aria-label='Ablaufdatum']")).toHaveLength(1);
    expect(queryAll("input[aria-label='Beschreibung']")).toHaveLength(1);
  });

  it("formatiert Tagesdaten inline und sendet nie typfremde Werte", async () => {
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);
    await submitForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length === 1, "Medizin-Payload");
    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      id: "g-med",
      typ: "medizin",
      name: "Corpuls C3",
      barcode: "SN-1",
      lagerortId: "handlager",
      anmerkung: "Prüfkoffer",
      mtkFaellig: "2027-03-01",
      beschreibung: undefined,
      ablaufdatum: undefined,
    });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("entfernt nach einem Typwechsel den unsichtbaren Altwert aus der Nutzlast", async () => {
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);
    await click(".ant-radio-group input[value='objekt']");
    await submitForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length === 1, "Wechsel-Payload");

    expect(mocks.geraetSpeichern).toHaveBeenCalledWith(expect.objectContaining({
      typ: "objekt",
      mtkFaellig: undefined,
    }));
  });

  it("sendet beim Objekt Beschreibung und tagesgenaues Ablaufdatum", async () => {
    await mount(<GeraetForm initial={OBJEKT} lagerorte={ORTE} />);
    await submitForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length === 1, "Objekt-Payload");
    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      id: "g-obj",
      typ: "objekt",
      name: "Spineboard",
      barcode: undefined,
      lagerortId: "rtw-1",
      anmerkung: undefined,
      mtkFaellig: undefined,
      beschreibung: "Mit Gurtspinne",
      ablaufdatum: "2028-04-05",
    });
  });
});

describe("GeraetForm — Action-Zustand", () => {
  it("dispatcht innerhalb einer Transition ohne Action-context-Warnung", async () => {
    const fehler = vi.spyOn(console, "error").mockImplementation(() => {});
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);
    await submitForm();
    await warteAuf(() => mocks.geraetSpeichern.mock.calls.length === 1, "Action-Aufruf");
    expect(fehler.mock.calls.flat().join(" ")).not.toMatch(/action context/i);
    expect(readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/GeraetForm.tsx",
      "utf8",
    )).toMatch(/startTransition\(\(\) => absenden\(werte\)\)/);
    fehler.mockRestore();
  });

  it("bindet nur bekannte Feldfehler, zeigt den allgemeinen Fehler und behält Werte", async () => {
    mocks.geraetSpeichern.mockResolvedValueOnce({
      ok: false,
      fehler: "Bitte die markierten Felder prüfen.",
      feldFehler: { name: "Name darf nicht leer sein", phantom: "Unsichtbar" },
    });
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);
    await fill("input[aria-label='Bezeichnung']", "Bleibt stehen");
    await submitForm();

    await warteAuf(
      () => queryAll(".ant-form-item-explain-error").length > 0,
      "gebundener Feldfehler",
    );
    expect(query(".ant-form-item-explain-error").textContent)
      .toBe("Name darf nicht leer sein");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Bitte die markierten Felder prüfen.");
    expect(document.body.textContent).not.toContain("Unsichtbar");
    expect(query<HTMLInputElement>("input[aria-label='Bezeichnung']").value)
      .toBe("Bleibt stehen");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  it("verbirgt Reject-Details hinter einem festen Warning und behält den Zustand", async () => {
    mocks.geraetSpeichern.mockRejectedValueOnce(new Error("SQLITE intern und geheim"));
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);
    await fill("input[aria-label='Bezeichnung']", "Bleibt auch");
    await submitForm();

    await warteAuf(() => queryAll(".ant-alert-warning").length === 1, "Runtime-Warnung");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Gerät konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("SQLITE intern und geheim");
    expect(query<HTMLInputElement>("input[aria-label='Bezeichnung']").value)
      .toBe("Bleibt auch");
  });

  it("sperrt zwei synchrone Submit-Ereignisse bis zur Antwort", async () => {
    let fertig!: (wert: { ok: true; wert: { id: string } }) => void;
    mocks.geraetSpeichern.mockReturnValueOnce(new Promise((resolve) => { fertig = resolve; }));
    await mount(<GeraetForm initial={MEDIZIN} lagerorte={ORTE} />);
    const form = query<HTMLFormElement>("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
    });
    await warte();

    expect(mocks.geraetSpeichern).toHaveBeenCalledTimes(1);
    expect(query("button[type='submit']").hasAttribute("disabled")).toBe(true);
    expect(readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/geraete/[id]/GeraetForm.tsx",
      "utf8",
    )).toMatch(/if \(absendenLaeuft\.current\) return;/);
    await act(async () => { fertig({ ok: true, wert: { id: "g-med" } }); });
    await warte();
  });
});

describe("GeraetAktivToggle", () => {
  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "fachlich" })],
    ["Reject", async () => { throw new Error("intern"); }],
  ])("ändert bei %s den Status nicht und zeigt einen festen Fehler", async (_fall, antwort) => {
    mocks.setGeraetAktiv.mockImplementationOnce(antwort);
    await mount(<GeraetAktivToggle id="g1" name="Gerät 1" aktiv />);
    await click("button[aria-label='Gerät aktiv']");
    await warteAuf(() => queryAll(".ant-alert-warning").length === 1, "Statuswarnung");

    expect(query("button[aria-label='Gerät aktiv']").getAttribute("aria-checked"))
      .toBe("true");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Gerätestatus konnte nicht geändert werden.");
  });

  it("übernimmt den Status erst nach erfolgreicher Action", async () => {
    await mount(<GeraetAktivToggle id="g1" name="Gerät 1" aktiv />);
    await click("button[aria-label='Gerät aktiv']");
    await warteAuf(
      () => query("button[aria-label='Gerät aktiv']").getAttribute("aria-checked") === "false",
      "inaktiver Schalter",
    );
    expect(mocks.setGeraetAktiv).toHaveBeenCalledWith({ id: "g1", aktiv: false });
  });

  it("hält den Löschdialog bei ok:false offen und navigiert nicht", async () => {
    mocks.loescheElement.mockResolvedValueOnce({ ok: false, fehler: "Darf nicht" });
    await mount(<GeraetAktivToggle id="g1" name="Gerät 1" aktiv />);
    await clickElement(query<HTMLButtonElement>("button.ant-btn-dangerous"));
    await warteAuf(
      () => document.body.querySelector("input[aria-label='Namen zur Bestätigung eingeben']") !== null,
      "Löschbestätigung",
    );
    await portalFuellen("Namen zur Bestätigung eingeben", "Gerät 1");
    await clickElement(queryPortal<HTMLButtonElement>("button[data-rolle='loeschen']"));
    await warteAuf(
      () => (document.body.querySelector(".ant-modal .ant-alert-warning")?.textContent ?? "")
        .includes("Gerät konnte nicht gelöscht werden."),
      "Löschwarnung",
    );

    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.loescheElement).toHaveBeenCalledWith("geraet", "g1");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("hält den Dialog bei fehlgeschlagener Deaktivierung offen", async () => {
    mocks.pruefeLoeschbar.mockResolvedValueOnce({
      ok: true,
      wert: { loeschbar: false, grund: "Buchungen vorhanden", kannDeaktivieren: true },
    });
    mocks.deaktiviereElement.mockRejectedValueOnce(new Error("intern"));
    await mount(<GeraetAktivToggle id="g1" name="Gerät 1" aktiv />);
    await clickElement(query<HTMLButtonElement>("button.ant-btn-dangerous"));
    await warteAuf(
      () => document.body.querySelector("button[data-rolle='deaktivieren']") !== null,
      "Deaktivieren-Ausgang",
    );
    await clickElement(queryPortal<HTMLButtonElement>("button[data-rolle='deaktivieren']"));
    await warteAuf(
      () => (document.body.querySelector(".ant-modal .ant-alert-warning:last-child")?.textContent ?? "")
        .includes("Gerät konnte nicht deaktiviert werden."),
      "Deaktivierungswarnung",
    );

    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.deaktiviereElement).toHaveBeenCalledWith("geraet", "g1");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("navigiert erst nach erfolgreichem Löschen zur äußeren Liste", async () => {
    await mount(<GeraetAktivToggle id="g1" name="Gerät 1" aktiv />);
    await clickElement(query<HTMLButtonElement>("button.ant-btn-dangerous"));
    await warteAuf(
      () => document.body.querySelector("input[aria-label='Namen zur Bestätigung eingeben']") !== null,
      "Löschbestätigung",
    );
    await portalFuellen("Namen zur Bestätigung eingeben", "Gerät 1");
    await clickElement(queryPortal<HTMLButtonElement>("button[data-rolle='loeschen']"));
    await warteAuf(() => mocks.push.mock.calls.length === 1, "Listennavigation");
    expect(mocks.push).toHaveBeenCalledWith("/verwaltung/geraete");
  });
});

describe("Geräteseite als RSC", () => {
  it("liefert force-dynamic, Brotkrume und nur primitive Form-Props", async () => {
    const { dynamic, geraetSeitenInhalt } = await import("./page");
    const testDb = migrierteTestDb("lagerbuch-geraet-detail-");
    try {
      testDb.db.insert(lagerorte).values({
        id: "rtw-rsc",
        name: "RSC RTW",
        typ: "fahrzeug",
        kennung: "UE-RSC",
        aktiv: true,
      }).run();
      testDb.db.insert(geraete).values({
        id: "geraet-rsc",
        typ: "medizin",
        name: "RSC Defi",
        barcode: "RSC-1",
        lagerortId: "rtw-rsc",
        anmerkung: null,
        mtkFaellig: "2027-03-01",
        beschreibung: null,
        ablaufdatum: null,
        aktiv: true,
        createdAt: new Date("2026-08-07T10:00:00Z"),
      }).run();

      const inhalt = geraetSeitenInhalt(testDb.db, "geraet-rsc", new Date("2026-08-07"));
      const [brotkrume] = elementeVomTyp(inhalt, Brotkrume);
      const [form] = elementeVomTyp(inhalt, GeraetForm);
      const [toggle] = elementeVomTyp(inhalt, GeraetAktivToggle);
      expect(brotkrume.props).toEqual({ href: "/verwaltung/geraete", children: "Geräte" });
      expect(form.props).toEqual(expect.objectContaining({
        initial: expect.objectContaining({
          id: "geraet-rsc",
          name: "RSC Defi",
          mtkFaellig: "2027-03-01",
        }),
        lagerorte: expect.arrayContaining([
          expect.objectContaining({ id: "rtw-rsc", name: "RSC RTW" }),
        ]),
      }));
      expect(toggle.props).toEqual({ id: "geraet-rsc", name: "RSC Defi", aktiv: true });
      expect(istRekursivJsonSicher(form.props)).toBe(true);
      expect(dynamic).toBe("force-dynamic");
    } finally {
      testDb.schliessen();
    }
  });

  it("nimmt für unbekannte IDs den echten notFound-Weg", async () => {
    const { geraetSeitenInhalt } = await import("./page");
    const testDb = migrierteTestDb("lagerbuch-geraet-fehlt-");
    try {
      expect(() => geraetSeitenInhalt(testDb.db, "fehlt", new Date("2026-08-07")))
        .toThrow("NEXT_NOT_FOUND");
      expect(mocks.notFound).toHaveBeenCalledOnce();
    } finally {
      testDb.schliessen();
    }
  });
});
