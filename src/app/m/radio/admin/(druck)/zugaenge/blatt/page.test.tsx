// src/app/m/radio/admin/(druck)/zugaenge/blatt/page.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../../../../_db/schema";
import { zugangscodes } from "../../../../_db/schema";
import { ohneKommentare } from "../../../../_lib/quelltextScan";

/**
 * DAS DRUCKBARE ZUGANGSBLATT AN `/admin/zugaenge/blatt` (Aufgabe V21; `Spec:314`,
 * `Spec:4378`).
 *
 * ⛔ WARUM DIESE DATEI ueberhaupt steht, obwohl der Aufgabenbrief sie nicht fuehrt
 * (`.superpowers/sdd/planteil4/briefs/V21.md:3-5`): ohne sie bewacht in Vitest NICHTS die
 * drei Entscheidungen dieser Flaeche — den `aktiv`-Filter, die QR-Nutzlast
 * `<basis>/t/<code>` ohne Parameter und ohne Base64 (gesetzte Entscheidung 8, `Spec:64`),
 * und die Herkunft der Basis aus `moduleUrl` statt aus einem faelschbaren Kopf. Der
 * Playwright-Fall 5a (`Spec:4883-4885`, `briefs/V21.md:40-43`) prueft die ABWESENHEIT von Kopfzeile und
 * Navigationsleiste und saehe keinen davon. ⛔ Dieselbe Begruendung und dieselbe Form wie
 * `admin/(arbeit)/page.test.tsx:28-34`.
 *
 * ⛔ DIE SEITENFUNKTION WIRD GERUFEN UND IHR ERGEBNIS ALS ELEMENTBAUM GELESEN — nicht
 * gemountet. Sie ist eine ASYNC Server Component; `mount()` treibt eine solche nicht an.
 * Der Baumlaeufer ist die Hausform (`admin/(arbeit)/page.test.tsx:122-134`) und damit KEIN
 * zweites DOM-Harness (`CLAUDE.md`, „Tests") — er rendert nichts.
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()`
 * (`.superpowers/sdd/planteil4/briefs/KOPF.md:268-270`): dessen Cache ist per
 * MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`).
 *
 * ⛔ WAS DIESE DATEI NICHT BELEGT: dass der Riegel bei einem ECHTEN Abruf GREIFT (⬜ V-L3,
 * abzulesen in V23), und dass das Druckbild stimmt. Papier sieht kein Test — was messbar
 * ist, ist die BAUFORM des Stylesheets, und die steht im zweiten Block dieser Datei.
 */

const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const QUELLE = "src/app/m/radio/admin/(druck)/zugaenge/blatt/page.tsx";
const STYLESHEET = "src/app/m/radio/admin/(druck)/druck.css";
const LAYOUT = "src/app/m/radio/admin/(druck)/layout.tsx";

const riegel = vi.hoisted(() => vi.fn());
const dbGeholt = vi.hoisted(() => vi.fn());
const halter = vi.hoisted(() => ({ db: null as unknown, basis: null as string | null }));
const qrRufe = vi.hoisted(() => [] as string[]);

/*
 * ⛔ DER RIEGEL WIRD ERSETZT, NICHT UMGANGEN: sein Koerper ruft `headers()` und `auth()`
 * (`_lib/zugang.ts`, `riegelAufStufe`), beides gibt es in diesem Prozess nicht. WAS er tut,
 * gehoert `_lib/zugang.test.ts`; hier zaehlt nur, DASS die Seite ihn ruft — und wann.
 */
vi.mock("../../../../_lib/zugang", () => ({
  requireRadioAdmin: async () => {
    riegel();
    return { viewer: { sub: "u-1", name: "Testperson", groups: [] }, rolle: "admin" as const };
  },
}));

vi.mock("../../../../_db/client", () => ({
  getDb: () => {
    dbGeholt();
    return halter.db;
  },
}));

/*
 * ⛔ `moduleUrl` WIRD ERSETZT, WEIL BEIDE ZWEIGE GEPRUEFT WERDEN MUESSEN: mit gesetzter
 * Basis und ohne. Der `null`-Zweig ist KEIN Randfall, sondern der Zustand VOR dem Cutover —
 * die Registry fuehrt fuer `radio` `prodHosts: []` (`src/core/registry.ts:198`), und in
 * Produktion liefert `moduleUrl` dann `null` (`src/core/shell/moduleUrl.ts:19-22`).
 */
vi.mock("@/core/shell/moduleUrl", () => ({
  moduleUrl: () => halter.basis,
}));

/*
 * ⛔ `qrSvg` WIRD ERSETZT, UM DIE NUTZLAST ZU MESSEN, nicht um sie zu vermeiden: was aus
 * einer Zeichenkette ein SVG macht, gehoert `src/core/qr/qr.test.ts`. Hier ist die Frage,
 * WAS in den Code kodiert wird — und das ist die einzige Stelle, an der ein Parameter oder
 * ein Base64-Anhang je entstehen koennte (gesetzte Entscheidung 8, `Spec:64`, `Spec:6767`).
 */
vi.mock("@/core/qr", () => ({
  qrSvg: async (text: string) => {
    qrRufe.push(text);
    return `<svg data-sonde="${text}"></svg>`;
  },
}));

import BlattSeite from "./page";

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-zugangsblatt-"));
  sqlite = openModuleDatabase(join(tmp, "radio.db"));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
  halter.db = db;
  halter.basis = "https://radio.example.test";
  qrRufe.length = 0;
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
});

function zugang(werte: {
  id: string;
  code: string;
  bezeichnung: string;
  aktiv?: boolean;
  createdAt: Date;
}) {
  db.insert(zugangscodes)
    .values({ aktiv: true, createdBy: "u-1", ...werte })
    .run();
}

/** Alle Elemente mit einem bestimmten `data-rolle` — ueber ALLE Props, nicht nur `children`. */
function elementeMitRolle(wert: ReactNode, rolle: string): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeMitRolle(kind, rolle));
  if (!isValidElement(wert)) return [];
  const props = wert.props as Record<string, unknown>;
  const treffer = props["data-rolle"] === rolle ? [wert] : [];
  const kinder = Object.values(props) as ReactNode[];
  return [...treffer, ...kinder.flatMap((kind) => elementeMitRolle(kind, rolle))];
}

/**
 * Alle `href`-Ziele des Baumes. ⛔ UEBER ALLE PROPS, nicht nur `children` — dieselbe Form wie
 * `elementeMitRolle` oben.
 */
function zieleImBaum(wert: ReactNode): string[] {
  if (Array.isArray(wert)) return wert.flatMap(zieleImBaum);
  if (!isValidElement(wert)) return [];
  const props = wert.props as Record<string, unknown>;
  const eigen = typeof props.href === "string" ? [props.href] : [];
  const kinder = Object.values(props) as ReactNode[];
  return [...eigen, ...kinder.flatMap(zieleImBaum)];
}

/** Der reine Text eines Teilbaums. */
function text(wert: ReactNode): string {
  if (wert === null || wert === undefined || typeof wert === "boolean") return "";
  if (Array.isArray(wert)) return wert.map(text).join("");
  if (isValidElement(wert)) return text((wert.props as { children?: ReactNode }).children);
  return String(wert);
}

async function seite(): Promise<ReactNode> {
  return (await BlattSeite()) as ReactNode;
}

describe("das Druckblatt an /admin/zugaenge/blatt", () => {
  it("ruft den Riegel, BEVOR sie die Datenbank oeffnet", async () => {
    /*
     * ⛔ DIE REIHENFOLGE IST DIE AUSSAGE, nicht die Anwesenheit: `Spec:4378` gibt der Seite
     * den Riegel als ERSTE Anweisung. Ein `getDb()` davor laese die Codeliste im Klartext
     * fuer eine Person, die die Seite gar nicht sehen darf — und der Elementbaum saehe
     * danach identisch aus. Dieselbe Messung wie `admin/(arbeit)/page.test.tsx:179-192`.
     */
    zugang({ id: "z1", code: "AAAA-BBBB", bezeichnung: "Halle", createdAt: new Date("2026-05-01T10:00:00Z") });
    riegel.mockImplementationOnce(() => {
      expect(dbGeholt, "getDb() lief VOR dem Riegel").not.toHaveBeenCalled();
    });
    await seite();
    expect(riegel).toHaveBeenCalledTimes(1);
    expect(dbGeholt).toHaveBeenCalled();
  });

  it("ein gesperrter Zugang steht NICHT auf dem Bogen", async () => {
    /*
     * ⛔ DER FILTER IST DIE TRAGENDE ENTSCHEIDUNG DIESER SEITE, und er ist die UMKEHRUNG der
     * Zusage des Lesepfads: „ein gesperrter Zugang BLEIBT in der Liste"
     * (`_lib/lesepfade/codes.ts:167-172`). Die Verwaltungsliste zeigt die Geschichte, der
     * Bogen zeigt, was gilt — ein gesperrter Code auf einem geklebten Aufsteller ist ein QR,
     * der ins Leere fuehrt.
     *
     * ⛔ ZWEI HAELFTEN, UND DIE ZWEITE IST NICHT DIE ERSTE: dass der aktive Zugang DA ist,
     * und dass der gesperrte FEHLT. Ohne die erste bestuende der Fall auch ueber einem
     * leeren Bogen; ohne die zweite bewachte er den Filter nicht.
     */
    zugang({ id: "z1", code: "AAAA-1111", bezeichnung: "Halle", createdAt: new Date("2026-05-01T10:00:00Z") });
    zugang({
      id: "z2",
      code: "BBBB-2222",
      bezeichnung: "Verlorenes Kaertchen",
      aktiv: false,
      createdAt: new Date("2026-05-02T10:00:00Z"),
    });

    const baum = await seite();
    const karten = elementeMitRolle(baum, "radio-blatt-karte");
    expect(karten.length, "der gesperrte Zugang steht mit auf dem Papier").toBe(1);
    expect(text(karten[0])).toContain("AAAA-1111");
    expect(text(baum), "der gesperrte Code wurde gedruckt").not.toContain("BBBB-2222");
  });

  it("die QR-Nutzlast ist die vollstaendige aeussere URL, ohne Parameter und ohne Base64", async () => {
    /*
     * ⛔ `Spec:2115-2122` und `Spec:3249`, woertlich: „QR-Nutzlast ist die vollstaendige
     * aeussere URL: `https://radio.iuk-ue.de/t/<code>`. Kein Parameter, kein Base64, kein
     * Token im Query-String — genau der Mechanismus, der nach Entscheidung 8 ausgeschlossen
     * ist." Der Alt-Code setzt `url.searchParams.set('token', btoa(token))`.
     *
     * ⛔ GEMESSEN WIRD, WAS AN `qrSvg` GEHT, nicht was danebensteht: der sichtbare
     * URL-Text koennte richtig sein und der KODIERTE Wert trotzdem falsch — und der
     * Unterschied faellt erst auf, wenn jemand ein gedrucktes Kaertchen scannt.
     *
     * ⛔ DER BINDESTRICH IST TEIL DES WERTES (`Spec:2057`) und wandert ungefiltert in die
     * Pixel; `code` wird zeichengleich gespeichert und nie normalisiert (`Spec:1117`).
     */
    zugang({
      id: "z1",
      code: "A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW",
      bezeichnung: "Halle",
      createdAt: new Date("2026-05-01T10:00:00Z"),
    });

    const baum = await seite();
    expect(qrRufe).toEqual(["https://radio.example.test/t/A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW"]);
    expect(qrRufe[0], "die Nutzlast traegt einen Parameter").not.toContain("?");
    expect(text(baum), "die URL steht nicht als Klartext daneben").toContain(
      "https://radio.example.test/t/A3F7-K92M-QRTV-5X8Y-B6HN-2DPZ-J4KW",
    );
  });

  it("ohne konfigurierte Basis entsteht KEIN erfundener Host und KEIN QR-Code", async () => {
    /*
     * ⬜ DIE BENANNTE LEERSTELLE ⬜ V-L2 / E1 IN IHRER GEBAUTEN FORM. `moduleUrl("radio")`
     * liest aus `SUITE_HOST_RADIO` (`src/core/shell/moduleUrl.ts:11-13`), die Registry fuehrt
     * `prodHosts: []` (`src/core/registry.ts:198`) — vor dem Cutover ist der Wert in
     * Produktion `null`.
     *
     * ⛔ EIN RUECKFALL AUF DEN ANGEFRAGTEN HOST WAERE DIE ERFINDUNG, GEGEN DIE DIE EISERNE
     * REGEL STEHT, und er waere zugleich eine Sicherheitsluecke: der angefragte Host stammt
     * aus `x-forwarded-host` und ist faelschbar (`lagerbuch/_db/etiketten.ts:44-57`). Ein
     * manipulierter Kopf druckte einen ganzen Bogen auf eine fremde Domain.
     *
     * ⛔ UND DIE CODELISTE WIRD DANN GAR NICHT ERST GELESEN — sie ist das Geheimnis
     * (`Spec:2249-2250`), und ohne Basis gibt es nichts zu drucken.
     */
    halter.basis = null;
    zugang({ id: "z1", code: "AAAA-1111", bezeichnung: "Halle", createdAt: new Date("2026-05-01T10:00:00Z") });

    const baum = await seite();
    expect(elementeMitRolle(baum, "radio-blatt-basis-fehlt").length, "der Zustand fehlt").toBe(1);
    expect(text(baum), "die Variable wird nicht beim Namen genannt").toContain("SUITE_HOST_RADIO");
    expect(elementeMitRolle(baum, "radio-blatt-karte").length, "ein Bogen ohne Basis").toBe(0);
    expect(qrRufe, "ein QR-Code auf einen erfundenen Host").toEqual([]);
    expect(text(baum), "der Code steht trotzdem im Klartext da").not.toContain("AAAA-1111");
  });

  it("ein leerer Bogen ist ein benannter Zustand, keine leere Seite", async () => {
    /*
     * Global Constraint „jeder gestaltete Zustand traegt einen benannten Weg zurueck"
     * (Hausvorbild `lagerbuch/verwaltung/(druck)/etiketten/page.tsx:71-90`, dort als
     * Betreiberentscheidung vom 10.08.2026 ausgeschrieben). Ohne diesen Zweig ist ein Bogen
     * ohne aktiven Zugang von einem GEBROCHENEN Bogen nicht zu unterscheiden.
     */
    const baum = await seite();
    expect(elementeMitRolle(baum, "radio-blatt-leer").length, "der leere Bogen sagt nichts").toBe(1);
    expect(elementeMitRolle(baum, "radio-blatt-karte").length).toBe(0);
  });

  it("verlinkt zurueck auf die Zugangsverwaltung — als echtes Ziel, nicht als Satz", async () => {
    /*
     * ⛔ DER AEUSSERE PFAD, NICHT DER INNERE: `(druck)` ist eine Route-Group und in der URL
     * unsichtbar (`Spec:320-322`); `/m/radio/...` waere der interne Pfad und fuehrte am
     * Modul-Host vorbei.
     *
     * ⛔ GEPRUEFT WIRD DAS `href`, NICHT DER TEXT — UND DAS IST EINE GEMESSENE KORREKTUR
     * (Sonde **P5**, 2026-08-26): die erste Fassung las den Text des Baumes und den rohen
     * Quelltext auf `"/admin/zugaenge"`. Das `<a>` durch ein `<span>` zu ersetzen liess
     * BEIDE Zusicherungen stehen — `16 passed`, **0 rot**. Ein Zustand mit einem
     * unklickbaren Satz „Zurück zur Zugangsverwaltung" ist genau die Sackgasse, gegen die
     * der Global Constraint steht.
     */
    const baum = await seite();
    const ziele = zieleImBaum(baum);
    expect(ziele, "der Rueckweg ist kein anklickbares Ziel").toContain("/admin/zugaenge");
    expect(text(baum)).toContain("Zurück zur Zugangsverwaltung");
  });
});

describe("das Druckblatt ist KEINE Insel — die Bauform, die kein Tor sonst prueft", () => {
  /*
   * ⛔ DIESER BLOCK IST DER EINZIGE WAECHTER DER AUFLAGE „KEINE INSEL"
   * (`.superpowers/sdd/planteil4/briefs/KOPF.md:1386-1389`, `briefs/V21.md:14-15`).
   * `riegel.test.ts` verbietet die zwei Bauform-Direktiven nur unter `_lib/` und `_db/`
   * (Block „keine Bauform-Direktive unter _lib/ und _db/"), NICHT unter `admin/`. Ein
   * `"use client"` hier waere typkorrekt, lint-sauber und fuer `pnpm build` unsichtbar — und
   * es hiesse, dass etwas Interaktives auf dem Papier gelandet ist.
   */
  const quelle = () => ohneKommentare(readFileSync(QUELLE, "utf8"));

  it("traegt keine Bauform-Direktive", () => {
    expect(quelle(), 'die Seite traegt "use client"').not.toMatch(/["']use client["']/);
    expect(quelle(), 'die Seite traegt "use server"').not.toMatch(/["']use server["']/);
  });

  it("importiert kein antd und kein Zeichenpaket", () => {
    /*
     * ⛔ FALLE 1 UND FALLE 7 STRUKTURELL AUSGESCHLOSSEN, nicht bloss beachtet — dieselbe
     * Entscheidung und dieselbe Begruendung wie beim Hausvorbild
     * (`lagerbuch/verwaltung/(druck)/etiketten/page.tsx:25-30`): „Der einfachste Weg, beide
     * Fallen strukturell auszuschliessen, ist: gar kein antd hier."
     * ⛔ `@ant-design/icons` ist modulweit verboten, auch in Client-Inseln (`CLAUDE.md`,
     * Falle 7): HTTP 500 BEIM IMPORT, waehrend typecheck und build gruen bleiben.
     */
    expect(quelle(), "ein antd-Import auf einer Druckseite").not.toMatch(/from\s+["']antd/);
    expect(quelle(), "ein Zeichenpaket-Import").not.toMatch(/@ant-design\/icons|react-icons|lucide/);
  });

  it("erzeugt den QR-Code serverseitig ueber @/core/qr und nicht ueber ein zweites Verfahren", () => {
    /*
     * ⛔ VORABSCAN-FUND **F13** (`.superpowers/sdd/planteil4/VORABSCAN.md:368-382`): der Plan
     * nennt kein QR-Verfahren, und „ein Bauender, der stattdessen zu einer
     * React-QR-Komponente greift, erzwingt genau die Insel, die V21 verbietet — und der
     * Fehler ist erst im Druckbild sichtbar." Das Haus fuehrt das serverseitige Verfahren
     * bereits (`src/core/qr/index.ts:1`, `package.json`: `qrcode`).
     *
     * ⛔ UND KEIN BASE64 IM ERZEUGUNGSPFAD (`Spec:6767`, gesetzte Entscheidung 8): der
     * heutige Alt-Code traegt den geteilten Token base64-kodiert als URL-Parameter.
     */
    expect(quelle(), "der QR entsteht nicht ueber den gemeinsamen Baustein").toMatch(
      /from\s+["']@\/core\/qr["']/,
    );
    expect(quelle(), "Base64 im QR-Erzeugungspfad").not.toMatch(/\bbtoa\s*\(|toString\(\s*["']base64["']\s*\)/);
  });

  it("zieht das Druckstylesheet selbst — das (druck)-Layout bleibt ohne", () => {
    /*
     * ⛔ `admin/(druck)/layout.tsx:39-40` sagt woertlich: „KEIN Stylesheet-Import:
     * `lagerbuch` zieht hier `./druck.css`. Das Druckbild von `radio` gehoert zu Planteil 4,
     * MIT dem Blatt." Das Layout ist nicht Teil dieser Aufgabe
     * (`.superpowers/sdd/planteil4/briefs/V21.md:66-72`), und die zweite Haelfte hier haelt
     * genau das fest: ein spaeterer Import dort waere ein zweiter Ort fuer dieselbe Regel.
     */
    expect(quelle(), "die Seite zieht ihr eigenes Druckstylesheet nicht").toMatch(
      /import\s+["']\.\.\/\.\.\/druck\.css["']/,
    );
    expect(
      ohneKommentare(readFileSync(LAYOUT, "utf8")),
      "das (druck)-Layout zieht das Stylesheet ebenfalls — zwei Orte fuer dieselbe Regel",
    ).not.toMatch(/druck\.css/);
  });
});

describe("druck.css: die vier Verbote und die zwei Zeilen, die den QR retten", () => {
  /*
   * ⛔ VORBILD UND BEGRUENDUNG: `lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts`. Ein
   * Druckstylesheet ist die einzige Bauform dieses Hauses, deren Fehler NUR am Drucker
   * sichtbar werden — auf gekauftem Material und mit Verzoegerung.
   */
  const blatt = () => ohneKommentare(readFileSync(STYLESHEET, "utf8"));

  /**
   * ⛔ ALLE `.css`-DATEIEN DES MODULS — GEFUNDEN, NICHT AUFGEZAEHLT (R-V11-1,
   * `.superpowers/sdd/planteil4/progress.md`). Die zwei Faelle darunter bewachen eine
   * Fehlerklasse, die in einer NEUEN Datei entstehen kann; ein Scan, der `STYLESHEET`
   * beim Namen liest, saehe sie dort nicht. Vorbild mit derselben Reichweite:
   * `lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts:148` („enthaelt NIRGENDS body * —
   * in keiner CSS-Datei des Moduls").
   */
  function modulCssDateien(wurzel = "src/app/m/radio"): string[] {
    const treffer: string[] = [];
    for (const eintrag of readdirSync(wurzel)) {
      const pfad = join(wurzel, eintrag);
      if (statSync(pfad).isDirectory()) {
        treffer.push(...modulCssDateien(pfad));
        continue;
      }
      if (eintrag.endsWith(".css")) treffer.push(pfad);
    }
    return treffer;
  }

  /**
   * ⛔ EINE UNTERGRENZE, KEINE EXAKTE ZAHL — sie belegt nur, dass der Baum gelesen wurde.
   * Gemessen am 2026-08-26 sind es **drei** (`_ui/ausleihe.module.css`,
   * `_ui/verwaltung.module.css`, `admin/(druck)/druck.css`); eine exakte Zahl waere eine
   * Konstante, die jede spaetere Flaeche ohne Erkenntnisgewinn anhebt.
   */
  const MODUL_CSS_MINDESTENS = 2;

  it("kehrt die Sichtbarkeit nicht um und greift nie auf body *", () => {
    /*
     * ⛔ FALLE 43, UND SIE WAR MODULUEBERGREIFEND: `body * { visibility: hidden }` stand in
     * `globals.css`, und ein zweites Vorkommen leerte JEDE andere Druckseite der Suite
     * (feedback-Aushang, files-Zugangslinks). Die Sichtbarkeitsumkehr wird hier ersatzlos
     * durch die eigene Route-Group ersetzt: ohne Shell gibt es nichts auszublenden
     * (`lagerbuch/verwaltung/(druck)/druck.css:8-15`).
     * ⚠️ DIE REGEL IST HEUTE FORT — gemessen 2026-08-26, `/usr/bin/grep -rn "body \*" src`
     * findet sie in keinem Stylesheet mehr, und `globals.css` hat 231 Zeilen (die drei
     * `lagerbuch`-Anker auf `globals.css:277` sind veraltet). ⛔ DIESER FALL BEWACHT DESHALB
     * DIE RUECKKEHR DER FORM, nicht eine bestehende Zeile — genau die Rolle, die
     * `lagerbuch/verwaltung/(druck)/etiketten/druck.test.ts:148` fuer sein Modul haelt.
     * ⛔ UND ER LIEST DEN GANZEN MODULBAUM, NICHT NUR DIESE DATEI: die Fehlerklasse kann in
     * einer NEUEN `.css` entstehen, und ein Scan, der `STYLESHEET` beim Namen nennt, saehe sie
     * dort nicht (R-V11-1).
     */
    const dateien = modulCssDateien();
    expect(dateien.length, "der Modulbaum wurde nicht gelesen — der Scan waere leer-gruen")
      .toBeGreaterThanOrEqual(MODUL_CSS_MINDESTENS);
    const verstoesse = dateien
      .filter((pfad) => /visibility\s*:\s*hidden|body\s*\*/.test(ohneKommentare(readFileSync(pfad, "utf8"))))
      .map((pfad) => `${pfad}: Sichtbarkeitsumkehr oder body *-Selektor`);
    expect(verstoesse).toEqual([]);
  });

  it("GENAU EINE CSS-Datei des Moduls traegt einen @media print-Block, und es ist diese", () => {
    /*
     * ⛔ DIESELBE SORGE WIE OBEN, EINE STUFE FRUEHER: Druckregeln, die sich ueber mehrere
     * Stellen verteilen, leeren sich gegenseitig Seiten — daran ist die Sichtbarkeitsumkehr
     * in `lagerbuch` gescheitert (Falle 43, ausgeschrieben in
     * `lagerbuch/verwaltung/(druck)/druck.css:127-136`). ⛔ Ein zweites Druck-Stylesheet in
     * diesem Modul waere der erste Schritt dorthin, und kein anderes Tor saehe es.
     *
     * ⛔ GEFUNDEN, NICHT GENANNT: der Sollwert steht auf der RECHTEN Seite des `toEqual`
     * gegen die GEMESSENE Menge (R-V11-1). Gemessen am 2026-08-26 traegt genau eine der drei
     * `.css`-Dateien des Moduls einen `@media print`-Block.
     */
    const mitDruck = modulCssDateien()
      .filter((pfad) => ohneKommentare(readFileSync(pfad, "utf8")).includes("@media print"))
      .map((pfad) => pfad.replace(/\\/g, "/"))
      .sort();
    expect(mitDruck, "ein zweites Druck-Stylesheet im Modul").toEqual([STYLESHEET]);
  });

  it("liest keine antd-Variable, greift auf keine antd-Klasse und auf kein nacktes input", () => {
    /*
     * ⛔ FALLE 2: antd deklariert seine Variablen auf der Scope-Klasse SEINER Bauteile — auf
     * eigenem Markup waeren sie still leer. ⛔ Eine Regel gegen einen antd-INTERNEN
     * Klassennamen ist eine Kopplung, die ein antd-Major still bricht.
     * ⛔ Ein nackter `input`-Selektor traefe jedes Eingabefeld der Suite, sobald das
     * Stylesheet in einem anderen Zweig geladen wuerde.
     */
    expect(blatt(), "eine --ant-Variable").not.toMatch(/--ant-/);
    expect(blatt(), "ein antd-interner Klassenselektor").not.toMatch(/\.ant-/);
    expect(blatt(), "ein nackter input-Selektor").not.toMatch(/(^|[\s,>+~])input\s*[,{]/m);
  });

  it("gibt dem qrcode-SVG eine Breite und eine Hoehe", () => {
    /*
     * ⛔ GEMESSEN BEIM NACHBARN: das `qrcode`-SVG bringt nur eine `viewBox` mit, KEINE
     * Breite und keine Hoehe (`lagerbuch/verwaltung/(druck)/druck.css:69-73`). Ohne diese
     * zwei Zeilen faellt der Code auf die Ersatzgroesse des Browsers zurueck und wird winzig
     * — OHNE dass ein Test anschlaegt. `globals.css` faengt das nur fuer
     * `[data-testid="qr-display"]` ab (`globals.css:178-182`, selbst nachgeschlagen), und
     * dieses Markup traegt es nicht.
     */
    const regel = blatt().match(/\.rd-qr\s*>\s*svg\s*\{([^}]*)\}/);
    expect(regel, "es gibt keine Groessenregel fuer das QR-SVG").not.toBeNull();
    expect(regel![1], "das QR-SVG hat keine Breite").toMatch(/width\s*:\s*\d/);
    expect(regel![1], "das QR-SVG hat keine Hoehe").toMatch(/height\s*:\s*\d/);
  });

  it("erzwingt im Druck die Farbwiedergabe, sonst wird der QR ein grauer Kasten", () => {
    /*
     * ⛔ Ohne `print-color-adjust: exact` schluckt der Browser Flaechen, wenn er Farbe spart
     * — und er faengt genau bei grossen und bei kleinen an
     * (`lagerbuch/verwaltung/(druck)/druck.css:504-509`). ⛔ GEPRUEFT WIRD DER `@media
     * print`-TEIL, nicht die ganze Datei: am Bildschirm kauft die Zeile nichts, und ein
     * dateiweiter Treffer koennte aus dem Bildschirmteil stammen.
     */
    const ab = blatt().indexOf("@media print");
    expect(ab, "die Datei hat keinen @media print-Block").toBeGreaterThan(-1);
    const druck = blatt().slice(ab);
    expect(druck, "der Browser darf beim Drucken Farbe sparen").toMatch(/print-color-adjust\s*:\s*exact/);
    expect(druck, "die Bildschirmzeile wird im Druck nicht ausgeblendet").toMatch(
      /\.rd-nichtDrucken\s*\{[^}]*display\s*:\s*none\s*!important/,
    );
  });

  it("haelt die Karte auf EINER Seite und setzt den Satzspiegel", () => {
    /*
     * ⛔ EINE KARTE, DIE UEBER DEN SEITENRAND BRICHT, IST EIN TOTER QR-CODE: die halbe
     * Matrix auf Seite 1, die andere auf Seite 2. Kein Tor sieht das, der Drucker schon.
     */
    expect(blatt(), "kein @page-Satzspiegel").toMatch(/@page\s*\{[^}]*margin/);
    const karte = blatt().match(/\.rd-karte\s*\{([^}]*)\}/);
    expect(karte, "es gibt keine Kartenregel").not.toBeNull();
    expect(karte![1], "die Karte darf ueber den Seitenrand brechen").toMatch(
      /break-inside\s*:\s*avoid/,
    );
  });

  it("nennt nur Klassen mit dem Praefix rd-", () => {
    /*
     * ⛔ `druck.css` IST EIN GEWOEHNLICHES STYLESHEET, KEIN CSS-MODUL — die Namen sind
     * global (`lagerbuch/verwaltung/(druck)/druck.css:3-6`). Ein unpraefixter Name
     * restylte still die Druckseite eines anderen Moduls; das ist die Form von Falle 43.
     * ⚠️ Elementselektoren (`body`, `svg`) sind ausgenommen — der Ausdruck sucht
     * KLASSEN.
     */
    const klassen = [...blatt().matchAll(/\.([a-zA-Z][a-zA-Z0-9_-]*)/g)].map((m) => m[1]!);
    expect(klassen.length, "leere Klassenliste — der Scan waere leer-gruen").toBeGreaterThanOrEqual(5);
    expect([...new Set(klassen.filter((n) => !n.startsWith("rd-")))]).toEqual([]);
  });
});
