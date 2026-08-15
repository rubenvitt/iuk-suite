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
    const hrefs = queryAll<HTMLAnchorElement>("a")
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
    const alleKnoepfeUndLinks = [...queryAll("button"), ...queryAll("a")];
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

    const beendenKnoepfe = queryAll("button").filter((b) => b.textContent === "Beenden");
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
