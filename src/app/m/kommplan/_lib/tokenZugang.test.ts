import { describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { planFreigabe } from "../_db/schema";
import { stelleFreigabeAus, widerrufeFreigabe } from "./freigaben";
import { archiviere } from "./planverwaltung";
import { seedLokalKommplan } from "./seedLokal";
import { testDb } from "./testDb";
import { neueSchranken, pruefeTokenAbruf, TOKEN_SCHRANKE } from "./tokenZugang";

const JETZT = Date.UTC(2026, 9, 1, 18, 0);
const OPENR = "beispiel-openr-2022-07-01";
async function aufbau() {
  const db = testDb();
  await seedLokalKommplan(db);
  const r = stelleFreigabeAus(db, { planId: OPENR, dauer: "7d", notiz: "" }, { nutzer: "u1", name: "Jana" }, JETZT);
  if (!r.ok) throw new Error(r.fehler);
  let uhr = JETZT;
  const s = neueSchranken(() => uhr);
  return { db, s, f: r.freigaben[0], weiter: (ms: number) => { uhr += ms; return uhr; }, jetzt: () => uhr };
}
const zeile = (db: ReturnType<typeof testDb>, id: string) => db.select().from(planFreigabe).where(eq(planFreigabe.id, id)).get()!;
describe("Tokenabruf (Spec §8.2; Entscheidungen 4–6)", () => {
  it("gültig → Plan; zählt den ersten Abruf, Wiederholung derselben Adresse binnen 60 s nicht", async () => {
    const { db, s, f, weiter, jetzt } = await aufbau();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.1", jetzt(), s)?.plan.id).toBe(OPENR);
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.1", weiter(5_000), s)).not.toBeNull();
    expect(zeile(db, f.id)).toMatchObject({ abrufe: 1, zuletztAbgerufen: new Date(JETZT) });
    pruefeTokenAbruf(db, f.token, "203.0.113.2", jetzt(), s); // andere Adresse zählt
    pruefeTokenAbruf(db, f.token, "203.0.113.1", weiter(TOKEN_SCHRANKE.abrufFensterMs), s); // Fenster vorbei
    expect(zeile(db, f.id).abrufe).toBe(3);
  });
  it("keine Fehlversuchs-Sperre (Abnahme): nach hundert Fehlversuchen derselben Adresse geht ein gültiger Link noch", async () => {
    const { db, s, f, jetzt } = await aufbau();
    for (let i = 0; i < 100; i++) expect(pruefeTokenAbruf(db, i % 2 ? "B".repeat(43) : "falsch", "203.0.113.9", jetzt(), s)).toBeNull();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.9", jetzt(), s)?.plan.id).toBe(OPENR);
    expect(pruefeTokenAbruf(db, f.token, "unknown", jetzt(), s)).not.toBeNull(); // auch der Sammeleimer ohne Kopf
  });
  it("40 gültige Abrufe in der Minute sperren den eigenen Link nicht und zählen einmal", async () => {
    const { db, s, f, jetzt, weiter } = await aufbau();
    for (let i = 0; i < 40; i++) expect(pruefeTokenAbruf(db, f.token, "203.0.113.20", weiter(100), s), `Abruf ${i + 1}`).not.toBeNull();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.20", jetzt(), s)).not.toBeNull();
    expect(zeile(db, f.id).abrufe).toBe(1); // entprellt: dieselbe Adresse binnen 60 s einmal
  });
  it("der Entpreller gilt je Adresse UND Link: zwei Links von derselben Adresse zählen beide", async () => {
    const { db, s, f, jetzt } = await aufbau();
    const r = stelleFreigabeAus(db, { planId: OPENR, dauer: "24h", notiz: "" }, { nutzer: "u1", name: "Jana" }, jetzt());
    if (!r.ok) throw new Error(r.fehler);
    const g = r.freigaben.find((x) => x.id === r.neu)!;
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.30", jetzt(), s)).not.toBeNull();
    expect(pruefeTokenAbruf(db, g.token, "203.0.113.30", jetzt(), s)).not.toBeNull();
    expect([zeile(db, f.id).abrufe, zeile(db, g.id).abrufe]).toEqual([1, 1]);
  });
  it("widerrufen oder archiviert: die NÄCHSTE Anfrage ist null, obwohl der Entpreller den Link eben noch kannte", async () => {
    const { db, s, f, jetzt } = await aufbau();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.3", jetzt(), s)).not.toBeNull();
    widerrufeFreigabe(db, { planId: OPENR, freigabeId: f.id }, jetzt());
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.3", jetzt(), s)).toBeNull();
    const r = stelleFreigabeAus(db, { planId: OPENR, dauer: "unbegrenzt", notiz: "" }, { nutzer: "u1", name: "Jana" }, jetzt());
    if (!r.ok) throw new Error(r.fehler);
    expect(pruefeTokenAbruf(db, r.freigaben[0].token, "203.0.113.4", jetzt(), s)).not.toBeNull();
    archiviere(db, OPENR, jetzt());
    expect(pruefeTokenAbruf(db, r.freigaben[0].token, "203.0.113.4", jetzt(), s)).toBeNull();
  });
});
