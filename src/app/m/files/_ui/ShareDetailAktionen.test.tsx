// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE KNOPFZEILE DER SHARE-DETAILSEITE (Naht C; `docs/design/README.md:189-197`).
 *
 * DER BEFUND, der diese Datei ausgeloest hat: `ShareDetailAktionen` rendert
 * Kopieren/Bearbeiten/QR/Loeschen in einem NACKTEN `<div>` nebeneinander. Die
 * Querschnittsregel lautet „Handlungsknoepfe unter 768px sind volle Breite und
 * stehen untereinander, nie nebeneinander" — ein 630px breiter Knopf liest sich
 * als Flaeche, nicht als Ziel.
 *
 * WELCHE HAELFTE DIESE DATEI BESITZT — und welche sie NICHT besitzen kann:
 *
 *  - QUELLTEXT-SCAN ueber `shareDetailAktionen.module.css`: „die Regel steht im
 *    767.98px-Block und zielt auf zwei Klassen". Er besitzt die GEGENMASZNAHME
 *    gegen Falle 5 (`docs/design/README.md:64-85`) — dass der Selektor den
 *    Praefix traegt —, nicht ihre Wirkung.
 *  - DOM (jsdom, Harness `qr/_lib/test-dom.tsx`, KEIN zweites erfunden): „die
 *    Knoepfe tragen die Klassen, auf die die Regel zielt", „es sind genau diese
 *    vier Handlungen", „keiner traegt `size`".
 *  - NICHT ZU HABEN: ob die Medienabfrage WIRKT. jsdom wertet Media Queries
 *    nicht aus; ein Test, der „bei 390px ist der Knopf voll breit" behauptet und
 *    dafuer im DOM sucht, geht IMMER durch und misst nichts
 *    (`docs/design/README.md:199-206`). Dazu kommt, dass die
 *    CSS-Module-Aufloesung unter Vitest fuer JEDEN Schluessel einen Namen
 *    liefert (`styles.gibtEsNicht` ergibt `_gibtEsNicht_<hash>`) — der DOM-Test
 *    allein bliebe also auch dann gruen, wenn es die Regel gar nicht gaebe. Erst
 *    das PAAR aus Scan und DOM-Test verbindet Klasse und Selektor.
 *
 * UEBERGEBEN AN `e2e/files-mobil.spec.ts` (T48, Welle 8a, noch nicht gebaut):
 * die Wirkung, und zwar an BEIDEN Enden. Bei 390px sagen die richtige und die
 * kaputte Fassung beide „sichtbar" — erst 1280px widerlegt eine Regel, die zu
 * weit greift, und die Mitte (834px) die Regel, die bei der falschen Breite
 * schaltet. Der Griff dafuer ist `data-testid="files-detail-knopfzeile"`: die
 * Klassennamen eines `*.module.css` sind gehasht und in Playwright nicht
 * adressierbar.
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { useActionStateMock, loeschenMock, aufstockenMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  loeschenMock: vi.fn(),
  aufstockenMock: vi.fn(),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../(verwaltung)/actions", () => ({
  shareLoeschenAction: loeschenMock,
  downloadsAufstockenAction: aufstockenMock,
}));

import { ShareDetailAktionen } from "./ShareDetailAktionen";
import styles from "./shareDetailAktionen.module.css";
import { mount, query, queryAll, unmount } from "@/app/m/qr/_lib/test-dom";

const CSS_PFAD = "src/app/m/files/_ui/shareDetailAktionen.module.css";
const KOMPONENTE_PFAD = "src/app/m/files/_ui/ShareDetailAktionen.tsx";
const ohneKommentare = (quelle: string) =>
  quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

let abschicken = vi.fn();

beforeEach(() => {
  useActionStateMock.mockReset();
  loeschenMock.mockReset();
  aufstockenMock.mockReset();
  abschicken = vi.fn();
  useActionStateMock.mockImplementation(() => [
    { ok: false, feldFehler: {}, werte: {} },
    abschicken,
    false,
  ]);
});

afterEach(async () => {
  await unmount();
});

async function zeige(hatDownloadLimit = true) {
  await mount(
    <ShareDetailAktionen
      shareId="sh-aaaaaaaa"
      titel="Übung Nord"
      anzahlDateien={2}
      groesseText="1,5 MiB"
      qrDateiname="_bung_Nord-qr.png"
      oeffentlicheAdresse="https://share.iuk-ue.de/s/sh-aaaaaaaa"
      hatDownloadLimit={hatDownloadLimit}
    />,
  );
}

// ---------------------------------------------------------------------------
// Quelltext-Scan — die Gegenmaszname gegen Falle 5
// ---------------------------------------------------------------------------

/** Der Inhalt des `@media (max-width: 767.98px)`-Blocks, ohne Kommentare. */
function mobilBlock(): string {
  const css = ohneKommentare(readFileSync(CSS_PFAD, "utf8"));
  const treffer = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(css);
  expect(treffer, "kein 767.98px-Block in der CSS-Datei").not.toBeNull();
  return treffer![1];
}

describe("Quelltext-Scan — die Knopfregel im Stylesheet", () => {
  it("stapelt die Knopfzeile unterhalb des Suite-Breakpoints", () => {
    // 767.98px und nicht 768px: bei exakt 768px gaelten sonst BEIDE Seiten und
    // die Reihenfolge im Stylesheet entschiede, welche gewinnt.
    expect(mobilBlock()).toMatch(/\.knopfzeile\s*\{[^}]*flex-direction:\s*column/);
  });

  /**
   * ZWEI KLASSEN UND NICHT EINE — das ist die ganze Aussage dieses Tests.
   * `.knopf` allein waere (0,1,0) und damit im Gleichstand mit `.ant-btn`; bei
   * Gleichstand entscheidet die Dokumentreihenfolge, und antds Stylesheet kommt
   * SPAETER (`docs/design/README.md:64-79`, im Repo dreimal passiert). Wer den
   * Praefix als Ballast entfernt, baut den Fehler wieder ein — und zwar STILL:
   * die Regel steht dann richtig da und greift nur nicht.
   */
  it("zielt die Vollbreite auf eine Klasse AM Knopf, mit vorangestelltem Praefix", () => {
    expect(mobilBlock()).toMatch(/\.knopfzeile\s+\.knopf\s*\{[^}]*width:\s*100%/);
  });

  /**
   * DER KINDSELEKTOR REICHT FUER DEN LOESCHKNOPF NICHT: er steht in einem
   * `<form>` (Popconfirm bestaetigt, `requestSubmit` schickt ab), und
   * `.knopfzeile > *` traefe damit das FORMULAR — voll breit waere die
   * unsichtbare Huelle, der Knopf darin bliebe auto-breit und stuende halb so
   * breit neben seinen Nachbarn. Beide Regeln werden gebraucht, deshalb steht
   * auch diese hier.
   */
  it("gibt auszerdem jedem direkten Kind der Zeile volle Breite", () => {
    expect(mobilBlock()).toMatch(/\.knopfzeile\s*>\s*\*\s*\{[^}]*width:\s*100%/);
  });

  it("schaltet nirgends bei einer anderen Breite als 767.98px", () => {
    const css = ohneKommentare(readFileSync(CSS_PFAD, "utf8"));
    const breiten = [...css.matchAll(/(?:max|min)-width:\s*([\d.]+)px/g)].map((m) => m[1]);
    expect(breiten.length, "keine Medienabfrage gefunden").toBeGreaterThan(0);
    expect(breiten).toEqual(breiten.map(() => "767.98"));
  });
});

// ---------------------------------------------------------------------------
// DOM — die Knoepfe tragen die Klassen, auf die die Regel zielt
// ---------------------------------------------------------------------------

describe("DOM — die Knopfzeile und ihre vier Handlungen", () => {
  it("fasst die Handlungen in EINER Zeile mit dem Griff fuer T48", async () => {
    await zeige();
    const zeile = query("[data-testid='files-detail-knopfzeile']");
    expect(zeile.classList.contains(styles.knopfzeile)).toBe(true);
  });

  /**
   * DIE VIER HANDLUNGEN AUS §10.2, und die Liste ist der Pruefgegenstand: ein
   * fuenfter Knopf, der spaeter dazukommt, ohne die Klasse zu tragen, faellt
   * hier auf — und zwar bevor er auf 390px halb so breit neben seinen Nachbarn
   * steht.
   */
  it("enthaelt genau Kopieren, Bearbeiten, QR und Loeschen", async () => {
    await zeige();
    const zeile = query("[data-testid='files-detail-knopfzeile']");
    const ids = Array.from(zeile.querySelectorAll(".ant-btn")).map((k) =>
      k.getAttribute("data-testid"),
    );
    expect(ids).toEqual([
      "files-detail-kopieren",
      "files-detail-bearbeiten",
      "files-detail-qr",
      "files-detail-loeschen",
    ]);
  });

  it("gibt JEDEM Knopf der Zeile die Klasse der Mobilregel — auch dem im Formular", async () => {
    await zeige();
    const knoepfe = queryAll("[data-testid='files-detail-knopfzeile'] .ant-btn");
    expect(knoepfe.length, "keine Knoepfe gefunden").toBe(4);
    for (const knopf of knoepfe) {
      expect(
        knopf.classList.contains(styles.knopf),
        `ohne Klasse der Mobilregel: ${knopf.getAttribute("data-testid")}`,
      ).toBe(true);
    }
  });

  /**
   * `controlHeight: TAP` (56) ist die Suite-Vorgabe und schon das richtige
   * Touch-Masz; `size="large"` waeren 72px, `size="small"` unterschritte die
   * 44px-Trefferflaeche (`docs/design/README.md:59-62`). Die Ausnahme „small
   * INNERHALB von Tabellenzeilen" trifft hier keinen Knopf — es gibt in dieser
   * Insel keine Tabelle.
   */
  it("setzt an keinem Knopf `size`", async () => {
    await zeige();
    const knoepfe = queryAll(".ant-btn");
    expect(knoepfe.length, "keine Knoepfe gefunden").toBeGreaterThan(0);
    for (const knopf of knoepfe) {
      const wo = knopf.getAttribute("data-testid") ?? knopf.textContent;
      expect(knopf.className, `Handlungsknopf mit large: ${wo}`).not.toContain("ant-btn-lg");
      expect(knopf.className, `Handlungsknopf mit small: ${wo}`).not.toContain("ant-btn-sm");
    }
  });

  /**
   * DER ZWEITE HANDLUNGSKNOPF DIESER INSEL steht im Aufstocken-Formular und ist
   * kein Sonderfall: „Handlungsknoepfe unter 768px sind volle Breite" sagt nicht
   * „nur die oberste Reihe". Er steht deshalb in einer eigenen `.knopfzeile` und
   * traegt dieselbe `.knopf`-Klasse — sonst haette dieselbe Ansicht zwei
   * verschiedene Antworten auf dieselbe Regel.
   */
  it("bringt auch den Aufstocken-Knopf unter die Regel", async () => {
    await zeige(true);
    const knopf = query("[data-testid='files-detail-aufstocken-absenden']");
    expect(knopf.classList.contains(styles.knopf)).toBe(true);
    expect(knopf.closest(`.${styles.knopfzeile}`), "steht in keiner Knopfzeile").not.toBeNull();
    // Derselbe Grund wie oben an der Hauptzeile: gehashte Klassennamen sind in
    // Playwright nicht adressierbar, ohne Griff haette T48 hier nichts zu messen.
    expect(query("[data-testid='files-detail-aufstocken-zeile']").classList).toContain(
      styles.knopfzeile,
    );
  });

  /**
   * DIE GEGENPROBE zum Test darueber: ohne gesetztes Limit gibt es das
   * Aufstocken gar nicht (§10.2) — sonst zaehlte der Test oben eine Klasse an
   * einem Knopf, den niemand sieht.
   */
  it("zeigt das Aufstocken nur bei gesetztem Limit", async () => {
    await zeige(false);
    expect(queryAll("[data-testid='files-detail-aufstocken-absenden']")).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// Quelltext-Scan ueber die Komponente
// ---------------------------------------------------------------------------

describe("Quelltext-Scan — die Umschaltung ist CSS, nie JavaScript", () => {
  /**
   * `Grid.useBreakpoint` ist in Server Components verboten (Falle 1) und hier,
   * in einer Client-Insel, waere es zwar erlaubt und trotzdem falsch: ein
   * JS-Breakpoint zeigt beim ersten Render die falsche Variante
   * (`docs/design/README.md:163-165`). Dieselbe Klasse von Fehler wie ein
   * `window.matchMedia` in der Komponente.
   */
  it("kennt weder `useBreakpoint` noch `matchMedia`", () => {
    const quelle = ohneKommentare(readFileSync(KOMPONENTE_PFAD, "utf8"));
    expect(quelle).not.toMatch(/useBreakpoint/);
    expect(quelle).not.toMatch(/matchMedia/);
  });
});
