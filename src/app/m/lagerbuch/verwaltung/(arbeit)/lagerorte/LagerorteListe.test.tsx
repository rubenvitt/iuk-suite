// @vitest-environment jsdom

import { act, isValidElement, type ReactElement, type ReactNode } from "react";
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
  mount,
  query,
  queryAll,
  queryPortal,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { buchungen, chargen, artikel, lagerorte } from "../../../_db/schema";
import { migrierteTestDb } from "../../../_db/testdb";
import { LagerorteListe, type LagerortZeile } from "./LagerorteListe";

const mocks = vi.hoisted(() => ({
  createSchrank: vi.fn(),
  updateSchrank: vi.fn(),
  setSchrankAktiv: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("../../../_actions/lagerorte", () => ({
  createSchrank: (...args: unknown[]) => mocks.createSchrank(...args),
  updateSchrank: (...args: unknown[]) => mocks.updateSchrank(...args),
  setSchrankAktiv: (...args: unknown[]) => mocks.setSchrankAktiv(...args),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

/**
 * ⚠️ `schrank-alt` TRAEGT ABSICHTLICH BESTAND (`bestandsposten: 3`), OBWOHL ER
 * STILLGELEGT IST. Genau diese Kombination — `aktiv: false` UND
 * `bestandsposten > 0` — ist laut Plan der NORMALFALL beim Umraeumen und der
 * Grund, warum Stilllegen keinen Bestand wegnimmt (`_actions/lagerorte.ts`).
 * Eine Fixture mit `bestandsposten: 0` liesse die Renderlogik ungeprueft: sie
 * ist unbedingt (die Postenspalte blendet fuer inaktive Zeilen nichts aus),
 * aber „vermutlich richtig" ist kein Test. Wer diese beiden Felder je fuer
 * sich testet, kann trotzdem eine Umsetzung durchwinken, die die Postenspalte
 * bei `!aktiv` unterdrueckt — und genau das nimmt jemandem beim Umraeumen die
 * Information, dass dort noch etwas liegt.
 */
const ZEILEN: LagerortZeile[] = [
  { id: "schrank-1", name: "Schrank 1", zugangshinweis: null, sortierung: 10, aktiv: true, bestandsposten: 4 },
  { id: "schrank-gf", name: "GF-Schrank", zugangshinweis: "Zugang über LvD — anrufen", sortierung: 90, aktiv: true, bestandsposten: 2 },
  { id: "schrank-alt", name: "Altschrank", zugangshinweis: null, sortierung: 50, aktiv: false, bestandsposten: 3 },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createSchrank.mockResolvedValue({ ok: true, wert: { id: "schrank-neu" } });
  mocks.updateSchrank.mockResolvedValue({ ok: true });
  mocks.setSchrankAktiv.mockResolvedValue({ ok: true });
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
  for (let versuch = 0; versuch < 30; versuch += 1) {
    if (pruefen()) return;
    await warte();
  }
  throw new Error(`Nicht rechtzeitig sichtbar: ${beschreibung}`);
}

function knopfMitText(text: string): HTMLButtonElement {
  const treffer = Array.from(document.querySelectorAll<HTMLButtonElement>("button"))
    .find((button) => (button.textContent ?? "").includes(text));
  if (!treffer) throw new Error(`Knopf nicht gefunden: ${text}`);
  return treffer;
}

async function modalOeffnen(auslöser: string, titel: string): Promise<void> {
  await clickElement(knopfMitText(auslöser));
  await warteAuf(
    () => (document.body.querySelector("[role='dialog']")?.textContent ?? "").includes(titel),
    `Modal „${titel}"`,
  );
}

async function portalFuellen(ariaLabel: string, wert: string): Promise<void> {
  const input = queryPortal<HTMLInputElement>(`.ant-modal input[aria-label='${ariaLabel}']`);
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(input), "value")?.set;
  if (!setter) throw new Error(`Kein value-Setter für ${ariaLabel}`);
  await act(async () => {
    setter.call(input, wert);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
}

async function portalAbsenden(): Promise<void> {
  const form = queryPortal<HTMLFormElement>(".ant-modal form");
  await act(async () => {
    form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await warte();
}

function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  return [
    ...treffer,
    ...elementeVomTyp((wert.props as { children?: ReactNode }).children, typ),
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

describe("LagerorteListe", () => {
  /**
   * ⚠️ ANGEPASST AN DAS ECHTE HARNESS: `mount()` aus `test-dom.tsx` ist
   * asynchron und liefert keinen `{ container }` zurueck (anders als im
   * Auftragstext skizziert) — gegriffen wird ueber die modul-eigenen
   * `query`/`queryAll`, wie es jede andere Testdatei dieses Moduls tut
   * (Vorbild `FahrzeugeListe.test.tsx`). „Kein zweites Harness erfinden"
   * heisst hier: das VORHANDENE benutzen, nicht eines nachbauen, das zur
   * Skizze passt.
   */
  it("zeigt jeden Schrank in der gepflegten Reihenfolge", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const namen = queryAll("[data-row-key]").map((tr) => tr.getAttribute("data-row-key"));
    expect(namen).toEqual(["schrank-1", "schrank-alt", "schrank-gf"]);
  });

  it("zeigt den Zugangshinweis im Klartext, nicht nur als Zeichen", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    expect(document.body.textContent).toContain("Zugang über LvD — anrufen");
  });

  /**
   * ⚠️ DIE INTERESSANTE KOMBINATION: `aktiv: false` UND `bestandsposten > 0`
   * ZUSAMMEN, nicht je einzeln. Stilllegen nimmt keinen Bestand weg — ein
   * stillgelegter Schrank MIT Bestand ist deshalb der Normalfall beim
   * Umraeumen, und die Seite muss beides gleichzeitig zeigen: die
   * Kennzeichnung „Stillgelegt" UND die Postenzahl. Ein Test, der nur die
   * Kennzeichnung oder nur die Zahl prueft, liesse eine Umsetzung durchgehen,
   * die die Postenspalte fuer inaktive Zeilen ausblendet — und naehme damit
   * genau die Information weg, die beim Umraeumen zaehlt.
   */
  it("kennzeichnet stillgelegte Schraenke UND zeigt ihre Postenzahl", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const zeile = query('[data-row-key="schrank-alt"]').textContent;
    expect(zeile).toContain("Stillgelegt");
    expect(zeile).toContain("3");
  });

  it("zeigt einen gedämpften Strich statt eines leeren Hinweises", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    expect(query('[data-row-key="schrank-1"]').textContent).toContain("—");
  });

  it("zeigt die Postenzahl je Schrank", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    expect(query('[data-row-key="schrank-1"]').textContent).toContain("4");
    expect(query('[data-row-key="schrank-gf"]').textContent).toContain("2");
  });

  it("trägt je Zeile Bearbeiten- und Statusknopf", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const aktive = query('[data-row-key="schrank-1"]');
    expect(aktive.textContent).toContain("Bearbeiten");
    expect(aktive.textContent).toContain("Stilllegen");

    const inaktive = query('[data-row-key="schrank-alt"]');
    expect(inaktive.textContent).toContain("Wieder aufnehmen");
  });
});

describe("Neuer Schrank", () => {
  it("legt einen Schrank mit den eingegebenen Werten an und schließt nur bei Erfolg", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    await modalOeffnen("Neuer Schrank", "Neuer Schrank");
    await portalFuellen("Name", "Schrank 3");
    await portalFuellen("Zugangshinweis", "Flur");
    await portalAbsenden();

    expect(mocks.createSchrank).toHaveBeenCalledWith(expect.objectContaining({
      name: "Schrank 3",
      zugangshinweis: "Flur",
    }));
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") === null,
      "geschlossenes Schrank-Modal",
    );
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("bleibt bei einem Fehler offen und zeigt ihn an", async () => {
    mocks.createSchrank.mockResolvedValueOnce({ ok: false, fehler: "Schrank konnte nicht angelegt werden." });
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    await modalOeffnen("Neuer Schrank", "Neuer Schrank");
    await portalFuellen("Name", "Schrank 3");
    await portalAbsenden();

    await warteAuf(
      () => document.body.querySelector(".ant-modal .ant-alert-warning") !== null,
      "Fehlermeldung im Schrank-Modal",
    );
    expect(mocks.refresh).not.toHaveBeenCalled();
  });

  /**
   * DRK-367 — der abgelehnte Name landet AM FELD, nicht nur in der Meldung
   * daneben. Das Formular hat drei Felder; eine Meldung ohne Markierung liesse
   * die verwaltende Person raten, welches gemeint ist.
   */
  it("zeigt einen bereits vergebenen Namen am Namensfeld", async () => {
    mocks.createSchrank.mockResolvedValueOnce({
      ok: false,
      fehler: "Dieser Name ist bereits vergeben.",
      feldFehler: { name: "Dieser Name ist bereits vergeben." },
    });
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    await modalOeffnen("Neuer Schrank", "Neuer Schrank");
    await portalFuellen("Name", "Schrank 1");
    await portalAbsenden();

    await warteAuf(
      () => document.body.querySelector(
        "[data-rolle='neuer-schrank'] .ant-form-item-explain-error",
      ) !== null,
      "Feldfehler am Namensfeld",
    );
    expect(
      queryPortal("[data-rolle='neuer-schrank'] .ant-form-item-explain-error").textContent,
    ).toBe("Dieser Name ist bereits vergeben.");
    expect(document.body.querySelector("[role='dialog']")).not.toBeNull();
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("Schrank bearbeiten", () => {
  it("öffnet mit den bestehenden Werten und speichert die Änderung", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const zeile = query('[data-row-key="schrank-gf"]');
    await clickElement(
      Array.from(zeile.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => (b.textContent ?? "").includes("Bearbeiten"))!,
    );
    await warteAuf(
      () => document.body.querySelector("[role='dialog']") !== null,
      "Bearbeiten-Modal",
    );
    expect(queryPortal<HTMLInputElement>(".ant-modal input[aria-label='Name']").value)
      .toBe("GF-Schrank");

    await portalFuellen("Name", "GF-Schrank (neu)");
    await portalAbsenden();

    expect(mocks.updateSchrank).toHaveBeenCalledWith(expect.objectContaining({
      id: "schrank-gf",
      name: "GF-Schrank (neu)",
    }));
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });
});

describe("Schrank stilllegen / wieder aufnehmen", () => {
  it("legt einen aktiven Schrank still", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const zeile = query('[data-row-key="schrank-1"]');
    await clickElement(
      Array.from(zeile.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => (b.textContent ?? "").includes("Stilllegen"))!,
    );
    await warte();

    expect(mocks.setSchrankAktiv).toHaveBeenCalledWith({ id: "schrank-1", aktiv: false });
    expect(mocks.refresh).toHaveBeenCalledOnce();
  });

  it("nimmt einen stillgelegten Schrank wieder auf", async () => {
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const zeile = query('[data-row-key="schrank-alt"]');
    await clickElement(
      Array.from(zeile.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => (b.textContent ?? "").includes("Wieder aufnehmen"))!,
    );
    await warte();

    expect(mocks.setSchrankAktiv).toHaveBeenCalledWith({ id: "schrank-alt", aktiv: true });
  });

  /**
   * PR-BEFUND: `statusUmschalten` verwarf `{ ok: false }` bisher stillschweigend
   * und rief `router.refresh()` unbedingt auf — die Zeile laed unveraenderte
   * Daten neu, ohne dass die verwaltende Person je erfaehrt, dass ihr
   * Statuswechsel nicht stattfand. Die Meldung steht ABSICHTLICH IN DER ZEILE
   * (nicht in einem Dialog, den es fuer den Statusknopf nicht gibt) — direkt
   * unter dem Knopf, den die Person gerade gedrueckt hat.
   */
  it("zeigt bei einem abgelehnten Umschalten eine Meldung IN DER ZEILE und behält den Status", async () => {
    mocks.setSchrankAktiv.mockResolvedValueOnce({
      ok: false,
      fehler: "Schrankstatus konnte nicht geändert werden.",
    });
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const zeile = query('[data-row-key="schrank-1"]');
    await clickElement(
      Array.from(zeile.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => (b.textContent ?? "").includes("Stilllegen"))!,
    );
    await warteAuf(
      () => zeile.querySelector(".ant-alert-warning") !== null,
      "Fehlermeldung an der Zeile",
    );

    expect(zeile.textContent).toContain("Schrankstatus konnte nicht geändert werden.");
    // ⚠️ DIE TRAGENDE ZUSICHERUNG: KEIN Reload auf einen abgelehnten
    // Statuswechsel. Ohne den Fix riefe `statusUmschalten` `router.refresh()`
    // unbedingt auf und quittierte den Fehlschlag damit als Erfolg — genau
    // das faengt diese Zeile, nicht die Beschriftung unten.
    expect(mocks.refresh).not.toHaveBeenCalled();
    // Der Knopf zeigt weiterhin "Stilllegen" — aber das allein ist KEIN
    // Regressionstest (Fallen 10-12: eine Zeile misst sonst etwas anderes,
    // als sie behauptet): die Beschriftung liest `zeile.aktiv` direkt aus der
    // Prop, die dieser Test nie aendert, und staende auch ohne den Fix hier.
    // Sie steht trotzdem, weil sie dokumentiert, was die Person NACH dem
    // Fehlschlag tatsaechlich sieht.
    expect(zeile.textContent).toContain("Stilllegen");
  });

  it("faengt eine abgelehnte Anfrage (try ohne catch war die Luecke) und zeigt eine Meldung", async () => {
    mocks.setSchrankAktiv.mockRejectedValueOnce(new Error("offline"));
    await mount(<LagerorteListe zeilen={ZEILEN} />);
    const zeile = query('[data-row-key="schrank-1"]');
    await clickElement(
      Array.from(zeile.querySelectorAll<HTMLButtonElement>("button"))
        .find((b) => (b.textContent ?? "").includes("Stilllegen"))!,
    );
    await warteAuf(
      () => zeile.querySelector(".ant-alert-warning") !== null,
      "Fehlermeldung an der Zeile nach abgelehnter Anfrage",
    );

    expect(zeile.textContent).toContain("Status konnte nicht geändert werden.");
    expect(mocks.refresh).not.toHaveBeenCalled();
  });
});

describe("Lagerorteseite als RSC", () => {
  it("zählt Posten über EINE Abfrage und reicht nur JSON-sichere Zeilen an die Insel", async () => {
    const { lagerorteSeitenInhalt } = await import("./page");
    const testDb = migrierteTestDb("lagerbuch-lagerorte-liste-");
    try {
      testDb.db.insert(lagerorte).values({
        id: "schrank-rsc",
        name: "RSC-Schrank",
        typ: "lager",
        parentId: "handlager",
        aktiv: true,
        zugangshinweis: null,
        sortierung: 5,
      }).run();
      testDb.db.insert(artikel).values({
        id: "artikel-rsc",
        name: "Mullbinde",
        einheit: "Stk.",
        fach: "A-01",
        mindestbestand: 0,
        aktiv: true,
        createdAt: new Date("2026-06-01T00:00:00Z"),
      }).run();
      testDb.db.insert(chargen).values([
        { id: "charge-1", artikelId: "artikel-rsc", chargenNr: "c1", verfall: "2099-12", createdAt: new Date("2026-06-01T00:00:00Z") },
        { id: "charge-2", artikelId: "artikel-rsc", chargenNr: "c2", verfall: "2099-12", createdAt: new Date("2026-06-01T00:00:00Z") },
      ]).run();
      // Zwei Chargen mit Rest > 0 an diesem Ort ⇒ zwei Posten; die dritte
      // Buchung verbraucht charge-2 vollstaendig und darf nicht mitzaehlen.
      testDb.db.insert(buchungen).values([
        { id: "b1", ts: new Date("2026-06-02T00:00:00Z"), typ: "zugang", artikelId: "artikel-rsc", chargeId: "charge-1", lagerortId: "schrank-rsc", menge: 10, quelleTyp: "system", quelleId: "test", referenz: null, kommentar: null },
        { id: "b2", ts: new Date("2026-06-02T00:00:00Z"), typ: "zugang", artikelId: "artikel-rsc", chargeId: "charge-2", lagerortId: "schrank-rsc", menge: 5, quelleTyp: "system", quelleId: "test", referenz: null, kommentar: null },
        { id: "b3", ts: new Date("2026-06-03T00:00:00Z"), typ: "entnahme", artikelId: "artikel-rsc", chargeId: "charge-2", lagerortId: "schrank-rsc", menge: -5, quelleTyp: "system", quelleId: "test", referenz: null, kommentar: null },
      ]).run();

      const inhalt = lagerorteSeitenInhalt(testDb.db);
      const [liste] = elementeVomTyp(inhalt, LagerorteListe);
      const props = liste.props as { zeilen: LagerortZeile[] };
      expect(props.zeilen).toEqual([expect.objectContaining({
        id: "schrank-rsc",
        name: "RSC-Schrank",
        bestandsposten: 1,
      })]);
      expect(istRekursivJsonSicher(props)).toBe(true);
    } finally {
      testDb.schliessen();
    }
  });
});
