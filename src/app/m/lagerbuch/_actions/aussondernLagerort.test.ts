import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import {
  artikel, buchungen, chargen, lagerorte, lagerortVerfall, sollPositionen,
} from "../_db/schema";

const { adminRiegel, revalidiert } = vi.hoisted(() => ({
  adminRiegel: vi.fn<() => Promise<unknown>>(),
  revalidiert: [] as string[],
}));

vi.mock("next/cache", () => ({
  revalidatePath: (pfad: string) => { revalidiert.push(pfad); },
}));

vi.mock("../_lib/zugang", () => ({
  requireLagerbuchAdmin: () => adminRiegel(),
}));

vi.mock("../_db/client", () => ({
  getDb: () => { throw new Error("getDb() im Test - jeder Aufruf uebergibt t.db"); },
}));

import { aussondernVomLagerort } from "./aussondernLagerort";

const JETZT = new Date("2026-08-07T10:00:00Z");
const VIEWER = { sub: "u-admin", groups: ["lagerbuch"], name: "A. Verwaltung", email: null };

let t: TestDb;

beforeEach(() => {
  revalidiert.length = 0;
  adminRiegel.mockResolvedValue(VIEWER);
  t = migrierteTestDb("lagerbuch-actions-aussondern-ort-");

  t.db.insert(lagerorte).values({ id: "fz-1", name: "RTW 1", typ: "fahrzeug", aktiv: true }).run();
  t.db.insert(artikel).values({
    id: "art-1", name: "Kompresse", einheit: "Stk", fach: "A-01",
    mindestbestand: 1, aktiv: true, createdAt: JETZT, kategorie: null, bestelltAt: null,
  }).run();
  t.db.insert(sollPositionen).values({
    id: "soll-1", fahrzeugId: "fz-1", fachLabel: "Fach A", sort: 0,
    artikelId: "art-1", soll: 4, templatePositionId: null,
    ueberschrieben: false, entfernt: false,
  }).run();
});

function charge(id: string, verfall: string) {
  t.db.insert(chargen).values({
    id, artikelId: "art-1", chargenNr: id, verfall, createdAt: JETZT,
  }).run();
}

function buchen(id: string, chargeId: string, menge: number) {
  t.db.insert(buchungen).values({
    id, ts: JETZT, typ: "zugang", artikelId: "art-1", chargeId,
    lagerortId: "fz-1", menge, quelleTyp: "system", quelleId: "seed",
    referenz: null, kommentar: null,
  }).run();
}

/** Bestand des Artikels am Fahrzeug, je Charge. */
function restJeCharge() {
  const karte = new Map<string, number>();
  for (const b of t.db.select().from(buchungen).all()) {
    if (b.lagerortId !== "fz-1") continue;
    karte.set(b.chargeId, (karte.get(b.chargeId) ?? 0) + b.menge);
  }
  return karte;
}

describe("aussondernVomLagerort", () => {
  it("bucht die gezaehlte Menge FEFO-verteilt vom Fahrzeug aus", async () => {
    charge("ch-alt", "2020-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 4);
    buchen("seed-neu", "ch-neu", 6);

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 5,
        kommentar: "MHD ueberschritten",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    // FEFO: die frueher ablaufende Charge zuerst leeren, Rest aus der juengeren.
    expect(restJeCharge().get("ch-alt")).toBe(0);
    expect(restJeCharge().get("ch-neu")).toBe(5);
  });

  it("loescht die Verfallsangabe des Fahrzeugs, wenn kein Datum uebergeben wird", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);
    t.db.insert(lagerortVerfall).values({
      id: "lv-1", lagerortId: "fz-1", artikelId: "art-1", verfall: "2020-01",
      erfasstAt: JETZT, quelleTyp: "system", quelleId: "seed",
    }).run();

    const erg = await aussondernVomLagerort(
      { lagerortId: "fz-1", artikelId: "art-1", menge: 4, kommentar: "alles raus" },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
  });

  it("lehnt ab, wenn am Lagerort weniger liegt als ausgesondert werden soll", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 3);
    const vorher = t.db.select().from(buchungen).all().length;

    const erg = await aussondernVomLagerort(
      { lagerortId: "fz-1", artikelId: "art-1", menge: 5, kommentar: "MHD" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    // Keine Teilaussonderung im Stillen: der Bestand bleibt unberuehrt.
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
    expect(restJeCharge().get("ch-alt")).toBe(3);
  });

  it("bucht bei angegebener Charge genau diese ab, nicht die FEFO-naechste", async () => {
    charge("ch-alt", "2020-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 4);
    buchen("seed-neu", "ch-neu", 6);

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 2,
        chargeId: "ch-neu", kommentar: "Packung beschaedigt",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(restJeCharge().get("ch-alt")).toBe(4);
    expect(restJeCharge().get("ch-neu")).toBe(4);
  });

  it("meldet ein ungueltiges Verfallsdatum als Fehler und bucht nichts", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);
    const vorher = t.db.select().from(buchungen).all().length;

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 2,
        verfall: "2026-13", kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(false);
    // Die Abbuchung stand VOR dem Verfallsschreiben — sie darf nicht stehenbleiben.
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
    expect(restJeCharge().get("ch-alt")).toBe(4);
  });

  it("kennzeichnet die Buchung als Aussonderung", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);

    await aussondernVomLagerort(
      { lagerortId: "fz-1", artikelId: "art-1", menge: 2, kommentar: "MHD ueberschritten" },
      t.db,
    );

    const neue = t.db.select().from(buchungen).all().filter((b) => b.id !== "seed-alt");
    expect(neue).toHaveLength(1);
    // Das Praefix macht die Aussonderung im Journal von einem Zaehl-Abgleich
    // unterscheidbar — der ganze Grund dieses Weges.
    expect(neue[0].referenz).toBe("aussondern:fz-1");
    expect(neue[0].kommentar).toBe("MHD ueberschritten");
  });

  it("frischt die Detailseite des Lagerorts mit auf", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);

    await aussondernVomLagerort(
      { lagerortId: "fz-1", artikelId: "art-1", menge: 2, kommentar: "MHD" },
      t.db,
    );

    // Ohne den Detailpfad stuende nach dem Schliessen des Dialogs der alte Bestand.
    /*
     * ⚠️ ALS MUSTER, NICHT MIT DER ID (Codex-Review zu PR #187): jede
     * Fahrzeugseite zeigt ueber `sollFuerFahrzeug` auch den Handlager-Bestand,
     * den diese Korrekturbuchung mit senkt — betroffen sind alle, nicht nur die
     * ausgeraeumte Einheit.
     */
    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/fahrzeuge/[id]");
    expect(revalidiert).toContain("/m/lagerbuch/verwaltung/fahrzeuge");
  });
});

describe("aussondernVomLagerort — Zugehoerigkeit", () => {
  it("lehnt einen Lagerort ab, der kein Fahrzeug ist", async () => {
    charge("ch-alt", "2020-01");
    t.db.insert(buchungen).values({
      id: "seed-handlager", ts: JETZT, typ: "zugang", artikelId: "art-1",
      chargeId: "ch-alt", lagerortId: "handlager", menge: 9,
      quelleTyp: "system", quelleId: "seed", referenz: null, kommentar: null,
    }).run();
    const vorher = t.db.select().from(buchungen).all().length;

    const erg = await aussondernVomLagerort(
      { lagerortId: "handlager", artikelId: "art-1", menge: 2, kommentar: "MHD" },
      t.db,
    );

    // Das Handlager hat seinen eigenen, chargengebundenen Weg, der eine
    // ABGELAUFENE Charge verlangt. Dieser hier duerfte ihn sonst umgehen.
    expect(erg.ok).toBe(false);
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
  });

  it("lehnt ab, wenn der Artikel dort nicht mehr im aktiven Soll steht", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);
    // Grabstein: die Position bleibt fuer den Vorlagen-Sync stehen, zaehlt aber
    // nicht mehr als Zugehoerigkeit — genau der Stand, den eine offene Seite hat,
    // waehrend jemand anders die Soll-Bestueckung aendert.
    t.db.update(sollPositionen).set({ entfernt: true }).run();
    const vorher = t.db.select().from(buchungen).all().length;

    const erg = await aussondernVomLagerort(
      { lagerortId: "fz-1", artikelId: "art-1", menge: 2, verfall: "2027-05", kommentar: "MHD" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(t.db.select().from(buchungen).all()).toHaveLength(vorher);
    // ⚠️ UND KEINE VERWAISTE VERFALLSZEILE: ohne aktives Soll gibt es keine
    // pflegbare Meldung, und `bereinigeVerfallOhneAktivesSoll` wuerde sie beim
    // naechsten Soll-Umbau ohnehin wegfegen.
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
  });
});

describe("aussondernVomLagerort — die Meldung nennt die Art der Einheit", () => {
  /**
   * DRK-309, Reviewrunde 12. Der Dialog daneben zeigt die Antwort dieser
   * Action WOERTLICH an (`AussondernDialog.tsx`) — nur sie weiss, woran es
   * lag. „Fahrzeug" in einer Meldung ueber eine Tasche widerspraeche dem
   * Chip in derselben Ansicht, und zwar an der Stelle, an der jemand gerade
   * etwas Unumkehrbares bestaetigt hat.
   *
   * ⚠️ DER AUSLOESER IST EIN RENNEN, kein Bedienfehler: die Seite steht
   * offen, waehrend ein Vorlagen-Sync den Artikel aus dem Soll nimmt. Er
   * faellt also nicht beim Durchspielen auf.
   */
  async function meldungFuer(art: "fahrzeug" | "tasche" | null): Promise<string> {
    t.db.update(lagerorte).set({ einheitenart: art })
      .where(eq(lagerorte.id, "fz-1")).run();
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);
    t.db.update(sollPositionen).set({ entfernt: true }).run();

    const erg = await aussondernVomLagerort(
      { lagerortId: "fz-1", artikelId: "art-1", menge: 2, kommentar: "MHD" },
      t.db,
    );
    expect(erg.ok).toBe(false);
    return erg.ok ? "" : erg.fehler;
  }

  it("sagt „an dieser Tasche", async () => {
    expect(await meldungFuer("tasche"))
      .toBe("Artikel steht an dieser Tasche nicht im Soll.");
  });

  it("sagt „an diesem Fahrzeug", async () => {
    expect(await meldungFuer("fahrzeug"))
      .toBe("Artikel steht an diesem Fahrzeug nicht im Soll.");
  });

  it("faellt im Zwischenstand auf das neutrale Wort — nicht auf „Fahrzeug", async () => {
    // Migration 0010 backfillt nicht; „Fahrzeug" waere hier eine Behauptung.
    expect(await meldungFuer(null))
      .toBe("Artikel steht an dieser Einheit nicht im Soll.");
  });

  it("nennt beim Handlager BEIDE Arten, weil ein Lager gar keine hat", async () => {
    charge("ch-alt", "2020-01");
    t.db.insert(buchungen).values({
      id: "seed-handlager", ts: JETZT, typ: "zugang", artikelId: "art-1",
      chargeId: "ch-alt", lagerortId: "handlager", menge: 9,
      quelleTyp: "system", quelleId: "seed", referenz: null, kommentar: null,
    }).run();

    const erg = await aussondernVomLagerort(
      { lagerortId: "handlager", artikelId: "art-1", menge: 2, kommentar: "MHD" },
      t.db,
    );

    expect(erg.ok).toBe(false);
    expect(erg.ok ? "" : erg.fehler)
      .toBe("Dieser Weg gilt nur für Fahrzeuge und Taschen.");
  });
});

describe("aussondernVomLagerort — Verfall haengt am VERBLEIBENDEN Bestand", () => {
  /**
   * ⚠️ DIE ENTSCHEIDUNG „ALLES RAUS" DARF NICHT VOM CLIENT KOMMEN. Der Dialog
   * rechnet sie aus dem Bestand, den er beim RENDERN gesehen hat. Bucht jemand
   * anders in der Zwischenzeit ab, sendet er eine Teilmenge samt Datum — und
   * die Teilmenge leert den Bestand tatsaechlich. Die Zeile bliebe mit einem
   * Datum stehen, zu dem nichts mehr im Fahrzeug liegt.
   */
  it("loescht die Angabe, wenn die Buchung den Bestand leert — auch mit Datum", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);
    t.db.insert(lagerortVerfall).values({
      id: "lv-1", lagerortId: "fz-1", artikelId: "art-1", verfall: "2020-01",
      erfasstAt: JETZT, quelleTyp: "system", quelleId: "seed",
    }).run();

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 4,
        verfall: "2027-05", kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
  });

  it("behaelt die Angabe, solange etwas liegen bleibt", async () => {
    charge("ch-alt", "2020-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 4);
    buchen("seed-neu", "ch-neu", 6);

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 4,
        verfall: "2027-05", kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(t.db.select().from(lagerortVerfall).all().map((z) => z.verfall)).toEqual(["2027-05"]);
  });

  it("zaehlt beim Chargenabgang den GANZEN Artikel, nicht nur die Charge", async () => {
    charge("ch-alt", "2020-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 4);
    buchen("seed-neu", "ch-neu", 6);

    // Die gewaehlte Charge wird vollstaendig geleert — der Artikel aber nicht.
    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 4, chargeId: "ch-alt",
        verfall: "2027-05", kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(t.db.select().from(lagerortVerfall).all().map((z) => z.verfall)).toEqual(["2027-05"]);
  });
});

describe("aussondernVomLagerort — meldet den TATSAECHLICH geschriebenen Verfall", () => {
  /**
   * ⚠️ DIE OBERFLAECHE DARF NICHT IHREN EIGENEN EINGABEWERT SPIEGELN. Seit die
   * Transaktion ueber „alles raus" entscheidet, koennen Eingabe und Ergebnis
   * auseinandergehen: der Dialog schickt ein Datum, die Buchung leert den
   * Bestand, und geschrieben wird `null`. Spiegelt die Tabelle den EINGABEwert,
   * zeigt ihr Waehler danach ein Datum, das in der Datenbank nicht steht.
   */
  it("meldet null, wenn die Buchung den Bestand leert", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 4,
        verfall: "2027-05", kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { verfall: string | null } }).wert.verfall).toBeNull();
  });

  it("meldet den Monat, solange etwas liegen bleibt", async () => {
    charge("ch-alt", "2020-01");
    charge("ch-neu", "2030-01");
    buchen("seed-alt", "ch-alt", 4);
    buchen("seed-neu", "ch-neu", 6);

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 4,
        verfall: "2027-05", kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { verfall: string | null } }).wert.verfall)
      .toBe("2027-05");
  });
});

describe("aussondernVomLagerort — ein leeres Datum heisst „bewusst geleert\"", () => {
  /**
   * Ein leeres Feld heisst „geleert" nur IM VERGLEICH zu dem, was beim Oeffnen
   * darin stand. Ohne diesen Bezug waere es von „nie etwas eingetragen" nicht zu
   * unterscheiden — und die Aktion ruehrte einen fremden Stand an, den sie gar
   * nicht gemeint hat.
   */
  it("loescht die Angabe auf Wunsch, obwohl Bestand bleibt", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 10);
    t.db.insert(lagerortVerfall).values({
      id: "lv-1", lagerortId: "fz-1", artikelId: "art-1", verfall: "2020-01",
      erfasstAt: JETZT, quelleTyp: "system", quelleId: "seed",
    }).run();

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 2,
        // Angezeigt war 2020-01, abgeschickt wird leer: eine Aussage.
        verfallVorher: "2020-01", verfall: "", kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect((erg as { ok: true; wert: { verfall: string | null } }).wert.verfall).toBeNull();
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
  });
});

describe("aussondernVomLagerort — ruehrt einen Verfall nicht an, den niemand geaendert hat", () => {
  function meldung(verfall: string) {
    t.db.insert(lagerortVerfall).values({
      id: "lv-1", lagerortId: "fz-1", artikelId: "art-1", verfall,
      erfasstAt: JETZT, quelleTyp: "system", quelleId: "seed",
    }).run();
  }

  /**
   * ⚠️ DER VERLORENE FREMDSCHREIBVORGANG. Der Dialog belegt sein Feld beim
   * Oeffnen vor und schickt den Wert beim Absenden mit — auch wenn niemand ihn
   * angefasst hat. Aendert inzwischen JEMAND ANDERES den Monat, schriebe diese
   * Aussonderung den alten Stand darueber, obwohl sie mit dem Datum gar nichts
   * wollte. Ein Dialog hat nichts zu schreiben, worum er nicht gebeten wurde.
   */
  it("laesst den inzwischen geaenderten Monat einer anderen Sitzung stehen", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 10);
    meldung("2029-01");   // jemand anderes war schneller

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 2,
        // Was der Dialog beim Oeffnen SAH — und unveraendert zurueckschickt.
        verfallVorher: "2027-03", verfall: "2027-03",
        kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(t.db.select().from(lagerortVerfall).all().map((z) => z.verfall)).toEqual(["2029-01"]);
    // Und die Oberflaeche erfaehrt den WAHREN Stand, nicht ihre eigene Eingabe.
    expect((erg as { ok: true; wert: { verfall: string | null } }).wert.verfall)
      .toBe("2029-01");
  });

  it("schreibt sehr wohl, wenn die Person den Monat geaendert hat", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 10);
    meldung("2029-01");

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 2,
        verfallVorher: "2027-03", verfall: "2028-06",
        kommentar: "MHD",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    expect(t.db.select().from(lagerortVerfall).all().map((z) => z.verfall)).toEqual(["2028-06"]);
  });

  it("loescht trotzdem, wenn der Bestand auf null geht", async () => {
    charge("ch-alt", "2020-01");
    buchen("seed-alt", "ch-alt", 4);
    meldung("2029-01");

    const erg = await aussondernVomLagerort(
      {
        lagerortId: "fz-1", artikelId: "art-1", menge: 4,
        verfallVorher: "2027-03", verfall: "2027-03",
        kommentar: "alles raus",
      },
      t.db,
    );

    expect(erg.ok).toBe(true);
    // Kein Bestand, keine Angabe — das schlaegt „nicht anruehren".
    expect(t.db.select().from(lagerortVerfall).all()).toEqual([]);
  });
});
