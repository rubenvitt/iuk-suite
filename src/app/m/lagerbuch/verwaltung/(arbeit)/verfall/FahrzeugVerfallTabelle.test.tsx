// @vitest-environment jsdom

import { act } from "react";
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import {
  clickElement,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import s from "../../../_ui/verwaltung.module.css";
import {
  FahrzeugVerfallTabelle,
  sucheTrifft,
  type FahrzeugVerfallZeile,
} from "./FahrzeugVerfallTabelle";

/**
 * DREI FAHRZEUGE, DAMIT DER FAHRZEUGFILTER ETWAS ZU TRENNEN HAT — und „RTW
 * Nord" zweimal, weil genau das der Fall ist, den die Karte vorher nicht
 * zeigen konnte: mehrere Meldungen desselben Fahrzeugs standen ueber die Liste
 * verstreut.
 *
 * Einfuegereihenfolge GEGEN die Sollreihenfolge des Lesepfads (abgelaufen
 * zuerst) — sonst faellt eine fehlende Ordnung nicht auf.
 */
const ZEILEN: FahrzeugVerfallZeile[] = [
  {
    schluessel: "f2:a1",
    fahrzeugId: "f2",
    fahrzeugName: "RTW Süd",
    fahrzeugKennung: "UE-RK 5678",
    artikelName: "NaCl",
    verfall: "2026-09",
    verfallText: "09/26",
    statusTon: "gelb",
    statusText: "läuft ab",
    abgelaufen: false,
    gemeldetText: "01.06.2026",
  },
  {
    schluessel: "f1:a2",
    fahrzeugId: "f1",
    fahrzeugName: "RTW Nord",
    fahrzeugKennung: "UE-RK 1234",
    artikelName: "Verband",
    verfall: "2026-05",
    verfallText: "05/26",
    statusTon: "rot",
    statusText: "abgelaufen",
    abgelaufen: true,
    gemeldetText: "02.06.2026",
  },
  {
    schluessel: "f1:a3",
    fahrzeugId: "f1",
    fahrzeugName: "RTW Nord",
    fahrzeugKennung: "UE-RK 1234",
    artikelName: "Rettungsdecke",
    verfall: "2026-08",
    verfallText: "08/26",
    statusTon: "gelb",
    statusText: "läuft ab",
    abgelaufen: false,
    gemeldetText: "03.06.2026",
  },
];

const getComputedStyleOhnePseudo = window.getComputedStyle.bind(window);

/**
 * antd fragt `getComputedStyle` mit Pseudo-Element ab; jsdom kennt das nicht
 * und schreibt je Aufruf eine „Not implemented"-Zeile ins Protokoll. Der Spy
 * reicht die Anfrage ohne Pseudo-Argument durch — gleiche Stelle, gleicher
 * Grund wie in `FahrzeugeListe.test.tsx`.
 */
beforeAll(() => {
  vi.spyOn(window, "getComputedStyle").mockImplementation((element) =>
    getComputedStyleOhnePseudo(element),
  );
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

/** Wie in `FahrzeugeListe.test.tsx`: der Weg, den auch eine Person nimmt. */
async function spaltenFilter(spalte: string, ...eintraege: string[]): Promise<void> {
  const kopf = queryAll<HTMLElement>("thead th")
    .find((th) => (th.textContent ?? "").includes(spalte));
  const trichter = kopf?.querySelector<HTMLElement>(".ant-table-filter-trigger");
  if (!trichter) throw new Error(`Kein Spaltenfilter an: ${spalte}`);
  await clickElement(trichter);

  const offen = () =>
    document.body.querySelector<HTMLElement>(
      ".ant-dropdown:not(.ant-dropdown-hidden) .ant-table-filter-dropdown",
    );
  const menue = () => Array.from(offen()?.querySelectorAll<HTMLElement>("li") ?? []);
  await warteAuf(() => menue().length > 0, `Filtermenü zu ${spalte}`);

  for (const text of eintraege) {
    const eintrag = menue().find((li) => (li.textContent ?? "").includes(text));
    if (!eintrag) throw new Error(`Filtereintrag nicht gefunden: ${text}`);
    await clickElement(eintrag);
  }

  const knopf = (muster: RegExp) => Array.from(
    offen()?.querySelectorAll<HTMLButtonElement>("button") ?? [],
  ).find((element) => muster.test(element.textContent ?? ""));

  if (eintraege.length === 0) {
    const leeren = knopf(/Zurücksetzen|Reset/);
    if (!leeren) throw new Error("Kein Zurücksetzen-Knopf im Filtermenü");
    await clickElement(leeren);
  }
  const uebernehmen = knopf(/^OK$/);
  if (!uebernehmen) throw new Error("Kein OK-Knopf im Filtermenü");
  await clickElement(uebernehmen);
  await warte();
}

/**
 * ⚠️ `[data-row-key]` UND NICHT `tbody tr` (Falle 14). Ab
 * `VIRTUELL_AB_ZEILEN` rendert rc-table Zeilen als `div` ohne `role="row"`;
 * ein Greifer ueber `tbody tr` findet dann nichts mehr — und zwar erst dann,
 * was ihn in einer kleinen Fixture wie dieser gruen laesst.
 */
function zeilenSchluessel(): Array<string | null> {
  return queryAll("[data-row-key]").map((zeile) => zeile.getAttribute("data-row-key"));
}

async function suchen(wert: string): Promise<void> {
  await fill("input[type='search']", wert);
  await act(async () => {
    await new Promise((fertig) => setTimeout(fertig, 250));
  });
}

describe("FahrzeugVerfallTabelle — Spalten", () => {
  it("macht Artikel, Ablaufdatum und Fahrzeug erkennbar", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    // Die drei Angaben aus Akzeptanzkriterium 2, plus Status und Meldedatum.
    expect(queryAll("thead th").map((spalte) => spalte.textContent)).toEqual([
      "Fahrzeug",
      "Artikel",
      "Verfall",
      "Status",
      "Gemeldet",
    ]);
    expect(query("table").getAttribute("aria-label")).toBe("Verfallsmeldungen aus Fahrzeugen");

    const zeile = query("[data-row-key='f1:a2']");
    expect(zeile.textContent).toContain("RTW Nord");
    expect(zeile.textContent).toContain("UE-RK 1234");
    expect(zeile.textContent).toContain("Verband");
    expect(zeile.textContent).toContain("05/26");
    expect(zeile.textContent).toContain("02.06.2026");
  });

  it("verlinkt das Fahrzeug auf sein Blatt", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    expect(query("[data-row-key='f1:a2'] a").getAttribute("href"))
      .toBe("/verwaltung/fahrzeuge/f1");
  });

  /**
   * ⚠️ ROT FUER ABGELAUFEN, GELB FUER WARNEND — und der Ton kommt FERTIG aus
   * der Server Component. Die Ampel entscheidet der Server (`ampelTon`), die
   * Client-Insel stellt sie nur dar; ein `Ampel`-Wert aus einem Modul mit
   * "use client" kaeme in der Server Component als Client-Referenz an
   * (Falle 6).
   */
  it("zeigt den Status als Chip im gelieferten Ton", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    expect(query(`[data-row-key='f1:a2'] .${s.rot}`).textContent).toContain("abgelaufen");
    expect(query(`[data-row-key='f2:a1'] .${s.gelb}`).textContent).toContain("läuft ab");
  });

  /**
   * ⚠️ SORTIERT WIRD UEBER "YYYY-MM", NICHT UEBER "MM/YYYY".
   * Als Anzeigetext stuende „05/2026" VOR „08/2026", aber auch „01/2027" vor
   * „05/2026" — die Ordnung waere still falsch, sobald ein Jahreswechsel in der
   * Liste liegt.
   */
  it("sortiert Verfall chronologisch, nicht über den Anzeigetext", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    const kopf = queryAll<HTMLElement>("thead th")
      .find((th) => (th.textContent ?? "").includes("Verfall"))!;
    await clickElement(kopf.querySelector<HTMLElement>(".ant-table-column-sorters")!);
    expect(zeilenSchluessel()).toEqual(["f1:a2", "f1:a3", "f2:a1"]);
  });
});

describe("FahrzeugVerfallTabelle — nach Fahrzeug filtern", () => {
  /**
   * AKZEPTANZKRITERIUM 1. Vorher war das gar nicht moeglich: die Karte zeigte
   * eine flache Aufzaehlung, in der die Meldungen eines Fahrzeugs ueber die
   * ganze Liste verstreut standen.
   */
  it("filtert über den Spaltenkopf auf ein Fahrzeug", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    await spaltenFilter("Fahrzeug", "RTW Nord");
    expect(zeilenSchluessel()).toEqual(["f1:a2", "f1:a3"]);
  });

  it("trennt abgelaufen von bald ablaufend", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    await spaltenFilter("Status", "abgelaufen");
    expect(zeilenSchluessel()).toEqual(["f1:a2"]);

    await spaltenFilter("Status");
    await spaltenFilter("Status", "läuft ab");
    expect(zeilenSchluessel()).toEqual(["f2:a1", "f1:a3"]);
  });

  it("sucht über Fahrzeug, Kennung und Artikel", () => {
    expect(sucheTrifft(ZEILEN[1], "rtw nord")).toBe(true);
    expect(sucheTrifft(ZEILEN[1], "UE-RK 1234")).toBe(true);
    expect(sucheTrifft(ZEILEN[1], "verband")).toBe(true);
    expect(sucheTrifft(ZEILEN[1], "NaCl")).toBe(false);
  });

  /**
   * ⚠️ DIE TREFFERANZEIGE FOLGT DEM ZUSTAND, NICHT DER TABELLE (Falle 15).
   * `onChange` feuert nur bei Bedienung DER TABELLE — tippt jemand daneben in
   * die Suche, filtert antd neu, meldet es aber nicht. Wer sich die LISTE aus
   * `extra.currentDataSource` merkt, zeigt nach der naechsten Eingabe eine
   * Zahl von vorhin.
   */
  it("zählt nach Suche UND Spaltenfilter", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    await spaltenFilter("Status", "läuft ab");
    await suchen("Nord");
    expect(zeilenSchluessel()).toEqual(["f1:a3"]);
    expect(query("[data-testid='trefferanzeige']").textContent).toBe("1 von 3");
  });

  it("nennt bei leerem Filter den Filter-Leertext", async () => {
    await mount(<FahrzeugVerfallTabelle zeilen={ZEILEN} />);

    await suchen("gibtesnicht");
    expect(zeilenSchluessel()).toEqual([]);
    expect(query("tr.ant-table-placeholder").textContent)
      .toBe("Keine Meldung passt zu Suche und Filter.");
  });
});
