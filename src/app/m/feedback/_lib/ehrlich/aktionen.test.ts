import { describe, it, expect, beforeEach, vi } from "vitest";
import Database from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { registerAuditFunctions } from "@/core/audit/context";
import * as schema from "../../_db/schema";

/*
 * Die Zusage auf dem Einwurf („kein Name, kein Konto, keine IP, keine Uhrzeit") als Test gegen die echte
 * Aktion: mit IP im Kopf und einer angemeldeten Sitzung im Hintergrund darf nichts davon in der Zeile oder
 * im Audit landen (Akzeptanzkriterium IDA-314).
 */
const h = vi.hoisted(() => ({
  db: null as unknown as ReturnType<typeof drizzle<typeof schema>>,
  sqlite: null as unknown as Database.Database,
  ip: "203.0.113.77",
  auth: vi.fn(),
}));

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("next/headers", () => ({ headers: async () => new Headers({ "cf-connecting-ip": h.ip, "x-forwarded-for": h.ip }) }));
vi.mock("@/core/auth", () => ({ auth: h.auth }));
vi.mock("../../_db/client", () => ({ getDb: () => h.db }));

import {
  abholenAktion, antwortAktion, einwerfenAktion, notizAktion, rueckfrageAktion, statusAktion, zurueckschreibenAktion,
} from "./aktionen";
import { kastenSecret } from "./daten";

function fd(werte: Record<string, string>): FormData {
  const f = new FormData();
  for (const [k, v] of Object.entries(werte)) f.set(k, v);
  return f;
}

let ipZaehler = 0;
beforeEach(() => {
  h.sqlite = new Database(":memory:");
  registerAuditFunctions(h.sqlite);
  h.db = drizzle(h.sqlite, { schema });
  migrate(h.db, { migrationsFolder: "src/app/m/feedback/_db/migrations" });
  // Jeder Test aus einem eigenen Netz: die Limiter sind prozessweit.
  h.ip = `203.0.113.${(ipZaehler += 1)}`;
  h.auth.mockResolvedValue({ user: { id: "sub-erika", name: "Erika Mustermann", email: "erika@example.org", groups: ["kummerkasten-leser"] } });
});

describe("einwerfenAktion", () => {
  it("speichert anonym weder IP noch Konto noch Uhrzeit", async () => {
    const secret = kastenSecret(h.db);
    const r = await einwerfenAktion(secret, null, fd({ text: "Die Neuen werden kaum einbezogen.", antwortweg: "keine", thema: "Miteinander" }));
    expect(r).toEqual({ ok: true, antwortweg: "keine", code: null });

    const zeile = h.sqlite.prepare("SELECT * FROM ehrlich_mitteilungen").get() as Record<string, unknown>;
    expect(Object.keys(zeile).sort()).toEqual(
      ["antwortweg", "code_hash", "erledigt_tag", "gemeldet", "id", "kontakt", "name", "rueckfrage_erlaubt", "status", "tag", "text", "thema"].sort(),
    );
    expect(zeile.tag).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(zeile.name).toBeNull();
    expect(zeile.kontakt).toBeNull();

    const alles = JSON.stringify([
      h.sqlite.prepare("SELECT * FROM ehrlich_mitteilungen").all(),
      h.sqlite.prepare("SELECT * FROM audit_outbox WHERE object_type = 'ehrlich_mitteilungen'").all(),
    ]);
    expect(alles).not.toContain(h.ip);
    expect(alles).not.toMatch(/sub-erika|Erika|erika@/);

    const audit = h.sqlite.prepare("SELECT actor, object_ref, correlation_id FROM audit_outbox WHERE object_type = 'ehrlich_mitteilungen'").all() as { actor: string; object_ref: null; correlation_id: null }[];
    expect(audit).toHaveLength(1);
    expect(JSON.parse(audit[0].actor)).toEqual({ kind: "anonymous" });
    expect(audit[0].object_ref).toBeNull();
    expect(audit[0].correlation_id).toBeNull();
  });

  it("gibt den Abholcode genau einmal heraus und speichert nur seinen Hash", async () => {
    const r = await einwerfenAktion(kastenSecret(h.db), null, fd({ text: "Bitte früher planen.", antwortweg: "code" }));
    if (!r.ok || !r.code) throw new Error("kein Code");
    expect(r.code).toMatch(/^[A-Z]+-\d{4}-[A-Z]+$/);
    const roh = JSON.stringify(h.sqlite.prepare("SELECT * FROM ehrlich_mitteilungen").all());
    expect(roh).not.toContain(r.code);
    const abgeholt = await abholenAktion(null, fd({ code: r.code.toLowerCase().replace(/-/g, " ") }));
    expect(abgeholt.ok && abgeholt.abholung.text).toBe("Bitte früher planen.");
  });

  it("nimmt Name und Kontakt nur beim Antwortweg „name“", async () => {
    const secret = kastenSecret(h.db);
    await einwerfenAktion(secret, null, fd({ text: "a", antwortweg: "keine", name: "Max", kontakt: "0151" }));
    await einwerfenAktion(secret, null, fd({ text: "b", antwortweg: "name", name: "Max Mustermann", kontakt: "beim Dienstabend" }));
    const zeilen = h.sqlite.prepare("SELECT text, name, kontakt FROM ehrlich_mitteilungen ORDER BY id").all();
    expect(zeilen).toEqual([
      { text: "a", name: null, kontakt: null },
      { text: "b", name: "Max Mustermann", kontakt: "beim Dienstabend" },
    ]);
  });

  it("weist leeren Text, fehlenden Namen und ein falsches Secret ab", async () => {
    const secret = kastenSecret(h.db);
    expect(await einwerfenAktion(secret, null, fd({ text: "  " }))).toEqual({ ok: false, fehler: "leer" });
    expect(await einwerfenAktion(secret, null, fd({ text: "x", antwortweg: "name" }))).toEqual({ ok: false, fehler: "name" });
    expect(await einwerfenAktion("falsch", null, fd({ text: "x" }))).toEqual({ ok: false, fehler: "ungueltig" });
    expect(h.sqlite.prepare("SELECT count(*) n FROM ehrlich_mitteilungen").get()).toEqual({ n: 0 });
  });

  it("verwirft ein Thema außerhalb der festen Liste", async () => {
    await einwerfenAktion(kastenSecret(h.db), null, fd({ text: "x", thema: "<script>" }));
    expect(h.sqlite.prepare("SELECT thema FROM ehrlich_mitteilungen").get()).toEqual({ thema: null });
  });
});

describe("abholen und zurückschreiben", () => {
  it("bremst Raten nach zehn Fehlversuchen", async () => {
    for (let i = 0; i < 10; i += 1) expect((await abholenAktion(null, fd({ code: `RABE-${1000 + i}-WOLF` }))).ok).toBe(false);
    expect(await abholenAktion(null, fd({ code: "RABE-2000-WOLF" }))).toMatchObject({ ok: false, fehler: "ratelimit" });
  });

  it("lässt nur nach Freischaltung und auf eine Antwort hin zurückschreiben; die Antwort zeigt keinen Namen", async () => {
    const r = await einwerfenAktion(kastenSecret(h.db), null, fd({ text: "Frage", antwortweg: "code" }));
    if (!r.ok || !r.code) throw new Error("kein Code");
    const id = (h.sqlite.prepare("SELECT id FROM ehrlich_mitteilungen").get() as { id: number }).id;

    expect(await zurueckschreibenAktion(null, fd({ code: r.code, text: "zu früh" }))).toMatchObject({ ok: true, gesendet: false });
    await antwortAktion(id, "Danke, wir kümmern uns.");
    expect(await zurueckschreibenAktion(null, fd({ code: r.code, text: "nicht freigeschaltet" }))).toMatchObject({ gesendet: false });
    await rueckfrageAktion(id, true);
    await statusAktion(id, "erledigt");
    const z = await zurueckschreibenAktion(null, fd({ code: r.code, text: "Noch eine Frage" }));
    expect(z).toMatchObject({ ok: true, gesendet: true });
    if (!z.ok) throw new Error();
    expect(z.abholung.gespraech).toEqual([
      { von: "vp", text: "Danke, wir kümmern uns.", tag: expect.any(String) },
      { von: "person", text: "Noch eine Frage", tag: expect.any(String) },
    ]);
    expect(JSON.stringify(z.abholung)).not.toContain("Erika");
    // Eine Rückfrage holt die erledigte Mitteilung zurück in die Bearbeitung.
    expect(h.sqlite.prepare("SELECT status, erledigt_tag FROM ehrlich_mitteilungen").get()).toEqual({ status: "bearbeitung", erledigt_tag: null });
  });
});

describe("Riegel der Verwaltung", () => {
  it("weist ohne Lesegruppe ab — auch feedback-admin", async () => {
    await einwerfenAktion(kastenSecret(h.db), null, fd({ text: "x" }));
    h.auth.mockResolvedValue({ user: { id: "sub-admin", name: "Admin", groups: ["feedback-admin", "admin"] } });
    await expect(statusAktion(1, "erledigt")).rejects.toThrow("Forbidden");
    await expect(notizAktion(1, "x")).rejects.toThrow("Forbidden");
    h.auth.mockResolvedValue(null);
    await expect(statusAktion(1, "erledigt")).rejects.toThrow("Forbidden");
  });

  it("schreibt Notizen mit dem Namen der Vertrauensperson und rückt „Neu“ auf „In Bearbeitung“", async () => {
    await einwerfenAktion(kastenSecret(h.db), null, fd({ text: "x" }));
    expect(await notizAktion(1, "Beim Leitungstreffen ansprechen")).toBe(true);
    expect(h.sqlite.prepare("SELECT autor, text FROM ehrlich_notizen").get()).toEqual({ autor: "Erika Mustermann", text: "Beim Leitungstreffen ansprechen" });
    expect(h.sqlite.prepare("SELECT status FROM ehrlich_mitteilungen").get()).toEqual({ status: "bearbeitung" });
  });
});
