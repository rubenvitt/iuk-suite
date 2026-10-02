import { describe, expect, it } from "vitest";
import { eq, sql } from "drizzle-orm";
import type { DirectoryResult } from "@/core/directory";
import { kommplanPerson, plan } from "../_db/schema";
import { entferneMitglied, ladeEin, merkePerson, mitgliederVon, teileInOrganisation, vorschlaege } from "./mitglieder";
import { archiviere } from "./planverwaltung";
import { NICHT_ERLAUBT, rechteAn, type Person } from "./rechte";
import { seedLokalKommplan } from "./seedLokal";
import { legePlanAn } from "./speichern";
import { testDb } from "./testDb";

const T0 = Date.UTC(2026, 9, 2, 8, 0);
const ANNA = { nutzer: "u-anna", name: "Anna" };
const ALS_ANNA: Person = { nutzer: "u-anna", admin: false };
const ALS_BODO: Person = { nutzer: "u-bodo", admin: false };
const ADMIN: Person = { nutzer: "u-admin", admin: true };
const LEER: DirectoryResult = { status: "unconfigured", people: [] };
const VERZEICHNIS: DirectoryResult = { status: "ok", people: [
  { userId: "u-carla", name: "Carla Verzeichnis", email: "carla@example.test" },
  { userId: "u-ohne-name", name: null, email: "x@example.test" },
] };
const OPENR = "beispiel-openr-2022-07-01";

function aufbau() {
  const db = testDb();
  const r = legePlanAn(db, { titel: "Annas", typ: "kommunikationsplan", anlass: "", datum: null }, ANNA, T0, ALS_ANNA);
  if (!r.ok) throw new Error(r.fehler);
  merkePerson(db, "u-bodo", "Bodo Bekannt");
  return { db, id: r.id };
}
const audit = (db: ReturnType<typeof testDb>, typ: string) =>
  (db.all(sql`SELECT action FROM audit_outbox WHERE object_type = ${typ} ORDER BY rowid`) as { action: string }[]).map((z) => z.action);

describe("in der Organisation teilen", () => {
  it("nur der Eigentümer, nur privat → organisation, mit Audit-Zeile; danach sehen alle", () => {
    const { db, id } = aufbau();
    expect(teileInOrganisation(db, id, ALS_BODO)).toMatchObject({ ok: false });
    expect(teileInOrganisation(db, id, ADMIN)).toMatchObject({ ok: false }); // ein Admin sieht den privaten Plan gar nicht
    const vorher = audit(db, "plan").length;
    expect(teileInOrganisation(db, id, ALS_ANNA)).toEqual({ ok: true, mitglieder: [] });
    expect(audit(db, "plan").length).toBe(vorher + 1);
    expect(rechteAn(db, id, ALS_BODO)).toEqual({ sehen: true, bearbeiten: false, verwalten: false });
    expect(rechteAn(db, id, ADMIN)).toEqual({ sehen: true, bearbeiten: true, verwalten: true });
    // Ein zweites Mal ändert nichts (Einbahnstraße, kein Zurück).
    expect(teileInOrganisation(db, id, ALS_ANNA)).toMatchObject({ ok: true });
    expect(db.select({ s: plan.sichtbarkeit }).from(plan).where(eq(plan.id, id)).get()?.s).toBe("organisation");
  });
  it("ein archivierter Plan wird nicht mehr geteilt; Unsinn wird abgewiesen", () => {
    const { db, id } = aufbau();
    expect(archiviere(db, id, T0, ALS_ANNA)).toEqual({ ok: true });
    expect(teileInOrganisation(db, id, ALS_ANNA)).toMatchObject({ ok: false });
    expect(teileInOrganisation(db, { id }, ALS_ANNA)).toEqual({ ok: false, fehler: "Ungültige Anfrage." });
  });
});

describe("einladen", () => {
  it("nur bei geteilten Plänen, nur wer verwaltet, nur bekannte Kennungen — mit Name aus Modul oder Verzeichnis", () => {
    const { db, id } = aufbau();
    expect(ladeEin(db, { planId: id, nutzer: "u-bodo" }, ANNA, ALS_ANNA, T0, LEER)).toMatchObject({ ok: false, fehler: expect.stringContaining("privat") });
    teileInOrganisation(db, id, ALS_ANNA);
    expect(ladeEin(db, { planId: id, nutzer: "u-bodo" }, ANNA, ALS_BODO, T0, LEER)).toEqual({ ok: false, fehler: NICHT_ERLAUBT });
    expect(ladeEin(db, { planId: id, nutzer: "u-anna" }, ANNA, ALS_ANNA, T0, LEER)).toMatchObject({ ok: false });
    expect(ladeEin(db, { planId: id, nutzer: "u-erfunden" }, ANNA, ALS_ANNA, T0, LEER)).toMatchObject({ ok: false, fehler: expect.stringContaining("unbekannt") });
    expect(ladeEin(db, { planId: id, nutzer: "u-bodo" }, ANNA, ALS_ANNA, T0, LEER)).toMatchObject({ ok: true, mitglieder: [{ nutzer: "u-bodo", name: "Bodo Bekannt" }] });
    expect(ladeEin(db, { planId: id, nutzer: "u-carla" }, ANNA, ADMIN, T0, VERZEICHNIS)).toMatchObject({ ok: true, mitglieder: [{ name: "Bodo Bekannt" }, { name: "Carla Verzeichnis" }] });
    expect(rechteAn(db, id, ALS_BODO)).toEqual({ sehen: true, bearbeiten: true, verwalten: false });
    // Doppelt einladen ist kein Fehler und keine zweite Zeile.
    expect(ladeEin(db, { planId: id, nutzer: "u-bodo" }, ANNA, ALS_ANNA, T0, LEER)).toMatchObject({ ok: true });
    expect(mitgliederVon(db, id)).toHaveLength(2);
    expect(audit(db, "plan_mitglied")).toEqual(["create", "create"]);
  });
  it("entfernen nimmt das Bearbeiten, nicht das Sehen; nur wer verwaltet", () => {
    const { db, id } = aufbau();
    teileInOrganisation(db, id, ALS_ANNA);
    ladeEin(db, { planId: id, nutzer: "u-bodo" }, ANNA, ALS_ANNA, T0, LEER);
    expect(entferneMitglied(db, { planId: id, nutzer: "u-bodo" }, ALS_BODO)).toEqual({ ok: false, fehler: NICHT_ERLAUBT });
    expect(entferneMitglied(db, { planId: id, nutzer: "u-bodo" }, ALS_ANNA)).toEqual({ ok: true, mitglieder: [] });
    expect(rechteAn(db, id, ALS_BODO)).toEqual({ sehen: true, bearbeiten: false, verwalten: false });
    expect(audit(db, "plan_mitglied")).toEqual(["create", "delete"]);
  });
});

describe("Vorschläge und bekannte Personen", () => {
  it("ab zwei Zeichen, ohne Eigentümer und Eingeladene, Verzeichnis und Modul vereint, Namenslose weg", async () => {
    const db = testDb();
    await seedLokalKommplan(db);
    merkePerson(db, "u-bodo", "Bodo Bekannt");
    merkePerson(db, "u-carla", "Carla aus dem Modul");
    expect(vorschlaege(db, OPENR, "b", LEER)).toEqual([]);
    expect(vorschlaege(db, OPENR, "bo", LEER)).toEqual([{ nutzer: "u-bodo", name: "Bodo Bekannt", email: null }]);
    // Das Verzeichnis gewinnt bei gleicher Kennung (es kennt die E-Mail); Treffer nur, wenn es selbst gesucht hat.
    expect(vorschlaege(db, OPENR, "ca", VERZEICHNIS)).toEqual([{ nutzer: "u-carla", name: "Carla Verzeichnis", email: "carla@example.test" }]);
  });
  it("merkePerson schreibt nur neu oder geändert, und nie ohne Namen", () => {
    const db = testDb();
    merkePerson(db, "u-x", "  ");
    merkePerson(db, null, "Niemand");
    expect(db.select().from(kommplanPerson).all()).toEqual([]);
    merkePerson(db, "u-x", "Xaver");
    merkePerson(db, "u-x", "Xaver B.");
    expect(db.select().from(kommplanPerson).all()).toEqual([{ nutzer: "u-x", name: "Xaver B." }]);
    expect(audit(db, "kommplan_person")).toEqual([]);
  });
});
