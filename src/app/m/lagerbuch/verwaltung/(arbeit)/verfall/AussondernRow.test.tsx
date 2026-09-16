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
  queryPortal,
  rerender,
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
import type { VerfallOrt } from "../../../_lib/lesepfade/verfall";
import { AussondernRow } from "./AussondernRow";
import { dynamic, verfallSeitenInhalt } from "./page";

/**
 * DRK-339 — DER REGELFALL IST EIN LIEGEPLATZ, und die Zeile bietet dann keine
 * Wahl an. Die Faelle mit zweien stehen unten in ihrem eigenen Block.
 */
const EIN_ORT: VerfallOrt[] = [
  { id: HANDLAGER_ID, name: "Nicht zugeordnet", menge: 5, zugangshinweis: null },
];

const ZWEI_ORTE: VerfallOrt[] = [
  { id: HANDLAGER_ID, name: "Nicht zugeordnet", menge: 4, zugangshinweis: null },
  { id: "schrank-gf", name: "GF-Schrank", menge: 6, zugangshinweis: "Schlüssel beim GF" },
];

function radioMitText(text: string): HTMLInputElement {
  const treffer = [...document.body.querySelectorAll<HTMLElement>(".ant-radio-wrapper")]
    .find((wrapper) => wrapper.textContent?.includes(text));
  if (!treffer) throw new Error(`Keine Auswahlzeile mit „${text}"`);
  const knopf = treffer.querySelector<HTMLInputElement>("input[type='radio']");
  if (!knopf) throw new Error(`Auswahlzeile „${text}" ohne Radio`);
  return knopf;
}

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
    await mount(<AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={EIN_ORT}
        einheit="Stk."
      />);

    await bestaetigungOeffnen();

    expect(existsPortal(".ant-popconfirm")).toBe(true);
    expect(existsPortal(".ant-modal")).toBe(false);
    expect(mocks.aussondern).not.toHaveBeenCalled();
  });

  it("bucht mit einem Kommentar, der die Charge nennt", async () => {
    await mount(<AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={EIN_ORT}
        einheit="Stk."
      />);
    await bestaetigungOeffnen();

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    expect(mocks.aussondern).toHaveBeenCalledWith({
      chargeId: "c1",
      // ⚠️ MIT ORT, obwohl es nur einen gibt (Codex-Befund zu PR #173, P1) —
      // die Begruendung steht bei `gemeinterOrt` in der Insel.
      lagerortId: HANDLAGER_ID,
      kommentar: "Verfallskontrolle — L42 · Kompressen ausgesondert",
    });
  });

  it("der Knopf traegt ein aria-label mit der Charge", async () => {
    await mount(<AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={EIN_ORT}
        einheit="Stk."
      />);

    expect(query("button").getAttribute("aria-label")).toBe(
      "L42 · Kompressen aussondern",
    );
  });

  it("zeigt einen fachlichen Actionfehler als Warnung und laesst die Aktion stehen", async () => {
    mocks.aussondern.mockResolvedValueOnce({
      ok: false,
      fehler: "Charge hat keinen Restbestand im Handlager.",
    });
    await mount(<AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={EIN_ORT}
        einheit="Stk."
      />);
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
    await mount(<AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={EIN_ORT}
        einheit="Stk."
      />);
    await bestaetigungOeffnen();

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => exists(".ant-alert-warning"), "feste Laufzeitwarnung");

    const text = query(".ant-alert-warning").textContent ?? "";
    expect(text).toContain("Charge konnte nicht ausgesondert werden.");
    expect(text).not.toContain("SQLITE intern und geheim");
  });
});

/**
 * DRK-339 — DIE ORTSWAHL. Sie erscheint NUR bei mehr als einem Liegeplatz;
 * eine Auswahl mit einer Zeile ist ein Klick ohne Entscheidung.
 *
 * ⚠️ GEPRUEFT WIRD, WAS ANKOMMT, NICHT NUR, WAS ZU SEHEN IST. Die Mutation,
 * die hier faellt: das Feld `lagerortId` gar nicht erst mitschicken. Die
 * Oberflaeche saehe unveraendert aus — die Wahl liesse sich treffen, der
 * Knopf buchte, und ausgesondert waere trotzdem alles.
 */
describe("AussondernRow — Ortswahl (DRK-339)", () => {
  it("bietet bei EINEM Liegeplatz keine Wahl an und nennt den Ort im Text", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={EIN_ORT}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    expect(existsPortal(".ant-radio-group")).toBe(false);
    expect(queryPortal(".ant-popconfirm").textContent).toContain(
      "aus Nicht zugeordnet als Aussonderung aus (5 Stk.)",
    );
  });

  it("bietet bei ZWEI Liegeplaetzen je eine Zeile plus „Alles“ an", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={ZWEI_ORTE}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    const zeilen = [...document.body.querySelectorAll(".ant-radio-wrapper")]
      .map((w) => w.textContent);
    expect(zeilen).toEqual([
      "Alles (10 Stk.)",
      "nur Nicht zugeordnet (4 Stk.)",
      "nur GF-Schrank (6 Stk.)",
    ]);
  });

  /**
   * DER EINZIGE LIEGEPLATZ WIRD GENANNT, NICHT WEGGELASSEN (Codex-Befund zu
   * PR #173, P1).
   *
   * ⚠️ „Kein Feld" heisst serverseitig „ALLE Orte des Bereichs". Beim Rendern
   * ist das dasselbe wie „dieser eine" — beim Bestaetigen nicht mehr: legt
   * eine andere Sitzung in der Zwischenzeit Bestand derselben Charge in einen
   * zweiten Schrank, raeumte die Aktion beide, waehrend der Text davor einen
   * versprach. Die Mutation, die das faengt, ist genau die weggelassene
   * Zeile — und sie waere still, weil die Oberflaeche unveraendert aussaehe.
   */
  it("schickt auch bei EINEM Liegeplatz dessen Ort mit", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={[{ id: "schrank-1", name: "Schrank 1", menge: 5, zugangshinweis: null }]}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    // Ohne Auswahl — es gibt nichts zu waehlen, und trotzdem steht der Ort im
    // Aufruf.
    expect(existsPortal(".ant-radio-group")).toBe(false);

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    expect(mocks.aussondern.mock.calls[0]?.[0]).toMatchObject({ lagerortId: "schrank-1" });
  });

  /**
   * DIE ZEILEN STEHEN UNTEREINANDER (Codex-Befund zu PR #173).
   *
   * ⚠️ antds Vorgabe ist WAAGERECHT. „nur GF-Schrank (6 Stk.)" neben zwei
   * Geschwistern bricht in einem Popconfirm auf dem Telefon mitten im Namen um
   * — und ein Ortsname, der auf zwei Zeilen zerfaellt, ist genau die Angabe,
   * an der hier die Buchung haengt.
   *
   * ⚠️ DIE TREFFERFLAECHE SELBST KANN DIESER TEST NICHT PRUEFEN: jsdom rechnet
   * keine Layoutboxen (CLAUDE.md, Fallen 13/16), `getBoundingClientRect()`
   * liefert ueberall Nullen. Die 44px misst `e2e/lagerbuch-verfall-ortswahl`
   * in einem echten Browser; hier steht nur, dass die Klasse ueberhaupt am
   * Kasten haengt, der sie traegt.
   */
  it("stellt die Ortszeilen untereinander und traegt die Trefferflaechen-Klasse", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={ZWEI_ORTE}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    expect(existsPortal(".ant-radio-group-vertical")).toBe(true);
    const kasten = queryPortal(".ant-radio-group").parentElement;
    expect(kasten?.className).toBeTruthy();
  });

  it("schickt per Vorgabe KEINEN Ort — „alles raus“ bleibt das Verhalten", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={ZWEI_ORTE}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    /**
     * ⚠️ `not.toHaveProperty`, NICHT `lagerortId: undefined`. Das Schema liest
     * das Feld als `nullish` — ein mitgeschicktes `undefined` waere fachlich
     * dasselbe, aber die Zusage lautet: ohne Wahl gibt es das Feld nicht.
     */
    expect(mocks.aussondern.mock.calls[0]?.[0]).not.toHaveProperty("lagerortId");
  });

  /**
   * EIN SCHRANK NAMENS `alle` WIRD NICHT ZU „ALLES" (Codex-Befund zu PR #173).
   *
   * ⚠️ DER NAME IST UNWAHRSCHEINLICH, DER FEHLER WAERE ES NICHT: IDs des
   * importierten Altbestands sind BELIEBIGE Zeichenketten (`entnahmeZiel.ts`
   * fuehrt sein `fz:`-Praefix aus genau diesem Grund). Ohne eigenen
   * Wertebereich bekaeme die Aktion bei dieser Wahl KEIN `lagerortId` und
   * raeumte jeden Ort leer — statt den einen, den jemand angeklickt hat.
   */
  it("verwechselt einen Schrank mit der Kennung „alle“ nicht mit „Alles“", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={[
          { id: HANDLAGER_ID, name: "Nicht zugeordnet", menge: 4, zugangshinweis: null },
          { id: "alle", name: "Altbestand-Schrank", menge: 6, zugangshinweis: null },
        ]}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    await clickElement(radioMitText("nur Altbestand-Schrank"));
    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    expect(mocks.aussondern.mock.calls[0]?.[0]).toMatchObject({ lagerortId: "alle" });
  });

  /**
   * EINE WAHL, DIE ES NICHT MEHR GIBT, FAELLT SICHTBAR AUF „ALLES" ZURUECK
   * (Codex-Befund zu PR #173).
   *
   * ⚠️ DER FALL BRAUCHT DREI ORTE. Bei zweien schrumpft die Liste nach einer
   * Buchung auf einen, und dann gewinnt ohnehin der einzelne Liegeplatz. Bei
   * dreien bleibt die Auswahl stehen — mit einem gemerkten Ort, den niemand
   * mehr sieht: KEINE Zeile waere angekreuzt, und ein Bestaetigen schickte den
   * verschwundenen Ort.
   */
  it("gleicht eine verschwundene Wahl ab, statt sie stehen zu lassen", async () => {
    const DREI: VerfallOrt[] = [
      { id: "s-a", name: "Schrank A", menge: 2, zugangshinweis: null },
      { id: "s-b", name: "Schrank B", menge: 3, zugangshinweis: null },
      { id: "s-c", name: "Schrank C", menge: 4, zugangshinweis: null },
    ];
    await mount(
      <AussondernRow chargeId="c1" bezeichnung="L42" orte={DREI} einheit="Stk." />,
    );
    await bestaetigungOeffnen();
    await clickElement(radioMitText("nur Schrank B"));

    // Schrank B ist gebucht, die Zeile rendert mit den beiden uebrigen neu.
    await rerender(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42"
        orte={DREI.filter((o) => o.id !== "s-b")}
        einheit="Stk."
      />,
    );
    await warte();

    // „Alles" ist angekreuzt — und nicht etwa gar nichts.
    expect(radioMitText("Alles").checked).toBe(true);

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    // Gebucht wird, was angekreuzt IST — nicht der verschwundene Schrank B.
    expect(mocks.aussondern.mock.calls[0]?.[0]).not.toHaveProperty("lagerortId");
  });

  /**
   * DER BESTAETIGUNGSTEXT NENNT, WAS GEBUCHT WIRD (Codex-Befund zu PR #173).
   *
   * ⚠️ EINE ZERSTOERENDE BESTAETIGUNG DARF NICHT ZWEI REICHWEITEN ZEIGEN.
   * Vorher hing der Satz an der ZAHL der Liegeplaetze statt an der Wahl: wer
   * bei zweien einen Schrank ankreuzte, las weiter „Bucht den Handlager-Rest
   * … aus", waehrend daneben genau ein Schrank angekreuzt war — und auch nur
   * der gebucht wurde.
   */
  it("nennt nach der Wahl den gewaehlten Schrank, nicht den Handlager-Rest", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={ZWEI_ORTE}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    // Vor der Wahl steht „Alles" an — und der Text sagt genau das, mit Summe.
    expect(queryPortal(".ant-popconfirm").textContent)
      .toContain("Bucht den Handlager-Rest von L42 · Kompressen als Aussonderung aus (10 Stk.).");

    await clickElement(radioMitText("nur GF-Schrank"));
    await warte();

    const text = queryPortal(".ant-popconfirm").textContent ?? "";
    expect(text).toContain("aus GF-Schrank als Aussonderung aus (6 Stk.).");
    expect(text).not.toContain("Handlager-Rest");
  });

  /**
   * EIN ORT, DER WIEDERKOMMT, BELEBT DIE ALTE WAHL NICHT (Codex-Befund zu
   * PR #173, zweite Runde).
   *
   * ⚠️ DAS IST DER UNTERSCHIED ZWISCHEN VERGESSEN UND UEBERLAGERN. Ein bloss
   * ueberlagerter Zustand waere wieder gueltig, sobald der Ort zurueckkommt —
   * die Auswahl spraenge von „Alles" auf den alten Schrank, und die naechste
   * Bestaetigung traefe FRISCH EINGERAEUMTES Material, das niemand gewaehlt
   * hat. Der Weg dorthin ist offen: eine andere Sitzung fuellt den Schrank
   * nach, irgendeine Aktion laedt die Seite neu, und diese Zeile steht noch.
   */
  it("belebt eine zurueckgekehrte Wahl NICHT wieder", async () => {
    const DREI: VerfallOrt[] = [
      { id: "s-a", name: "Schrank A", menge: 2, zugangshinweis: null },
      { id: "s-b", name: "Schrank B", menge: 3, zugangshinweis: null },
      { id: "s-c", name: "Schrank C", menge: 4, zugangshinweis: null },
    ];
    const zeile = (orte: VerfallOrt[]) => (
      <AussondernRow chargeId="c1" bezeichnung="L42" orte={orte} einheit="Stk." />
    );

    await mount(zeile(DREI));
    await bestaetigungOeffnen();
    await clickElement(radioMitText("nur Schrank B"));

    // Schrank B wird geraeumt — die Zeile steht mit den beiden uebrigen.
    await rerender(zeile(DREI.filter((o) => o.id !== "s-b")));
    await warte();
    expect(radioMitText("Alles").checked).toBe(true);

    // Eine andere Sitzung raeumt Schrank B wieder ein.
    await rerender(zeile(DREI));
    await warte();

    // „Alles" bleibt angekreuzt — die alte Wahl ist vergessen, nicht verdeckt.
    expect(radioMitText("Alles").checked).toBe(true);
    expect(radioMitText("nur Schrank B").checked).toBe(false);

    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    expect(mocks.aussondern.mock.calls[0]?.[0]).not.toHaveProperty("lagerortId");
  });

  it("schickt den gewaehlten Ort mit, und zwar OHNE Menge", async () => {
    await mount(
      <AussondernRow
        chargeId="c1"
        bezeichnung="L42 · Kompressen"
        orte={ZWEI_ORTE}
        einheit="Stk."
      />,
    );
    await bestaetigungOeffnen();

    await clickElement(radioMitText("nur GF-Schrank"));
    await clickPortal(".ant-popconfirm .ant-btn-primary");
    await warteAuf(() => mocks.aussondern.mock.calls.length === 1, "Aussonderungs-Action");

    expect(mocks.aussondern).toHaveBeenCalledWith({
      chargeId: "c1",
      lagerortId: "schrank-gf",
      kommentar: "Verfallskontrolle — L42 · Kompressen ausgesondert",
    });
    /**
     * ⚠️ KEINE MENGE UEBER DIE GRENZE. Die Zahl auf dem Schirm ist der Stand
     * beim Rendern; was am Ort liegt, rechnet die Transaktion. Eine
     * mitgeschickte Menge buchte gegen einen veralteten Stand — still.
     */
    expect(mocks.aussondern.mock.calls[0]?.[0]).not.toHaveProperty("menge");
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
        // DRK-309: NEUTRAL — die Tabelle darunter fuehrt beide Arten.
        "An Fahrzeugen und Taschen gemeldet",
      ]);
      /**
       * ⚠️ ZWEI `li`, NICHT DREI — und das ist seit DRK-298 die Aussage dieses
       * Tests: die Kartenliste traegt nur noch die HANDLAGER-Chargen. Die
       * Fahrzeugmeldungen darunter sind eine Tabelle geworden, weil dort nichts
       * zu buchen ist und stattdessen nach Fahrzeug gefiltert werden muss.
       * Begruendung im Kopf von `page.tsx`.
       */
      expect(queryAll("[role='list'] > [role='listitem']")).toHaveLength(2);
      expect(document.body.textContent).toContain("ALT-42");
      expect(document.body.textContent).toContain("WARN-42");
      expect(document.body.textContent).not.toContain("GRUEN-42");
      expect(document.body.textContent).toContain("RTW Warnend");
      expect(document.body.textContent).not.toContain("RTW Grün");
      expect(document.body.textContent).toContain("15.06.2026");
      /**
       * DRK-339 — DER LIEGEPLATZ STEHT IN DER ZEILE. Beide Chargen liegen in
       * der Wurzel, also „in keinem Schrank"; der Stammname „Handlager" waere
       * auf einer Karte namens „Chargen im Handlager" keine Auskunft.
       */
      expect(document.body.textContent).toContain("Nicht zugeordnet: 2 Pkg");
      expect(document.body.textContent).toContain("Nicht zugeordnet: 3 Pkg");
      expect(queryAll("button[aria-label$='aussondern']")).toHaveLength(1);
      /**
       * ⚠️ DER AUSSONDERN-KNOPF HAENGT AN DER HANDLAGER-HAELFTE UND NUR DORT.
       * `aussondern` bucht ausschliesslich den Handlager-Rest; ein Knopf an
       * einer Fahrzeugmeldung schluege reproduzierbar fehl
       * (`lesepfade/verfall.ts`). Genau EINER — an der abgelaufenen Charge.
       */
      expect(query<HTMLAnchorElement>("a[href='/verwaltung/fahrzeuge/rtw-warn']").textContent)
        .toContain("RTW Warnend");
    } finally {
      testDb.schliessen();
    }
  });

  /**
   * DIE SERVER COMPONENT RENDERT SELBST KEINE TABELLE — und das ist der Punkt,
   * den kein anderes Tor sieht.
   *
   * `<Table>` ist bei antd selbst eine Client-Komponente. Ein `columns[].render`,
   * das in einer Server Component entstuende, ist eine gewoehnliche Funktion,
   * und React lehnt es ab, sie ueber die RSC-Grenze zu reichen: HTTP 500 fuer
   * die ganze Seite. `typecheck` und `build` bleiben gruen, und ein `mount()`
   * in jsdom ist ein einziger JS-Prozess OHNE RSC-Grenze — der Test darueber
   * kann es also strukturell nicht sehen (Falle 9, `CLAUDE.md`). Bleibt der
   * Quelltext-Scan.
   *
   * ⚠️ SEIT DRK-298 STEHT AUF DIESER SEITE EINE TABELLE — in einer eigenen
   * Client-Insel. Der Scan prueft deshalb BEIDE Haelften des Vertrags: die
   * Server Component darf `<Table` und `List.Item` (Falle 1) weiterhin nicht
   * enthalten, und die Insel, an die sie es abgibt, MUSS die Direktive tragen.
   * Ohne die zweite Haelfte waere der Scan ab jetzt gruen zu bekommen, indem
   * man die Direktive vergisst — und genau das ist der Fehler, den er fangen
   * soll.
   */
  it("gibt die Tabelle an eine Client-Insel ab, statt sie selbst zu rendern", () => {
    const ordner = "src/app/m/lagerbuch/verwaltung/(arbeit)/verfall";
    const quelle = readFileSync(join(process.cwd(), ordner, "page.tsx"), "utf8");
    expect(dynamic).toBe("force-dynamic");
    // Die Handlager-Haelfte bleibt die Kartenliste, die sie ist.
    expect(quelle).toContain("<ul");
    expect(quelle).not.toContain("<Table");
    expect(quelle).not.toContain("List.Item");
    expect(quelle).toContain("lagerortVerfallListe(db, { nurWarnend: true }, jetzt)");

    const insel = readFileSync(
      join(process.cwd(), ordner, "FahrzeugVerfallTabelle.tsx"),
      "utf8",
    );
    expect(insel.startsWith('"use client";')).toBe(true);
  });
});
