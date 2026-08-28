// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/versionen/VersionenTabelle.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize } from "node:path";

/**
 * INSEL 3 — DIE SOFTWAREVERSIONEN DER VERWALTUNG (`Spec:4505`, §5.12; Aufgabe V19).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile stirbt
 * jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⚠️ DER BLINDE FLECK, GEERBT UND BENANNT: **Falle 1 und Falle 9**. In jsdom gibt es keine
 * RSC-Grenze — `Space.Compact` ist hier ein gewoehnliches Bauteil und die vier
 * `render`-Funktionen der Tabelle sind gewoehnliche Funktionswerte. Zoege jemand die Flaeche
 * in die Server Component, bliebe JEDER Fall dieser Datei gruen und der Abruf antwortete mit
 * HTTP 500 bzw. `Functions cannot be passed directly to Client Components`. Der Waechter
 * dagegen ist der Playwright-Fall (`Spec:4881-4882`, Fall 8 in
 * `e2e/radio-verwaltung.spec.ts`) — gefahren in Aufgabe V23.
 *
 * ⚠️ WAS HIER ANDERS IST ALS IN INSEL 1 UND 2: diese Flaeche hat KEINEN mobilen Zweig und
 * ruft `Grid.useBreakpoint()` nicht (der Bestand tut es ebenfalls nicht,
 * `SoftwareVersionsPage.tsx:1-25`). Deshalb rendert jsdom hier die ECHTE Tabelle mit ihren
 * Zeilen, und die Zellen werden am gerenderten Baum geprueft statt an einem Geruest ueber
 * einer exportierten Spaltenliste — anders als in `AusleihenTabelle.test.tsx:20-30`, wo der
 * `matchMedia`-Stub den mobilen Zweig erzwingt.
 */

/*
 * ⛔ `vi.hoisted`, WEIL `vi.mock` AN DEN DATEIANFANG GEHOBEN WIRD. Ein gewoehnliches
 * `const anlegenMock = vi.fn()` darueber ist zur Ausfuehrungszeit der Fabrik noch nicht
 * initialisiert (gemessen in V13: `ReferenceError: Cannot access ... before initialization`,
 * und die ganze Datei faellt aus, nicht ein Fall).
 *
 * ⛔ DIE VIER ACTIONS WERDEN DIREKT IMPORTIERT UND NICHT ALS PROP GEREICHT
 * (Bauform-Zulaessigkeitstafel Nr. 6, `Spec:4495-4497`) — deshalb ist der Modulersatz der
 * einzige Weg, sie im Test abzugreifen. ⛔ UND OHNE IHN ZOEGE `admin/actions.ts` hier
 * `better-sqlite3`, `drizzle-orm` und `next/cache` in den jsdom-Lauf.
 */
const { anlegenMock, zielMock, loeschenMock, sortierenMock } = vi.hoisted(() => ({
  anlegenMock: vi.fn(),
  zielMock: vi.fn(),
  loeschenMock: vi.fn(),
  sortierenMock: vi.fn(),
}));
vi.mock("../../actions", () => ({
  versionAnlegenAction: anlegenMock,
  versionZielSetzenAction: zielMock,
  versionLoeschenAction: loeschenMock,
  versionenSortierenAction: sortierenMock,
}));

const INSEL_ORDNER = "src/app/m/radio/admin/(arbeit)/versionen";
const QUELLE_TABELLE = `${INSEL_ORDNER}/VersionenTabelle.tsx`;
const QUELLE_NEU = `${INSEL_ORDNER}/NeuVersion.tsx`;
const QUELLE_SEITE = `${INSEL_ORDNER}/page.tsx`;

/**
 * DIE DATEIEN DER INSEL — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**,
 * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „Rulings"). Gemessen in der
 * Schlusspruefung zu V13 (Fund M2): eine zusaetzliche Datei in einem Inselverzeichnis, ohne
 * Bauform-Direktive UND mit einem Wertimport aus `_db/schema`, liess eine handgeschriebene
 * Namensliste voellig unbeeindruckt.
 *
 * ⛔ DER AUSSCHLUSS STEHT AM BLATT UND NICHT AM AST (Ruling **R-V11-3**).
 */
const SERVER_EINSTIEGE = ["page.tsx", "layout.tsx", "template.tsx", "route.ts"];

function inselDateien(): string[] {
  return readdirSync(INSEL_ORDNER)
    .filter((name) => /\.tsx?$/.test(name))
    .filter((name) => !/\.(?:test|spec)\.tsx?$/.test(name))
    .filter((name) => !SERVER_EINSTIEGE.includes(name))
    .sort();
}

/**
 * ⛔ Die Sollwerttafel steht NUR auf der rechten Seite — sie ist der Prueffling der Messung.
 *
 * ⚠️ ZWEI DATEIEN, UND DAS IST DER VORABSCAN-FUND **F22**
 * (`.superpowers/sdd/planteil4/VORABSCAN.md:520-537`): `NeuVersion.tsx` teilt mit
 * `VersionenTabelle.tsx` KEINEN Zustand und waere nach E-V6s eigenem Kriterium eine eigene
 * Insel; die Spec zaehlt beide als Insel 3 (`Spec:4505`). Der Fund verlangt, dass die zweite
 * Datei trotzdem ihre Faelle bekommt — sie stehen unten in dieser Datei, damit die
 * Dateiliste des Auftrags unveraendert bleibt.
 */
const INSEL_SOLL = ["NeuVersion.tsx", "VersionenTabelle.tsx"];

/**
 * DIE ACTIONS, DIE DIE INSEL WIRKLICH RUFT — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling
 * **R-V11-1**, `.superpowers/sdd/planteil4/progress.md`): „Wo ein Scan eine Fehlerklasse
 * bewacht, die in einer NEUEN Datei entstehen kann, muss er die Menge FINDEN, nicht
 * auflisten." Der Fehlerpfad-Fall darunter haelt seine Tafel gegen diese Messung; eine
 * fuenfte Action ohne eigenen Fehlerpfad-Fall faellt damit auf, statt still unbewacht zu
 * bleiben (REVIEW-V19, Fund **F2**).
 */
function actionsDerInsel(): string[] {
  const namen = new Set<string>();
  for (const datei of inselDateien()) {
    const quelle = ohneKommentare(readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8"));
    for (const treffer of quelle.matchAll(/\b([a-zA-Z][A-Za-z0-9]*Action)\b/g)) {
      namen.add(treffer[1]!);
    }
  }
  return [...namen].sort();
}

/**
 * DIE BENANNTE TEXTLISTE EINER FLAECHENDATEI, AUFGESCHLAGEN — Kopf, Rumpf und die
 * Zeichenketten darin (REVIEW-V19, Fund **F7**).
 *
 * ⛔ SIE IST DER PRUEFLING VON DREI FAELLEN und deshalb die lasttragendste Funktion dieser
 * Datei: driftet ihr Anker, wird `block` leer, `werte` leer — und zwei negative Zusicherungen
 * darueber waeren GRUEN UEBER NICHTS. Genau die Gestalt, die dieses Repo einmal teuer bezahlt
 * hat (eine Abschlusszeile meldete „Paritaet gruen" als konstanten Text, drei Sonden ergaben
 * 0 rot). ⛔ DESHALB MELDET SIE `gefunden` UND JEDER FALL PRUEFT ES, bevor er etwas anderes
 * behauptet.
 *
 * ⚠️ Der Fuss ist `} as const;` WOERTLICH — dieselbe Zeichenkette, die der Fall darueber
 * schon fuer den Satz der E-Tafel benutzt. Wer das Semikolon weglaesst oder einen Kommentar
 * dahinterhaengt, macht `gefunden` falsch und den Fall ROT, nicht still gruen.
 */
const TEXTLISTE_KOPF = /const [A-Z][A-Z0-9_]*_TEXTE = \{/;
const TEXTLISTE_FUSS = "} as const;";

/**
 * Ein Zeichenkettenliteral im Quelltext — doppelte Anfuehrungszeichen ODER ein Schablonentext.
 * ⚠️ Einfache Anfuehrungszeichen kommen hier nicht vor (`eslint`/`prettier` des Hauses setzen
 * doppelte); ein `'…'` faenge dieser Ausdruck NICHT, und das ist die bewusst laute Richtung —
 * er wuerde dann als JSX-Textkind oder als textfuehrendes Attribut auffallen.
 */
const ZEICHENKETTE = /"(?:[^"\\\n]|\\.)*"|`(?:[^`\\]|\\.)*`/g;

function textListe(quelle: string): { gefunden: boolean; block: string; werte: string[] } {
  const beginn = quelle.search(TEXTLISTE_KOPF);
  const fuss = beginn === -1 ? -1 : quelle.indexOf(TEXTLISTE_FUSS, beginn);
  if (beginn === -1 || fuss === -1) return { gefunden: false, block: "", werte: [] };
  const block = quelle.slice(beginn, fuss + TEXTLISTE_FUSS.length);
  return { gefunden: true, block, werte: [...block.matchAll(ZEICHENKETTE)].map((t) => t[0]) };
}

/**
 * DIE FLAECHE, WIE DER LESER SIE SIEHT: die GEFUNDENEN Inseldateien PLUS die Seite. Die
 * RSC-Grenze trennt sie fuer den Bau, nicht fuer den, der eine Formulierung aendert — und
 * `page.tsx` traegt mit `SEITEN_TEXTE` eine eigene der drei Listen.
 *
 * ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**) — dieselbe Menge wie in den zwei
 * Bauform-Faellen darunter; ein handgeschriebenes Tripel hier waere der naechste Fund.
 */
function flaechenDateien(): string[] {
  return [...inselDateien().map((datei) => `${INSEL_ORDNER}/${datei}`), QUELLE_SEITE];
}

/**
 * WORAN MAN EINEM LITERAL ANSIEHT, DASS ES EIN BILDSCHIRMTEXT IST (REVIEW-V19, Fund **F7**):
 * ein Leerzeichen, ein Zeichen ausserhalb des druckbaren ASCII-Satzes (Umlaut, Gedankenstrich,
 * typografische Anfuehrungszeichen) ODER ein Grossbuchstabe am Anfang.
 *
 * ⛔ DIE DREI SIND AM BESTAND GEMESSEN, NICHT GERATEN (2026-08-26): ausserhalb der drei Listen
 * traegt diese Flaeche genau 56 Literale — Importpfade, Spaltenschluessel (`"wert"`,
 * `"deviceCount"`, `"aktionen"`), antd-Werte (`"right"`, `"center"`, `"success"`, `"primary"`,
 * `"max-content"`, `"info"`, `"alert"`, `"id"`) und die `data-rolle`-Griffe. ⛔ KEINES davon
 * erfuellt einen der drei Zweige; die EINE Ausnahme ist die Bauform-Direktive.
 *
 * ⛔ **UND JEDES DER DREI MERKMALE HAT SEINE EIGENE SONDE** — sonst waere hier eine Aufzaehlung
 * behauptet, von der nur ein Glied bewiesen ist (genau die Gestalt von Fund F7). Alle drei an
 * einem `data-hinweis="…"` am aeusseren `<div>` gefahren, also an einer Stelle, die WEDER ein
 * textfuehrendes Attribut (Zweig 2) noch ein JSX-Textkind (Zweig 3) ist, und jede einzeln
 * zurueckgenommen: `"Neu erfundener Text"` (Leerzeichen) → **1 rot**; `"Anlegen"` (einwortig,
 * ASCII, Grossbuchstabe am Anfang) → **1 rot**; `"löschen"` (einwortig, klein, aber nicht
 * ASCII) → **1 rot**. Jede meldete `ein Bildschirmtext steht ausserhalb der benannten Liste`.
 */
const BILDSCHIRMVERDACHT = /[ ]|[^ -~]|^\p{Lu}/u;

/**
 * ⛔ DIE EINE BENANNTE AUSNAHME. `"use client"` traegt ein Leerzeichen und ist trotzdem kein
 * Bildschirmtext, sondern die Bauform-Direktive — sie steht als erste Zeile und wird vom Fall
 * „jede Datei der Insel traegt use client als erste Zeile" bewacht. `"use server"` steht hier
 * vorsorglich mit; keine Datei dieser Flaeche traegt sie (die Actions liegen in
 * `admin/actions.ts`).
 */
const BAUFORM_DIREKTIVEN = ['"use client"', '"use server"'];

/**
 * EIN TEXTFUEHRENDES ATTRIBUT ODER OBJEKTFELD MIT EINEM LITERAL. ⛔ `\{?` IST NICHT ZIERRAT:
 * ohne es liefe `title={"Anlegen"}` durch — gueltiges JSX, das den Text ebenso auf den
 * Bildschirm bringt wie `title="Anlegen"`.
 *
 * ⚠️ Die Liste ist die der antd-Bauteile dieser Flaeche (`Tooltip`/`Alert`/`Table`-`title`,
 * `Input`-`placeholder`, `Popconfirm`-`okText`/`cancelText`, `locale.emptyText`) plus die
 * zugaenglichen Namen (`aria-label`) und die drei, die beim naechsten Bauteil dazukaemen
 * (`label`, `message`, `description`, `alt`). ⛔ SIE IST EINE UNTERGRENZE, kein Beweis — der
 * Zweig darueber faengt auch ein Attribut, das hier fehlt, solange sein Text mehrwortig,
 * gross geschrieben oder nicht-ASCII ist.
 */
const TEXTFUEHRENDES_FELD =
  /\b(?:title|placeholder|aria-label|okText|cancelText|emptyText|label|message|description|alt)\s*[=:]\s*\{?\s*["'`]/g;

/**
 * EIN JSX-TEXTKIND, DAS BLANKER TEXT IST: zwischen einem `>` und dem naechsten `<` steht
 * mindestens ein Buchstabe und weder eine geschweifte noch eine spitze Klammer.
 *
 * ⛔ ER IST DER EINZIGE ZWEIG, DER `<Button>Anlegen</Button>` FAENGT — dort gibt es kein
 * Literal (Zweig 1 sieht nichts) und kein Attribut (Zweig 2 sieht nichts).
 *
 * ⛔ **UND ER DARF DAS ZEILENENDE NICHT AUSSCHLIESSEN — GEMESSEN, NICHT UEBERLEGT.** Die
 * erste Fassung dieses Ausdrucks trug `\n` in beiden Zeichenklassen. Die Sonde dazu
 * (2026-08-26): `{NEUVERSION_TEXTE.anlegen}` durch blankes `Anlegen` ersetzt UND den
 * Listeneintrag geloescht — die Form, die KEIN anderer Zweig sieht — ergab
 * `Tests 27 passed (27)`, ⛔ NULL ROT. Grund: `prettier` bricht ein mehrzeiliges Bauteil
 * um, der Text steht auf einer EIGENEN Zeile zwischen `>` und `</Button>`, und der Ausdruck
 * suchte nur innerhalb einer Zeile. Der Fall haette genau das nicht gefunden, wofuer er
 * gebaut wurde.
 *
 * ⚠️ Ohne `\n` traegt allein der Ausschluss `{`/`}`/`<`/`>`, und er traegt: er laesst
 * `{VERSIONEN_TEXTE.nachOben}` und `{z.wert}` durch, und im Rumpfcode steht zwischen zwei
 * `>` immer eine geschweifte Klammer oder der Pfeil der naechsten Funktion (`ziel >=
 * zeilen.length) return;` … `(z) => z.id`). ⛔ Am Bestand gemessen: null Treffer in allen drei
 * Dateien, ⛔ und ausdruecklich NICHT auf Kosten der Fundrate — ein zusaetzlicher Ausschluss
 * (`;`, `=`) machte den Scan still falsch-negativ statt laut falsch-positiv
 * (`_lib/quelltextScan.ts:58-59`).
 */
const JSX_TEXTKIND = />([^<>{}]*\p{L}[^<>{}]*)</gu;

import { act } from "react";
import {
  click,
  clickElement,
  clickPortal,
  fill,
  mount,
  query,
  queryAll,
  unmount,
} from "@/app/m/qr/_lib/test-dom";
import { ohneKommentare } from "../../../_lib/quelltextScan";
import type { VersionZeile } from "../../../_lib/lesepfade/versionen";
import { NeuVersion } from "./NeuVersion";
import { VersionenTabelle } from "./VersionenTabelle";

/**
 * Eine Zeile, wie der Lesepfad sie liefert — VORFORMATIERT und serialisierbar, ohne `Date`
 * (`_lib/lesepfade/versionen.ts`, Kopf von `VersionZeile`; Bauform-Zulaessigkeitstafel
 * Nr. 7). Die Vorbelegung ist die haeufigste Zeile: eine Version ohne Ziel-Marke und ohne
 * haengende Geraete.
 */
function zeile(teil: Partial<VersionZeile> = {}): VersionZeile {
  return {
    id: "v-1",
    wert: "FW 12.3",
    isTarget: false,
    deviceCount: 0,
    angelegtText: "14.06.2026, 09:12",
    ...teil,
  };
}

beforeEach(() => {
  anlegenMock.mockReset();
  zielMock.mockReset();
  loeschenMock.mockReset();
  sortierenMock.mockReset();
  anlegenMock.mockResolvedValue({ ok: true });
  zielMock.mockResolvedValue({ ok: true });
  loeschenMock.mockResolvedValue({ ok: true });
  sortierenMock.mockResolvedValue({ ok: true });
});

afterEach(async () => {
  await unmount();
});

/**
 * Einen Knoten ueberfahren und antds Aufklappverzoegerung abwarten.
 *
 * ⛔ `mouseover` UND `mouseenter`: React leitet `onMouseEnter` aus `mouseover` ab (das
 * Enter/Leave-Plugin), ein reines `mouseenter` erreicht die Komponente nicht.
 * ⚠️ `mouseEnterDelay` steht bei antd auf 0,1 s — die Wartezeit ist echt und nicht
 * verhandelbar. Wortgleich uebernommen aus `import/ImportAssistent.test.tsx:230-238`.
 */
async function ueberfahre(knoten: HTMLElement): Promise<void> {
  await act(async () => {
    knoten.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    knoten.dispatchEvent(new MouseEvent("mouseenter", { bubbles: true }));
  });
  await act(async () => {
    await new Promise((weiter) => setTimeout(weiter, 300));
  });
}

describe("radio-Versionen: die fuenf Spalten und ihre zwei Sperren", () => {
  it("Loeschen ist gesperrt, solange Geraete haengen — inklusive des Hinweistextes", async () => {
    /*
     * ⛔ DER FALL, DEN `Spec:4861-4862` NAMENTLICH NENNT, und er hat ZWEI Haelften: der Knopf
     * ist DEAKTIVIERT (`SoftwareVersionsPage.tsx:155`) UND der Hinweistext steht dabei
     * (`:154`). Ohne die zweite Haelfte saehe eine bedienende Person einen toten Knopf ohne
     * Grund und wuerde die Geraete nicht umstellen — der Alt-Kommentar sagt es
     * (`softwareVersionRepo.ts:98-101`): „the admin must reassign those devices first, so
     * deletion can never orphan a device's version string."
     *
     * ⚠️ antds `Tooltip` rendert seinen Inhalt ERST BEIM UEBERFAHREN und in ein PORTAL an
     * `document.body`; deshalb der `mouseenter` und die Wartezeit.
     *
     * ⛔ UEBERFAHREN WIRD DIE `<span>`-HUELLE UND NICHT DER KNOPF — und das ist der gemessene
     * Kern dieses Falles, nicht eine Bequemlichkeit des Tests: an einem deaktivierten
     * Formularelement liefert React `onMouseEnter` NICHT aus, und antd 6 zieht (anders als
     * antd 5) keine eigene Huelle mehr ein. Sonde vom 2026-08-26, `antd@6.5.3`: ohne Huelle
     * blieb `[role="tooltip"]` leer, mit Huelle stand der Text da. Die Begruendung steht an
     * der Huelle selbst (`VersionenTabelle.tsx`, Aktionsspalte).
     */
    await mount(<VersionenTabelle zeilen={[zeile({ deviceCount: 3 })]} />);

    const knopf = query<HTMLButtonElement>('[data-rolle="radio-version-loeschen"]');
    expect(knopf.disabled, "der Loeschknopf ist trotz haengender Geraete bedienbar").toBe(true);

    await ueberfahre(query('[data-rolle="radio-version-loeschen-huelle"]'));
    const hinweis = document.body.querySelector('[role="tooltip"]');
    expect(hinweis?.textContent, "der Grund der Sperre fehlt am Knopf").toBe(
      "Wird von 3 Gerät(en) genutzt — erst umstellen",
    );
  });

  it("ohne haengende Geraete fragt Loeschen nach", async () => {
    /*
     * DIE GEGENPROBE. ⛔ Sie traegt zwei Aussagen: der Knopf ist bedienbar, UND er loescht
     * nicht sofort, sondern fragt (`Popconfirm`, `SoftwareVersionsPage.tsx:160-170`). Ohne
     * die zweite waere ein Fehlgriff auf einer Beruehrflaeche unwiderruflich.
     */
    await mount(<VersionenTabelle zeilen={[zeile({ deviceCount: 0 })]} />);

    const knopf = query<HTMLButtonElement>('[data-rolle="radio-version-loeschen"]');
    expect(knopf.disabled, "ohne haengende Geraete ist der Knopf gesperrt").toBe(false);

    await click('[data-rolle="radio-version-loeschen"]');
    const frage = document.body.querySelector(".ant-popconfirm");
    expect(frage?.textContent, "der Knopf loescht ohne Rueckfrage").toContain(
      "Version wirklich löschen?",
    );
    expect(loeschenMock, "geloescht, bevor jemand bestaetigt hat").not.toHaveBeenCalled();
  });

  it("die Ziel-Marke erscheint genau einmal", async () => {
    /*
     * ⛔ `toBe(1)` UND NICHT `>= 1`: der Update-Stand JEDES Geraets haengt an dieser EINEN
     * Marke (`_db/schema.ts:84-92`), und es gibt keinen DB-Constraint, der sie auf eine
     * begrenzt — die Schwaeche wandert 1:1 mit (`_lib/lesepfade/versionen.ts`, Kopf von
     * `zielVersion`). Eine Flaeche, die zwei Marken zeigte, ohne dass etwas rot wuerde, waere
     * genau die stille Form dieses Fehlers.
     *
     * ⛔ GEZAEHLT WIRD DIE MARKE DER VERSIONSSPALTE (`SoftwareVersionsPage.tsx:92-96`), nicht
     * die der Aktionsspalte (`:142`). Die zwei tragen deshalb VERSCHIEDENE Griffe — eine
     * gemeinsame Rolle liesse `toBe(1)` bei zwei Zeilen aus dem falschen Grund gruen werden.
     */
    await mount(
      <VersionenTabelle
        zeilen={[
          zeile({ id: "v-1", wert: "FW 12.3", isTarget: true }),
          zeile({ id: "v-2", wert: "FW 11.0", isTarget: false }),
        ]}
      />,
    );

    const marken = queryAll('[data-rolle="radio-version-zielmarke"]');
    expect(marken.length, "die Ziel-Marke steht nicht genau einmal").toBe(1);
    expect((marken[0]!.textContent ?? "").trim()).toBe("Ziel");
    /* Und sie steht an der RICHTIGEN Zeile, nicht irgendwo in der Tabelle. */
    const zeilen = queryAll("tbody tr.ant-table-row");
    expect(zeilen[0]!.textContent, "die Marke haengt an der falschen Version").toContain("FW 12.3");
    expect(zeilen[0]!.querySelectorAll('[data-rolle="radio-version-zielmarke"]').length).toBe(1);
  });

  it("eine Zeile zeigt entweder aktuelles Ziel oder Als Ziel, nie beides", async () => {
    /*
     * ⛔ 1:1 `SoftwareVersionsPage.tsx:141-152` — ein Ternaer, kein Nebeneinander. Ein Knopf
     * „Als Ziel" an der Zeile, die BEREITS Ziel ist, riefe `versionZielSetzenAction` mit
     * derselben Id: der erste `UPDATE` traefe, der zweite raeumte alle anderen ab, und die
     * Flaeche saehe unveraendert aus (`admin/actions.ts`, `versionZielSetzenAction`). Der
     * Fehler waere also unsichtbar — genau deshalb steht er hier.
     */
    await mount(
      <VersionenTabelle
        zeilen={[
          zeile({ id: "v-1", wert: "FW 12.3", isTarget: true }),
          zeile({ id: "v-2", wert: "FW 11.0", isTarget: false }),
        ]}
      />,
    );

    const zeilen = queryAll("tbody tr.ant-table-row");
    expect(zeilen.length, "die Tabelle rendert ihre Zeilen nicht").toBe(2);

    const marke = (i: number) =>
      zeilen[i]!.querySelectorAll('[data-rolle="radio-version-aktuellesziel"]').length;
    const knopf = (i: number) =>
      zeilen[i]!.querySelectorAll('[data-rolle="radio-version-alsziel"]').length;

    expect([marke(0), knopf(0)], "die Zielzeile zeigt beides oder nichts").toEqual([1, 0]);
    expect([marke(1), knopf(1)], "die Nicht-Zielzeile zeigt beides oder nichts").toEqual([0, 1]);
    expect(
      (zeilen[0]!.querySelector('[data-rolle="radio-version-aktuellesziel"]')?.textContent ?? "").trim(),
    ).toBe("aktuelles Ziel");
  });

  it("die Reihenfolge-Knoepfe sind am Rand deaktiviert", async () => {
    /*
     * ⛔ BEIDE RAENDER, 1:1 `SoftwareVersionsPage.tsx:122` (`index === 0`) und `:129`
     * (`index === rows.length - 1`). Ohne sie schiebt ein Griff die erste Zeile „nach oben":
     * `handleMove` faellt am Bereichsschutz (`:70`) still heraus, die Flaeche quittiert nichts,
     * und der Bedienende haelt die Reihenfolge fuer gespeichert.
     *
     * ⛔ UND DIE MITTLERE ZEILE MUSS BEIDE KNOEPFE OFFEN HABEN — sonst bestuende der Fall auch
     * ueber einer Fassung, die JEDEN Knopf sperrt.
     */
    await mount(
      <VersionenTabelle
        zeilen={[
          zeile({ id: "v-1", wert: "FW 12.3" }),
          zeile({ id: "v-2", wert: "FW 12.0" }),
          zeile({ id: "v-3", wert: "FW 11.0" }),
        ]}
      />,
    );

    const hoch = queryAll<HTMLButtonElement>('[data-rolle="radio-version-hoch"]');
    const runter = queryAll<HTMLButtonElement>('[data-rolle="radio-version-runter"]');
    expect([hoch.length, runter.length], "je Zeile ein Knopf je Richtung").toEqual([3, 3]);

    expect(hoch.map((k) => k.disabled), "der obere Rand").toEqual([true, false, false]);
    expect(runter.map((k) => k.disabled), "der untere Rand").toEqual([false, false, true]);
  });

  it("Verschieben schreibt die vollstaendige Reihenfolge, nicht nur die verschobene Id", async () => {
    /*
     * ⛔ 1:1 `SoftwareVersionsPage.tsx:71-78`: die ganze angezeigte Id-Liste geht hinueber, mit
     * dem Nachbarn getauscht. ⛔ DAS IST KEINE FORMSACHE: `versionenSortierenAction` vergibt
     * `ids.length - index` (`admin/actions.ts`, 1:1 `softwareVersionRepo.ts:131`) — bekaeme sie
     * nur die eine verschobene Id, setzte sie deren `sortOrder` auf 1 und liesse alle anderen
     * stehen. Die Liste saehe danach willkuerlich sortiert aus, und kein Tor saehe etwas.
     */
    await mount(
      <VersionenTabelle
        zeilen={[
          zeile({ id: "v-1", wert: "FW 12.3" }),
          zeile({ id: "v-2", wert: "FW 12.0" }),
          zeile({ id: "v-3", wert: "FW 11.0" }),
        ]}
      />,
    );

    const runter = queryAll<HTMLButtonElement>('[data-rolle="radio-version-runter"]');
    await act(async () => {
      runter[0]!.click();
    });

    expect(sortierenMock, "das Verschieben ruft die Action nicht").toHaveBeenCalledTimes(1);
    expect(sortierenMock.mock.calls[0]![0], "nicht die GANZE Reihenfolge").toEqual([
      "v-2",
      "v-1",
      "v-3",
    ]);
  });

  it("die fuenf Spalten stehen in der Reihenfolge des Bestands", async () => {
    /*
     * ⛔ 1:1 `SoftwareVersionsPage.tsx:84-175`. Die Reihenfolge ist eine 1:1-Pflicht, kein
     * Geschmack — und weil diese Insel keinen mobilen Zweig hat, ist der Tabellenkopf hier
     * WIRKLICH da (anders als in Insel 1 und 2).
     */
    await mount(<VersionenTabelle zeilen={[zeile()]} />);
    expect(queryAll("thead th").map((k) => (k.textContent ?? "").trim())).toEqual([
      "Version",
      "Geräte",
      "Angelegt",
      "Reihenfolge",
      "Aktionen",
    ]);
  });

  it("die Zeile zeigt Wert, Geraetezahl und Anlegezeit als fertige Zeichenketten", async () => {
    /*
     * ⛔ `angelegtText` KOMMT VORFORMATIERT (Bauform-Zulaessigkeitstafel Nr. 7): kein `Date`
     * ueber die Grenze, und die Zone ist die des Servers (`_lib/anzeige.ts`,
     * `datumMitUhrzeit`). Rechnete die Insel selbst, entschieden Server und Browser an der
     * Tagesgrenze verschieden.
     */
    await mount(
      <VersionenTabelle zeilen={[zeile({ wert: "FW 9.1", deviceCount: 7, angelegtText: "01.02.2026, 08:00" })]} />,
    );
    expect(query('[data-rolle="radio-version-wert"]').textContent).toBe("FW 9.1");
    expect(query('[data-rolle="radio-version-anzahl"]').textContent).toBe("7");
    expect(query('[data-rolle="radio-version-angelegt"]').textContent).toBe("01.02.2026, 08:00");
  });

  it("die vier Knoepfe und die Ziel-Marke tragen ihre Zeichen", async () => {
    /*
     * ✅ DIE FUENF ZEICHENSTELLEN DES BESTANDS (`SoftwareVersionsPage.tsx:93`, `:120`, `:127`,
     * `:146`, `:155`/`:167`), gesetzt am 2026-08-28. ⛔ GEMESSEN AM `data-zeichen`-ATTRIBUT und
     * nicht an einem `<svg>`-Zaehler: antd bringt eigene SVGs mit, ein Zaehler waere gruen,
     * ohne dass DIESES Zeichen da stuende.
     * ⛔ ZWEI ZEILEN, WEIL DIE AKTIONSSPALTE ZWEI TERNAERE FUEHRT: `isTarget` entscheidet
     * zwischen Marke und „Als Ziel"-Knopf, `deviceCount` zwischen dem GESPERRTEN Loeschknopf
     * (in seiner `<span>`-Huelle) und dem mit Rueckfrage. Beide Loeschzweige tragen das
     * Zeichen; mit nur einer Zeile bliebe je einer der vier Faelle ungeprueft.
     */
    await mount(
      <VersionenTabelle
        zeilen={[
          zeile({ id: "v-1", isTarget: true, deviceCount: 3 }),
          zeile({ id: "v-2", isTarget: false, deviceCount: 0 }),
        ]}
      />,
    );

    expect(
      query('[data-rolle="radio-version-zielmarke"] [data-zeichen]').getAttribute("data-zeichen"),
      "der Ziel-Marke fehlt ihr Zeichen",
    ).toBe("ziel");
    expect(
      query('[data-rolle="radio-version-hoch"] [data-zeichen]').getAttribute("data-zeichen"),
    ).toBe("pfeil-oben");
    expect(
      query('[data-rolle="radio-version-runter"] [data-zeichen]').getAttribute("data-zeichen"),
    ).toBe("pfeil-unten");
    expect(
      query('[data-rolle="radio-version-alsziel"] [data-zeichen]').getAttribute("data-zeichen"),
    ).toBe("haken");
    expect(
      queryAll('[data-rolle="radio-version-loeschen"] [data-zeichen]').map((z) =>
        z.getAttribute("data-zeichen"),
      ),
      "einem der zwei Loeschzweige fehlt der Papierkorb",
    ).toEqual(["papierkorb", "papierkorb"]);
  });
});

describe("radio-Versionen: das Anlegefeld", () => {
  it("ein leerer oder nur aus Leerraum bestehender Wert laeuft gar nicht los", async () => {
    /*
     * ⛔ 1:1 `SoftwareVersionsPage.tsx:28-29` (`const value = newValue.trim(); if (!value)
     * return;`). ⚠️ Die WAHRHEIT ist die serverseitige Pruefung in `versionAnlegenAction`
     * (`admin/actions.ts`) — „eine Regel, die nur im Client steht, ist keine Regel"
     * (`Spec:3583-3585`). Diese hier spart den Rundlauf.
     */
    await mount(<NeuVersion />);
    await click('[data-rolle="radio-neuversion-anlegen"]');
    expect(anlegenMock, "der leere Wert ging an den Server").not.toHaveBeenCalled();

    /*
     * ⛔ UEBER `fill` UND NICHT UEBER EINE ZUWEISUNG AN `value`: React haengt an den
     * value-Setter einen eigenen Tracker, eine direkte Zuweisung liest er als „unveraendert"
     * und `onChange` bliebe aus (`src/app/m/qr/_lib/test-dom.tsx:128-137`). Gemessen im
     * ersten Lauf dieser Aufgabe: das Feld blieb leer und der Fall meldete „0 times".
     */
    await fill('[data-rolle="radio-neuversion-eingabe"]', "   ");
    await click('[data-rolle="radio-neuversion-anlegen"]');
    expect(anlegenMock, "nur Leerraum ging an den Server").not.toHaveBeenCalled();
  });

  it("der gesendete Wert ist der GETRIMMTE, und nach dem Erfolg ist das Feld leer", async () => {
    /*
     * ⛔ GETRIMMT — 1:1 `SoftwareVersionsPage.tsx:28`. ⛔ UND DAS FELD WIRD GELEERT (`:32`):
     * bliebe der Text stehen, waere der naechste Griff auf „Anlegen" ein Duplikat, und die
     * Flaeche antwortete mit „Diese Version existiert bereits" auf eine Eingabe, die niemand
     * gemacht hat.
     */
    await mount(<NeuVersion />);
    await fill('[data-rolle="radio-neuversion-eingabe"]', "  FW 12.3  ");
    await click('[data-rolle="radio-neuversion-anlegen"]');

    expect(anlegenMock).toHaveBeenCalledTimes(1);
    expect(anlegenMock.mock.calls[0]![0], "der Wert ging ungetrimmt hinueber").toBe("FW 12.3");
    expect(
      query<HTMLInputElement>('[data-rolle="radio-neuversion-eingabe"]').value,
      "das Feld haelt den bereits angelegten Wert fest",
    ).toBe("");
  });

  it("ein abgelehnter Wert zeigt den Text der Action und bleibt im Feld stehen", async () => {
    /*
     * ⛔ DER 409-TEXT KOMMT AUS `admin/actions.ts` (`VERSION_VORHANDEN`, woertlich
     * `SoftwareVersionsPage.tsx:37`) und wird hier NICHT ein zweites Mal geschrieben.
     * ⛔ UND DER WERT BLEIBT STEHEN: nur der Erfolgsfall leert (`:32` steht INNERHALB des
     * `try`, hinter dem `await`) — sonst tippt der Bedienende seine Korrektur neu.
     */
    anlegenMock.mockResolvedValue({ ok: false, fehler: "Diese Version existiert bereits" });
    await mount(<NeuVersion />);
    await fill('[data-rolle="radio-neuversion-eingabe"]', "FW 12.3");
    await click('[data-rolle="radio-neuversion-anlegen"]');

    expect(query('[data-rolle="radio-neuversion-fehler"]').textContent).toBe(
      "Diese Version existiert bereits",
    );
    expect(query<HTMLInputElement>('[data-rolle="radio-neuversion-eingabe"]').value).toBe("FW 12.3");
  });

  it("Enter im Eingabefeld legt an — der Hauptweg auf einer Tastaturflaeche", async () => {
    /*
     * ⛔ `onPressEnter={anlegen}` (`NeuVersion.tsx`, 1:1 `SoftwareVersionsPage.tsx:193`) war
     * bis REVIEW-V19, Fund **F3**, UNBEWACHT: die Zeile entfernt → `Test Files 1 passed (1)` ·
     * `Tests 19 passed (19)`, gemessen am 2026-08-26. Auf einer Tastaturflaeche ist Enter der
     * Hauptweg des Anlegens, und sein Verlust waere fuer typecheck, lint und build unsichtbar.
     *
     * ⚠️ `keydown` MIT `bubbles: true`: Reacts synthetisches Ereignis entsteht am Wurzelknoten
     * des Baums, ein nicht steigendes Ereignis erreicht die Komponente nie.
     *
     * ⛔ NUR `key`, KEIN `keyCode` — und das ist AUFGESCHLAGEN, nicht angenommen (REVIEW-V19,
     * Fund **F8**): das Bauteil hinter antds `Input` liest ausschliesslich `e.key`
     * (`node_modules/…/@rc-component/input/es/Input.js:112`,
     * `if (onPressEnter && e.key === 'Enter' && !keyLockRef.current && !e.nativeEvent.isComposing)`),
     * gemessen an der installierten Fassung `@rc-component/input@1.3.1` unter `antd@6.5.3`.
     * ⚠️ Bis zum 2026-08-26 stand hier zusaetzlich `keyCode: 13` mit der Begruendung, antd habe
     * „ueber die Versionen beide Formen gelesen" — eine Behauptung OHNE `datei:zeile` und ohne
     * Last: `keyCode: 13` entfernt ergab `Tests 25 passed (25)`, null rot. Was hier fuer diese
     * Fassung gemessen ist, steht jetzt da; ueber aeltere antd-Versionen sagt dieser Fall nichts.
     */
    await mount(<NeuVersion />);
    await fill('[data-rolle="radio-neuversion-eingabe"]', "FW 12.3");
    await act(async () => {
      query<HTMLInputElement>('[data-rolle="radio-neuversion-eingabe"]').dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", bubbles: true }),
      );
    });

    expect(anlegenMock, "Enter im Feld legt nicht an").toHaveBeenCalledTimes(1);
    expect(anlegenMock.mock.calls[0]![0], "Enter sendet einen anderen Wert als der Knopf").toBe(
      "FW 12.3",
    );
  });
  it("das Anlegen traegt sein Pluszeichen", async () => {
    // ✅ 1:1 `SoftwareVersionsPage.tsx:196` (`icon={<FiPlus />}`), gesetzt am 2026-08-28.
    await mount(<NeuVersion />);

    expect(
      query('[data-rolle="radio-neuversion-anlegen"] [data-zeichen]').getAttribute("data-zeichen"),
    ).toBe("plus");
  });
});

describe("radio-Versionen: die VIER Fehlerpfade der Flaeche", () => {
  /*
   * ⛔ ALLE VIER, NICHT EINER — REVIEW-V19, Fund **F2**, und der Beleg ist eine Messung vom
   * 2026-08-26: der frueher hier stehende Einzelfall setzte ausschliesslich `zielMock` auf
   * `{ ok: false }`. Wer `if (!ergebnis.ok) setFehler(ergebnis.fehler);` aus `loeschen` ODER
   * aus `verschieben` entfernte, bekam `Test Files 1 passed (1)` · `Tests 19 passed (19)` —
   * ⛔ NULL ROT, ein still fehlschlagender Loesch- und Sortiervorgang, und die Flaeche
   * quittierte nichts.
   *
   * ⛔ DER SCHADEN IST KONKRET UND NICHT HYPOTHETISCH: `versionLoeschenAction` gibt bei einem
   * Wettlauf „Version wird noch von N Gerät(en) genutzt" zurueck — ebenfalls ein Text der
   * 1:1-Tafel Abschnitt E (`.superpowers/sdd/planteil4/briefs/KOPF.md:1327`,
   * `SoftwareVersionsPage.tsx:60`). Genau der Fall, um dessentwillen die Loeschsperre
   * ueberhaupt existiert, war unbewacht.
   *
   * ⛔ DIE TEXTE DER FEHLSCHLAEGE GEHOEREN `admin/actions.ts`, UND DIE FLAECHE ERFINDET KEINEN
   * ZWEITEN — das ist der Pruefgegenstand (Entscheidung E13, `planteil3/briefs/KOPF.md`): die
   * Tafel setzt jeden Text als MOCK-Antwort und misst, dass GENAU ER an der Flaeche ankommt.
   * ⚠️ DASS DIE TEXTE HIER AUSGESCHRIEBEN STEHEN, IST HAUSFORM UND KEIN ZWEITER WAHRHEITSORT:
   * ein Import waere tautologisch (dieselbe Wahl und derselbe Grund wie am Sperrfall oben, der
   * „Wird von 3 Gerät(en) genutzt — erst umstellen" ebenfalls ausschreibt, und wie im Kopf von
   * `UPDATE_TEXTE`, `software/UpdateSuche.tsx:87-90`).
   *
   * ⚠️ DIE VIER PFADE SIND NICHT SYMMETRISCH, und deshalb traegt jeder seinen EIGENEN
   * Ausloeser statt eines gemeinsamen Klicks: `loeschen` sitzt hinter einem `Popconfirm` (ein
   * Griff auf den Knopf OEFFNET nur die Rueckfrage, die Action laeuft erst am Ja-Knopf im
   * Portal), `verschieben` braucht MINDESTENS ZWEI Zeilen (sonst sind beide
   * Reihenfolge-Knoepfe am Rand deaktiviert und nichts laeuft los), und `anlegen` lebt in
   * `NeuVersion` mit eigenem Fehlerabsatz.
   */
  type Fehlerpfad = {
    /** Der Name der Action — er wird gegen die GEFUNDENE Menge geprueft, siehe unten. */
    action: string;
    mock: typeof zielMock;
    fehler: string;
    griff: string;
    ausloesen: () => Promise<void>;
  };

  const FEHLERPFADE: Fehlerpfad[] = [
    {
      action: "versionZielSetzenAction",
      mock: zielMock,
      fehler: "Zielversion konnte nicht gesetzt werden",
      griff: '[data-rolle="radio-versionen-fehler"]',
      ausloesen: async () => {
        await mount(<VersionenTabelle zeilen={[zeile({ isTarget: false })]} />);
        await click('[data-rolle="radio-version-alsziel"]');
      },
    },
    {
      action: "versionLoeschenAction",
      /** ⛔ Woertlich der Text, den `versionLoeschenAction` bei haengenden Geraeten zurueckgibt
       *  (1:1-Tafel Abschnitt E, `SoftwareVersionsPage.tsx:60`). */
      mock: loeschenMock,
      fehler: "Version wird noch von 2 Gerät(en) genutzt",
      griff: '[data-rolle="radio-versionen-fehler"]',
      ausloesen: async () => {
        await mount(<VersionenTabelle zeilen={[zeile({ deviceCount: 0 })]} />);
        await click('[data-rolle="radio-version-loeschen"]');
        await clickPortal(".ant-popconfirm .ant-btn-primary");
      },
    },
    {
      action: "versionenSortierenAction",
      mock: sortierenMock,
      fehler: "Reihenfolge konnte nicht gespeichert werden",
      griff: '[data-rolle="radio-versionen-fehler"]',
      ausloesen: async () => {
        await mount(
          <VersionenTabelle
            zeilen={[zeile({ id: "v-1", wert: "FW 12.3" }), zeile({ id: "v-2", wert: "FW 12.0" })]}
          />,
        );
        await clickElement(queryAll<HTMLButtonElement>('[data-rolle="radio-version-runter"]')[0]!);
      },
    },
    {
      action: "versionAnlegenAction",
      mock: anlegenMock,
      fehler: "Diese Version existiert bereits",
      griff: '[data-rolle="radio-neuversion-fehler"]',
      ausloesen: async () => {
        await mount(<NeuVersion />);
        await fill('[data-rolle="radio-neuversion-eingabe"]', "FW 12.3");
        await click('[data-rolle="radio-neuversion-anlegen"]');
      },
    },
  ];

  it.each(FEHLERPFADE)(
    "$action: ein Fehlschlag zeigt IHREN Text, nicht einen erfundenen",
    async (pfad) => {
      pfad.mock.mockResolvedValue({ ok: false, fehler: pfad.fehler });
      await pfad.ausloesen();
      expect(query(pfad.griff).textContent, `${pfad.action}: der Fehlschlag bleibt stumm`).toBe(
        pfad.fehler,
      );
    },
  );

  it("die Tafel deckt JEDE Action der Insel — die Menge ist gefunden, nicht aufgezaehlt", () => {
    /*
     * ⛔ RULING **R-V11-1**: die Sollwerttafel steht auf der EINEN Seite, die GEMESSENE Menge
     * auf der anderen. Eine fuenfte Action in einer der Inseldateien — oder eine fuenfte
     * Datei, die eine ruft — macht diesen Fall rot, statt lautlos ohne Fehlerpfad-Fall zu
     * bleiben. ⚠️ Das ist die Klasse, an der F2 entstanden ist: der alte Einzelfall LISTETE
     * einen Mock, statt die Menge zu durchlaufen.
     */
    expect(
      FEHLERPFADE.map((pfad) => pfad.action).sort(),
      "eine Action der Insel hat keinen Fehlerpfad-Fall",
    ).toEqual(actionsDerInsel());
  });
});

describe("radio-Versionen: die Bauform der Insel und ihrer Seite", () => {
  it("jede Datei der Insel traegt use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 1 UND FALLE 9 (Bauform-Zulaessigkeitstafel Nr. 1 und 3): `Space.Compact` ist ein
     * Compound-Zugriff — in einer Server Component HTTP 500 —, und die Tabelle traegt vier
     * `render`-Funktionen. Beides ist fuer typecheck, lint und build unsichtbar.
     * ⛔ DIE MENGE WIRD GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    for (const datei of gefunden) {
      const quelle = readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8");
      expect(quelle.trimStart().split("\n")[0]!.trim(), `${datei}: keine Direktive`).toMatch(
        /^["']use client["'];?$/,
      );
    }
  });

  it("jede Datei der Flaeche traegt GENAU EINE benannte Textliste, und der Satz der E-Tafel steht darin", () => {
    /*
     * ⛔ **GLOBAL CONSTRAINT, 1:1-TAFEL ABSCHNITT E** (`Spec:4815-4832`;
     * `.superpowers/sdd/planteil4/briefs/KOPF.md:1340`, woertlich): „Sie liegen in EINER
     * benannten Konstantenliste je Flaeche, nicht inline verstreut — sonst ist die naechste
     * Formulierungsaenderung eine Suche ueber neun Dateien."
     *
     * ⛔ DIESER FALL IST NEU (REVIEW-V19, Fund **F1**) UND DER ERSTE SEINER ART IM MODUL. Die
     * zwei Schwesterinseln FUEHREN ihre Liste (`software/UpdateSuche.tsx:91` `UPDATE_TEXTE`,
     * `import/ImportAssistent.tsx:113` `IMPORT_TEXTE`), aber ⛔ KEINE Testdatei des Moduls
     * BEWACHT die Bauform. ⛔ DIE MESSUNG DAZU LIEF UEBER DIE KLASSE UND NICHT UEBER EINE
     * DATEILISTE (Ruling **R-V11-3**: „Ein Gegen-`grep` mit Dateiliste prueft die Liste, nicht
     * die Klasse") — am 2026-08-26, roh:
     * `/usr/bin/grep -rn "_TEXTE" src/app/m/radio --include="*.test.ts" --include="*.test.tsx"`
     * → die EINZIGEN Treffer im ganzen Modul stehen in DIESER Datei, in diesem Block.
     * ⚠️ Genau in dieser Luecke stand der Satz der E-Tafel hier inline im JSX: der WORTLAUT
     * war bewacht (der Sperrfall oben prueft ihn zeichengleich), die BAUFORM nicht. Ruling
     * **R-V11-1**: wer eine Zusicherung ueber dem Bestand schreibt, schuldet die Mutation, die
     * sie rot macht.
     *
     * ⛔ **WAS DIESER FALL MISST, STEHT IN SEINEM NAMEN — UND NICHT MEHR** (REVIEW-V19, Fund
     * **F7**). Er misst die STRUKTUR (genau eine Liste je Datei) und EINEN Satz. Bis zum
     * 2026-08-26 hiess er „die Bildschirmtexte stehen in EINER benannten Liste je Datei, nicht
     * inline" und behauptete damit alle EINUNDZWANZIG Eintraege der drei Listen; gemessen und
     * belegt: `title: VERSIONEN_TEXTE.spalteVersion` → `title: "Version"`, Liste unangetastet,
     * ergab `Tests 25 passed (25)` — NULL ROT. Die Klasse bewachen die zwei Faelle darunter.
     *
     * ⚠️ ER LAEUFT UEBER DIE GEFUNDENE DATEIMENGE PLUS DIE SEITE: die Seite liegt jenseits der
     * RSC-Grenze und traegt ihre eigene Liste (`SEITEN_TEXTE`), sie ist aber dieselbe Flaeche
     * fuer den, der eine Formulierung aendert.
     */
    for (const pfad of flaechenDateien()) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      expect(
        quelle.match(new RegExp(TEXTLISTE_KOPF.source, "g")) ?? [],
        `${pfad}: keine ODER mehr als eine benannte Textliste`,
      ).toHaveLength(1);
      expect(
        textListe(quelle).gefunden,
        `${pfad}: die Liste hat keinen Fuss \`${TEXTLISTE_FUSS}\` — die zwei Faelle darunter laesen ins Leere`,
      ).toBe(true);
    }

    /*
     * ⛔ UND DER SATZ DER E-TAFEL STEHT WIRKLICH IN DER LISTE, NICHT DANEBEN: genau einmal in
     * der Datei, und VOR dem `} as const;`, das die Liste schliesst. Wer ihn zurueck ins JSX
     * schreibt, landet hinter dieser Klammer — dann ist dieser Fall rot. ⚠️ Gelesen wird der
     * KOMMENTARFREIE Quelltext, sonst zaehlte eine Begruendung, die den Satz zitiert, mit.
     */
    const tabelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    const stellen = [...tabelle.matchAll(/Wird von /g)].map((treffer) => treffer.index);
    expect(stellen, "der Satz der 1:1-Tafel Abschnitt E steht nicht genau einmal").toHaveLength(1);
    expect(
      stellen[0]! < tabelle.indexOf(TEXTLISTE_FUSS),
      "der Satz steht ausserhalb der benannten Liste — inline im JSX",
    ).toBe(true);
  });

  it("kein Wert der Textliste steht ein zweites Mal im Quelltext", () => {
    /*
     * ⛔ **DIE ERSTE DER ZWEI KLASSEN-HAELFTEN ZU FUND F7** (REVIEW-V19). Der Fall darueber
     * bewacht EINEN von einundzwanzig Texten; dieser bewacht ALLE — und zwar ueber die
     * gefundene Menge der Werte, nicht ueber eine Aufzaehlung (Ruling **R-V11-1**).
     *
     * ⛔ DIE FORM IST BILLIG UND FINDET DENNOCH: jeder Wert der Liste kommt im
     * kommentarfreien Quelltext seiner Datei GENAU EINMAL vor — naemlich in der Liste. Wer
     * einen davon inline ins JSX zurueckschreibt und den Listeneintrag stehen laesst
     * (der dann TOTE Eintrag faellt weder `typecheck` noch `lint` auf, weil das Objekt als
     * ganzes weiter benutzt wird), macht daraus ZWEI.
     *
     * ⛔ GEZAEHLT WIRD DAS LITERAL MITSAMT SEINEN ANFUEHRUNGSZEICHEN, nicht der blosse Text —
     * sonst zaehlte `"Version"` auch in `"Version wirklich löschen?"` mit und der Fall waere
     * auf dem korrekten Bestand rot.
     *
     * ⚠️ DIE ZWEI ZAEHLUNGEN DIESES BLOCKS SIND SEINE SICHERUNG GEGEN „GRUEN UEBER NICHTS":
     * ohne `gefunden` und ohne die Untergrenze an `werte` liefe eine gedriftete Listengrenze
     * still durch.
     */
    for (const pfad of flaechenDateien()) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      const { werte, gefunden } = textListe(quelle);
      expect(gefunden, `${pfad}: keine benannte Textliste gefunden`).toBe(true);
      expect(werte.length, `${pfad}: die Textliste ist leer — dieser Fall liefe ins Leere`).toBeGreaterThan(0);
      for (const wert of werte) {
        expect(
          quelle.split(wert).length - 1,
          `${pfad}: ${wert} steht auch AUSSERHALB der benannten Liste — inline zurueckgeschrieben`,
        ).toBe(1);
      }
    }
  });

  it("kein Bildschirmtext steht ausserhalb der Textliste — auch kein neu erfundener", () => {
    /*
     * ⛔ **DIE ZWEITE KLASSEN-HAELFTE ZU FUND F7** (REVIEW-V19), und sie faengt, was der Fall
     * darueber strukturell NICHT fangen kann: einen NEU hinzugefuegten Bildschirmtext, der nie
     * einen Listeneintrag hatte. Gemessen am 2026-08-26 an drei Formen, alle mit stehender
     * Liste und alle vorher NULL ROT: `title: "Version"`, `{NEUVERSION_TEXTE.anlegen}` →
     * blankes `Anlegen` als JSX-Textkind, `SEITEN_TEXTE.hinweis` inline in den `Alert`.
     *
     * ⛔ DREI ZWEIGE, WEIL EIN TEXT AUF DREI WEGEN INS JSX KOMMT — und jeder Zweig hat seine
     * eigene Sonde:
     *   1. ein LITERAL, das nach Bildschirmtext aussieht: es traegt ein Leerzeichen, ein
     *      Zeichen ausserhalb des ASCII-Satzes (Umlaut, Gedankenstrich, typografische
     *      Anfuehrungszeichen) ODER einen Grossbuchstaben am Anfang. ⛔ AM 2026-08-26 GEMESSEN:
     *      ausserhalb der drei Listen steht in dieser Flaeche KEIN einziges solches Literal —
     *      Importpfade, Spaltenschluessel (`"wert"`, `"aktionen"`), antd-Werte (`"right"`,
     *      `"success"`, `"max-content"`) und die Griffe (`data-rolle="radio-…"`) sind
     *      allesamt klein geschrieben und rein ASCII. Die EINE Ausnahme ist die
     *      Bauform-Direktive, und sie steht namentlich unten.
     *   2. ein TEXTFUEHRENDES Attribut oder Feld mit einem Literal — auch in der Form
     *      `title={"…"}`, die ohne das `\{?` durchschluepfte.
     *   3. ein JSX-TEXTKIND, das blanker Text ist statt `{LISTE.schluessel}` — die Form, die
     *      weder Zweig 1 (keine Anfuehrungszeichen) noch Zweig 2 (kein Attribut) sieht.
     *
     * ⚠️ **WAS AUCH DIESE DREI ZWEIGE NICHT FANGEN**, benannt statt verschwiegen: ein
     * einwortiger, klein geschriebener ASCII-Text in Anfuehrungszeichen an einer Stelle, die
     * kein textfuehrendes Attribut ist — `<Button>{"ok"}</Button>`. Er ist von einem
     * Spaltenschluessel nicht zu unterscheiden, und ein Zweig darueber waere auf dem heutigen,
     * KORREKTEN Bestand rot (er traegt `"wert"`, `"right"`, `"id"`). ⬜ Offen und ohne
     * Eigentuemer in diesem Fenster.
     */
    for (const pfad of flaechenDateien()) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      const { block, gefunden } = textListe(quelle);
      expect(gefunden, `${pfad}: keine benannte Textliste gefunden`).toBe(true);
      const aussen = quelle.replace(block, "");
      expect(
        aussen.length,
        `${pfad}: der Listenblock deckt die ganze Datei — der Fall liefe ins Leere`,
      ).toBeGreaterThan(0);

      const verdacht = [...aussen.matchAll(ZEICHENKETTE)]
        .map((treffer) => treffer[0])
        .filter((literal) => BILDSCHIRMVERDACHT.test(literal.slice(1, -1)))
        .filter((literal) => !BAUFORM_DIREKTIVEN.includes(literal));
      expect(verdacht, `${pfad}: ein Bildschirmtext steht ausserhalb der benannten Liste`).toEqual(
        [],
      );

      expect(
        [...aussen.matchAll(TEXTFUEHRENDES_FELD)].map((treffer) => treffer[0]),
        `${pfad}: ein textfuehrendes Attribut traegt ein Literal statt eines Listeneintrags`,
      ).toEqual([]);

      expect(
        [...aussen.matchAll(JSX_TEXTKIND)].map((treffer) => treffer[1]!.trim()),
        `${pfad}: ein JSX-Textkind ist blanker Text statt eines Listeneintrags`,
      ).toEqual([]);
    }
  });

  it("kein Bedienelement traegt size", () => {
    /*
     * ⛔ **FALLE 4 ALS QUELLTEXT-ZUSICHERUNG — der einzige Weg, sie in Vitest zu fassen.** Der
     * Bestand traegt `size="small"` an FUENF Stellen (`SoftwareVersionsPage.tsx:119`, `:126`,
     * `:145`, `:155`, `:167`); sie entfallen ersatzlos, weil die Verwaltung seit dem 2026-08-28
     * auf `SCHREIBTISCHDICHTE` mit `controlHeight: 32` laeuft (`core/theme/theme.ts`), auch auf
     * dem Telefon. Platz schafft `scroll={{ x: "max-content" }}`.
     *
     * ⚠️ ER IST NICHT DER EINZIGE WAECHTER, UND DAS IST ABSICHT: derselbe Scan laeuft modulweit
     * ueber JEDE `.tsx` (`_ui/AusleihRahmen.test.tsx:210-214`). Dieser hier steht an der
     * Flaeche, deren Bestand die fuenf Fundstellen traegt — er nennt sie beim Namen, wo der
     * modulweite nur „irgendwo" sagen kann.
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    for (const datei of gefunden) {
      const quelle = ohneKommentare(readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8"));
      expect(quelle, `${datei}: ein size-Attribut an einem antd-Bedienelement (Falle 4)`).not.toMatch(
        /\bsize=\{?["']?(?:small|large)/,
      );
    }
    const tabelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(tabelle, "ohne scroll bricht die Tabelle auf 390 px").toMatch(
      /scroll=\{\{ x: "max-content" \}\}/,
    );
    expect(tabelle, "die Tabelle blaettert selbst — der Bestand tut es nicht (:206)").toMatch(
      /pagination=\{false\}/,
    );
  });

  it("keine Datei der Insel zieht _db/ oder drizzle-orm in den Browser", () => {
    /*
     * ⛔ DER FEHLER WAR IN V13 EINMAL GEBAUT, und alle fuenf Tore blieben gruen. ⛔ HIER IST
     * DIE GEFAHR NAMENTLICH: `_lib/lesepfade/versionen.ts` traegt den Typ `VersionZeile` UND
     * importiert `_db/client` und `_db/schema` als WERT — der Bezug darauf MUSS ein
     * `import type` sein, und ein `import type` ist eine EIGENE Anweisung, kein `type` in
     * einer gemischten Klammer (`_lib/csv/klassifizieren.ts:6-9`).
     *
     * ⛔ ER FOLGT DEM IMPORTGRAPHEN, ER LIEST NICHT NUR DIE WURZELN (Ruling R-V11-3).
     * ⚠️ ER IST DIE UNTERGRENZE, NICHT DER BEWEIS: was das Bundle wirklich enthaelt, zeigt
     * erst `pnpm build` (V23).
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    const WURZELN = gefunden.map((datei) => `${INSEL_ORDNER}/${datei}`);

    const BEZUG = /\b(?:import|export)\s+(type\s+)?([^;]*?)\s*from\s*["']([^"']+)["']/g;

    function aufloesen(vonDatei: string, spezifizierer: string): string | null {
      if (!spezifizierer.startsWith(".")) return null;
      const basis = normalize(join(dirname(vonDatei), spezifizierer));
      for (const kandidat of [`${basis}.ts`, `${basis}.tsx`, join(basis, "index.ts")]) {
        if (existsSync(kandidat)) return kandidat;
      }
      return null;
    }

    const gesehen = new Set<string>(WURZELN);
    const offen = [...WURZELN];
    const verstoesse: string[] = [];
    const gelesen = new Set<string>();

    const istServerModul = (datei: string): boolean =>
      /^["']use server["'];?$/.test(readFileSync(datei, "utf8").trimStart().split("\n")[0]!.trim());

    while (offen.length > 0) {
      const datei = offen.pop()!;
      if (istServerModul(datei)) continue;
      const quelle = ohneKommentare(readFileSync(datei, "utf8"));
      gelesen.add(datei);
      for (const treffer of quelle.matchAll(BEZUG)) {
        const nurTyp = treffer[1] !== undefined;
        const spezifizierer = treffer[3]!;
        if (nurTyp) continue;
        if (/^(?:drizzle-orm|node:|better-sqlite3|next\/headers)(?:\/|$)/.test(spezifizierer)) {
          verstoesse.push(`${datei}: Wertimport von ${spezifizierer}`);
          continue;
        }
        const ziel = aufloesen(datei, spezifizierer);
        if (ziel === null) continue;
        if (/[/\\]_db[/\\]/.test(ziel)) {
          verstoesse.push(`${datei}: Wertimport aus _db/ (${spezifizierer})`);
          continue;
        }
        if (!gesehen.has(ziel)) {
          gesehen.add(ziel);
          offen.push(ziel);
        }
      }
    }

    expect(
      WURZELN.filter((wurzel) => !gelesen.has(wurzel)),
      "der Walker hat eine Wurzel nicht gelesen — er ist nicht gelaufen",
    ).toEqual([]);
    expect(verstoesse).toEqual([]);
  });

  it("die Seite reicht KEINE Funktion und KEIN Date ueber die Grenze", () => {
    /*
     * Bauform-Zulaessigkeitstafel Nr. 6 und 7 (`Spec:4495-4497`, `Spec:4536-4539`): ueber die
     * Insel-Grenze gehen nur serialisierbare, VORFORMATIERTE Werte; die vier Actions
     * importieren die zwei Inseldateien DIREKT.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Action als Prop").not.toMatch(/=\{[^}]*Action\b/);
    expect(quelle, "eine Pfeilfunktion als Prop").not.toMatch(/=\{[^}]*=>/);
    expect(quelle, "ein Date in der Seite").not.toMatch(/\bnew Date\(/);
  });

  it("der erklaerende Hinweis der Seite steht woertlich wie im Bestand", () => {
    /*
     * ⛔ WOERTLICH `SoftwareVersionsPage.tsx:185` (1:1-Tafel Abschnitt E, `Spec:4815-4832`:
     * „Diese Saetze sind selbst der Beleg — nicht paraphrasieren"). Er traegt seine
     * typografischen Anfuehrungszeichen und seinen Gedankenstrich; es ist ein Bildschirmtext,
     * kein Bezeichner.
     *
     * ⛔ ER IST DIE EINZIGE STELLE, AN DER DIE FLAECHE ERKLAERT, dass eine neu angelegte
     * Version NICHT automatisch zum Ziel wird (`admin/actions.ts`,
     * `versionAnlegenAction`; `_db/schema.ts:80-82`). Ohne ihn wartet der Bedienende auf eine
     * Wirkung, die nie eintritt.
     */
    const quelle = readFileSync(QUELLE_SEITE, "utf8");
    expect(quelle).toContain(
      "Die als „Ziel“ markierte Version bestimmt, welche Geräte als „aktuell“ gelten. Neu angelegte Versionen werden nicht automatisch zum Ziel — die Reihenfolge dient nur der Anzeige.",
    );
    /*
     * ⛔ UND ER TRAEGT DEN GRIFF, AUF DEN DER PLAYWRIGHT-FALL ZEIGT
     * (`e2e/radio-verwaltung.spec.ts`, Fall 8). Ohne diese Zeile haette der e2e-Griff KEINEN
     * Waechter auf der Vitest-Seite: er faellt erst in V23 auf, und dann als Fehler, der nach
     * einem gebrochenen Abruf aussieht statt nach einem umbenannten Griff. ⛔ Die Alternative
     * — ein Griff auf eine antd-INTERNE Klasse — ginge bei einem Bauteil-Umbau still daneben.
     */
    expect(
      ohneKommentare(quelle),
      "der Hinweis traegt keinen eigenen Griff — der Playwright-Fall greift ins Leere",
    ).toMatch(/data-rolle="radio-versionen-hinweis"/);
  });

  it("weder die Insel noch die Seite ruft message oder App.useApp", () => {
    /*
     * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), im Modul mehrfach ausgeschrieben
     * (`_ui/RueckgabeDialog.tsx:311-315`, `geraete/NeuGeraetModal.tsx:40-45`,
     * `geraete/[id]/GeraetLoeschen.tsx:46-49`): in `src/app` gibt es keinen Aufruf von
     * `message.*` oder `App.useApp()`. ⚠️ Damit entfallen die drei Erfolgsmeldungen des
     * Bestands — „Version angelegt" (`SoftwareVersionsPage.tsx:33`), „Zielversion gesetzt"
     * (`:46`) und „Version gelöscht" (`:55`) — als BENANNTE Abweichung. Die FEHLERtexte
     * stehen dafuer am Ort der Aktion und kommen aus `admin/actions.ts`.
     *
     * ⛔ DIESER FALL IST DIE MESSUNG DAZU. Bis heute stand die Zusage nur in Kommentaren.
     */
    for (const pfad of [QUELLE_TABELLE, QUELLE_NEU, QUELLE_SEITE]) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      expect(quelle, `${pfad}: ein Toast (Entscheidung E6)`).not.toMatch(
        /\bmessage\s*\.\s*(?:success|error|warning|info)\b|\bApp\s*\.\s*useApp\s*\(/,
      );
    }
  });

  it("die Seite legt keine Spaltendefinition an und traegt keine Tabelle", () => {
    /*
     * ⛔ **FALLE 9, UND SIE IST DIE ZENTRALE ZEILE DIESES PLANTEILS**
     * (Bauform-Zulaessigkeitstafel Nr. 1): `columns={[{ render: fn }]}` aus einer Server
     * Component ist `Error: Functions cannot be passed directly to Client Components` — BEIM
     * ABRUF, nicht beim Uebersetzen. In jsdom gibt es keine RSC-Grenze; dieser Quelltext-Scan
     * ist deshalb der einzige Vitest-Waechter, und der echte Abruf ist V23s Fall 8.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Spaltendefinition in der Server Component").not.toMatch(/\bcolumns\s*=/);
    expect(quelle, "eine antd-Tabelle in der Server Component").not.toMatch(/<Table\b/);
  });
});
