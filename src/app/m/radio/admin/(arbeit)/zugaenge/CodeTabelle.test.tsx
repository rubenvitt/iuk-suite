// @vitest-environment jsdom
// src/app/m/radio/admin/(arbeit)/zugaenge/CodeTabelle.test.tsx
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join, normalize, sep } from "node:path";

/**
 * INSEL 8 — DIE ZUGANGSVERWALTUNG (`Spec:4510`, §5.13; Aufgabe V20).
 *
 * ⛔ `// @vitest-environment jsdom` ALS ERSTE ZEILE. `vitest.config.ts:7` setzt
 * `environment: "node"` global und kennt kein `environmentMatchGlobs`; ohne die Zeile stirbt
 * jeder `mount()` an `document is not defined` (Vorbild `_ui/GeraeteListe.test.tsx:1`).
 *
 * ⛔ DAS ETABLIERTE HARNESS, KEIN ZWEITES (`CLAUDE.md`, „Tests"):
 * `src/app/m/qr/_lib/test-dom.tsx`.
 *
 * ⚠️ DER BLINDE FLECK, GEERBT UND BENANNT: **Falle 9**. In jsdom gibt es keine RSC-Grenze —
 * die `render`-Funktionen der Tabelle sind hier gewoehnliche Funktionswerte. Zoege jemand die
 * Flaeche in die Server Component, bliebe JEDER Fall dieser Datei gruen und der Abruf
 * antwortete mit `Functions cannot be passed directly to Client Components`. Der Waechter
 * dagegen ist der Playwright-Fall (`Spec:4881-4882`), Fall 9 in
 * `e2e/radio-verwaltung.spec.ts` — gefahren in Aufgabe V23.
 *
 * ⚠️ WAS HIER ANDERS IST ALS BEI DEN INSELN 1 UND 2: diese Flaeche hat KEINEN mobilen Zweig
 * und ruft `Grid.useBreakpoint()` nicht. jsdom rendert deshalb die ECHTE Tabelle mit ihren
 * Zeilen, und die Zellen werden am gerenderten Baum geprueft — wie bei Insel 3
 * (`versionen/VersionenTabelle.test.tsx:24-30`), nicht wie bei Insel 2.
 */

/*
 * ⛔ `vi.hoisted`, WEIL `vi.mock` AN DEN DATEIANFANG GEHOBEN WIRD. Ein gewoehnliches
 * `const erstelleMock = vi.fn()` darueber ist zur Ausfuehrungszeit der Fabrik noch nicht
 * initialisiert (gemessen in V13: `ReferenceError: Cannot access ... before initialization`,
 * und die ganze Datei faellt aus, nicht ein Fall).
 *
 * ⛔ DER MOCKPFAD IST `../../../_actions/codes` UND NICHT `../../actions` — die zwei Aktionen
 * dieser Flaeche stammen aus PLANTEIL 3 (NS-A6, `_actions/codes.ts:78`, `:121`) und NICHT aus
 * `admin/actions.ts`. Ohne den Modulersatz zoege `_actions/codes.ts` hier `better-sqlite3`,
 * `drizzle-orm` und `next/headers` in den jsdom-Lauf.
 *
 * ⛔ UND SIE HABEN EINE ANDERE RUECKGABEFORM ALS DIE NEUN `…Action`-FUNKTIONEN:
 * `erstelleCode` liefert `{ code }` und WIRFT im Fehlerfall (`_actions/codes.ts:78-104`),
 * `setzeCodeAktiv` liefert `void` (`:121-133`). Es gibt hier also kein `{ ok, fehler }` —
 * die Flaeche faengt und zeigt ihren EIGENEN Text. Das ist der Pruefgegenstand des
 * Fehlerpfad-Blocks unten.
 */
const { erstelleMock, setzeMock, refreshMock } = vi.hoisted(() => ({
  erstelleMock: vi.fn(),
  setzeMock: vi.fn(),
  refreshMock: vi.fn(),
}));
vi.mock("../../../_actions/codes", () => ({
  erstelleCode: erstelleMock,
  setzeCodeAktiv: setzeMock,
}));
/*
 * ⛔ `next/navigation` WIRD ERSETZT, WEIL DIE FLAECHE SICH SELBST NACHLAEDT. Die zwei
 * Aktionen aus Planteil 3 rufen KEIN `revalidatePath` (`/usr/bin/grep -n revalidatePath
 * src/app/m/radio/_actions/codes.ts` → nichts, gemessen 2026-08-26), und V20 fasst
 * `_actions/` nicht an (`.superpowers/sdd/planteil4/VORABSCAN.md:640`). Dieselbe Form wie
 * `geraete/GeraeteTabelle.test.tsx:91-94`.
 */
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: refreshMock }),
}));

const INSEL_ORDNER = "src/app/m/radio/admin/(arbeit)/zugaenge";
const QUELLE_TABELLE = `${INSEL_ORDNER}/CodeTabelle.tsx`;
const QUELLE_SEITE = `${INSEL_ORDNER}/page.tsx`;

/**
 * DIE DATEIEN DER INSEL — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling **R-V11-1**,
 * `.superpowers/sdd/planteil4/progress.md`, Abschnitt „Rulings"). Gemessen in der
 * Schlusspruefung zu V13 (Fund M2): eine zusaetzliche Datei in einem Inselverzeichnis, ohne
 * Bauform-Direktive UND mit einem Wertimport aus `_db/schema`, liess eine handgeschriebene
 * Namensliste voellig unbeeindruckt.
 *
 * ⛔ DER AUSSCHLUSS STEHT AM BLATT UND NICHT AM AST (Ruling **R-V11-3**).
 *
 * ⛔ **UND ER LIEST REKURSIV — DIE KORREKTUR AUS FIX-RUNDE 1 ZU V20** (REVIEW-V20, Fund 4).
 * ⚠️ GEMESSEN, ZWEIMAL: `zugaenge/unter/Heimlich.tsx` mit ALLEN DREI Verstoessen zugleich — kein
 * `"use client"` trotz `useState`, WERTIMPORT aus `../../../../_db/schema`, `size="small"`,
 * Bildschirmtext „Zugang loeschen". Mit dem alten, NICHT rekursiven `readdirSync`: `29 passed`,
 * ⛔ NULL ROT — die vier Faelle sahen die Datei nicht; die Auslassung war AM AST (R-V11-3).
 *
 * ⛔ **DIE GRENZE DER INSEL IST DIE NAECHSTE ROUTE, NICHT DIE VERZEICHNISTIEFE.** Ein
 * Unterverzeichnis mit einem EIGENEN Server-Einstieg ist eine eigene Flaeche mit eigenem
 * Inseltest — so liegt `geraete/[id]/` unter `geraete/` (dort `GeraetFormular.test.tsx`). Ohne
 * diesen Schnitt zoege der Finder fremde Inseln herein und `INSEL_SOLL` waere rot ueber
 * korrektem Bestand. ⚠️ AUCH DIESER SCHNITT STEHT AM BLATT: er wird je GEFUNDENER Datei ueber
 * ihre Vorfahren entschieden, nicht als Abbruch beim Absteigen.
 * ⚠️ **UND ER SCHNEIDET WEITER, ALS NEXT.JS ROUTET:** fuer ZWEI der vier Namen unten traegt der
 * Satz „eigene Flaeche mit eigenem Inseltest" NICHT — ein Ordner mit nur `layout.tsx`/
 * `template.tsx` ist fuer sich keine Route, ein `_`-Privatordner wird gar nicht geroutet
 * (`node_modules/next/dist/docs/01-app/01-getting-started/02-project-structure.md:225`, `:261`);
 * beider `page.tsx` schneidet hier trotzdem. Zu ENG waere rot ueber korrektem Bestand, zu WEIT
 * laesst nur Dateien aus, die dann ein anderer Waechter tragen muss.
 *
 * ⛔ **UND ER OEFFNET KEIN NEUES LOCH — DAS IST GEMESSEN, NICHT GESCHLOSSEN.** Was hinter einem
 * Server-Einstieg liegt, faellt nicht durch, sondern an einen SCHAERFEREN Waechter: der
 * Unterordner `fremd/` mit `page.tsx` + `FremdInsel.tsx` → `riegel.test.ts` meldet
 * `Tests 3 failed | 21 passed (24)`: „die Seitenzahl steht EXAKT …" (`expected 10 to be 9`),
 * „jede nennt den Riegel ihrer Group", „keine Verwaltungsseite liest, bevor sie riegelt".
 * ⛔ HEIMLICHE ROUTE UNMOEGLICH; eine ABSICHTLICHE bringt ihren Inseltest mit (`briefs/KOPF.md:111-135`).
 *
 * ⬜ **V20-L1 — die anderen SIEBEN Kopien dieses Finders sind weiterhin nicht rekursiv.**
 * Gemessen mit `/usr/bin/grep -rln "function inselDateien" src` (2026-08-26): ausser dieser
 * Datei tragen ihn `geraete/GeraeteTabelle.test.tsx`, `geraete/[id]/GeraetFormular.test.tsx`,
 * `geraete/[id]/ereignisse/EreignisTabelle.test.tsx`, `ausleihen/AusleihenTabelle.test.tsx`,
 * `software/UpdateSuche.test.tsx`, `versionen/VersionenTabelle.test.tsx` und
 * `import/ImportAssistent.test.tsx`. ⛔ EIN WORTGLEICHES NACHZIEHEN GENUEGT DORT NICHT — die
 * `geraete/`-Kopie braucht den Routenschnitt oben, sonst zieht sie `[id]/` herein.
 * **Eigentuemer: ClickUp-Board** (kein Bauwert in V20s Fenster; V20 fasst keine fremde
 * Inseldatei an, und ein Wachstum von `VersionenTabelle.test.tsx` verschoebe SECHS
 * Belegzeilen: `:24-30`, `:101-107`, `:110-144`, `:157-173` und `:729` von hier,
 * `:611-620` aus `_lib/lesepfade/codes.test.ts`).
 */
const SERVER_EINSTIEGE = ["page.tsx", "layout.tsx", "template.tsx", "route.ts"];

/** Traegt ein Verzeichnis ZWISCHEN der Insel und dieser Datei einen eigenen Server-Einstieg? */
function inFremderRoute(relativ: string): boolean {
  let pfad = INSEL_ORDNER;
  for (const teil of relativ.split("/").slice(0, -1)) {
    pfad = `${pfad}/${teil}`;
    if (SERVER_EINSTIEGE.some((name) => existsSync(`${pfad}/${name}`))) return true;
  }
  return false;
}

function inselDateien(): string[] {
  return readdirSync(INSEL_ORDNER, { recursive: true })
    .map((eintrag) => String(eintrag).split(sep).join("/"))
    .filter((pfad) => /\.tsx?$/.test(pfad))
    .filter((pfad) => !/\.(?:test|spec)\.tsx?$/.test(pfad))
    .filter((pfad) => !SERVER_EINSTIEGE.includes(pfad.split("/").pop()!))
    .filter((pfad) => !inFremderRoute(pfad))
    .sort();
}

/**
 * ⛔ Die Sollwerttafel steht NUR auf der rechten Seite — sie ist der Prueffling der Messung.
 *
 * ⚠️ EINE EINZIGE DATEI, und das ist die BEGRUENDETE Abweichung von Insel 3, wo es zwei sind
 * (`NeuVersion.tsx` neben `VersionenTabelle.tsx`, Vorabscan-Fund F22): dort teilen die zwei
 * KEINEN Zustand. Hier teilen Anlegefeld und Tabelle den Fehlerabsatz UND das Nachladen —
 * nach E-V6s eigenem Kriterium (`.superpowers/sdd/planteil4/briefs/KOPF.md:603-633`) sind sie
 * damit EINE Insel, und die Files-Zeile des Auftrags fuehrt folgerichtig genau eine Datei
 * (`.superpowers/sdd/planteil4/briefs/V20.md:3-4`).
 */
const INSEL_SOLL = ["CodeTabelle.tsx"];

/**
 * DIE SERVER ACTIONS, DIE DIE INSEL WIRKLICH RUFT — ⛔ GEFUNDEN, NICHT AUFGEZAEHLT (Ruling
 * **R-V11-1**): „Wo ein Scan eine Fehlerklasse bewacht, die in einer NEUEN Datei entstehen
 * kann, muss er die Menge FINDEN, nicht auflisten."
 *
 * ⛔ ER HAT ZWEI ZWEIGE, UND DER ZWEITE IST DER GRUND, WARUM ER NICHT AUS INSEL 3 KOPIERT IST.
 * Dort genuegte `/\b([a-zA-Z][A-Za-z0-9]*Action)\b/`
 * (`versionen/VersionenTabelle.test.tsx:101-107`) — ⛔ `erstelleCode` UND `setzeCodeAktiv`
 * ENDEN NICHT AUF `Action`. Ein wortgleich uebernommener Finder faende hier NICHTS, die Tafel
 * unten stuende gegen die leere Menge, und der Fall „die Tafel deckt JEDE Action" waere
 * gruen ueber nichts — genau die Gestalt, die dieses Repo schon einmal teuer bezahlt hat
 * („Paritaet gruen" als konstanter Text, drei Sonden 0 rot).
 *
 *   Zweig 1: jeder benannte Import aus einem Modul unter `_actions/` — die Form dieser Insel.
 *   Zweig 2: jeder Bezeichner auf `…Action` — die Form der neun aus `admin/actions.ts`; sie
 *            faengt eine spaeter dazukommende Verwaltungs-Action an dieser Flaeche.
 *
 * ⛔ MIT EIGENER UNTERGRENZE: mindestens eine Inseldatei muss den `_actions/`-Import wirklich
 * tragen. Ohne sie bliebe ein Finder gruen, der an einem umbenannten Ordner vorbeiliest
 * (Ruling R-V11-1, Auflage 1).
 */
const AKTIONS_IMPORT = /import\s*\{([^}]*)\}\s*from\s*["'][^"']*_actions\/[^"']+["']/g;

function aktionenDerInsel(): { namen: string[]; importe: number } {
  const namen = new Set<string>();
  let importe = 0;
  for (const datei of inselDateien()) {
    const quelle = ohneKommentare(readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8"));
    for (const treffer of quelle.matchAll(AKTIONS_IMPORT)) {
      importe++;
      for (const roh of treffer[1]!.split(",")) {
        const name = roh.trim().replace(/^type\s+/, "");
        if (name !== "") namen.add(name);
      }
    }
    for (const treffer of quelle.matchAll(/\b([a-zA-Z][A-Za-z0-9]*Action)\b/g)) {
      namen.add(treffer[1]!);
    }
  }
  return { namen: [...namen].sort(), importe };
}

/**
 * DIE BENANNTE TEXTLISTE EINER FLAECHENDATEI, AUFGESCHLAGEN — Kopf, Rumpf und die
 * Zeichenketten darin (REVIEW-V19, Fund **F7**; Bauform wortgleich aus
 * `versionen/VersionenTabelle.test.tsx:110-144` uebernommen).
 *
 * ⛔ SIE IST DER PRUEFLING VON DREI FAELLEN: driftet ihr Anker, wird `block` leer, `werte`
 * leer — und zwei negative Zusicherungen darueber waeren GRUEN UEBER NICHTS. ⛔ DESHALB
 * MELDET SIE `gefunden`, UND JEDER FALL PRUEFT ES, bevor er etwas anderes behauptet.
 */
const TEXTLISTE_KOPF = /const [A-Z][A-Z0-9_]*_TEXTE = \{/;
const TEXTLISTE_FUSS = "} as const;";

/**
 * Ein Zeichenkettenliteral im Quelltext — doppelte Anfuehrungszeichen ODER ein Schablonentext.
 * ⚠️ Einfache Anfuehrungszeichen kommen hier nicht vor (`eslint`/`prettier` des Hauses setzen
 * doppelte); ein `'…'` faenge dieser Ausdruck NICHT, und das ist die bewusst laute Richtung.
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
 * `page.tsx` traegt mit `SEITEN_TEXTE` eine eigene Liste.
 */
function flaechenDateien(): string[] {
  return [...inselDateien().map((datei) => `${INSEL_ORDNER}/${datei}`), QUELLE_SEITE];
}

/**
 * WORAN MAN EINEM LITERAL ANSIEHT, DASS ES EIN BILDSCHIRMTEXT IST (REVIEW-V19, Fund **F7**):
 * ein Leerzeichen, ein Zeichen ausserhalb des druckbaren ASCII-Satzes (Umlaut, Gedankenstrich,
 * typografische Anfuehrungszeichen) ODER ein Grossbuchstabe am Anfang. Wortgleich aus
 * `versionen/VersionenTabelle.test.tsx:157-173`, samt der dort gefahrenen Dreifachsonde.
 */
const BILDSCHIRMVERDACHT = /[ ]|[^ -~]|^\p{Lu}/u;

/**
 * ⛔ DIE EINE BENANNTE AUSNAHME. `"use client"` traegt ein Leerzeichen und ist trotzdem kein
 * Bildschirmtext, sondern die Bauform-Direktive — sie steht als erste Zeile und wird vom Fall
 * „die Datei der Insel traegt use client als erste Zeile" bewacht. `"use server"` steht
 * vorsorglich mit; keine Datei dieser Flaeche traegt sie (die zwei Aktionen liegen in
 * `_actions/codes.ts`).
 */
const BAUFORM_DIREKTIVEN = ['"use client"', '"use server"'];

/**
 * EIN TEXTFUEHRENDES ATTRIBUT ODER OBJEKTFELD MIT EINEM LITERAL. ⛔ `\{?` IST NICHT ZIERRAT:
 * ohne es liefe `title={"Anlegen"}` durch — gueltiges JSX, das den Text ebenso auf den
 * Bildschirm bringt wie `title="Anlegen"`.
 */
const TEXTFUEHRENDES_FELD =
  /\b(?:title|placeholder|aria-label|okText|cancelText|emptyText|label|message|description|alt)\s*[=:]\s*\{?\s*["'`]/g;

/**
 * EIN JSX-TEXTKIND, DAS BLANKER TEXT IST: zwischen einem `>` und dem naechsten `<` steht
 * mindestens ein Buchstabe und weder eine geschweifte noch eine spitze Klammer.
 *
 * ⛔ ER DARF DAS ZEILENENDE NICHT AUSSCHLIESSEN — gemessen in V19 (`prettier` bricht ein
 * mehrzeiliges Bauteil um, der Text steht auf einer EIGENEN Zeile zwischen `>` und
 * `</Button>`; mit `\n` im Ausschluss ergab die Sonde NULL ROT).
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
import type { CodeZeile } from "../../../_lib/lesepfade/codes";
import { CodeTabelle } from "./CodeTabelle";

/**
 * Eine Zeile, wie der Lesepfad sie liefert — VORFORMATIERT und serialisierbar, ohne `Date`
 * (`_lib/lesepfade/codes.ts`, Kopf von `CodeZeile`; Bauform-Zulaessigkeitstafel Nr. 7). Die
 * Vorbelegung ist die haeufigste Zeile: ein aktiver, schon einmal eingeloester Zugang.
 */
function zeile(teil: Partial<CodeZeile> = {}): CodeZeile {
  return {
    id: "zc-1",
    bezeichnung: "Aufsteller Funkraum",
    code: "A3F7-K92M-QRTV",
    aktiv: true,
    gesperrtAmText: "",
    gesperrtVonText: "",
    gesperrtVonSub: "",
    zuletztText: "20.06.2026, 18:45",
    ...teil,
  };
}

/** Eine gesperrte Zeile mit BEIDEN Angaben — der Bestand, den `_db/schema.ts:184-187` meint. */
function gesperrteZeile(teil: Partial<CodeZeile> = {}): CodeZeile {
  return zeile({
    id: "zc-2",
    bezeichnung: "Aufsteller Fahrzeughalle",
    code: "7QK2-M4XN-B9HV",
    aktiv: false,
    gesperrtAmText: "22.06.2026, 07:00",
    gesperrtVonText: "Berta Beispiel",
    gesperrtVonSub: "sub-berta",
    ...teil,
  });
}

beforeEach(() => {
  erstelleMock.mockReset();
  setzeMock.mockReset();
  refreshMock.mockReset();
  erstelleMock.mockResolvedValue({ code: "NEU-CODE-0001" });
  setzeMock.mockResolvedValue(undefined);
});

afterEach(async () => {
  await unmount();
});

describe("radio-Zugaenge: die fuenf Spalten und das Loeschverbot", () => {
  it("ein gesperrter Code bleibt in der Liste", async () => {
    /*
     * ⛔ **DIE ZUSICHERUNG DES LOESCHVERBOTS AUF DER FLAECHE**
     * (`.superpowers/sdd/planteil4/briefs/V20.md:51`). `_db/schema.ts:180-183`: „DER EINZIGE
     * WIDERRUF, DEN ES GIBT." Ein Filter auf `aktiv` in der Flaeche oder im Lesepfad machte
     * die gesperrten Zeilen unsichtbar — und damit `gesperrt_am`/`gesperrt_von` sinnlos, die
     * genau deshalb existieren, „WEIL die Zeile dauerhaft in der Liste steht" (`:184-187`).
     *
     * ⛔ ZWEI ZEILEN, EINE JE ZUSTAND: ueber einer Liste, die NUR gesperrte Zeilen traegt,
     * bestuende der Fall auch dann, wenn die Flaeche gar nicht filterte, sondern gar nichts
     * anzeigte.
     */
    await mount(<CodeTabelle zeilen={[zeile(), gesperrteZeile()]} />);

    const zeilen = queryAll("tbody tr.ant-table-row");
    expect(zeilen.length, "eine der beiden Zeilen fehlt in der Liste").toBe(2);
    expect(zeilen[1]!.textContent, "der gesperrte Zugang wurde herausgefiltert").toContain(
      "Aufsteller Fahrzeughalle",
    );
  });

  it("ein gesperrter Code zeigt, wann und von wem", async () => {
    /*
     * ⛔ BEIDE FELDER (`.superpowers/sdd/planteil4/briefs/V20.md:41-43`;
     * `_db/schema.ts:184-187`): „`aktiv = false` allein verlangte vom Betreiber, sich das zu
     * merken."
     *
     * ⛔ DER ROHE `sub` STEHT IM `title`, NICHT IN DER ZELLE — dieselbe Bauform wie in der
     * Ereignisliste (`geraete/[id]/ereignisse/EreignisTabelle.tsx`, Fall „der aufgeloeste Name
     * steht in der Zelle, der rohe sub im title"). Ohne ihn waeren zwei gleichnamige Personen
     * nicht zu unterscheiden; in der Zelle waere er Laerm.
     */
    await mount(<CodeTabelle zeilen={[gesperrteZeile()]} />);

    const angabe = query('[data-rolle="radio-code-gesperrt"]');
    expect(angabe.textContent, "der Zeitpunkt der Sperre fehlt").toContain("22.06.2026, 07:00");
    expect(angabe.textContent, "die sperrende Person fehlt").toContain("Berta Beispiel");
    expect(angabe.getAttribute("title"), "der rohe sub fehlt am title").toBe("sub-berta");
  });

  it("eine halb gefuellte Sperrangabe zeigt die bekannte Haelfte", async () => {
    /*
     * ⛔ **DIESER FALL ENTSTAND AUS EINER SONDE, DIE 0 ROT ERGAB** (S-V20-I24, 2026-08-26):
     * das `&&` im Zustandszweig auf `||` gedreht liess `Tests 28 passed` stehen. Jede Vorlage
     * dieser Datei trug BEIDE Angaben oder KEINE — die Verzweigung, die der Bau entscheidet,
     * war strukturell unbewacht. ⛔ Nach der Regel dieses Hauses wurde der TEST gerichtet, und
     * mit ihm die Richtung, die der Bau nimmt.
     *
     * ⛔ DIE ENTSCHEIDUNG: die BEKANNTE Haelfte wird gezeigt, nicht die ganze Zeile
     * verschwiegen. `_db/schema.ts:185-186` laesst beide Spalten EINZELN `NULL` zu; kein
     * heutiger Schreibweg fuellt nur eine (`_actions/codes.ts:129-133`,
     * `_lib/seedLokal.ts:183-185` schreiben beide), eine Datenuebernahme kann es. „gesperrt am
     * 22.06.2026" sagt mehr als nichts — und ein Satz mit offener Luecke („von ") saehe nach
     * einem Fehler der Flaeche aus statt nach einer Luecke im Bestand.
     *
     * ⛔ BEIDE HALBEN ZUSTAENDE, nicht einer: mit nur einem bestuende der Fall auch ueber
     * einer Fassung, die den anderen Zweig verschluckt.
     */
    await mount(
      <CodeTabelle
        zeilen={[
          gesperrteZeile({ id: "zc-a", gesperrtVonText: "", gesperrtVonSub: "" }),
          gesperrteZeile({ id: "zc-b", gesperrtAmText: "" }),
        ]}
      />,
    );

    const angaben = queryAll('[data-rolle="radio-code-gesperrt"]');
    expect(angaben.length, "eine halb gefuellte Zeile verschweigt ihre Sperrangabe").toBe(2);
    expect(angaben[0]!.textContent, "der bekannte Zeitpunkt fehlt").toBe(
      "gesperrt am 22.06.2026, 07:00",
    );
    expect(angaben[1]!.textContent, "die bekannte Person fehlt").toBe(
      "gesperrt von Berta Beispiel",
    );
  });

  it("ein aktiver Code traegt keine Sperrangabe", async () => {
    /*
     * DIE GEGENPROBE ZUM FALL DARUEBER. Ohne sie bestuende „zeigt, wann und von wem" auch
     * ueber einer Fassung, die den Zusatz an JEDER Zeile zeigt — dann stuende an einem
     * gueltigen Zugang „gesperrt am — von —".
     */
    await mount(<CodeTabelle zeilen={[zeile()]} />);
    expect(
      queryAll('[data-rolle="radio-code-gesperrt"]').length,
      "ein aktiver Zugang zeigt eine Sperrangabe",
    ).toBe(0);
  });

  it("nie eingeloest wird als Text gezeigt, nicht als leere Zelle", async () => {
    /*
     * ⛔ `_db/schema.ts:190-191`: „NULL = 'nie eingeloest'. REINE ANZEIGE, ohne Einfluss auf
     * Gueltigkeit." ⚠️ DIE UMSETZUNG DIESER REGEL — `NULL` wird zu genau diesem Satz —
     * gehoert dem Lesepfad und wird dort gemessen (`_lib/lesepfade/codes.test.ts`, Fall
     * „lastUsedAt NULL wird zu einem Text"). ⛔ HIER STEHT DIE ANDERE HAELFTE: die Flaeche
     * gibt den Text WIRKLICH AUS und laesst die Zelle nicht leer.
     */
    await mount(<CodeTabelle zeilen={[zeile({ zuletztText: "nie eingelöst" })]} />);
    const zelle = query('[data-rolle="radio-code-zuletzt"]');
    expect(zelle.textContent).toBe("nie eingelöst");
  });

  it("es gibt keinen Loeschknopf", async () => {
    /*
     * ⛔ **EINE NEGATIVE ZUSICHERUNG, UND SIE IST DER PUNKT** (NS-A6,
     * `.superpowers/sdd/planteil4/briefs/V20.md:54`). `_actions/codes.ts:20-52` schreibt die
     * drei Gruende aus: ein geloeschter Code GIBT SEINEN WERT FREI, er ist der
     * ANZEIGESCHLUESSEL DER LEIHHISTORIE ueber `loans.zugangscode_id`, und die zwei Haelften
     * tragen nur zusammen. `Spec:2166-2169`: „Aus `zugangscodes` wird nach 3.2.4 NIEMALS
     * geloescht — der Zeiger kann konstruktiv nicht ins Leere fallen."
     *
     * ⛔ ZWEI HAELFTEN, WEIL EINE ALLEIN NICHT TRAEGT:
     *   1. AM GERENDERTEN BAUM — je Zeile GENAU EIN Knopf. Ein zweiter, wie auch immer
     *      beschriftet, macht den Fall rot (Sonde S-V20b).
     *   2. AM QUELLTEXT — kein Loeschwort und kein `delete` in der Insel. Sie faengt die
     *      Form, die die erste nicht sieht: einen Loeschweg, der erst unter einer Bedingung
     *      erscheint.
     *
     * ⚠️ GELESEN WIRD DER KOMMENTARFREIE QUELLTEXT: der Kopf der Insel BEGRUENDET das Verbot
     * und nennt das Wort dabei — dieselbe Prosa-Sperre wie in `_db/leihen.ts:57-64`, nur in
     * der entschaerften Form.
     */
    await mount(<CodeTabelle zeilen={[zeile(), gesperrteZeile()]} />);

    const zeilen = queryAll("tbody tr.ant-table-row");
    expect(zeilen.length, "die Tabelle rendert ihre Zeilen nicht").toBe(2);
    for (const [i, tr] of zeilen.entries()) {
      expect(
        tr.querySelectorAll("button").length,
        `Zeile ${i}: mehr als der eine Sperr-/Entsperr-Knopf`,
      ).toBe(1);
    }

    /*
     * ⛔ **`normalize("NFC")` VOR DEM SCAN — UND KEIN UMLAUT IM ANKER.** Beides ist die
     * Korrektur aus Fix-Runde 1 zu V20 (REVIEW-V20, Fund 5), und beides ist gemessen:
     *   1. Ein DEKOMPONIERTES „Lo" + U+0308 + „schen" (auf dem Bildschirm nicht von der
     *      komponierten Form zu unterscheiden) in `CODE_TEXTE` liess den alten Anker
     *      `Tests 1 passed` melden — ⛔ NULL ROT, STILL, an einer NEGATIVEN Zusicherung.
     *      `normalize("NFC")` faltet beide Formen zusammen, bevor gesucht wird.
     *   2. Ein Umlaut in einem Grep-Anker ist im Haus verboten
     *      (`.superpowers/sdd/planteil4/KONTEXT.md`, „Hausregeln des Repos"). Der Anker
     *      traegt ihn deshalb als Codepunkt-Escape, nicht als Zeichen.
     *
     * ⛔ STAMM-PRAEFIX STATT VOLLFORM: der alte Anker war stamm-EXAKT — „löscht",
     * „Löschung", „löschbar", „entfernt", „verwerfen" und „entsorgen" liefen durch. Unter
     * `/i` waren `Löschen` und `Entfernen` ausserdem TOTE Alternativen.
     *
     * ⚠️ GELESEN WIRD NUR DIE INSEL, NICHT DIE GANZE FLAECHE — und das ist Absicht:
     * `page.tsx` sagt in `SEITEN_TEXTE.hinweis` zu Recht „wird nie gelöscht" (der Satz, der
     * den fehlenden Knopf erklaert). Ein Scan ueber `flaechenDateien()` waere rot ueber
     * korrektem Bestand.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8")).normalize("NFC");
    expect(quelle, "ein Loeschwort in der Insel (NS-A6)").not.toMatch(
      /l(?:\u00F6|oe)sch|entfern|verwerf|entsorg|\bremove\b/i,
    );
    expect(quelle, "ein Loeschweg in der Insel (NS-A6)").not.toMatch(/\bdelete\b/);
  });

  it("Sperren und Entsperren sind derselbe Knopf mit zwei Beschriftungen", async () => {
    /*
     * ⛔ SONST GIBT ES ZWEI WEGE IN DENSELBEN ZUSTAND
     * (`.superpowers/sdd/planteil4/briefs/V20.md:55`) — und zwei Wege heissen: einer wird
     * beim naechsten Umbau vergessen. `setzeCodeAktiv(codeId, aktiv)` ist EINE Action mit
     * einem Wahrheitswert (`_actions/codes.ts:121`); die Flaeche bildet das 1:1 ab.
     *
     * ⛔ DREI ZUSICHERUNGEN, UND ALLE DREI SIND NOETIG: je Zeile GENAU EIN Knopf mit diesem
     * Griff, die Beschriftungen sind VERSCHIEDEN, und der uebergebene Wahrheitswert ist die
     * UMKEHRUNG des heutigen Zustands. Ohne die dritte bestuende der Fall auch ueber einer
     * Fassung, die beide Richtungen auf `false` schickt — dann waere „Entsperren" ein Knopf,
     * der nichts tut.
     *
     * ⚠️ DIE ZWEITE HAELFTE LAEUFT AUF EINEM FRISCHEN BAUM, UND DAS IST EINE GEMESSENE
     * WERKZEUGFALLE, KEINE BEQUEMLICHKEIT (2026-08-26): antd laesst den Knoten eines einmal
     * geoeffneten `Popconfirm` an `document.body` stehen, und `clickPortal` nimmt den ERSTEN
     * Treffer (`qr/_lib/test-dom.tsx:187-191`). Der zweite Griff bestaetigte deshalb die
     * Rueckfrage der ERSTEN Zeile — der Fall meldete `['zc-1', false]` statt
     * `['zc-2', true]`. ⛔ `unmount()` raeumt genau das weg (`test-dom.tsx:77-107`).
     */
    await mount(<CodeTabelle zeilen={[zeile(), gesperrteZeile()]} />);

    const knoepfe = queryAll<HTMLButtonElement>('[data-rolle="radio-code-umschalten"]');
    expect(knoepfe.length, "nicht genau ein Knopf je Zeile").toBe(2);
    expect(knoepfe.map((k) => (k.textContent ?? "").trim())).toEqual(["Sperren", "Entsperren"]);

    await clickElement(knoepfe[0]!);
    await clickPortal(".ant-popconfirm .ant-btn-primary");
    expect(setzeMock.mock.calls[0], "Sperren schickt nicht (id, false)").toEqual(["zc-1", false]);

    await unmount();
    setzeMock.mockClear();
    await mount(<CodeTabelle zeilen={[gesperrteZeile()]} />);
    await click('[data-rolle="radio-code-umschalten"]');
    await clickPortal(".ant-popconfirm .ant-btn-primary");
    expect(setzeMock.mock.calls[0], "Entsperren schickt nicht (id, true)").toEqual(["zc-2", true]);
  });

  it("der Knopf schaltet nicht ohne Rueckfrage", async () => {
    /*
     * ⛔ `Popconfirm` — die Bauform, die `.superpowers/sdd/planteil4/briefs/KOPF.md:1365` fuer
     * diese Insel namentlich fuehrt. Ein Fehlgriff auf einer Beruehrflaeche nimmt sonst einen
     * Aufsteller aus dem Betrieb, ohne dass jemand es merkt: die Sperre wirkt binnen des
     * naechsten Aufrufs, lesend wie schreibend (`Spec:2229-2232`).
     *
     * ⛔ UND SIE STEHT AUCH VOR DEM ENTSPERREN. Das ist die Richtung, die einen abgemeldeten
     * Zugang WIEDER OEFFNET — gesperrt wurde er, „weil ein Kaertchen verschwunden ist"
     * (`_db/schema.ts:180-183`); ein versehentliches Entsperren gibt genau dieses Kaertchen
     * wieder frei.
     */
    await mount(<CodeTabelle zeilen={[zeile()]} />);
    await click('[data-rolle="radio-code-umschalten"]');
    expect(setzeMock, "geschaltet, bevor jemand bestaetigt hat").not.toHaveBeenCalled();
    expect(document.body.querySelector(".ant-popconfirm")?.textContent).toContain(
      "Diesen Zugang wirklich sperren?",
    );
  });

  it("die fuenf Spalten stehen in dieser Reihenfolge", async () => {
    /*
     * ⛔ `.superpowers/sdd/planteil4/briefs/V20.md:33-34` woertlich: „Bezeichnung · Code ·
     * Zustand (aktiv/gesperrt) · zuletzt benutzt · Aktionen". Es gibt keine Alt-Maske, an der
     * sich die Reihenfolge messen liesse (siehe `_lib/lesepfade/codes.ts`, Dateikopf) — der
     * Brief IST hier die Vorlage.
     */
    await mount(<CodeTabelle zeilen={[zeile()]} />);
    expect(queryAll("thead th").map((k) => (k.textContent ?? "").trim())).toEqual([
      "Bezeichnung",
      "Code",
      "Zustand",
      "Zuletzt benutzt",
      "Aktionen",
    ]);
  });

  it("die Zeile zeigt Bezeichnung, Klartext-Code und Zustand", async () => {
    /*
     * ⛔ DER KLARTEXT-CODE STEHT WIRKLICH DA (`Spec:2180-2182`): er ist kein Einmalgeheimnis,
     * sondern ein Dauerausweis — ohne ihn koennte niemand ein verlorenes Kaertchen der
     * richtigen Zeile zuordnen, und V21s Druckblatt haette nichts zu drucken.
     *
     * ⛔ DER ZUSTAND WANDERT ALS WORT, NICHT ALS FARBE (Falle 3,
     * `.superpowers/sdd/planteil4/briefs/KOPF.md:1379-1380`): `colorError === colorPrimary`
     * (`src/core/theme/theme.ts:32-33`) — ein roter Ton auf einer Datenflaeche saehe aus wie
     * die Primaeraktion.
     */
    await mount(<CodeTabelle zeilen={[zeile(), gesperrteZeile()]} />);

    expect(queryAll('[data-rolle="radio-code-bezeichnung"]').map((k) => k.textContent)).toEqual([
      "Aufsteller Funkraum",
      "Aufsteller Fahrzeughalle",
    ]);
    expect(queryAll('[data-rolle="radio-code-wert"]').map((k) => k.textContent)).toEqual([
      "A3F7-K92M-QRTV",
      "7QK2-M4XN-B9HV",
    ]);
    expect(
      queryAll('[data-rolle="radio-code-zustand"]').map((k) => (k.textContent ?? "").trim()),
    ).toEqual(["aktiv", "gesperrt"]);
  });
});

describe("radio-Zugaenge: das Anlegefeld", () => {
  it("ein leerer oder nur aus Leerraum bestehender Wert laeuft gar nicht los", async () => {
    /*
     * ⛔ `zugangscodes.bezeichnung` ist `.notNull()` (`_db/schema.ts:177`), aber NICHT gegen
     * die leere Zeichenkette geschuetzt — ein leerer Anzeigename erzeugte eine Zeile, die in
     * der Liste als leerer Streifen steht und die niemand mehr zuordnen kann.
     *
     * ⚠️ DIESE PRUEFUNG SPART DEN RUNDLAUF, SIE IST NICHT DIE WAHRHEIT: „eine Regel, die nur
     * im Client steht, ist keine Regel" (`Spec:3583-3585`). ⛔ SERVERSEITIG IST SIE HEUTE
     * NICHT GEBAUT — `erstelleCode` prueft `bezeichnung` nicht (`_actions/codes.ts:78-104`,
     * gemessen), und V20 fasst `_actions/` nicht an
     * (`.superpowers/sdd/planteil4/VORABSCAN.md:640`). ⬜ **Benannte Leerstelle, Eigentuemer
     * ClickUp-Board:** der serverseitige Riegel gehoert in dieselbe Aufgabe, die `_actions/`
     * ohnehin oeffnet.
     */
    await mount(<CodeTabelle zeilen={[]} />);

    await click('[data-rolle="radio-neucode-anlegen"]');
    expect(erstelleMock, "ein leerer Name lief los").not.toHaveBeenCalled();

    await fill('[data-rolle="radio-neucode-eingabe"]', "   ");
    await click('[data-rolle="radio-neucode-anlegen"]');
    expect(erstelleMock, "nur Leerraum lief los").not.toHaveBeenCalled();
  });

  it("der gesendete Wert ist der GETRIMMTE, und nach dem Erfolg ist das Feld leer", async () => {
    /*
     * ⛔ GETRIMMT, sonst steht in der Liste „ Aufsteller Halle " mit unsichtbaren Raendern,
     * und zwei Zeilen sehen gleich aus, ohne es zu sein.
     *
     * ⛔ UND NUR DER ERFOLGSFALL LEERT DAS FELD — sonst tippt der Bedienende seine Korrektur
     * neu (dieselbe Wahl wie in `versionen/NeuVersion.tsx`).
     */
    await mount(<CodeTabelle zeilen={[]} />);
    await fill('[data-rolle="radio-neucode-eingabe"]', "  Aufsteller Halle  ");
    await click('[data-rolle="radio-neucode-anlegen"]');

    expect(erstelleMock.mock.calls[0], "der Name ging ungetrimmt hinueber").toEqual([
      "Aufsteller Halle",
    ]);
    expect(
      query<HTMLInputElement>('[data-rolle="radio-neucode-eingabe"]').value,
      "das Feld blieb nach dem Erfolg stehen",
    ).toBe("");
  });

  it("Enter im Eingabefeld legt an — der Hauptweg auf einer Tastaturflaeche", async () => {
    /*
     * ⛔ `onPressEnter` (dieselbe Bauform wie `versionen/NeuVersion.tsx`): wer einen Namen
     * tippt, drueckt Enter — ein Feld, das darauf nichts tut, wirkt kaputt.
     */
    await mount(<CodeTabelle zeilen={[]} />);
    await fill('[data-rolle="radio-neucode-eingabe"]', "Aufsteller Halle");
    const feld = query<HTMLInputElement>('[data-rolle="radio-neucode-eingabe"]');
    await act(async () => {
      feld.dispatchEvent(
        new KeyboardEvent("keydown", { key: "Enter", keyCode: 13, bubbles: true }),
      );
    });
    expect(erstelleMock, "Enter legt nicht an").toHaveBeenCalledTimes(1);
  });
});

describe("radio-Zugaenge: die ZWEI Fehlerpfade — und der Klartext bleibt draussen", () => {
  /*
   * ⛔ DIE ZWEI AKTIONEN DIESER FLAECHE LIEFERN KEIN `{ ok, fehler }`. `erstelleCode` WIRFT
   * (`_actions/codes.ts:99-103`: „zwei UNIQUE-Konflikte auf zugangscodes.code in Folge"),
   * `setzeCodeAktiv` liefert `void` und wirft, wenn der Riegel oder die Datenbank es tut. Die
   * Flaeche zeigt deshalb ihren EIGENEN Text — es gibt keinen Servertext zum Durchreichen.
   *
   * ⛔ **UND SIE ZEIGT DIE GEFANGENE MELDUNG NICHT.** Das ist die Umsetzung der Auflage
   * `.superpowers/sdd/planteil4/briefs/V20.md:29`: „Er darf in keiner Protokollzeile und
   * keiner Fehlermeldung landen." Eine geworfene Server Action erreicht den Browser in
   * Produktion nur als Digest, unter `next dev` aber mit ihrem Text — und der naechste, der
   * `_actions/codes.ts` erweitert, koennte einen Code hineinschreiben, ohne dass hier etwas
   * rot wuerde. ⛔ DESHALB PRUEFT JEDER FALL BEIDE RICHTUNGEN: der Haustext steht da, UND der
   * Text der Ausnahme steht nirgends im Baum.
   */
  type Fehlerpfad = {
    /** Der Name der Action — er wird gegen die GEFUNDENE Menge geprueft, siehe unten. */
    action: string;
    mock: typeof setzeMock;
    text: string;
    ausloesen: () => Promise<void>;
  };

  /** ⛔ Sieht aus wie ein Klartext-Code und darf nirgends auf dem Bildschirm landen. */
  const GEHEIMNIS = "A3F7-K92M-QRTV-5X8Y";

  const FEHLERPFADE: Fehlerpfad[] = [
    {
      action: "erstelleCode",
      mock: erstelleMock,
      text: "Der Zugang konnte nicht ausgestellt werden.",
      ausloesen: async () => {
        await mount(<CodeTabelle zeilen={[]} />);
        await fill('[data-rolle="radio-neucode-eingabe"]', "Aufsteller Halle");
        await click('[data-rolle="radio-neucode-anlegen"]');
      },
    },
    {
      action: "setzeCodeAktiv",
      mock: setzeMock,
      text: "Der Zustand konnte nicht gespeichert werden.",
      ausloesen: async () => {
        await mount(<CodeTabelle zeilen={[zeile()]} />);
        await click('[data-rolle="radio-code-umschalten"]');
        await clickPortal(".ant-popconfirm .ant-btn-primary");
      },
    },
  ];

  it.each(FEHLERPFADE)(
    "$action: ein Wurf zeigt den Haustext, und die geworfene Meldung bleibt draussen",
    async (pfad) => {
      pfad.mock.mockRejectedValue(new Error(`[radio] kaputt, Code ${GEHEIMNIS}`));
      await pfad.ausloesen();

      expect(
        query('[data-rolle="radio-zugaenge-fehler"]').textContent,
        `${pfad.action}: der Fehlschlag bleibt stumm`,
      ).toBe(pfad.text);
      expect(
        document.body.textContent ?? "",
        `${pfad.action}: die geworfene Meldung steht auf dem Bildschirm`,
      ).not.toContain(GEHEIMNIS);
      expect(refreshMock, `${pfad.action}: nach einem Wurf wurde nachgeladen`).not.toHaveBeenCalled();
    },
  );

  it.each(FEHLERPFADE)("$action: der Erfolgsfall laedt die Liste nach", async (pfad) => {
    /*
     * ⛔ **DIE ZWEI AKTIONEN RUFEN KEIN `revalidatePath`** —
     * `/usr/bin/grep -n revalidatePath src/app/m/radio/_actions/codes.ts` liefert NICHTS
     * (gemessen 2026-08-26). Sie stammen aus Planteil 3, und V20 fasst `_actions/` nicht an
     * (`.superpowers/sdd/planteil4/VORABSCAN.md:640`, NS-A5). ⛔ OHNE DAS NACHLADEN STUENDE
     * NACH DEM ANLEGEN KEINE NEUE ZEILE DA und nach dem Sperren der alte Zustand — die
     * Flaeche saehe aus, als haette der Griff nichts getan.
     *
     * ⚠️ `router.refresh()` IST DIE HAUSFORM FUER GENAU DIESE LAGE
     * (`lagerbuch/verwaltung/(arbeit)/geraete/NeuGeraet.tsx:112`,
     * `.../geraete/[id]/GeraetForm.tsx:103`), nicht eine Erfindung dieser Aufgabe.
     */
    await pfad.ausloesen();
    expect(refreshMock, `${pfad.action}: die Liste wird nicht nachgeladen`).toHaveBeenCalled();
  });

  it("die Tafel deckt JEDE Action der Insel — die Menge ist gefunden, nicht aufgezaehlt", () => {
    /*
     * ⛔ RULING **R-V11-1**: die Sollwerttafel steht auf der EINEN Seite, die GEMESSENE Menge
     * auf der anderen. Eine dritte Action in der Insel — oder eine zweite Datei, die eine
     * ruft — macht diesen Fall rot, statt lautlos ohne Fehlerpfad-Fall zu bleiben.
     *
     * ⛔ MIT DER UNTERGRENZE AUS AUFLAGE 1 DESSELBEN RULINGS: mindestens ein
     * `_actions/`-Import muss wirklich gefunden worden sein. Ohne sie bliebe der Finder gruen,
     * der an einem umbenannten Ordner vorbeiliest — und die Tafel stuende gegen die leere
     * Menge.
     */
    const { namen, importe } = aktionenDerInsel();
    expect(importe, "kein _actions/-Import gefunden — der Finder ist nicht gelaufen").toBeGreaterThan(0);
    expect(namen.length, "die gefundene Menge ist leer").toBeGreaterThan(0);
    expect(
      FEHLERPFADE.map((pfad) => pfad.action).sort(),
      "eine Action der Insel hat keinen Fehlerpfad-Fall",
    ).toEqual(namen);
  });
});

describe("radio-Zugaenge: die Bauform der Insel und ihrer Seite", () => {
  it("die Datei der Insel traegt use client als erste Zeile", () => {
    /*
     * ⛔ FALLE 9 (Bauform-Zulaessigkeitstafel Nr. 1): die Tabelle traegt `render`-Funktionen,
     * und eine `render`-Funktion aus einer Server Component ist `Functions cannot be passed
     * directly to Client Components` — BEIM ABRUF. Fuer typecheck, lint und build unsichtbar.
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

  it("jede Datei der Flaeche traegt GENAU EINE benannte Textliste", () => {
    /*
     * ⛔ **GLOBAL CONSTRAINT, 1:1-TAFEL ABSCHNITT E** (`Spec:4815-4832`;
     * `.superpowers/sdd/planteil4/briefs/KOPF.md:1340`, woertlich): „Sie liegen in EINER
     * benannten Konstantenliste je Flaeche, nicht inline verstreut — sonst ist die naechste
     * Formulierungsaenderung eine Suche ueber neun Dateien."
     *
     * ⛔ **UND HIER FEHLT DIE ZWEITE HAELFTE DES V19-FALLES, MIT GRUND.** Dort heisst derselbe
     * Fall „… und der Satz der E-Tafel steht darin" und prueft zusaetzlich einen woertlich
     * wandernden Satz (`versionen/VersionenTabelle.test.tsx:729`). ⛔ FUER DIESE FLAECHE GIBT
     * ES KEINEN: die Tafel in `.superpowers/sdd/planteil4/briefs/KOPF.md:1322-1339` fuehrt
     * dreizehn Zeilen, KEINE davon aus einer Codeverwaltung — es gibt im Alt-Bestand keine
     * (`_lib/lesepfade/codes.ts`, Dateikopf, mit der Messung). ⛔ EINE HALBIERTE ZUSICHERUNG
     * IST HIER DIE EHRLICHE; die Klasse „ein Text steht ausserhalb der Liste" bewachen die
     * zwei Faelle darunter vollstaendig.
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
  });

  it("kein Wert der Textliste steht ein zweites Mal im Quelltext", () => {
    /*
     * ⛔ **DIE ERSTE DER ZWEI KLASSEN-HAELFTEN ZU FUND F7** (REVIEW-V19): jeder Wert der Liste
     * kommt im kommentarfreien Quelltext seiner Datei GENAU EINMAL vor — naemlich in der
     * Liste. Wer einen davon inline ins JSX zurueckschreibt und den Listeneintrag stehen
     * laesst (der dann TOTE Eintrag faellt weder `typecheck` noch `lint` auf, weil das Objekt
     * als ganzes weiter benutzt wird), macht daraus ZWEI.
     *
     * ⛔ GEZAEHLT WIRD DAS LITERAL MITSAMT SEINEN ANFUEHRUNGSZEICHEN, nicht der blosse Text.
     */
    for (const pfad of flaechenDateien()) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      const { werte, gefunden } = textListe(quelle);
      expect(gefunden, `${pfad}: keine benannte Textliste gefunden`).toBe(true);
      expect(
        werte.length,
        `${pfad}: die Textliste ist leer — dieser Fall liefe ins Leere`,
      ).toBeGreaterThan(0);
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
     * einen Listeneintrag hatte. Drei Zweige, weil ein Text auf drei Wegen ins JSX kommt: als
     * verdaechtiges LITERAL, als textfuehrendes ATTRIBUT und als blankes JSX-TEXTKIND. Die
     * Begruendung je Zweig und die Sonden dazu stehen an den Konstanten oben.
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
     * ⛔ **FALLE 4 ALS QUELLTEXT-ZUSICHERUNG** — die Verwaltung laeuft in `FullShell` mit
     * `controlHeight: 44` (`src/core/theme/theme.ts:207-209`), auch auf dem Telefon. Platz
     * schafft `scroll={{ x: "max-content" }}`, nicht `size`.
     *
     * ⚠️ ER IST NICHT DER EINZIGE WAECHTER (derselbe Scan laeuft modulweit ueber JEDE `.tsx`,
     * `_ui/AusleihRahmen.test.tsx:210-214`) — dieser hier steht an der Flaeche und nennt sie
     * beim Namen.
     */
    const gefunden = inselDateien();
    expect(gefunden, "eine Datei ist dazugekommen oder verschwunden").toEqual(INSEL_SOLL);
    for (const datei of gefunden) {
      const quelle = ohneKommentare(readFileSync(`${INSEL_ORDNER}/${datei}`, "utf8"));
      expect(
        quelle,
        `${datei}: ein size-Attribut an einem antd-Bedienelement (Falle 4)`,
      ).not.toMatch(/\bsize=\{?["']?(?:small|large)/);
    }
    const tabelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(tabelle, "ohne scroll bricht die Tabelle auf 390 px").toMatch(
      /scroll=\{\{ x: "max-content" \}\}/,
    );
    /*
     * ⛔ KEINE BLAETTERUNG. Die Tabelle liegt in der Groessenordnung „Zahl der Aufsteller"
     * (`_db/schema.ts:193-195`), und eine Blaetterung schnitte die Liste, aus der V21 das
     * Druckblatt setzt, in Seiten.
     */
    expect(tabelle, "die Zugangsliste blaettert").toMatch(/pagination=\{false\}/);
  });

  it("kein roter Ton auf der Datenflaeche — Rot gehoert den zerstoerenden Knoepfen", () => {
    /*
     * ⛔ **FALLE 3** (`.superpowers/sdd/planteil4/briefs/KOPF.md:220-224`):
     * `colorError === colorPrimary === FARBEN.rot` (`src/core/theme/theme.ts:32-33`) — ein
     * roter Kasten oder ein `danger`-Knopf saehe aus wie die Primaeraktion.
     *
     * ⛔ UND HIER GIBT ES KEINEN ZERSTOERENDEN KNOPF: Sperren LOESCHT NICHTS und ist
     * umkehrbar — der Entsperr-Knopf daneben ist der Beweis. `danger` an dieser Stelle waere
     * die Farbe der Loeschung an einer Flaeche, die ausdruecklich keine hat (NS-A6).
     * ⚠️ Ein `Tag color="error"` am Wort „gesperrt" faellt unter dieselbe Zeile.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_TABELLE, "utf8"));
    expect(quelle, "ein danger-Knopf auf einer Flaeche ohne Loeschung (Falle 3)").not.toMatch(
      /\bdanger\b/,
    );
    expect(quelle, "ein Fehlerton auf einer Datenflaeche (Falle 3)").not.toMatch(
      /(?:color|type)=["']error["']/,
    );
  });

  it("die Insel zieht _db/ oder drizzle-orm nicht in den Browser", () => {
    /*
     * ⛔ DER FEHLER WAR IN V13 EINMAL GEBAUT, und alle fuenf Tore blieben gruen. ⛔ HIER IST
     * DIE GEFAHR NAMENTLICH: `_lib/lesepfade/codes.ts` traegt den Typ `CodeZeile` UND
     * importiert `_db/schema` als WERT — der Bezug darauf MUSS ein `import type` sein, und ein
     * `import type` ist eine EIGENE Anweisung, kein `type` in einer gemischten Klammer
     * (`_lib/csv/klassifizieren.ts:6-9`).
     *
     * ⛔ ER FOLGT DEM IMPORTGRAPHEN, ER LIEST NICHT NUR DIE WURZELN (Ruling R-V11-3), und
     * `"use server"`-Module sind der Schnitt: `_actions/codes.ts` laeuft auf dem Server, seine
     * Importe erreichen kein Bundle.
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
     * Insel-Grenze gehen nur serialisierbare, VORFORMATIERTE Werte; die zwei Aktionen
     * importiert die Insel DIREKT.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Action als Prop").not.toMatch(/=\{[^}]*(?:Action|erstelleCode|setzeCodeAktiv)\b/);
    expect(quelle, "eine Pfeilfunktion als Prop").not.toMatch(/=\{[^}]*=>/);
    expect(quelle, "ein Date in der Seite").not.toMatch(/\bnew Date\(/);
  });

  it("die Seite legt keine Spaltendefinition an und traegt keine Tabelle", () => {
    /*
     * ⛔ **FALLE 9, UND SIE IST DIE ZENTRALE ZEILE DIESES PLANTEILS**
     * (Bauform-Zulaessigkeitstafel Nr. 1): `columns={[{ render: fn }]}` aus einer Server
     * Component ist `Error: Functions cannot be passed directly to Client Components` — BEIM
     * ABRUF, nicht beim Uebersetzen. In jsdom gibt es keine RSC-Grenze; dieser Quelltext-Scan
     * ist deshalb der einzige Vitest-Waechter, und der echte Abruf ist V23s Fall 9.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE_SEITE, "utf8"));
    expect(quelle, "eine Spaltendefinition in der Server Component").not.toMatch(/\bcolumns\s*=/);
    expect(quelle, "eine antd-Tabelle in der Server Component").not.toMatch(/<Table\b/);
  });

  it("weder die Insel noch die Seite ruft message oder App.useApp", () => {
    /*
     * ⛔ KEIN TOAST — Entscheidung E6 (`Spec:3754-3776`), im Modul mehrfach ausgeschrieben
     * (`_ui/RueckgabeDialog.tsx:311-315`, `geraete/NeuGeraetModal.tsx:40-45`,
     * `geraete/[id]/GeraetLoeschen.tsx:46-49`): in `src/app` gibt es keinen Aufruf von
     * `message.*` oder `App.useApp()`. Der Erfolg bleibt trotzdem sichtbar — die Liste laedt
     * nach, die neue Zeile steht oben, und das Feld ist leer.
     */
    for (const pfad of [QUELLE_TABELLE, QUELLE_SEITE]) {
      const quelle = ohneKommentare(readFileSync(pfad, "utf8"));
      expect(quelle, `${pfad}: ein Toast (Entscheidung E6)`).not.toMatch(
        /\bmessage\s*\.\s*(?:success|error|warning|info)\b|\bApp\s*\.\s*useApp\s*\(/,
      );
    }
  });

  it("die Stelle fuer den Blatt-Link steht als benannte Leerstelle mit Nachfolger da", () => {
    /*
     * ⛔ **V20 LAESST DIE STELLE FREI, V21 TRAEGT EIN**
     * (`.superpowers/sdd/planteil4/briefs/V20.md:45-47`): „ein Link auf eine 404 ist schlimmer
     * als kein Link" — dieselbe Regel wie bei V14/V15. `admin/(druck)/zugaenge/blatt/page.tsx`
     * gibt es heute nicht, und `riegel.test.ts` zaehlt neun Seiten, nicht zehn.
     *
     * ⛔ DIESER FALL IST DIE UEBERGABE, NICHT EINE NOTIZ. Ohne ihn haengt sie an einem
     * Kommentar, den eine Umformatierung mitnimmt; mit ihm faellt sein Verschwinden auf.
     * ⚠️ GELESEN WIRD DER ROHE DATEITEXT — der Anker IST der Kommentar.
     *
     * ⚠️ DIE SPANNE GEHT UEBER ZEILENGRENZEN, UND DAS IST GEMESSEN (2026-08-26): eine erste
     * Fassung suchte `⬜[^\n]*V21` und war ROT ueber der korrekten Seite — `prettier` und die
     * Zeilenbreite dieses Hauses brechen den Kommentar, und die zwei Anker stehen auf
     * verschiedenen Zeilen. ⛔ DIE OBERGRENZE VON 600 ZEICHEN BLEIBT: ohne sie faende der
     * Ausdruck ein ⬜ irgendwo oben in der Datei und ein `V21` irgendwo unten und waere gruen
     * ueber zwei Dingen, die nichts miteinander zu tun haben.
     */
    const roh = readFileSync(QUELLE_SEITE, "utf8");
    expect(roh, "die Leerstelle fuer das Druckblatt fehlt in der Seite").toMatch(
      /⬜[\s\S]{0,600}V21/,
    );
    expect(
      ohneKommentare(roh),
      "die Seite verlinkt das Druckblatt bereits — es gibt es noch nicht (V21)",
    ).not.toMatch(/\/admin\/zugaenge\/blatt/);
  });
});
