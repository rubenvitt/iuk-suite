import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { isValidElement, type ReactElement, type ReactNode } from "react";
import { demoEinstellung, fahrzeugTemplates, lagerorte } from "../_db/schema";
import { migrierteTestDb, type TestDb } from "../_db/testdb";
import { DEMO_EINSTELLUNG_ID } from "../_lib/lesepfade/demo";
import { seedLokalLagerbuch } from "../_lib/seedLokal";
import { CheckArtWahl } from "../_ui/CheckArtWahl";
import { CheckFlow } from "../_ui/CheckFlow";
import { fahrzeugListe, fahrzeugUebersicht } from "../_lib/lesepfade/fahrzeuge";

/**
 * IDA-224 — der Demo-Check: Seite und Abschluss, ohne Browser.
 *
 * Die tragende Zusage ist „Absenden veraendert nichts": jede Tabelle der
 * Lagerbuch-Datenbank (auch `audit_outbox`) wird vor und nach dem Aufruf
 * vollstaendig verglichen — auf einer Datenbank mit echten Fahrzeugen, Checks,
 * Plomben und Buchungen (`seedLokalLagerbuch`).
 */

let t: TestDb;
let host = "lagerbuch.localtest.me";

vi.mock("next/headers", () => ({ headers: async () => new Headers({ host }) }));
vi.mock("next/navigation", () => ({
  notFound: () => { throw new Error("NEXT_NOT_FOUND"); },
  redirect: (ziel: string) => { throw new Error(`NEXT_REDIRECT ${ziel}`); },
}));
vi.mock("../_db/client", () => ({ getDb: () => t.db }));

import DemoSeite from "./page";
import { POST } from "./abschluss/route";

function abbild(): Record<string, unknown[]> {
  const namen = (t.sqlite.prepare(
    "select name from sqlite_master where type = 'table' order by name",
  ).all() as { name: string }[]).map((z) => z.name);
  return Object.fromEntries(namen.map((n) => [n, t.sqlite.prepare(`select * from "${n}"`).all()]));
}

function vorlageId(): string {
  return t.db.select().from(fahrzeugTemplates).all()[0]!.id;
}

function einschalten(templateId: string | null = vorlageId(), aktiv = true): void {
  t.db.insert(demoEinstellung)
    .values({ id: DEMO_EINSTELLUNG_ID, aktiv, templateId, geaendertAt: new Date() })
    .onConflictDoUpdate({ target: demoEinstellung.id, set: { aktiv, templateId } })
    .run();
}

const sp = (art?: string) => ({ searchParams: Promise.resolve(art ? { art } : {}) });

function anfrage(body: unknown, kopfHost = host): Request {
  return new Request("http://lagerbuch.localtest.me/demo/abschluss", {
    method: "POST",
    headers: { host: kopfHost, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

/** Das erste Element eines Typs im Baum — die Seite rendert nicht, sie baut nur. */
function finde<P>(knoten: ReactNode, typ: unknown): ReactElement<P> | null {
  if (!isValidElement(knoten)) {
    if (Array.isArray(knoten)) for (const k of knoten) { const f = finde<P>(k, typ); if (f) return f; }
    return null;
  }
  if (knoten.type === typ) return knoten as ReactElement<P>;
  return finde<P>((knoten.props as { children?: ReactNode }).children, typ);
}

beforeEach(async () => {
  host = "lagerbuch.localtest.me";
  t = migrierteTestDb("lagerbuch-demo-");
  await seedLokalLagerbuch(t.db);
});

afterEach(() => t.schliessen());

describe("Demo aus → 404", () => {
  it("Seite: ohne Einstellung, ausgeschaltet, ohne Vorlage, mit inaktiver oder fehlender Vorlage", async () => {
    await expect(DemoSeite(sp())).rejects.toThrow("NEXT_NOT_FOUND");
    einschalten(vorlageId(), false);
    await expect(DemoSeite(sp())).rejects.toThrow("NEXT_NOT_FOUND");
    einschalten(null);
    await expect(DemoSeite(sp())).rejects.toThrow("NEXT_NOT_FOUND");
    einschalten("gibt-es-nicht");
    await expect(DemoSeite(sp())).rejects.toThrow("NEXT_NOT_FOUND");
    const id = vorlageId();
    t.db.update(fahrzeugTemplates).set({ aktiv: false }).run();
    einschalten(id);
    await expect(DemoSeite(sp("kurz"))).rejects.toThrow("NEXT_NOT_FOUND");
  });

  it("Abschluss: HTTP 404, auch mit gültiger Nutzlast", async () => {
    const antwort = await POST(anfrage({ positionen: [], verfaelle: [] }));
    expect(antwort.status).toBe(404);
  });

  it("fremder Host: Seite und Abschluss 404, auch wenn die Demo an ist", async () => {
    einschalten();
    host = "feedback.localtest.me";
    await expect(DemoSeite(sp())).rejects.toThrow("NEXT_NOT_FOUND");
    expect((await POST(anfrage({}, "feedback.localtest.me"))).status).toBe(404);
  });
});

describe("Demo an", () => {
  beforeEach(() => einschalten());

  it("ohne ?art= fragt die Seite nach der Art — mit Links in die Demo", async () => {
    const baum = await DemoSeite(sp());
    const wahl = finde<Parameters<typeof CheckArtWahl>[0]>(baum, CheckArtWahl);
    expect(wahl?.props.pfad).toBe("/demo");
    expect(wahl?.props.kurz.plomben).toBe(1);
    expect(wahl?.props.kurz.gesamt).toBeGreaterThan(0);
  });

  it("der Kurzcheck bekommt Stichprobe, die Plombe der Medikamententasche, Geräte und Sauerstoff (IDA-248)", async () => {
    const baum = await DemoSeite(sp("kurz"));
    const flow = finde<Parameters<typeof CheckFlow>[0]>(baum, CheckFlow);
    expect(flow?.props.demo).toBe(true);
    expect(flow?.props.art).toBe("kurz");
    expect(Object.keys(flow!.props.stichprobe!).length).toBeGreaterThan(0);
    expect(flow?.props.plomben).toEqual([{
      id: "demo-plombe-tasche", bezeichnung: "Medikamententasche", fachLabel: "Medikamententasche",
      erwartet: "004711",
    }]);
    // Die versiegelte Tasche ist nie Teil der Stichprobe — sie bezeugt die Plombe.
    const tasche = flow!.props.versiegelt["demo-plombe-tasche"]!;
    expect(tasche.length).toBe(4);
    for (const id of tasche) expect(flow!.props.stichprobe).not.toHaveProperty(id);
    expect(flow?.props.geraete.map((g) => g.name))
      .toEqual(["Defibrillator (AED)", "Absaugpumpe", "Spineboard"]);
    expect(flow?.props.flaschen).toHaveLength(1);
    expect(Object.keys(flow!.props.verfall)).toContain("demo-med-adrenalin");
    expect(flow?.props.letzterCheckText).not.toBeNull();
    expect(flow?.props.andereEinheitErreichbar).toBe(false);
    // Kein echter Bestand auf dem anonymen Telefon: Handlager ist erfunden (= Soll je Artikel).
    for (const p of flow!.props.soll) expect(p.fahrzeugBestand).toBe(0);
  });

  it("Abschluss rechnet das Ergebnis wie der echte Check", async () => {
    const baum = await DemoSeite(sp("voll"));
    const soll = finde<Parameters<typeof CheckFlow>[0]>(baum, CheckFlow)!.props.soll;
    const [erste, ...rest] = soll;
    const positionen = [
      // eine fehlt ganz, Nachfuellung 1 bestaetigt → offen = soll − 1
      { sollPositionId: erste.id, ist: 0, nachfuellMenge: 1 },
      ...rest.map((p) => ({ sollPositionId: p.id, ist: p.soll, nachfuellMenge: 0 })),
    ];
    const antwort = await POST(anfrage({ art: "voll", plomben: [], positionen, verfaelle: [] }));
    expect(antwort.status).toBe(200);
    const ergebnis = await antwort.json();
    expect(ergebnis.ok).toBe(true);
    expect(ergebnis.wert.nachgefuellt).toBe(1);
    expect(ergebnis.wert.offen).toBe(erste.soll - 1);
  });

  it("rechnet Plombe, Geräte und Sauerstoff wie der echte Check (IDA-248)", async () => {
    const baum = await DemoSeite(sp("kurz"));
    const flow = finde<Parameters<typeof CheckFlow>[0]>(baum, CheckFlow)!.props;
    const tasche = flow.versiegelt["demo-plombe-tasche"]!;
    const gezaehlt = [...Object.keys(flow.stichprobe!), ...tasche];
    const positionen = flow.soll.filter((p) => gezaehlt.includes(p.id))
      .map((p) => ({ sollPositionId: p.id, ist: p.soll, nachfuellMenge: 0 }));
    const basis = {
      art: "kurz",
      positionen,
      verfaelle: [],
      geraete: [
        { geraetId: "demo-geraet-aed", vorhanden: true, zustand: "In Ordnung" },
        { geraetId: "demo-geraet-absaugung", vorhanden: true, zustand: "Defekt" },
        { geraetId: "demo-geraet-spineboard", vorhanden: false, zustand: "In Ordnung" },
      ],
      flaschen: [{ flascheId: "demo-o2-2l", druckBar: 30 }],
    };

    const passt = await (await POST(anfrage({
      ...basis, plomben: [{ plombeId: "demo-plombe-tasche", nummer: "0047-11" }],
    }))).json();
    expect(passt.wert).toMatchObject({
      plombenOffen: 0, geraeteAuffaellig: 2, flaschenAuffaellig: 1,
      // Adrenalin ist mit Verfall in einem Monat vorbelegt.
      verfallAuffaellig: 1,
    });

    const offen = await (await POST(anfrage({
      ...basis, plomben: [{ plombeId: "demo-plombe-tasche", nummer: "999" }],
    }))).json();
    expect(offen.wert.plombenOffen).toBe(1);

    // Eine offene Plombe ohne gezählte Tasche ist ein Eingabefehler, wie im Ernstfall.
    const ohneTasche = await (await POST(anfrage({
      ...basis,
      positionen: positionen.filter((p) => !tasche.includes(p.sollPositionId)),
      plomben: [{ plombeId: "demo-plombe-tasche", nummer: null }],
    }))).json();
    expect(ohneTasche).toMatchObject({ ok: false, grund: "eingabe" });
  });

  it("weist eine Position ab, die nicht zur Vorlage gehört — als Eingabefehler, nie als Sitzungsfehler", async () => {
    const antwort = await POST(anfrage({
      positionen: [{ sollPositionId: "fremd", ist: 1, nachfuellMenge: 0 }], verfaelle: [],
    }));
    expect(await antwort.json()).toMatchObject({ ok: false, grund: "eingabe" });
  });
});

describe("Absenden verändert nichts", () => {
  it("jede Tabelle (Inhalt, nicht nur Zeilenzahl) ist nach Seite und Abschluss unverändert", async () => {
    einschalten();
    const vorher = abbild();
    expect(Object.keys(vorher)).toEqual(expect.arrayContaining([
      "buchungen", "checks", "plomben", "lagerorte", "lagerort_verfall", "o2_messungen", "audit_outbox",
    ]));
    expect(vorher.checks.length).toBeGreaterThan(0);

    const baum = await DemoSeite(sp("kurz"));
    const flow = finde<Parameters<typeof CheckFlow>[0]>(baum, CheckFlow)!;
    const gezogen = new Set(Object.keys(flow.props.stichprobe!));
    const positionen = flow.props.soll
      .filter((p) => gezogen.has(p.id))
      .map((p) => ({ sollPositionId: p.id, ist: 0, nachfuellMenge: p.soll }));
    const antwort = await POST(anfrage({
      art: "kurz", plomben: [], positionen,
      verfaelle: [{ artikelId: flow.props.soll[0].artikelId, verfall: "2026-11" }],
    }));
    expect((await antwort.json()).ok).toBe(true);

    expect(abbild()).toEqual(vorher);
  });
});

describe("Das Demo-Fahrzeug taucht nirgends auf", () => {
  it("legt keinen Lagerort an — keine Liste kann es also zeigen", async () => {
    const vorher = t.db.select().from(lagerorte).all();
    const listeVorher = fahrzeugListe(t.db);
    const uebersichtVorher = fahrzeugUebersicht(t.db).map((z) => z.id);
    einschalten();
    await DemoSeite(sp("kurz"));
    await POST(anfrage({ positionen: [], verfaelle: [] }));
    expect(t.db.select().from(lagerorte).all()).toEqual(vorher);
    expect(fahrzeugListe(t.db)).toEqual(listeVorher);
    expect(fahrzeugUebersicht(t.db).map((z) => z.id)).toEqual(uebersichtVorher);
    expect(fahrzeugListe(t.db).some((f) => f.id === "demo-check" || f.kennung === "Demo")).toBe(false);
  });
});
