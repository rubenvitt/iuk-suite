// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { clickElement, mount, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";
import type { PersonRow } from "../_db/schema";
import s from "./aufgaben.module.css";

/*
 * `personBeendenAction` WIRD ALS `vi.fn()` GEMOCKT (kein `useActionState` — dieselbe Form wie
 * `zurueckziehenAction`/`freigebenAction`, ein natives `<form action={fn}>`). Ohne den Mock zoege
 * der jsdom-Lauf `better-sqlite3` und `next/cache` ueber die echte `actions.ts` herein.
 */
const { beendenMock } = vi.hoisted(() => ({ beendenMock: vi.fn() }));
vi.mock("../actions", () => ({ personBeendenAction: beendenMock }));

import { PersonenTabelle, type PersonenZeile } from "./PersonenTabelle";

/**
 * DER RAHMEN UM DIE BREITE DARSTELLUNG (DRK-451).
 *
 * ⚠️ SEIT DIESE TABELLE EINE `Kartentabelle` IST, STEHT JEDE ZEILE ZWEIMAL IM
 * BAUM — einmal als Tabellenzeile, einmal als Karte. jsdom wertet die Media
 * Query nicht aus, dort sind also BEIDE „da". Ein Greifer ueber `button` oder
 * `a` findet damit jede Aktion doppelt, und die Meldung fuehrt in die Irre:
 * „erwartet 2, bekommen 4" liest sich wie eine doppelt gerenderte Zeile.
 *
 * ⚠️ DIE GREIFER AUF `tbody tr` BRAUCHEN IHN NICHT — eine Karte hat kein
 * `tbody`. Eingerahmt wird nur, was ueber Rolle oder Element greift.
 */
const BREIT = '[data-rolle="breitansicht"]';

/** Alle Elemente eines Typs, aber nur in der breiten Darstellung. */
function inBreit<T extends HTMLElement>(selektor: string): T[] {
  return queryAll<T>(`${BREIT} ${selektor}`);
}


function person(over: Partial<PersonRow> & Pick<PersonRow, "id" | "name">): PersonRow {
  return {
    sub: `dev:${over.id}@localtest.me`,
    initialen: over.name.slice(0, 2).toUpperCase(),
    rolle: "bufdi",
    sollMinutenTag: 468,
    aktivVon: "2026-01-01",
    aktivBis: null,
    erstelltAm: new Date(0),
    ...over,
  };
}

/** Den Bestaetigungsknopf EINES offenen Popconfirm im Portal finden (Vorbild `files`-Modul). */
function bestaetigung(beschriftung: string): HTMLElement {
  const knopf = Array.from(
    document.body.querySelectorAll<HTMLElement>(".ant-popconfirm .ant-btn"),
  ).find((k) => k.textContent === beschriftung);
  if (!knopf) throw new Error(`Kein Bestaetigungsknopf „${beschriftung}“ im Popconfirm`);
  return knopf;
}

function popconfirmText(): string {
  return document.body.querySelector(".ant-popconfirm")?.textContent ?? "";
}

beforeEach(() => {
  beendenMock.mockReset();
});
afterEach(async () => {
  await unmount();
});

describe("PersonenTabelle — Zeilenaktionen tragen die EIGENE person.id, nicht die einer anderen Zeile", () => {
  it("„Ändern“ zeigt je Zeile auf die eigene id", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p1", name: "Erste" }), istAktivHeute: true },
      { person: person({ id: "p2", name: "Zweite" }), istAktivHeute: true },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);
    const hrefs = inBreit<HTMLAnchorElement>("a")
      .filter((a) => a.textContent === "Ändern")
      .map((a) => a.getAttribute("href"));
    expect(hrefs).toEqual(["/personen?bearbeiten=p1", "/personen?bearbeiten=p2"]);
  });

  it("„Beenden“ erscheint nur fuer die AKTIVE Zeile, nicht fuer die ausgeschiedene", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p1", name: "Aktiv" }), istAktivHeute: true },
      { person: person({ id: "p2", name: "Ausgeschieden", aktivBis: "2020-01-01" }), istAktivHeute: false },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);
    const rows = queryAll("tbody tr[data-row-key]");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Beenden");
    expect(rows[1]!.textContent).not.toContain("Beenden");
    expect(rows[0]!.textContent).toContain("Aktiv");
    expect(rows[1]!.textContent).toContain("Ausgeschieden");
  });

  it("die Status-Spalte zeigt „Aktiv“ bzw. „Ausgeschieden“ je EIGENEM istAktivHeute", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p1", name: "Erste" }), istAktivHeute: true },
      { person: person({ id: "p2", name: "Zweite" }), istAktivHeute: false },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);
    const rows = queryAll("tbody tr[data-row-key]");
    expect(rows[0]!.querySelector(`.${s.chip}`)?.textContent).toBe("Aktiv");
    expect(rows[1]!.querySelector(`.${s.chip}`)?.textContent).toBe("Ausgeschieden");
  });
});

/**
 * FIX-RUNDE 1, MINOR 2: `/löschen|entfernen/i` statt exakter Gleichheit auf `"Löschen"`, und ZWEI
 * Zeilen (eine aktive, eine ausgeschiedene) statt einer — vorher haette eine spaeter ergaenzte
 * Aktion „Person löschen" oder „Entfernen" den Test unveraendert bestanden.
 */
describe("PersonenTabelle — es gibt keine Loeschen-Aktion", () => {
  it("kein Knopf/Link nennt Loeschen oder Entfernen, in keiner der beiden Zeilen", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p1", name: "Erste" }), istAktivHeute: true },
      { person: person({ id: "p2", name: "Zweite", aktivBis: "2020-01-01" }), istAktivHeute: false },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);
    const alleKnoepfeUndLinks = [...inBreit("button"), ...inBreit("a")];
    expect(alleKnoepfeUndLinks.some((el) => /löschen|entfernen/i.test(el.textContent ?? ""))).toBe(
      false,
    );
  });
});

describe("PersonenTabelle — Beenden ist bestaetigungspflichtig (Spec §9.9), mit ZWEI Zeilen", () => {
  it("fragt nach und nennt den Namen; schickt erst NACH der Bestaetigung ab, mit der EIGENEN personId", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p1", name: "Erste" }), istAktivHeute: true },
      { person: person({ id: "p2", name: "Zweite" }), istAktivHeute: true },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);

    const beendenKnoepfe = inBreit("button").filter((b) => b.textContent === "Beenden");
    expect(beendenKnoepfe).toHaveLength(2);
    await clickElement(beendenKnoepfe[1]!);

    expect(popconfirmText()).toContain("Zweite");
    expect(beendenMock).not.toHaveBeenCalled();

    await clickElement(bestaetigung("Beenden"));
    expect(beendenMock).toHaveBeenCalledTimes(1);
    const formData = beendenMock.mock.calls[0]![0] as FormData;
    expect(formData.get("personId")).toBe("p2");
  });
});

/*
 * SORTIERUNG UND FILTER LIEGEN IM SPALTENKOPF (`@/core/tabelle`).
 *
 * Geprueft werden die zwei Stellen, an denen eine falsche Umsetzung nicht auffiele:
 *
 * 1. DIE SOLL-ZEIT SORTIERT NUMERISCH, NICHT UEBER IHREN TEXT. `fmtStunden(468)` ist
 *    „7,8", `fmtStunden(1200)` ist „20" — mit Dezimalkomma und ohne fuehrende Null steht
 *    „20 Std./Tag" als Zeichenkette VOR „7,8 Std./Tag". Die beiden Werte sind deshalb so
 *    gewaehlt, dass Text- und Zahlenordnung entgegengesetzt sind; mit zwei „normalen"
 *    Zahlen waere der Test gruen, egal welchen Wert der Vergleicher liest.
 * 2. IM ROLLENFILTER STEHT DER ANZEIGETEXT, NICHT DER SCHLUESSEL. `werteAlsFilter` liest
 *    dasselbe `ROLLE_TEXT` wie die Zelle — stuende dort `bufdi` statt „BuFDi", waere der
 *    Filter benutzbar und trotzdem falsch beschriftet.
 */
function spaltenkopf(beschriftung: string): HTMLElement {
  const th = queryAll("thead th").find((t) => (t.textContent ?? "").includes(beschriftung));
  if (!th) throw new Error(`Kein Spaltenkopf „${beschriftung}“`);
  return th;
}

/** Den Filter EINER Spalte oeffnen — das Menue haengt danach im Portal an `document.body`. */
async function filterOeffnen(beschriftung: string): Promise<void> {
  const ausloeser = spaltenkopf(beschriftung).querySelector<HTMLElement>(
    ".ant-table-filter-trigger",
  );
  if (!ausloeser) throw new Error(`Spalte „${beschriftung}“ hat keinen Filter`);
  await clickElement(ausloeser);
}

const filtereintraege = () =>
  [...document.body.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item")].map(
    (i) => i.textContent ?? "",
  );

async function filterWaehlen(eintrag: string): Promise<void> {
  const punkt = [...document.body.querySelectorAll<HTMLElement>(".ant-dropdown-menu-item")].find(
    (i) => i.textContent === eintrag,
  );
  if (!punkt) throw new Error(`Kein Filtereintrag „${eintrag}“`);
  await clickElement(punkt);
  const ok = [
    ...document.body.querySelectorAll<HTMLElement>(".ant-table-filter-dropdown-btns button"),
  ].find((b) => b.textContent === "OK");
  if (!ok) throw new Error("Kein OK im Filtermenue");
  await clickElement(ok);
}

const zeilenSchluessel = () =>
  queryAll("tbody tr[data-row-key]").map((r) => r.getAttribute("data-row-key"));

describe("PersonenTabelle — Spaltenkopf: Sortierung ueber den Rohwert, Filter statt Leiste", () => {
  it("sortiert die Soll-Zeit NUMERISCH, nicht ueber „7,8“/„20“", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p-viel", name: "Viel", sollMinutenTag: 1200 }), istAktivHeute: true },
      { person: person({ id: "p-wenig", name: "Wenig", sollMinutenTag: 468 }), istAktivHeute: true },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);
    // Ohne Zutun bleibt die Ordnung die der Seite — keine Spalte traegt `defaultSortOrder`.
    expect(zeilenSchluessel()).toEqual(["p-viel", "p-wenig"]);

    await clickElement(spaltenkopf("Soll-Zeit"));
    // 468 vor 1200. Ueber den Anzeigetext stuende „20 Std./Tag" vorn.
    expect(zeilenSchluessel()).toEqual(["p-wenig", "p-viel"]);
  });

  it("filtert die Rolle im Spaltenkopf — und beschriftet sie wie die Zelle", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p-auf", name: "Auftrag", rolle: "auftrag" }), istAktivHeute: true },
      { person: person({ id: "p-buf", name: "Bufdi", rolle: "bufdi" }), istAktivHeute: true },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);

    await filterOeffnen("Rolle");
    // Die Liste entsteht aus den GELADENEN Zeilen — und traegt den Anzeigetext.
    expect(filtereintraege()).toEqual(["Auftraggeber", "BuFDi"]);

    await filterWaehlen("BuFDi");
    expect(zeilenSchluessel()).toEqual(["p-buf"]);
  });

  it("filtert den Status im Spaltenkopf auf die Ausgeschiedenen", async () => {
    const zeilen: PersonenZeile[] = [
      { person: person({ id: "p-aktiv", name: "Aktiv" }), istAktivHeute: true },
      {
        person: person({ id: "p-weg", name: "Weg", aktivBis: "2020-01-01" }),
        istAktivHeute: false,
      },
    ];
    await mount(<PersonenTabelle zeilen={zeilen} />);

    await filterOeffnen("Status");
    await filterWaehlen("Ausgeschieden");
    expect(zeilenSchluessel()).toEqual(["p-weg"]);
  });
});
