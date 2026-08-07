// @vitest-environment jsdom

import { act, isValidElement, type ReactElement, type ReactNode } from "react";
import { readFileSync } from "node:fs";
import { Table } from "antd";
import Link from "next/link";
import ts from "typescript";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  mount,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { bzGeraete, bzKontrollen, lagerorte } from "../../../../_db/schema";
import { migrierteTestDb, type TestDb } from "../../../../_db/testdb";
import { BZ_LOGBUCH_GRENZE } from "../../../../_lib/grenzen";
import { Brotkrume } from "../../../../_ui/Brotkrume";
import { Kachel } from "../../../../_ui/Kachel";
import { BzAktivToggle } from "./BzAktivToggle";
import {
  lagerortFilter,
  ReferenzEditor,
  type BzEditorWerte,
} from "./ReferenzEditor";
import { bzGeraetInhalt, dynamic } from "./page";

type LoeschProbeProps = {
  name: string;
  typLabel: string;
  pruefen: () => Promise<{
    loeschbar: boolean;
    grund?: string;
    kannDeaktivieren?: boolean;
  }>;
  onLoeschen: () => Promise<void>;
  onDeaktivieren?: () => Promise<void>;
};

const mocks = vi.hoisted(() => ({
  geraetSpeichern: vi.fn(),
  setGeraetAktiv: vi.fn(),
  pruefeLoeschbar: vi.fn(),
  loescheElement: vi.fn(),
  deaktiviereElement: vi.fn(),
  push: vi.fn(),
  loeschProps: null as LoeschProbeProps | null,
}));

vi.mock("next/navigation", () => ({
  notFound: () => {
    throw new Error("NEXT_NOT_FOUND");
  },
  useRouter: () => ({ push: mocks.push }),
}));

vi.mock("../../../../_actions/bz", () => ({
  geraetSpeichern: (...args: unknown[]) => mocks.geraetSpeichern(...args),
  setGeraetAktiv: (...args: unknown[]) => mocks.setGeraetAktiv(...args),
}));

vi.mock("../../../../_actions/loeschen", () => ({
  pruefeLoeschbar: (...args: unknown[]) => mocks.pruefeLoeschbar(...args),
  loescheElement: (...args: unknown[]) => mocks.loescheElement(...args),
  deaktiviereElement: (...args: unknown[]) => mocks.deaktiviereElement(...args),
}));

vi.mock("../../../../_ui/LoeschButton", () => ({
  LoeschButton: (props: LoeschProbeProps) => {
    mocks.loeschProps = props;
    return <div data-rolle="loesch-probe">Löschbereich</div>;
  },
}));

const NOW = new Date("2026-08-07T12:00:00Z");
const EDITOR_WERTE: BzEditorWerte = {
  id: "bz-1",
  name: "Accu-Chek A",
  barcode: "1234567890128",
  lagerortId: "rtw-1",
  streifenLot: "LOT-NEU",
  level1Label: "Level 1",
  level1Min: 40,
  level1Max: 60,
  level2Label: "Level 2",
  level2Min: 250,
  level2Max: 350,
};
const LAGERORT_OPTIONEN = [
  { id: "rtw-1", name: "RTW 1", typ: "fahrzeug" as const },
  { id: "handlager", name: "Handlager", typ: "lager" as const },
];

let t: TestDb;

function kontrolle({
  id,
  ts,
  refSnapshot,
  kommentar,
}: {
  id: string;
  ts: Date;
  refSnapshot: string | null;
  kommentar: string | null;
}) {
  return {
    id,
    geraetId: "bz-1",
    ts,
    quelleTyp: "system" as const,
    quelleId: "test",
    level1Wert: 50,
    level1ImBereich: true,
    level2Wert: 300,
    level2ImBereich: true,
    kompresseVerfall: "2027-01",
    sticks: 12,
    lanzetten: 8,
    batterieGewechselt: true,
    kommentar,
    bestanden: true,
    refSnapshot,
  };
}

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

function enthaeltDate(wert: unknown): boolean {
  if (wert instanceof Date) return true;
  if (Array.isArray(wert)) return wert.some(enthaeltDate);
  if (wert && typeof wert === "object") return Object.values(wert).some(enthaeltDate);
  return false;
}

function analysiereRscTable(quelle: string) {
  const source = ts.createSourceFile(
    "page.tsx",
    quelle,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  let renderEigenschaften = 0;
  let funktionaleRowKeys = 0;

  function besuche(node: ts.Node) {
    if (
      ts.isPropertyAssignment(node)
      && ((ts.isIdentifier(node.name) && node.name.text === "render")
        || (ts.isStringLiteral(node.name) && node.name.text === "render"))
    ) {
      renderEigenschaften += 1;
    }
    if (ts.isJsxAttribute(node) && node.name.getText(source) === "rowKey") {
      const initializer = node.initializer;
      const statisch = initializer !== undefined && (
        ts.isStringLiteral(initializer)
        || (ts.isJsxExpression(initializer) && initializer.expression !== undefined
          && ts.isStringLiteral(initializer.expression))
      );
      if (!statisch) funktionaleRowKeys += 1;
    }
    ts.forEachChild(node, besuche);
  }

  besuche(source);
  return { renderEigenschaften, funktionaleRowKeys };
}

async function warte(): Promise<void> {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
}

async function feldSetzen(selector: string, wert: string): Promise<HTMLInputElement> {
  const input = document.querySelector<HTMLInputElement>(selector);
  if (!input) throw new Error(`Feld nicht gefunden: ${selector}`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter fuer ${selector}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  return input;
}

async function feldVerlassen(input: HTMLElement): Promise<void> {
  await act(async () => {
    input.dispatchEvent(new FocusEvent("focusout", { bubbles: true }));
  });
  await warte();
}

async function standortWaehlen(text: string): Promise<void> {
  const input = document.querySelector<HTMLInputElement>("[aria-label='Standort']");
  if (!input?.closest(".ant-select")) throw new Error("Standort-Auswahl fehlt");
  await act(async () => {
    input.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
  });
  await warte();
  const option = Array.from(document.body.querySelectorAll<HTMLElement>(".ant-select-item-option"))
    .find((element) => (element.textContent ?? "").includes(text));
  if (!option) throw new Error(`Standort nicht gefunden: ${text}`);
  await clickElement(option);
  await warte();
}

async function editorMounten(): Promise<void> {
  await mount(<ReferenzEditor geraet={EDITOR_WERTE} lagerorte={LAGERORT_OPTIONEN} />);
}

beforeEach(() => {
  vi.useFakeTimers({ shouldAdvanceTime: true });
  vi.clearAllMocks();
  mocks.loeschProps = null;
  mocks.geraetSpeichern.mockResolvedValue({ ok: true, wert: { id: "bz-1" } });
  mocks.setGeraetAktiv.mockResolvedValue({ ok: true });
  mocks.pruefeLoeschbar.mockResolvedValue({ ok: true, wert: { loeschbar: true } });
  mocks.loescheElement.mockResolvedValue({ ok: true });
  mocks.deaktiviereElement.mockResolvedValue({ ok: true });

  t = migrierteTestDb("lagerbuch-bz-detail-seite-");
  t.db.insert(lagerorte).values({
    id: "rtw-1",
    name: "RTW 1",
    typ: "fahrzeug",
    kennung: "UE-RK 1234",
    aktiv: true,
  }).run();
  t.db.insert(bzGeraete).values({
    ...EDITOR_WERTE,
    aktiv: true,
    createdAt: NOW,
  }).run();
  t.db.insert(bzKontrollen).values([
    kontrolle({
      id: "k-neu",
      ts: new Date("2026-08-06T12:00:00Z"),
      refSnapshot: null,
      kommentar: "Kommentar sichtbar",
    }),
    kontrolle({
      id: "k-alt",
      ts: new Date("2026-07-07T12:00:00Z"),
      refSnapshot: JSON.stringify({
        level1Min: 30,
        level1Max: 70,
        level2Min: 200,
        level2Max: 400,
      }),
      kommentar: null,
    }),
    kontrolle({
      id: "k-kaputt",
      ts: new Date("2026-06-07T12:00:00Z"),
      refSnapshot: "{kaputt",
      kommentar: null,
    }),
  ]).run();
});

afterEach(async () => {
  await unmount();
  t.schliessen();
  vi.useRealTimers();
});

describe("BZ-Geräteblatt als Server Component", () => {
  it("zeigt vier KPIs, äußere Wege und nur primitive Editor-Daten", () => {
    const seite = bzGeraetInhalt(t.db, "bz-1", NOW);
    const kacheln = elementeVomTyp(seite, Kachel);
    expect(kacheln).toHaveLength(4);
    expect(kacheln.map((element) => (element.props as { beschriftung: ReactNode }).beschriftung))
      .toEqual(["Nächste Kontrolle", "Letzte Kontrolle", "Ø Akkulaufzeit", "Status / Standort"]);
    expect((kacheln[0].props as { ton: string }).ton).toBe("ok");

    const brotkrume = elementeVomTyp(seite, Brotkrume)[0];
    expect((brotkrume.props as { href: string }).href).toBe("/verwaltung/bz");
    const links = elementeVomTyp(seite, Link);
    expect(links.map((element) => (element.props as { href?: string }).href))
      .toContain("/verwaltung/bz/bz-1/kontrolle");
    const kontrolleLink = links.find(
      (element) => (element.props as { href?: string }).href
        === "/verwaltung/bz/bz-1/kontrolle",
    );
    expect((kontrolleLink?.props as { role?: string }).role).toBe("button");

    const editor = elementeVomTyp(seite, ReferenzEditor)[0];
    const editorProps = editor.props as {
      geraet: BzEditorWerte;
      lagerorte: unknown[];
    };
    expect(editorProps.geraet).toEqual(EDITOR_WERTE);
    expect(enthaeltDate(editorProps)).toBe(false);
  });

  it("bereitet acht Logbuchzellen aus refDamals vor und zeigt Kommentare", () => {
    const seite = bzGeraetInhalt(t.db, "bz-1", NOW);
    const table = elementeVomTyp(seite, Table)[0];
    const props = table.props as {
      rowKey: string;
      pagination: boolean;
      scroll: { x: string };
      "aria-label": string;
      locale: { emptyText: string };
      columns: Array<{ title: string }>;
      dataSource: Array<Record<string, ReactNode>>;
    };

    expect(props.columns.map((spalte) => spalte.title)).toEqual([
      "Zeitpunkt",
      "Ergebnis",
      "Level 1",
      "Level 2",
      "Verbrauch",
      "Akku",
      "Wer",
      "Kommentar",
    ]);
    expect(props).toMatchObject({
      rowKey: "id",
      pagination: false,
      scroll: { x: "max-content" },
      "aria-label": "Logbuch der Kontrollen",
      locale: { emptyText: "Für dieses Gerät wurde noch keine Kontrolle erfasst." },
    });

    const alt = props.dataSource.find((zeile) => zeile.id === "k-alt")!;
    expect(textVon(alt.level1)).toContain("damals 30–70");
    expect(textVon(alt.level1)).not.toContain("40–60");
    const ohneSnapshot = props.dataSource.find((zeile) => zeile.id === "k-neu")!;
    const kaputt = props.dataSource.find((zeile) => zeile.id === "k-kaputt")!;
    expect(textVon(ohneSnapshot.level1)).toContain("damals ?–?");
    expect(textVon(kaputt.level2)).toContain("damals ?–?");
    expect(textVon(ohneSnapshot.kommentar)).toBe("Kommentar sichtbar");
  });

  it("macht den 100er-Deckel bedingt sichtbar", () => {
    for (let i = 0; i < BZ_LOGBUCH_GRENZE - 2; i++) {
      t.db.insert(bzKontrollen).values({
        ...kontrolle({
          id: `deckel-${String(i).padStart(3, "0")}`,
          ts: new Date("2026-08-07T10:00:00Z"),
          refSnapshot: null,
          kommentar: null,
        }),
        batterieGewechselt: false,
      }).run();
    }
    const seite = bzGeraetInhalt(t.db, "bz-1", NOW);
    expect(textVon(seite)).toContain(`Neueste ${BZ_LOGBUCH_GRENZE} von mehr Einträgen`);
  });

  it("liefert für eine unbekannte ID notFound", () => {
    expect(() => bzGeraetInhalt(t.db, "fehlt", NOW)).toThrow("NEXT_NOT_FOUND");
  });

  it("exportiert force-dynamic und hält die RSC-Table funktionsfrei", () => {
    expect(dynamic).toBe("force-dynamic");
    const quelle = readFileSync(
      "src/app/m/lagerbuch/verwaltung/(arbeit)/bz/[id]/page.tsx",
      "utf8",
    );
    expect(analysiereRscTable(quelle)).toEqual({
      renderEigenschaften: 0,
      funktionaleRowKeys: 0,
    });
  });
});

describe("ReferenzEditor", () => {
  it("bietet alle alten Felder ohne Form und filtert den Standort nach Label", async () => {
    await editorMounten();
    for (const label of [
      "Name",
      "Barcode",
      "Standort",
      "Streifen-Lot",
      "Level-1-Bezeichnung",
      "Level-1-Untergrenze",
      "Level-1-Obergrenze",
      "Level-2-Bezeichnung",
      "Level-2-Untergrenze",
      "Level-2-Obergrenze",
    ]) {
      expect(document.querySelector(`[aria-label='${label}']`), label).not.toBeNull();
    }
    expect(document.querySelector(".ant-form-item")).toBeNull();
    expect(lagerortFilter("RTW", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(true);
    expect(lagerortFilter("Hand", { label: "RTW 1", keywords: "UE-RK 1234" })).toBe(false);
  });

  it("committet Text auf Blur mit vollständigem Payload", async () => {
    await editorMounten();
    const name = await feldSetzen("[aria-label='Name']", "Accu-Chek Neu");
    expect(mocks.geraetSpeichern).not.toHaveBeenCalled();
    await feldVerlassen(name);

    expect(mocks.geraetSpeichern).toHaveBeenCalledTimes(1);
    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      ...EDITOR_WERTE,
      name: "Accu-Chek Neu",
    });
  });

  it("normalisiert leere optionale Felder im vollständigen Payload zu undefined", async () => {
    const leer: BzEditorWerte = {
      ...EDITOR_WERTE,
      barcode: null,
      streifenLot: null,
      level1Label: null,
      level1Min: null,
      level1Max: null,
      level2Label: null,
      level2Min: null,
      level2Max: null,
    };
    await mount(<ReferenzEditor geraet={leer} lagerorte={LAGERORT_OPTIONEN} />);
    const name = await feldSetzen("[aria-label='Name']", "Accu-Chek Leer");
    await feldVerlassen(name);

    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      id: "bz-1",
      name: "Accu-Chek Leer",
      barcode: undefined,
      lagerortId: "rtw-1",
      streifenLot: undefined,
      level1Label: undefined,
      level1Min: undefined,
      level1Max: undefined,
      level2Label: undefined,
      level2Min: undefined,
      level2Max: undefined,
    });
  });

  it("committet den Standort auf Select-Änderung mit vollständigem Payload", async () => {
    await editorMounten();
    await standortWaehlen("Handlager");

    expect(mocks.geraetSpeichern).toHaveBeenCalledTimes(1);
    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      ...EDITOR_WERTE,
      lagerortId: "handlager",
    });
  });

  it("fasst Zahländerungen nach echten 400 ms zusammen und nutzt die neuesten Werte", async () => {
    await editorMounten();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await feldSetzen("[aria-label='Level-1-Untergrenze']", "31");
    await feldSetzen("[aria-label='Level-1-Obergrenze']", "71");

    await act(async () => { vi.advanceTimersByTime(399); });
    expect(mocks.geraetSpeichern).not.toHaveBeenCalled();
    await act(async () => {
      vi.advanceTimersByTime(1);
      await Promise.resolve();
      await Promise.resolve();
    });

    expect(mocks.geraetSpeichern).toHaveBeenCalledTimes(1);
    expect(mocks.geraetSpeichern).toHaveBeenCalledWith({
      ...EDITOR_WERTE,
      level1Min: 31,
      level1Max: 71,
    });
  });

  it("räumt einen offenen Zahlen-Timer beim Unmount auf", async () => {
    await editorMounten();
    vi.useFakeTimers({ shouldAdvanceTime: false });
    await feldSetzen("[aria-label='Level-2-Untergrenze']", "210");
    await unmount();
    await act(async () => { vi.advanceTimersByTime(400); });
    expect(mocks.geraetSpeichern).not.toHaveBeenCalled();
  });

  it("zeigt einen festen Actionfehler statt einen fehlgeschlagenen Commit zu verschweigen", async () => {
    mocks.geraetSpeichern.mockResolvedValueOnce({ ok: false, fehler: "interne Einzelheit" });
    await editorMounten();
    const barcode = await feldSetzen("[aria-label='Barcode']", "9999999999999");
    await feldVerlassen(barcode);

    expect(document.body.textContent).toContain("BZ-Gerät konnte nicht gespeichert werden.");
    expect(document.body.textContent).not.toContain("interne Einzelheit");
  });
});

describe("BzAktivToggle", () => {
  it("übernimmt eine erfolgreiche Statusänderung", async () => {
    await mount(<BzAktivToggle id="bz-1" name="Accu-Chek A" aktiv />);
    const schalter = document.querySelector<HTMLElement>("[role='switch']");
    if (!schalter) throw new Error("Aktiv-Schalter fehlt");
    await clickElement(schalter);
    await warte();

    expect(schalter.getAttribute("aria-checked")).toBe("false");
    expect(document.body.textContent).toContain("Inaktiv");
  });

  it("behält bei fehlgeschlagener Statusänderung den Zustand und zeigt einen festen Fehler", async () => {
    mocks.setGeraetAktiv.mockResolvedValueOnce({ ok: false, fehler: "interne Einzelheit" });
    await mount(<BzAktivToggle id="bz-1" name="Accu-Chek A" aktiv />);
    const schalter = document.querySelector<HTMLElement>("[role='switch']");
    if (!schalter) throw new Error("Aktiv-Schalter fehlt");
    await clickElement(schalter);
    await warte();

    expect(mocks.setGeraetAktiv).toHaveBeenCalledWith({ id: "bz-1", aktiv: false });
    expect(schalter.getAttribute("aria-checked")).toBe("true");
    expect(document.body.textContent).toContain("BZ-Gerätestatus konnte nicht geändert werden.");
    expect(document.body.textContent).not.toContain("interne Einzelheit");
  });

  it("verdrahtet die echte Lösch-API, lehnt fest ab und navigiert nur nach Erfolg", async () => {
    await mount(<BzAktivToggle id="bz-1" name="Accu-Chek A" aktiv />);
    const props = mocks.loeschProps;
    if (!props) throw new Error("LoeschButton-Props fehlen");
    expect(props.name).toBe("Accu-Chek A");
    expect(props.typLabel).toBe("BZ-Gerät");

    mocks.pruefeLoeschbar.mockResolvedValueOnce({ ok: false, fehler: "intern" });
    await expect(props.pruefen()).resolves.toEqual({
      loeschbar: false,
      grund: "Löschbarkeit konnte nicht geprüft werden.",
      kannDeaktivieren: false,
    });
    expect(mocks.pruefeLoeschbar).toHaveBeenCalledWith("bzGeraet", "bz-1");

    mocks.loescheElement.mockResolvedValueOnce({ ok: false, fehler: "intern" });
    await expect(props.onLoeschen()).rejects.toThrow("BZ-Gerät konnte nicht gelöscht werden.");
    expect(mocks.push).not.toHaveBeenCalled();

    mocks.loescheElement.mockResolvedValueOnce({ ok: true });
    await props.onLoeschen();
    expect(mocks.loescheElement).toHaveBeenLastCalledWith("bzGeraet", "bz-1");
    expect(mocks.push).toHaveBeenCalledWith("/verwaltung/bz");

    mocks.deaktiviereElement.mockResolvedValueOnce({ ok: false, fehler: "intern" });
    await expect(props.onDeaktivieren?.()).rejects.toThrow(
      "BZ-Gerät konnte nicht deaktiviert werden.",
    );
    expect(mocks.push).toHaveBeenCalledTimes(1);
  });
});
