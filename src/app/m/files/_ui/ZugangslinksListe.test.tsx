// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { mkdirSync, readFileSync, rmSync } from "node:fs";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { renderToStaticMarkup } from "react-dom/server";

/**
 * DIE ABGABELINK-LISTE (Spec §4.7, §8.6, §10.1; Plan T39).
 *
 * WAS DIESE DATEI BESITZT — die acht Punkte des Tasks, aufgeteilt auf die drei
 * Ebenen, die die jeweilige Aussage ueberhaupt tragen koennen:
 *
 *  - DOM (jsdom, Harness aus `qr/_lib/test-dom.tsx`, KEIN zweites erfunden):
 *    Zeileninhalt (1), die EINMALIGE Ausgabe des Rohtokens (2), „Aufstocken" am
 *    Restbudget-Feld (4), „Widerrufen" mit Bestaetigung und bleibender Zeile
 *    (5), `size="small"` NUR in Tabellenzeilen (6), Leerzustand (7),
 *    PNG-Download und Druck-Knopf (8).
 *  - QUELLTEXT-SCAN ueber `zugangslinks.module.css`: der `@media print`-Block
 *    (8) und die gestapelten Knoepfe unter 767.98px (6). jsdom wertet
 *    Medienabfragen NICHT aus — ein DOM-Test, der „bei 390px steht der Knopf
 *    voll breit" behauptet, geht IMMER durch und misst nichts
 *    (`docs/design/README.md:199-206`).
 *  - SEITE gegen eine echte, migrierte Datenbank: die Naht zu
 *    `hostFuerRolle("inbox")` (3). Genau diese Naht ist der Zustand, der ohne
 *    §3.2 unbemerkt Altpapier produziert haette — sie mit einem Prop-Wert im
 *    DOM-Test nachzustellen belegte nur, dass die Komponente auf `null`
 *    reagiert, nicht dass die Seite `null` je liefert.
 */

// ---------------------------------------------------------------------------
// Mocks — vor jedem Import des Codes unter Test
// ---------------------------------------------------------------------------

const { useActionStateMock, anlegenMock, aufstockenMock, widerrufenMock } = vi.hoisted(() => ({
  useActionStateMock: vi.fn(),
  anlegenMock: vi.fn(),
  aufstockenMock: vi.fn(),
  widerrufenMock: vi.fn(),
}));

vi.mock("react", async (echt) => {
  const react = await echt<typeof import("react")>();
  return { ...react, useActionState: useActionStateMock };
});

vi.mock("../(verwaltung)/zugangslinks/actions", () => ({
  zugangslinkAnlegenAction: anlegenMock,
  kontingentAufstockenAction: aufstockenMock,
  zugangslinkWiderrufenAction: widerrufenMock,
}));

/** Die Seite ruft `headers()`; ohne Request-Scope wirft das echte. */
vi.mock("next/headers", () => ({ headers: vi.fn() }));

import { headers } from "next/headers";
import {
  ZugangslinksListe,
  type ZugangslinkZeile,
  type ZugangslinksListeProps,
} from "./ZugangslinksListe";
import {
  click,
  clickElement,
  exists,
  existsPortal,
  mount,
  query,
  queryAll,
  rerender,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
/* Die Klassennamen sind gehasht (`_nichtDrucken_983e65`) — sie zu tippen waere
   eine Zusage ueber einen Hash. Ueber dieselbe Zuordnung gelesen wie in der
   Komponente ist die Aussage „das Element traegt DIESE Modulklasse". */
import styles from "./zugangslinks.module.css";

const CSS_PFAD = "src/app/m/files/_ui/zugangslinks.module.css";
const css = () => readFileSync(CSS_PFAD, "utf8");
const ohneKommentare = (quelle: string) => quelle.replace(/\/\*[\s\S]*?\*\//g, "");

/**
 * Der Zustand, den `useActionState` je Action zurueckgibt — geschluesselt auf die
 * ACTION-FUNKTION, nicht auf die Aufrufreihenfolge. Die Liste ruft den Hook
 * dreimal (anlegen, aufstocken je Zeile, widerrufen je Zeile); eine positionelle
 * Zuordnung waere bei zwei Zeilen schon falsch, ohne dass es auffiele.
 */
const zustaende = new Map<unknown, unknown>();

/**
 * EINE Absendefunktion JE ACTION, nicht eine geteilte. Mit einer gemeinsamen
 * Attrappe hiesse „wurde abgeschickt" nur „IRGENDEINE der drei Actions" — die
 * Zusage „der Bestaetigungsknopf erreicht `zugangslinkWiderrufenAction`" waere
 * auch dann gruen, wenn er das Aufstocken ausloeste.
 */
const absender = new Map<unknown, ReturnType<typeof vi.fn>>();

function abschickenFuer(action: unknown): ReturnType<typeof vi.fn> {
  const vorhanden = absender.get(action);
  if (vorhanden) return vorhanden;
  const neu = vi.fn();
  absender.set(action, neu);
  return neu;
}

/**
 * Welche Action gerade LAEUFT — der dritte Rueckgabewert von `useActionState`.
 * Wieder auf die Action geschluesselt und nicht auf die Reihenfolge: „es laeuft
 * etwas" ist keine Aussage darueber, WAS laeuft, und ein Knopf, der waehrend
 * eines fremden Vorgangs sperrt, waere ein anderer Fehler mit demselben
 * gruenen Test.
 */
const laufend = new Set<unknown>();

beforeEach(() => {
  zustaende.clear();
  absender.clear();
  laufend.clear();
  useActionStateMock.mockReset();
  useActionStateMock.mockImplementation((action: unknown, start: unknown) => [
    zustaende.get(action) ?? start,
    abschickenFuer(action),
    laufend.has(action),
  ]);
});

afterEach(async () => {
  await unmount();
});

// ---------------------------------------------------------------------------
// Vorrichtungen
// ---------------------------------------------------------------------------

const BASIS = "http://drop.localtest.me:3000";

function zeile(ueberschreibung: Partial<ZugangslinkZeile> = {}): ZugangslinkZeile {
  return {
    id: "zl-aaaaaaaa",
    name: "Übung Nord 30.07.",
    tokenStart: "dz-2345",
    laufzeitText: "24 h",
    ablaufText: "31.07.2026, 14:00",
    zustand: "gueltig",
    budgetDateien: 100,
    restDateien: 97,
    budgetBytesText: "2,0 GiB",
    restBytesText: "1,9 GiB",
    uploads: 3,
    qrDateiname: "_bung_Nord_30_07_-qr.png",
    ...ueberschreibung,
  };
}

function liste(props: Partial<ZugangslinksListeProps> = {}) {
  return (
    <ZugangslinksListe
      zeilen={props.zeilen ?? [zeile()]}
      /* `??` waere hier falsch: `inboxBasis: null` IST die Aussage des Tests und
         faellt sonst still auf die Vorbelegung zurueck. */
      inboxBasis={props.inboxBasis === undefined ? BASIS : props.inboxBasis}
    />
  );
}

async function zeige(props: Partial<ZugangslinksListeProps> = {}): Promise<void> {
  await mount(liste(props));
}

/**
 * Derselbe Baum ein zweites Mal — fuer Zusagen, die erst an einem UEBERGANG
 * sichtbar werden (hier: „die Action hat `ok` gemeldet"). Ein zweites `mount`
 * waere ein frischer Baum und ueberspraenge genau den Uebergang.
 */
async function erneut(props: Partial<ZugangslinksListeProps> = {}): Promise<void> {
  await rerender(liste(props));
}

/** Der Text einer Tabellenzeile, Zwischenraum normalisiert. */
function zeilentext(index = 0): string {
  return (queryAll("tbody.ant-table-tbody tr.ant-table-row")[index]?.textContent ?? "").replace(
    /\s+/g,
    " ",
  );
}

const VOLLER_TOKEN = "dz-2345-6789-abcd";

/** Die Ausgabe erscheint, weil `zugangslinkAnlegenAction` `ok` zurueckgegeben hat. */
function nachDemAnlegen(token = VOLLER_TOKEN, id = "zl-neu000001"): void {
  zustaende.set(anlegenMock, { ok: true, id, token });
}

// ---------------------------------------------------------------------------
// Punkt 1 — was in einer Zeile steht
// ---------------------------------------------------------------------------

describe("Punkt 1 — die Zeile zeigt Zustand und Restbudget, nicht nur einen Namen", () => {
  it("nennt Name, `token_start…`, Laufzeit, Restbudget, Zustand und Uploads-Zaehler", async () => {
    await zeige({ zeilen: [zeile()] });
    const text = zeilentext();
    expect(text).toContain("Übung Nord 30.07.");
    // Mit Auslassungszeichen: die sieben Zeichen sind der ANFANG, nicht der Token.
    expect(text).toContain("dz-2345…");
    expect(text).toContain("24 h");
    expect(text).toContain("31.07.2026, 14:00");
    // Restbudget UND Bezugsgroesse — „97" allein sagt nicht, wovon.
    expect(text).toContain("97");
    expect(text).toContain("100");
    expect(text).toContain("1,9 GiB");
    expect(text).toContain("2,0 GiB");
    expect(text).toContain("gültig");
    expect(text).toContain("3");
  });

  it("benennt die drei Zustaende mit Text, nicht ueber Farbe", async () => {
    await zeige({
      zeilen: [
        zeile({ id: "a", zustand: "gueltig" }),
        zeile({ id: "b", zustand: "abgelaufen" }),
        zeile({ id: "c", zustand: "widerrufen" }),
      ],
    });
    expect(zeilentext(0)).toContain("gültig");
    expect(zeilentext(1)).toContain("abgelaufen");
    expect(zeilentext(2)).toContain("widerrufen");
  });

  /**
   * `scroll={{ x: "max-content" }}` ist die einzige ehrliche Angabe, solange die
   * Spalten keine `width` tragen — und KEINE Spalte darf `fixed`/`ellipsis`
   * tragen und `scroll.y` gesetzt sein: rc-table schaltet dann auf
   * `table-layout: fixed` und das DESKTOP-Bild aendert sich, ohne dass irgendwo
   * etwas ueberlaeuft (`lib/Table.js:426-442`). Diese Liste hat KEINE
   * Kartenliste (§8.6 nennt sie nur fuer `/posteingang`), die Tabelle ist unter
   * 768px also sichtbar und muss scrollen.
   */
  it("laesst die Tabelle scrollen statt umzubrechen", async () => {
    await zeige();
    expect(exists(".ant-table-content, .ant-table-body")).toBe(true);
    const quelle = ohneKommentare(readFileSync("src/app/m/files/_ui/ZugangslinksListe.tsx", "utf8"));
    expect(quelle).toMatch(/scroll=\{\{\s*x:\s*"max-content"\s*\}\}/);
    expect(quelle).not.toMatch(/\bfixed:\s*["']/);
    expect(quelle).not.toMatch(/\bellipsis\b/);
    expect(quelle).not.toMatch(/scroll=\{\{[^}]*\by:/);
  });
});

// ---------------------------------------------------------------------------
// Punkt 2 — der Rohtoken, EINMAL
// ---------------------------------------------------------------------------

describe("Punkt 2 — die einmalige Ausgabe", () => {
  it("zeigt nach dem Anlegen den vollen Token mit Link und QR", async () => {
    nachDemAnlegen();
    await zeige();
    const ausgabe = query("[data-testid='files-zugangslink-ausgabe']");
    expect(ausgabe.textContent).toContain(VOLLER_TOKEN);
    expect(query<HTMLAnchorElement>("[data-testid='files-zugangslink-link']").href).toBe(
      `${BASIS}/u/${VOLLER_TOKEN}`,
    );
    expect(query<HTMLImageElement>("[data-testid='files-zugangslink-qr']").src).toBe(
      `${BASIS}/api/u/${VOLLER_TOKEN}/qr.png`,
    );
  });

  it("nimmt den Token nach dem Schliessen VOLLSTAENDIG aus dem Markup", async () => {
    nachDemAnlegen();
    await zeige();
    expect(query("[data-testid='files-zugangslink-ausgabe']").innerHTML).toContain(VOLLER_TOKEN);

    await click("[data-testid='files-zugangslink-ausgabe-schliessen']");

    expect(exists("[data-testid='files-zugangslink-ausgabe']")).toBe(false);
    // Nicht nur „der Block ist weg": auch kein verstecktes Feld, kein
    // `data-`-Attribut, kein href. Der Token existiert danach nirgends (§4.7).
    expect(query("[data-testid='files-zugangslinks']").innerHTML).not.toContain(VOLLER_TOKEN);
  });

  /**
   * Der `localStorage`-Umweg der Alt-App ist ausdruecklich NICHT nachzubauen: die
   * QR-Historie ging dort beim Domainwechsel verloren (origin-gebunden), und ein
   * Rohtoken, der einen Neuaufbau ueberlebt, ist gespeichert — genau das, was
   * §4.7 ausschliesst.
   */
  it("legt den Token in keinen Speicher, der einen Neuaufbau ueberlebt", () => {
    const quelle = ohneKommentare(readFileSync("src/app/m/files/_ui/ZugangslinksListe.tsx", "utf8"));
    expect(quelle).not.toMatch(/localStorage|sessionStorage|document\.cookie|indexedDB/);
  });
});

// ---------------------------------------------------------------------------
// Punkt 3 — Rolle `inbox` ohne Host
// ---------------------------------------------------------------------------

describe("Punkt 3 — ohne Inbox-Host gibt es keinen Link und keinen QR", () => {
  it("nennt den Zustand, deaktiviert das Anlegen und zeigt weder Link noch QR", async () => {
    nachDemAnlegen();
    await zeige({ inboxBasis: null });

    expect(query("[data-testid='files-zugangslinks-kein-host']").textContent).toContain(
      "Die Abgabe-Domain ist noch nicht auf die Suite umgestellt",
    );
    expect(query<HTMLButtonElement>("[data-testid='files-zugangslink-anlegen']").disabled).toBe(
      true,
    );
    expect(exists("[data-testid='files-zugangslink-qr']")).toBe(false);
    expect(exists("[data-testid='files-zugangslink-link']")).toBe(false);
    expect(exists("[data-testid='files-zugangslink-png']")).toBe(false);
  });

  it("zeigt den Zustand NICHT, sobald die Rolle einen Host hat", async () => {
    await zeige({ inboxBasis: BASIS });
    expect(exists("[data-testid='files-zugangslinks-kein-host']")).toBe(false);
    expect(query<HTMLButtonElement>("[data-testid='files-zugangslink-anlegen']").disabled).toBe(
      false,
    );
  });
});

// ---------------------------------------------------------------------------
// Punkt 4 — Aufstocken am Restbudget-Feld
// ---------------------------------------------------------------------------

describe("Punkt 4 — Kontingent aufstocken steht am Restbudget", () => {
  it("liegt in derselben Zelle wie das Restbudget", async () => {
    await zeige();
    const knopf = query("[data-testid='files-zugangslink-aufstocken-zl-aaaaaaaa']");
    const zelle = knopf.closest("td");
    expect(zelle, "der Knopf steht in keiner Tabellenzelle").not.toBeNull();
    // Der Zustand ist dort ablesbar, wo gehandelt wird — sonst ist die Aktion
    // von ihrer Zahl getrennt (§8.6).
    expect(zelle!.textContent).toContain("97");
  });

  it("oeffnet ein Formular mit Zuwachs-Feldern, nicht mit einer neuen Summe", async () => {
    await zeige();
    await click("[data-testid='files-zugangslink-aufstocken-zl-aaaaaaaa']");
    expect(exists("input[name='zusatzDateien']")).toBe(true);
    expect(exists("input[name='zusatzBytes']")).toBe(true);
    expect(query<HTMLInputElement>("input[name='id']").value).toBe("zl-aaaaaaaa");
  });

  it("fehlt bei abgelaufenen und widerrufenen Links", async () => {
    await zeige({
      zeilen: [zeile({ id: "abgel", zustand: "abgelaufen" }), zeile({ id: "widr", zustand: "widerrufen" })],
    });
    expect(exists("[data-testid='files-zugangslink-aufstocken-abgel']")).toBe(false);
    expect(exists("[data-testid='files-zugangslink-aufstocken-widr']")).toBe(false);
  });

  /**
   * DER ZWEITE KLICK IST HIER KEINE WIEDERHOLUNG, SONDERN EINE ZWEITE
   * AUFSTOCKUNG. `kontingentAufstockenAction` schreibt `budget + <zusatz>`
   * (`actions.ts`) — nicht idempotent. Solange der Vorgang laeuft, muss der
   * Absende-Knopf deshalb gesperrt sein; `useActionState` liefert die Auskunft
   * an dritter Stelle.
   */
  it("sperrt den Absende-Knopf, solange die Aufstockung laeuft", async () => {
    laufend.add(aufstockenMock);
    await zeige();
    await click("[data-testid='files-zugangslink-aufstocken-zl-aaaaaaaa']");
    expect(
      query<HTMLButtonElement>(
        "[data-testid='files-zugangslink-aufstocken-absenden-zl-aaaaaaaa']",
      ).disabled,
    ).toBe(true);
  });

  it("laesst den Absende-Knopf bedienbar, solange nichts laeuft", async () => {
    await zeige();
    await click("[data-testid='files-zugangslink-aufstocken-zl-aaaaaaaa']");
    expect(
      query<HTMLButtonElement>(
        "[data-testid='files-zugangslink-aufstocken-absenden-zl-aaaaaaaa']",
      ).disabled,
    ).toBe(false);
  });

  /**
   * DIE ZWEITE HAELFTE DERSELBEN GEFAHR. Die Action gibt bei Erfolg NICHTS
   * zurueck, was man lesen koennte (`actions.ts`: `return { ok: true }`), und
   * das Restbudget darueber aendert sich ueber `revalidatePath` nur um ein paar
   * Ziffern. Bliebe das Formular danach offen, saehe der Vorgang aus wie
   * „nichts passiert" — und der naechste Klick addierte den Zuwachs ein zweites
   * Mal.
   */
  it("schliesst das Formular, sobald die Aufstockung `ok` gemeldet hat", async () => {
    await zeige();
    await click("[data-testid='files-zugangslink-aufstocken-zl-aaaaaaaa']");
    expect(exists("input[name='zusatzDateien']")).toBe(true);

    zustaende.set(aufstockenMock, { ok: true });
    await erneut();

    expect(exists("input[name='zusatzDateien']")).toBe(false);
  });

  /** Ein FEHLER darf das Formular nicht schliessen — die Eingabe waere weg. */
  it("laesst das Formular bei einem Fehler offen und zeigt ihn am Feld", async () => {
    await zeige();
    await click("[data-testid='files-zugangslink-aufstocken-zl-aaaaaaaa']");

    zustaende.set(aufstockenMock, {
      ok: false,
      fieldErrors: { id: "Dieser Abgabelink ist nicht (mehr) gültig" },
      values: {},
    });
    await erneut();

    expect(exists("input[name='zusatzDateien']")).toBe(true);
    expect(query("[data-testid='files-zugangslink-aufstocken-absenden-zl-aaaaaaaa']").closest("form")!
      .textContent).toContain("nicht (mehr) gültig");
  });
});

// ---------------------------------------------------------------------------
// Punkt 5 — Widerrufen mit Bestaetigung, Zeile bleibt
// ---------------------------------------------------------------------------

describe("Punkt 5 — Widerrufen", () => {
  /**
   * ZWEI HAELFTEN, UND DIE ZWEITE IST DIE WICHTIGERE. „Es fragt nach" allein
   * waere auch bei einem Bestaetigungsknopf gruen, der ins Leere zeigt — eine
   * Action ohne erreichbaren Aufrufer, nur eine Ebene tiefer als der Befund aus
   * der `feedback`-Nachschau (§10.2). Der Weg ist hier nicht direkt: der Knopf
   * liegt in einem Popconfirm, und erst `onConfirm` schickt das Formular ab.
   */
  it("schickt erst NACH der Bestaetigung ab — und dann wirklich", async () => {
    await zeige();
    const widerrufenAbsender = abschickenFuer(widerrufenMock);

    expect(existsPortal(".ant-popconfirm")).toBe(false);
    await click("[data-testid='files-zugangslink-widerrufen-zl-aaaaaaaa']");
    expect(existsPortal(".ant-popconfirm")).toBe(true);
    expect(widerrufenAbsender).not.toHaveBeenCalled();

    const bestaetigen = Array.from(
      document.body.querySelectorAll<HTMLElement>(".ant-popconfirm .ant-btn"),
    ).find((knopf) => knopf.textContent === "Widerrufen");
    expect(bestaetigen, "kein Bestaetigungsknopf im Popconfirm").toBeDefined();
    await clickElement(bestaetigen!);

    expect(widerrufenAbsender).toHaveBeenCalled();
    // Und nicht die falsche Action: die drei Absender sind getrennt.
    expect(abschickenFuer(anlegenMock)).not.toHaveBeenCalled();
    expect(abschickenFuer(aufstockenMock)).not.toHaveBeenCalled();
  });

  /**
   * `revoked_at` statt Zeilenloeschung ist der ganze Punkt (§8.6): mit der Zeile
   * verschwaende die `token_id`-Zuordnung der schon empfangenen Uploads. Eine
   * Liste, die widerrufene Links ausblendet, nimmt genau diese Historie wieder
   * weg — sichtbar bleibt sie nur, wenn sie gerendert wird.
   */
  it("laesst die widerrufene Zeile mit ihrem Uploads-Zaehler in der Liste stehen", async () => {
    await zeige({ zeilen: [zeile({ id: "widr", zustand: "widerrufen", uploads: 12 })] });
    expect(queryAll("tbody.ant-table-tbody tr.ant-table-row")).toHaveLength(1);
    expect(zeilentext()).toContain("widerrufen");
    expect(zeilentext()).toContain("12");
    expect(exists("[data-testid='files-zugangslink-widerrufen-widr']")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Punkt 6 — Groessen der Bedienelemente
// ---------------------------------------------------------------------------

describe("Punkt 6 — `size=\"small\"` nur in Tabellenzeilen", () => {
  it("gibt jedem Knopf IN der Tabelle `small` und keinem ausserhalb", async () => {
    nachDemAnlegen();
    await zeige();

    const inZeilen = queryAll("tbody.ant-table-tbody .ant-btn");
    expect(inZeilen.length, "keine Zeilenaktion gefunden").toBeGreaterThan(0);
    for (const knopf of inZeilen) {
      expect(knopf.className, `Zeilenaktion ohne small: ${knopf.textContent}`).toContain(
        "ant-btn-sm",
      );
    }

    const draussen = queryAll(".ant-btn").filter((k) => !k.closest("tbody.ant-table-tbody"));
    expect(draussen.length, "kein Knopf ausserhalb der Tabelle gefunden").toBeGreaterThan(0);
    for (const knopf of draussen) {
      // `controlHeight` ist 56 und schon das richtige Touch-Masz; `size="large"`
      // waeren 72px, `small` waere zu klein fuer einen Handlungsknopf.
      expect(knopf.className, `Handlungsknopf mit small: ${knopf.textContent}`).not.toContain(
        "ant-btn-sm",
      );
      expect(knopf.className, `Handlungsknopf mit large: ${knopf.textContent}`).not.toContain(
        "ant-btn-lg",
      );
    }
  });

  it("stapelt die Knopfzeile unter 767.98px und gibt volle Breite", () => {
    const mobil = /@media \(max-width: 767\.98px\) \{([\s\S]*?)\n\}/.exec(ohneKommentare(css()));
    expect(mobil, "kein 767.98px-Block").not.toBeNull();
    expect(mobil![1]).toMatch(/\.knopfzeile\s*\{[^}]*flex-direction:\s*column/);
    expect(mobil![1]).toMatch(/width:\s*100%/);
  });
});

// ---------------------------------------------------------------------------
// Punkt 7 — Leerzustand, und wie er auf Punkt 3 trifft
// ---------------------------------------------------------------------------

describe("Punkt 7 — Leerzustand", () => {
  it("nennt die Leere und bietet den Weg heraus", async () => {
    await zeige({ zeilen: [] });
    const leer = query("[data-testid='files-zugangslinks-leer']");
    expect(leer.textContent).toContain("Kein Abgabelink vorhanden");
    expect(query<HTMLButtonElement>("[data-testid='files-zugangslink-anlegen']").disabled).toBe(
      false,
    );
  });

  it("laesst den Knopf im Leerzustand OHNE Host deaktiviert", async () => {
    await zeige({ zeilen: [], inboxBasis: null });
    expect(query("[data-testid='files-zugangslinks-leer']").textContent).toContain(
      "Kein Abgabelink vorhanden",
    );
    expect(query<HTMLButtonElement>("[data-testid='files-zugangslink-anlegen']").disabled).toBe(
      true,
    );
  });
});

// ---------------------------------------------------------------------------
// Punkt 8 — PNG-Download und Druckansicht
// ---------------------------------------------------------------------------

describe("Punkt 8 — PNG-Download und Druckansicht", () => {
  /**
   * Der Dateiname kommt aus DER ZEILE, die `revalidatePath` gerade nachgeliefert
   * hat — entschaerft ist er serverseitig (`_lib/zip.ts`, `entschaerfeTitel`),
   * weil ein Import von dort in ein `"use client"`-Modul ueber `_lib/av.ts`
   * `node:net` ins Client-Bundle zoege. Dass die Entschaerfung STATTFINDET,
   * belegt der Seitentest unten gegen die echte Datenbank.
   *
   * DEN DOWNLOAD MACHT DIE ROUTE, NICHT DAS ATTRIBUT: `download` wird bei
   * FREMDER Herkunft ignoriert, und die Herkunft ist hier zwangslaeufig fremd
   * (die Route liegt auf der Inbox-Domain; `validateFilesHosts` verbietet, dass
   * beide Rollen denselben Host tragen). Wirksam ist `?dl=1` — darauf antwortet
   * `api/u/[token]/qr.png/route.ts` mit `Content-Disposition: attachment` und
   * dem Namen aus der Datenbank. `download` bleibt daneben stehen: es kostet
   * nichts, wirkt sofort, falls die Ansicht je auf denselben Host wandert, und
   * MUSS deshalb denselben Namen tragen — deshalb steht hier beides in einem
   * Test.
   */
  it("bietet den PNG-Knopf unter dem Dateinamen der frisch angelegten Zeile", async () => {
    nachDemAnlegen(VOLLER_TOKEN, "zl-neu000001");
    await zeige({
      zeilen: [zeile({ id: "zl-neu000001", qrDateiname: "_bung_Nord_30_07_-qr.png" })],
    });
    const png = query<HTMLAnchorElement>("[data-testid='files-zugangslink-png']");
    /*
     * GENAU diese Adresse, nicht `toContain`: die Route liest AUSSCHLIESSLICH
     * `w` und `dl` (`api/u/[token]/qr.png/route.ts`). Ein zusaetzlicher
     * Parameter waere ein erfundener Vertrag, und `toContain` liesse ihn durch.
     * Aendert die Route ihren Vertrag, MUSS diese Zeile mit — das ist der Zweck
     * der Paarung.
     */
    expect(png.href).toBe(`${BASIS}/api/u/${VOLLER_TOKEN}/qr.png?w=1024&dl=1`);
    expect(png.getAttribute("download")).toBe("_bung_Nord_30_07_-qr.png");
    /*
     * DIE BESCHRIFTUNG IST DIE ZUSAGE. „oeffnen" war die ehrliche Beschriftung,
     * solange der Knopf nur einen zweiten Tab aufmachte; mit `?dl=1` laedt er,
     * und ein Knopf, der etwas anderes verspricht als er tut, ist der Anfang
     * jeder Fehlbedienung.
     */
    expect(png.textContent).toContain("QR als PNG laden");
  });

  /**
   * DER KNOPF DARF DIE SEITE NICHT VERLASSEN — und das gilt WEITERHIN, obwohl
   * die Route jetzt `attachment` liefert: eine Antwort mit `Content-Disposition`
   * laesst den Tab normalerweise stehen, aber „normalerweise" ist hier zu wenig.
   * Antwortet die Route wider Erwarten doch mit einem Bild (falsch geklemmter
   * Parameter, Zwischenspeicher, Proxy, der die Kopfzeile verschluckt),
   * navigierte der Browser im selben Tab weg: die Insel floege aus dem Baum,
   * `useActionState` finge wieder bei `ANLEGEN_START` an, und der Rohtoken waere
   * vernichtet, ohne dass ihn jemand notiert hat (§4.7). Zurueck kaeme eine
   * Seite OHNE Token.
   */
  it("oeffnet das PNG in einem neuen Tab, damit die einmalige Ausgabe stehen bleibt", async () => {
    nachDemAnlegen();
    await zeige();
    const png = query<HTMLAnchorElement>("[data-testid='files-zugangslink-png']");
    expect(png.target).toBe("_blank");
    // `noopener`, weil `_blank` sonst `window.opener` auf diese Seite gaebe.
    expect(png.rel).toContain("noopener");
  });

  it("bietet einen Druck-Knopf", async () => {
    nachDemAnlegen();
    await zeige();
    expect(exists("[data-testid='files-zugangslink-drucken']")).toBe(true);
  });

  /**
   * KEINE eigene Route: der Praezedenzfall `feedback` hat die Druckansicht als
   * eigene Route mit eigenem Layout — und genau dort fiel sie aus dem
   * Zugriffsriegel heraus. Hier traegt der Token die Vertraulichkeit; eine
   * zweite Route waere eine zweite Stelle, an der er ausgegeben wird.
   */
  it("traegt die Druckansicht als `@media print`-Block im Modul-CSS", () => {
    const rein = ohneKommentare(css());
    const block = /@media print \{([\s\S]*?)\n\}/.exec(rein);
    expect(block, "kein `@media print`-Block").not.toBeNull();
    // Der Ausgabe-Block deckt die Seite ab, alles andere verschwindet — sonst
    // druckt die Suite-Shell mit.
    expect(block![1]).toMatch(/\.druckbereich\s*\{/);
    expect(block![1]).toMatch(/\.nichtDrucken\s*\{[^}]*display:\s*none/);
  });

  it("haengt `nichtDrucken` an den Rest der Seite, solange die Ausgabe offen ist", async () => {
    nachDemAnlegen();
    await zeige();
    const rest = () => query("[data-testid='files-zugangslinks-rest']").className;
    expect(rest()).toContain(styles.nichtDrucken);
    await click("[data-testid='files-zugangslink-ausgabe-schliessen']");
    // Ohne Ausgabe waere ein Druck sonst eine leere Seite.
    expect(rest()).not.toContain(styles.nichtDrucken);
  });
});

// ---------------------------------------------------------------------------
// Punkt 3, zweite Haelfte — die Seite und `hostFuerRolle`
// ---------------------------------------------------------------------------

describe("die Seite — Naht zu `hostFuerRolle(\"inbox\")`", () => {
  const DIR = "./.data/files-zugangslinks-seite-test";

  /*
   * ZWEI SORTEN ZEITSTEMPEL, und beide mit Absicht. `zl-seite01` traegt FESTE
   * Sekunden aus 2025 — die Zeile ist damit dauerhaft abgelaufen, und die 24
   * Stunden zwischen `created_at` und `expires_at` sind eine Zahl, die sich nie
   * aendert. Die Widerrufs-Zeilen brauchen dagegen einen Ablauf, der WIRKLICH in
   * der Zukunft liegt; ein fester Zeitpunkt waere ein Test mit Verfallsdatum.
   *
   * `mode: "timestamp"` fuehrt SEKUNDEN (nicht Millisekunden wie im Modul `qr`)
   * — deshalb `/ 1000` beim Saeen und nirgends ein Faktor 1000 in der Seite.
   */
  const JETZT_S = Math.floor(Date.now() / 1000);
  const IN_EINER_STUNDE_S = JETZT_S + 3600;
  const VOR_EINER_STUNDE_S = JETZT_S - 3600;
  const VOR_ZWEI_STUNDEN_S = JETZT_S - 7200;

  beforeEach(() => {
    rmSync(DIR, { recursive: true, force: true });
    mkdirSync(DIR, { recursive: true });
    vi.stubEnv("DATA_DIR", DIR);
    const sqlite = new Database(`${DIR}/files.db`);
    migrate(drizzle(sqlite), { migrationsFolder: "src/app/m/files/_db/migrations" });
    /*
     * BUDGET UND REST IN VERSCHIEDENEN GROESSENORDNUNGEN, und beide Zahlen so
     * gewaehlt, dass binaer und dezimal AUSEINANDERFALLEN: 500.000.000 Byte sind
     * „476,8 MiB", aber „500,0 MB" — ein vertauschtes Einheitenwort oder ein
     * Teiler 1000 statt 1024 aendert damit den TEXT und nicht nur seine
     * Bedeutung. Mit 2 GiB (der Vorbelegung) waere das nicht so: dort raeten
     * Budget und Rest beide „2,0 GiB", und die Zusicherung koennte die beiden
     * Felder nicht einmal unterscheiden.
     */
    sqlite.exec(
      `INSERT INTO zugangslinks
         (id, name, token_start, token_hash, created_at, created_by, expires_at,
          budget_dateien, budget_bytes, verbraucht_dateien, verbraucht_bytes)
       VALUES ('zl-seite01', 'Übung Nord', 'dz-2345', 'hash-1',
               1754049600, 'sub-1', 1754136000, 100, 500000000, 3, 400000000)`,
    );
    /*
     * WIDERRUFEN UND ABGELAUFEN ZUGLEICH — die Zeile, die den Vorrang aus §8.6
     * ueberhaupt erst pruefbar macht: „widerrufen" ist die Aussage ueber eine
     * ENTSCHEIDUNG, „abgelaufen" nur Zeitablauf.
     */
    sqlite.exec(
      `INSERT INTO zugangslinks
         (id, name, token_start, token_hash, created_at, created_by, expires_at,
          revoked_at, budget_dateien, budget_bytes, verbraucht_dateien, verbraucht_bytes)
       VALUES ('zl-widabg', 'Widerruf schlägt Zeitablauf', 'dz-3456', 'hash-2',
               ${VOR_ZWEI_STUNDEN_S}, 'sub-1', ${VOR_EINER_STUNDE_S},
               ${VOR_EINER_STUNDE_S}, 10, 1048576, 0, 0)`,
    );
    /* Widerrufen, aber die Laufzeit laeuft noch — hier trennt sich `revoked_at`
       vom Ablauf in die andere Richtung. */
    sqlite.exec(
      `INSERT INTO zugangslinks
         (id, name, token_start, token_hash, created_at, created_by, expires_at,
          revoked_at, budget_dateien, budget_bytes, verbraucht_dateien, verbraucht_bytes)
       VALUES ('zl-widlauf', 'Widerrufen, noch laufend', 'dz-4567', 'hash-3',
               ${VOR_EINER_STUNDE_S}, 'sub-1', ${IN_EINER_STUNDE_S},
               ${JETZT_S}, 10, 1048576, 0, 0)`,
    );
    /* Die Gegenprobe: OHNE sie waere „kein Aufstocken-Knopf" auch dann gruen,
       wenn es den Knopf ueberhaupt nicht mehr gaebe. */
    sqlite.exec(
      `INSERT INTO zugangslinks
         (id, name, token_start, token_hash, created_at, created_by, expires_at,
          budget_dateien, budget_bytes, verbraucht_dateien, verbraucht_bytes)
       VALUES ('zl-gueltig', 'Noch gültig', 'dz-5678', 'hash-4',
               ${VOR_EINER_STUNDE_S}, 'sub-1', ${IN_EINER_STUNDE_S}, 10, 1048576, 0, 0)`,
    );
    sqlite.close();
    delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
    vi.mocked(headers).mockResolvedValue(
      new Headers({ host: "files.localtest.me:3000" }) as never,
    );
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    delete (globalThis as { __suiteDb?: unknown }).__suiteDb;
    rmSync(DIR, { recursive: true, force: true });
  });

  async function seitenMarkup(): Promise<string> {
    const { default: Seite } = await import("../(verwaltung)/zugangslinks/page");
    return renderToStaticMarkup(await Seite());
  }

  /**
   * Der Markup-Ausschnitt EINER Zeile. `rowKey="id"` landet als `data-row-key`
   * am `<tr>`; ohne diesen Schnitt liefe jede Zusicherung gegen die ganze Seite
   * und traefe irgendeine andere Zeile — bei vier Zeilen mit vier verschiedenen
   * Zustaenden waere „das Wort steht irgendwo" keine Aussage mehr.
   */
  function zeileAusMarkup(markup: string, id: string): string {
    const start = markup.indexOf(`data-row-key="${id}"`);
    expect(start, `keine Tabellenzeile mit der id ${id}`).toBeGreaterThan(-1);
    const ende = markup.indexOf("</tr>", start);
    return markup.slice(start, ende);
  }

  it("liefert den benannten Zustand, wenn `SUITE_HOST_FILES` leer ist", async () => {
    vi.stubEnv("SUITE_HOST_FILES", "");
    const markup = await seitenMarkup();
    expect(markup).toContain("Die Abgabe-Domain ist noch nicht auf die Suite umgestellt");
    // Kein Link auf einen geratenen Host — und schon gar kein relativer
    // `/u/`-Weg, der auf dem Verwaltungs-Host in ein `notFound()` liefe (§10.2).
    expect(markup).not.toMatch(/href="\/u\//);
    expect(markup).toContain("disabled");
  });

  it("baut Link und QR aus der ROLLE `inbox`, nicht aus dem Request-Host", async () => {
    vi.stubEnv("SUITE_HOST_FILES", "files.localtest.me,drop.localtest.me");
    // Die Seite laeuft auf dem VERWALTUNGS-Host; erschiene der in einem
    // erzeugten Link, waere das Papier beim Abschalten eines Hosts wertlos.
    zustaende.set(anlegenMock, { ok: true, id: "zl-seite01", token: VOLLER_TOKEN });
    const markup = await seitenMarkup();
    expect(markup).toContain(`http://drop.localtest.me:3000/u/${VOLLER_TOKEN}`);
    expect(markup).not.toContain("files.localtest.me:3000/u/");
    expect(markup).not.toContain("Die Abgabe-Domain ist noch nicht");
    // Die Entschaerfung 1:1 aus `_lib/zip.ts`: „Übung Nord" → `_bung_Nord`.
    expect(markup).toContain('download="_bung_Nord-qr.png"');
  });

  it("zeigt die Zeile aus der Datenbank mit Restbudget und Uploads-Zaehler", async () => {
    vi.stubEnv("SUITE_HOST_FILES", "files.localtest.me,drop.localtest.me");
    const markup = await seitenMarkup();
    expect(markup).toContain("Übung Nord");
    expect(markup).toContain("dz-2345…");
    const reihe = zeileAusMarkup(markup, "zl-seite01");
    // 100 − 3 = 97 Dateien Rest, 3 Uploads. Rechnet die Seite falsch, steht hier
    // eine andere Zahl — nicht bloss ein anderes Wort.
    expect(reihe).toContain("97");
    // 24 Stunden zwischen den beiden Sekunden-Zeitstempeln. Ein Faktor-1000
    // Fehler (`mode: "timestamp"` fuehrt SEKUNDEN, nicht Millisekunden) ergaebe
    // hier eine absurde Laufzeit statt „24 h".
    expect(reihe).toContain("24 h");
  });

  /**
   * DIE EINHEIT IST DIE AUSSAGE. 500.000.000 Byte sind 476,8 MiB und 500,0 MB —
   * dieselbe Zahl unter zwei Namen, Faktor 1,048576. Genau dieses Paar ist im
   * Modul `files` schon einmal teuer geworden, und die Seite kommentiert es an
   * Ort und Stelle; eine Zusicherung auf den TEXT ist das einzige, was den
   * Kommentar bindet. Beide Mutationen fallen hier auf: das Einheitenwort
   * dezimal ergaebe „476,8 MB", der Teiler 1000 ergaebe „500,0 MiB".
   *
   * Rest UND Budget, in dieser Reihenfolge und in verschiedenen
   * Groessenordnungen: mit gleichen Zahlen liesse sich ein vertauschtes
   * Feldpaar nicht von der richtigen Zuordnung unterscheiden.
   */
  it("beschriftet die Byte-Angaben BINAER (MiB), nicht dezimal", async () => {
    vi.stubEnv("SUITE_HOST_FILES", "files.localtest.me,drop.localtest.me");
    const markup = await seitenMarkup();
    const reihe = zeileAusMarkup(markup, "zl-seite01");
    // 500.000.000 − 400.000.000 = 100.000.000 Byte Rest → 95,4 MiB von 476,8 MiB.
    expect(reihe).toContain("95,4 MiB von 476,8 MiB");
    expect(reihe).not.toContain("MB");
  });

  /**
   * DER WIDERRUF GEWINNT UEBER DEN ABLAUF (§8.6) — und der Zustand steuert die
   * Einstiegspunkte. Ohne diese vier Zeilen ist die Abbildung
   * `revoked_at`/`expires_at` ungeprueft: die Komponententests oben bekommen den
   * Zustand als PROP hereingereicht und rendern ihn als Wort, sie rechnen ihn
   * nicht.
   *
   * Warum die Einstiegspunkte dazugehoeren: `kontingentAufstockenAction` lehnt
   * per `isNull(revoked_at)`/`gt(expires_at, jetzt)` IMMER ab. Ein
   * „aufstocken" an einer widerrufenen Zeile waere genau der Knopf, der immer
   * scheitert.
   */
  it("rechnet den Zustand aus `revoked_at` und `expires_at` — Widerruf vor Ablauf", async () => {
    vi.stubEnv("SUITE_HOST_FILES", "files.localtest.me,drop.localtest.me");
    const markup = await seitenMarkup();

    // Widerrufen UND abgelaufen: „widerrufen", nicht „abgelaufen".
    const widabg = zeileAusMarkup(markup, "zl-widabg");
    expect(widabg).toContain("<span>widerrufen</span>");
    // Auf die ZUSTANDSZELLE genau, nicht auf die Zeile: „abgelaufen" koennte
    // sonst aus der Bezeichnung stammen und die Zusage waere zufaellig.
    expect(widabg).not.toContain("<span>abgelaufen</span>");

    // Widerrufen, Laufzeit laeuft noch.
    expect(zeileAusMarkup(markup, "zl-widlauf")).toContain("<span>widerrufen</span>");

    // Nur abgelaufen, nie widerrufen — die Zeile, die den Ablaufzweig traegt.
    expect(zeileAusMarkup(markup, "zl-seite01")).toContain("<span>abgelaufen</span>");

    // Und die Gegenprobe.
    expect(zeileAusMarkup(markup, "zl-gueltig")).toContain("<span>gültig</span>");
  });

  it("haengt „Kontingent aufstocken\" nur an die gueltige Zeile", async () => {
    vi.stubEnv("SUITE_HOST_FILES", "files.localtest.me,drop.localtest.me");
    const markup = await seitenMarkup();

    expect(zeileAusMarkup(markup, "zl-gueltig")).toContain(
      'data-testid="files-zugangslink-aufstocken-zl-gueltig"',
    );
    for (const id of ["zl-seite01", "zl-widabg", "zl-widlauf"]) {
      expect(markup, `Aufstocken an einer nicht gueltigen Zeile: ${id}`).not.toContain(
        `data-testid="files-zugangslink-aufstocken-${id}"`,
      );
    }

    // „Widerrufen" fehlt genau dort, wo schon widerrufen wurde — und steht an
    // der abgelaufenen Zeile, die weiterhin widerrufbar ist (`actions.ts`).
    expect(zeileAusMarkup(markup, "zl-seite01")).toContain(
      'data-testid="files-zugangslink-widerrufen-zl-seite01"',
    );
    for (const id of ["zl-widabg", "zl-widlauf"]) {
      expect(markup, `Widerrufen an einer widerrufenen Zeile: ${id}`).not.toContain(
        `data-testid="files-zugangslink-widerrufen-${id}"`,
      );
    }
  });
});
