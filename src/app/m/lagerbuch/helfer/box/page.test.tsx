// @vitest-environment jsdom
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { readFileSync } from "node:fs";
import type { ReactNode } from "react";
import { eq } from "drizzle-orm";
import { migrierteTestDb, type TestDb } from "../../_db/testdb";
import { lagerorte, tokens } from "../../_db/schema";
import { ENTNAHMEBOX_ID } from "../../_lib/konstanten";

const QUELLE = "src/app/m/lagerbuch/helfer/box/page.tsx";

/**
 * DER DRITTE HELFERSCHIRM — DRK-314.
 *
 * ⚠️ `_lib/helferZugang.ts` WIRD NICHT GEMOCKT — dieselbe Entscheidung wie in
 * `helfer/check/page.test.tsx` und aus demselben Grund: dass DIESE SEITE
 * `requireHelferSitzung(getDb())` selbst ruft, obwohl `helfer/layout.tsx` ihn
 * traegt, ist die tragende Zusage (Falle 17: eine Route-Group ist KEINE
 * Sicherheitsgrenze). Ein Mock koennte den Selbstaufruf nur ALS AUFRUF zaehlen;
 * er koennte nicht zeigen, dass der Riegel dabei wirklich laeuft.
 *
 * Attrappen sind `next/headers`, `next/navigation`, `_db/client`, der
 * Fahrzeug-Lesepfad, die Insel und der Rahmen — und `_lib/helferSitzung` (die
 * JWT-Haelfte; `jose` ist unter jsdom nicht benutzbar, gemessen in T84).
 *
 * ⚠️ `_ui/LeerZustand.tsx` wird BEWUSST NICHT gemockt: nur so ist
 * `href === "/helfer"` ein echter Beleg fuer die Aeusserer-Pfad-Regel.
 */

const { GUELTIGES_COOKIE, LAEUFT_AB } = vi.hoisted(() => ({
  GUELTIGES_COOKIE: "cookie-gueltig",
  LAEUFT_AB: new Date("2026-09-16T22:00:00.000Z"),
}));
vi.mock("../../_lib/helferSitzung", () => ({
  HELFER_COOKIE: "helfer_session",
  verifyHelferSitzung: async (wert: string) =>
    wert === GUELTIGES_COOKIE ? { tokenId: "tk1", laeuftAb: LAEUFT_AB } : null,
}));

let hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
let cookieWert: string | undefined;
/**
 * ⚠️ ZWEI ZAEHLER: `requireHelferSitzung` ruft `headers()` GENAU EINMAL (erste
 * Anweisung, Global Constraint 24). Ein Seitenrumpf, der den Riegel gar nicht
 * selbst ruft, laesst ihn auf 0; einer, der `requireLagerbuchHost` zusaetzlich
 * ruft, hebt ihn auf 2 — und macht damit die Zusage „host-gebunden durch
 * KONSTRUKTION" wieder zu einer Liste.
 */
let kopfRufe = 0;
const cookieGet = vi.fn((name: string) =>
  name === "helfer_session" && cookieWert !== undefined ? { name, value: cookieWert } : undefined,
);
vi.mock("next/headers", () => ({
  headers: async () => { kopfRufe += 1; return hostKopf; },
  cookies: async () => ({ get: cookieGet }),
}));

const umleitungen: string[] = [];
vi.mock("next/navigation", () => ({
  redirect: (ziel: string) => { umleitungen.push(ziel); throw new Error(`NEXT_REDIRECT:${ziel}`); },
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
}));

vi.mock("../../_db/client", () => ({ getDb: () => t.db }));

let angemeldet: { sub: string; groups: string[]; name: string | null; email: null } | null = null;
vi.mock("../../_lib/zugang", () => ({
  viewerOderNull: async () => angemeldet,
  istLagerbuchAdmin: (v: { groups: string[] } | null) => !!v?.groups.includes("lagerbuch"),
}));
vi.mock("../../_lib/konto", () => ({ merkeNutzer: () => {} }));

const fahrzeuge = vi.fn<(...a: unknown[]) => unknown[]>(() => []);
vi.mock("../../_lib/lesepfade/fahrzeuge", () => ({
  fahrzeugListe: (...a: unknown[]) => fahrzeuge(...a),
}));

/**
 * Die Insel als Attrappe, die ihre Props an den GERENDERTEN Baum haengt: eine
 * Zusage ueber das Ergebnis gehoert an den Baum, nicht an den Dateitext.
 *
 * `data-posten-felder` ist die Sonde fuer das, was `typecheck` NICHT faengt:
 * Arrays sind kovariant, und die Ueberschuss-Pruefung greift nur auf frischen
 * Objektliteralen — ein Durchreichen von Feldern, die die Insel nicht zeigt,
 * kompiliert sauber und landet still im RSC-Payload.
 */
vi.mock("../../_ui/BoxAbgabe", () => ({
  BoxAbgabe: (p: {
    einheit: Record<string, unknown>;
    posten: Record<string, unknown>[];
    kontoZugang: boolean;
    andereEinheitErreichbar: boolean;
  }) => (
    <div
      data-rolle="abgabe"
      data-einheit={String(p.einheit.id)}
      data-einheit-felder={Object.keys(p.einheit).sort().join(",")}
      data-posten-ids={p.posten.map((x) => String(x.artikelId)).join(",")}
      data-posten-felder={Object.keys(p.posten[0] ?? {}).sort().join(",")}
      data-konto={String(p.kontoZugang)}
      data-andere={p.andereEinheitErreichbar ? "ja" : "nein"}
      // ⚠️ DAS VORHANDENSEIN DES SCHLUESSELS, nicht sein Wert (DRK-375): ein
      // `buchen={undefined}` waere von „gar kein Prop" ueber den Wert nicht zu
      // unterscheiden — und genau das ist hier die Frage.
      data-hat-buchen={"buchen" in p ? "ja" : "nein"}
    />
  ),
}));
vi.mock("../../_ui/FahrzeugWahl", () => ({
  FahrzeugWahl: (p: { fahrzeuge: Record<string, unknown>[]; pfad?: string }) => (
    <div
      data-rolle="wahl"
      data-pfad={String(p.pfad)}
      data-ids={p.fahrzeuge.map((f) => String(f.id)).join(",")}
    />
  ),
}));
vi.mock("../../_ui/HelferRahmen", () => ({
  HelferRahmen: (p: { aktiv: string; children: ReactNode }) => (
    <div data-rolle="rahmen" data-aktiv={p.aktiv}>{p.children}</div>
  ),
}));

import BoxSeite, { dynamic as seiteDynamic } from "./page";
import { mount, unmount, query, exists } from "@/app/m/qr/_lib/test-dom";
import { artikel, buchungen, chargen } from "../../_db/schema";

let t: TestDb;
const JETZT = new Date("2026-09-16T10:00:00Z");

const sp = (o: Record<string, string> = {}) => ({ searchParams: Promise.resolve(o) });

/** Eine Zeile aus `fahrzeugListe` — alle Felder, die der Lesepfad fuehrt. */
const FZ = (id: string, aktiv = true) => ({
  id, name: id.toUpperCase(), kennung: null, aktiv, templateId: null,
  einheitenart: "fahrzeug" as const,
});

function bestandAn(ort: string, menge: number) {
  t.db.insert(buchungen).values({
    id: `b-${ort}-${menge}`, ts: JETZT, typ: "zugang", artikelId: "art-1",
    chargeId: "ch-1", lagerortId: ort, menge,
    quelleTyp: "system", quelleId: "seed", referenz: null, kommentar: null,
  }).run();
}

beforeEach(() => {
  t = migrierteTestDb("lagerbuch-boxseite-");
  hostKopf = new Headers({ host: "lagerbuch.localtest.me" });
  cookieWert = GUELTIGES_COOKIE;
  umleitungen.length = 0;
  kopfRufe = 0;
  angemeldet = null;
  fahrzeuge.mockReturnValue([]);

  t.db.insert(tokens).values({
    id: "tk1", code: "482-137", label: "RTW 1",
    aktiv: true, createdAt: JETZT, createdBy: "sub-1",
  }).run();
  t.db.insert(lagerorte).values({
    id: "fz-1", name: "FZ-1", typ: "fahrzeug", aktiv: true, einheitenart: "fahrzeug",
  }).run();
  t.db.insert(artikel).values({
    id: "art-1", name: "Kühlkompresse", einheit: "Stk", fach: "A-01",
    mindestbestand: 0, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
  t.db.insert(chargen).values({
    id: "ch-1", artikelId: "art-1", chargenNr: "L-1", verfall: "2030-01", createdAt: JETZT,
  }).run();
});

afterEach(() => { unmount(); t.schliessen(); });

describe("helfer/box — der Riegel", () => {
  it("ruft `requireHelferSitzung` SELBST — genau einmal `headers()`", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 5);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    // GENAU EINMAL: der Riegel ruft `requireLagerbuchHost` intern als erste
    // Anweisung, und die Seite ruft ihn deshalb NICHT noch einmal (§2.24).
    expect(kopfRufe).toBe(1);
  });

  it("weist einen FREMDEN Host ab, BEVOR das Cookie gelesen wird", async () => {
    // Falle 17: die Route-Group ist keine Sicherheitsgrenze. Diese Seite wird
    // hier OHNE Layout gerendert — genau so, wie ein direkter Abruf sie traefe.
    hostKopf = new Headers({ host: "feedback.localtest.me" });
    cookieGet.mockClear();
    await expect(BoxSeite(sp())).rejects.toThrow();
    expect(cookieGet).not.toHaveBeenCalled();
  });

  it("schickt ohne Cookie und ohne Konto weg", async () => {
    cookieWert = undefined;
    await expect(BoxSeite(sp())).rejects.toThrow(/NEXT_REDIRECT/);
    expect(umleitungen).toEqual(["/"]);
  });
});

describe("helfer/box — wenn es die Box nicht gibt", () => {
  it("sagt es, statt eine Einheit waehlen zu lassen", async () => {
    /*
     * ⚠️ DIE REIHENFOLGE IST DIE AUSSAGE: fehlt die Kiste, ist die Wahl einer
     * Einheit sinnlos — man waehlte eine Quelle fuer einen Vorgang, den die
     * Action danach ablehnt.
     */
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    t.sqlite.prepare("delete from lagerorte where id = ?").run(ENTNAHMEBOX_ID);

    await mount(await BoxSeite(sp()));
    expect(query("[data-rolle='leer-titel']").textContent).toContain("Keine Entnahmebox");
    expect(exists("[data-rolle='wahl']")).toBe(false);
    // Der Rueckweg ist ein AEUSSERER Pfad — ein innerer wuerde auf dem
    // Modul-Host doppelt praefixiert (Falle 49).
    expect(query("[data-rolle='leer-weg']").getAttribute("href")).toBe("/helfer");
  });

  it("sagt es auch, wenn sie stillgelegt ist", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    t.sqlite.prepare("update lagerorte set aktiv = 0 where id = ?").run(ENTNAHMEBOX_ID);
    await mount(await BoxSeite(sp()));
    expect(query("[data-rolle='leer-titel']").textContent).toContain("stillgelegt");
  });
});

describe("helfer/box — erst waehlen, dann laden", () => {
  it("bietet die Wahl an und fuehrt sie auf DIESEN Schirm", async () => {
    // ⚠️ `pfad` IST DIE GANZE ERWEITERUNG AN `FahrzeugWahl`: ohne ihn fuehrte
    // die Wahl in den CHECK, und der Schirm waere von hier aus unerreichbar.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await BoxSeite(sp()));
    expect(query("[data-rolle='wahl']").getAttribute("data-pfad")).toBe("/helfer/box");
    expect(exists("[data-rolle='abgabe']")).toBe(false);
  });

  it("bietet NUR aktive Einheiten an", async () => {
    // Eine stillgelegte anzubieten hiesse, einen Weg zu zeigen, den niemand am
    // Regal gehen soll — die Action laesst sie ausdruecklich zu, aber aus der
    // Verwaltung heraus.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-alt", false), FZ("fz-2")]);
    await mount(await BoxSeite(sp()));
    expect(query("[data-rolle='wahl']").getAttribute("data-ids")).toBe("fz-1,fz-2");
  });

  it("ueberspringt die Wahl bei genau EINER aktiven Einheit", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 5);
    await mount(await BoxSeite(sp()));
    expect(query("[data-rolle='abgabe']").getAttribute("data-einheit")).toBe("fz-1");
  });

  it("faellt bei einem unbekannten `?fz=` still auf die Wahl zurueck", async () => {
    // Sonst laedt eine geratene Id die Daten einer Einheit, die es nicht gibt.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await BoxSeite(sp({ fz: "gibt-es-nicht" })));
    expect(exists("[data-rolle='wahl']")).toBe(true);
  });
});

describe("helfer/box — was die Insel bekommt", () => {
  it("laedt den BESTAND, nicht das Soll", async () => {
    /*
     * ⚠️ DER ANLASS DES TICKETS IST „jemand hat zu viel drauf gelegt" — und das
     * ist Bestand OHNE Soll. Eine Liste aus `sollFuerFahrzeug` zeigte den
     * Ueberschuss nur dann, wenn er zufaellig auch im Soll steht. Hier gibt es
     * KEINE Soll-Position, und der Posten muss trotzdem erscheinen.
     */
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='abgabe']").getAttribute("data-posten-ids")).toBe("art-1");
  });

  it("reicht NUR die Felder weiter, die die Insel zeigt", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    const insel = query("[data-rolle='abgabe']");
    // DRK-377: `gemeldet` kommt dazu — der beim Check abgelesene Verfall. Er
    // gehoert genau hierher: er ist das Einzige, was ueber Material mit einer
    // geratenen Charge etwas aussagt, und der Schirm zeigt ihn als Chip.
    expect(insel.getAttribute("data-posten-felder"))
      .toBe("artikelId,artikelName,chargen,einheit,gemeldet,menge");
    // ⚠️ `templateId` UND `aktiv` DUERFEN NICHT MITREISEN: `fahrzeugListe`
    // fuehrt mehr Felder, als der Schirm zeigt, und alles davon laege sonst im
    // RSC-Payload — auf einem privaten Telefon, in einer Sitzung ohne Konto.
    expect(insel.getAttribute("data-einheit-felder")).toBe("einheitenart,id,kennung,name");
  });

  it("zeigt einen Leerzustand, wenn die Einheit keinen Bestand hat", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(exists("[data-rolle='abgabe']")).toBe(false);
    expect(query("[data-rolle='leer-titel']").textContent).toContain("im Fahrzeug");
  });

  /*
   * ⚠️ DER WEG AUS DEM LEERZUSTAND DARF NICHT IM KREIS FUEHREN (Codex-Review zu
   * PR #175). Er ist die einzige Handlung auf einem Schirm, der sonst nichts
   * anbietet — und er ist genau dann wirkungslos, wenn die Seite oben dieselbe
   * Einheit erneut waehlt. Die drei Faelle stehen einzeln da, weil sie DREI
   * verschiedene Gruende haben, nicht einer mit drei Gesichtern.
   */
  it("bietet den Weg auf eine andere Einheit an, solange es eine andere gibt", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    const weg = query("[data-rolle='leer-weg']");
    expect(weg.textContent).toBe("Andere Einheit");
    expect(weg.getAttribute("href")).toBe("/helfer/box");
  });

  it("fuehrt bei genau EINER Einheit nach draussen statt auf denselben Schirm", async () => {
    // Ohne Wahl waehlt die Seite oben wieder fz-1 — der Link taete nichts.
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='leer-weg']").getAttribute("href")).toBe("/helfer");
  });

  it("fuehrt bei einem GEBUNDENEN Kaertchen nach draussen — die Bindung gewinnt", async () => {
    // DRK-302: das Kaertchen zeigt auf fz-1 und schlaegt jedes `?fz=`. Auch mit
    // zwei Einheiten waere „Andere Einheit" hier eine Schleife.
    t.db.update(tokens).set({ zielTyp: "fahrzeug", zielId: "fz-1" })
      .where(eq(tokens.id, "tk1")).run();
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);

    await mount(await BoxSeite(sp({ fz: "fz-2" })));
    expect(query("[data-rolle='leer-titel']").textContent).toContain("im Fahrzeug");
    expect(query("[data-rolle='leer-weg']").getAttribute("href")).toBe("/helfer");
  });

  it("reicht die Erreichbarkeit der Wahl an die Insel weiter", async () => {
    // ⚠️ DIE GEFUELLTE ANSICHT TRAEGT DENSELBEN LINK wie der Leerzustand
    // (Codex-Review zu PR #175, zweite Runde): eine Entscheidung, zwei
    // Ausgaenge. Zwei Rechnungen dafuer liefen beim naechsten Griff auseinander.
    fahrzeuge.mockReturnValue([FZ("fz-1"), FZ("fz-2")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='abgabe']").getAttribute("data-andere")).toBe("ja");
  });

  it("sagt der Insel, dass die Wahl dieselbe Einheit zurueckgaebe", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='abgabe']").getAttribute("data-andere")).toBe("nein");
  });

  it("markiert den Reiter „Box“ als aktiv", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='rahmen']").getAttribute("data-aktiv")).toBe("box");
  });

  it("sagt der Insel, dass ein KAERTCHEN gerade bucht", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='abgabe']").getAttribute("data-konto")).toBe("false");
  });

  it("sagt der Insel, dass ein KONTO gerade bucht — DRK-305", async () => {
    // Ohne diese Angabe ist der Rueckweg nach einem Ausfall eine Sackgasse: der
    // Server gibt den Kaertchen-Grund zurueck, und „Scanne das Kärtchen erneut"
    // fuehrt eine angemeldete Person ins Leere.
    cookieWert = undefined;
    angemeldet = { sub: "u-1", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='abgabe']").getAttribute("data-konto")).toBe("true");
  });
});

describe("helfer/box — die Bauform", () => {
  it("ist `force-dynamic`", () => {
    expect(seiteDynamic).toBe("force-dynamic");
  });

  it("importiert weder antd noch ein Icon-Paket", () => {
    // Fallen 1 und 7 — der Helfer-Ast ist bewusst antd-frei.
    const q = readFileSync(QUELLE, "utf8");
    expect(q).not.toMatch(/from\s+"antd/);
    expect(q).not.toMatch(/from\s+"@ant-design\/icons/);
  });

  /**
   * ⚠️ DIE ACTION GEHT NICHT MEHR ALS PROP IN DIE INSEL (DRK-375).
   * `_ui/BoxAbgabe.tsx` importiert `bucheInEntnahmebox` selbst; Falle 9
   * (`AGENTS.md`/`CLAUDE.md`): „Server Actions duerfen als einzige ueber die
   * Grenze — aber direkt importiert, nicht als Prop durchgereicht."
   *
   * ⚠️ ZWEI HAELFTEN, UND BEIDE TRAGEN. Am gerenderten Baum faellt auf, wenn
   * jemand den Prop zurueckholt; am Quelltext faellt auf, wenn die Importzeile
   * bleibt, ohne dass sie noch jemand benutzt — eine ungenutzte Einfuhr einer
   * Server Action ist genau die Zeile, aus der der Prop wieder entsteht.
   */
  it("reicht die Action NICHT als Prop durch", async () => {
    fahrzeuge.mockReturnValue([FZ("fz-1")]);
    bestandAn("fz-1", 4);
    await mount(await BoxSeite(sp({ fz: "fz-1" })));
    expect(query("[data-rolle='abgabe']").getAttribute("data-hat-buchen")).toBe("nein");
    expect(readFileSync(QUELLE, "utf8")).not.toMatch(/import .*from "\.\.\/\.\.\/_actions\/entnahmebox"/);
  });
});
