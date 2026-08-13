// @vitest-environment jsdom

import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  mount,
  query,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  artikel,
  buchungen,
  chargen,
  fahrzeugTemplates,
  lagerorte,
  lagerortVerfall,
  sollPositionen,
} from "../../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../../_db/testdb";
import { HANDLAGER_ID } from "../../../../_lib/konstanten";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import { FahrzeugAktivToggle } from "./FahrzeugAktivToggle";
import { SollEditor } from "./SollEditor";
import { TemplateVerknuepfung } from "./TemplateVerknuepfung";
import { VerfallEditor } from "./VerfallEditor";
import FahrzeugBlatt, { dynamic, fahrzeugInhalt } from "./page";

const mocks = vi.hoisted(() => ({
  setAktiv: vi.fn(),
  pruefen: vi.fn(),
  loeschen: vi.fn(),
  deaktivieren: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("../../../../_actions/fahrzeuge", async (importOriginal) => {
  const original = await importOriginal<typeof import("../../../../_actions/fahrzeuge")>();
  return {
    ...original,
    setFahrzeugAktiv: (...args: unknown[]) => mocks.setAktiv(...args),
  };
});

vi.mock("../../../../_actions/loeschen", () => ({
  pruefeLoeschbar: (...args: unknown[]) => mocks.pruefen(...args),
  loescheElement: (...args: unknown[]) => mocks.loeschen(...args),
  deaktiviereElement: (...args: unknown[]) => mocks.deaktivieren(...args),
}));

const JETZT = new Date("2026-08-07T12:00:00Z");
const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

let t: TestDb;

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

function textVon(wert: ReactNode): string {
  if (wert === null || wert === undefined || typeof wert === "boolean") return "";
  if (typeof wert === "string" || typeof wert === "number") return String(wert);
  if (Array.isArray(wert)) return wert.map(textVon).join("");
  if (!isValidElement(wert)) return "";
  return textVon((wert.props as { children?: ReactNode }).children);
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
  return Reflect.ownKeys(wert).every((schluessel) =>
    typeof schluessel === "string"
    && istRekursivJsonSicher((wert as Record<string, unknown>)[schluessel]));
}

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 20; versuch += 1) {
    if (pruefen()) return;
    await act(async () => {
      await new Promise((fertig) => setTimeout(fertig, 0));
    });
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

function hostKnopf(text: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => (button.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Knopf nicht gefunden: ${text}`);
  return treffer;
}

async function portalFuellen(selector: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(selector);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter für ${selector}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

function artikelAnlegen(
  id: string,
  name: string,
  fach: string,
  aktiv = true,
): void {
  t.db.insert(artikel).values({
    id,
    name,
    einheit: "Stk",
    fach,
    mindestbestand: 0,
    aktiv,
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
}

beforeEach(() => {
  vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
  vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
  vi.clearAllMocks();
  vi.spyOn(window, "getComputedStyle")
    .mockImplementation((element) => getComputedStyleOhnePseudo(element));
  mocks.setAktiv.mockResolvedValue({ ok: true });
  mocks.pruefen.mockResolvedValue({ ok: true, wert: { loeschbar: true } });
  mocks.loeschen.mockResolvedValue({ ok: true });
  mocks.deaktivieren.mockResolvedValue({ ok: true });

  t = migrierteTestDb("lagerbuch-fahrzeug-detail-");
  t.db.insert(fahrzeugTemplates).values([
    {
      id: "tpl-inaktiv",
      name: "Alte RTW-Vorlage",
      aktiv: false,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    },
    {
      id: "tpl-aktiv",
      name: "Aktive Alternative",
      aktiv: true,
      createdAt: new Date("2026-02-01T00:00:00Z"),
    },
  ]).run();
  t.db.insert(lagerorte).values({
    id: "fz-1",
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "UE-RK 1234",
    aktiv: true,
    templateId: "tpl-inaktiv",
  }).run();
  artikelAnlegen("a1", "Mullbinde", "C2");
  artikelAnlegen("a2", "Kompressen", "C3");
  artikelAnlegen("a3", "Dreiecktuch", "D1");
  artikelAnlegen("a-inaktiv", "Altartikel", "Z9", false);
  t.db.insert(sollPositionen).values([
    {
      id: "p-b",
      fahrzeugId: "fz-1",
      fachLabel: "Fach B",
      sort: 2,
      artikelId: "a1",
      soll: 2,
    },
    {
      id: "p-a",
      fahrzeugId: "fz-1",
      fachLabel: "Fach A",
      sort: 1,
      artikelId: "a1",
      soll: 3,
    },
    {
      id: "p-grabstein",
      fahrzeugId: "fz-1",
      fachLabel: "Fach X",
      sort: 0,
      artikelId: "a2",
      soll: 4,
      entfernt: true,
    },
    {
      id: "p-c",
      fahrzeugId: "fz-1",
      fachLabel: "Fach C",
      sort: 0,
      artikelId: "a3",
      soll: 1,
    },
  ]).run();
  t.db.insert(chargen).values({
    id: "charge-a1",
    artikelId: "a1",
    chargenNr: "LOT-1",
    verfall: "2030-01",
    createdAt: new Date("2026-01-01T00:00:00Z"),
  }).run();
  t.db.insert(buchungen).values([
    {
      id: "bestand-handlager",
      ts: JETZT,
      typ: "zugang",
      artikelId: "a1",
      chargeId: "charge-a1",
      lagerortId: HANDLAGER_ID,
      menge: 7,
      quelleTyp: "system",
      quelleId: "test",
    },
    {
      id: "bestand-fahrzeug",
      ts: JETZT,
      typ: "zugang",
      artikelId: "a1",
      chargeId: "charge-a1",
      lagerortId: "fz-1",
      menge: 2,
      quelleTyp: "system",
      quelleId: "test",
    },
  ]).run();
  t.db.insert(lagerortVerfall).values([
    {
      id: "verfall-a1",
      lagerortId: "fz-1",
      artikelId: "a1",
      verfall: "2025-01",
      erfasstAt: new Date("2026-08-01T00:00:00Z"),
      quelleTyp: "system",
      quelleId: "test",
    },
    {
      id: "verfall-grabstein",
      lagerortId: "fz-1",
      artikelId: "a2",
      verfall: "2024-01",
      erfasstAt: new Date("2026-08-01T00:00:00Z"),
      quelleTyp: "system",
      quelleId: "test",
    },
    {
      id: "verfall-a3",
      lagerortId: "fz-1",
      artikelId: "a3",
      verfall: "2028-12",
      erfasstAt: new Date("2026-08-01T00:00:00Z"),
      quelleTyp: "system",
      quelleId: "test",
    },
  ]).run();
});

afterEach(async () => {
  await unmount();
  t.schliessen();
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe("Fahrzeugblatt als Server Component", () => {
  it("ist dynamisch, Next-16-kompatibel und besitzt den aeusseren Rueckweg", () => {
    expect(dynamic).toBe("force-dynamic");
    expect(FahrzeugBlatt).toBeTypeOf("function");
    const seite = fahrzeugInhalt(t.db, "fz-1", JETZT);
    const [kopf] = elementeVomTyp(seite, SeitenKopf);
    const zurueck = (kopf.props as {
      zurueck?: { titel: string; href: string };
    }).zurueck;
    expect(zurueck).toEqual({ titel: "Fahrzeuge", href: "/verwaltung/fahrzeuge" });
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/page.tsx",
      "utf8",
    );
    expect(quelle).not.toContain('href="/m/lagerbuch/verwaltung/fahrzeuge"');
  });

  it("liefert fuer unbekannte und typfremde bekannte IDs notFound", () => {
    expect(() => fahrzeugInhalt(t.db, "fehlt", JETZT)).toThrow("NEXT_NOT_FOUND");
    expect(() => fahrzeugInhalt(t.db, HANDLAGER_ID, JETZT)).toThrow("NEXT_NOT_FOUND");
  });

  it("zaehlt nur aktive Sollpositionen und ihre Faecher in den drei KPIs", () => {
    const seite = fahrzeugInhalt(t.db, "fz-1", JETZT);
    const kacheln = elementeVomTyp(seite, Kachel);
    expect(kacheln).toHaveLength(3);
    expect(kacheln.map((kachel) => ({
      zahl: kachel.props.zahl,
      beschriftung: kachel.props.beschriftung,
      ton: kachel.props.ton,
    }))).toEqual([
      { zahl: 3, beschriftung: "Soll-Positionen", ton: undefined },
      { zahl: 3, beschriftung: "Fächer", ton: undefined },
      { zahl: 1, beschriftung: "auffällige Verfallsmeldungen", ton: "rot" },
    ]);
  });

  it("reicht die echte SollZeile samt geteiltem Fahrzeugbestand an den Editor", () => {
    const [editor] = elementeVomTyp(fahrzeugInhalt(t.db, "fz-1", JETZT), SollEditor);
    const props = editor.props as React.ComponentProps<typeof SollEditor>;
    expect(props.positionen.map((position) => position.id)).toEqual([
      "p-a",
      "p-b",
      "p-c",
      "p-grabstein",
    ]);
    expect(props.positionen.filter((position) => position.artikelId === "a1").map((position) => ({
      handlagerFach: position.handlagerFach,
      fahrzeugBestand: position.fahrzeugBestand,
      handlagerBestand: position.handlagerBestand,
    }))).toEqual([
      { handlagerFach: "C2", fahrzeugBestand: 2, handlagerBestand: 7 },
      { handlagerFach: "C2", fahrzeugBestand: 2, handlagerBestand: 7 },
    ]);
    expect(props.positionen.some((position) => "ist" in position)).toBe(false);
    expect(props.artikel.map((eintrag) => eintrag.id)).toEqual(["a1", "a2", "a3"]);
  });

  it("baut je aktivem Artikel genau eine Verfallszeile mit allen Faechertexten", () => {
    const [editor] = elementeVomTyp(fahrzeugInhalt(t.db, "fz-1", JETZT), VerfallEditor);
    const props = editor.props as React.ComponentProps<typeof VerfallEditor>;
    expect(props.eintraege).toEqual([
      {
        artikelId: "a1",
        artikelName: "Mullbinde",
        fachText: "Fach A · Fach B",
        verfall: "2025-01",
        statusTon: "rot",
        statusText: expect.any(String),
      },
      {
        artikelId: "a3",
        artikelName: "Dreiecktuch",
        fachText: "Fach C",
        verfall: "2028-12",
        statusTon: "ok",
        statusText: expect.any(String),
      },
    ]);
    expect(props.eintraege.some((eintrag) => eintrag.artikelId === "a2")).toBe(false);
  });

  it("benennt die inaktive aktuelle Vorlage und liefert nur andere aktive Alternativen", () => {
    const [template] = elementeVomTyp(
      fahrzeugInhalt(t.db, "fz-1", JETZT),
      TemplateVerknuepfung,
    );
    expect(template.props).toEqual({
      fahrzeugId: "fz-1",
      aktuelleVorlage: { id: "tpl-inaktiv", name: "Alte RTW-Vorlage" },
      vorlagen: [{ id: "tpl-aktiv", name: "Aktive Alternative" }],
      hatPositionen: true,
    });
  });

  it("ordnet Vorlage, Soll und Verfall und sendet nur JSON-sichere Inselprops", () => {
    const seite = fahrzeugInhalt(t.db, "fz-1", JETZT);
    expect(elementeVomTyp(seite, "h2").map((ueberschrift) => textVon(ueberschrift)))
      .toEqual(["Vorlage", "Soll-Bestückung", "Verfall im Fahrzeug"]);

    for (const [typ, name] of [
      [SollEditor, "SollEditor"],
      [TemplateVerknuepfung, "TemplateVerknuepfung"],
      [VerfallEditor, "VerfallEditor"],
    ] as const) {
      const [insel] = elementeVomTyp(seite, typ);
      expect(istRekursivJsonSicher(insel.props), name).toBe(true);
    }

    const [kopf] = elementeVomTyp(seite, SeitenKopf);
    const [toggle] = elementeVomTyp(kopf.props.aktionen as ReactNode, FahrzeugAktivToggle);
    expect(toggle.props).toEqual({ id: "fz-1", name: "RTW 1", aktiv: true });
    expect(istRekursivJsonSicher(toggle.props)).toBe(true);
  });
});

describe("FahrzeugAktivToggle und echter Loeschdialog", () => {
  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("aendert den sichtbaren Status bei %s nicht optimistisch", async (
    _fall,
    antwort,
  ) => {
    mocks.setAktiv.mockImplementationOnce(antwort);
    await mount(<FahrzeugAktivToggle id="fz-1" name="RTW 1" aktiv />);
    await clickElement(query("button[role='switch']"));
    await warte();

    expect(mocks.setAktiv).toHaveBeenCalledWith({ id: "fz-1", aktiv: false });
    expect(query("button[role='switch']").getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain("Aktiv");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Fahrzeugstatus konnte nicht geändert werden.");
  });

  it("uebernimmt den sichtbaren Status nach erfolgreichem ActionErgebnis", async () => {
    await mount(<FahrzeugAktivToggle id="fz-1" name="RTW 1" aktiv />);
    await clickElement(query("button[role='switch']"));
    await warte();

    expect(query("button[role='switch']").getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain("Inaktiv");
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("loescht result-aware, haelt bei %s offen und navigiert erst bei Erfolg", async (
    _fall,
    antwort,
  ) => {
    mocks.loeschen.mockImplementationOnce(antwort);
    await mount(<FahrzeugAktivToggle id="fz-1" name="RTW 1" aktiv />);
    await clickElement(hostKnopf("Fahrzeug löschen"));
    await warteAuf(
      () => document.body.querySelector("[aria-label='Namen zur Bestätigung eingeben']") !== null,
      "Namensbestaetigung",
    );
    await portalFuellen("[aria-label='Namen zur Bestätigung eingeben']", "RTW 1");
    const loeschen = queryPortal<HTMLButtonElement>("button[data-rolle='loeschen']");
    await clickElement(loeschen);
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Fahrzeug konnte nicht gelöscht werden."),
      "Loeschfehler",
    );

    expect(mocks.loeschen).toHaveBeenCalledWith("fahrzeug", "fz-1");
    expect(queryPortal(".ant-modal")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Framework-Text");

    mocks.loeschen.mockResolvedValueOnce({ ok: true });
    await clickElement(queryPortal("button[data-rolle='loeschen']"));
    await warteAuf(() => mocks.push.mock.calls.length === 1, "Navigation nach Loeschen");
    expect(mocks.push).toHaveBeenCalledWith("/verwaltung/fahrzeuge");
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("laesst auch den Deaktivieren-Dialog bei %s offen", async (
    _fall,
    antwort,
  ) => {
    mocks.pruefen.mockResolvedValueOnce({
      ok: true,
      wert: { loeschbar: false, grund: "Noch verknüpft", kannDeaktivieren: true },
    });
    mocks.deaktivieren.mockImplementationOnce(antwort);
    await mount(<FahrzeugAktivToggle id="fz-1" name="RTW 1" aktiv />);
    await clickElement(hostKnopf("Fahrzeug löschen"));
    await warteAuf(
      () => document.body.querySelector("button[data-rolle='deaktivieren']") !== null,
      "Deaktivieren-Ausgang",
    );
    await clickElement(queryPortal("button[data-rolle='deaktivieren']"));
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Fahrzeug konnte nicht deaktiviert werden."),
      "Deaktivierfehler",
    );

    expect(mocks.deaktivieren).toHaveBeenCalledWith("fahrzeug", "fz-1");
    expect(queryPortal(".ant-modal")).toBeTruthy();
    expect(mocks.push).not.toHaveBeenCalled();
    expect(document.body.textContent).not.toContain("Framework-Text");

    mocks.deaktivieren.mockResolvedValueOnce({ ok: true });
    await clickElement(queryPortal("button[data-rolle='deaktivieren']"));
    await warteAuf(() => mocks.push.mock.calls.length === 1, "Navigation nach Deaktivieren");
    expect(mocks.push).toHaveBeenCalledWith("/verwaltung/fahrzeuge");
  });

  it.each([
    ["ok:false", async () => ({ ok: false as const, fehler: "interner Text" })],
    ["Reject", async () => { throw new Error("Framework-Text"); }],
  ])("uebersetzt eine fehlgeschlagene Loeschpruefung bei %s in einen festen Status", async (
    _fall,
    antwort,
  ) => {
    mocks.pruefen.mockImplementationOnce(antwort);
    await mount(<FahrzeugAktivToggle id="fz-1" name="RTW 1" aktiv />);
    await clickElement(hostKnopf("Fahrzeug löschen"));
    await warteAuf(
      () => (document.body.textContent ?? "").includes("Löschbarkeit konnte nicht geprüft werden."),
      "fester Pruefstatus",
    );
    expect(mocks.pruefen).toHaveBeenCalledWith("fahrzeug", "fz-1");
    expect(document.body.textContent).not.toContain("Framework-Text");
  });

  it("enthaelt keine Exceptiontexte und nur die zugeordneten Actions", () => {
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/fahrzeuge/[id]/FahrzeugAktivToggle.tsx",
      "utf8",
    );
    expect(quelle).not.toMatch(/\.message\b/);
    expect(quelle).toContain("setFahrzeugAktiv");
    expect(quelle).toContain("pruefeLoeschbar");
    expect(quelle).toContain("loescheElement");
    expect(quelle).toContain("deaktiviereElement");
  });
});
