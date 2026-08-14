// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";

/**
 * DIE FREIGABEN-TABELLE (Spec §7.3, §10.1, §10.2; Plan T36).
 *
 * WAS DIESE DATEI BESITZT — und was sie ausdruecklich NICHT besitzt:
 *
 *  - DOM (jsdom, Harness aus `qr/_lib/test-dom.tsx`, KEIN zweites erfunden):
 *    beide Darstellungen im Markup (2), der GERENDERTE `table-layout`-Wert (3),
 *    Downloads `n / m` bzw. `n / ∞` und der AV-Sammelwert als TEXT (4), die drei
 *    Zeilenaktionen samt Bestaetigung mit Dateizahl UND Groesze (7), der
 *    Fehlerzustand mit `type="warning"` und Wiederholen (9).
 *  - QUELLTEXT-SCAN: „die Umschaltung ist CSS, nie JavaScript" (2) und „kein
 *    `type=\"error\"` auf dieser Datenflaeche" (9). Beides sind Aussagen ueber
 *    ABWESENHEIT — ein DOM-Test kann sie strukturell nicht treffen.
 *  - NICHT hier: ob die Medienabfrage WIRKT. jsdom wertet Media Queries nicht
 *    aus; ein Test, der „bei 390px ist die Tabelle unsichtbar" behauptet und
 *    dafuer im DOM sucht, geht IMMER durch (`docs/design/README.md:199-206`).
 *    Die Regel selbst besitzt `files-css.test.ts` (T18), ihre Wirkung
 *    `e2e/files-mobil.spec.ts` (T48) bei 390, 834 und 1280.
 *  - NICHT hier: die Projektion aus der Datenbank (Punkte 1, 5, 6) — die besitzt
 *    `SharesUebersicht.test.tsx` gegen eine echte, migrierte Datenbank.
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { useActionStateMock, loeschenMock, bearbeitenMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  loeschenMock: vi.fn(),
  bearbeitenMock: vi.fn(),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

/* Ohne diesen Mock zoege die Tabelle die echten Server Actions samt
   `better-sqlite3`, `next/cache` und `bcryptjs` in eine jsdom-Umgebung. */
vi.mock("../(verwaltung)/actions", () => ({
  shareLoeschenAction: loeschenMock,
  bearbeitenAction: bearbeitenMock,
}));

import { SharesTabelle, SharesTabelleSkelett, type ShareZeile } from "./SharesTabelle";
import {
  click,
  clickElement,
  exists,
  existsPortal,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";

const QUELLE_TABELLE = "src/app/m/files/_ui/SharesTabelle.tsx";
const QUELLE_DIALOG = "src/app/m/files/_ui/QrDialog.tsx";
const ohneKommentare = (quelle: string) =>
  quelle.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
const quelltext = (pfad: string) => ohneKommentare(readFileSync(pfad, "utf8"));

/**
 * Der Zustand je ACTION, nicht je Aufrufreihenfolge: die Tabelle ruft
 * `useActionState` einmal pro Zeile UND Darstellung. Eine positionelle Zuordnung
 * waere schon bei zwei Zeilen falsch, ohne dass es auffiele.
 */
const zustaende = new Map<unknown, unknown>();
const absender = new Map<unknown, ReturnType<typeof vi.fn>>();

function abschickenFuer(action: unknown): ReturnType<typeof vi.fn> {
  const vorhanden = absender.get(action);
  if (vorhanden) return vorhanden;
  const neu = vi.fn();
  absender.set(action, neu);
  return neu;
}

beforeEach(() => {
  zustaende.clear();
  absender.clear();
  useActionStateMock.mockReset();
  useActionStateMock.mockImplementation((action: unknown, start: unknown) => [
    zustaende.get(action) ?? start,
    abschickenFuer(action),
    false,
  ]);
});

afterEach(async () => {
  await unmount();
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

function zeile(ueberschreibung: Partial<ShareZeile> = {}): ShareZeile {
  return {
    id: "sh-aaaaaaaa",
    titel: "Übung Nord",
    typText: "Ordner",
    anzahlDateien: 2,
    anzahlUnvollstaendig: 0,
    groesseText: "476,8 MiB",
    ablaufText: "31.07.2026, 14:00",
    abgelaufen: false,
    downloadsText: "3 / 10",
    hatPasswort: true,
    avSammelwert: "freigegeben",
    erstelltVonText: "sub-1",
    qrDateiname: "_bung_Nord-qr.png",
    ...ueberschreibung,
  };
}

async function zeige(zeilen: ShareZeile[] = [zeile()]): Promise<void> {
  await mount(<SharesTabelle zeilen={zeilen} />);
}

/** Der Text einer Tabellenzeile, Zwischenraum normalisiert. */
function zeilentext(index = 0): string {
  return (queryAll("tbody.ant-table-tbody tr.ant-table-row")[index]?.textContent ?? "").replace(
    /\s+/g,
    " ",
  );
}

/** Der Text einer Karte der schmalen Darstellung. */
function kartentext(id: string): string {
  return (query(`[data-testid='files-share-karte-${id}']`).textContent ?? "").replace(/\s+/g, " ");
}

// ---------------------------------------------------------------------------
// Punkt 2 — beide Darstellungen, umgeschaltet per CSS
// ---------------------------------------------------------------------------

describe("Punkt 2 — Tabelle UND Kartenliste stehen im Markup", () => {
  it("rendert beide Darstellungen mit denselben Zeilen", async () => {
    await zeige([zeile(), zeile({ id: "sh-bbbbbbbb", titel: "Lagekarte" })]);

    const desktop = query("[data-testid='files-shares-tabelle-desktop']");
    expect(desktop.querySelector(".ant-table-wrapper"), "keine antd-Tabelle").not.toBeNull();
    expect(queryAll("tbody.ant-table-tbody tr.ant-table-row")).toHaveLength(2);

    const mobil = query("[data-testid='files-shares-karten']");
    expect(mobil.querySelectorAll("[data-testid^='files-share-karte-']")).toHaveLength(2);
    expect(kartentext("sh-bbbbbbbb")).toContain("Lagekarte");
  });

  it("traegt die Umschaltklassen der Suite an beiden Darstellungen", async () => {
    await zeige();
    /*
     * `.fi-liste` ist der vorangestellte Praefix aus `files.css` und NICHT
     * Ballast: `.nurDesktop` allein ist (0,1,0) — Gleichstand mit
     * `.ant-table-wrapper`, und bei Gleichstand gewinnt antds spaeteres
     * Stylesheet. Ohne den Praefix am Wrapper greift die Regel nie
     * (`docs/design/README.md`, Falle 5).
     */
    expect(query("[data-testid='files-shares-tabelle']").className).toContain("fi-liste");
    expect(query("[data-testid='files-shares-tabelle-desktop']").className).toContain("nurDesktop");
    expect(query("[data-testid='files-shares-karten']").className).toContain("nurMobil");
  });

  it("schaltet NICHT ueber JavaScript um", () => {
    const quelle = quelltext(QUELLE_TABELLE);
    /*
     * `Grid.useBreakpoint` ist in Server Components ohnehin verboten (Falle 1);
     * hier geht es um die andere Haelfte: ein JS-Breakpoint zeigt beim ersten
     * Render die FALSCHE Variante, und zwar in beiden Richtungen.
     */
    expect(quelle).not.toMatch(/useBreakpoint|matchMedia|innerWidth|clientWidth|resize/);
  });
});

// ---------------------------------------------------------------------------
// Punkt 3 — scrollen statt umbrechen, ohne `table-layout: fixed`
// ---------------------------------------------------------------------------

describe("Punkt 3 — `scroll={{ x: \"max-content\" }}` und kein fixes Tabellenlayout", () => {
  /**
   * GEMESSEN AM GERENDERTEN MARKUP, nicht nur am Quelltext: rc-table schaltet
   * auf `table-layout: fixed`, sobald eine Spalte `fixed` oder `ellipsis` traegt
   * oder `scroll.y` gesetzt ist (`lib/Table.js:426-442`). Dann verteilt es die
   * Spalten gleichmaeszig und das DESKTOP-Bild aendert sich, ohne dass irgendwo
   * etwas ueberlaeuft — ein Quelltext-Scan allein wuerde eine kuenftige dritte
   * Ursache nicht kennen.
   */
  it("rendert eine Tabelle mit `table-layout: auto` und `width: max-content`", async () => {
    await zeige();
    /* Leerzeichen heraus: jsdom serialisiert `table-layout: auto`, der
       Strom-Renderer `table-layout:auto` — dieselbe Aussage, zwei Schreibweisen. */
    const stil = (
      query("[data-testid='files-shares-tabelle-desktop'] table").getAttribute("style") ?? ""
    ).replace(/\s+/g, "");
    expect(stil).toContain("table-layout:auto");
    expect(stil).toContain("width:max-content");
  });

  it("setzt `scroll.x` und keine der drei Umschalt-Eigenschaften", () => {
    const quelle = quelltext(QUELLE_TABELLE);
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*"max-content"\s*\}\}/);
    expect(quelle).not.toMatch(/\bfixed:\s*["']/);
    expect(quelle).not.toMatch(/\bellipsis\b/);
    expect(quelle).not.toMatch(/scroll=\{\{[^}]*\by:/);
  });
});

// ---------------------------------------------------------------------------
// Punkt 4 — Zustand, Menge und Datum je Zeile
// ---------------------------------------------------------------------------

describe("Punkt 4 — die Zeile zeigt Zustand, Menge und Datum", () => {
  it("nennt Titel, Typ, Dateizahl, Groesze, Ablauf, Downloads, Passwortschutz und Ersteller", async () => {
    await zeige();
    const text = zeilentext();
    expect(text).toContain("Übung Nord");
    expect(text).toContain("Ordner");
    expect(text).toContain("2");
    expect(text).toContain("476,8 MiB");
    expect(text).toContain("31.07.2026, 14:00");
    expect(text).toContain("3 / 10");
    expect(text).toContain("sub-1");
  });

  /**
   * PUNKT 4, ZWEITER HALBSATZ (Review-Runde zu Aufgabe 12): Spaltenkoepfe
   * tragen `SCHRIFT.kicker`, nicht nur ihren Text. Ohne diese Zusicherung
   * naehme eine spaetere Aufraeumrunde das `<span style={SCHRIFT.kicker}>`
   * als Ballast wieder heraus — der Text sieht fuer sich genommen unveraendert
   * aus, die Rolle steckt ausschlieszlich im Stil. Die Aktionsspalte bleibt
   * ausgenommen (`title: ""`, siehe `spalten()`), deshalb hier „Titel".
   */
  it("traegt an der Spalte „Titel“ die Rolle SCHRIFT.kicker (600, versal)", async () => {
    await zeige();
    const kopf = queryAll("thead.ant-table-thead th")[0];
    const span = kopf?.querySelector("span");
    expect(span?.textContent).toBe("Titel");
    expect(span?.style.fontWeight).toBe("600");
    expect(span?.style.textTransform).toBe("uppercase");
  });

  /** `n / ∞` und `n / m` sind zwei verschiedene Aussagen — eine Zeile mit Limit
   *  und eine ohne, sonst waere „irgendein Bruchstrich" schon gruen. */
  it("schreibt ein unbegrenztes Limit als `n / ∞`", async () => {
    await zeige([
      zeile({ id: "sh-mit", downloadsText: "3 / 10" }),
      zeile({ id: "sh-ohne", downloadsText: "7 / ∞" }),
    ]);
    expect(zeilentext(0)).toContain("3 / 10");
    expect(zeilentext(1)).toContain("7 / ∞");
    expect(kartentext("sh-ohne")).toContain("7 / ∞");
  });

  it("nennt den Passwortschutz mit Ja/Nein statt mit einem Symbol allein", async () => {
    await zeige([
      zeile({ id: "sh-mit", hatPasswort: true }),
      zeile({ id: "sh-ohne", hatPasswort: false }),
    ]);
    expect(zeilentext(0)).toContain("Ja");
    expect(zeilentext(1)).toContain("Nein");
  });

  /**
   * BEDEUTUNG NIE ALLEIN UEBER FARBE (`docs/design/README.md:133-137`): der
   * AV-Sammelwert traegt TEXT. Alle sechs Werte, weil ein Ausfall genau bei dem
   * Wert teuer ist, den niemand zuerst testet — und weil `gesperrt` und
   * `pruefungFehlt` die beiden sind, die eine Farbe verfuehrerisch machen.
   */
  it("benennt jeden der sechs AV-Sammelwerte mit Text", async () => {
    const erwartet: Array<[ShareZeile["avSammelwert"], string]> = [
      ["leer", "keine übertragene Datei"],
      ["freigegeben", "geprüft"],
      ["wirdGeprueft", "wird geprüft"],
      ["gesperrt", "gesperrt"],
      ["pruefungFehlt", "Prüfung nicht möglich"],
      ["ungeprueft", "nicht geprüft"],
    ];
    await zeige(erwartet.map(([wert], i) => zeile({ id: `sh-${i}`, avSammelwert: wert })));
    erwartet.forEach(([, text], i) => {
      expect(zeilentext(i), `Sammelwert ${erwartet[i][0]}`).toContain(text);
      expect(kartentext(`sh-${i}`), `Karte ${erwartet[i][0]}`).toContain(text);
    });
  });

  it("nennt eine abgelaufene Freigabe abgelaufen — der Zustand kommt vom Server", async () => {
    await zeige([
      zeile({ id: "sh-alt", abgelaufen: true }),
      zeile({ id: "sh-neu", abgelaufen: false }),
    ]);
    expect(zeilentext(0)).toContain("abgelaufen");
    expect(zeilentext(1)).not.toContain("abgelaufen");
  });

  it("weist unvollstaendige Zeilen aus, statt sie stillschweigend zu verschweigen", async () => {
    await zeige([zeile({ anzahlDateien: 2, anzahlUnvollstaendig: 1 })]);
    // §4.4: der Zwischenzustand „Zeile ohne Bytes" ist SICHTBAR, nicht still.
    expect(zeilentext()).toContain("1 unvollständig");
  });
});

// ---------------------------------------------------------------------------
// Punkt 7 — die drei Zeilenaktionen
// ---------------------------------------------------------------------------

describe("Punkt 7 — Bearbeiten, Löschen, QR", () => {
  it("führt „Bearbeiten“ auf `/shares/<id>/bearbeiten`", async () => {
    await zeige();
    const link = query<HTMLAnchorElement>(
      "[data-testid='files-share-bearbeiten-tabelle-sh-aaaaaaaa']",
    );
    // Relativ und ohne Host: das Ziel liegt auf DEMSELBEN (Verwaltungs-)Host.
    expect(link.getAttribute("href")).toBe("/shares/sh-aaaaaaaa/bearbeiten");
    expect(
      query<HTMLAnchorElement>(
        "[data-testid='files-share-bearbeiten-karte-sh-aaaaaaaa']",
      ).getAttribute("href"),
    ).toBe("/shares/sh-aaaaaaaa/bearbeiten");
  });

  it("nennt in der Löschen-Bestätigung Dateizahl UND Größe", async () => {
    await zeige();
    expect(existsPortal(".ant-popconfirm")).toBe(false);
    await click("[data-testid='files-share-loeschen-tabelle-sh-aaaaaaaa']");
    expect(existsPortal(".ant-popconfirm")).toBe(true);

    const text = (document.body.querySelector(".ant-popconfirm")?.textContent ?? "").replace(
      /\s+/g,
      " ",
    );
    // §7.3 verlangt BEIDES — „2 Dateien" allein sagt nicht, was verloren geht.
    expect(text).toContain("2 Dateien");
    expect(text).toContain("476,8 MiB");
    expect(text).toContain("Übung Nord");
  });

  it("erreicht `shareLoeschenAction` erst NACH der Bestätigung — und dann wirklich", async () => {
    await zeige();
    const loeschen = abschickenFuer(loeschenMock);

    await click("[data-testid='files-share-loeschen-tabelle-sh-aaaaaaaa']");
    expect(loeschen).not.toHaveBeenCalled();

    const bestaetigen = Array.from(
      document.body.querySelectorAll<HTMLElement>(".ant-popconfirm .ant-btn"),
    ).find((knopf) => knopf.textContent === "Löschen");
    expect(bestaetigen, "kein Bestaetigungsknopf im Popconfirm").toBeDefined();
    await clickElement(bestaetigen!);

    expect(loeschen).toHaveBeenCalled();
    // Und nicht irgendeine Action: die Absender sind je Action getrennt.
    expect(abschickenFuer(bearbeitenMock)).not.toHaveBeenCalled();
  });

  it("öffnet über „QR“ den Dialog mit PNG-Download und schließt ihn wieder", async () => {
    await zeige();
    expect(existsPortal("[data-testid='files-share-qr-dialog']")).toBe(false);

    await click("[data-testid='files-share-qr-tabelle-sh-aaaaaaaa']");
    const dialog = document.body.querySelector("[data-testid='files-share-qr-dialog']");
    expect(dialog, "kein QR-Dialog").not.toBeNull();
    expect(
      document.body
        .querySelector<HTMLImageElement>("[data-testid='files-share-qr-bild']")
        ?.getAttribute("src"),
    ).toContain("/api/s/sh-aaaaaaaa/qr.png");
    // Der PNG-Download steht im Titel dieses Tests — also gehoert er auch hinein.
    expect(existsPortal("[data-testid='files-share-qr-png']")).toBe(true);

    /*
     * UND ER GEHT WIEDER ZU. Der Dialog gehoert der Tabelle: sie haelt die
     * Zeile, deren QR gerade sichtbar ist. Bliebe `qrZeile` nach dem Schliessen
     * stehen, liesze sich derselbe Code kein zweites Mal oeffnen — und der Test
     * hiesze „schliesst ihn wieder", ohne es je zu pruefen.
     */
    const x = document.body.querySelector<HTMLElement>(".ant-modal-close");
    expect(x, "kein Schliessen-Knopf am Dialog").not.toBeNull();
    await clickElement(x!);
    expect(existsPortal("[data-testid='files-share-qr-dialog']")).toBe(false);
  });

  /**
   * DERSELBE EINSTIEG AUS DER KARTE — und das ist keine Verdopplung des Tests
   * darueber. Unter 768px stellt `files.css` die Tabelle auf `display: none`;
   * die Kartenliste ist dort die EINZIGE sichtbare Darstellung. Faellt der Knopf
   * aus `ZeilenAktionen` der Karte weg, gibt es auf jedem Handy keinen Weg mehr
   * zum QR-Dialog — genau der Verlust, den die Prueffrage „jede Action braucht
   * einen Einstiegspunkt" (`docs/design/README.md`) verhindern soll.
   * `e2e/files-mobil.spec.ts` (T48) schliesst die Luecke NICHT: das besitzt, ob
   * die Medienabfrage WIRKT, nicht ob der Knopf existiert.
   *
   * EIGENER Test und nicht ein zweites Oeffnen im Test darueber: dort stuende der
   * Dialog vom Tabellenklick schon offen, und jede Zusicherung danach waere auch
   * ohne den Kartenknopf wahr.
   */
  it("öffnet den QR-Dialog AUCH aus der Kartenliste — unter 768px der einzige Weg", async () => {
    await zeige();
    expect(existsPortal("[data-testid='files-share-qr-dialog']")).toBe(false);

    await click("[data-testid='files-share-qr-karte-sh-aaaaaaaa']");
    expect(existsPortal("[data-testid='files-share-qr-dialog']")).toBe(true);
    expect(existsPortal("[data-testid='files-share-qr-png']")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Punkt 9 — Warten und Fehler auf einer Datenflaeche
// ---------------------------------------------------------------------------

describe("Punkt 9 — Warte- und Fehlerzustand", () => {
  /**
   * DAS SKELETT IST TABELLENFOERMIG, nicht irgendein Ladekringel: es traegt
   * dieselben Spaltenueberschriften wie die Tabelle. Ein `<Spin />` an dieser
   * Stelle bliebe sonst gruen — und der Wartezustand saehe aus wie ein leeres
   * Modul statt wie eine Tabelle, die gleich da ist (§10.1).
   */
  it("zeigt als Wartezustand ein Skelett MIT den Spaltenüberschriften der Tabelle", async () => {
    await mount(<SharesTabelleSkelett />);
    const skelett = query("[data-testid='files-uebersicht-skelett']");
    const ueberschriften = Array.from(skelett.querySelectorAll("th")).map((th) => th.textContent);
    expect(ueberschriften).toContain("Titel");
    expect(ueberschriften).toContain("Ablauf");
    expect(ueberschriften).toContain("AV-Zustand");
    expect(skelett.querySelectorAll(".ant-skeleton").length).toBeGreaterThan(0);

    await unmount();
    // Gegenprobe: die echte Tabelle traegt dieselben Ueberschriften — laufen die
    // beiden Listen auseinander, ist das Skelett das Skelett einer anderen
    // Tabelle.
    await zeige();
    const echte = queryAll("thead th").map((th) => th.textContent);
    for (const ueberschrift of ueberschriften) {
      expect(echte, `Ueberschrift ${ueberschrift} fehlt in der echten Tabelle`).toContain(
        ueberschrift,
      );
    }
  });

  it("meldet einen gescheiterten Löschvorgang als `type=\"warning\"` mit Wiederholen", async () => {
    zustaende.set(loeschenMock, {
      ok: false,
      feldFehler: { id: "Diese Freigabe gibt es nicht (mehr)." },
      werte: {},
    });
    await zeige();

    const meldung = query("[data-testid='files-share-fehler-tabelle-sh-aaaaaaaa']");
    expect(meldung.textContent).toContain("Diese Freigabe gibt es nicht (mehr).");
    /*
     * `colorError === colorPrimary === #c8000f`: ein `type="error"` saehe auf
     * dieser Datenflaeche aus wie eine Primaeraktion (`docs/design/README.md`,
     * Falle 3).
     */
    expect(meldung.className).toContain("ant-alert-warning");
    expect(meldung.className).not.toContain("ant-alert-error");

    const loeschen = abschickenFuer(loeschenMock);
    expect(loeschen).not.toHaveBeenCalled();
    await click("[data-testid='files-share-wiederholen-tabelle-sh-aaaaaaaa']");
    expect(loeschen).toHaveBeenCalled();
  });

  it("zeigt keine Meldung, solange nichts gescheitert ist", async () => {
    await zeige();
    expect(exists("[data-testid='files-share-fehler-tabelle-sh-aaaaaaaa']")).toBe(false);
  });

  it("benutzt in keiner der beiden neuen Dateien `type=\"error\"`", () => {
    for (const pfad of [QUELLE_TABELLE, QUELLE_DIALOG]) {
      expect(quelltext(pfad), pfad).not.toMatch(/type=["']error["']/);
    }
  });
});

// ---------------------------------------------------------------------------
// Querschnittsregeln der Suite
// ---------------------------------------------------------------------------

describe("Querschnittsregeln", () => {
  /**
   * `size="large"` waeren 72px; `controlHeight` ist 56 und schon das richtige
   * Touch-Masz. Erlaubt ist ausschlieszlich `size="small"` — und zwar INNERHALB
   * von Tabellenzeilen, weil eine 56px-Zeilenaktion die Zeile sprengt.
   */
  it("setzt `size` nur als `small`, nie als `large`", () => {
    const quelle = quelltext(QUELLE_TABELLE);
    expect(quelle).not.toMatch(/size=["']large["']/);
    expect(quelle).not.toMatch(/size=\{["']large["']\}/);
  });

  /** Unter 768px stehen Handlungsknoepfe untereinander und in voller Breite —
   *  ein 630px breiter Knopf liest sich als Flaeche, nicht als Ziel. Die Karten
   *  sind die Darstellung, die es dort ueberhaupt gibt. */
  it("macht die Knöpfe der Kartenliste voll breit", async () => {
    await zeige();
    const knopf = query("[data-testid='files-share-loeschen-karte-sh-aaaaaaaa']");
    expect(knopf.className).toContain("ant-btn-block");
  });

  /**
   * `_lib/zip.ts` zieht ueber `_lib/av.ts` `node:net` STATISCH in den Graphen.
   * Ein Import von dort in ein `"use client"`-Modul scheitert im Client-Bundle —
   * ein lauter Bundler-Fehler, den `pnpm typecheck` aber nicht zeigt. Die
   * Entschaerfung des Titels laeuft deshalb serverseitig und kommt als fertiger
   * Dateiname herein.
   */
  it("holt nichts aus `_lib/zip` in die Client-Insel", () => {
    for (const pfad of [QUELLE_TABELLE, QUELLE_DIALOG]) {
      expect(quelltext(pfad), pfad).not.toMatch(/from\s+["']\.\.?\/.*_lib\/(zip|av|storage)["']/);
    }
  });
});
