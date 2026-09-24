import { eq } from "drizzle-orm";
/**
 * J9 NACHGEMESSEN (04.08.2026, vitest 4.1.10): der relative Import aus
 * `e2e/helpers/decode-qr` loest aus einem `src`-Test auf (`sharp`/`jsQR` stehen
 * in devDependencies und sind auch ausserhalb von Playwright ladbar). Der
 * Rueckfall aus §8.5 (Helfer nach `src/core/qr/decode.ts` verschieben) ist
 * NICHT noetig. Kein zweiter Dekodierer, `src/core/qr/decode.ts` wird nicht
 * angelegt.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { artikel, lagerorte, tokens, newId } from "./schema";
import { decodeQr } from "../../../../../e2e/helpers/decode-qr";
import { etikettenDaten, ortEtikettenDaten, EtikettenBasisFehlt } from "./etiketten";
import { ENTNAHMEBOX_ID, HANDLAGER_ID } from "../_lib/konstanten";

/**
 * DER HOST WIRD GEMOCKT, NICHT DIE BASIS-URL — und das ist der Unterschied zum
 * Bestand. `../lagerbuch/src/db/etiketten.test.ts:2` mockt `config` auf
 * `https://lager.example` und assertiert genau den gemockten Wert: das friert
 * die Annahme ein, statt sie zu pruefen (§8.5).
 *
 * Hier wird `moduleUrl` gemockt, weil sein null-Zweig an
 * `process.env.NODE_ENV === "production"` haengt (core/shell/moduleUrl.ts:19-21)
 * und unter Vitest NIE greift — der Zustand aus 8-B waere sonst unpruefbar. Eine
 * Umstellung von NODE_ENV waere die Alternative und aenderte eine Variable, die
 * Next und antd mitlesen.
 */
const modulUrl = vi.hoisted(() => ({ wert: "https://lagerbuch.iuk-ue.de" as string | null }));
vi.mock("@/core/shell/moduleUrl", () => ({
  moduleUrl: (key: string) => (key === "lagerbuch" ? modulUrl.wert : null),
}));

let t: TestDb;
const A_ID = "V1StGXR8_Z5jdHi6B-myT"; // echte nanoid-Form, 21 Zeichen (§4.7)

beforeEach(() => {
  modulUrl.wert = "https://lagerbuch.iuk-ue.de";
  t = migrierteTestDb("lagerbuch-etiketten-");
  t.db
    .insert(artikel)
    .values({
      id: A_ID,
      name: "Mullbinde 8cm",
      fach: "A2",
      einheit: "Stk.",
      mindestbestand: 20,
      aktiv: true,
      createdAt: new Date(),
    })
    .run();
  t.db
    .insert(artikel)
    .values({
      id: newId(),
      name: "Alte Schiene",
      fach: "Z9",
      einheit: "Stk.",
      mindestbestand: 0,
      aktiv: false,
      createdAt: new Date(),
    })
    .run();
  t.db
    .insert(tokens)
    .values({
      id: newId(),
      code: "482-137",
      label: "RTW 1",
      aktiv: true,
      createdAt: new Date(),
      createdBy: "sub-1",
    })
    .run();
  t.db
    .insert(tokens)
    .values({
      id: newId(),
      code: "999-999",
      label: "gesperrt",
      aktiv: false,
      createdAt: new Date(),
      createdBy: "sub-1",
    })
    .run();
});
afterEach(() => t.schliessen());

describe("etikettenDaten", () => {
  /**
   * DIE EINZIGE KONSTRUKTION, DIE EINE REGRESSION DER BASIS-URL FANGEN KANN
   * (§8.5). Der Bestand prueft `toHaveAttribute("src", /^data:image\/png/)`
   * (lagerbuch/e2e/etiketten.spec.ts:13) — der QR wird dort NIE dekodiert, ein
   * Code mit falschem Inhalt bleibt gruen.
   */
  it("brennt den absoluten Deep-Link in die Pixel des Artikel-QR", async () => {
    const d = await etikettenDaten(t.db);
    const e = d.artikel.find((x) => x.id === A_ID)!;
    expect(await decodeQr(e.qr)).toBe(`https://lagerbuch.iuk-ue.de/a/${A_ID}`);
  });

  /**
   * DRK-394 — EINE ID MIT URL-TRENNZEICHEN KOMMT GANZ AN. `artikel.id` ist kein
   * nanoid-Vertrag; roh gedruckt landete `rtw#1&x=1` auf `/a/rtw`, und das
   * Etikett klebte trotzdem am Regal. Gelesen ueber `URL` wie im Browser.
   */
  it("druckt eine Id mit Trennzeichen so, dass sie vollstaendig ankommt", async () => {
    const id = "rtw#1&x=1 %";
    t.db.insert(artikel).values({
      id, name: "Importiert", fach: "B1", einheit: "Stk.", mindestbestand: 0,
      aktiv: true, createdAt: new Date(),
    }).run();
    const d = await etikettenDaten(t.db);
    const e = d.artikel.find((x) => x.id === id)!;
    const gelesen = new URL(await decodeQr(e.qr));
    expect(gelesen.hash).toBe("");
    expect(gelesen.search).toBe("");
    expect(decodeURIComponent(gelesen.pathname.replace(/^\/a\//, ""))).toBe(id);
  });

  /**
   * DRK-406 — DIESER BOGEN DRUCKT KEINE ZUGANGS-KAERTCHEN MEHR.
   *
   * ⚠️ HIER STANDEN ZWEI ZUSICHERUNGEN AUF DIE KAERTCHEN-KARTEN („brennt den
   * absoluten Token-Link in die Pixel", „laesst den Bindestrich im Code
   * stehen"). Beide gelten unveraendert weiter — nur an der Stelle, an der ein
   * Code heute gedruckt wird: auf der ORTSKARTE. Sie stehen jetzt bei
   * `ortEtikettenDaten` („kodiert die absolute Einloese-Adresse des Ortscodes
   * in die Pixel").
   *
   * ⚠️ WAS DIESE ZUSICHERUNG DAFUER NEU HAELT, ist die Abwesenheit, und die
   * braucht ein eigenes Netz: die Grundmontierung legt einen aktiven Code
   * (`482-137`) an. Bliebe irgendwo eine Token-Schleife stehen, waere sie am
   * Datenobjekt sofort zu sehen — aber KEINE andere Zusicherung dieser Datei
   * schaute hin.
   */
  it("liefert nur Artikel und keine Kaertchen mehr", async () => {
    const d = await etikettenDaten(t.db);
    expect(Object.keys(d).sort()).toEqual(["artikel", "basis"]);
    expect(JSON.stringify(d)).not.toContain("482-137");
  });

  /** SVG, nicht data:image/png (8-I, Punkt 1). Vektor statt 200px-Raster —
   *  bei 20mm Kante gibt es damit keine Aufloesungsgrenze. */
  it("liefert einen SVG-String, keine Data-URL", async () => {
    const d = await etikettenDaten(t.db);
    expect(d.artikel[0].qr.trimStart().startsWith("<svg")).toBe(true);
    expect(d.artikel[0].qr).not.toContain("data:image");
  });

  /**
   * EIN FEHLENDES `await` ERGAEBE HIER KEINE FEHLERMELDUNG, sondern
   * `[object Promise]` als Markup — ein Bogen voller identischer, unlesbarer
   * Kaestchen (8-I, Punkt 1).
   */
  it("laesst nirgends ein Promise stehen", async () => {
    const d = await etikettenDaten(t.db);
    for (const e of d.artikel) {
      expect(e.qr).not.toContain("[object Promise]");
    }
  });

  /** 1:1 aus etiketten.ts:16-17 — und die Luecke steht als R32 im Runbook. */
  it("nimmt nur aktive Artikel", async () => {
    const d = await etikettenDaten(t.db);
    expect(d.artikel.map((a) => a.name)).toEqual(["Mullbinde 8cm"]);
  });

  /**
   * §8.1, 8-B, Fehlerzustand 2: `moduleUrl` nimmt `prodHostsFor(mod)[0]`. Die
   * REIHENFOLGE der Liste bestimmt, welcher Host in die gedruckten Pixel wandert.
   * Deshalb reicht die Funktion die verwendete Basis heraus — die Seite schreibt
   * sie ueber den Bogen, und das ist der einzige Weg, eine Umsortierung VOR dem
   * Papier zu bemerken.
   */
  it("gibt die verwendete Basis heraus", async () => {
    const d = await etikettenDaten(t.db);
    expect(d.basis).toBe("https://lagerbuch.iuk-ue.de");
  });

  it("schneidet einen abschliessenden Schraegstrich ab", async () => {
    modulUrl.wert = "https://lagerbuch.iuk-ue.de/";
    const d = await etikettenDaten(t.db);
    expect(d.basis).toBe("https://lagerbuch.iuk-ue.de");
    expect(d.artikel[0].url).not.toContain("//a/");
  });

  /**
   * §11.5, ZUSTAND 38 — ein Zustand, den es heute nicht geben KANN
   * (config.ts:33 traegt einen zod-Default) und der nach dem Port der
   * wahrscheinlichste Fehlstart ist. Verboten ist beides, was ohne diese Regel
   * passiert: ein QR mit dem Text `null/a/<id>`, und ein stiller Rueckfall auf
   * einen relativen Pfad — ein relativer QR ist auf Papier bedeutungslos und
   * sieht auf dem Bildschirm richtig aus.
   */
  it("wirft EtikettenBasisFehlt, wenn moduleUrl null liefert", async () => {
    modulUrl.wert = null;
    await expect(etikettenDaten(t.db)).rejects.toThrow(EtikettenBasisFehlt);
  });

  /**
   * Die BENANNTE Klasse ist der Grund, warum die Seite den Zustand von einem
   * Datenbankfehler unterscheiden kann, ohne einen Text zu vergleichen (J8).
   */
  it("traegt einen unterscheidbaren Namen", async () => {
    modulUrl.wert = null;
    await expect(etikettenDaten(t.db)).rejects.toMatchObject({ name: "EtikettenBasisFehlt" });
  });

  it("erzeugt in diesem Fall gar keinen QR", async () => {
    modulUrl.wert = null;
    await expect(etikettenDaten(t.db)).rejects.toThrow();
    // Kein Teil-Ergebnis, kein `null/a/<id>` irgendwo — die Funktion steigt vor
    // dem ersten qrSvg aus.
  });
});

/**
 * DIE ORTSKARTEN — DRK-312.
 *
 * ⚠️ DIE FIXTURE STEHT HIER UND NICHT IM `beforeEach` OBEN: die Lagerorte
 * gehen keinen der Tests darueber etwas an, und eine Fixture, die jeder Test
 * mittraegt, ohne sie zu benutzen, laedt den naechsten Leser ein, sie fuer eine
 * Vorbedingung zu halten. Der Handlager selbst kommt aus Migration 0003 und
 * wird nur benutzt.
 */
describe("ortEtikettenDaten", () => {
  beforeEach(() => {
    t.db.insert(lagerorte).values([
      { id: "rtw-1", name: "RTW 1", typ: "fahrzeug", kennung: "HN-DRK-1101",
        aktiv: true, einheitenart: "fahrzeug" },
      { id: "tasche-san", name: "Sanitätstasche 1", typ: "fahrzeug", kennung: null,
        aktiv: true, einheitenart: "tasche" },
      { id: "alt-elw", name: "ELW alt", typ: "fahrzeug", kennung: "HN-DRK-9",
        aktiv: false, einheitenart: "fahrzeug" },
    ]).run();
  });

  /**
   * ⚠️ DIESELBE KONSTRUKTION WIE OBEN, UND AUS DEMSELBEN GRUND: der QR wird
   * ZURUECKDEKODIERT, nicht auf sein Vorhandensein geprueft. Eine Zusicherung
   * auf ein `<svg>` bliebe gruen, wenn die Nutzlast ein relativer Pfad waere —
   * und ein relativer QR ist auf Papier bedeutungslos, sieht am Bildschirm aber
   * richtig aus. Bei einem laminierten Kaertchen am Fahrzeug faellt das erst
   * auf, wenn jemand davorsteht und scannt.
   */
  it("kodiert die absolute Einloese-Adresse des Ortscodes in die Pixel", async () => {
    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    const rtw = daten.orte.find((o) => o.id === "rtw-1")!;
    /*
     * ⚠️ `/t/<code>` UND NICHT MEHR `/o/<id>` — DRK-406. Bis dahin trug jede
     * Karte ihre Ortsadresse, und ein Scan verlangte eine Anmeldung.
     */
    expect(rtw.code).toMatch(/^\d{3}-\d{3}$/);
    expect(rtw.url).toBe(`https://lagerbuch.iuk-ue.de/t/${rtw.code}`);
    expect(await decodeQr(rtw.qr)).toBe(`https://lagerbuch.iuk-ue.de/t/${rtw.code}`);
  });

  /**
   * ⚠️ QR UND FUSSZEILE MUESSEN DENSELBEN ZUGANG NENNEN — und das ist die
   * teuerste Karte ueberhaupt, wenn es schiefgeht: ein QR auf den einen Zugang,
   * darunter die abtippbare Adresse auf den anderen. Wer die Karte scannt und
   * wer sie abtippt, landeten dann an verschiedenen Orten.
   */
  it("laesst QR und abtippbare Adresse nie auseinanderlaufen", async () => {
    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    for (const o of daten.orte) {
      expect(await decodeQr(o.qr), o.id).toBe(o.url);
    }
  });

  /**
   * DIE ZUSAGE DES TICKETS, IN EINER ZEILE: jede Karte traegt einen Code.
   *
   * ⚠️ SIE ENTSTEHEN BEIM OEFFNEN DIESER SEITE, nicht vorher — das ist die
   * Betreiberentscheidung vom 17.09.2026. Die Grundmontierung dieses Laufs legt
   * KEINE Ortscodes an; sie entstehen erst durch den Aufruf.
   */
  it("versorgt jede Karte mit einem Code und meldet, wie viele neu sind", async () => {
    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");

    expect(daten.orte.map((o) => o.code === null)).toEqual([false, false, false, false]);
    // DRK-417: vier Karten — Handlager, Entnahmebox und die zwei Einheiten.
    expect(daten.neueCodes).toBe(4);

    // ⚠️ DER ZWEITE AUFRUF LEGT NICHTS NACH, und die Codes bleiben dieselben.
    // Sonst wechselte der Code am Fahrzeug bei jedem Blick in die Vorschau,
    // und jede gedruckte Karte waere beim Ankleben schon tot.
    const zweiter = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    expect(zweiter.neueCodes).toBe(0);
    expect(zweiter.orte.map((o) => o.code)).toEqual(daten.orte.map((o) => o.code));
  });

  it("nimmt die beiden festen Orte und die aktiven Einheiten, die festen zuerst", async () => {
    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    expect(daten.orte.map((o) => o.id))
      .toEqual([HANDLAGER_ID, ENTNAHMEBOX_ID, "rtw-1", "tasche-san"]);
  });

  /**
   * ⚠️ `standortMeta` UND NICHT `einheitMeta`: fuer ein Lager ist die
   * Einheitenart gegenstandslos, nicht „noch nicht zugeordnet". Stuende dort
   * der Zwischenstandstext, laese sich der Handlager auf dem gedruckten Etikett
   * als eine Einheit, bei der jemand die Zuordnung vergessen hat (DRK-309).
   */
  it("schreibt je Karte eine Beizeile, die die Art benennt", async () => {
    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    /*
     * ⚠️ DIE ENTNAHMEBOX TRAEGT „Lager" WIE DER HANDLAGER — DRK-417, und das
     * ist richtig: `standortMeta` beantwortet die Art des ORTES, und beide sind
     * Lager. Was die beiden Karten unterscheidet, ist ihr NAME und ihr Code;
     * eine eigene Beizeile fuer die Kiste waere eine zweite Sprache fuer eine
     * Sache, die das Modul schon benennt.
     */
    expect(daten.orte.map((o) => o.meta))
      .toEqual(["Lager", "Lager", "Fahrzeug · HN-DRK-1101", "Tasche"]);
  });

  /**
   * ⚠️ ZWEI GLEICHNAMIGE EINHEITEN MUESSEN AUF PAPIER UNTERSCHEIDBAR BLEIBEN
   * (Codex-Befund zu PR #177). Zwei aktive Taschen „Betreuung" ohne Kennung
   * ergaeben sonst zwei Karten mit identischem Namen UND identischer Beizeile
   * — nur die QR-Codes zeigten auf verschiedene Einheiten. Wer die Kaertchen
   * beim Ankleben vertauscht, bucht ab da jeden Check auf die falsche.
   *
   * Zwei gleiche Namen sind ausdruecklich erlaubt: `lagerorte.name` traegt
   * fuer Einheiten keinen Eindeutigkeitsschluessel.
   */
  it("gibt zwei gleichnamigen Einheiten je einen Unterscheider", async () => {
    t.db.insert(lagerorte).values([
      { id: "tasche-a", name: "Betreuung", typ: "fahrzeug", kennung: null,
        aktiv: true, einheitenart: "tasche" },
      { id: "tasche-b", name: "Betreuung", typ: "fahrzeug", kennung: null,
        aktiv: true, einheitenart: "tasche" },
    ]).run();

    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    const beide = daten.orte.filter((o) => o.name === "Betreuung");
    expect(beide).toHaveLength(2);
    // Die eigentliche Zusage: die zwei Karten lesen sich NICHT gleich.
    expect(beide.map((o) => o.unterscheidung)).toEqual(["tasche-a", "tasche-b"]);
    /*
     * ⚠️ UND DIE BEIZEILE BLEIBT SCHLICHT. Sie ist auf der Karte EINE Zeile mit
     * `text-overflow`; stuende der Unterscheider dort, verschwaende er als
     * Erstes — gemessen reichte die Zeile fuer „Tasche · <id>" (30 Zeichen)
     * gerade noch, fuer „nicht zugeordnet · <id>" (40) nicht mehr. Genau das
     * war der eigene Fehlgriff, den diese Zeile festhaelt.
     */
    for (const o of beide) expect(o.meta).toBe("Tasche");
  });

  /**
   * ⚠️ AUCH MIT KENNUNG. Der Fall, an dem die alte Bauform gemessen scheiterte:
   * „Fahrzeug · HN-DRK-1101 · <id>" sind 46 Zeichen und brauchte 325 von 212px.
   * Im Fuss ist der Unterscheider davon unberuehrt.
   */
  it("traegt den Unterscheider auch, wenn die Beizeile schon lang ist", async () => {
    t.db.insert(lagerorte).values([
      { id: "rtw-x", name: "Doppelt", typ: "fahrzeug", kennung: "HN-DRK-1101",
        aktiv: true, einheitenart: "fahrzeug" },
      { id: "rtw-y", name: "Doppelt", typ: "fahrzeug", kennung: "HN-DRK-1101",
        aktiv: true, einheitenart: "fahrzeug" },
    ]).run();

    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    const beide = daten.orte.filter((o) => o.name === "Doppelt");
    expect(beide.map((o) => o.unterscheidung)).toEqual(["rtw-x", "rtw-y"]);
    for (const o of beide) expect(o.meta).toBe("Fahrzeug · HN-DRK-1101");
  });

  /**
   * ⚠️ DIE GEGENPROBE, OHNE DIE DIE ZEILE DARUEBER ZU VIEL BEWIESE: die Id
   * erscheint NUR im Kollisionsfall. Sie ist haesslich, und eine Beizeile, die
   * sie immer truege, waere auf jeder Karte schlechter lesbar — auf 64mm zaehlt
   * jedes Zeichen.
   */
  it("laesst die Beizeile ohne Kollision in Ruhe", async () => {
    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    const rtw = daten.orte.find((o) => o.id === "rtw-1")!;
    expect(rtw.meta).toBe("Fahrzeug · HN-DRK-1101");
    expect(daten.orte.find((o) => o.id === HANDLAGER_ID)!.meta).toBe("Lager");
    // Die Id ist haesslich und erscheint NUR im Kollisionsfall.
    for (const o of daten.orte) expect(o.unterscheidung, o.name).toBeNull();
  });

  /**
   * ⚠️ DER HANDLAGER GEHT NICHT DURCH `einheitLabels`. Er ist ein
   * `typ: "lager"`; `einheitMeta` machte aus seiner fehlenden `einheitenart`
   * ein „nicht zugeordnet" — also eine Einheit, bei der jemand die Art
   * vergessen hat (DRK-309). Er bleibt „Lager", auch wenn eine Einheit
   * genauso heisst.
   */
  it("laesst den Handlager ein Lager bleiben, auch neben einer gleichnamigen Einheit", async () => {
    t.db.insert(lagerorte).values({
      id: "tasche-hl", name: "Handlager", typ: "fahrzeug", kennung: null,
      aktiv: true, einheitenart: "tasche",
    }).run();

    const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
    expect(daten.orte.find((o) => o.id === HANDLAGER_ID)!.meta).toBe("Lager");
    expect(daten.orte.find((o) => o.id === "tasche-hl")!.meta).toBe("Tasche");
    // Und er bekommt keinen Unterscheider: er kollidiert mit keiner Einheit,
    // weil „Lager" keine Einheit je erzeugt.
    expect(daten.orte.find((o) => o.id === HANDLAGER_ID)!.unterscheidung).toBeNull();
  });

  /**
   * DIE ORTSCODES UND DER ALTBESTAND — DRK-406.
   *
   * Die Grundmontierung bringt zwei Codes OHNE Zugehoerigkeit mit: `482-137`
   * (aktiv) und `999-999` (gesperrt). Beide sind Altbestand und haben mit den
   * Karten nichts zu tun.
   */
  describe("Ortscodes gegen Altbestand", () => {
    /**
     * ⚠️ DER ALTBESTAND DARF NICHT AUF EINE KARTE RUTSCHEN. Er gehoert keinem
     * Ort, und ein Kaertchen mit Fahrzeugziel auf der Handlager-Karte ergaebe
     * ein Etikett, das das Regal verspricht und den Fahrzeug-Check liefert.
     * Seit DRK-406 kann das konstruktiv nicht mehr passieren — die Karte liest
     * ihren Code ueber `ort_id`, und Altbestand hat keine. Diese Zusicherung
     * haelt genau das fest.
     */
    it("nimmt keinen Code ohne Zugehoerigkeit auf eine Karte", async () => {
      const daten = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
      const codes = daten.orte.map((o) => o.code);
      expect(codes).not.toContain("482-137");
      expect(codes).not.toContain("999-999");
    });

    /**
     * ⚠️ EIN GESPERRTER ORTSCODE IST GESPERRT, WEIL EINE KARTE ABHANDEN
     * GEKOMMEN IST. Ihn auf eine Karte zu drucken hiesse, ihn auf Papier wieder
     * auszugeben — und die Karte fuehrte beim Scan aufs Anmeldefeld.
     */
    it("druckt einen gesperrten Ortscode nicht, sondern zieht einen neuen nach", async () => {
      const erst = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
      const alt = erst.orte.find((o) => o.id === "rtw-1")!.code!;
      t.db.update(tokens).set({ aktiv: false }).where(eq(tokens.code, alt)).run();

      const danach = await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
      const neu = danach.orte.find((o) => o.id === "rtw-1")!.code!;
      expect(neu).not.toBe(alt);
      expect(danach.neueCodes).toBe(1);
    });

    /**
     * ⚠️ DER HANDLAGER-CODE HAT KEIN ZIEL, der Einheiten-Code schon. Landete
     * der Handlager-Code auf `ziel_typ: "fahrzeug"`, fuehrte ein Scan am Regal
     * in den Fahrzeug-Check.
     */
    it("gibt dem Handlager kein Ziel und der Einheit ihres", async () => {
      await ortEtikettenDaten(t.db, "sub-1", "A. Verwaltung");
      const zeilen = t.db.select().from(tokens).all();

      const lager = zeilen.find((z) => z.ortId === HANDLAGER_ID)!;
      expect(lager.zielTyp).toBeNull();
      const rtw = zeilen.find((z) => z.ortId === "rtw-1")!;
      expect(rtw.zielTyp).toBe("fahrzeug");
      expect(rtw.zielId).toBe("rtw-1");
    });
  });

  /** Ohne Basis gibt es keinen halben Bogen — dieselbe Zusage wie oben. */
  it("wirft EtikettenBasisFehlt, wenn moduleUrl null liefert", async () => {
    modulUrl.wert = null;
    await expect(ortEtikettenDaten(t.db, "sub-1", null)).rejects.toThrow(EtikettenBasisFehlt);
  });
});
