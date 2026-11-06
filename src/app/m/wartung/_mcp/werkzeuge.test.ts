import { beforeEach, describe, expect, it, vi } from "vitest";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import type { CallToolResult } from "@modelcontextprotocol/sdk/types.js";
import type { DirectoryResult } from "@/core/directory";

const t = vi.hoisted(() => ({ db: null as unknown as import("../_lib/testDb").TestDb, verweigert: 0 }));
vi.mock("../_db/client", () => ({ getDb: () => t.db }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/core/auth", () => ({ auth: vi.fn() }));
vi.mock("next/headers", () => ({ headers: vi.fn() }));
vi.mock("@/app/m/fahrzeuge/_lib/bereitstellung", () => ({ bereitgestellteFahrzeuge: () => ({ fahrzeuge: [] }) }));
vi.mock("@/core/audit/server", async (orig) => ({
  ...(await orig<typeof import("@/core/audit/server")>()),
  auditDenied: () => { t.verweigert += 1; },
}));

import { bauServer } from "@/app/m/mcp/_lib/server";
import type { McpPerson } from "@/app/m/mcp/_lib/token";
import { eq } from "drizzle-orm";
import { eintrag, geraet, mangel, verwalter } from "../_db/schema";
import { geraetAnlegen, inhaltSpeichern } from "../_lib/schreiben";
import { merkePerson, verwalterHinzufuegen } from "../_lib/personen";
import { START } from "../_lib/startbestand";
import { testDb } from "../_lib/testDb";
import { wartungMcp } from "./werkzeuge";

const OHNE_VERZEICHNIS: DirectoryResult = { status: "unconfigured", people: [] };

const person = (sub: string, groups: string[], name = "Helfer A"): McpPerson => ({ sub, name, email: null, groups });
const NUTZER = person("sub-helfer", ["wartung-nutzer"]);
const VERWALTER = person("sub-technik", ["wartung-nutzer"], "Verwalter Technik");
const ADMIN = person("sub-admin", ["wartung-admin"], "Admin");

async function verbinde(p: McpPerson) {
  const server = bauServer(p, [wartungMcp]);
  const [a, b] = InMemoryTransport.createLinkedPair();
  await server.connect(a);
  const client = new Client({ name: "test", version: "0" });
  await client.connect(b);
  const namen = (await client.listTools()).tools.map((w) => w.name);
  const rufe = async (name: string, args: Record<string, unknown> = {}) =>
    (await client.callTool({ name, arguments: args })) as CallToolResult;
  return { namen, rufe };
}

const text = (r: CallToolResult) => (r.content[0] as { text: string }).text;
const json = <T = unknown>(r: CallToolResult) => JSON.parse(text(r)) as T;

let stromerzeuger: string;
let akkuIuk: string;

beforeEach(() => {
  t.db = testDb();
  t.verweigert = 0;
  merkePerson(t.db, "sub-technik", "Verwalter Technik");
  verwalterHinzufuegen(t.db, START.gruppe.technik, "sub-technik", 1, OHNE_VERZEICHNIS);
  const basis = { hersteller: "", typ: "", seriennr: "", hinweise: "", ortArt: "lager" as const, ort: "Halle", fahrzeugId: null };
  stromerzeuger = geraetAnlegen(t.db, { ...basis, gruppeId: START.gruppe.technik, artId: START.art.stromerzeuger, name: "Stromerzeuger 8 kVA", stunden: 100 }, 1);
  akkuIuk = geraetAnlegen(t.db, { ...basis, gruppeId: START.gruppe.iuk, artId: START.art.stromerzeuger, name: "Stromerzeuger I&K", stunden: 5 }, 1);
});

describe("Gerätewartung im MCP-Server: Werkzeuge je Stufe", () => {
  it("ohne Modulzugang gibt es kein einziges Werkzeug", async () => {
    expect((await verbinde(person("sub-x", ["helfer-nutzer"]))).namen).toEqual([]);
  });

  it("Nutzer sehen nur Lesen, Prüfen, Stunden und Mangel melden", async () => {
    expect((await verbinde(NUTZER)).namen.sort()).toEqual([
      "wartung_faellig", "wartung_geraet", "wartung_geraete", "wartung_mangel_melden", "wartung_pruefung_abschliessen",
      "wartung_stunden_eintragen",
    ]);
  });

  it("Verwalter sehen dazu die Pflege, aber keine Gruppenverwaltung; Admins alles", async () => {
    const v = (await verbinde(VERWALTER)).namen;
    expect(v).toContain("wartung_geraet_anlegen");
    expect(v.filter((n) => /gruppe_|verwalter_|personen_/.test(n))).toEqual([]);
    const a = (await verbinde(ADMIN)).namen;
    expect(a).toEqual(expect.arrayContaining(["wartung_gruppe_loeschen", "wartung_verwalter_zuordnen", ...v]));
    expect(a.every((n) => n.startsWith("wartung_"))).toBe(true);
  });
});

describe("dieselben Grenzen wie in der App", () => {
  it("Nutzer sehen alle Geräte, Verwalter ihre Gruppe", async () => {
    expect(json<{ id: string }[]>(await (await verbinde(NUTZER)).rufe("wartung_geraete")).map((g) => g.id).sort())
      .toEqual([stromerzeuger, akkuIuk].sort());
    expect(json<{ id: string }[]>(await (await verbinde(VERWALTER)).rufe("wartung_geraete")).map((g) => g.id)).toEqual([stromerzeuger]);
  });

  it("ein Verwalter legt nur in seiner Gruppe an und ändert nur dort", async () => {
    const { rufe } = await verbinde(VERWALTER);
    const neu = { art_id: START.art.stromerzeuger, name: "Heizung", ort_art: "lager", ort: "Halle" };
    const fremd = await rufe("wartung_geraet_anlegen", { ...neu, gruppe_id: START.gruppe.iuk });
    expect(fremd.isError).toBe(true);
    expect(text(fremd)).toContain("Diese Gruppe verwaltest du nicht.");
    expect((await rufe("wartung_geraet_anlegen", { ...neu, gruppe_id: START.gruppe.technik })).isError).toBeFalsy();

    expect(text(await rufe("wartung_geraet_aendern", { geraet_id: akkuIuk, name: "Gekapert" })))
      .toContain("Gruppe, die du nicht verwaltest");
    expect(t.db.select().from(geraet).where(eq(geraet.id, akkuIuk)).get()?.name).toBe("Stromerzeuger I&K");
    // Nur die angegebenen Felder ändern sich.
    await rufe("wartung_geraet_aendern", { geraet_id: stromerzeuger, ort: "GW-Technik" });
    const g = t.db.select().from(geraet).where(eq(geraet.id, stromerzeuger)).get()!;
    expect([g.name, g.ort, g.stunden]).toEqual(["Stromerzeuger 8 kVA", "GW-Technik", 100]);
  });

  it("ein entzogenes Recht wirkt auch auf eine schon gelistete Werkzeugliste", async () => {
    const { rufe } = await verbinde(VERWALTER);
    t.db.delete(verwalter).run();
    const r = await rufe("wartung_geraet_ausmustern", { geraet_id: stromerzeuger });
    expect(r.isError).toBe(true);
    expect(text(r)).toBe("Dafür fehlen dir die Rechte.");
    expect(t.verweigert).toBe(1);
    expect(t.db.select().from(geraet).where(eq(geraet.id, stromerzeuger)).get()?.aktiv).toBe(true);
  });

  it("Nutzer prüfen, melden und lesen Stunden ab — im eigenen Namen", async () => {
    const { rufe } = await verbinde(NUTZER);
    const am = json<{ checkliste: { id: string }[] }>(await rufe("wartung_geraet", { geraet_id: stromerzeuger }));
    expect(am.checkliste.length).toBeGreaterThan(0);
    const ohneStunden = await rufe("wartung_pruefung_abschliessen", {
      geraet_id: stromerzeuger, ergebnis: "ok", antworten: am.checkliste.map((p) => ({ punkt_id: p.id, ok: true })),
    });
    expect(text(ohneStunden)).toContain("Betriebsstunden fehlen.");
    const ok = await rufe("wartung_pruefung_abschliessen", {
      geraet_id: stromerzeuger, ergebnis: "ok", stunden: 110, antworten: am.checkliste.map((p) => ({ punkt_id: p.id, ok: true })),
    });
    expect(ok.isError).toBeFalsy();
    expect(text(await rufe("wartung_stunden_eintragen", { geraet_id: stromerzeuger, stunden: 90 }))).not.toContain('"ok": true');
    await rufe("wartung_mangel_melden", { geraet_id: stromerzeuger, text: "Seilzug hakt", einsatzbereit: true });
    expect(t.db.select().from(mangel).all().map((m) => [m.text, m.gemeldetVon])).toEqual([["Seilzug hakt", "Helfer A"]]);
  });

  it("eine Materialkiste: ein veralteter Stand der Inhaltsliste wird abgelehnt, beim Pflegen wie beim Durchzählen", async () => {
    const kiste = geraetAnlegen(t.db, {
      hersteller: "", typ: "", seriennr: "", hinweise: "", ortArt: "lager", ort: "Halle", fahrzeugId: null, stunden: null,
      gruppeId: START.gruppe.technik, artId: START.art.kiste, name: "Kiste Beleuchtung",
    }, 1);
    inhaltSpeichern(t.db, kiste, [{ id: null, text: "Kabeltrommel", soll: 2, bemerkung: "" }]);
    const { rufe } = await verbinde(VERWALTER);
    const gelesen = json<{ inhaltStand: string; checkliste: { id: string }[] }>(await rufe("wartung_geraet", { geraet_id: kiste }));
    // Inzwischen ändert jemand die Liste in der App.
    inhaltSpeichern(t.db, kiste, [{ id: gelesen.checkliste[0].id, text: "Kabeltrommel", soll: 3, bemerkung: "" }]);
    const pflege = await rufe("wartung_inhalt_speichern", {
      geraet_id: kiste, stand: gelesen.inhaltStand, positionen: [{ text: "Strahler", soll: 1 }],
    });
    expect(pflege.isError).toBe(true);
    const zaehlung = await rufe("wartung_pruefung_abschliessen", {
      geraet_id: kiste, ergebnis: "ok", inhalt_stand: gelesen.inhaltStand, antworten: [{ punkt_id: gelesen.checkliste[0].id, ok: true }],
    });
    expect(text(zaehlung)).toContain("Die Inhaltsliste hat sich geändert.");
    const neu = json<{ inhaltStand: string; checkliste: { id: string }[] }>(await rufe("wartung_geraet", { geraet_id: kiste }));
    expect((await rufe("wartung_pruefung_abschliessen", {
      geraet_id: kiste, ergebnis: "ok", inhalt_stand: neu.inhaltStand, antworten: [{ punkt_id: neu.checkliste[0].id, ok: true }],
    })).isError).toBeFalsy();
  });

  it("Prüfplan (IDA-368): eine abgewählte Prüfart lässt sich nicht mehr eintragen, eine zugeschaltete schon", async () => {
    const { rufe } = await verbinde(VERWALTER);
    const plan = [
      { pruefart_id: START.pruefart.dguv, an: false },
      { pruefart_id: START.pruefart.heizsaison, an: true, eigenes: { monate: 6, stunden: null } },
    ];
    expect((await rufe("wartung_pruefplan_speichern", { geraet_id: akkuIuk, plan })).isError).toBe(true);
    expect((await rufe("wartung_pruefplan_speichern", { geraet_id: stromerzeuger, plan })).isError).toBeFalsy();
    const g = json<{ geraet: { plan: { pruefart: { id: string }; an: boolean; eigenes: unknown }[] } }>(
      await rufe("wartung_geraet", { geraet_id: stromerzeuger }));
    expect(g.geraet.plan.find((p) => p.pruefart.id === START.pruefart.dguv)?.an).toBe(false);
    expect(g.geraet.plan.find((p) => p.pruefart.id === START.pruefart.heizsaison)?.eigenes).toEqual({ monate: 6, stunden: null });
    const eintragen = (pruefart_id: string) => rufe("wartung_erledigt_eintragen", { geraet_id: stromerzeuger, pruefart_id, am: "2026-11-01" });
    expect(text(await eintragen(START.pruefart.dguv))).toContain("gilt für das Gerät nicht mehr");
    expect((await eintragen(START.pruefart.heizsaison)).isError).toBeFalsy();
    expect(t.db.select({ p: eintrag.pruefartId }).from(eintrag).all()).toEqual([{ p: START.pruefart.heizsaison }]);
    expect(json<{ id: string }[]>(await rufe("wartung_pruefarten")).map((p) => p.id)).toContain(START.pruefart.dguv);
  });
});
