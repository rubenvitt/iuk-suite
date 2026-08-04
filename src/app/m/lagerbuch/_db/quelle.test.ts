import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { migrierteTestDb, type TestDb } from "./testdb";
import { quelleAufloeser } from "./quelle";
import { tokens, users } from "./schema";

let t: TestDb;
beforeEach(() => { t = migrierteTestDb("lagerbuch-quelle-"); });
afterEach(() => t.schliessen());

const ALT_SUB = "a1b2c3d4-alt";       // Kennung aus dem historischen Journal
const NEU_SUB = "e5f6g7h8-neu";       // Kennung aus dem Suite-Login

describe("quelleAufloeser", () => {
  it("loest oidc → users.name auf", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("faellt auf die E-Mail zurueck, wenn kein Name da ist", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: null, email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("anna@example.org");
  });

  it("loest token → tokens.label auf, nicht den Code", () => {
    // Der Code allein sagt niemandem etwas. Ein umkodierter Token-Code macht das
    // gesamte historische Journal namenlos.
    t.db.insert(tokens).values({ id: "tk1", code: "482-137", label: "RTW 1 Kaertchen",
      aktiv: true, createdAt: new Date(), createdBy: NEU_SUB }).run();
    expect(quelleAufloeser(t.db)("token", "482-137")).toBe("RTW 1 Kaertchen");
  });

  it("loest system → 'System'", () => {
    expect(quelleAufloeser(t.db)("system", "irgendwas")).toBe("System");
  });

  it("faellt bei unbekannter Kennung auf die ROHE ID zurueck", () => {
    expect(quelleAufloeser(t.db)("oidc", "gibt-es-nicht")).toBe("gibt-es-nicht");
    expect(quelleAufloeser(t.db)("token", "999-999")).toBe("999-999");
  });

  it("traegt BEIDE Kennungsraeume nebeneinander — deshalb gibt es keine Zuordnungstabelle", () => {
    // Historische Zeilen tragen den Alt-`sub` und finden ihre importierte Zeile;
    // neue Zeilen tragen den Neu-`sub` und finden die vom Upsert geschriebene.
    // Es gibt keine Kollision, weil beide Werte Primaerschluessel DERSELBEN Tabelle
    // sind — und die Kennung wird nirgends gefiltert, gruppiert oder aggregiert,
    // nur angezeigt (§4.13).
    t.db.insert(users).values({ id: ALT_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel", email: "anna@example.org" }).run();
    const q = quelleAufloeser(t.db);
    expect(q("oidc", ALT_SUB)).toBe("Anna Beispiel");
    expect(q("oidc", NEU_SUB)).toBe("Anna Beispiel");
  });

  it("DER BENANNTE DEFEKTZUSTAND: name UND email null → die rohe Kennung", () => {
    /**
     * Der Test verhindert den Zustand NICHT — er macht ihn benannt und auffindbar,
     * statt ihn als „unerklaerliche UUID im Journal" wiederzuentdecken.
     *
     * Der Ausfall im Klartext: eine Person bucht nach dem Cutover, und das Journal
     * zeigt fuer DIESE Zeile eine rohe sub-Kennung, waehrend ihre Zeilen von VOR dem
     * Cutover den Klarnamen tragen — dieselbe Person, zwei Darstellungen, in
     * derselben Liste.
     *
     * Zwei moegliche Ursachen, beide sofort zu melden statt still hinzunehmen: die
     * Suite-Sitzung fuehrt keine name/email-Claims, oder `merkeNutzer` laeuft an
     * einer Stelle, an der die Claims noch nicht vorliegen.
     */
    t.db.insert(users).values({ id: NEU_SUB, name: null, email: null }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe(NEU_SUB);
  });

  it("trimmt — ein Name aus Leerzeichen zaehlt nicht als Name", () => {
    t.db.insert(users).values({ id: NEU_SUB, name: "   ", email: "anna@example.org" }).run();
    expect(quelleAufloeser(t.db)("oidc", NEU_SUB)).toBe("anna@example.org");
  });

  it("laedt beide Nachschlagetabellen EINMAL und ist danach wiederverwendbar", () => {
    // Den Resolver pro Request bauen und ueber alle Zeilen wiederverwenden — eine
    // Journalseite hat bis zu JOURNAL_GRENZE Zeilen.
    t.db.insert(users).values({ id: NEU_SUB, name: "Anna Beispiel" }).run();
    const q = quelleAufloeser(t.db);
    // Zeile NACH dem Bau eingefuegt: der Resolver sieht sie bewusst nicht mehr.
    t.db.insert(users).values({ id: "spaeter", name: "Zu spaet" }).run();
    expect(q("oidc", NEU_SUB)).toBe("Anna Beispiel");
    expect(q("oidc", "spaeter")).toBe("spaeter");
  });
});
