// @vitest-environment jsdom

import { act } from "react";
import { readFileSync } from "node:fs";
import { join } from "node:path";
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
  clickPortal,
  exists,
  existsPortal,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import {
  artikel,
  buchungen,
  chargen,
  lagerorte,
  lagerortVerfall,
} from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { HANDLAGER_ID } from "../../../_lib/konstanten";
import { AussondernRow } from "./AussondernRow";
import { dynamic, verfallSeitenInhalt } from "./page";

const mocks = vi.hoisted(() => ({
  aussondern: vi.fn(),
}));

vi.mock("../../../_actions/aussondern", () => ({
  aussondern: (...args: unknown[]) => mocks.aussondern(...args),
}));

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  mocks.aussondern.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
  vi.clearAllMocks();
  vi.unstubAllEnvs();
});

afterAll(() => vi.restoreAllMocks());

async function warte(): Promise<void> {
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 0));
  });
}

async function warteAuf(pruefen: () => boolean, beschreibung: string): Promise<void> {
  for (let versuch = 0; versuch < 30; versuch++) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

async function bestaetigungOeffnen(): Promise<void> {
  await clickElement(query("button"));
  await warteAuf(() => existsPortal(".ant-popconfirm"), "Popconfirm");
}

describe("AussondernRow", () => {
  it("fragt vor dem Aussondern per Popconfirm, nicht per Modal", async () => {
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);

    await bestaetigungOeffnen();

    expect(existsPortal(".ant-popconfirm")).toBe(true);
    expect(existsPortal(".ant-modal")).toBe(false);
    expect(mocks.aussondern).not.toHaveBeenCalled();
  });

  it("bucht mit einem Kommentar, der die Charge nennt", async () => {
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);
    await bestaetigungOeffnen();

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    expect(mocks.aussondern).toHaveBeenCalledWith({
      chargeId: "c1",
      kommentar: "Verfallskontrolle — L42 · Kompressen ausgesondert",
    });
  });

  it("der Knopf traegt ein aria-label mit der Charge", async () => {
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);

    expect(query("button").getAttribute("aria-label")).toBe(
      "L42 · Kompressen aussondern",
    );
  });

  it("zeigt einen fachlichen Actionfehler als Warnung und laesst die Aktion stehen", async () => {
    mocks.aussondern.mockResolvedValueOnce({
      ok: false,
      fehler: "Charge hat keinen Restbestand im Handlager.",
    });
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);
    await bestaetigungOeffnen();

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => exists(".ant-alert-warning"), "fachliche Warnung");

    expect(query(".ant-alert-warning").textContent).toContain(
      "Charge hat keinen Restbestand im Handlager.",
    );
    expect(query("button").getAttribute("aria-label")).toBe(
      "L42 · Kompressen aussondern",
    );
  });

  it("zeigt bei einem Runtimefehler nur einen festen Text ohne Interna", async () => {
    mocks.aussondern.mockRejectedValueOnce(new Error("SQLITE intern und geheim"));
    await mount(<AussondernRow chargeId="c1" bezeichnung="L42 · Kompressen" />);
    await bestaetigungOeffnen();

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => exists(".ant-alert-warning"), "feste Laufzeitwarnung");

    const text = query(".ant-alert-warning").textContent ?? "";
    expect(text).toContain("Charge konnte nicht ausgesondert werden.");
    expect(text).not.toContain("SQLITE intern und geheim");
  });
});

describe("Verfallsseite als Server Component", () => {
  it("haelt Handlager-Chargen und nur warnende Fahrzeugmeldungen in getrennten Karten", async () => {
    vi.stubEnv("LAGERBUCH_VERFALL_ROT_TAGE", "31");
    vi.stubEnv("LAGERBUCH_VERFALL_GELB_TAGE", "56");
    const jetzt = new Date("2026-06-15T10:00:00Z");
    const testDb = migrierteTestDb("lagerbuch-verfall-seite-");
    try {
      testDb.db.insert(lagerorte).values([
        {
          id: "rtw-warn",
          name: "RTW Warnend",
          typ: "fahrzeug",
          kennung: "UE-RK 130",
          aktiv: true,
        },
        {
          id: "rtw-gruen",
          name: "RTW Grün",
          typ: "fahrzeug",
          kennung: "UE-RK 131",
          aktiv: true,
        },
      ]).run();
      testDb.db.insert(artikel).values({
        id: "verband",
        name: "Kompressen",
        einheit: "Pkg",
        fach: "A1",
        mindestbestand: 0,
        aktiv: true,
        createdAt: jetzt,
      }).run();
      testDb.db.insert(chargen).values([
        {
          id: "charge-abgelaufen",
          artikelId: "verband",
          chargenNr: "ALT-42",
          verfall: "2020-01",
          createdAt: jetzt,
        },
        {
          id: "charge-warnend",
          artikelId: "verband",
          chargenNr: "WARN-42",
          verfall: "2026-07",
          createdAt: jetzt,
        },
        {
          id: "charge-gruen",
          artikelId: "verband",
          chargenNr: "GRUEN-42",
          verfall: "2029-01",
          createdAt: jetzt,
        },
      ]).run();
      testDb.db.insert(buchungen).values([
        {
          id: "buchung-alt",
          ts: jetzt,
          typ: "zugang",
          artikelId: "verband",
          chargeId: "charge-abgelaufen",
          lagerortId: HANDLAGER_ID,
          menge: 2,
          quelleTyp: "system",
          quelleId: "test",
          referenz: null,
          kommentar: null,
        },
        {
          id: "buchung-warnend",
          ts: jetzt,
          typ: "zugang",
          artikelId: "verband",
          chargeId: "charge-warnend",
          lagerortId: HANDLAGER_ID,
          menge: 3,
          quelleTyp: "system",
          quelleId: "test",
          referenz: null,
          kommentar: null,
        },
        {
          id: "buchung-gruen",
          ts: jetzt,
          typ: "zugang",
          artikelId: "verband",
          chargeId: "charge-gruen",
          lagerortId: HANDLAGER_ID,
          menge: 4,
          quelleTyp: "system",
          quelleId: "test",
          referenz: null,
          kommentar: null,
        },
      ]).run();
      testDb.db.insert(lagerortVerfall).values([
        {
          id: "meldung-warnend",
          lagerortId: "rtw-warn",
          artikelId: "verband",
          verfall: "2026-06",
          erfasstAt: new Date("2026-06-14T22:30:00Z"),
          quelleTyp: "oidc",
          quelleId: "test",
        },
        {
          id: "meldung-gruen",
          lagerortId: "rtw-gruen",
          artikelId: "verband",
          verfall: "2029-01",
          erfasstAt: jetzt,
          quelleTyp: "oidc",
          quelleId: "test",
        },
      ]).run();

      await mount(<>{verfallSeitenInhalt(testDb.db, jetzt)}</>);

      expect(queryAll(".ant-card-head-title").map((titel) => titel.textContent)).toEqual([
        "Chargen im Handlager",
        "Im Fahrzeug gemeldet",
      ]);
      expect(queryAll("[role='list'] > [role='listitem']")).toHaveLength(3);
      expect(document.body.textContent).toContain("ALT-42");
      expect(document.body.textContent).toContain("WARN-42");
      expect(document.body.textContent).not.toContain("GRUEN-42");
      expect(document.body.textContent).toContain("RTW Warnend");
      expect(document.body.textContent).not.toContain("RTW Grün");
      expect(document.body.textContent).toContain("gemeldet 15.6.2026");
      expect(queryAll("button[aria-label$='aussondern']")).toHaveLength(1);
      expect(query<HTMLAnchorElement>("a[href='/verwaltung/fahrzeuge/rtw-warn']").textContent)
        .toContain("RTW Warnend");
    } finally {
      testDb.schliessen();
    }
  });

  it("bleibt eine eigene ul/li-Kartenliste ohne Table oder List.Item", () => {
    const quelle = readFileSync(join(
      process.cwd(),
      "src/app/m/lagerbuch/verwaltung/(arbeit)/verfall/page.tsx",
    ), "utf8");
    expect(dynamic).toBe("force-dynamic");
    expect(quelle).toContain("<ul");
    expect(quelle).toContain("<li");
    expect(quelle).not.toContain("<Table");
    expect(quelle).not.toContain("List.Item");
    expect(quelle).toContain("lagerortVerfallListe(db, { nurWarnend: true }, jetzt)");
  });
});
