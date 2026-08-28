// src/app/m/radio/admin/(arbeit)/page.test.tsx
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import type Database from "better-sqlite3";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { Card, Statistic } from "antd";
import Link from "next/link";
import { openModuleDatabase } from "@/core/db";
import * as schema from "../../_db/schema";
import { devices, softwareVersions } from "../../_db/schema";
import { ohneKommentare } from "../../_lib/quelltextScan";
import { VIkone } from "../../_ui/verwaltungIkonen";
import s from "../../_ui/verwaltung.module.css";

/**
 * DIE VERWALTUNGSUEBERSICHT AN `/admin` (Spec §5.11, `Spec:4778-4794`; Entscheidung E-V15,
 * `.superpowers/sdd/planteil4/briefs/KOPF.md:964-989`).
 *
 * ⛔ DIE SEITENFUNKTION WIRD GERUFEN UND IHR ERGEBNIS ALS ELEMENTBAUM GELESEN — nicht
 * gemountet. Sie ist eine ASYNC Server Component; `mount()` treibt eine solche nicht an
 * (react-dom rendert kein Promise). Der Baumlaeufer ist die Hausform fuer genau diese Frage
 * („welche Props gehen an welches Bauteil"): `lagerbuch/verwaltung/(arbeit)/page.test.tsx:114-120`
 * und `.../artikel/ArtikelTable.test.tsx:122-128` fuehren ihn wortgleich. ⚠️ Er ist damit KEIN
 * zweites DOM-Harness (`CLAUDE.md`, „Tests") — er rendert nichts.
 *
 * ⛔ WARUM DIESE DATEI UEBERHAUPT STEHT, obwohl der Aufgabenbrief sie nicht fuehrt: ohne sie
 * bewacht in Vitest NICHTS die 1:1-Werte dieser Flaeche — `seitenGroesse: 5`, den Filter
 * `updateStand: "veraltet"`, die Rueckfallkette des Titels und die Zielpfade der drei
 * klickbaren Karten. Der Playwright-Fall aus `Spec:4877` prueft „vier Kennzahlen sichtbar,
 * ‚Veraltet' ist nicht rot" und saehe eine Seitengroesse 20 nie. Das ist zeichengleich die
 * Fehlerklasse F1 der Schlusspruefung von Planteil 3 (ein Lesepfad ohne den Filter, den er
 * abzubilden vorgab).
 *
 * ⚠️ EIGENE DATEI-DB, NICHT `getModuleDb()` (`.superpowers/sdd/planteil4/briefs/KOPF.md:268-270`):
 * dessen Cache ist per MODULSCHLUESSEL gekeyt, nicht per `DATA_DIR` (`src/core/db/index.ts:31-35`).
 *
 * ⛔ WAS DIESE DATEI NICHT BELEGT: dass der Riegel bei einem ECHTEN Abruf GREIFT — das war
 * ⬜ V-L3, am 2026-08-26 in V23 abgelesen (`riegel.test.ts:50-88`). Sie belegt, dass die
 * Seite ihn selbst ruft und dass VOR ihm keine Datenbank gelesen wird.
 */

const MIGRATIONEN = "src/app/m/radio/_db/migrations";
const QUELLE = "src/app/m/radio/admin/(arbeit)/page.tsx";

const riegel = vi.hoisted(() => vi.fn());
const dbGeholt = vi.hoisted(() => vi.fn());
const halter = vi.hoisted(() => ({ db: null as unknown }));

/*
 * ⛔ DER RIEGEL WIRD ERSETZT, NICHT UMGANGEN: sein Koerper ruft `headers()` und `auth()`
 * (`_lib/zugang.ts`, `riegelAufStufe`), beides gibt es in diesem Prozess nicht. WAS er tut,
 * gehoert `_lib/zugang.test.ts`; hier zaehlt nur, DASS die Seite ihn ruft — und wann.
 */
vi.mock("../../_lib/zugang", () => ({
  requireRadioVerwaltung: async () => {
    riegel();
    return { viewer: { sub: "u-1", name: "Testperson", groups: [] }, rolle: "admin" as const };
  },
}));

/*
 * ⛔ `getDb` ZAEHLT MIT, UND DAS IST DER WAECHTER DER REIHENFOLGE. Ein `getDb()` VOR dem
 * Riegel waere typkorrekt, lint-sauber und fuer jeden Baumtest unsichtbar — die Seite baute
 * denselben Baum. Der Fall „kein Datenbankzugriff vor der Sperre" unten misst genau das,
 * nach dem Vorbild `_lib/bauform.test.ts:459`.
 */
vi.mock("../../_db/client", () => ({
  getDb: () => {
    dbGeholt();
    return halter.db;
  },
}));

import UebersichtPage from "./page";

let tmp: string;
let sqlite: Database.Database;
let db: ReturnType<typeof drizzle<typeof schema>>;

beforeEach(() => {
  tmp = mkdtempSync(join(tmpdir(), "radio-admin-uebersicht-"));
  sqlite = openModuleDatabase(join(tmp, "radio.db"));
  migrate(drizzle(sqlite), { migrationsFolder: MIGRATIONEN });
  db = drizzle(sqlite, { schema });
  halter.db = db;
});

afterEach(() => {
  sqlite.close();
  rmSync(tmp, { recursive: true, force: true });
  vi.clearAllMocks();
});

/** Die Ziel-Marke; ohne sie ist JEDES Geraet mit Version „veraltet" (`_lib/updateStand.ts:48-55`). */
function zielMarke(wert: string) {
  db.insert(softwareVersions)
    .values({ value: wert, isTarget: true, createdAt: new Date("2026-01-01T10:00:00Z") })
    .run();
}

function geraet(werte: {
  id: string;
  issi: string;
  rufname?: string | null;
  opta?: string | null;
  softwareVersion?: string | null;
  createdAt: Date;
}) {
  db.insert(devices)
    .values({
      rufname: null,
      opta: null,
      softwareVersion: null,
      updatedAt: new Date("2026-05-01T10:00:00Z"),
      ...werte,
    })
    .run();
}

/**
 * Alle Elemente eines Typs im Baum — ⛔ UEBER ALLE PROPS, nicht nur ueber `children`.
 * `Card` traegt seinen Verweis „Alle veralteten anzeigen" in `extra` und seine Ueberschrift
 * in `title`; ein Laeufer, der nur `children` kennt (`lagerbuch/.../page.test.tsx:114-120`),
 * saehe beide nicht und waere an dieser Flaeche still zu schwach.
 */
function elementeVomTyp(wert: ReactNode, typ: unknown): ReactElement[] {
  if (Array.isArray(wert)) return wert.flatMap((kind) => elementeVomTyp(kind, typ));
  if (!isValidElement(wert)) return [];
  const treffer = wert.type === typ ? [wert] : [];
  const kinder = Object.values(wert.props as Record<string, unknown>) as ReactNode[];
  return [...treffer, ...kinder.flatMap((kind) => elementeVomTyp(kind, typ))];
}

/** Der reine Text eines Teilbaums — `<span>ISSI: </span>{wert}` ergibt „ISSI: 1002". */
function text(wert: ReactNode): string {
  if (wert === null || wert === undefined || typeof wert === "boolean") return "";
  if (Array.isArray(wert)) return wert.map(text).join("");
  if (isValidElement(wert)) return text((wert.props as { children?: ReactNode }).children);
  return String(wert);
}

async function seite(): Promise<ReactNode> {
  return (await UebersichtPage()) as ReactNode;
}

/**
 * Jede Kennzahlkarte mit allem, was sie an ihrem eigenen Markup traegt.
 *
 * ⛔ DER TITEL KOMMT SEIT DEM 2026-08-28 NICHT MEHR AUS `Statistic title=`. Die Karte
 * traegt eine Kopfzeile (Titel links, Zeichen rechts, `_ui/verwaltung.module.css`), und
 * `Statistic` bekommt nur noch die Zahl — sonst haette das Zeichen keine Zeile neben dem
 * Titel. Der Laeufer liest deshalb den Kartenknoten, nicht das antd-Bauteil.
 */
function karten(
  baum: ReactNode,
): { titel: string; wert: number; zeichen?: string; farbe?: string }[] {
  return elementeVomTyp(baum, "div")
    .filter((el) => (el.props as Record<string, unknown>)["data-rolle"] === "radio-kennzahl")
    .map((el) => {
      const zeichenHuelle = elementeVomTyp(el, "span").find(
        (sp) => (sp.props as Record<string, unknown>)["data-rolle"] === "radio-kennzahl-zeichen",
      );
      const titel = elementeVomTyp(el, "span").find(
        (sp) => (sp.props as { className?: string }).className === s.kennzahlTitel,
      );
      return {
        titel: text(titel),
        wert: (elementeVomTyp(el, Statistic)[0]?.props as { value?: number } | undefined)
          ?.value as number,
        zeichen: (elementeVomTyp(el, VIkone)[0]?.props as { name?: string } | undefined)?.name,
        farbe: (zeichenHuelle?.props as { className?: string } | undefined)?.className,
      };
    });
}

function kennzahlen(baum: ReactNode): { titel: string; wert: number }[] {
  return karten(baum).map(({ titel, wert }) => ({ titel, wert }));
}

/** Je Link: sein Ziel und die Kennzahltitel, die IN ihm liegen. */
function verweise(baum: ReactNode): { href: string; kennzahlen: string[] }[] {
  return elementeVomTyp(baum, Link).map((el) => {
    const p = el.props as { href: string };
    return { href: p.href, kennzahlen: kennzahlen(el).map((k) => k.titel) };
  });
}

function sechsVeraltete() {
  zielMarke("2.5.0");
  // aufsteigend angelegt: v6 ist das JUENGSTE, v1 faellt aus der Fuenferliste heraus.
  geraet({ id: "v1", issi: "1001", rufname: "Florian 1", softwareVersion: "1.0.0", createdAt: new Date("2026-01-01T10:00:00Z") });
  geraet({ id: "v2", issi: "1002", opta: "OPTA-2", softwareVersion: "1.0.0", createdAt: new Date("2026-01-02T10:00:00Z") });
  geraet({ id: "v3", issi: "1003", softwareVersion: "1.0.0", createdAt: new Date("2026-01-03T10:00:00Z") });
  geraet({ id: "v4", issi: "1004", rufname: "Florian 4", softwareVersion: "1.0.0", createdAt: new Date("2026-01-04T10:00:00Z") });
  geraet({ id: "v5", issi: "1005", rufname: "Florian 5", softwareVersion: "1.0.0", createdAt: new Date("2026-01-05T10:00:00Z") });
  geraet({ id: "v6", issi: "1006", rufname: "Florian 6", softwareVersion: "1.0.0", createdAt: new Date("2026-01-06T10:00:00Z") });
  // Ein AKTUELLES und zwei OHNE Version — sie duerfen in der Liste nicht auftauchen.
  geraet({ id: "a1", issi: "2001", rufname: "Aktuell 1", softwareVersion: "2.5.0", createdAt: new Date("2026-02-01T10:00:00Z") });
  geraet({ id: "u1", issi: "3001", rufname: "Unbekannt 1", createdAt: new Date("2026-03-01T10:00:00Z") });
  geraet({ id: "u2", issi: "3002", rufname: "Unbekannt 2", createdAt: new Date("2026-03-02T10:00:00Z") });
}

describe("die Verwaltungsuebersicht an /admin", () => {
  it("ruft den Riegel, BEVOR sie die Datenbank oeffnet", async () => {
    /*
     * ⛔ DIE REIHENFOLGE IST DIE AUSSAGE, nicht die Anwesenheit: `Spec:4369` gibt der Seite
     * den Riegel als ERSTE Anweisung. Ein `getDb()` davor liefe fuer eine Person, die die
     * Seite gar nicht sehen darf — und der Elementbaum saehe danach identisch aus.
     * Vorbild derselben Messung: `_lib/bauform.test.ts:459` („kein Datenbankzugriff VOR der
     * Sperre").
     */
    riegel.mockImplementationOnce(() => {
      expect(dbGeholt, "getDb() lief VOR dem Riegel").not.toHaveBeenCalled();
    });
    await seite();
    expect(riegel).toHaveBeenCalledTimes(1);
    expect(dbGeholt).toHaveBeenCalled();
  });

  it("zeigt die vier Kennzahlen aus einer Abfrage, in der Reihenfolge des Bestands", async () => {
    /*
     * 1:1 aus `radio-admin/client/src/features/dashboard/Dashboard.tsx:27-53`: „Geräte
     * gesamt" · „Aktuell" · „Veraltet" · „Unbekannt". Die Zahlen kommen aus
     * `geraeteKennzahlen` — EINE Abfrage mit `GROUP BY` statt vier Rundlaeufen
     * (`_lib/lesepfade/geraete.ts:678-684`, `Spec:4780-4784`).
     */
    sechsVeraltete();
    expect(kennzahlen(await seite())).toEqual([
      { titel: "Geräte gesamt", wert: 9 },
      { titel: "Aktuell", wert: 1 },
      { titel: "Veraltet", wert: 6 },
      { titel: "Unbekannt", wert: 2 },
    ]);
  });

  it("haengt an jede Kennzahl den Griff, mit dem V23 sie findet", async () => {
    /*
     * ⛔ DIE ZWEI DATENATTRIBUTE SIND DER EINZIGE GRIFF DES PLAYWRIGHT-FALLES aus
     * `Spec:4877` (`e2e/radio-verwaltung.spec.ts`). Ohne diese Zusicherung waere ihr
     * Verlust in Vitest, typecheck und lint STILL — und der Fall in V23 suchte vier
     * Knoten, die es nicht mehr gibt.
     *
     * ⛔ SIE HAENGEN AN EIGENEM MARKUP, NICHT AN `.ant-statistic-*`: eine antd-Klasse ist
     * ein internes Detail des Zeichenpakets, und ein Test darauf misst die naechste
     * antd-Version statt dieser Flaeche.
     */
    sechsVeraltete();
    const griffe = elementeVomTyp(await seite(), "div")
      .map((el) => el.props as Record<string, string>)
      .filter((p) => p["data-rolle"] === "radio-kennzahl")
      .map((p) => p["data-schluessel"]);
    expect(griffe).toEqual(["gesamt", "aktuell", "veraltet", "unbekannt"]);
  });

  it("traegt an jeder Kennzahl ihr Zeichen UND ihre Farbe — je Karte die richtigen", async () => {
    /*
     * ⛔ 1:1 `Dashboard.tsx:28-50`: `FiRadio` · `FiCheckCircle` · `FiAlertTriangle` ·
     * `FiHelpCircle`, hier als `funk` · `haken-kreis` · `warnung` · `frage` aus
     * `_ui/verwaltungIkonen.tsx`. Bis zum 2026-08-28 trug diese Flaeche gar keine Zeichen;
     * die damalige Begruendung (`_ui/ikonen.tsx` sei die EINE Quelle und auf zwoelf Namen
     * festgenagelt) ist mit der zweiten Quelle hinfaellig.
     *
     * ⛔ SEIT DEM 2026-08-28 STEHT AUCH DIE FARBE HIER (Betreiberbefund „die Farben der
     * Icons fehlen", Falle 3 fuer diese vier Zeichen aufgehoben): Gesamt neutral, Aktuell
     * gruen, Veraltet rot, Unbekannt grau — 1:1 `Dashboard.tsx:33`, `:41`, `:49`, dort
     * allerdings am WERT (`valueStyle`) und hier am ZEICHEN.
     *
     * ⛔ GEMESSEN WIRD DIE ZUORDNUNG, NICHT DIE ANWESENHEIT. Ein Quelltext-Scan auf vier
     * Namen bliebe gruen, wenn `warnung` und `frage` die Karte tauschten — die vier Namen
     * staenden ja alle da. Dieselbe Luecke haette ein Scan auf vier Klassennamen. Diese
     * Datei hat den Baumlaeufer, also wird Karte fuer Karte abgelesen.
     *
     * ⛔ ARBEITSTEILUNG BEI DER FARBE, und ohne sie waere dieser Fall die halbe Wahrheit:
     * HIER steht Karte→Klasse. Dass die Klasse im Blatt UEBERHAUPT DEKLARIERT ist, misst
     * `_ui/verwaltung-css.test.ts` („nennt nur Klassen, die verwaltung.module.css
     * DEKLARIERT"); welchen TON sie ergibt, misst der Playwright-Fall 1. ⚠️ Der Grund ist
     * gemessen: Vitest liefert fuer ein CSS-Modul einen Proxy, der JEDEN Namen beantwortet
     * — `s.gibtsNichtXY` ergibt `"_gibtsNichtXY_3d106f"`. Ein Tippfehler in der Seite waere
     * hier also NICHT rot, wohl aber im Klassenscan des Blattes.
     *
     * ⚠️ `react-icons/pi` IN EINER SERVER COMPONENT IST GEMESSEN SICHER (`lagerbuch`,
     * 2026-08-12, echter Abruf); Falle 7 gilt `@ant-design/icons`. Dass die Seite weiterhin
     * 200 liefert, sieht Vitest strukturell NICHT — das misst der Playwright-Fall.
     */
    sechsVeraltete();
    expect(karten(await seite())).toEqual([
      { titel: "Geräte gesamt", wert: 9, zeichen: "funk", farbe: s.zeichenNeutral },
      { titel: "Aktuell", wert: 1, zeichen: "haken-kreis", farbe: s.zeichenGruen },
      { titel: "Veraltet", wert: 6, zeichen: "warnung", farbe: s.zeichenRot },
      { titel: "Unbekannt", wert: 2, zeichen: "frage", farbe: s.zeichenGrau },
    ]);
  });

  it("holt die Zeichen aus der VERWALTUNGS-Quelle, nicht aus der der Ausleihflaeche", () => {
    /*
     * ⛔ DIE GEGENPROBE ZUM FALL DARUEBER, und sie ist nicht redundant: der Baumlaeufer
     * sieht nur den NAMEN, nicht das Modul, aus dem `VIkone` stammt. `_ui/ikonen.tsx` ist
     * auf die AUSLEIHflaeche gebunden (Spec §4.6.4, Inline-SVG) und fuehrt `funk`, `haken`
     * und `haken-kreis` unter denselben Namen — ein Import ueber die Zweiggrenze waere ein
     * zweiter Zeichenstil auf derselben Flaeche und bliebe sonst still.
     * Zeichengleiche Form: `GeraetFormular.test.tsx:543`.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle, "die Uebersicht zieht das Zeichenpaket der AUSLEIHflaeche").not.toMatch(
      /from\s+["'][^"']*_ui\/ikonen["']/,
    );
    expect(quelle, "die Zeichenquelle des Verwaltungszweigs fehlt").toMatch(
      /from\s+["'][^"']*_ui\/verwaltungIkonen["']/,
    );
  });

  it("macht genau die DREI gefilterten Karten zu Links — „Geräte gesamt“ bleibt stumm", async () => {
    /*
     * ⛔ LINKS UND KEINE `onClick`-KARTEN (Entscheidung E-V15): der Bestand navigiert ueber
     * `onClick` + `navigate` (`Dashboard.tsx:60-62`), ein Client-Handler. Auf einer Server
     * Component waere das Falle 9.
     * ⛔ „Geräte gesamt" IST NICHT KLICKBAR, 1:1 (`Dashboard.tsx:61`:
     * `hoverable={card.filter !== undefined}`) — es gibt keinen ungefilterten Listenaufruf,
     * den die Karte ausdruecken koennte.
     * ⛔ DIE AEUSSERE PFADFORM, NICHT `/m/radio/...` — benannte Abweichung vom Wortlaut
     * `Spec:4788`, begruendet in `page.tsx`.
     */
    sechsVeraltete();
    const kartenVerweise = verweise(await seite()).filter((v) => v.kennzahlen.length > 0);
    expect(kartenVerweise).toEqual([
      { href: "/admin/geraete?updateStand=aktuell", kennzahlen: ["Aktuell"] },
      { href: "/admin/geraete?updateStand=veraltet", kennzahlen: ["Veraltet"] },
      { href: "/admin/geraete?updateStand=unbekannt", kennzahlen: ["Unbekannt"] },
    ]);
    expect(
      kartenVerweise.flatMap((v) => v.kennzahlen),
      "„Geräte gesamt“ liegt in einem Link (Dashboard.tsx:61)",
    ).not.toContain("Geräte gesamt");
  });

  it("listet die FUENF juengsten veralteten Geraete, neueste zuerst", async () => {
    /*
     * 1:1 aus `Dashboard.tsx:21` (`{ page: 1, pageSize: 5, updateStatus: 'veraltet' }`) —
     * ⛔ OHNE eigene Sortierangabe, damit die Vorgabe `desc(createdAt)` des Lesepfads greift
     * (`_lib/lesepfade/geraete.ts:505`). „Juengste" heisst genau das.
     *
     * ⛔ DER TITEL FAELLT ZURUECK: `rufname || opta || issi` (`Dashboard.tsx:94`), und alle
     * drei Stufen kommen in dieser Liste vor. Darunter die ISSI-Zeile (`Dashboard.tsx:95`).
     */
    sechsVeraltete();
    const zeilen = verweise(await seite()).filter((v) => v.href.startsWith("/admin/geraete/"));
    expect(zeilen.map((v) => v.href)).toEqual([
      "/admin/geraete/v6",
      "/admin/geraete/v5",
      "/admin/geraete/v4",
      "/admin/geraete/v3",
      "/admin/geraete/v2",
    ]);
  });

  it("beschriftet jede Zeile mit der Rueckfallkette und der ISSI", async () => {
    sechsVeraltete();
    const zeilen = elementeVomTyp(await seite(), Link)
      .filter((el) => String((el.props as { href: string }).href).startsWith("/admin/geraete/"))
      .map((el) => text(el));
    expect(zeilen).toEqual([
      "Florian 6ISSI: 1006",
      "Florian 5ISSI: 1005",
      "Florian 4ISSI: 1004",
      // ⛔ Ohne `rufname` UND ohne `opta` traegt die ISSI den Titel (`Dashboard.tsx:94`).
      "1003ISSI: 1003",
      // ⛔ Ohne `rufname` traegt `opta` den Titel — die mittlere Stufe der Kette.
      "OPTA-2ISSI: 1002",
    ]);
  });

  it("sagt im leeren Zustand „Keine veralteten Geräte“ und zeigt keine Zeile", async () => {
    /*
     * Der Leertext 1:1 aus `Dashboard.tsx:87` (`locale={{ emptyText: 'Keine veralteten
     * Geräte' }}`). ⛔ Die vier Kennzahlkarten bleiben stehen — sie sind auch bei leerem
     * Bestand eine Aussage.
     */
    zielMarke("2.5.0");
    geraet({ id: "a1", issi: "2001", rufname: "Aktuell 1", softwareVersion: "2.5.0", createdAt: new Date("2026-02-01T10:00:00Z") });
    const baum = await seite();
    expect(verweise(baum).filter((v) => v.href.startsWith("/admin/geraete/"))).toEqual([]);
    expect(text(baum)).toContain("Keine veralteten Geräte");
    expect(kennzahlen(baum)).toHaveLength(4);
    // ⛔ Die zwei uebrigen 1:1-Werte der Flaeche, bis hierher unbewacht (Aussenpruefung, F6):
    // der Kartentitel (`Dashboard.tsx:77`) und die Ueberschrift (`_lib/nav.ts:61`). Der Titel
    // steht in einem PROP, nicht in `children` — `text(baum)` allein saehe ihn nie.
    expect(text(baum)).toContain("Übersicht");
    expect(
      elementeVomTyp(baum, Card).map((el) => text((el.props as { title?: ReactNode }).title)),
    ).toContain("Veraltete Geräte");
  });

  it("traegt den Verweis „Alle veralteten anzeigen“ auf dieselbe gefilterte Liste", async () => {
    /*
     * ⛔ EIN LINK, KEIN `Typography.Link` MIT `onClick` (`Dashboard.tsx:79-81`) — das waere
     * ein Client-Handler UND ein Compound-Zugriff (Falle 1) in einer Server Component.
     */
    sechsVeraltete();
    const alle = verweise(await seite()).filter(
      (v) => v.href === "/admin/geraete?updateStand=veraltet" && v.kennzahlen.length === 0,
    );
    expect(alle).toHaveLength(1);
    expect(
      elementeVomTyp(await seite(), Card)
        .map((el) => text((el.props as { extra?: ReactNode }).extra))
        .filter((t) => t !== ""),
    ).toEqual(["Alle veralteten anzeigen"]);
  });

  it("nennt keinen Farbwert — die Toene stehen im Blatt, nicht in der Seite", async () => {
    /*
     * ⛔ DIESER FALL IST SEIT DEM 2026-08-28 UMGEDREHT UND NICHT ENTFERNT. Bis dahin sagte
     * er „gar keine Farbe" (Falle 3: `colorError === colorPrimary`,
     * `src/core/theme/theme.ts:32-33`). Der Betreiber hat die Farbe fuer die vier Zeichen
     * angeordnet — aber KEINEN HEXWERT IN DIESER DATEI: die Toene stehen als Klassen im
     * Blatt (`_ui/verwaltung.module.css`), je mit Hell- UND Dunkelwert. Ein `style={{ color:
     * "#cf1322" }}` in der Seite kennt nur EINEN Modus und stuende in der Dunkeldarstellung
     * falsch da; genau das faengt dieser Scan weiterhin. `Dashboard.tsx:33`, `:41`, `:49`
     * faerben `#3f8600`, `#cf1322` und `#8c8c8c` ueber `valueStyle` — als LITERALE wandert
     * keiner der drei mit.
     *
     * ⛔ GELESEN WIRD UEBER `ohneKommentare`, NICHT UEBER `bereinigt`: `bereinigt` leert
     * auch ZEICHENKETTEN (`_lib/quelltextScan.ts`), und genau in einer Zeichenkette staende
     * ein `valueStyle={{ color: "#cf1322" }}` — der Scan waere gegen die Mutation blind,
     * gegen die er steht. Der Kommentarschnitt genuegt und muss sein, weil dieser Satz die
     * Hexwerte selbst nennt.
     *
     * ⚠️ ER FAENGT NICHT JEDES ROT: `color="red"` oder ein Token kaeme durch. Dafuer steht
     * der Playwright-Fall 1, der seit dem 2026-08-28 misst, dass das ZEICHEN der Karte
     * „Veraltet" rot IST und ihre ZAHL nicht.
     *
     * ⛔ UND ER IST ZUGLEICH DIE HALBE ZUSAGE „kein ZWEITER Hexsatz unter admin/"
     * (`.superpowers/sdd/planteil4/briefs/KOPF.md:288`, NS-A8b): die eine Quelle bleibt
     * `_lib/status.ts:125`.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle.match(/#[0-9a-fA-F]{3,8}\b/g), "ein Farbwert in der Uebersicht (Falle 3)")
      .toBeNull();
  });

  it("traegt die VERWALTUNGS-Stufe namentlich, nicht die Admin-Stufe", () => {
    /*
     * ⛔ DIE ZUSAGE DES BRIEFES, DIE BIS HIERHER NIRGENDS STAND (Aussenpruefung, F5).
     * `riegel.test.ts`s Klausel (e) laesst im `(arbeit)`-Zweig BEIDE werfenden Riegel zu, und
     * zwar absichtlich (`riegel.test.ts:253-262`, `personenRiegelFuer`) — eine faelschlich
     * ANGEHOBENE Seite faellt ihr strukturell nicht auf. Dass die Faelle oben trotzdem rot
     * werden, ist ein NEBENEFFEKT des `vi.mock`: das Ersatzmodul exportiert
     * `requireRadioAdmin` nicht. Ein spaeterer Umbau auf `importOriginal`/Spread naehme diesen
     * Waechter still weg; die Meldungen nennten dann den Mock und nicht die Stufe.
     * ⛔ Die Stufe selbst kommt aus `Spec:4369`: die Uebersicht ist eine der sieben Flaechen,
     * die auch eine Updater-Person sieht.
     */
    const quelle = ohneKommentare(readFileSync(QUELLE, "utf8"));
    expect(quelle, "die Uebersicht traegt requireRadioVerwaltung (Spec:4369)").toMatch(
      /\brequireRadioVerwaltung\s*\(/,
    );
    expect(quelle, "angehoben auf die Admin-Stufe — Spec:4369 setzt die Verwaltungsstufe")
      .not.toMatch(/\brequireRadioAdmin\s*\(/);
  });
});
