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
  it("nach 29 Fehlversuchen geht ein gültiger Token noch, nach dem 30. ist die Adresse gesperrt — ohne Datenbankabfrage, auch für gültige", async () => {
    const { db, s, f, jetzt, weiter } = await aufbau();
    expect(TOKEN_SCHRANKE.fehlversucheJeMinute).toBe(30);
    for (let i = 0; i < TOKEN_SCHRANKE.fehlversucheJeMinute - 1; i++) expect(pruefeTokenAbruf(db, "B".repeat(43), "203.0.113.9", jetzt(), s)).toBeNull();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.9", jetzt(), s)).not.toBeNull();
    expect(pruefeTokenAbruf(db, "falsch", "203.0.113.9", jetzt(), s)).toBeNull(); // falsche Form zählt mit
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.9", jetzt(), s)).toBeNull();
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.10", jetzt(), s)).not.toBeNull(); // andere Adresse
    expect(pruefeTokenAbruf(db, f.token, "203.0.113.9", weiter(60_001), s)).not.toBeNull(); // Fenster abgelaufen
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
