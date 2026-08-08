// @vitest-environment jsdom

import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickPortal,
  clickElement,
  existsPortal,
  fill,
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { lagerorte, o2Flaschen, o2Messungen, users } from "../../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../../_db/testdb";
import type { Loeschbarkeit } from "../../../../_lib/loeschen";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Kachel } from "../../../../_ui/Kachel";
import { SeitenKopf } from "../../../../_ui/SeitenKopf";
import s from "../../../../_ui/verwaltung.module.css";
import { FlascheAktivToggle } from "./FlascheAktivToggle";
import { ReferenzFelder } from "./ReferenzFelder";
import {
  VerlaufTabelle,
  type VerlaufAnzeigeZeile,
} from "./VerlaufTabelle";
import { dynamic, o2FlascheInhalt } from "./page";

type LoeschProbeProps = {
  name: string;
  typLabel: string;
  pruefen: () => Promise<Loeschbarkeit>;
  onLoeschen: () => Promise<void>;
  onDeaktivieren?: () => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  speichern: vi.fn(),
  aktiv: vi.fn(),
  pruefen: vi.fn(),
  loeschen: vi.fn(),
  deaktivieren: vi.fn(),
  push: vi.fn(),
  loeschProps: null as LoeschProbeProps | null,
}));

vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("../../../../_actions/sauerstoff", () => ({
  flascheSpeichern: (...args: unknown[]) => mocks.speichern(...args),
  setFlascheAktiv: (...args: unknown[]) => mocks.aktiv(...args),
}));

vi.mock("../../../../_actions/loeschen", () => ({
  pruefeLoeschbar: (...args: unknown[]) => mocks.pruefen(...args),
  loescheElement: (...args: unknown[]) => mocks.loeschen(...args),
  deaktiviereElement: (...args: unknown[]) => mocks.deaktivieren(...args),
}));

vi.mock("../../../../_ui/LoeschButton", async () => {
  const wirklich = await vi.importActual<typeof import("../../../../_ui/LoeschButton")>(
    "../../../../_ui/LoeschButton",
  );
  return {
    LoeschButton: (props: LoeschProbeProps) => {
      mocks.loeschProps = props;
      return <wirklich.LoeschButton {...props} />;
    },
  };
});

const SEITEN_QUELLE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/page.tsx",
  "utf8",
);
const MESSUNG_QUELLE = readFileSync(
  "src/app/m/lagerbuch/verwaltung/(arbeit)/sauerstoff/[id]/MessungForm.tsx",
  "utf8",
);
const NOW = new Date("2026-08-07T12:00:00Z");
const echtesGetComputedStyle = window.getComputedStyle;

let t: TestDb;

beforeAll(() => {
  window.getComputedStyle = (element: Element) => echtesGetComputedStyle(element);
});

afterAll(() => {
  window.getComputedStyle = echtesGetComputedStyle;
});

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
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
  if (typeof wert !== "object" || isValidElement(wert) || wert instanceof Date) return false;
  if (Object.getPrototypeOf(wert) !== Object.prototype) return false;
  return Object.values(wert).every(istRekursivJsonSicher);
}

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 50; versuch++) {
    if (pruefen()) return;
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 0));
    });
  }
  throw new Error(`Zeitüberschreitung: ${beschreibung}`);
}

async function blur(selector: string): Promise<void> {
  const feld = query<HTMLElement>(selector);
  await act(async () => {
    feld.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await warte();
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

beforeEach(() => {
  mocks.speichern.mockReset();
  mocks.aktiv.mockReset();
  mocks.pruefen.mockReset();
  mocks.loeschen.mockReset();
  mocks.deaktivieren.mockReset();
  mocks.push.mockReset();
  mocks.loeschProps = null;
  mocks.speichern.mockResolvedValue({ ok: true, wert: { id: "flasche-1" } });
  mocks.aktiv.mockResolvedValue({ ok: true });
  mocks.pruefen.mockResolvedValue({
    ok: true,
    wert: { loeschbar: true, kannDeaktivieren: false },
  });
  mocks.loeschen.mockResolvedValue({ ok: true });
  mocks.deaktivieren.mockResolvedValue({ ok: true });

  t = migrierteTestDb("lagerbuch-t142-");
  t.db.insert(lagerorte).values({
    id: "rtw-1",
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "UE-RK 1234",
    aktiv: true,
  }).run();
  t.db.insert(users).values({
    id: "sub-1",
    name: "Anna Beispiel",
    email: null,
    lastLoginAt: NOW,
  }).run();
  t.db.insert(o2Flaschen).values([
    {
      id: "flasche-1",
      name: "O2 Detail",
      lagerortId: "rtw-1",
      groesseLiter: null,
      nennfuelldruckBar: 200,
      aktiv: true,
      createdAt: NOW,
    },
    {
      id: "flasche-ohne",
      name: "O2 Unbekannt",
      lagerortId: "rtw-1",
      groesseLiter: 2,
      nennfuelldruckBar: 200,
      aktiv: true,
      createdAt: NOW,
    },
  ]).run();
  t.db.insert(o2Messungen).values([
    {
      id: "messung-alt",
      flascheId: "flasche-1",
      ts: new Date("2026-08-06T10:00:00Z"),
      druckBar: 120,
      quelleTyp: "oidc",
      quelleId: "sub-1",
      kommentar: null,
    },
    {
      id: "messung-check",
      flascheId: "flasche-1",
      ts: NOW,
      druckBar: 20,
      quelleTyp: "token",
      quelleId: "token-rtw-1",
      kommentar: "Kontrolle",
    },
  ]).run();
});

afterEach(async () => {
  await unmount();
  t.schliessen();
  vi.useRealTimers();
});

describe("Flaschenblatt als Server Component", () => {
  it("zeigt vier KPIs, Ampel-Rot-Warnung, Brotkrume und die Client-Inseln", () => {
    const seite = o2FlascheInhalt(t.db, "flasche-1");
    const kacheln = elementeVomTyp(seite, Kachel);
    expect(kacheln).toHaveLength(4);
    expect(kacheln.map((kachel) => (kachel.props as { beschriftung: ReactNode }).beschriftung))
      .toEqual(["Aktueller Druck", "Füllstand", "Nennfülldruck", "Status / Standort"]);
    expect(kacheln.map((kachel) => textVon(
      (kachel.props as { zahl: ReactNode }).zahl,
    ))).toEqual(["20 bar", "10 %", "200 bar", "AktivRTW 1"]);
    expect(kacheln.map((kachel) => (kachel.props as { ton?: string }).ton))
      .toEqual([undefined, "rot", undefined, "ok"]);

    const brotkrume = elementeVomTyp(seite, Brotkrume)[0];
    expect((brotkrume.props as { href: string }).href).toBe("/verwaltung/sauerstoff");
    const kopf = elementeVomTyp(seite, SeitenKopf)[0];
    expect(elementeVomTyp(seite, ReferenzFelder)[0].props).toEqual({
      id: "flasche-1",
      name: "O2 Detail",
      lagerortId: "rtw-1",
      groesseLiter: null,
      nennfuelldruckBar: 200,
    });
    const toggle = elementeVomTyp(
      (kopf.props as { aktionen: ReactNode }).aktionen,
      FlascheAktivToggle,
    )[0];
    expect(toggle.props).toEqual({
      id: "flasche-1",
      name: "O2 Detail",
      aktiv: true,
    });

    const warnung = elementeVomTyp(seite, "div")
      .find((element) => (element.props as { className?: string }).className === s.warnbox);
    expect(textVon(warnung)).toContain("Niedriger Druck");
  });

  it("übergibt ausschließlich rekursiv JSON-sichere primitive Verlaufs-DTOs", () => {
    const seite = o2FlascheInhalt(t.db, "flasche-1");
    const tabelle = elementeVomTyp(seite, VerlaufTabelle)[0];
    const props = tabelle.props as { zeilen: VerlaufAnzeigeZeile[] };

    expect(props.zeilen).toEqual([
      {
        id: "messung-check",
        zeitpunktText: "07.08. 14:00",
        druckBar: 20,
        herkunft: "check",
        werText: "token-rtw-1",
        kommentarText: "Kontrolle",
      },
      {
        id: "messung-alt",
        zeitpunktText: "06.08. 12:00",
        druckBar: 120,
        herkunft: "manuell",
        werText: "Anna Beispiel",
        kommentarText: null,
      },
    ]);
    expect(istRekursivJsonSicher(props.zeilen)).toBe(true);
  });

  it("zeigt ohne Messung den Nullstatus als unbekannt und nicht als 0 Prozent", () => {
    const seite = o2FlascheInhalt(t.db, "flasche-ohne");
    const kacheln = elementeVomTyp(seite, Kachel);

    expect(textVon((kacheln[0].props as { zahl: ReactNode }).zahl)).toBe("–");
    expect(textVon((kacheln[1].props as { zahl: ReactNode }).zahl)).toBe("unbekannt");
    expect((kacheln[1].props as { ton?: string }).ton).toBe("grau");
    expect(textVon(seite)).not.toContain("Niedriger Druck");
  });

  it("liefert für eine unbekannte ID notFound und exportiert force-dynamic", () => {
    expect(() => o2FlascheInhalt(t.db, "fehlt")).toThrow("NEXT_NOT_FOUND");
    expect(dynamic).toBe("force-dynamic");
  });

  it("hält antd Table und funktionale Zellrenderer vollständig aus der RSC-Datei", () => {
    expect(SEITEN_QUELLE)
      .not.toMatch(/import\s*\{[^}]*\bTable\b[^}]*\}\s*from\s*["']antd["']/);
    expect(SEITEN_QUELLE).not.toMatch(/<Table\b/);
    expect(SEITEN_QUELLE).not.toMatch(/\brender\s*:/);
  });

  it("verwendet für neue Alerts die antd-v6-Prop title", () => {
    expect(MESSUNG_QUELLE).toMatch(/<Alert[\s\S]*?title=/);
    expect(MESSUNG_QUELLE).not.toMatch(/<Alert[\s\S]*?\bmessage=/);
  });
});

describe("ReferenzFelder", () => {
  function mounten(groesseLiter: number | null = null) {
    return mount(
      <ReferenzFelder
        id="flasche-1"
        name="O2 Detail"
        lagerortId="rtw-1"
        groesseLiter={groesseLiter}
        nennfuelldruckBar={200}
      />,
    );
  }

  it("rendert Name, Größe und Nennfülldruck ohne Form", async () => {
    await mounten();
    for (const label of ["Name", "Größe in Litern", "Nennfülldruck"]) {
      expect(document.querySelector(`[aria-label='${label}']`), label).not.toBeNull();
    }
    expect(document.querySelector("form")).toBeNull();
    expect(document.querySelector(".ant-form-item")).toBeNull();
  });

  it("committet den Namen auf Blur mit vollständigem Payload und null als undefined", async () => {
    await mounten();
    await fill("input[aria-label='Name']", "  O2 Reserve  ");
    await blur("input[aria-label='Name']");

    expect(mocks.speichern).toHaveBeenCalledWith({
      id: "flasche-1",
      name: "O2 Reserve",
      lagerortId: "rtw-1",
      groesseLiter: undefined,
      nennfuelldruckBar: 200,
    });
  });

  it("startet den echten 400-ms-Debounce neu und nutzt die neuesten Werte", async () => {
    await mounten(2);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await fill("input[aria-label='Größe in Litern']", "4");
    await act(async () => { vi.advanceTimersByTime(250); });
    await fill("input[aria-label='Nennfülldruck']", "300");

    await act(async () => { vi.advanceTimersByTime(399); });
    expect(mocks.speichern).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.speichern).toHaveBeenCalledTimes(1);
    expect(mocks.speichern).toHaveBeenCalledWith({
      id: "flasche-1",
      name: "O2 Detail",
      lagerortId: "rtw-1",
      groesseLiter: 4,
      nennfuelldruckBar: 300,
    });
  });

  it("räumt einen offenen Debounce beim Unmount auf", async () => {
    await mounten(2);
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await fill("input[aria-label='Nennfülldruck']", "300");
    await unmount();
    await act(async () => { vi.advanceTimersByTime(400); });

    expect(mocks.speichern).not.toHaveBeenCalled();
  });

  /**
   * ZWEI VERSCHIEDENE KANAELE, absichtlich unterschiedlich behandelt:
   *
   * Bei `ok:false` steht der Satz AUS DER ACTION da. Er ist keine „interne
   * Einzelheit", sondern der fachliche Grund („Lagerort nicht gefunden."), und
   * `_lib/actionErgebnis` beschreibt genau ihn als den Zweck des
   * Rueckgabewertes. Nur er sagt der Person, ob neu laden oder etwas anderes
   * eintragen hilft.
   *
   * Beim WURF bleibt die Modulkonstante, und der Grund darf nicht
   * durchscheinen: `e.message` ist in Produktion nicht der deutsche Satz,
   * sondern Framework-Englisch, und der Pfad im Stack geht niemanden an.
   */
  it("zeigt bei ok:false den Satz der Action", async () => {
    mocks.speichern.mockResolvedValueOnce({
      ok: false as const,
      fehler: "Lagerort nicht gefunden.",
    });
    await mounten();
    await fill("input[aria-label='Name']", "O2 Reserve");
    await blur("input[aria-label='Name']");

    expect(query(".ant-alert-warning").textContent)
      .toContain("Lagerort nicht gefunden.");
  });

  it("zeigt beim Wurf einen festen Fehler und haelt den Grund geheim", async () => {
    mocks.speichern.mockRejectedValueOnce(new Error("Pfad geheim"));
    await mounten();
    await fill("input[aria-label='Name']", "O2 Reserve");
    await blur("input[aria-label='Name']");

    expect(query(".ant-alert-warning").textContent)
      .toContain("Sauerstoffflasche konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("Pfad geheim");
  });
});

describe("FlascheAktivToggle", () => {
  async function mounten(aktiv = true): Promise<void> {
    await mount(<FlascheAktivToggle id="flasche-1" name="O2 Detail" aktiv={aktiv} />);
  }

  it("übernimmt den Toggle-Zustand nur nach erfolgreicher Action", async () => {
    await mounten();
    const schalter = query<HTMLElement>("[role='switch']");
    await clickElement(schalter);
    await warte();

    expect(mocks.aktiv).toHaveBeenCalledWith({ id: "flasche-1", aktiv: false });
    expect(schalter.getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain("Inaktiv");
  });

  it("behält bei ok:false den Zustand und zeigt nur den festen Fehler", async () => {
    mocks.aktiv.mockResolvedValueOnce({ ok: false, fehler: "interne Einzelheit" });
    await mounten();
    const schalter = query<HTMLElement>("[role='switch']");
    await clickElement(schalter);
    await warte();

    expect(schalter.getAttribute("aria-checked")).toBe("true");
    expect(query(".ant-alert-warning").textContent)
      .toContain("Flaschenstatus konnte nicht geändert werden.");
    expect(document.body.textContent).not.toContain("interne Einzelheit");
  });

  it("blockiert synchrone Doppel-Toggles", async () => {
    let fertig!: (wert: { ok: true }) => void;
    mocks.aktiv.mockReturnValueOnce(new Promise((resolve) => { fertig = resolve; }));
    await mounten();
    const schalter = query<HTMLElement>("[role='switch']");
    await clickElement(schalter);
    await clickElement(schalter);

    expect(mocks.aktiv).toHaveBeenCalledTimes(1);
    await act(async () => { fertig({ ok: true }); });
    await warte();
  });

  it("wertet Prüfen, Löschen und Deaktivieren aus und navigiert nur bei Erfolg", async () => {
    await mounten();
    const props = mocks.loeschProps;
    if (!props) throw new Error("LoeschButton-Props fehlen");
    expect(props.name).toBe("O2 Detail");
    expect(props.typLabel).toBe("Sauerstoffflasche");

    mocks.pruefen.mockResolvedValueOnce({ ok: false, fehler: "intern" });
    await expect(props.pruefen()).resolves.toEqual({
      loeschbar: false,
      grund: "Löschbarkeit konnte nicht geprüft werden.",
      kannDeaktivieren: false,
    });

    mocks.loeschen.mockResolvedValueOnce({ ok: false, fehler: "intern" });
    await expect(props.onLoeschen()).rejects.toThrow(
      "Sauerstoffflasche konnte nicht gelöscht werden.",
    );
    expect(mocks.push).not.toHaveBeenCalled();

    mocks.loeschen.mockResolvedValueOnce({ ok: true });
    await props.onLoeschen();
    expect(mocks.loeschen).toHaveBeenLastCalledWith("o2Flasche", "flasche-1");
    expect(mocks.push).toHaveBeenLastCalledWith("/verwaltung/sauerstoff");

    mocks.deaktivieren.mockRejectedValueOnce(new Error("Pfad geheim"));
    await expect(props.onDeaktivieren?.()).rejects.toThrow(
      "Sauerstoffflasche konnte nicht deaktiviert werden.",
    );
    expect(mocks.push).toHaveBeenCalledTimes(1);

    mocks.deaktivieren.mockResolvedValueOnce({ ok: true });
    await props.onDeaktivieren?.();
    expect(mocks.deaktivieren).toHaveBeenLastCalledWith("o2Flasche", "flasche-1");
    expect(mocks.push).toHaveBeenCalledTimes(2);
  });

  it("hält den echten Löschdialog bei ok:false offen und zeigt den festen Text", async () => {
    mocks.loeschen.mockResolvedValueOnce({ ok: false, fehler: "interne Einzelheit" });
    await mounten();
    const loeschKnopf = queryAll<HTMLButtonElement>("button")
      .find((knopf) => knopf.textContent?.includes("Sauerstoffflasche löschen"));
    if (!loeschKnopf) throw new Error("Löschknopf fehlt");
    await clickElement(loeschKnopf);
    await warteAuf(
      () => existsPortal("[aria-label='Namen zur Bestätigung eingeben']"),
      "geöffneter Löschdialog",
    );
    await fillPortal("[aria-label='Namen zur Bestätigung eingeben']", "O2 Detail");
    await clickPortal("[data-rolle='loeschen']");
    await warteAuf(
      () => (queryPortal(".ant-modal").textContent ?? "")
        .includes("Sauerstoffflasche konnte nicht gelöscht werden."),
      "sichtbarer Löschfehler",
    );

    expect(existsPortal(".ant-modal")).toBe(true);
    expect(document.body.textContent).not.toContain("interne Einzelheit");
    expect(mocks.push).not.toHaveBeenCalled();
  });
});
