// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { TaskDTO } from "../../_lib/typen";

/*
 * DRK-333 — DER RANG HÄNGT AN DER ZEILE, NICHT AM ANZEIGE-INDEX.
 *
 * ⚠️ DIESE DATEI MISST EINE KOPPLUNG, KEINE ANZEIGE. Bis DRK-333 las
 * `verschieben` den dritten `render`-Parameter von antd — den Index der
 * ANGEZEIGTEN Liste. Solange die Tabelle weder sortieren noch filtern konnte,
 * war das derselbe Index wie in `aufgaben`, und genau deshalb durfte sie beides
 * nicht. Sortiert jemand um, verschiebt ein index-gekoppelter Knopf die FALSCHE
 * Zeile und `aufgabenSortierenAction` schreibt das Ergebnis fest — ein
 * schreibender Vorgang auf dem falschen Datensatz, der sich als Erfolg meldet.
 *
 * ⛔ DER ERSTE FALL IST DER PRÜFLING: er sortiert ERST und drückt DANN. Hängt
 * `verschieben` wieder am Index, kommt eine andere Id-Liste an der Action an und
 * der Fall wird rot. Ein Fall, der ohne Umsortieren drückt, misst diese Kopplung
 * NICHT — er ist in beiden Fassungen grün.
 *
 * Der Modulersatz für die Action ist Pflicht: `_actions/katalog.ts` zieht sonst
 * `better-sqlite3`, `drizzle-orm` und `next/cache` in den jsdom-Lauf.
 */
const { sortierenMock, loeschenMock } = vi.hoisted(() => ({
  sortierenMock: vi.fn(),
  loeschenMock: vi.fn(),
}));
vi.mock("../../_actions/katalog", () => ({
  aufgabenSortierenAction: sortierenMock,
  // `AufgabeFormular` im Drawer importiert aus demselben Modul; ohne die drei
  // waeren sie hier `undefined` und der Drawer risse beim Oeffnen.
  aufgabeLoeschenAction: loeschenMock,
  aufgabeAendernAction: vi.fn(),
  aufgabeAnlegenAction: vi.fn(),
}));

const { KatalogTabelle } = await import("./KatalogTabelle");

function aufgabe(id: string, over: Partial<TaskDTO> = {}): TaskDTO {
  return {
    id,
    teil: 1,
    nummer: id,
    titel: `Titel ${id}`,
    lernziel: "",
    schritte: [],
    durchfuehrungshinweise: [],
    sicherheitshinweise: [],
    zielanzahlDefault: 1,
    sortOrder: 0,
    aktiv: true,
    bildUrl: null,
    ...over,
  };
}

/**
 * DREI AUFGABEN, DEREN SPEICHERREIHENFOLGE UND TITELORDNUNG AUSEINANDERLAUFEN.
 * Gespeichert: a1 · a2 · a3. Nach „Titel" aufsteigend: a2 („Anton") · a3
 * („Mitte") · a1 („Zebra"). Ohne diesen Versatz prüfte der Test nur, DASS eine
 * Liste ankommt, nicht WELCHE.
 */
const ZEILEN: TaskDTO[] = [
  aufgabe("a1", { nummer: "1.1", titel: "Zebra" }),
  aufgabe("a2", { nummer: "1.2", titel: "Anton", teil: 2 }),
  aufgabe("a3", { nummer: "1.3", titel: "Mitte" }),
];

beforeEach(() => {
  sortierenMock.mockReset();
  loeschenMock.mockReset();
  sortierenMock.mockResolvedValue(undefined);
  loeschenMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

function spaltenkopf(beschriftung: string): HTMLElement {
  const th = queryAll("thead th").find((t) => (t.textContent ?? "").includes(beschriftung));
  if (!th) throw new Error(`Kein Spaltenkopf „${beschriftung}“`);
  return th;
}

const zeilenSchluessel = () =>
  queryAll("tbody tr[data-row-key]").map((r) => r.getAttribute("data-row-key"));

const plaetze = () =>
  queryAll("[data-rolle='uav-katalog-platz']").map((s) => s.textContent);

async function filterOeffnen(beschriftung: string): Promise<void> {
  const ausloeser = spaltenkopf(beschriftung).querySelector<HTMLElement>(
    ".ant-table-filter-trigger",
  );
  if (!ausloeser) throw new Error(`Spalte „${beschriftung}“ hat keinen Filter`);
  await clickElement(ausloeser);
}

/**
 * ⚠️ NUR IM OFFENEN MENUE SUCHEN. antd laesst das Menue einer zuvor bedienten Spalte
 * als `.ant-dropdown-hidden` im Portal stehen; ein Greifer ueber `document.body` trifft
 * dann deren „OK" und setzt den ersten Filter zurueck (gemessen an `InventurForm`).
 */
async function filterWaehlen(eintrag: string): Promise<void> {
  const menue = [
    ...document.body.querySelectorAll<HTMLElement>(".ant-table-filter-dropdown"),
  ].find((element) => !element.closest(".ant-dropdown-hidden"));
  if (!menue) throw new Error("Kein offenes Filtermenue");
  const punkt = [...menue.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item")].find(
    (i) => i.textContent === eintrag,
  );
  if (!punkt) throw new Error(`Kein Filtereintrag „${eintrag}“`);
  await clickElement(punkt);
  const ok = [
    ...menue.querySelectorAll<HTMLElement>(".ant-table-filter-dropdown-btns button"),
  ].find((b) => b.textContent === "OK");
  if (!ok) throw new Error("Kein OK im Filtermenue");
  await clickElement(ok);
}

describe("KatalogTabelle — Reihenfolge nach dem Umsortieren", () => {
  it("verschiebt nach dem Sortieren die Zeile, auf der der Knopf steht — nicht die an ihrer Anzeigeposition", async () => {
    await mount(<KatalogTabelle aufgaben={ZEILEN} />);
    expect(zeilenSchluessel()).toEqual(["a1", "a2", "a3"]);

    await clickElement(spaltenkopf("Titel"));
    expect(zeilenSchluessel(), "erst umsortieren, sonst misst der Fall nichts")
      .toEqual(["a2", "a3", "a1"]);

    // „1.3" steht jetzt an ZWEITER Anzeigeposition, gespeichert aber an dritter.
    await clickElement(query("button[aria-label='1.3 nach oben']"));

    expect(sortierenMock).toHaveBeenCalledTimes(1);
    /*
     * Gespeichert war a1 · a2 · a3; a3 rückt einen Platz vor → a1 · a3 · a2.
     * ⚠️ Der index-gekoppelte Stand schickte hier ["a2", "a1", "a3"]: er las die
     * Anzeigeposition 1 und tauschte damit a2 gegen a1.
     */
    expect(sortierenMock.mock.calls[0]![0]).toEqual(["a1", "a3", "a2"]);
  });

  it("nimmt die Ränder aus der gespeicherten Reihenfolge, nicht aus der Anzeige", async () => {
    await mount(<KatalogTabelle aufgaben={ZEILEN} />);
    await clickElement(spaltenkopf("Titel"));

    /*
     * Oben auf dem Schirm steht a2 — gespeichert ist es die MITTE, „nach oben"
     * muss also gehen. Gesperrt gehört der gespeicherte Rand: a1 („1.1"), das
     * nach dem Sortieren ganz unten steht.
     */
    expect(query<HTMLButtonElement>("button[aria-label='1.2 nach oben']").disabled).toBe(false);
    expect(query<HTMLButtonElement>("button[aria-label='1.1 nach oben']").disabled).toBe(true);
    expect(query<HTMLButtonElement>("button[aria-label='1.3 nach unten']").disabled).toBe(true);
    expect(query<HTMLButtonElement>("button[aria-label='1.1 nach unten']").disabled).toBe(false);
  });

  it("zeigt den gespeicherten Platz als Ziffer, damit der Knopf auch bei fremder Sortierung sichtbar wirkt", async () => {
    await mount(<KatalogTabelle aufgaben={ZEILEN} />);
    expect(plaetze()).toEqual(["1", "2", "3"]);

    await clickElement(spaltenkopf("Titel"));
    // Anzeige a2 · a3 · a1 — die Ziffern sind deren gespeicherte Plätze.
    expect(plaetze()).toEqual(["2", "3", "1"]);

    await clickElement(query("button[aria-label='1.3 nach oben']"));
    // a3 steht jetzt auf Platz 2, a2 rutscht auf 3. Die Zeile bleibt, wo sie ist.
    expect(zeilenSchluessel()).toEqual(["a2", "a3", "a1"]);
    expect(plaetze()).toEqual(["3", "2", "1"]);
  });
});

describe("KatalogTabelle — die Filter im Spaltenkopf", () => {
  it("filtert den Teil und verschiebt danach trotzdem in der gespeicherten Reihenfolge", async () => {
    await mount(<KatalogTabelle aufgaben={ZEILEN} />);

    await filterOeffnen("Teil");
    await filterWaehlen("Teil 2");
    expect(zeilenSchluessel()).toEqual(["a2"]);

    // a2 ist die einzige sichtbare Zeile — gespeichert steht es in der Mitte,
    // beide Knöpfe müssen offen sein und auf die Nachbarn greifen.
    await clickElement(query("button[aria-label='1.2 nach unten']"));
    expect(sortierenMock.mock.calls[0]![0]).toEqual(["a1", "a3", "a2"]);
  });

  /**
   * ⚠️ DER FALL, DEN EIN `filterAktiv`-ZUERST NICHT SIEHT (Codex-Fund am PR #153).
   * Der Filter bleibt stehen, wenn die letzte Aufgabe darunter GELÖSCHT wird —
   * `geloescht` leert `aufgaben`, ruehrt `spaltenFilter` aber nicht an. „Nichts
   * passt zum Filter" behauptete dann einen Bestand, den es nicht mehr gibt,
   * genau vor der Person, die jetzt die erste neue Aufgabe anlegen soll.
   */
  it("sagt „noch nichts angelegt“, wenn die letzte Aufgabe unter einem stehenden Filter gelöscht wird", async () => {
    await mount(<KatalogTabelle aufgaben={[ZEILEN[1]!]} />);
    await filterOeffnen("Teil");
    await filterWaehlen("Teil 2");
    expect(zeilenSchluessel()).toEqual(["a2"]);

    await clickElement(
      queryAll<HTMLElement>("button").find((k) => k.textContent === "Bearbeiten")!,
    );
    await clickElement(
      [...document.body.querySelectorAll<HTMLElement>("button")]
        .find((k) => k.textContent === "Löschen")!,
    );
    await clickElement(
      [...document.body.querySelectorAll<HTMLElement>(".ant-popconfirm button")]
        .find((k) => k.textContent === "Löschen")!,
    );

    expect(loeschenMock).toHaveBeenCalledWith("a2");
    expect(zeilenSchluessel()).toHaveLength(0);
    expect(document.body.textContent, "der Filter steht noch, der Katalog ist trotzdem leer")
      .toContain("Noch keine Aufgaben im Katalog.");
    expect(document.body.textContent).not.toContain("Keine Aufgabe passt zum Filter.");
  });

  it("unterscheidet „noch nichts angelegt“ von „nichts passt zum Filter“", async () => {
    await mount(<KatalogTabelle aufgaben={[]} />);
    expect(document.body.textContent).toContain("Noch keine Aufgaben im Katalog.");

    await unmount();
    await mount(<KatalogTabelle aufgaben={ZEILEN} />);
    await filterOeffnen("Aktiv");
    await filterWaehlen("inaktiv");
    expect(zeilenSchluessel()).toHaveLength(0);
    expect(document.body.textContent).toContain("Keine Aufgabe passt zum Filter.");
    expect(document.body.textContent).not.toContain("Noch keine Aufgaben im Katalog.");
  });
});
